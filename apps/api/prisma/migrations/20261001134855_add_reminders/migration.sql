-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('MANUAL', 'INTERVIEW', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SCHEDULED', 'DUE', 'DISMISSED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'REMINDER_FIRED';
ALTER TYPE "ActivityType" ADD VALUE 'REMINDER_DISMISSED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "followUpDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "interviewLeadHours" INTEGER NOT NULL DEFAULT 24;

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "interviewId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "bullJobId" TEXT,
    "firedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_userId_status_dueAt_idx" ON "Reminder"("userId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Reminder_status_dueAt_idx" ON "Reminder"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Reminder_applicationId_idx" ON "Reminder"("applicationId");

-- CreateIndex
CREATE INDEX "Reminder_interviewId_idx" ON "Reminder"("interviewId");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique indexes (Prisma cannot express these)
CREATE UNIQUE INDEX "reminder_one_scheduled_follow_up"
  ON "Reminder" ("applicationId")
  WHERE kind = 'FOLLOW_UP' AND status = 'SCHEDULED';

CREATE UNIQUE INDEX "reminder_one_scheduled_interview"
  ON "Reminder" ("interviewId")
  WHERE kind = 'INTERVIEW' AND status = 'SCHEDULED' AND "interviewId" IS NOT NULL;
