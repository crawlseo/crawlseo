import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("dns/promises", () => ({ lookup, default: { lookup } }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { fetchText, isPrivateIp } from "./engine";

describe("isPrivateIp", () => {
  it.each([
    // ranges that were already blocked
    "0.0.0.0", "10.1.2.3", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "::1", "fc00::1", "fdff::1", "::ffff:127.0.0.1",
    // 100.64.0.0/10
    "100.64.0.0", "100.100.100.200", "100.127.255.255",
    // 198.18.0.0/15
    "198.18.0.1", "198.19.255.255",
    // 224.0.0.0/4
    "224.0.0.1", "239.255.255.250",
    // 240.0.0.0/4
    "240.0.0.1", "255.255.255.255",
    // ::
    "::", "0:0:0:0:0:0:0:0",
    // 64:ff9b::/96, both notations
    "64:ff9b::7f00:1", "64:ff9b::127.0.0.1", "64:ff9b::8.8.8.8",
    // 2002::/16
    "2002::1", "2002:7f00:1::1",
    // all of fe80::/10, not just fe80:
    "fe80::1", "fe9a::1", "feab::1", "febf:ffff::1",
    // IPv4-mapped forms of the new ranges
    "::ffff:100.64.0.1", "::ffff:198.18.0.1",
    // 192.0.0.0/24, IETF protocol assignments (incl. the NAT64 discovery addresses)
    "192.0.0.0", "192.0.0.170", "192.0.0.255",
    // documentation: 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24
    "192.0.2.1", "198.51.100.7", "203.0.113.255", "::ffff:192.0.2.1", "::ffff:203.0.113.1",
    // 64:ff9b:1::/48, local-use NAT64: the translator may map it to any IPv4 address
    "64:ff9b:1::1", "64:ff9b:1::10.0.0.1", "64:ff9b:1:ffff::1",
    // 2001::/32, Teredo: embeds the server and client IPv4 addresses
    "2001::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001:0:ffff:ffff::1",
    // 2001:2::/48, benchmarking
    "2001:2::1",
    // fec0::/10, site-local (deprecated)
    "fec0::1", "feff::1",
    // ::ffff:0:0:0/96, IPv4-translated (SIIT)
    "::ffff:0:127.0.0.1", "::ffff:0:7f00:1", "::ffff:0:808:808",
    // 3fff::/20, documentation
    "3fff::1", "3fff:fff:ffff::1",
  ])("blocks %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each([
    "8.8.8.8", "93.184.216.34", "100.63.255.255", "100.128.0.0", "198.17.255.255", "198.20.0.0",
    "223.255.255.255", "172.32.0.1", "::ffff:8.8.8.8",
    "2606:4700::1111", "2003::1",
    // just outside the reserved ranges
    "191.255.255.255", "192.0.1.0", "192.0.3.0", "198.51.99.255", "198.51.101.0", "203.0.112.255", "203.0.114.0",
    "2001:1::1", "2001:3::1", "2001:4860:4860::8888", "3ffe:ffff::1", "3fff:1000::1",
  ])("allows public %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });

  it("refuses anything that is not an IP", () => {
    expect(isPrivateIp("localhost")).toBe(true);
    expect(isPrivateIp("")).toBe(true);
  });
});

describe("fetchText (robots.txt / sitemap)", () => {
  const DNS: Record<string, string> = {
    "quilltab.app": "93.184.216.34",
    "cdn.quilltab.app": "93.184.216.35",
    "internal.example": "10.0.0.5",
  };
  // A name with more than one record; DNS answers them in this order.
  const MULTI: Record<string, string[]> = {
    "mixed.example": ["93.184.216.34", "10.0.0.5"],
    "dual.example": ["93.184.216.34", "2606:4700::1111"],
  };
  const fetchMock = vi.fn();

  function redirect(location: string) {
    return new Response(null, { status: 302, headers: { location } });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    lookup.mockImplementation(async (host: string, opts?: { all?: boolean }) => {
      const records = (MULTI[host] ?? [DNS[host] ?? host]).map((address) => ({
        address,
        family: address.includes(":") ? 6 : 4,
      }));
      return opts?.all ? records : records[0];
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("does not follow a redirect to a private address", async () => {
    fetchMock.mockResolvedValueOnce(redirect("http://internal.example/admin"));

    expect(await fetchText("https://quilltab.app/robots.txt")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenLastCalledWith("internal.example", { all: true });
  });

  it("does not follow a redirect to the metadata IP literal", async () => {
    fetchMock.mockResolvedValueOnce(redirect("http://169.254.169.254/latest/meta-data/"));

    expect(await fetchText("https://quilltab.app/sitemap.xml")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenLastCalledWith("169.254.169.254", { all: true });
  });

  it("checks every hop, not just the first two", async () => {
    fetchMock
      .mockResolvedValueOnce(redirect("https://cdn.quilltab.app/a"))
      .mockResolvedValueOnce(redirect("https://cdn.quilltab.app/b"))
      .mockResolvedValueOnce(redirect("http://internal.example/c"));

    expect(await fetchText("https://quilltab.app/sitemap.xml")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("follows public redirects and returns the body", async () => {
    fetchMock
      .mockResolvedValueOnce(redirect("/sitemap_index.xml"))
      .mockResolvedValueOnce(redirect("https://cdn.quilltab.app/sitemap.xml"))
      .mockResolvedValueOnce(new Response("<urlset/>", { status: 200 }));

    expect(await fetchText("https://quilltab.app/sitemap.xml")).toBe("<urlset/>");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://quilltab.app/sitemap.xml",
      "https://quilltab.app/sitemap_index.xml",
      "https://cdn.quilltab.app/sitemap.xml",
    ]);
    for (const [, init] of fetchMock.mock.calls) expect(init.redirect).toBe("manual");
  });

  it("never fetches a private start URL", async () => {
    expect(await fetchText("http://internal.example/robots.txt")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never fetches a start URL with a private address among its records", async () => {
    expect(await fetchText("https://mixed.example/robots.txt")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lookup).toHaveBeenCalledWith("mixed.example", { all: true });
  });

  it("does not follow a redirect to a name with a private address among its records", async () => {
    fetchMock.mockResolvedValueOnce(redirect("https://mixed.example/sitemap.xml"));

    expect(await fetchText("https://quilltab.app/sitemap.xml")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches a name whose records are all public", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    expect(await fetchText("https://dual.example/robots.txt")).toBe("ok");
  });

  it("gives up on endless redirects", async () => {
    fetchMock.mockImplementation(async () => redirect("https://quilltab.app/loop"));

    expect(await fetchText("https://quilltab.app/robots.txt")).toBeNull();
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("returns null for a non-2xx answer", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));

    expect(await fetchText("https://quilltab.app/robots.txt")).toBeNull();
  });
});
