import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AddSiteModal } from "@/components/sites/add-site-modal";
import Link from "next/link";

export default async function SitesPage() {
  const session = await auth();

  const sites = await db.site.findMany({
    where: { userId: session?.user?.id },
    select: {
      id: true,
      domain: true,
      gscProperty: true,
      createdAt: true,
      _count: {
        select: {
          keywords: true,
          crawls: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Sites</h2>
          <p className="text-slate-600 mt-2">
            Manage your Google Search Console properties
          </p>
        </div>
        <AddSiteModal />
      </div>

      {sites.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
          <div className="mb-4 text-3xl">🔍</div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            No sites connected
          </h3>
          <p className="text-slate-600 mb-6 max-w-md mx-auto">
            Connect your Google Search Console properties to get started with SEO monitoring.
          </p>
          <AddSiteModal />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sites.map((site) => (
            <Link key={site.id} href={`/sites/${site.id}/keywords`}>
              <div className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer h-full">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-900 text-lg break-all">
                      {site.domain}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {site.gscProperty}
                    </p>
                  </div>
                  <div className="text-2xl">📊</div>
                </div>

                <div className="space-y-2 border-t border-slate-200 pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Keywords tracked</span>
                    <span className="font-semibold text-slate-900">
                      {site._count.keywords}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Last crawl</span>
                    <span className="text-slate-900">
                      {site._count.crawls > 0 ? (
                        <span className="font-semibold">
                          {site._count.crawls}
                        </span>
                      ) : (
                        <span className="text-slate-500">Never</span>
                      )}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-400 mt-4">
                  Added {new Date(site.createdAt).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
