import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { account: { findUnique } } }));

import { isSignInAllowed } from "./registration";

const google = { provider: "google", providerAccountId: "1234567890" };

describe("isSignInAllowed", () => {
  const saved = process.env.DISABLE_REGISTRATION;

  beforeEach(() => {
    findUnique.mockReset();
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.DISABLE_REGISTRATION;
    else process.env.DISABLE_REGISTRATION = saved;
  });

  it("lets anyone sign in when registration is open", async () => {
    delete process.env.DISABLE_REGISTRATION;
    expect(await isSignInAllowed(google)).toBe(true);
    process.env.DISABLE_REGISTRATION = "false";
    expect(await isSignInAllowed(google)).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("refuses an account that has never signed in when registration is closed", async () => {
    process.env.DISABLE_REGISTRATION = "true";
    findUnique.mockResolvedValue(null);

    expect(await isSignInAllowed(google)).toBe(false);
    expect(findUnique).toHaveBeenCalledWith({
      where: { provider_providerAccountId: google },
      select: { id: true },
    });
  });

  it("keeps letting an existing account sign in when registration is closed", async () => {
    process.env.DISABLE_REGISTRATION = " TRUE ";
    findUnique.mockResolvedValue({ id: "acc-1" });

    expect(await isSignInAllowed(google)).toBe(true);
  });

  it("refuses a sign-in without an OAuth account when registration is closed", async () => {
    process.env.DISABLE_REGISTRATION = "true";

    expect(await isSignInAllowed(null)).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
