import { beforeEach, describe, expect, it, vi } from "vitest";

// Settings > Email alerts API: recipients and the switch, never the SMTP
// settings; refused when email is off or not set up; Send test reports the
// failure without the login and is rate limited.

const { sendEmail, saved, saveAlertEmail } = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  saved: { recipients: [] as string[], enabled: false },
  saveAlertEmail: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/db", () => ({ db: { job: { findFirst: async () => null } } }));
vi.mock("@/lib/user-settings", () => ({
  getAlertEmail: vi.fn(async () => ({ ...saved })),
  saveAlertEmail: saveAlertEmail.mockImplementation(async (_db: unknown, _id: string, s: typeof saved) => {
    saved.recipients = s.recipients;
    saved.enabled = s.enabled;
  }),
}));
vi.mock("@/lib/email/send", () => ({ sendEmail }));

import { GET, PUT } from "./route";
import { POST } from "./test/route";

const SMTP = {
  SMTP_HOST: "smtp.quilltab.app",
  SMTP_PORT: "587",
  SMTP_USER: "mailer@quilltab.app",
  SMTP_PASSWORD: "hunter2-very-secret",
  SMTP_FROM: "seo@quilltab.app",
};
const put = (body: object) => PUT(new Request("http://localhost/api/user/email", { method: "PUT", body: JSON.stringify(body) }));
const test = (body: object) => POST(new Request("http://localhost/api/user/email/test", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(SMTP)) vi.stubEnv(k, v);
  saved.recipients = [];
  saved.enabled = false;
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ ok: true });
});

describe("GET /api/user/email", () => {
  it("says whether SMTP is set up, never its host, login or sender", async () => {
    const body = await (await GET()).json();
    expect(body).toEqual({ enabled: true, configured: true, recipients: [], on: false, lastEmail: null });
    const json = JSON.stringify(body);
    for (const value of Object.values(SMTP)) expect(json).not.toContain(value);
  });

  it("not configured without SMTP_HOST", async () => {
    vi.stubEnv("SMTP_HOST", "");
    expect(await (await GET()).json()).toMatchObject({ configured: false });
  });
});

describe("PUT /api/user/email", () => {
  it("saves the recipients and the switch", async () => {
    const res = await put({ recipients: "A@quilltab.app, b@quilltab.app", on: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ recipients: ["a@quilltab.app", "b@quilltab.app"], on: true });
  });

  it("refuses a bad address with the field", async () => {
    const res = await put({ recipients: "nope", on: true });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "recipients" });
    expect(saveAlertEmail).not.toHaveBeenCalledWith(expect.anything(), "user-1", expect.objectContaining({ recipients: ["nope"] }));
  });

  it("is refused when email is not set up or off on the server", async () => {
    vi.stubEnv("SMTP_FROM", "");
    expect((await put({ recipients: "a@quilltab.app", on: true })).status).toBe(403);
    vi.stubEnv("SMTP_FROM", SMTP.SMTP_FROM);
    vi.stubEnv("ALERT_EMAILS_ENABLED", "false");
    expect((await put({ recipients: "a@quilltab.app", on: true })).status).toBe(403);
  });
});

describe("POST /api/user/email/test", () => {
  it("sends to the form's addresses, or the saved ones", async () => {
    expect(await (await test({ recipients: "x@quilltab.app" })).json()).toEqual({ ok: true });
    expect(sendEmail).toHaveBeenLastCalledWith(expect.objectContaining({ to: ["x@quilltab.app"], subject: "[crawlseo] Test email" }));
    saved.recipients = ["saved@quilltab.app"];
    await test({});
    expect(sendEmail).toHaveBeenLastCalledWith(expect.objectContaining({ to: ["saved@quilltab.app"] }));
  });

  it("returns the failure as given by sendEmail, which has no login in it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    sendEmail.mockResolvedValue({ ok: false, error: "Could not send the email: Connection timeout", retryable: true });
    expect(await (await test({ recipients: "x@quilltab.app" })).json()).toEqual({
      ok: false,
      error: "Could not send the email: Connection timeout",
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain(SMTP.SMTP_PASSWORD);
    error.mockRestore();
  });

  it("asks for an address when none is given or saved", async () => {
    const res = await test({});
    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("is refused when email is off on the server", async () => {
    vi.stubEnv("ALERT_EMAILS_ENABLED", "false");
    expect((await test({ recipients: "x@quilltab.app" })).status).toBe(403);
  });

  it("allows a few test emails per user, then answers 429", async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await test({ recipients: "x@quilltab.app" })).status);
    expect(statuses).toContain(429);
  });
});
