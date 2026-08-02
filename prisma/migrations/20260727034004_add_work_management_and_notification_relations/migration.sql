-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('NORMAL', 'DAILY');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED', 'NEEDS_REVISION');

-- CreateEnum
CREATE TYPE "WorkTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'PENDING_APPROVAL', 'COMPLETED', 'NEEDS_REVISION');

-- CreateEnum
CREATE TYPE "WorkActivityType" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'MEMBER_ADDED', 'MEMBER_REMOVED', 'TASK_ADDED', 'TASK_UPDATED', 'TASK_STATUS_CHANGED', 'COMMENT_ADDED', 'ATTACHMENT_ADDED', 'DELETED', 'RESTORED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'WORKFLOW_REQUEST_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'WORKFLOW_REQUEST_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'WORKFLOW_REQUEST_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'WORKFLOW_REQUEST_FORWARDED';
ALTER TYPE "NotificationType" ADD VALUE 'WORK_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'WORK_STATUS_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'WORK_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'WORK_TASK_STATUS_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'WORK_COMMENT_ADDED';
ALTER TYPE "NotificationType" ADD VALUE 'WORK_REVISION_REQUESTED';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "workId" INTEGER,
ADD COLUMN     "workflowRequestId" INTEGER;

-- CreateTable
CREATE TABLE "Work" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "description" TEXT,
    "type" "WorkType" NOT NULL DEFAULT 'NORMAL',
    "status" "WorkStatus" NOT NULL DEFAULT 'TODO',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "creatorId" INTEGER NOT NULL,
    "deadline" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkMember" (
    "id" SERIAL NOT NULL,
    "workId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTask" (
    "id" SERIAL NOT NULL,
    "workId" INTEGER NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "description" TEXT,
    "status" "WorkTaskStatus" NOT NULL DEFAULT 'TODO',
    "deadline" TIMESTAMP(3),
    "assigneeId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWorkOccurrence" (
    "id" SERIAL NOT NULL,
    "workId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "WorkStatus" NOT NULL DEFAULT 'TODO',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "creatorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyWorkOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyWorkTask" (
    "id" SERIAL NOT NULL,
    "occurrenceId" INTEGER NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "description" TEXT,
    "status" "WorkTaskStatus" NOT NULL DEFAULT 'TODO',
    "assigneeId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyWorkTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkAttachment" (
    "id" SERIAL NOT NULL,
    "workId" INTEGER NOT NULL,
    "taskId" INTEGER,
    "dailyWorkTaskId" INTEGER,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkComment" (
    "id" SERIAL NOT NULL,
    "workId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkActivity" (
    "id" SERIAL NOT NULL,
    "workId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "WorkActivityType" NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Work_creatorId_idx" ON "Work"("creatorId");

-- CreateIndex
CREATE INDEX "Work_status_idx" ON "Work"("status");

-- CreateIndex
CREATE INDEX "Work_type_idx" ON "Work"("type");

-- CreateIndex
CREATE INDEX "Work_deletedAt_idx" ON "Work"("deletedAt");

-- CreateIndex
CREATE INDEX "WorkMember_workId_idx" ON "WorkMember"("workId");

-- CreateIndex
CREATE INDEX "WorkMember_userId_idx" ON "WorkMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkMember_workId_userId_key" ON "WorkMember"("workId", "userId");

-- CreateIndex
CREATE INDEX "WorkTask_workId_idx" ON "WorkTask"("workId");

-- CreateIndex
CREATE INDEX "WorkTask_assigneeId_idx" ON "WorkTask"("assigneeId");

-- CreateIndex
CREATE INDEX "WorkTask_status_idx" ON "WorkTask"("status");

-- CreateIndex
CREATE INDEX "DailyWorkOccurrence_workId_idx" ON "DailyWorkOccurrence"("workId");

-- CreateIndex
CREATE INDEX "DailyWorkOccurrence_date_idx" ON "DailyWorkOccurrence"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyWorkOccurrence_workId_date_key" ON "DailyWorkOccurrence"("workId", "date");

-- CreateIndex
CREATE INDEX "DailyWorkTask_occurrenceId_idx" ON "DailyWorkTask"("occurrenceId");

-- CreateIndex
CREATE INDEX "DailyWorkTask_assigneeId_idx" ON "DailyWorkTask"("assigneeId");

-- CreateIndex
CREATE INDEX "WorkAttachment_workId_idx" ON "WorkAttachment"("workId");

-- CreateIndex
CREATE INDEX "WorkAttachment_taskId_idx" ON "WorkAttachment"("taskId");

-- CreateIndex
CREATE INDEX "WorkAttachment_dailyWorkTaskId_idx" ON "WorkAttachment"("dailyWorkTaskId");

-- CreateIndex
CREATE INDEX "WorkAttachment_uploadedById_idx" ON "WorkAttachment"("uploadedById");

-- CreateIndex
CREATE INDEX "WorkComment_workId_idx" ON "WorkComment"("workId");

-- CreateIndex
CREATE INDEX "WorkComment_userId_idx" ON "WorkComment"("userId");

-- CreateIndex
CREATE INDEX "WorkActivity_workId_idx" ON "WorkActivity"("workId");

-- CreateIndex
CREATE INDEX "WorkActivity_userId_idx" ON "WorkActivity"("userId");

-- CreateIndex
CREATE INDEX "Notification_workflowRequestId_idx" ON "Notification"("workflowRequestId");

-- CreateIndex
CREATE INDEX "Notification_workId_idx" ON "Notification"("workId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workflowRequestId_fkey" FOREIGN KEY ("workflowRequestId") REFERENCES "WorkflowRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkMember" ADD CONSTRAINT "WorkMember_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkMember" ADD CONSTRAINT "WorkMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkOccurrence" ADD CONSTRAINT "DailyWorkOccurrence_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkOccurrence" ADD CONSTRAINT "DailyWorkOccurrence_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkTask" ADD CONSTRAINT "DailyWorkTask_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "DailyWorkOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyWorkTask" ADD CONSTRAINT "DailyWorkTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAttachment" ADD CONSTRAINT "WorkAttachment_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAttachment" ADD CONSTRAINT "WorkAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAttachment" ADD CONSTRAINT "WorkAttachment_dailyWorkTaskId_fkey" FOREIGN KEY ("dailyWorkTaskId") REFERENCES "DailyWorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkAttachment" ADD CONSTRAINT "WorkAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkComment" ADD CONSTRAINT "WorkComment_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkComment" ADD CONSTRAINT "WorkComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkActivity" ADD CONSTRAINT "WorkActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

