import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { SiteSwitcher } from "@/components/sites/site-switcher";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-sm font-bold text-white">S</span>
              </div>
              <h1 className="text-xl font-bold text-slate-900">CrawlSEO</h1>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-sm">
                <p className="text-slate-600">Signed in as</p>
                <p className="font-medium text-slate-900">{session.user?.email}</p>
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
                  className="bg-white text-slate-900 border-slate-200 hover:bg-slate-50"
                >
                  Sign Out
                </Button>
              </form>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex items-center justify-between border-t border-slate-200 pt-4">
            <div className="flex gap-6">
              <a
                href="/dashboard"
                className="text-sm font-medium text-slate-600 hover:text-slate-900 pb-2 border-b-2 border-transparent hover:border-blue-600 transition-colors"
              >
                Overview
              </a>
              <a
                href="/sites"
                className="text-sm font-medium text-slate-600 hover:text-slate-900 pb-2 border-b-2 border-transparent hover:border-blue-600 transition-colors"
              >
                Sites
              </a>
            </div>

            <SiteSwitcher />
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
