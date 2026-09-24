-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "bingSite" TEXT;

-- CreateTable
CREATE TABLE "BingDaily" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "clicks" INTEGER,
    "impressions" INTEGER,
    "crawledPages" INTEGER,
    "inIndex" INTEGER,
    "inLinks" INTEGER,
    "code2xx" INTEGER,
    "code301" INTEGER,
    "code302" INTEGER,
    "code4xx" INTEGER,
    "code5xx" INTEGER,
    "blockedByRobots" INTEGER,
    "crawlErrors" INTEGER,

    CONSTRAINT "BingDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BingSearchWeekly" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "weekEnding" TIMESTAMP(3) NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "avgImpressionPosition" DOUBLE PRECISION,

    CONSTRAINT "BingSearchWeekly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BingDaily_siteId_date_key" ON "BingDaily"("siteId", "date");

-- CreateIndex
CREATE INDEX "BingSearchWeekly_siteId_kind_weekEnding_idx" ON "BingSearchWeekly"("siteId", "kind", "weekEnding");

-- CreateIndex
CREATE UNIQUE INDEX "BingSearchWeekly_siteId_kind_key_weekEnding_key" ON "BingSearchWeekly"("siteId", "kind", "key", "weekEnding");

-- AddForeignKey
ALTER TABLE "BingDaily" ADD CONSTRAINT "BingDaily_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingSearchWeekly" ADD CONSTRAINT "BingSearchWeekly_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

