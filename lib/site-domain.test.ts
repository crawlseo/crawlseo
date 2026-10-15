import { describe, expect, it } from "vitest";
import { comparableDomain, isPublicDomainName, siteDomainFromProperty } from "./site-domain";

describe("siteDomainFromProperty", () => {
  it("strips the sc-domain: prefix from domain properties", () => {
    expect(siteDomainFromProperty("sc-domain:example.com")).toBe("example.com");
  });

  it("uses the hostname of URL-prefix properties", () => {
    // The original bug: split(":")[1] stored "//www.osnt.in/"
    expect(siteDomainFromProperty("https://www.osnt.in/")).toBe("www.osnt.in");
    expect(siteDomainFromProperty("http://example.com/")).toBe("example.com");
  });

  it("drops the trailing slash", () => {
    expect(siteDomainFromProperty("https://example.com/")).toBe("example.com");
    expect(siteDomainFromProperty("example.com/")).toBe("example.com");
  });

  it("keeps www as-is", () => {
    expect(siteDomainFromProperty("https://www.example.com/")).toBe("www.example.com");
    expect(siteDomainFromProperty("sc-domain:www.example.com")).toBe("www.example.com");
  });

  it("drops path, port, query and case from URL-prefix properties", () => {
    expect(siteDomainFromProperty("https://Example.com:8443/blog/?a=1")).toBe("example.com");
  });

  it("repairs a value already stored by the old client code", () => {
    expect(siteDomainFromProperty("//www.osnt.in/")).toBe("www.osnt.in");
  });

  it("returns null when there is no hostname", () => {
    expect(siteDomainFromProperty("")).toBeNull();
    expect(siteDomainFromProperty("   ")).toBeNull();
    expect(siteDomainFromProperty("sc-domain:")).toBeNull();
    expect(siteDomainFromProperty("https://")).toBeNull();
  });
});

describe("comparableDomain", () => {
  it("normalizes a stored site and a typed domain the same way", () => {
    expect(comparableDomain("www.example.com")).toBe("example.com");
    expect(comparableDomain("https://WWW.Example.com/blog?x=1")).toBe("example.com");
    expect(comparableDomain("sc-domain:example.com")).toBe("example.com");
    expect(comparableDomain("shop.example.com")).toBe("shop.example.com");
    expect(comparableDomain("   ")).toBeNull();
  });
});

describe("isPublicDomainName", () => {
  it.each(["example.com", "shop.example.co.uk", "quilltab.app", "xn--bcher-kva.de", "my-site.io", "_dmarc.example.com"])("accepts %s", (name) => {
    expect(isPublicDomainName(name)).toBe(true);
  });

  it.each([
    "localhost", "intranet", "127.0.0.1", "0.0.0.5", "[::1]", "::1",
    "printer.local", "shop.test", "a.invalid", "competitor.example", "db.internal", "app.localhost",
    "Printer.LOCAL", "a..com", "router.home.arpa", "1.0.0.127.in-addr.arpa", "x.onion", "x.alt",
    "nas.lan", "x.corp", "x.home", "x.mail", "*.example.com", "-foo.com", "a.b", "example.123",
  ])("rejects %s", (name) => {
    expect(isPublicDomainName(name)).toBe(false);
  });
});
