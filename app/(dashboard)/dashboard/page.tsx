import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { DashboardMetrics } from "@/components/dashboard/metrics";
import { TrafficChart } from "@/components/dashboard/traffic-chart";
import { TopKeywords } from "@/components/dashboard/top-keywords";

export default async function DashboardPage() {
  const session = await auth();

  // Fetch user's sites with data
  const sites = await db.site.findMany({
    where: {
      userId: session?.user?.id,
    },
    select: {
      id: true,
      domain: true,
      gscProperty: true,
      _count: {
        select: {
          keywords: true,
        },
      },
    },
  });

  if (sites.length === 0) {
    return (
      <div>
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
          <p className="text-slate-600 mt-2">Welcome to CrawlSEO!</p>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
          <div className="mb-4 text-3xl">📊</div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            No sites connected
          </h3>
          <p className="text-slate-600 mb-6 max-w-md mx-auto">
            Connect your Google Search Console properties to see SEO metrics, track keywords, and monitor your site health.
          </p>
          <a
            href="/sites"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
          >
            Add Your First Site
          </a>
        </div>
      </div>
    );
  }

  // If only one site, show its dashboard
  if (sites.length === 1) {
    const site = sites[0];
    return (
      <div>
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
          <p className="text-slate-600 mt-2">{site.domain}</p>
        </div>

        {site._count.keywords === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
            <div className="mb-4 text-3xl">⏳</div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              Syncing data...
            </h3>
            <p className="text-slate-600 mb-6">
              Your Google Search Console data is being synced. This usually takes 1-2 minutes.
            </p>
            <p className="text-sm text-slate-500">
              Check back soon or go to <a href="/sites" className="text-blue-600 hover:underline">Sites</a> to add more properties.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <DashboardMetrics siteId={site.id} />
            <TrafficChart siteId={site.id} />
            <TopKeywords siteId={site.id} />
          </div>
        )}
      </div>
    );
  }

  // Multiple sites - show overview
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-slate-600 mt-2">
          You have {sites.length} sites connected. Select one to view detailed metrics.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sites.map((site) => (
          <a
            key={site.id}
            href={`/sites/${site.id}/keywords`}
            className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-slate-900 break-all">
                  {site.domain}
                </h3>
              </div>
              <div className="text-2xl">📊</div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Keywords tracked</span>
                <span className="font-semibold text-slate-900">
                  {site._count.keywords}
                </span>
              </div>
            </div>

            <div className="mt-4 text-sm text-blue-600 hover:text-blue-700">
              View details →
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
