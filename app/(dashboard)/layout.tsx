import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const sites = await db.site.findMany({
    where: { userId: session.user?.id },
    select: { id: true, domain: true },
    orderBy: { domain: "asc" },
  });

  // Latest day of Search Console data per site, for the sidebar status block.
  const latest = sites.length
    ? await db.page.groupBy({
        by: ["siteId"],
        where: { siteId: { in: sites.map((s) => s.id) } },
        _max: { date: true },
      })
    : [];
  const dataThrough = Object.fromEntries(
    latest.map((row) => [row.siteId, row._max.date?.toISOString().slice(0, 10) ?? null])
  );

  return (
    <AppShell
      email={session.user?.email}
      name={session.user?.name}
      sites={sites.map((s) => ({ ...s, dataThrough: dataThrough[s.id] ?? null }))}
      showCloudPromo={process.env.CRAWLSEO_HIDE_CLOUD_PROMO?.trim().toLowerCase() !== "true"}
    >
      {children}
    </AppShell>
  );
}
