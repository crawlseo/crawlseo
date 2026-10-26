-- Settings > Email alerts: recipients and on/off per user. SMTP settings stay in the environment.
ALTER TABLE "UserSettings" ADD COLUMN "alertEmailTo" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN "alertEmailEnabled" BOOLEAN NOT NULL DEFAULT false;

-- An alert for a crawl whose fetched pages are mostly noindex.
ALTER TYPE "AlertType" ADD VALUE 'NOINDEX_SITEWIDE';
