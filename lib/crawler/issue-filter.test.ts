import { Prisma, type PrismaClient, type IssueSeverity, type IssueType } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/lib/testing/pglite";
import {
  countVisibleIssues,
  getVisibleIssues,
  listVisibleIssues,
  visibleIssueFilter,
} from "./issue-filter";

// Runs the real Prisma client against Postgres semantics (PGlite, see
// lib/testing/pglite.ts). Mocks would hide the bug in #55, which lives in how
// Postgres treats a comparison with a missing JSON key.

let t: TestDb;
let db: PrismaClient;

type Row = [id: string, severity: IssueSeverity, details: Prisma.InputJsonValue | typeof Prisma.DbNull];

// One crawl with every details shape the crawler and the demo seed write.
const ROWS: Row[] = [
  ["no-details", "CRITICAL", Prisma.DbNull], // demo seed rows, older crawls
  ["fix-only", "WARNING", { howToFix: "Add one H1." }], // most engine issues
  ["empty", "INFO", {}], // engine issue with no remediation entry
  ["kind-null", "WARNING", { kind: null }],
  ["orphan", "WARNING", { kind: "orphan", contentScore: 41 }],
  ["not-in-sitemap", "INFO", { kind: "not_in_sitemap", howToFix: "List it." }],
  ["summary", "INFO", { kind: "crawl_summary", pages: [] }], // internal
  ["score-1", "INFO", { kind: "content_score", contentScore: 40 }], // internal
  ["score-2", "INFO", { kind: "content_score", contentScore: 52 }], // internal
];
const VISIBLE = ["empty", "fix-only", "kind-null", "no-details", "not-in-sitemap", "orphan"];

async function addIssue(crawlId: string, id: string, severity: IssueSeverity, details: Row[2], type: IssueType = "BROKEN_LINK") {
  await db.crawlIssue.create({
    data: {
      id,
      crawlId,
      url: `https://quilltab.app/${id}`,
      type,
      severity,
      message: id,
      details: details as Prisma.InputJsonValue,
    },
  });
}

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;

  await db.user.create({ data: { id: "u1", email: "demo@quilltab.app" } });
  await db.site.create({ data: { id: "s1", userId: "u1", domain: "quilltab.app" } });
  await db.crawl.create({ data: { id: "c1", siteId: "s1", status: "COMPLETED" } });
  await db.crawl.create({ data: { id: "c-other", siteId: "s1", status: "COMPLETED" } });
  for (const [id, severity, details] of ROWS) await addIssue("c1", id, severity, details);
  await addIssue("c-other", "other-crawl", "CRITICAL", Prisma.DbNull);
}, 120_000);

afterAll(async () => {
  await t?.close();
});

describe("visible crawl issues (#55)", () => {
  it("keeps issues without details.kind and drops only crawl_summary and content_score", async () => {
    const rows = await db.crawlIssue.findMany({
      where: { crawlId: "c1", ...visibleIssueFilter() },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual(VISIBLE);
  });

  it("crawl page: lists visible issues and counts all of them by severity", async () => {
    const { issues, total, bySeverity } = await getVisibleIssues(db, "c1");
    expect(issues.map((i) => i.id).sort()).toEqual(VISIBLE);
    expect(issues[0].severity).toBe("CRITICAL");
    expect(total).toBe(6);
    expect(bySeverity).toEqual({ CRITICAL: 1, WARNING: 3, INFO: 2 });
  });

  it("crawl page: counts do not depend on how many rows are listed", async () => {
    const { issues, total, bySeverity } = await getVisibleIssues(db, "c1", 2);
    expect(issues).toHaveLength(2);
    expect(total).toBe(6);
    expect(bySeverity).toEqual({ CRITICAL: 1, WARNING: 3, INFO: 2 });
  });

  it("crawl page: a crawl with more than 200 issues lists 200 and counts all", async () => {
    await db.crawl.create({ data: { id: "c-big", siteId: "s1", status: "COMPLETED" } });
    await db.crawlIssue.createMany({
      data: Array.from({ length: 205 }, (_, i) => ({
        id: `big-${i}`,
        crawlId: "c-big",
        url: `https://quilltab.app/p/${i}`,
        type: "MISSING_ALT" as const,
        severity: (i < 5 ? "CRITICAL" : "WARNING") as IssueSeverity,
        message: "4 images missing alt text",
        details: i % 2 ? { howToFix: "Add alt text." } : Prisma.DbNull,
      })),
    });
    await addIssue("c-big", "big-summary", "INFO", { kind: "crawl_summary" });
    const { issues, total, bySeverity } = await getVisibleIssues(db, "c-big", 200);
    expect(issues).toHaveLength(200);
    expect(total).toBe(205);
    expect(bySeverity).toEqual({ CRITICAL: 5, WARNING: 200, INFO: 0 });
  });

  it("stored issuesFound and the overview Site checks card count the same issues as the crawl page", async () => {
    expect(await countVisibleIssues(db, "c1")).toBe(6);
    expect(await countVisibleIssues(db, "c-other")).toBe(1);
  });

  it("GET /api/sites/[siteId]/crawl: includes visible issues only", async () => {
    const crawl = await db.crawl.findUniqueOrThrow({
      where: { id: "c1" },
      include: { issues: { where: visibleIssueFilter(), take: 200 } },
    });
    expect(crawl.issues.map((i) => i.id).sort()).toEqual(VISIBLE);
  });

  it("MCP get_crawl_issues: lists visible issues, optionally one severity", async () => {
    const all = await listVisibleIssues(db, { crawlId: "c1", limit: 50 });
    expect(all.map((i) => i.url.split("/").pop()).sort()).toEqual(VISIBLE);
    const info = await listVisibleIssues(db, { crawlId: "c1", severity: "INFO", limit: 50 });
    expect(info.map((i) => i.url.split("/").pop()).sort()).toEqual(["empty", "not-in-sitemap"]);
  });
});
