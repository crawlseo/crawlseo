import { Fragment } from "react";
import type { RobotsReport } from "@/lib/crawler/robots";

/**
 * What robots.txt kept the crawler away from. Information, not issues: the
 * site asked for it, so nothing here counts against the health score.
 */
export function RobotsPanel({ report }: { report: RobotsReport }) {
  // Every origin with something to say: a message, or URLs skipped by Disallow rules.
  const notes = report.origins.filter((o) => o.message || o.skipped > 0);
  if (report.skipped === 0 && notes.length === 0 && !report.stopMessage) return null;
  return (
    <section className="panel flex flex-col gap-2.5 px-5 py-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] leading-5 font-semibold">robots.txt</h2>
        <span className="mono-label text-[11px] text-muted-foreground">Information, not issues</span>
      </div>
      <div className="flex justify-between gap-3 text-[13px]">
        <span>Skipped because of robots.txt</span>
        <span className="font-data whitespace-nowrap text-text-strong">{plural(report.skipped, "URL")}</span>
      </div>
      {report.disallowed > 0 && (
        <div className="flex justify-between gap-3 text-[13px]">
          <span>Disallowed by a rule</span>
          <span className="font-data whitespace-nowrap text-text-strong">{report.disallowed}</span>
        </div>
      )}
      {report.stopMessage && <p className="text-[13px] text-text-strong">{report.stopMessage}</p>}
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-border-soft pt-2.5 text-[13px]">
          {notes.map((o) => (
            <li key={o.origin} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 font-data text-[12px] text-text-strong">
                  <Url href={o.origin} />
                </span>
                {o.skipped > 0 && (
                  <span className="shrink-0 font-data text-[12px] whitespace-nowrap text-text-strong">
                    {plural(o.skipped, "URL")} skipped
                  </span>
                )}
              </div>
              <span className="text-muted-foreground">{o.message ?? "Disallowed by a rule"}</span>
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
              <li key={s.url}>
                <Url href={s.url} />
                {s.redirectedTo && (
                  <span className="text-muted-foreground">
                    {" "}redirects to <Url href={s.redirectedTo} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/**
 * A URL that wraps after "/", "?", "&" or "-" rather than mid-word. Only a
 * single segment wider than the line still breaks inside it, so nothing
 * overflows. The full URL is in the title.
 */
function Url({ href }: { href: string }) {
  const schemeEnd = href.indexOf("//") + 2;
  const parts = href.slice(schemeEnd).split(/(?<=[/?&-])/);
  parts[0] = href.slice(0, schemeEnd) + parts[0];
  return (
    <span title={href} className="[overflow-wrap:anywhere]">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <wbr />}
          {part}
        </Fragment>
      ))}
    </span>
  );
}

function plural(n: number, noun: string) {
  return `${n} ${n === 1 ? noun : `${noun}s`}`;
}
