import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { VitalsButton, IndexCheckButton } from "@/components/sites/action-buttons";
import { cn } from "@/lib/utils";

interface Props {
  params: Promise<{ siteId: string }>;
}

export default async function VitalsPage({ params }: Props) {
  const session = await auth();
  const { siteId } = await params;

  const site = await db.site.findUnique({
    where: { id: siteId },
    select: { userId: true, domain: true },
  });
  if (!site || site.userId !== session?.user?.id) redirect("/sites");

  const reports = await db.vitalsReport.findMany({
    where: { siteId },
    orderBy: { date: "desc" },
    take: 40,
  });

  return (
    <div>
      <PageHeader
        eyebrow={site.domain}
        title="Core Web Vitals"
        description="PageSpeed Insights lab data for your top pages · set GOOGLE_PAGESPEED_KEY for higher quota"
        actions={<VitalsButton siteId={siteId} />}
      />

      {reports.length === 0 ? (
        <EmptyState
          icon="⚡"
          title="No vitals yet"
          description="Run a check on your top landing pages (mobile Lighthouse)."
        />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/20 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="px-4 py-3 text-left">URL</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right">LCP</th>
                <th className="px-4 py-3 text-right">CLS</th>
                <th className="px-4 py-3 text-right">INP</th>
                <th className="px-4 py-3 text-right">TTFB</th>
                <th className="px-4 py-3 text-left">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="max-w-xs truncate px-4 py-2.5 font-medium">{r.url}</td>
                  <td className="px-4 py-2.5 text-right font-data">
                    <span
                      className={cn(
                        (r.perfScore ?? 0) >= 90
                          ? "text-signal"
                          : (r.perfScore ?? 0) >= 50
                            ? "text-warning"
                            : "text-danger"
                      )}
                    >
                      {r.perfScore ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-data">
                    {r.lcp != null ? `${r.lcp.toFixed(2)}s` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-data">
                    {r.cls != null ? r.cls.toFixed(3) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-data">
                    {r.inp != null ? `${Math.round(r.inp)}ms` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right font-data">
                    {r.ttfb != null ? `${r.ttfb.toFixed(2)}s` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {new Date(r.date).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="panel mt-6 p-5">
        <h3 className="font-heading text-lg font-semibold">Index coverage</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Live URL Inspection for top pages (uses your GSC OAuth token)
        </p>
        <IndexCheckButton siteId={siteId} />
      </div>
    </div>
  );
}
