-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "boardOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill: rank per (userId, status, priority) cell, newest updatedAt first
WITH ranked AS (
  SELECT id,
    (ROW_NUMBER() OVER (
      PARTITION BY "userId", status, priority
      ORDER BY "updatedAt" DESC
    ) - 1)::int AS rn
  FROM "Application"
)
UPDATE "Application" AS a
SET "boardOrder" = ranked.rn
FROM ranked
WHERE a.id = ranked.id;

-- CreateIndex
CREATE INDEX "Application_userId_status_priority_boardOrder_idx" ON "Application"("userId", "status", "priority", "boardOrder");
