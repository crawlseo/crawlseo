import { createHmac } from "crypto";
import { createServer, type IncomingMessage, type Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Alert webhook delivery against a real local HTTP server. The resolver is
// faked: "hook.test" answers what each test says, an IP literal answers
// itself. The server listens on loopback, which webhooks reach only with the
// private-address opt-in, so the tests also show the guard refusing it.

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("dns/promises", () => ({ lookup, default: { lookup } }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { alertPayload, checkSecret, sendWebhook, signWebhook, testPayload } from "./deliver";

type Hit = { headers: IncomingMessage["headers"]; body: string };
let server: Server;
let port = 0;
let hits: Hit[] = [];
let answer: (res: import("http").ServerResponse) => void = (res) => res.end("ok");

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hits.push({ headers: req.headers, body });
      answer(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

/** "hook.test" resolves to `addresses` in order, one answer per lookup; IP literals to themselves. */
function resolve(...answers: string[][]) {
  let n = 0;
  lookup.mockImplementation(async (name: string) => {
    if (/^[\d.]+$/.test(name) || name.includes(":")) return [{ address: name, family: name.includes(":") ? 6 : 4 }];
    const list = answers[Math.min(n++, answers.length - 1)];
    return list.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  });
}

const SECRET = "s3cret-s3cret-s3cret";
const local = () => `http://127.0.0.1:${port}/hook`;

beforeEach(() => {
  hits = [];
  answer = (res) => res.end("ok");
  lookup.mockReset();
  resolve(["127.0.0.1"]);
});

describe("sendWebhook", () => {
  it("POSTs the JSON body with a signature the receiver can check", async () => {
    const payload = testPayload("test_1");
    const result = await sendWebhook(local(), SECRET, "test", payload, { allowPrivate: true, now: () => 1_760_000_000_000 });
    expect(result).toEqual({ ok: true, status: 200 });
    expect(hits).toHaveLength(1);
    const { headers, body } = hits[0];
    expect(JSON.parse(body)).toEqual(payload);
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-crawlseo-event"]).toBe("test");
    expect(headers["x-crawlseo-delivery"]).toBe("test_1");
    expect(headers["x-crawlseo-timestamp"]).toBe("1760000000");
    const expected = createHmac("sha256", SECRET).update(`1760000000.${body}`).digest("hex");
    expect(headers["x-crawlseo-signature"]).toBe(`sha256=${expected}`);
    expect(signWebhook(SECRET, 1760000000, body)).toBe(`sha256=${expected}`);
  });

  it("sends an alert delivery with the site, the alerts and the delivery id", async () => {
    const fires = [{ alertId: "a1", type: "TRAFFIC_DROP", message: "Traffic drop on quilltab.app", siteId: "s1", domain: "quilltab.app" }];
    const payload = alertPayload("job_1", { fires, firedAt: "2026-10-19T05:00:00.000Z" });
    expect(await sendWebhook(local(), SECRET, "alert.fired", payload, { allowPrivate: true })).toMatchObject({ ok: true });
    expect(JSON.parse(hits[0].body)).toMatchObject({
      event: "alert.fired",
      id: "job_1",
      site: { id: "s1", domain: "quilltab.app" },
      alerts: [{ id: "a1", type: "TRAFFIC_DROP", message: "Traffic drop on quilltab.app" }],
    });
  });

  it.each([
    [500, true],
    [503, true],
    [429, true],
    [408, true],
    [400, false],
    [401, false],
    [404, false],
    [410, false],
  ])("HTTP %i: retryable %s", async (status, retryable) => {
    answer = (res) => {
      res.statusCode = status;
      res.end();
    };
    expect(await sendWebhook(local(), SECRET, "test", testPayload(), { allowPrivate: true })).toMatchObject({
      ok: false,
      status,
      retryable,
    });
  });

  it("does not follow a redirect", async () => {
    answer = (res) => {
      res.writeHead(302, { location: `http://127.0.0.1:${port}/elsewhere` });
      res.end();
    };
    const result = await sendWebhook(local(), SECRET, "test", testPayload(), { allowPrivate: true });
    expect(result).toMatchObject({ ok: false, status: 302, retryable: false });
    expect(hits).toHaveLength(1);
  });

  it("gives up after the timeout, and that can be retried", async () => {
    answer = () => {};
    const result = await sendWebhook(local(), SECRET, "test", testPayload(), { allowPrivate: true, timeoutMs: 200 });
    expect(result).toMatchObject({ ok: false, retryable: true });
  });

  it("refuses a private address without the opt-in, before any request", async () => {
    for (const url of [local(), `http://hook.test:${port}/hook`]) {
      const result = await sendWebhook(url, SECRET, "test", testPayload());
      expect(result).toMatchObject({ ok: false, retryable: false });
      expect((result as { error: string }).error).toMatch(/private or reserved/);
    }
    expect(hits).toHaveLength(0);
  });

  it("keeps link-local and metadata addresses blocked even with the opt-in", async () => {
    for (const address of ["169.254.169.254", "0.0.0.0", "224.0.0.1", "fe80::1"]) {
      resolve([address]);
      const result = await sendWebhook(`http://hook.test:${port}/hook`, SECRET, "test", testPayload(), { allowPrivate: true });
      expect(result, address).toMatchObject({ ok: false, retryable: false });
    }
    expect(hits).toHaveLength(0);
  });

  it("never connects to a private address the name gains after the check (DNS rebinding)", async () => {
    // The pre-flight check sees a public address; the connection's own lookup gets loopback.
    resolve(["93.184.216.34"], ["127.0.0.1"]);
    const result = await sendWebhook(`http://hook.test:${port}/hook`, SECRET, "test", testPayload());
    expect(result).toMatchObject({ ok: false, retryable: false });
    expect(hits).toHaveLength(0);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("reaches a host name on the private network with the opt-in", async () => {
    resolve(["127.0.0.1"]);
    expect(await sendWebhook(`http://hook.test:${port}/hook`, SECRET, "test", testPayload(), { allowPrivate: true })).toEqual({
      ok: true,
      status: 200,
    });
    expect(hits).toHaveLength(1);
  });

  it("a name that does not resolve can be retried", async () => {
    lookup.mockRejectedValue(Object.assign(new Error("getaddrinfo ENOTFOUND hook.test"), { code: "ENOTFOUND" }));
    expect(await sendWebhook("https://hook.test/x", SECRET, "test", testPayload())).toMatchObject({ ok: false, retryable: true });
  });

  it("refuses URLs that are not http(s) or carry credentials", async () => {
    for (const url of ["ftp://hook.test/x", "file:///etc/passwd", "https://user:pw@hook.test/x", "not a url"]) {
      expect(await sendWebhook(url, SECRET, "test", testPayload()), url).toMatchObject({ ok: false, retryable: false });
    }
    expect(hits).toHaveLength(0);
  });
});

describe("checkSecret", () => {
  it("needs 16 to 256 characters", () => {
    expect(checkSecret("short")).toHaveProperty("error");
    expect(checkSecret(undefined)).toHaveProperty("error");
    expect(checkSecret("x".repeat(257))).toHaveProperty("error");
    expect(checkSecret(`  ${"x".repeat(16)}  `)).toEqual({ secret: "x".repeat(16) });
  });
});
