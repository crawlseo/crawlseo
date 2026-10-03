import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

// Auth.js sends a refused sign-in back here as ?error=AccessDenied, which only
// the signIn callback produces (DISABLE_REGISTRATION). Any other code gets the
// generic line.
function errorMessage(error: string | string[] | undefined): string | null {
  if (!error) return null;
  if (error === "AccessDenied") {
    return "This instance is not accepting new accounts. Ask its owner to sign you up.";
  }
  return "Sign-in failed. Please try again.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }
  const error = errorMessage((await searchParams).error);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="noise-overlay pointer-events-none absolute inset-0" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[var(--shadow-3)]">
            <svg viewBox="0 0 24 24" className="size-6" fill="none" aria-hidden>
              <path
                d="M4 18 L12 5 L20 18"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="15.5" r="1.6" fill="currentColor" />
            </svg>
          </div>
          <h1 className="font-heading text-atom-display1 font-semibold tracking-tight text-foreground">
            CrawlSEO
          </h1>
          <p className="mt-2 text-atom-body text-muted-foreground">
            Self-hosted search ops for founders
          </p>
        </div>

        <div className="panel-elevated p-8">
          <h2 className="font-heading text-atom-title font-semibold text-foreground">
            Sign in
          </h2>
          <p className="mt-2 text-atom-body text-muted-foreground">
            Connect Google Search Console with read-only access.
          </p>

          {error && (
            <p role="alert" className="mt-4 text-atom-caption text-danger">
              {error}
            </p>
          )}

          <form
            className="mt-6"
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <Button type="submit" size="lg" className="w-full">
              Continue with Google
            </Button>
          </form>

          <div className="mt-6 space-y-2 border-t border-border pt-5 text-atom-caption text-muted-foreground">
            <p>· Keywords, positions, CTR from GSC</p>
            <p>· Technical crawl & Core Web Vitals</p>
            <p>· Data stays on your server</p>
          </div>
        </div>
      </div>
    </div>
  );
}
