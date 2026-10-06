import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

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
    <div className="flex min-h-screen items-center justify-center bg-bg-soft px-5">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <h1 className="text-text-strong">
            <Logo className="h-8" />
          </h1>
          <p className="text-atom-body text-muted-foreground">Self-hosted search ops for founders</p>
        </div>

        <div className="panel p-8">
          <h2 className="text-atom-title font-medium">Sign in</h2>
          <p className="mt-2 text-atom-body text-muted-foreground">
            Connect Google Search Console with read-only access.
          </p>

          {error && (
            <p role="alert" className="mt-4 text-atom-body text-danger">
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

          <ul className="mt-6 space-y-1.5 border-t border-border pt-5 text-[13px] leading-5 text-muted-foreground">
            <li>Keywords, positions and CTR from GSC</li>
            <li>Technical crawl and Core Web Vitals</li>
            <li>Data stays on your server</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
