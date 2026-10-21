CREATE TABLE "BulkJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "tasks" JSONB NOT NULL,
    "options" JSONB NOT NULL,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "BulkJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BulkJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BulkJob_userId_createdAt_idx" ON "BulkJob"("userId", "createdAt");
-- Two tabs cannot start overlapping batches for the same account.
CREATE UNIQUE INDEX "BulkJob_one_active_per_user" ON "BulkJob"("userId") WHERE "status" IN ('QUEUED', 'RUNNING');
