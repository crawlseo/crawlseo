import Link from "next/link";
import { getTopKeywords } from "@/lib/seo-metrics";
import {
  PositionBadge,
  CtrCell,
  NumCell,
} from "@/components/ui/data-table";

interface TopKeywordsProps {
  siteId: string;
  days?: number;
  limit?: number;
}

export async function TopKeywords({
  siteId,
  days = 28,
  limit = 10,
}: TopKeywordsProps) {
  const topKeywords = await getTopKeywords(siteId, days, limit);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <div>
          <h3 className="font-heading text-lg font-semibold text-foreground">
            Top keywords
          </h3>
          <p className="text-sm text-muted-foreground">
            Ranked by clicks · last {days} days
          </p>
        </div>
        <Link
          href={`/sites/${siteId}/keywords`}
          className="text-sm font-medium text-signal hover:underline"
        >
          View all
        </Link>
      </div>

      {topKeywords.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          No keyword data yet. Run a GSC sync.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/20">
                <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Query
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Pos
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Clicks
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Impr.
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  CTR
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {topKeywords.map((keyword, idx) => (
                <tr
                  key={keyword.query}
                  className="transition-colors hover:bg-muted/25"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="font-data w-5 text-xs text-muted-foreground">
                        {idx + 1}
                      </span>
                      <span className="font-medium text-foreground">
                        {keyword.query}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <PositionBadge position={keyword.position} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <NumCell value={keyword.clicks} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <NumCell value={keyword.impressions} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <CtrCell ctr={keyword.ctr} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
