-- AlterTable: where a noindex page was told noindex, and its X-Robots-Tag header (#105)
ALTER TABLE "AuditPage" ADD COLUMN "noindexSource" TEXT;
ALTER TABLE "AuditPage" ADD COLUMN "xRobotsTag" TEXT;
