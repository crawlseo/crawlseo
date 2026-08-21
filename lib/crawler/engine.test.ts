import { describe, it, expect } from "vitest";
import { matchManagedInfra } from "./engine";

describe("matchManagedInfra", () => {
  it("matches /cdn-cgi/l/email-protection as Cloudflare", () => {
    const result = matchManagedInfra(
      "https://example.com/cdn-cgi/l/email-protection"
    );
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("Cloudflare");
  });

  it("matches bare /cdn-cgi/ path as Cloudflare", () => {
    const result = matchManagedInfra("https://example.com/cdn-cgi/");
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("Cloudflare");
  });

  it("does NOT match /blog/cdn-cgi-explained (substring, not prefix)", () => {
    const result = matchManagedInfra(
      "https://example.com/blog/cdn-cgi-explained"
    );
    expect(result).toBeNull();
  });

  it("does NOT match site root /", () => {
    const result = matchManagedInfra("https://example.com/");
    expect(result).toBeNull();
  });

  it("returns null for malformed / relative URLs without throwing", () => {
    expect(() => matchManagedInfra("not-a-url")).not.toThrow();
    expect(matchManagedInfra("not-a-url")).toBeNull();
  });
});
