import { createServer, type Server } from "http";
import type { LookupAddress } from "dns";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// DNS rebinding (#49): real fetch() against a local server that stands in for
// an internal service. The resolver is faked; the URL uses "localhost" so
// that a fetch which resolves the name on its own (instead of through the
// checked answer) does reach the server.

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("dns/promises", () => ({ lookup, default: { lookup } }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { fetchText, isPrivateIp, pinnedLookup } from "./engine";

const PUBLIC = "93.184.216.34";

let server: Server;
let hits = 0;
let base = "";

beforeAll(async () => {
  server = createServer((_req, res) => {
    hits++;
    res.end("internal");
  });
  // "::" accepts both 127.0.0.1 and ::1, whichever localhost resolves to.
  await new Promise<void>((resolve) => server.listen(0, "::", resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  hits = 0;
  lookup.mockReset();
});

/** A resolver: `single` answers lookup(name), `all` answers lookup(name, { all: true }). */
function resolver(single: () => string, all: () => LookupAddress[]) {
  lookup.mockImplementation(async (_host: string, opts?: { all?: boolean }) => {
    if (opts?.all) return all();
    const address = single();
    return { address, family: address.includes(":") ? 6 : 4 };
  });
}
const v4 = (address: string): LookupAddress => ({ address, family: 4 });
const v6 = (address: string): LookupAddress => ({ address, family: 6 });

describe("DNS rebinding", () => {
  it("never reaches the private address a second resolution returns", async () => {
    let n = 0;
    const next = () => (n++ === 0 ? PUBLIC : "127.0.0.1");
    resolver(next, () => [v4(next())]);

    expect(await fetchText(`${base}/robots.txt`)).toBeNull();
    expect(hits).toBe(0);
    expect(n).toBe(2);
  });

  it("refuses a name with a public and a private record", async () => {
    resolver(() => PUBLIC, () => [v4(PUBLIC), v4("127.0.0.1")]);

    expect(await fetchText(`${base}/sitemap.xml`)).toBeNull();
    expect(hits).toBe(0);
    expect(lookup).toHaveBeenCalledWith("localhost", { all: true });
  });

  it.each(["::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe"])(
    "refuses a name with a %s record next to a public one",
    async (address) => {
      resolver(() => PUBLIC, () => [v4(PUBLIC), v6(address)]);

      expect(await fetchText(`${base}/`)).toBeNull();
      expect(hits).toBe(0);
      expect(lookup).toHaveBeenCalledWith("localhost", { all: true });
    }
  );
});

describe("pinnedLookup", () => {
  function run(options: object) {
    return new Promise<{ err: Error | null; address: unknown; family?: number }>((resolve) =>
      pinnedLookup("example.com", options, (err, address, family) => resolve({ err, address, family }))
    );
  }

  it("hands the socket only the addresses it checked", async () => {
    lookup.mockResolvedValue([v4(PUBLIC), v6("2606:4700::1111")]);

    expect(await run({ all: true })).toMatchObject({
      err: null,
      address: [v4(PUBLIC), v6("2606:4700::1111")],
    });
    expect(await run({})).toMatchObject({ err: null, address: PUBLIC, family: 4 });
    expect(await run({ family: 6 })).toMatchObject({ err: null, address: "2606:4700::1111", family: 6 });
    expect(lookup).toHaveBeenCalledWith("example.com", { all: true });
  });

  it("fails the connection with a Blocked error if any address is private", async () => {
    lookup.mockResolvedValue([v4(PUBLIC), v4("10.0.0.5")]);

    const { err } = await run({ all: true });
    expect(err?.message).toBe("Blocked: example.com resolves to private/reserved IP");
  });

  it("passes resolver errors through", async () => {
    lookup.mockRejectedValue(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }));

    const { err } = await run({});
    expect(err?.message).toBe("getaddrinfo ENOTFOUND");
  });
});

describe("isPrivateIp, IPv6", () => {
  it.each([
    // IPv4-mapped, in hex and long notation
    "::ffff:7f00:1", "::ffff:a9fe:a9fe", "::ffff:a00:5", "0:0:0:0:0:ffff:127.0.0.1",
    // IPv4-compatible (deprecated)
    "::7f00:1", "::127.0.0.1",
    // multicast, documentation, discard-only
    "ff02::1", "ff05::2", "2001:db8::1", "100::1",
  ])("blocks %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each(["::ffff:808:808", "0:0:0:0:0:ffff:8.8.8.8", "2001:4860:4860::8888"])("allows public %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });
});
