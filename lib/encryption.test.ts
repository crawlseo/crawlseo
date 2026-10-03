import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "./encryption";

// The module derives its AES key from NEXTAUTH_SECRET via SHA-256.
// Set a test-only value so tests don't depend on a real secret.
beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-for-vitest-only";
});

describe("encrypt / decrypt", () => {
  it("roundtrips plaintext correctly", () => {
    const plaintext = "AIzaSyB-my-pagespeed-key-1234";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("roundtrips empty string", () => {
    expect(decrypt(encrypt(""))).toBe("");
  });

  it("roundtrips unicode", () => {
    const plaintext = "pässwörd-日本語-🔑";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("produces different ciphertext for different plaintext", () => {
    const a = encrypt("secret-a");
    const b = encrypt("secret-b");
    expect(a).not.toBe(b);
  });

  it("produces different ciphertext for the same plaintext (unique IV)", () => {
    const a = encrypt("same-value");
    const b = encrypt("same-value");
    expect(a).not.toBe(b);
    // Both must still decrypt to the original
    expect(decrypt(a)).toBe("same-value");
    expect(decrypt(b)).toBe("same-value");
  });

  it("output format is iv:ciphertext:tag (three colon-separated base64 segments)", () => {
    const encrypted = encrypt("test");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    // Each part should be valid base64
    for (const part of parts) {
      expect(() => Buffer.from(part, "base64")).not.toThrow();
      expect(part.length).toBeGreaterThan(0);
    }
  });
});

describe("decrypt error handling", () => {
  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("real-secret");
    const parts = encrypted.split(":");
    // Flip a character in the ciphertext portion
    parts[1] = parts[1] === "AAAA" ? "BBBB" : "AAAA";
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("throws on malformed input (missing segments)", () => {
    expect(() => decrypt("just-one-segment")).toThrow();
  });
});

describe("key derivation", () => {
  function withEnv(env: Record<string, string | undefined>, run: () => void) {
    const saved = {
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
      AUTH_SECRET: process.env.AUTH_SECRET,
    };
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    try {
      run();
    } finally {
      for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  }

  it("throws when neither secret is set", () => {
    withEnv({ NEXTAUTH_SECRET: undefined, AUTH_SECRET: undefined }, () => {
      expect(() => encrypt("test")).toThrow("NEXTAUTH_SECRET (or AUTH_SECRET) is required");
    });
  });

  it("works with only AUTH_SECRET, the Auth.js v5 name", () => {
    withEnv({ NEXTAUTH_SECRET: undefined, AUTH_SECRET: "auth-secret-only" }, () => {
      expect(decrypt(encrypt("test"))).toBe("test");
    });
  });

  it("prefers NEXTAUTH_SECRET when both are set, as Auth.js does here", () => {
    let sealed = "";
    withEnv({ NEXTAUTH_SECRET: "next", AUTH_SECRET: undefined }, () => {
      sealed = encrypt("test");
    });
    withEnv({ NEXTAUTH_SECRET: "next", AUTH_SECRET: "other" }, () => {
      expect(decrypt(sealed)).toBe("test");
    });
  });
});
