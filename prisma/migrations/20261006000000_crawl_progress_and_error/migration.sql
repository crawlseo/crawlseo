-- AlterTable
ALTER TABLE "Crawl" ADD COLUMN "error" TEXT,
ADD COLUMN "lastProgressAt" TIMESTAMP(3);

-- Existing rows: their last known activity. A crawl still RUNNING from before
-- this migration gets its start time and is recovered as stale.
UPDATE "Crawl" SET "lastProgressAt" = COALESCE("finishedAt", "startedAt");
