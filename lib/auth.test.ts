import { describe, expect, it, vi } from "vitest";

// The sign-in event copies the Google profile and stores the tokens: the adapter alone writes the name and
// picture only when it creates the user.

const { config, syncGoogleProfile, storeSignInTokens } = vi.hoisted(() => ({
  config: { current: null as null | { events: { signIn: (msg: unknown) => Promise<void> } } },
  syncGoogleProfile: vi.fn(async () => undefined),
  storeSignInTokens: vi.fn(async () => undefined),
}));

vi.mock("next-auth", () => ({
  default: (c: typeof config.current) => {
    config.current = c;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("next-auth/providers/google", () => ({ default: (o: unknown) => o }));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("./db", () => ({ db: { marker: "db" } }));
vi.mock("./registration", () => ({ isSignInAllowed: vi.fn() }));
vi.mock("./google/profile", () => ({ syncGoogleProfile }));
vi.mock("./google/token-store", () => ({ storeSignInTokens }));

process.env.SKIP_ENV_VALIDATION = "1";
await import("./auth");

describe("events.signIn", () => {
  it("syncs the profile and stores the tokens", async () => {
    const profile = { name: "Mike Gafin", picture: "https://lh3.googleusercontent.com/a/x" };
    const account = { access_token: "a", provider: "google", providerAccountId: "1" };
    await config.current!.events.signIn({ user: { email: "mike@quilltab.app" }, account, profile });
    expect(syncGoogleProfile).toHaveBeenCalledWith({ marker: "db" }, "mike@quilltab.app", profile);
    expect(storeSignInTokens).toHaveBeenCalledWith({ marker: "db" }, "mike@quilltab.app", account);
  });

  it("still stores the tokens when the profile update fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    syncGoogleProfile.mockRejectedValueOnce(new Error("db down"));
    storeSignInTokens.mockClear();
    await config.current!.events.signIn({
      user: { email: "mike@quilltab.app" },
      account: { access_token: "a" },
      profile: {},
    });
    expect(storeSignInTokens).toHaveBeenCalledTimes(1);
  });
});
