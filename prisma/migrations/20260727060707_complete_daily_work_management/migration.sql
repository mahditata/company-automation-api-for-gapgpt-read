BEGIN;
-- CreateEnum
CREATE TYPE "DailyWorkScheduleType" AS ENUM ('EVERY_DAY', 'WORK_DAYS', 'CUSTOM_DAYS');

-- CreateEnum
CREATE TYPE "DailyOccurrenceGenerationType" AS ENUM ('AUTOMATIC', 'MANUAL');

-- AlterTable
ALTER TABLE "DailyWorkOccurrence" ADD COLUMN     "generationType" "DailyOccurrenceGenerationType" NOT NULL DEFAULT 'AUTOMATIC',
ALTER COLUMN "date" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "DailyWorkTask" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "sourceTaskId" INTEGER,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkActivity" ADD COLUMN     "dailyWorkTaskId" INTEGER,
ADD COLUMN     "occurrenceId" INTEGER,
ADD COLUMN     "taskId" INTEGER;

-- AlterTable
ALTER TABLE "WorkAttachment" ADD COLUMN     "occurrenceId" INTEGER;

-- AlterTable
ALTER TABLE "WorkComment" ADD COLUMN     "dailyWorkTaskId" INTEGER,
ADD COLUMN     "occurrenceId" INTEGER,
ADD COLUMN     "taskId" INTEGER;

-- AlterTable
ALTER TABLE "WorkTask" ADD COLUMN     "dailyDeadlineOffsetMinutes" INTEGER;

-- CreateTable
CREATE TABLE "DailyWorkSchedule" (
    "id" SERIAL NOT NULL,
    "workId" INTEGER NOT NULL,
    "scheduleType" "DailyWorkScheduleType" NOT NULL DEFAULT 'EVERY_DAY',
    "weekDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "generationHour" INTEGER NOT NULL DEFAULT 0,
    "generationMinute" INTEGER NOT NULL DEFAULT 5,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Tehran',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyWorkSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyWorkSchedule_workId_key" ON "DailyWorkSchedule"("workId");

-- CreateIndex
CREATE INDEX "DailyWorkSchedule_isActive_nextRunAt_idx" ON "DailyWorkSchedule"("isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "DailyWorkSchedule_scheduleType_idx" ON "DailyWorkSchedule"("scheduleType");

-- CreateIndex
CREATE INDEX "DailyWorkSchedule_startDate_idx" ON "DailyWorkSchedule"("startDate");

-- CreateIndex
CREATE INDEX "DailyWorkSchedule_endDate_idx" ON "DailyWorkSchedule"("endDate");

-- CreateIndex
CREATE INDEX "DailyWorkOccurrence_status_idx" ON "DailyWorkOccurrence"("status");

-- CreateIndex
CREATE INDEX "DailyWorkOccurrence_creatorId_idx" ON "DailyWorkOccurrence"("creatorId");

-- CreateIndex
CREATE INDEX "DailyWorkOccurrence_generationType_idx" ON "DailyWorkOccurrence"("generationType");

-- CreateIndex
CREATE INDEX "DailyWorkTask_sourceTaskId_idx" ON "DailyWorkTask"("sourceTaskId");

-- CreateIndex
CREATE INDEX "DailyWorkTask_status_idx" ON "DailyWorkTask"("status");

-- CreateIndex
CREATE INDEX "DailyWorkTask_deadline_idx" ON "DailyWorkTask"("deadline");

-- CreateIndex
CREATE INDEX "DailyWorkTask_submittedAt_idx" ON "DailyWorkTask"("submittedAt");

-- CreateIndex
CREATE INDEX "DailyWorkTask_completedAt_idx" ON "DailyWorkTask"("completedAt");

-- CreateIndex
CREATE INDEX "WorkActivity_taskId_idx" ON "WorkActivity"("taskId");

-- CreateIndex
CREATE INDEX "WorkActivity_occurrenceId_idx" ON "WorkActivity"("occurrenceId");

-- CreateIndex
CREATE INDEX "WorkActivity_dailyWorkTaskId_idx" ON "WorkActivity"("dailyWorkTaskId");

-- CreateIndex
CREATE INDEX "WorkActivity_workId_createdAt_idx" ON "WorkActivity"("workId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkActivity_type_idx" ON "WorkActivity"("type");

-- CreateIndex
CREATE INDEX "WorkAttachment_occurrenceId_idx" ON "WorkAttachment"("occurrenceId");

-- CreateIndex
CREATE INDEX "WorkComment_taskId_idx" ON "WorkComment"("taskId");

-- CreateIndex
CREATE INDEX "WorkComment_occurrenceId_idx" ON "WorkComment"("occurrenceId");

-- CreateIndex
CREATE INDEX "WorkComment_dailyWorkTaskId_idx" ON "WorkComment"("dailyWorkTaskId");

-- CreateIndex
CREATE INDEX "WorkComment_workId_createdAt_idx" ON "WorkComment"("workId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkTask_deadline_idx" ON "WorkTask"("deadline");

-- AddForeignKey
ALTER TABLE "DailyWorkSchedule" ADD CONSTRAINT "DailyWorkSchedule_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkTask" ADD CONSTRAINT "DailyWorkTask_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "WorkTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAttachment" ADD CONSTRAINT "WorkAttachment_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "DailyWorkOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkComment" ADD CONSTRAINT "WorkComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkComment" ADD CONSTRAINT "WorkComment_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "DailyWorkOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkComment" ADD CONSTRAINT "WorkComment_dailyWorkTaskId_fkey" FOREIGN KEY ("dailyWorkTaskId") REFERENCES "DailyWorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "DailyWorkOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_dailyWorkTaskId_fkey" FOREIGN KEY ("dailyWorkTaskId") REFERENCES "DailyWorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
