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

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "workflowRequestId" INTEGER;

-- CreateIndex
CREATE INDEX "Notification_workflowRequestId_idx" ON "Notification"("workflowRequestId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workflowRequestId_fkey" FOREIGN KEY ("workflowRequestId") REFERENCES "WorkflowRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
