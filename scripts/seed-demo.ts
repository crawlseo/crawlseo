#!/usr/bin/env tsx
/**
 * Seed the database with realistic demo data for "acme.com".
 *
 * Usage:
 *   npx tsx scripts/seed-demo.ts          # seed
 *   npx tsx scripts/seed-demo.ts --clean  # remove demo data only
 *
 * The script attaches to the first user it finds (you must be signed in
 * at least once). To target a specific user pass --email=you@example.com.
 */

import { PrismaClient } from "@prisma/client";
import { gscDate } from "../lib/google/gsc-date";
const db = new PrismaClient();

const DEMO_DOMAIN = "acme.com";
const DEMO_GSC = "sc-domain:acme.com";

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
// UTC midnight, the same convention the GSC sync writes (see gscDate).
function daysAgo(n: number) {
  const d = new Date(Date.now() - n * 86_400_000);
  return gscDate(d.toISOString().slice(0, 10));
}

// -------------------------------------------------------------------------
// Realistic data pools
// -------------------------------------------------------------------------

const KEYWORDS = [
  // High intent / brand
  { q: "acme crm software", posRange: [1, 3], clickRange: [80, 160], impRange: [900, 1400] },
  { q: "acme pricing", posRange: [1, 2], clickRange: [60, 120], impRange: [500, 800] },
  { q: "acme vs salesforce", posRange: [2, 5], clickRange: [40, 90], impRange: [300, 600] },
  { q: "acme login", posRange: [1, 1], clickRange: [200, 400], impRange: [800, 1200] },
  { q: "acme reviews", posRange: [1, 4], clickRange: [30, 70], impRange: [250, 500] },
  // Product / features
  { q: "best crm for startups", posRange: [4, 12], clickRange: [15, 50], impRange: [400, 900] },
  { q: "crm software comparison", posRange: [6, 15], clickRange: [10, 35], impRange: [500, 1100] },
  { q: "free crm tools", posRange: [8, 20], clickRange: [5, 25], impRange: [600, 1300] },
  { q: "crm with email integration", posRange: [3, 9], clickRange: [20, 55], impRange: [200, 500] },
  { q: "small business crm", posRange: [5, 14], clickRange: [12, 40], impRange: [350, 800] },
  { q: "crm pipeline management", posRange: [3, 8], clickRange: [18, 45], impRange: [180, 400] },
  { q: "sales automation software", posRange: [7, 18], clickRange: [8, 30], impRange: [300, 700] },
  { q: "contact management tool", posRange: [4, 11], clickRange: [14, 38], impRange: [220, 500] },
  { q: "lead tracking software", posRange: [5, 13], clickRange: [10, 32], impRange: [250, 550] },
  { q: "customer relationship management", posRange: [9, 22], clickRange: [5, 18], impRange: [700, 1500] },
  // Long tail
  { q: "how to set up crm for small team", posRange: [3, 8], clickRange: [8, 22], impRange: [100, 250] },
  { q: "crm integrations with slack", posRange: [2, 6], clickRange: [12, 30], impRange: [80, 200] },
  { q: "migrate from hubspot to acme", posRange: [1, 3], clickRange: [15, 35], impRange: [60, 150] },
  { q: "crm reporting dashboard", posRange: [4, 10], clickRange: [10, 28], impRange: [150, 350] },
  { q: "crm mobile app ios android", posRange: [6, 15], clickRange: [6, 20], impRange: [180, 400] },
  { q: "deal pipeline stages best practices", posRange: [2, 7], clickRange: [9, 25], impRange: [120, 280] },
  { q: "crm data import csv", posRange: [3, 9], clickRange: [7, 18], impRange: [90, 200] },
  { q: "sales forecasting tools", posRange: [8, 19], clickRange: [4, 15], impRange: [250, 600] },
  { q: "crm email templates", posRange: [5, 12], clickRange: [11, 28], impRange: [160, 380] },
  { q: "automated follow up emails crm", posRange: [3, 8], clickRange: [13, 32], impRange: [100, 240] },
  // Informational
  { q: "what is a crm", posRange: [12, 30], clickRange: [2, 8], impRange: [800, 2000] },
  { q: "crm benefits for small business", posRange: [6, 16], clickRange: [5, 15], impRange: [200, 500] },
  { q: "crm implementation guide", posRange: [4, 10], clickRange: [8, 20], impRange: [120, 300] },
  { q: "crm vs spreadsheet", posRange: [3, 7], clickRange: [10, 28], impRange: [150, 350] },
  { q: "how to choose a crm", posRange: [5, 14], clickRange: [6, 18], impRange: [180, 420] },
  { q: "crm onboarding checklist", posRange: [2, 6], clickRange: [12, 30], impRange: [80, 200] },
  { q: "crm roi calculator", posRange: [4, 11], clickRange: [7, 20], impRange: [100, 250] },
  { q: "sales team productivity tips", posRange: [8, 20], clickRange: [3, 12], impRange: [250, 600] },
  { q: "b2b sales funnel stages", posRange: [6, 15], clickRange: [5, 16], impRange: [180, 400] },
  { q: "customer retention strategies", posRange: [10, 25], clickRange: [2, 9], impRange: [300, 700] },
  // Competitor comparison
  { q: "acme vs hubspot", posRange: [2, 6], clickRange: [25, 60], impRange: [200, 450] },
  { q: "acme vs pipedrive", posRange: [1, 4], clickRange: [18, 45], impRange: [120, 300] },
  { q: "acme vs zoho crm", posRange: [3, 7], clickRange: [15, 38], impRange: [100, 250] },
  { q: "crm alternatives to salesforce", posRange: [5, 12], clickRange: [8, 25], impRange: [200, 500] },
  { q: "cheapest crm software 2026", posRange: [4, 10], clickRange: [10, 28], impRange: [150, 350] },
  // Support / docs
  { q: "acme api documentation", posRange: [1, 2], clickRange: [30, 70], impRange: [100, 200] },
  { q: "acme webhook setup", posRange: [1, 3], clickRange: [15, 35], impRange: [50, 120] },
  { q: "acme zapier integration", posRange: [1, 3], clickRange: [12, 28], impRange: [60, 140] },
  { q: "acme custom fields", posRange: [1, 2], clickRange: [18, 40], impRange: [70, 160] },
  { q: "acme bulk import contacts", posRange: [1, 3], clickRange: [10, 25], impRange: [40, 100] },
  { q: "acme team permissions", posRange: [1, 2], clickRange: [8, 20], impRange: [30, 80] },
  { q: "acme email tracking", posRange: [1, 4], clickRange: [14, 32], impRange: [80, 180] },
  { q: "acme mobile app", posRange: [1, 3], clickRange: [20, 50], impRange: [100, 250] },
  { q: "acme reporting features", posRange: [1, 3], clickRange: [12, 28], impRange: [60, 150] },
  { q: "crm best practices 2026", posRange: [5, 13], clickRange: [6, 18], impRange: [140, 320] },
];

const PAGES = [
  { path: "/", title: "Acme CRM — The simple CRM for growing teams" },
  { path: "/pricing", title: "Pricing — Acme CRM" },
  { path: "/features", title: "Features — Acme CRM" },
  { path: "/features/pipeline", title: "Pipeline Management — Acme CRM" },
  { path: "/features/email", title: "Email Integration — Acme CRM" },
  { path: "/features/reporting", title: "Reporting & Analytics — Acme CRM" },
  { path: "/features/automation", title: "Sales Automation — Acme CRM" },
  { path: "/blog", title: "Blog — Acme CRM" },
  { path: "/blog/crm-for-startups", title: "Why Every Startup Needs a CRM in 2026" },
  { path: "/blog/hubspot-alternative", title: "5 Reasons to Switch from HubSpot" },
  { path: "/blog/sales-pipeline-guide", title: "The Complete Sales Pipeline Guide" },
  { path: "/blog/crm-implementation", title: "CRM Implementation: A Step-by-Step Guide" },
  { path: "/blog/email-templates", title: "20 Sales Email Templates That Convert" },
  { path: "/compare/salesforce", title: "Acme vs Salesforce — CRM Comparison" },
  { path: "/compare/hubspot", title: "Acme vs HubSpot — CRM Comparison" },
  { path: "/compare/pipedrive", title: "Acme vs Pipedrive — CRM Comparison" },
  { path: "/docs", title: "Documentation — Acme CRM" },
  { path: "/docs/api", title: "API Reference — Acme CRM" },
  { path: "/integrations", title: "Integrations — Acme CRM" },
  { path: "/about", title: "About Us — Acme CRM" },
];

const CRAWL_ISSUES: {
  path: string;
  type: string;
  severity: string;
  message: string;
}[] = [
  // CRITICAL (4)
  { path: "/old-landing", type: "BROKEN_LINK", severity: "CRITICAL", message: "Page returns 404 Not Found" },
  { path: "/promo/summer-2024", type: "BROKEN_LINK", severity: "CRITICAL", message: "Page returns 404 Not Found" },
  { path: "/blog/outdated-post", type: "REDIRECT", severity: "CRITICAL", message: "Redirect chain detected (3 hops): /blog/outdated-post → /blog/old → /blog/new → /blog/crm-for-startups" },
  { path: "/features/legacy", type: "BROKEN_LINK", severity: "CRITICAL", message: "Page returns 410 Gone" },
  // WARNING (7)
  { path: "/blog/email-templates", type: "MISSING_DESCRIPTION", severity: "WARNING", message: "Page is missing meta description" },
  { path: "/integrations", type: "DUPLICATE_TITLE", severity: "WARNING", message: "Title duplicated with /features page" },
  { path: "/about", type: "MISSING_H1", severity: "WARNING", message: "Page has no H1 heading tag" },
  { path: "/docs/api", type: "MULTIPLE_H1", severity: "WARNING", message: "Page has 3 H1 tags — should have exactly one" },
  { path: "/blog/sales-pipeline-guide", type: "MISSING_ALT", severity: "WARNING", message: "4 images missing alt text" },
  { path: "/features/reporting", type: "SLOW_PAGE", severity: "WARNING", message: "Page load time is 4.2s (threshold: 3s)" },
  { path: "/compare/salesforce", type: "MISSING_CANONICAL", severity: "WARNING", message: "Page is missing canonical tag" },
  // INFO (4)
  { path: "/", type: "MISSING_SCHEMA", severity: "INFO", message: "No structured data (JSON-LD) found on page" },
  { path: "/pricing", type: "MISSING_SCHEMA", severity: "INFO", message: "No structured data (JSON-LD) found on page" },
  { path: "/blog", type: "LARGE_PAGE", severity: "INFO", message: "Page size is 3.4 MB (threshold: 3 MB)" },
  { path: "/docs", type: "MIXED_CONTENT", severity: "INFO", message: "1 HTTP resource loaded on HTTPS page: http://cdn.example.com/legacy.js" },
];

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------

async function clean() {
  // Find and delete demo site by domain pattern
  const sites = await db.site.findMany({ where: { domain: DEMO_DOMAIN } });
  if (sites.length === 0) {
    console.log("No demo site found — nothing to clean.");
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

  // 2. Seed keywords — 28 days of data for each keyword
  let kwCount = 0;
  for (const kw of KEYWORDS) {
    for (let day = 0; day < 28; day++) {
      const date = daysAgo(day + 3); // 3-day data lag
      const pos = randf(kw.posRange[0], kw.posRange[1], 1);
      const imps = rand(kw.impRange[0], kw.impRange[1]);
      const clicks = Math.min(rand(kw.clickRange[0], kw.clickRange[1]), imps);
      const ctr = imps > 0 ? parseFloat((clicks / imps).toFixed(4)) : 0;
      const page = `https://acme.com${pick(PAGES).path}`;

      await db.keyword.create({
        data: {
          siteId: site.id,
          query: kw.q,
          date,
          clicks,
          impressions: imps,
          ctr,
          position: pos,
          page,
          device: pick(["DESKTOP", "MOBILE"]),
          country: "USA",
        },
      });
      kwCount++;
    }
  }
  console.log(`Created ${kwCount} keyword records (${KEYWORDS.length} keywords × 28 days)`);

  // 3. Seed pages — 28 days of data
  let pgCount = 0;
  for (const pg of PAGES) {
    for (let day = 0; day < 28; day++) {
      const date = daysAgo(day + 3);
      const isHome = pg.path === "/";
      const clicks = isHome ? rand(120, 300) : rand(5, 80);
      const imps = clicks + rand(50, 500);
      const ctr = parseFloat((clicks / imps).toFixed(4));
      const pos = isHome ? randf(2, 8, 1) : randf(3, 25, 1);

      await db.page.create({
        data: {
          siteId: site.id,
          url: `https://acme.com${pg.path}`,
          date,
          clicks,
          impressions: imps,
          ctr,
          position: pos,
        },
      });
      pgCount++;
    }
  }
  console.log(`Created ${pgCount} page records (${PAGES.length} pages × 28 days)`);

  // 4. Saved keywords
  const savedQueries = [
    { q: "best crm for startups", notes: "High intent — target with comparison page" },
    { q: "acme vs hubspot", notes: "Competitor comparison, keep in top 3" },
    { q: "crm software comparison", notes: "Striking distance — currently pos 8-15" },
    { q: "small business crm", notes: "Volume keyword, optimise /features page" },
    { q: "free crm tools", notes: "High volume, low position — create dedicated landing page?" },
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
    const url = `https://acme.com${pg.path}`;
    await db.auditPage.create({
      data: {
        crawlId: crawl.id,
        url,
        statusCode: 200,
        title: pg.title,
        description: pg.path === "/" ? "Acme CRM helps growing teams close more deals with less effort." : `Learn about ${pg.title.split("—")[0].trim().toLowerCase()} at Acme CRM.`,
        canonical: url,
        h1Count: pg.path === "/about" ? 0 : pg.path === "/docs/api" ? 3 : 1,
        h1s: pg.path === "/about" ? [] : pg.path === "/docs/api" ? [pg.title, "Authentication", "Endpoints"] : [pg.title.split("—")[0].trim()],
        wordCount: rand(300, 2800),
        imageCount: rand(1, 12),
        imagesMissingAlt: pg.path === "/blog/sales-pipeline-guide" ? 4 : rand(0, 1),
        internalLinks: rand(8, 35),
        externalLinks: rand(0, 6),
        hasSchema: ["/", "/blog/crm-for-startups", "/blog/sales-pipeline-guide"].includes(pg.path),
        contentScore: rand(55, 95),
        responseTimeMs: pg.path === "/features/reporting" ? 4200 : rand(120, 900),
        byteSize: pg.path === "/blog" ? 3_400_000 : rand(30_000, 450_000),
        indexable: true,
      },
    });
  }

  // Add a few extra crawled pages for broken links
  for (const extra of ["/old-landing", "/promo/summer-2024", "/features/legacy", "/blog/outdated-post"]) {
    const code = extra === "/features/legacy" ? 410 : extra === "/blog/outdated-post" ? 301 : 404;
    await db.auditPage.create({
      data: {
        crawlId: crawl.id,
        url: `https://acme.com${extra}`,
        statusCode: code,
        redirectUrl: code === 301 ? "https://acme.com/blog/old" : undefined,
        title: null,
        wordCount: 0,
        contentScore: 0,
        responseTimeMs: rand(50, 200),
        byteSize: rand(500, 2000),
        indexable: false,
      },
    });
  }

  // Crawl issues
  for (const issue of CRAWL_ISSUES) {
    await db.crawlIssue.create({
      data: {
        crawlId: crawl.id,
        url: `https://acme.com${issue.path}`,
        type: issue.type as any,
        severity: issue.severity as any,
        message: issue.message,
      },
    });
  }
  console.log(`Created crawl (health: 72/100) with ${PAGES.length + 4} audit pages and ${CRAWL_ISSUES.length} issues`);

  // 6. Some audit links
  const linkPairs = [
    { from: "/", to: "/pricing" },
    { from: "/", to: "/features" },
    { from: "/", to: "/blog" },
    { from: "/pricing", to: "/features" },
    { from: "/blog", to: "/blog/crm-for-startups" },
    { from: "/blog", to: "/blog/hubspot-alternative" },
    { from: "/blog/crm-for-startups", to: "/features" },
    { from: "/blog/crm-for-startups", to: "/pricing" },
    { from: "/features", to: "/features/pipeline" },
    { from: "/features", to: "/features/email" },
    { from: "/compare/hubspot", to: "/pricing" },
    { from: "/blog/hubspot-alternative", to: "/compare/hubspot" },
    // External links
    { from: "/blog/crm-for-startups", to: "https://www.gartner.com/reviews/market/crm" },
    { from: "/integrations", to: "https://zapier.com/apps/acme-crm" },
  ];
  for (const lp of linkPairs) {
    const isInternal = lp.to.startsWith("/");
    await db.auditLink.create({
      data: {
        crawlId: crawl.id,
        sourceUrl: `https://acme.com${lp.from}`,
        targetUrl: isInternal ? `https://acme.com${lp.to}` : lp.to,
        anchorText: isInternal ? PAGES.find((p) => p.path === lp.to)?.title?.split("—")[0].trim() ?? "Link" : "External resource",
        isInternal,
        isNofollow: !isInternal,
        statusCode: 200,
      },
    });
  }
  console.log(`Created ${linkPairs.length} audit links`);

  // 7. Core Web Vitals — 4 reports (mobile + desktop, 2 dates)
  const vitalsPages = ["/", "/pricing", "/blog/crm-for-startups", "/features"];
  let vitalsCount = 0;
  for (const vp of vitalsPages) {
    for (const device of ["MOBILE", "DESKTOP"]) {
      for (let week = 0; week < 3; week++) {
        const isMobile = device === "MOBILE";
        await db.vitalsReport.create({
          data: {
            siteId: site.id,
            url: `https://acme.com${vp}`,
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

  console.log("\n✅ Demo seed complete! Visit your site to see the data.");
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
