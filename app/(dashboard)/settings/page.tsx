import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSealed } from "@/lib/google/token-store";
import { API_KEY_PROVIDERS, apiKeyStatus } from "@/lib/api-keys";
import { PageHeader } from "@/components/ui/page-header";
import { Avatar } from "@/components/account/avatar";
import { DeleteAccountDialog, SignOutButton } from "@/components/account/account-actions";
import { ConnectionsSection } from "@/components/settings/connections-section";

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

function SectionHeading({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div className="mb-3">
      <h2 id={id} className="text-[15px] leading-5 font-semibold text-text-strong">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

interface Props {
  searchParams: Promise<{ connect?: string | string[] }>;
}

export default async function SettingsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, name: true, image: true, googleTokens: true },
  });
  if (!user) redirect("/login");

  const connected = hasToken(user.googleTokens);
  const keys = await apiKeyStatus(db, session.user.id);
  const registrationClosed =
    process.env.DISABLE_REGISTRATION?.trim().toLowerCase() === "true";

  // ?connect=bing opens that row's form, for the "Connect Bing in Settings" links.
  const { connect } = await searchParams;
  const initialOpen = API_KEY_PROVIDERS.find((p) => p === connect) ?? null;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Your profile, the services crawlseo connects to, and your account."
      />

      <div className="space-y-10">
        <section aria-labelledby="profile-heading">
          <SectionHeading
            id="profile-heading"
            title="Profile"
            description="From your Google account, updated each time you sign in."
          />
          <div className="panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar name={user.name} email={user.email} image={user.image} className="size-12 text-[13px]" />
              <dl className="min-w-0">
                <dt className="sr-only">Name</dt>
                <dd className="truncate text-[15px] leading-5 font-medium text-text-strong">
                  {user.name || <span className="font-normal text-muted-foreground">No name from Google yet</span>}
                </dd>
                <dt className="sr-only">Email</dt>
                <dd className="mt-0.5 font-data text-[13px] leading-5 break-all text-muted-foreground">{user.email}</dd>
              </dl>
            </div>
            <SignOutButton />
          </div>
        </section>

        <section id="connections" aria-labelledby="connections-heading" className="scroll-mt-6">
          <SectionHeading
            id="connections-heading"
            title="Connections"
            description="Each connection is stored once for your account and used by every site."
          />
          <ConnectionsSection
            google={{
              connected,
              scopes: connected ? grantedScopes(user.googleTokens) : [],
              sealed: isSealed(user.googleTokens),
            }}
            initialStatus={keys}
            initialOpen={initialOpen}
          />
        </section>

        <section aria-labelledby="danger-heading">
          <SectionHeading id="danger-heading" title="Danger zone" description="This cannot be undone." />
          <div className="panel flex flex-col gap-4 border-danger/30 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-[15px] leading-5 font-medium text-text-strong">Delete account</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Deletes your account, every site and all its data on this instance, and revokes Google
                access.
              </p>
            </div>
            <DeleteAccountDialog email={user.email} registrationClosed={registrationClosed} />
          </div>
        </section>
      </div>
    </div>
  );
}
