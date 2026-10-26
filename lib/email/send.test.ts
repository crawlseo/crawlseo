import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestSmtp, type TestSmtp } from "@/lib/testing/smtp";
import type { SmtpConfig } from "./config";
import { alertEmail, testEmail } from "./messages";
import { sendEmail } from "./send";

// Real nodemailer against a local SMTP server: a message goes out with the
// login, and every failure comes back as a reason without the login, marked
// retryable or not. Nothing here throws.

const USER = "mailer@quilltab.app";
const PASS = "hunter2-very-secret";
let smtp: TestSmtp;
let config: SmtpConfig;

beforeAll(async () => {
  vi.stubEnv("NEXTAUTH_URL", "https://seo.quilltab.app/");
  smtp = await startTestSmtp();
  config = { host: "127.0.0.1", port: smtp.port, secure: false, auth: { user: USER, pass: PASS }, from: "crawlseo <seo@quilltab.app>" };
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await smtp.close();
});

beforeEach(() => {
  smtp.mode = "ok";
  smtp.mails.length = 0;
  smtp.transcript.length = 0;
});

const FIRES = [
  { alertId: "a1", type: "NOINDEX_SITEWIDE", message: "Most pages are noindex on quilltab.app: 9 of 10 pages are noindex.", siteId: "s1", domain: "quilltab.app" },
  { alertId: "a2", type: "TRAFFIC_DROP", message: "Traffic drop <b>on</b> quilltab.app", siteId: "s1", domain: "quilltab.app" },
];

describe("sendEmail", () => {
  it("sends an alert email with the login, to every recipient", async () => {
    const result = await sendEmail(alertEmail(["a@quilltab.app", "b@quilltab.app"], { fires: FIRES, firedAt: "2026-10-26T05:00:00.000Z" }), { config });
    expect(result).toEqual({ ok: true });
    expect(smtp.mails).toHaveLength(1);
    const mail = smtp.mails[0];
    expect(mail.auth).toEqual({ user: USER, pass: PASS });
    expect(mail.from).toBe("seo@quilltab.app");
    expect(mail.to).toEqual(["a@quilltab.app", "b@quilltab.app"]);
    expect(mail.data).toContain("Subject: [crawlseo] 2 alerts on quilltab.app");
    expect(mail.data).toContain("text/plain");
    expect(mail.data).toContain("text/html");
  });

  it("reports a refused login without the login, and does not retry it", async () => {
    smtp.mode = "auth-fail";
    const result = await sendEmail(testEmail(["a@quilltab.app"]), { config });
    expect(result).toMatchObject({ ok: false, retryable: false });
    const error = (result as { error: string }).error;
    expect(error).toMatch(/refused the login/);
    expect(error).not.toContain(PASS);
    expect(error).not.toContain(USER);
    expect(smtp.mails).toHaveLength(0);
  });

  it("retries a temporary 4xx answer", async () => {
    smtp.mode = "temp-fail";
    const result = await sendEmail(testEmail(["a@quilltab.app"]), { config });
    expect(result).toMatchObject({ ok: false, retryable: true });
    expect((result as { error: string }).error).toContain("451");
  });

  it("retries an unreachable server", async () => {
    const result = await sendEmail(testEmail(["a@quilltab.app"]), { config: { ...config, port: 1 } });
    expect(result).toMatchObject({ ok: false, retryable: true });
  });

  it("gives up on a server that never answers within the timeout", async () => {
    smtp.mode = "silent";
    const started = Date.now();
    const result = await sendEmail(testEmail(["a@quilltab.app"]), { config, timeoutMs: 300 });
    expect(result).toMatchObject({ ok: false, retryable: true });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("does nothing without SMTP settings or recipients", async () => {
    expect(await sendEmail(testEmail(["a@quilltab.app"]), { config: null })).toMatchObject({ ok: false, retryable: false });
    expect(await sendEmail(testEmail([]), { config })).toMatchObject({ ok: false, retryable: false });
    expect(smtp.transcript).toEqual([]);
  });

  it("never logs the protocol, so the login does not reach the console", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    smtp.mode = "auth-fail";
    await sendEmail(testEmail(["a@quilltab.app"]), { config });
    const printed = JSON.stringify([log.mock.calls, info.mock.calls, error.mock.calls]);
    expect(printed).not.toContain(PASS);
    expect(printed).not.toContain(Buffer.from(PASS).toString("base64"));
    log.mockRestore();
    info.mockRestore();
    error.mockRestore();
  });
});

describe("alert email content", () => {
  // Built per test: NEXTAUTH_URL is stubbed in beforeAll.
  let message: ReturnType<typeof alertEmail>;
  beforeEach(() => {
    message = alertEmail(["a@quilltab.app"], { fires: FIRES, firedAt: "2026-10-26T05:00:00.000Z" });
  });

  it("lists every alert in plain text and in escaped HTML", () => {
    expect(message.text).toContain("- Most pages are noindex on quilltab.app: 9 of 10 pages are noindex.");
    expect(message.text).toContain("- Traffic drop <b>on</b> quilltab.app");
    expect(message.html).toContain("Traffic drop &lt;b&gt;on&lt;/b&gt; quilltab.app");
    expect(message.html).not.toContain("<b>on</b>");
  });

  it("has no image or tracking pixel and links only to the instance", () => {
    expect(message.html).not.toMatch(/<img|background=|url\(/i);
    const links = [...message.html.matchAll(/href="([^"]+)"/g), ...message.text.matchAll(/(https?:\/\/\S+)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.startsWith("https://seo.quilltab.app/")).toBe(true);
    expect(links).toContain("https://seo.quilltab.app/sites/s1/alerts");
  });

  it("has no link at all without NEXTAUTH_URL", () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    const bare = alertEmail(["a@quilltab.app"], { fires: FIRES, firedAt: "2026-10-26T05:00:00.000Z" });
    expect(bare.html).not.toContain("href=");
    expect(bare.text).not.toMatch(/https?:\/\//);
    vi.stubEnv("NEXTAUTH_URL", "https://seo.quilltab.app/");
  });

  it("keeps the subject on one line", () => {
    const odd = alertEmail(["a@quilltab.app"], { fires: [{ ...FIRES[0], domain: "evil.example\r\nBcc: x@y.io" }], firedAt: "x" });
    expect(odd.subject).not.toMatch(/[\r\n]/);
  });
});
