import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { isPrivateNetworkIp, parseWebhookUrl, webhookAddressRule } from "./address";

describe("webhookAddressRule", () => {
  const strict = webhookAddressRule(false);
  const optIn = webhookAddressRule(true);

  it.each(["8.8.8.8", "93.184.216.34", "2606:4700::1111"])("allows public %s either way", (ip) => {
    expect(strict(ip)).toBe(false);
    expect(optIn(ip)).toBe(false);
  });

  it.each(["10.0.0.5", "172.20.0.3", "192.168.1.20", "100.100.1.1", "127.0.0.1", "::1", "fd00::5", "::ffff:192.168.1.20"])(
    "blocks private %s, allowed with the opt-in",
    (ip) => {
      expect(strict(ip)).toBe(true);
      expect(optIn(ip)).toBe(false);
      expect(isPrivateNetworkIp(ip)).toBe(true);
    }
  );

  it.each(["169.254.169.254", "169.254.0.1", "fe80::1", "0.0.0.0", "::", "224.0.0.1", "255.255.255.255", "192.0.2.1", "::ffff:169.254.169.254", "64:ff9b::a00:5"])(
    "blocks %s even with the opt-in",
    (ip) => {
      expect(strict(ip)).toBe(true);
      expect(optIn(ip)).toBe(true);
    }
  );
});

describe("parseWebhookUrl", () => {
  it("keeps http(s) URLs with path and query, drops the fragment", () => {
    expect(parseWebhookUrl(" https://hooks.quilltab.app/in?token=abc#x ").toString()).toBe("https://hooks.quilltab.app/in?token=abc");
    expect(parseWebhookUrl("http://n8n:5678/webhook/alerts").toString()).toBe("http://n8n:5678/webhook/alerts");
  });

  it.each([undefined, "", "   ", "hooks.quilltab.app", "javascript:alert(1)", "ftp://x.quilltab.app/", "https://a:b@x.quilltab.app/", `https://x.quilltab.app/${"a".repeat(2000)}`])(
    "refuses %s",
    (raw) => {
      expect(() => parseWebhookUrl(raw)).toThrow();
    }
  );
});
