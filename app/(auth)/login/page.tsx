import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

export default async function LoginPage() {
  // If already logged in, redirect to dashboard
  const session = await auth();
  if (session) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-6 flex justify-center">
            <div className="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-2xl font-bold text-white">SEO</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">CrawlSEO</h1>
          <p className="text-slate-300">
            Open-source SEO monitoring for founders
          </p>
        </div>

        <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 shadow-xl">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white mb-2">Get Started</h2>
            <p className="text-slate-400 text-sm">
              Sign in with your Google account to access Google Search Console data, site crawl results, and Core Web Vitals metrics.
            </p>
          </div>

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <Button
              type="submit"
              className="w-full bg-white hover:bg-slate-100 text-slate-900 font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              <svg
                className="w-5 h-5 mr-2 inline"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-700">
            <p className="text-xs text-slate-400 text-center">
              By signing in, you agree to connect your Google Search Console account.
              We only request read-only access.
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-slate-400 text-sm">
            Self-hosted • Open source • Your data stays yours
          </p>
        </div>
      </div>
    </div>
  );
}
