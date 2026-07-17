import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SiteSwitcher } from "@/components/sites/site-switcher";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { IconRail } from "@/components/layout/icon-rail";
import { ThemeToggle } from "@/components/layout/theme-toggle";

type AppShellProps = {
  email?: string | null;
  name?: string | null;
  image?: string | null;
  children: React.ReactNode;
  sites: { id: string; domain: string }[];
};

export function AppShell({
  email,
  name,
  image,
  children,
  sites,
}: AppShellProps) {
  const displayName = name || email?.split("@")[0] || "User";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Dual sidebar: icon rail + text nav (Atomize PRO) */}
      <aside className="hidden h-screen sticky top-0 z-20 md:flex">
        <IconRail />

        <div className="flex w-[240px] flex-col border-r border-sidebar-border bg-sidebar px-3 py-4">
          <div className="mb-5 px-2">
            <p className="text-[15px] font-semibold tracking-tight text-foreground">
              CrawlSEO
            </p>
            <p className="text-[11px] text-muted-foreground">Search operations</p>
          </div>

          <SidebarNav sites={sites} />

          <div className="mt-auto space-y-3 pt-4">
            {sites.length > 0 && (
              <div className="px-1">
                <SiteSwitcher sites={sites} />
              </div>
            )}

            {/* User card + theme (screenshot pattern) */}
            <div className="rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-2)]">
              <div className="mb-3 flex items-center gap-2.5">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt=""
                    className="size-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-400 text-sm font-semibold text-primary-foreground">
                    {initial}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {displayName}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {email}
                  </p>
                </div>
              </div>

              <div className="mb-3 flex items-center justify-between gap-2 px-0.5">
                <span className="text-[11px] text-muted-foreground">Theme</span>
                <ThemeToggle />
              </div>

              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  Logout
                </Button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-sidebar px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <span className="text-xs font-bold">C</span>
            </div>
            <span className="font-semibold">CrawlSEO</span>
          </div>
          <ThemeToggle />
        </header>

        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
