import { describe, expect, it } from "vitest";
import { siteDomainFromProperty } from "./site-domain";

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
