import { redirect } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSealed } from "@/lib/google/token-store";
import { PageHeader } from "@/components/ui/page-header";
import {
  DeleteAccountDialog,
  DisconnectGoogleDialog,
  SignOutButton,
} from "@/components/account/account-actions";

const SCOPE_LABELS: Record<string, string> = {
  openid: "Sign-in",
  email: "Email address",
  profile: "Name and picture",
  "https://www.googleapis.com/auth/userinfo.email": "Email address",
  "https://www.googleapis.com/auth/userinfo.profile": "Name and picture",
  "https://www.googleapis.com/auth/webmasters.readonly": "Search Console, read-only",
};

/** Granted scopes from `User.googleTokens`, which keeps them in plain text next to the encrypted tokens. */
function grantedScopes(stored: unknown): string[] {
  const scope =
    stored && typeof stored === "object" && "scope" in stored ? (stored as { scope?: unknown }).scope : null;
  return typeof scope === "string" ? scope.split(/\s+/).filter(Boolean) : [];
}

function hasToken(stored: unknown): boolean {
  if (!stored || typeof stored !== "object") return false;
  const t = stored as { accessToken?: unknown; refreshToken?: unknown };
  return typeof t.refreshToken === "string" || typeof t.accessToken === "string";
}

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true, googleTokens: true },
  });
  if (!user) redirect("/login");

  const connected = hasToken(user.googleTokens);
  const scopes = connected ? grantedScopes(user.googleTokens) : [];
  const registrationClosed =
    process.env.DISABLE_REGISTRATION?.trim().toLowerCase() === "true";

  return (
    <div className="max-w-[760px]">
      <PageHeader title="Account" description="Your Google sign-in, its access to Search Console, and your data." />

      <div className="space-y-6">
        <section className="panel p-5" aria-labelledby="profile-heading">
          <h2 id="profile-heading" className="text-[15px] leading-5 font-semibold text-text-strong">
            Signed in as
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-data break-all text-text-strong">{user.email}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium text-text-strong">{user.name || "Not set"}</dd>
            </div>
          </dl>
          <div className="mt-5 border-t border-border pt-5">
            <SignOutButton />
          </div>
        </section>

        <section className="panel p-5" aria-labelledby="google-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="google-heading" className="text-[15px] leading-5 font-semibold text-text-strong">
                Google connection
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {connected
                  ? isSealed(user.googleTokens)
                    ? "Tokens are stored encrypted on this server."
                    : "Tokens are stored on this server and are encrypted at the next refresh."
                  : "No Google tokens are stored. Sign out and sign in again to reconnect."}
              </p>
            </div>
            {connected ? (
              <span className="flex shrink-0 items-center gap-1.5 mono-label rounded-md border border-success/30 bg-success-bg px-2 py-0.5 text-[11px] text-success">
                <CheckCircle2 className="size-3.5" aria-hidden />
                Connected
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1.5 mono-label rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                <XCircle className="size-3.5" aria-hidden />
                Disconnected
              </span>
            )}
          </div>

          {scopes.length > 0 && (
            <div className="mt-4">
              <h3 className="mono-label text-[11px] leading-4 text-muted-foreground">Granted access</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {scopes.map((scope) => (
                  <li key={scope} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <span className="text-text-strong">{SCOPE_LABELS[scope] ?? "Other"}</span>
                    <span className="font-data text-[12px] break-all text-muted-foreground">{scope}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5 border-t border-border pt-5">
            <DisconnectGoogleDialog disabled={!connected} />
          </div>
        </section>

        <section className="panel border-danger/30 p-5" aria-labelledby="delete-heading">
          <h2 id="delete-heading" className="text-[15px] leading-5 font-semibold text-text-strong">
            Delete account
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deletes your account, every site and all its data on this instance, and revokes Google
            access.
          </p>
          <div className="mt-5">
            <DeleteAccountDialog email={user.email} registrationClosed={registrationClosed} />
          </div>
        </section>
      </div>
    </div>
  );
}
