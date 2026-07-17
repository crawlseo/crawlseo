import Link from "next/link";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SiteSwitcher } from "@/components/sites/site-switcher";
import { SidebarNav } from "@/components/layout/sidebar-nav";

type AppShellProps = {
  email?: string | null;
  children: React.ReactNode;
  sites: { id: string; domain: string }[];
};

export function AppShell({ email, children, sites }: AppShellProps) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col px-4 py-5">
          <Link
            href="/dashboard"
            className="group mb-8 flex items-center gap-3 px-2"
          >
            <div className="flex size-9 items-center justify-center rounded-lg border border-signal/30 bg-signal-muted text-signal shadow-[0_0_24px_oklch(0.84_0.18_145/0.15)]">
              <svg
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                aria-hidden
              >
                <path
                  d="M4 18 L12 5 L20 18"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="15.5" r="1.6" fill="currentColor" />
              </svg>
            </div>
            <div>
              <p className="font-heading text-base font-semibold tracking-tight text-foreground">
                CrawlSEO
              </p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Search ops
              </p>
            </div>
          </Link>

          <SidebarNav sites={sites} />

          <div className="mt-auto space-y-4 border-t border-sidebar-border pt-4">
            {sites.length > 0 && (
              <div className="px-1">
                <SiteSwitcher sites={sites} />
              </div>
            )}

            <div className="rounded-lg border border-border/60 bg-panel/80 px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Signed in
              </p>
              <p className="mt-1 truncate text-sm text-foreground">{email}</p>
              <form
                className="mt-3"
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="w-full border-border/80 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Sign out
                </Button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
