import { db } from "@/lib/db";
import { getDateRange } from "@/lib/date-utils";

interface TopKeywordsProps {
  siteId: string;
}

export async function TopKeywords({ siteId }: TopKeywordsProps) {
  const { start, end } = getDateRange(28);
  const startDate = new Date(start);
  const endDate = new Date(end);

  // Fetch keywords and aggregate by query
  const keywords = await db.keyword.findMany({
    where: {
      siteId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      query: true,
      clicks: true,
      impressions: true,
      position: true,
      ctr: true,
    },
  });

  // Group by query and take latest metrics
  const groupedByQuery = new Map<
    string,
    {
      query: string;
      clicks: number;
      impressions: number;
      position: number;
      ctr: number;
    }
  >();

  for (const keyword of keywords) {
    const key = keyword.query;
    if (!groupedByQuery.has(key)) {
      groupedByQuery.set(key, {
        query: keyword.query,
        clicks: keyword.clicks,
        impressions: keyword.impressions,
        position: keyword.position,
        ctr: keyword.ctr,
      });
    }
  }

  const topKeywords = Array.from(groupedByQuery.values())
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">
          Top 10 Keywords (Last 28 Days)
        </h3>
      </div>

      {topKeywords.length === 0 ? (
        <div className="p-6 text-center text-slate-600">
          No keywords data available yet
        </div>
      ) : (
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
            {topKeywords.map((keyword, idx) => (
              <tr
                key={keyword.query}
                className="hover:bg-slate-50 transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
                      {idx + 1}
                    </span>
                    <span className="font-medium text-slate-900">
                      {keyword.query}
                    </span>
                  </div>
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
      )}
    </div>
  );
}
