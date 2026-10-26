import { describe, expect, it } from "vitest";
import { emailAvailable, emailsEnabled, redactSmtp, smtpConfig } from "./config";
import { parseRecipients, splitRecipients } from "./recipients";

// SMTP settings come from the environment only. Email is available when
// SMTP_HOST and SMTP_FROM are set and ALERT_EMAILS_ENABLED is not false.

describe("smtpConfig", () => {
  it("is null, not configured, without SMTP_HOST or SMTP_FROM", () => {
    expect(smtpConfig({})).toBeNull();
    expect(smtpConfig({ SMTP_HOST: "smtp.example.com" })).toBeNull();
    expect(smtpConfig({ SMTP_FROM: "crawlseo@example.com" })).toBeNull();
    expect(smtpConfig({ SMTP_HOST: "  ", SMTP_FROM: "crawlseo@example.com" })).toBeNull();
    expect(emailAvailable({})).toBe(false);
  });

  it("defaults to port 587 with STARTTLS and no login", () => {
    expect(smtpConfig({ SMTP_HOST: "smtp.example.com", SMTP_FROM: "crawlseo <seo@example.com>" })).toEqual({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: null,
      from: "crawlseo <seo@example.com>",
    });
  });

  it("reads port, TLS and login", () => {
    expect(
      smtpConfig({
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "2525",
        SMTP_SECURE: "TRUE",
        SMTP_USER: "seo@example.com",
        SMTP_PASSWORD: " pass with spaces ",
        SMTP_FROM: "seo@example.com",
      })
    ).toEqual({
      host: "smtp.example.com",
      port: 2525,
      secure: true,
      auth: { user: "seo@example.com", pass: " pass with spaces " },
      from: "seo@example.com",
    });
  });

  it("takes TLS from port 465, and port 465 from SMTP_SECURE=true", () => {
    const base = { SMTP_HOST: "smtp.example.com", SMTP_FROM: "a@example.com" };
    expect(smtpConfig({ ...base, SMTP_PORT: "465" })).toMatchObject({ port: 465, secure: true });
    expect(smtpConfig({ ...base, SMTP_SECURE: "true" })).toMatchObject({ port: 465, secure: true });
    expect(smtpConfig({ ...base, SMTP_PORT: "465", SMTP_SECURE: "false" })).toMatchObject({ port: 465, secure: false });
    expect(smtpConfig({ ...base, SMTP_PORT: "nope" })).toMatchObject({ port: 587 });
    expect(smtpConfig({ ...base, SMTP_PORT: "70000" })).toMatchObject({ port: 587 });
  });

  it("ALERT_EMAILS_ENABLED=false turns email off for the instance", () => {
    const env = { SMTP_HOST: "smtp.example.com", SMTP_FROM: "a@example.com" };
    expect(emailAvailable(env)).toBe(true);
    expect(emailsEnabled({ ALERT_EMAILS_ENABLED: "False" })).toBe(false);
    expect(emailAvailable({ ...env, ALERT_EMAILS_ENABLED: "false" })).toBe(false);
    expect(emailAvailable({ ...env, ALERT_EMAILS_ENABLED: "true" })).toBe(true);
  });
});

describe("redactSmtp", () => {
  const config = smtpConfig({
    SMTP_HOST: "smtp.example.com",
    SMTP_USER: "mailer@example.com",
    SMTP_PASSWORD: "hunter2-very-secret",
    SMTP_FROM: "a@example.com",
  });

  it("removes the login, plain and base64", () => {
    const plain = Buffer.from("\u0000mailer@example.com\u0000hunter2-very-secret").toString("base64");
    const out = redactSmtp(`535 for mailer@example.com / hunter2-very-secret (${plain})`, config);
    expect(out).not.toContain("hunter2-very-secret");
    expect(out).not.toContain("mailer@example.com");
    expect(out).not.toContain(plain);
    expect(out).toContain("[redacted]");
  });

  it("leaves text without a login alone", () => {
    expect(redactSmtp("Connection timeout", null)).toBe("Connection timeout");
  });
});

describe("parseRecipients", () => {
  it("splits on commas, semicolons, spaces and line breaks, lower-cased and without duplicates", () => {
    expect(parseRecipients(" A@Example.com, b@example.com;\nb@example.com c@example.org ")).toEqual({
      recipients: ["a@example.com", "b@example.com", "c@example.org"],
    });
    expect(splitRecipients("a@example.com, b@example.com")).toEqual(["a@example.com", "b@example.com"]);
    expect(splitRecipients(null)).toEqual([]);
  });

  it("refuses an empty list, more than five and anything that is not an address", () => {
    expect(parseRecipients("")).toEqual({ error: "Enter at least one email address." });
    expect(parseRecipients(undefined)).toEqual({ error: "Enter at least one email address." });
    expect(parseRecipients("1@a.io,2@a.io,3@a.io,4@a.io,5@a.io,6@a.io")).toEqual({ error: "At most 5 addresses." });
    for (const bad of ["nobody", "a@b", "<a@b.io>", "a@b.io\r\nBcc:x@y.io"]) {
      expect("error" in parseRecipients(bad), bad).toBe(true);
    }
  });
});
