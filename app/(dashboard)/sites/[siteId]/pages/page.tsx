import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

interface PagesPageProps {
  params: {
    siteId: string;
  };
}

export default async function PagesPage({ params }: PagesPageProps) {
  const session = await auth();

  // Verify site belongs to user
  const site = await db.site.findUnique({
    where: { id: params.siteId },
    select: { userId: true, domain: true },
  });

  if (!site || site.userId !== session?.user?.id) {
    redirect("/sites");
  }

  // Fetch pages for this site (latest 28 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 28);

  const pages = await db.page.findMany({
    where: {
      siteId: params.siteId,
      date: {
        gte: thirtyDaysAgo,
      },
    },
    select: {
      id: true,
      url: true,
      clicks: true,
      impressions: true,
      ctr: true,
      position: true,
      date: true,
    },
    orderBy: [{ date: "desc" }, { clicks: "desc" }],
    take: 100,
  });

  // Group by URL to show latest metrics
  const groupedPages = new Map<
    string,
    {
      url: string;
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
      date: Date;
    }
  >();

  for (const page of pages) {
    const key = page.url;
    if (!groupedPages.has(key)) {
      groupedPages.set(key, {
        url: page.url,
        clicks: page.clicks,
        impressions: page.impressions,
        ctr: page.ctr,
        position: page.position,
        date: page.date,
      });
    }
  }

  const uniquePages = Array.from(groupedPages.values()).sort(
    (a, b) => b.clicks - a.clicks
  );

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Pages</h2>
        <p className="text-slate-600 mt-2">{site.domain}</p>

        <div className="flex gap-4 mt-4">
          <a
            href={`/sites/${params.siteId}/keywords`}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 pb-2 border-b-2 border-transparent hover:border-slate-300"
          >
            Keywords
          </a>
          <a
            href={`/sites/${params.siteId}/pages`}
            className="text-sm font-medium text-blue-600 pb-2 border-b-2 border-blue-600"
          >
            Pages
          </a>
        </div>
      </div>

      {uniquePages.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            No pages yet
          </h3>
          <p className="text-slate-600">
            Pages from your Google Search Console data will appear here
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  URL
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Avg Position
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Clicks
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Impressions
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                  CTR
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {uniquePages.slice(0, 50).map((page) => (
                <tr
                  key={page.url}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <a
                      href={page.url.startsWith("http") ? page.url : `https://${site.domain}${page.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline font-medium break-all"
                    >
                      {page.url}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-slate-900 font-semibold">
                      {Math.round(page.position)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-slate-900">{page.clicks}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-slate-900">
                      {page.impressions}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-slate-900">
                      {(page.ctr * 100).toFixed(2)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {uniquePages.length > 50 && (
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 text-sm text-slate-600">
              Showing 50 of {uniquePages.length} pages
            </div>
          )}
        </div>
      )}
    </div>
  );
}
