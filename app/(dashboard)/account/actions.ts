"use server";

import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteAccount, disconnectGoogle } from "@/lib/account";

/*
 * Server actions: POST only, with Next.js's own Origin check. Each one acts
 * on the signed-in user from the session and takes no user id from the form.
 */

async function sessionUser(): Promise<{ id: string; email: string | null }> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  return { id, email: session.user?.email ?? null };
}

export async function signOutAction(): Promise<void> {
  await sessionUser();
  await signOut({ redirectTo: "/login" });
}

export async function disconnectGoogleAction(): Promise<void> {
  const user = await sessionUser();
  const { revoked } = await disconnectGoogle(db, user.id);
  await signOut({ redirectTo: `/login?notice=${revoked ? "disconnected" : "disconnected-unrevoked"}` });
}

export type DeleteAccountState = { error: string | null };

export async function deleteAccountAction(
  _prev: DeleteAccountState,
  formData: FormData
): Promise<DeleteAccountState> {
  const user = await sessionUser();
  const typed = String(formData.get("confirmEmail") ?? "").trim().toLowerCase();
  if (!user.email || typed !== user.email.toLowerCase()) {
    return { error: "Type your account email exactly to confirm." };
  }

  // The session goes first, so nothing is left signed in to a user that no
  // longer exists. Deleting the user removes every other session too.
  await signOut({ redirect: false });
  let notice: string;
  try {
    const { revoked } = await deleteAccount(db, user.id);
    notice = revoked ? "deleted" : "deleted-unrevoked";
  } catch (error) {
    console.error("Account deletion failed:", error);
    notice = "delete-failed";
  }
  redirect(`/login?notice=${notice}`);
}
