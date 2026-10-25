import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Agent } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureHeaderLines } from "./raw-headers";

// fetch() joins repeated headers; the interceptor keeps them apart (#105).

let server: Server;
let base: string;
const agent = new Agent();

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/two") res.setHeader("X-Robots-Tag", ["bingbot: noindex", "noindex"]);
    if (req.url === "/one") res.setHeader("X-Robots-Tag", "googlebot: nofollow, noindex");
    res.setHeader("content-type", "text/html");
    res.end("<p>ok</p>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await agent.close();
});

async function get(path: string) {
  const capture = captureHeaderLines(agent, "x-robots-tag");
  const res = await fetch(base + path, { dispatcher: capture.dispatcher } as RequestInit);
  const body = await res.text();
  return { joined: res.headers.get("x-robots-tag"), lines: capture.lines(), body };
}

describe("captureHeaderLines", () => {
  it("keeps repeated header lines apart, where fetch() joins them", async () => {
    const r = await get("/two");
    expect(r.lines).toEqual(["bingbot: noindex", "noindex"]);
    expect(r.joined).toMatch(/^bingbot: noindex, ?noindex$/);
    expect(r.body).toBe("<p>ok</p>");
  });

  it("keeps a single line with its comma list whole", async () => {
    expect((await get("/one")).lines).toEqual(["googlebot: nofollow, noindex"]);
  });

  it("returns no lines when the header is absent", async () => {
    expect((await get("/none")).lines).toEqual([]);
  });
});
