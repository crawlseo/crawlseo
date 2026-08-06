import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { VitalsButton, IndexCheckButton } from "@/components/sites/action-buttons";
import { VitalsTable } from "@/components/sites/vitals-table";

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
        <VitalsTable
          rows={reports.map((r) => ({
            id: r.id,
            url: r.url,
            perfScore: r.perfScore,
            lcp: r.lcp,
            cls: r.cls,
            inp: r.inp,
            ttfb: r.ttfb,
            date: r.date.toISOString(),
          }))}
        />
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
