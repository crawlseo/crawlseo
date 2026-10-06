#!/usr/bin/env tsx
/**
 * Seed the database with demo data for Quilltab (quilltab.app), a fictional
 * invoicing app. It is the same sample brand the crawlseo.cloud mock-ups use;
 * no real company appears in the data.
 *
 * Usage:
 *   npx tsx scripts/seed-demo.ts          # seed
 *   npx tsx scripts/seed-demo.ts --clean  # remove demo data only
 *
 * The script attaches to the first user it finds (you must be signed in
 * at least once). To target a specific user pass --email=you@example.com.
 */

import { IssueSeverity, IssueType, PrismaClient } from "@prisma/client";
import { gscDate } from "../lib/google/gsc-date";
import { REMEDIATION } from "../lib/crawler/remediation";
const db = new PrismaClient();

const DEMO_DOMAIN = "quilltab.app";
const DEMO_GSC = "sc-domain:quilltab.app";
// Sites created by earlier versions of this script, removed by --clean and before seeding.
const OLD_DEMO_DOMAINS = ["acme.com"];

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randf(min: number, max: number, decimals = 2) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}
function pick<T>(arr: T[]): T {
  return arr[rand(0, arr.length - 1)];
}
// Days of GSC history: the current 28-day period and the previous one.
const HISTORY_DAYS = 56;
// Traffic multiplier: today's level for the newest day, about 25% lower 56 days back.
function trend(day: number) {
  return 1 - (0.25 * day) / (HISTORY_DAYS - 1);
}
// Position drift: older days rank up to 0.6 places lower.
function drift(day: number) {
  return (0.6 * day) / (HISTORY_DAYS - 1);
}
// UTC midnight, the same convention the GSC sync writes (see gscDate).
function daysAgo(n: number) {
  const d = new Date(Date.now() - n * 86_400_000);
  return gscDate(d.toISOString().slice(0, 10));
}

// -------------------------------------------------------------------------
// Realistic data pools
// -------------------------------------------------------------------------

const KEYWORDS = [
  // Brand
  { q: "quilltab", posRange: [1, 2], clickRange: [80, 160], impRange: [900, 1400] },
  { q: "quilltab pricing", posRange: [1, 2], clickRange: [60, 120], impRange: [500, 800] },
  { q: "quilltab login", posRange: [1, 1], clickRange: [200, 400], impRange: [800, 1200] },
  { q: "quilltab reviews", posRange: [1, 4], clickRange: [30, 70], impRange: [250, 500] },
  { q: "quilltab invoice app", posRange: [1, 3], clickRange: [40, 90], impRange: [300, 600] },
  // Product / features
  { q: "best invoicing app for freelancers", posRange: [4, 12], clickRange: [15, 50], impRange: [400, 900] },
  { q: "invoice software comparison", posRange: [6, 15], clickRange: [10, 35], impRange: [500, 1100] },
  { q: "free invoice generator", posRange: [8, 20], clickRange: [5, 25], impRange: [600, 1300] },
  { q: "recurring invoices app", posRange: [3, 9], clickRange: [20, 55], impRange: [200, 500] },
  { q: "small business invoicing", posRange: [5, 14], clickRange: [12, 40], impRange: [350, 800] },
  { q: "invoice payment reminders", posRange: [3, 8], clickRange: [18, 45], impRange: [180, 400] },
  { q: "expense tracking for freelancers", posRange: [7, 18], clickRange: [8, 30], impRange: [300, 700] },
  { q: "time tracking and invoicing", posRange: [4, 11], clickRange: [14, 38], impRange: [220, 500] },
  { q: "online invoice with card payments", posRange: [5, 13], clickRange: [10, 32], impRange: [250, 550] },
  { q: "invoicing software", posRange: [9, 22], clickRange: [5, 18], impRange: [700, 1500] },
  // Long tail
  { q: "how to write an invoice as a freelancer", posRange: [3, 8], clickRange: [8, 22], impRange: [100, 250] },
  { q: "invoice template for designers", posRange: [2, 6], clickRange: [12, 30], impRange: [80, 200] },
  { q: "send invoice in another currency", posRange: [1, 3], clickRange: [15, 35], impRange: [60, 150] },
  { q: "freelance income report", posRange: [4, 10], clickRange: [10, 28], impRange: [150, 350] },
  { q: "invoice app ios android", posRange: [6, 15], clickRange: [6, 20], impRange: [180, 400] },
  { q: "late payment email wording", posRange: [2, 7], clickRange: [9, 25], impRange: [120, 280] },
  { q: "import clients from csv", posRange: [3, 9], clickRange: [7, 18], impRange: [90, 200] },
  { q: "cash flow forecast freelancer", posRange: [8, 19], clickRange: [4, 15], impRange: [250, 600] },
  { q: "quote to invoice conversion", posRange: [5, 12], clickRange: [11, 28], impRange: [160, 380] },
  { q: "automatic invoice follow up", posRange: [3, 8], clickRange: [13, 32], impRange: [100, 240] },
  // Informational
  { q: "what is an invoice number", posRange: [12, 30], clickRange: [2, 8], impRange: [800, 2000] },
  { q: "invoice vs receipt", posRange: [6, 16], clickRange: [5, 15], impRange: [200, 500] },
  { q: "vat on freelance invoices", posRange: [4, 10], clickRange: [8, 20], impRange: [120, 300] },
  { q: "invoice payment terms net 30", posRange: [3, 7], clickRange: [10, 28], impRange: [150, 350] },
  { q: "how to choose invoicing software", posRange: [5, 14], clickRange: [6, 18], impRange: [180, 420] },
  { q: "freelance invoicing checklist", posRange: [2, 6], clickRange: [12, 30], impRange: [80, 200] },
  { q: "hourly rate calculator freelance", posRange: [4, 11], clickRange: [7, 20], impRange: [100, 250] },
  { q: "getting paid faster as a freelancer", posRange: [8, 20], clickRange: [3, 12], impRange: [250, 600] },
  { q: "deposit invoice for projects", posRange: [6, 15], clickRange: [5, 16], impRange: [180, 400] },
  { q: "client payment habits", posRange: [10, 25], clickRange: [2, 9], impRange: [300, 700] },
  // Comparison (generic, no named competitors)
  { q: "invoicing app with time tracking", posRange: [2, 6], clickRange: [25, 60], impRange: [200, 450] },
  { q: "simple invoicing app", posRange: [1, 4], clickRange: [18, 45], impRange: [120, 300] },
  { q: "invoicing app for agencies", posRange: [3, 7], clickRange: [15, 38], impRange: [100, 250] },
  { q: "spreadsheet invoice alternative", posRange: [5, 12], clickRange: [8, 25], impRange: [200, 500] },
  { q: "cheapest invoicing software 2026", posRange: [4, 10], clickRange: [10, 28], impRange: [150, 350] },
  // Support / docs
  { q: "quilltab api documentation", posRange: [1, 2], clickRange: [30, 70], impRange: [100, 200] },
  { q: "quilltab webhook setup", posRange: [1, 3], clickRange: [15, 35], impRange: [50, 120] },
  { q: "quilltab bank feed", posRange: [1, 3], clickRange: [12, 28], impRange: [60, 140] },
  { q: "quilltab custom invoice fields", posRange: [1, 2], clickRange: [18, 40], impRange: [70, 160] },
  { q: "quilltab bulk import clients", posRange: [1, 3], clickRange: [10, 25], impRange: [40, 100] },
  { q: "quilltab team permissions", posRange: [1, 2], clickRange: [8, 20], impRange: [30, 80] },
  { q: "quilltab payment links", posRange: [1, 4], clickRange: [14, 32], impRange: [80, 180] },
  { q: "quilltab mobile app", posRange: [1, 3], clickRange: [20, 50], impRange: [100, 250] },
  { q: "quilltab tax reports", posRange: [1, 3], clickRange: [12, 28], impRange: [60, 150] },
  { q: "invoicing best practices 2026", posRange: [5, 13], clickRange: [6, 18], impRange: [140, 320] },
];

const PAGES = [
  { path: "/", title: "Quilltab · Invoicing for freelancers" },
  { path: "/pricing", title: "Pricing · Quilltab" },
  { path: "/features", title: "Features · Quilltab" },
  { path: "/features/recurring-invoices", title: "Recurring invoices · Quilltab" },
  { path: "/features/payments", title: "Card and bank payments · Quilltab" },
  { path: "/features/reports", title: "Reports and tax summaries · Quilltab" },
  { path: "/features/reminders", title: "Payment reminders · Quilltab" },
  { path: "/blog", title: "Blog · Quilltab" },
  { path: "/blog/freelance-invoice-guide", title: "How to write a freelance invoice" },
  { path: "/blog/late-payment-emails", title: "Late payment emails that get answered" },
  { path: "/blog/payment-terms", title: "Payment terms, explained" },
  { path: "/blog/vat-for-freelancers", title: "VAT for freelancers: a short guide" },
  { path: "/blog/invoice-templates", title: "12 invoice templates for creative work" },
  { path: "/compare/spreadsheets", title: "Quilltab vs spreadsheets · Quilltab" },
  { path: "/compare/accounting-suites", title: "Quilltab vs accounting suites · Quilltab" },
  { path: "/compare/time-trackers", title: "Quilltab vs time trackers · Quilltab" },
  { path: "/docs", title: "Documentation · Quilltab" },
  { path: "/docs/api", title: "API reference · Quilltab" },
  { path: "/integrations", title: "Integrations · Quilltab" },
  { path: "/about", title: "About · Quilltab" },
];

// Issues as the crawler writes them: details carries the remediation text, and
// orphan / not-in-sitemap rows carry their details.kind. Sample data only.
const CRAWL_ISSUES: {
  path: string;
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  kind?: "orphan" | "not_in_sitemap";
}[] = [
  // CRITICAL (5)
  { path: "/old-landing", type: "BROKEN_LINK", severity: "CRITICAL", message: "Listed in sitemap.xml and returns 404 Not Found" },
  { path: "/promo/summer-2025", type: "BROKEN_LINK", severity: "CRITICAL", message: "Linked from /pricing and returns 404 Not Found" },
  { path: "/features/legacy", type: "BROKEN_LINK", severity: "CRITICAL", message: "Page returns 410 Gone" },
  { path: "/blog/outdated-post", type: "REDIRECT", severity: "CRITICAL", message: "Redirect chain (3 hops): /blog/outdated-post → /blog/old → /blog/new → /blog/freelance-invoice-guide" },
  { path: "/compare/time-trackers", type: "MISSING_TITLE", severity: "CRITICAL", message: "Page has no <title> element" },
  // WARNING (9)
  { path: "/blog/invoice-templates", type: "MISSING_DESCRIPTION", severity: "WARNING", message: "Meta description is empty (content=\"\")" },
  { path: "/", type: "LARGE_PAGE", severity: "WARNING", message: "Heavy image: hero.gif is 8.4 MB (1920×1440)" },
  { path: "/integrations", type: "DUPLICATE_TITLE", severity: "WARNING", message: "Title duplicated with /features page" },
  { path: "/about", type: "MISSING_H1", severity: "WARNING", message: "Page has no H1 heading tag" },
  { path: "/docs/api", type: "MULTIPLE_H1", severity: "WARNING", message: "Page has 3 H1 tags, should have exactly one" },
  { path: "/blog/late-payment-emails", type: "MISSING_ALT", severity: "WARNING", message: "4 images missing alt text" },
  { path: "/features/reports", type: "SLOW_PAGE", severity: "WARNING", message: "Page load time is 4.2s (threshold: 3s)" },
  { path: "/compare/spreadsheets", type: "MISSING_CANONICAL", severity: "WARNING", message: "Page is missing canonical tag" },
  { path: "/blog/payment-terms", type: "MISSING_CANONICAL", severity: "WARNING", message: "Potential orphan page (no internal inlinks found)", kind: "orphan" },
  // INFO (5)
  { path: "/", type: "MISSING_SCHEMA", severity: "INFO", message: "No structured data (JSON-LD) found on page" },
  { path: "/pricing", type: "MISSING_SCHEMA", severity: "INFO", message: "No structured data (JSON-LD) found on page" },
  { path: "/blog", type: "LARGE_PAGE", severity: "INFO", message: "Page size is 3.4 MB (threshold: 3 MB)" },
  { path: "/docs", type: "MIXED_CONTENT", severity: "INFO", message: "1 HTTP resource loaded on HTTPS page: http://cdn.example.org/legacy.js" },
  { path: "/features/payments", type: "MISSING_SITEMAP", severity: "INFO", message: "Crawled page not listed in sitemap", kind: "not_in_sitemap" },
];
// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------

async function clean() {
  // Find and delete demo site by domain pattern
  const sites = await db.site.findMany({
    where: { domain: { in: [DEMO_DOMAIN, ...OLD_DEMO_DOMAINS] } },
  });
  if (sites.length === 0) {
    console.log("No demo site found, nothing to clean.");
    return;
  }
  for (const site of sites) {
    await db.site.delete({ where: { id: site.id } });
    console.log(`Deleted demo site ${site.domain} (${site.id}) and all related data.`);
  }
}

async function seed() {
  const args = process.argv.slice(2);
  const emailFlag = args.find((a) => a.startsWith("--email="));
  const email = emailFlag?.split("=")[1];

  // Resolve user
  const user = email
    ? await db.user.findUnique({ where: { email } })
    : await db.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    console.error("No user found. Sign in at least once before seeding.");
    process.exit(1);
  }
  console.log(`Seeding demo data for user: ${user.email} (${user.id})`);

  // Clean existing demo data first
  await clean();

  // 1. Create site
  const site = await db.site.create({
    data: {
      userId: user.id,
      domain: DEMO_DOMAIN,
      gscProperty: DEMO_GSC,
    },
  });
  console.log(`Created site: ${site.domain} (${site.id})`);

  // 2. Seed keywords: two 28-day periods, so the overview compares the last
  // 28 days with a realistic previous 28. Older days carry slightly less
  // traffic and slightly worse positions (a gentle upward trend).
  const keywordRows = [];
  for (const kw of KEYWORDS) {
    for (let day = 0; day < HISTORY_DAYS; day++) {
      const f = trend(day);
      const pos = Math.max(1, randf(kw.posRange[0], kw.posRange[1], 1) + drift(day));
      const imps = Math.round(rand(kw.impRange[0], kw.impRange[1]) * f);
      const clicks = Math.min(Math.round(rand(kw.clickRange[0], kw.clickRange[1]) * f), imps);
      keywordRows.push({
        siteId: site.id,
        query: kw.q,
        date: daysAgo(day + 3), // 3-day data lag
        clicks,
        impressions: imps,
        ctr: imps > 0 ? parseFloat((clicks / imps).toFixed(4)) : 0,
        position: parseFloat(pos.toFixed(1)),
        page: `https://${DEMO_DOMAIN}${pick(PAGES).path}`,
        device: pick(["DESKTOP", "MOBILE"]),
        country: "USA",
      });
    }
  }
  await db.keyword.createMany({ data: keywordRows });
  console.log(`Created ${keywordRows.length} keyword records (${KEYWORDS.length} keywords × ${HISTORY_DAYS} days)`);

  // 3. Seed pages, same two periods
  const pageRows = [];
  for (const pg of PAGES) {
    for (let day = 0; day < HISTORY_DAYS; day++) {
      const f = trend(day);
      const isHome = pg.path === "/";
      const clicks = Math.round((isHome ? rand(120, 300) : rand(5, 80)) * f);
      const imps = clicks + Math.round(rand(50, 500) * f);
      const pos = Math.max(1, (isHome ? randf(2, 8, 1) : randf(3, 25, 1)) + drift(day));
      pageRows.push({
        siteId: site.id,
        url: `https://${DEMO_DOMAIN}${pg.path}`,
        date: daysAgo(day + 3),
        clicks,
        impressions: imps,
        ctr: parseFloat((clicks / imps).toFixed(4)),
        position: parseFloat(pos.toFixed(1)),
      });
    }
  }
  await db.page.createMany({ data: pageRows });
  console.log(`Created ${pageRows.length} page records (${PAGES.length} pages × ${HISTORY_DAYS} days)`);

  // 4. Saved keywords
  const savedQueries = [
    { q: "best invoicing app for freelancers", notes: "High intent: target with a comparison page" },
    { q: "simple invoicing app", notes: "Keep in the top 3" },
    { q: "invoice software comparison", notes: "Striking distance: currently pos 8 to 15" },
    { q: "small business invoicing", notes: "Volume keyword, optimise the /features page" },
    { q: "free invoice generator", notes: "High volume, low position: a dedicated landing page?" },
  ];
  for (const sk of savedQueries) {
    await db.savedKeyword.create({
      data: { siteId: site.id, query: sk.q, notes: sk.notes },
    });
  }
  console.log(`Created ${savedQueries.length} saved keywords`);

  // 5. Crawl + audit pages + issues
  const crawl = await db.crawl.create({
    data: {
      siteId: site.id,
      status: "COMPLETED",
      startedAt: daysAgo(1),
      finishedAt: new Date(daysAgo(1).getTime() + 47_000), // 47 seconds
      pagesFound: 42,
      issuesFound: CRAWL_ISSUES.length,
      healthScore: 72,
      maxPages: 200,
    },
  });

  // Audit pages for every page in PAGES
  for (const pg of PAGES) {
    const url = `https://${DEMO_DOMAIN}${pg.path}`;
    await db.auditPage.create({
      data: {
        crawlId: crawl.id,
        url,
        statusCode: 200,
        title: pg.path === "/compare/time-trackers" ? null : pg.title,
        description: pg.path === "/blog/invoice-templates" ? "" : pg.path === "/" ? "Quilltab sends invoices, chases late payments and keeps your freelance books tidy." : `Learn about ${pg.title.split("·")[0].trim().toLowerCase()} at Quilltab.`,
        canonical: url,
        h1Count: pg.path === "/about" ? 0 : pg.path === "/docs/api" ? 3 : 1,
        h1s: pg.path === "/about" ? [] : pg.path === "/docs/api" ? [pg.title, "Authentication", "Endpoints"] : [pg.title.split("·")[0].trim()],
        wordCount: rand(300, 2800),
        imageCount: rand(1, 12),
        imagesMissingAlt: pg.path === "/blog/late-payment-emails" ? 4 : rand(0, 1),
        internalLinks: rand(8, 35),
        externalLinks: rand(0, 6),
        hasSchema: ["/", "/blog/freelance-invoice-guide", "/blog/late-payment-emails"].includes(pg.path),
        contentScore: rand(55, 95),
        responseTimeMs: pg.path === "/features/reports" ? 4200 : rand(120, 900),
        byteSize: pg.path === "/blog" ? 3_400_000 : rand(30_000, 450_000),
        indexable: true,
      },
    });
  }

  // Add a few extra crawled pages for broken links
  for (const extra of ["/old-landing", "/promo/summer-2025", "/features/legacy", "/blog/outdated-post"]) {
    const code = extra === "/features/legacy" ? 410 : extra === "/blog/outdated-post" ? 301 : 404;
    await db.auditPage.create({
      data: {
        crawlId: crawl.id,
        url: `https://${DEMO_DOMAIN}${extra}`,
        statusCode: code,
        redirectUrl: code === 301 ? `https://${DEMO_DOMAIN}/blog/old` : undefined,
        title: null,
        wordCount: 0,
        contentScore: 0,
        responseTimeMs: rand(50, 200),
        byteSize: rand(500, 2000),
        indexable: false,
      },
    });
  }

  // Crawl issues, with details shaped like the crawler's
  for (const issue of CRAWL_ISSUES) {
    await db.crawlIssue.create({
      data: {
        crawlId: crawl.id,
        url: `https://${DEMO_DOMAIN}${issue.path}`,
        type: issue.type,
        severity: issue.severity,
        message: issue.message,
        details:
          issue.kind === "orphan"
            ? { kind: "orphan", contentScore: rand(30, 50) }
            : {
                ...(issue.kind ? { kind: issue.kind } : {}),
                howToFix: REMEDIATION[issue.type]?.howToFix ?? null,
              },
      },
    });
  }

  // The crawler's own bookkeeping rows (details.kind crawl_summary and
  // content_score). The app never lists or counts them as issues.
  await db.crawlIssue.create({
    data: {
      crawlId: crawl.id,
      url: `https://${DEMO_DOMAIN}/`,
      type: "MISSING_SCHEMA",
      severity: "INFO",
      message: "Crawl summary",
      details: { kind: "crawl_summary", sitemapUrls: 21, missingFromSitemap: 1, orphans: 1, avgContentScore: 71 },
    },
  });
  for (const path of ["/blog", "/about", "/blog/vat-for-freelancers"]) {
    await db.crawlIssue.create({
      data: {
        crawlId: crawl.id,
        url: `https://${DEMO_DOMAIN}${path}`,
        type: "MISSING_DESCRIPTION",
        severity: "INFO",
        message: `On-page content score ${rand(50, 59)}/100`,
        details: { kind: "content_score", contentScore: rand(50, 59) },
      },
    });
  }
  console.log(`Created crawl (health: 72/100) with ${PAGES.length + 4} audit pages, ${CRAWL_ISSUES.length} issues and 4 internal rows`);

  // 6. Some audit links
  const linkPairs = [
    { from: "/", to: "/pricing" },
    { from: "/", to: "/features" },
    { from: "/", to: "/blog" },
    { from: "/pricing", to: "/features" },
    { from: "/blog", to: "/blog/freelance-invoice-guide" },
    { from: "/blog", to: "/blog/late-payment-emails" },
    { from: "/blog/freelance-invoice-guide", to: "/features" },
    { from: "/blog/freelance-invoice-guide", to: "/pricing" },
    { from: "/features", to: "/features/recurring-invoices" },
    { from: "/features", to: "/features/payments" },
    { from: "/compare/spreadsheets", to: "/pricing" },
    { from: "/blog/late-payment-emails", to: "/compare/spreadsheets" },
    // External links (reserved example domains, no real companies)
    { from: "/blog/freelance-invoice-guide", to: "https://www.example.org/invoice-basics" },
    { from: "/integrations", to: "https://www.example.net/apps/quilltab" },
  ];
  for (const lp of linkPairs) {
    const isInternal = lp.to.startsWith("/");
    await db.auditLink.create({
      data: {
        crawlId: crawl.id,
        sourceUrl: `https://${DEMO_DOMAIN}${lp.from}`,
        targetUrl: isInternal ? `https://${DEMO_DOMAIN}${lp.to}` : lp.to,
        anchorText: isInternal ? PAGES.find((p) => p.path === lp.to)?.title?.split("·")[0].trim() ?? "Link" : "External resource",
        isInternal,
        isNofollow: !isInternal,
        statusCode: 200,
      },
    });
  }
  console.log(`Created ${linkPairs.length} audit links`);

  // 7. Core Web Vitals: 4 reports (mobile + desktop, 2 dates)
  const vitalsPages = ["/", "/pricing", "/blog/freelance-invoice-guide", "/features"];
  let vitalsCount = 0;
  for (const vp of vitalsPages) {
    for (const device of ["MOBILE", "DESKTOP"]) {
      for (let week = 0; week < 3; week++) {
        const isMobile = device === "MOBILE";
        await db.vitalsReport.create({
          data: {
            siteId: site.id,
            url: `https://${DEMO_DOMAIN}${vp}`,
            device,
            date: daysAgo(week * 7),
            lcp: isMobile ? randf(1.8, 3.2) : randf(1.2, 2.4),
            fid: isMobile ? randf(80, 180) : randf(30, 90),
            cls: randf(0.02, 0.18),
            inp: isMobile ? randf(150, 350) : randf(80, 200),
            perfScore: isMobile ? rand(55, 82) : rand(75, 98),
            speedIndex: isMobile ? randf(2.5, 5.0) : randf(1.5, 3.0),
            ttfb: randf(0.15, 0.65),
          },
        });
        vitalsCount++;
      }
    }
  }
  console.log(`Created ${vitalsCount} vitals reports`);

  // 8. Alerts
  await db.alert.create({
    data: {
      userId: user.id,
      siteId: site.id,
      type: "TRAFFIC_DROP",
      channel: "EMAIL",
      config: { threshold: 20, period: 7 },
      enabled: true,
    },
  });
  await db.alert.create({
    data: {
      userId: user.id,
      siteId: site.id,
      type: "CRAWL_ISSUES",
      channel: "SLACK",
      config: { severity: "CRITICAL" },
      enabled: true,
    },
  });
  console.log("Created 2 alert rules");

  console.log("\nDemo seed complete. Open the site in the app to see the data.");
}

// -------------------------------------------------------------------------
// Entry point
// -------------------------------------------------------------------------

async function main() {
  const isClean = process.argv.includes("--clean");

  if (isClean) {
    await clean();
  } else {
    await seed();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
