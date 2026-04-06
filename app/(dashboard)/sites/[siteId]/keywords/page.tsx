import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

interface KeywordsPageProps {
  params: {
    siteId: string;
  };
}

export default async function KeywordsPage({ params }: KeywordsPageProps) {
  const session = await auth();

  // Verify site belongs to user
  const site = await db.site.findUnique({
    where: { id: params.siteId },
    select: { userId: true, domain: true },
  });

  if (!site || site.userId !== session?.user?.id) {
    redirect("/sites");
  }

  // Fetch keywords for this site (latest 28 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 28);

  const keywords = await db.keyword.findMany({
    where: {
      siteId: params.siteId,
      date: {
        gte: thirtyDaysAgo,
      },
    },
    select: {
      id: true,
      query: true,
      position: true,
      clicks: true,
      impressions: true,
      ctr: true,
      device: true,
      country: true,
      date: true,
    },
    orderBy: [{ date: "desc" }, { clicks: "desc" }],
    take: 100,
  });

  // Group by query to show latest metrics
  const groupedKeywords = new Map<
    string,
    {
      query: string;
      position: number;
      clicks: number;
      impressions: number;
      ctr: number;
      device: string | null;
      country: string | null;
      date: Date;
    }
  >();

  for (const keyword of keywords) {
    const key = keyword.query;
    if (!groupedKeywords.has(key)) {
      groupedKeywords.set(key, {
        query: keyword.query,
        position: keyword.position,
        clicks: keyword.clicks,
        impressions: keyword.impressions,
        ctr: keyword.ctr,
        device: keyword.device,
        country: keyword.country,
        date: keyword.date,
      });
    }
  }

  const uniqueKeywords = Array.from(groupedKeywords.values()).sort(
    (a, b) => b.clicks - a.clicks
  );

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Keywords</h2>
        <p className="text-slate-600 mt-2">{site.domain}</p>

        <div className="flex gap-4 mt-4">
          <a
            href={`/sites/${params.siteId}/keywords`}
            className="text-sm font-medium text-blue-600 pb-2 border-b-2 border-blue-600"
          >
            Keywords
          </a>
          <a
            href={`/sites/${params.siteId}/pages`}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 pb-2 border-b-2 border-transparent hover:border-slate-300"
          >
            Pages
          </a>
        </div>
      </div>

      {uniqueKeywords.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            No keywords yet
          </h3>
          <p className="text-slate-600">
            Keywords from your Google Search Console data will appear here
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Query
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-600 uppercase tracking-wider">
                  Position
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
              {uniqueKeywords.slice(0, 50).map((keyword) => (
                <tr
                  key={keyword.query}
                  className="hover:bg-slate-50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <span className="font-medium text-slate-900">
                      {keyword.query}
                    </span>
                    {keyword.device && (
                      <p className="text-xs text-slate-500 mt-1">
                        {keyword.device}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-slate-900 font-semibold">
                      {Math.round(keyword.position)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-slate-900">{keyword.clicks}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-slate-900">
                      {keyword.impressions}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-slate-900">
                      {(keyword.ctr * 100).toFixed(2)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {uniqueKeywords.length > 50 && (
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 text-sm text-slate-600">
              Showing 50 of {uniqueKeywords.length} keywords
            </div>
          )}
        </div>
      )}
    </div>
  );
}
