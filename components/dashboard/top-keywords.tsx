import Link from "next/link";
import { getTopKeywords } from "@/lib/seo-metrics";
import { PositionBadge, CtrCell, NumCell } from "@/components/ui/data-table";

interface TopKeywordsProps {
  siteId: string;
  days?: number;
  limit?: number;
}

const th = "mono-label px-4 py-2.5 text-[11px] font-normal text-muted-foreground";

export async function TopKeywords({ siteId, days = 28, limit = 10 }: TopKeywordsProps) {
  const topKeywords = await getTopKeywords(siteId, days, limit);

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-1.5">
        <h2 className="text-[15px] leading-5 font-semibold">Top queries</h2>
        <Link href={`/sites/${siteId}/keywords`} className="text-link text-[13px]">
          All keywords
        </Link>
      </div>

      {topKeywords.length === 0 ? (
        <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">
          No keyword data yet. Run a GSC sync.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="border-b border-border">
                <th className={`${th} text-left`}>Query</th>
                <th className={`${th} text-right`}>Clicks</th>
                <th className={`${th} text-right`}>Impr.</th>
                <th className={`${th} text-right`}>CTR</th>
                <th className={`${th} text-right`}>Pos.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-soft">
              {topKeywords.map((keyword) => (
                <tr key={keyword.query} className="hover:bg-bg-soft">
                  <td className="px-4 py-[11px] text-text-strong">{keyword.query}</td>
                  <td className="px-4 py-[11px] text-right">
                    <NumCell value={keyword.clicks} />
                  </td>
                  <td className="px-4 py-[11px] text-right">
                    <NumCell value={keyword.impressions} />
                  </td>
                  <td className="px-4 py-[11px] text-right">
                    <CtrCell ctr={keyword.ctr} />
                  </td>
                  <td className="px-4 py-[11px] text-right">
                    <PositionBadge position={keyword.position} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
