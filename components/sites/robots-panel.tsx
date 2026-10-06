import type { RobotsReport } from "@/lib/crawler/robots";

/**
 * What robots.txt kept the crawler away from. Information, not issues: the
 * site asked for it, so nothing here counts against the health score.
 */
export function RobotsPanel({ report }: { report: RobotsReport }) {
  const notes = report.origins.filter((o) => o.message);
  if (report.skipped === 0 && notes.length === 0 && !report.stopMessage) return null;
  return (
    <section className="panel flex flex-col gap-2.5 px-5 py-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] leading-5 font-semibold">robots.txt</h2>
        <span className="mono-label text-[11px] text-muted-foreground">Information, not issues</span>
      </div>
      <div className="flex justify-between gap-3 text-[13px]">
        <span>Skipped because of robots.txt</span>
        <span className="font-data text-text-strong">{plural(report.skipped, "URL")}</span>
      </div>
      {report.disallowed > 0 && (
        <div className="flex justify-between gap-3 text-[13px]">
          <span>Disallowed by a rule</span>
          <span className="font-data text-text-strong">{report.disallowed}</span>
        </div>
      )}
      {report.stopMessage && <p className="text-[13px] text-text-strong">{report.stopMessage}</p>}
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-border-soft pt-2.5 text-[13px]">
          {notes.map((o) => (
            <li key={o.origin} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
              <span className="font-data text-[12px] break-all text-text-strong">{o.origin}</span>
              <span className="text-muted-foreground">
                {o.message}
                {o.skipped > 0 ? ` · ${plural(o.skipped, "URL")} skipped` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {report.samples.length > 0 && (
        <details className="text-[13px]">
          <summary className="cursor-pointer text-muted-foreground">
            Disallowed URLs{report.disallowed > report.samples.length ? `, first ${report.samples.length}` : ""}
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1 font-data text-[12px]">
            {report.samples.map((s) => (
              <li key={s.url} className="break-all">
                {s.url}
                {s.redirectedTo && (
                  <span className="text-muted-foreground"> redirects to {s.redirectedTo}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function plural(n: number, noun: string) {
  return `${n} ${n === 1 ? noun : `${noun}s`}`;
}
