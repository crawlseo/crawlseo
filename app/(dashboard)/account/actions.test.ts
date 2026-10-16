import { beforeEach, describe, expect, it, vi } from "vitest";

// The account server actions act only on the session user: no session, no
// action; a user id in the form is ignored.

const { auth, signOut, disconnectGoogle, deleteAccount, redirect } = vi.hoisted(() => ({
  auth: vi.fn(),
  signOut: vi.fn(async () => undefined),
  disconnectGoogle: vi.fn(async () => ({ revoked: true })),
  deleteAccount: vi.fn(async () => ({ revoked: true })),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock("@/lib/auth", () => ({ auth, signOut }));
vi.mock("@/lib/db", () => ({ db: { marker: "db" } }));
vi.mock("@/lib/account", () => ({ disconnectGoogle, deleteAccount }));
vi.mock("next/navigation", () => ({ redirect }));

import { deleteAccountAction, disconnectGoogleAction, signOutAction } from "./actions";

const me = { user: { id: "user-1", email: "Mike@Quilltab.app" } };

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("without a session", () => {
  beforeEach(() => auth.mockResolvedValue(null));

  it("sign out is refused", async () => {
    await expect(signOutAction()).rejects.toThrow("REDIRECT /login");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("disconnect is refused", async () => {
    await expect(disconnectGoogleAction()).rejects.toThrow("REDIRECT /login");
    expect(disconnectGoogle).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("delete is refused", async () => {
    await expect(
      deleteAccountAction({ error: null }, form({ confirmEmail: "mike@quilltab.app", userId: "user-1" }))
    ).rejects.toThrow("REDIRECT /login");
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("a session without a user id is refused", async () => {
    auth.mockResolvedValue({ user: { email: "mike@quilltab.app" } });
    await expect(disconnectGoogleAction()).rejects.toThrow("REDIRECT /login");
    expect(disconnectGoogle).not.toHaveBeenCalled();
  });
});

describe("with a session", () => {
  beforeEach(() => auth.mockResolvedValue(me));

  it("sign out goes back to /login", async () => {
    await signOutAction();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });

  it("disconnect acts on the session user and signs out", async () => {
    await disconnectGoogleAction();
    expect(disconnectGoogle).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login?notice=disconnected" });
  });

  it("disconnect says so when the revoke failed", async () => {
    disconnectGoogle.mockResolvedValueOnce({ revoked: false });
    await disconnectGoogleAction();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login?notice=disconnected-unrevoked" });
  });

  it("delete needs the account email typed", async () => {
    const state = await deleteAccountAction({ error: null }, form({ confirmEmail: "someone@else.com" }));
    expect(state.error).toMatch(/email/);
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("delete acts on the session user, never on an id from the form", async () => {
    await expect(
      deleteAccountAction({ error: null }, form({ confirmEmail: " mike@quilltab.app ", userId: "user-2" }))
    ).rejects.toThrow("REDIRECT /login?notice=deleted");
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(deleteAccount).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(signOut).toHaveBeenCalledWith({ redirect: false });
  });

  it("delete reports a failure on the login page", async () => {
    deleteAccount.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    await expect(
      deleteAccountAction({ error: null }, form({ confirmEmail: "mike@quilltab.app" }))
    ).rejects.toThrow("REDIRECT /login?notice=delete-failed");
  });
});
