-- CreateTable
CREATE TABLE "GBPDailyMetric" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "desktopMaps" INTEGER NOT NULL DEFAULT 0,
    "desktopSearch" INTEGER NOT NULL DEFAULT 0,
    "mobileMaps" INTEGER NOT NULL DEFAULT 0,
    "mobileSearch" INTEGER NOT NULL DEFAULT 0,
    "websiteClicks" INTEGER NOT NULL DEFAULT 0,
    "callClicks" INTEGER NOT NULL DEFAULT 0,
    "directionRequests" INTEGER NOT NULL DEFAULT 0,
    "conversations" INTEGER NOT NULL DEFAULT 0,
    "bookings" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GBPDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GBPDailyMetric_siteId_date_idx" ON "GBPDailyMetric"("siteId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "GBPDailyMetric_siteId_date_key" ON "GBPDailyMetric"("siteId", "date");

-- AddForeignKey
ALTER TABLE "GBPDailyMetric" ADD CONSTRAINT "GBPDailyMetric_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
