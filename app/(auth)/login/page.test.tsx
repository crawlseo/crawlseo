import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /login?error=AccessDenied: the refusal copy comes from REGISTRATION_CLOSED_MESSAGE.

const { auth, redirect } = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock("@/lib/auth", () => ({ auth, signIn: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/navigation", () => ({ redirect }));

const { default: LoginPage } = await import("./page");

async function render(searchParams: Record<string, string> = {}) {
  return renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve(searchParams) }));
}

function alertText(html: string): string | undefined {
  return html.match(/<p role="alert"[^>]*>(.*?)<\/p>/)?.[1];
}

describe("login refusal copy", () => {
  const saved = process.env.REGISTRATION_CLOSED_MESSAGE;

  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue(null);
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.REGISTRATION_CLOSED_MESSAGE;
    else process.env.REGISTRATION_CLOSED_MESSAGE = saved;
  });

  it("shows the default line when the variable is unset", async () => {
    delete process.env.REGISTRATION_CLOSED_MESSAGE;
    expect(alertText(await render({ error: "AccessDenied" }))).toBe(
      "This instance is not accepting new accounts. Ask its owner to sign you up."
    );
  });

  it("shows the configured message", async () => {
    process.env.REGISTRATION_CLOSED_MESSAGE =
      "crawlseo cloud is in private beta. Join the waitlist at crawlseo.cloud.";
    expect(alertText(await render({ error: "AccessDenied" }))).toBe(
      "crawlseo cloud is in private beta. Join the waitlist at crawlseo.cloud."
    );
  });

  it("keeps the default when the variable is blank", async () => {
    process.env.REGISTRATION_CLOSED_MESSAGE = "   ";
    expect(alertText(await render({ error: "AccessDenied" }))).toBe(
      "This instance is not accepting new accounts. Ask its owner to sign you up."
    );
  });

  it("renders markup in the message as text", async () => {
    process.env.REGISTRATION_CLOSED_MESSAGE = 'Closed. <a href="https://evil.test">Join</a>';
    const html = await render({ error: "AccessDenied" });
    expect(html).not.toContain("<a ");
    expect(alertText(html)).toBe("Closed. &lt;a href=&quot;https://evil.test&quot;&gt;Join&lt;/a&gt;");
  });

  it("does not use the message for other sign-in errors", async () => {
    process.env.REGISTRATION_CLOSED_MESSAGE = "Private beta.";
    expect(alertText(await render({ error: "OAuthCallback" }))).toBe("Sign-in failed. Please try again.");
  });
});
