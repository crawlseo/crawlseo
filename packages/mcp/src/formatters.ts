/**
 * LLM-optimized text formatters for MCP tool responses: compact text tables
 * with aligned columns, from the JSON the /api/v1 API returns.
 */

export function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );

  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));
  const sep = widths.map((w) => "-".repeat(w)).join(" | ");

  const headerLine = headers.map((h, i) => pad(h, widths[i])).join(" | ");
  const dataLines = rows.map((row) =>
    row.map((cell, i) => pad(cell, widths[i])).join(" | ")
  );

  return [headerLine, sep, ...dataLines].join("\n");
}

// Input shapes: only the fields each formatter reads.

type SearchRow = { clicks: number; impressions: number; position: number; ctr: number };

type VitalsRow = {
  date: Date | string;
  device: string;
  perfScore: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  ttfb: number | null;
};

type CrawlRow = {
  id: string;
  status: string;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  pagesFound: number;
  issuesFound: number;
  healthScore: number | null;
  error?: string | null;
};

type Period = { startDate: string; endDate: string };

type SiteOverview = {
  id: string;
  domain: string;
  gscProperty?: string | null;
  metricsDays?: number;
  metrics?: {
    current: { clicks: number; impressions: number; avgPosition: number; avgCtr: number; uniqueKeywords: number };
    deltas: { clicks: number; impressions: number; avgPosition: number; avgCtr: number };
  } | null;
  latestCrawl?: CrawlRow | null;
  latestVitals?: VitalsRow | null;
};

type Opportunities = {
  summary: { strikingDistance: number; lowCtr: number; contentDecay: number; cannibalization: number };
  feed?: { type: string; severity: string; title?: string | null; detail?: string | null }[];
};

function num(n: number): string {
  return n.toLocaleString("en-US");
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function pos(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "-";
  return n.toFixed(1);
}

function minute(d: Date | string | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") : "-";
}

function period(p: Period): string {
  return `${p.startDate} to ${p.endDate}`;
}

export function formatSiteOverview(site: SiteOverview): string {
  const lines: string[] = [];
  lines.push(`Site: ${site.domain}`);
  lines.push(`ID: ${site.id}`);
  if (site.gscProperty) lines.push(`GSC Property: ${site.gscProperty}`);
  lines.push("");

  if (site.metrics) {
    const m = site.metrics;
    lines.push(`-- Last ${site.metricsDays ?? 28} days vs the ${site.metricsDays ?? 28} days before --`);
    lines.push(`Clicks:      ${num(m.current.clicks)} (${m.deltas.clicks > 0 ? "+" : ""}${m.deltas.clicks}%)`);
    lines.push(`Impressions: ${num(m.current.impressions)} (${m.deltas.impressions > 0 ? "+" : ""}${m.deltas.impressions}%)`);
    lines.push(`Avg Position: ${pos(m.current.avgPosition)} (${m.deltas.avgPosition > 0 ? "+" : ""}${m.deltas.avgPosition.toFixed(1)} improvement)`);
    lines.push(`Avg CTR:     ${pct(m.current.avgCtr)} (${m.deltas.avgCtr > 0 ? "+" : ""}${m.deltas.avgCtr}%)`);
    lines.push(`Keywords:    ${num(m.current.uniqueKeywords)}`);
  }

  if (site.latestCrawl) {
    const c = site.latestCrawl;
    lines.push("");
    lines.push("-- Latest Crawl --");
    lines.push(`ID: ${c.id}`);
    lines.push(`Status: ${c.status}  |  Health: ${c.healthScore ?? "-"}/100`);
    if (c.status === "FAILED" && c.error) lines.push(`Error: ${c.error}`);
    lines.push(`Pages: ${num(c.pagesFound)}  |  Issues: ${num(c.issuesFound)}`);
    if (c.finishedAt) lines.push(`Finished: ${minute(c.finishedAt)}`);
  }

  if (site.latestVitals) {
    const v = site.latestVitals;
    lines.push("");
    lines.push("-- Latest Vitals --");
    lines.push(`Perf Score: ${v.perfScore ?? "-"}/100  |  Device: ${v.device}`);
    if (v.lcp != null) lines.push(`LCP: ${v.lcp.toFixed(2)}s`);
    if (v.cls != null) lines.push(`CLS: ${v.cls.toFixed(3)}`);
    if (v.inp != null) lines.push(`INP: ${v.inp.toFixed(0)}ms`);
    if (v.ttfb != null) lines.push(`TTFB: ${v.ttfb.toFixed(2)}s`);
  }

  return lines.join("\n");
}

export function formatKeywords(keywords: (SearchRow & { query: string })[], p: Period): string {
  if (keywords.length === 0) return `No keywords found for ${period(p)}.`;

  const headers = ["Keyword", "Clicks", "Impressions", "Position", "CTR"];
  const rows = keywords.map((k) => [
    k.query.length > 50 ? k.query.slice(0, 47) + "..." : k.query,
    num(k.clicks),
    num(k.impressions),
    pos(k.position),
    pct(k.ctr),
  ]);

  return `Top ${keywords.length} keywords, ${period(p)}:\n\n` + formatTable(headers, rows);
}

export function formatPages(pages: (SearchRow & { url: string })[], p: Period): string {
  if (pages.length === 0) return `No pages found for ${period(p)}.`;

  const headers = ["URL", "Clicks", "Impressions", "Position", "CTR"];
  const rows = pages.map((p) => {
    let url = p.url;
    try {
      url = new URL(p.url).pathname;
    } catch {}
    if (url.length > 60) url = url.slice(0, 57) + "...";
    return [url, num(p.clicks), num(p.impressions), pos(p.position), pct(p.ctr)];
  });

  return `Top ${pages.length} pages, ${period(p)}:\n\n` + formatTable(headers, rows);
}

export function formatTraffic(traffic: { date: string; clicks: number; impressions: number }[], p: Period): string {
  if (traffic.length === 0) return `No traffic data found for ${period(p)}.`;

  const headers = ["Date", "Clicks", "Impressions"];
  const rows = traffic.map((t) => [t.date, num(t.clicks), num(t.impressions)]);

  const totalClicks = traffic.reduce((s, t) => s + t.clicks, 0);
  const totalImpressions = traffic.reduce((s, t) => s + t.impressions, 0);

  return (
    `Daily traffic, ${period(p)} (${traffic.length} days with data):\n` +
    `Total: ${num(totalClicks)} clicks, ${num(totalImpressions)} impressions\n\n` +
    formatTable(headers, rows)
  );
}

export function formatCrawls(crawls: CrawlRow[]): string {
  if (crawls.length === 0) return "No crawls yet.";

  const headers = ["Crawl ID", "Status", "Started", "Finished", "Pages", "Issues", "Health"];
  const rows = crawls.map((c) => [
    c.id,
    c.status,
    minute(c.startedAt),
    minute(c.finishedAt),
    num(c.pagesFound),
    num(c.issuesFound),
    c.healthScore != null ? `${c.healthScore}/100` : "-",
  ]);
  const failed = crawls.filter((c) => c.status === "FAILED" && c.error).map((c) => `${c.id}: ${c.error}`);

  return `${crawls.length} crawl(s), newest first:\n\n` + formatTable(headers, rows) + (failed.length ? `\n\nFailed:\n${failed.join("\n")}` : "");
}

export function formatCrawlIssues(result: {
  crawl: CrawlRow;
  total: number;
  bySeverity: Record<string, number>;
  /** Absent from instances that predate noindex handling (#105). */
  noindexPages?: number;
  /** Set when most fetched pages are noindex; absent from instances before 0.3.5. */
  noindexWarning?: { message: string } | null;
  issues: { severity: string; type: string; url: string; message: string }[];
}): string {
  const { crawl, total, bySeverity, noindexPages, noindexWarning, issues } = result;
  const noindex =
    (noindexWarning?.message ? `WARNING: ${noindexWarning.message} The health score leaves them out.\n` : "") +
    (noindexPages ? `${num(noindexPages)} noindex pages crawled but not scored (no issues, not in the health score)\n` : "");
  const head =
    `Crawl ${crawl.id} (${crawl.status}, finished ${minute(crawl.finishedAt)}, health ${crawl.healthScore ?? "-"}/100)\n` +
    `${num(total)} issues: ${num(bySeverity.CRITICAL ?? 0)} critical, ${num(bySeverity.WARNING ?? 0)} warning, ${num(bySeverity.INFO ?? 0)} info\n` +
    noindex +
    "\n";
  if (issues.length === 0) return head + "No crawl issues found.";

  const headers = ["Severity", "Type", "URL", "Message"];
  const rows = issues.map((i) => [
    i.severity,
    i.type,
    i.url.length > 40 ? i.url.slice(0, 37) + "..." : i.url,
    i.message.length > 50 ? i.message.slice(0, 47) + "..." : i.message,
  ]);

  return head + `Showing ${issues.length}:\n\n` + formatTable(headers, rows);
}

export function formatVitals(vitals: VitalsRow[]): string {
  if (vitals.length === 0) return "No vitals reports found.";

  const headers = ["Date", "Device", "Perf", "LCP", "CLS", "INP", "TTFB"];
  const rows = vitals.map((v) => [
    new Date(v.date).toISOString().slice(0, 10),
    v.device,
    v.perfScore != null ? String(v.perfScore) : "-",
    v.lcp != null ? `${v.lcp.toFixed(2)}s` : "-",
    v.cls != null ? v.cls.toFixed(3) : "-",
    v.inp != null ? `${v.inp.toFixed(0)}ms` : "-",
    v.ttfb != null ? `${v.ttfb.toFixed(2)}s` : "-",
  ]);

  return `${vitals.length} vitals reports:\n\n` + formatTable(headers, rows);
}

export function formatOpportunities(opportunities: Opportunities): string {
  const lines: string[] = [];
  const s = opportunities.summary;

  lines.push("SEO Opportunities Summary");
  lines.push(`Striking distance: ${s.strikingDistance} | Low CTR: ${s.lowCtr} | Content decay: ${s.contentDecay} | Cannibalization: ${s.cannibalization}`);
  lines.push("");

  if (opportunities.feed && opportunities.feed.length > 0) {
    const headers = ["Type", "Severity", "Title", "Detail"];
    const rows = opportunities.feed.map((o) => [
      o.type,
      o.severity,
      (o.title || "").length > 35 ? (o.title || "").slice(0, 32) + "..." : o.title || "",
      (o.detail || "").length > 55 ? (o.detail || "").slice(0, 52) + "..." : o.detail || "",
    ]);
    lines.push(formatTable(headers, rows));
  } else {
    lines.push("No actionable opportunities found.");
  }

  return lines.join("\n");
}
