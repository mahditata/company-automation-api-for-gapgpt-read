-- CreateEnum
CREATE TYPE "WorkflowRequestType" AS ENUM ('ADVANCE', 'LOAN', 'PART_SUPPLY', 'MATERIAL_SUPPLY', 'EQUIPMENT_SUPPLY', 'GENERAL');

-- CreateEnum
CREATE TYPE "WorkflowAssigneeType" AS ENUM ('DIRECT_MANAGER', 'ROLE', 'MANUAL');

-- CreateEnum
CREATE TYPE "WorkflowRequestStatus" AS ENUM ('DRAFT', 'PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'RETURNED', 'OBJECTED', 'RESUBMITTED', 'REFERRED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowRequestStepStatus" AS ENUM ('PENDING', 'CURRENT', 'APPROVED', 'REJECTED', 'RETURNED', 'OBJECTED', 'RESUBMITTED', 'SKIPPED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WorkflowActionType" AS ENUM ('CREATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED', 'OBJECTED', 'RESUBMITTED', 'REFERRED', 'ASSIGNED', 'UNASSIGNED', 'COMMENTED', 'ATTACHMENT_ADDED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowAssignmentStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "type" "WorkflowRequestType" NOT NULL,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStepDefinition" (
    "id" SERIAL NOT NULL,
    "workflowDefinitionId" INTEGER NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "assigneeType" "WorkflowAssigneeType" NOT NULL,
    "roleId" INTEGER,
    "canReject" BOOLEAN NOT NULL DEFAULT true,
    "canReturn" BOOLEAN NOT NULL DEFAULT true,
    "requiresApprovalComment" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStepDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRequest" (
    "id" SERIAL NOT NULL,
    "requestNumber" VARCHAR(50) NOT NULL,
    "workflowDefinitionId" INTEGER NOT NULL,
    "type" "WorkflowRequestType" NOT NULL,
    "creatorId" INTEGER NOT NULL,
    "departmentId" INTEGER,
    "title" VARCHAR(250) NOT NULL,
    "description" TEXT,
    "formData" JSONB,
    "status" "WorkflowRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStepOrder" INTEGER,
    "currentAssigneeId" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRequestStep" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "stepDefinitionId" INTEGER,
    "stepOrder" INTEGER NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "assigneeType" "WorkflowAssigneeType" NOT NULL,
    "assigneeId" INTEGER,
    "status" "WorkflowRequestStepStatus" NOT NULL DEFAULT 'PENDING',
    "comment" VARCHAR(2000),
    "actedById" INTEGER,
    "activatedAt" TIMESTAMP(3),
    "actedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRequestStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRequestAction" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "stepId" INTEGER,
    "actorId" INTEGER NOT NULL,
    "action" "WorkflowActionType" NOT NULL,
    "fromStatus" "WorkflowRequestStatus",
    "toStatus" "WorkflowRequestStatus",
    "fromAssigneeId" INTEGER,
    "toAssigneeId" INTEGER,
    "comment" VARCHAR(2000),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRequestAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRequestAssignment" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "stepId" INTEGER NOT NULL,
    "assigneeId" INTEGER NOT NULL,
    "assignedById" INTEGER,
    "status" "WorkflowAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "reason" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRequestAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRequestAttachment" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRequestAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinition_code_key" ON "WorkflowDefinition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinition_type_key" ON "WorkflowDefinition"("type");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_isActive_idx" ON "WorkflowDefinition"("isActive");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_type_idx" ON "WorkflowDefinition"("type");

-- CreateIndex
CREATE INDEX "WorkflowStepDefinition_workflowDefinitionId_isActive_idx" ON "WorkflowStepDefinition"("workflowDefinitionId", "isActive");

-- CreateIndex
CREATE INDEX "WorkflowStepDefinition_roleId_idx" ON "WorkflowStepDefinition"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStepDefinition_workflowDefinitionId_stepOrder_key" ON "WorkflowStepDefinition"("workflowDefinitionId", "stepOrder");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStepDefinition_workflowDefinitionId_code_key" ON "WorkflowStepDefinition"("workflowDefinitionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRequest_requestNumber_key" ON "WorkflowRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "WorkflowRequest_creatorId_createdAt_idx" ON "WorkflowRequest"("creatorId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRequest_departmentId_idx" ON "WorkflowRequest"("departmentId");

-- CreateIndex
CREATE INDEX "WorkflowRequest_currentAssigneeId_status_idx" ON "WorkflowRequest"("currentAssigneeId", "status");

-- CreateIndex
CREATE INDEX "WorkflowRequest_workflowDefinitionId_idx" ON "WorkflowRequest"("workflowDefinitionId");

-- CreateIndex
CREATE INDEX "WorkflowRequest_type_status_idx" ON "WorkflowRequest"("type", "status");

-- CreateIndex
CREATE INDEX "WorkflowRequest_status_createdAt_idx" ON "WorkflowRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRequestStep_requestId_status_idx" ON "WorkflowRequestStep"("requestId", "status");

-- CreateIndex
CREATE INDEX "WorkflowRequestStep_assigneeId_status_idx" ON "WorkflowRequestStep"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "WorkflowRequestStep_stepDefinitionId_idx" ON "WorkflowRequestStep"("stepDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRequestStep_requestId_stepOrder_key" ON "WorkflowRequestStep"("requestId", "stepOrder");

-- CreateIndex
CREATE INDEX "WorkflowRequestAction_requestId_createdAt_idx" ON "WorkflowRequestAction"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRequestAction_stepId_idx" ON "WorkflowRequestAction"("stepId");

-- CreateIndex
CREATE INDEX "WorkflowRequestAction_actorId_createdAt_idx" ON "WorkflowRequestAction"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRequestAction_action_idx" ON "WorkflowRequestAction"("action");

-- CreateIndex
CREATE INDEX "WorkflowRequestAssignment_requestId_assignedAt_idx" ON "WorkflowRequestAssignment"("requestId", "assignedAt");

-- CreateIndex
CREATE INDEX "WorkflowRequestAssignment_stepId_status_idx" ON "WorkflowRequestAssignment"("stepId", "status");

-- CreateIndex
CREATE INDEX "WorkflowRequestAssignment_assigneeId_status_idx" ON "WorkflowRequestAssignment"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "WorkflowRequestAttachment_requestId_idx" ON "WorkflowRequestAttachment"("requestId");

-- CreateIndex
CREATE INDEX "WorkflowRequestAttachment_uploadedById_idx" ON "WorkflowRequestAttachment"("uploadedById");

-- AddForeignKey
ALTER TABLE "WorkflowStepDefinition" ADD CONSTRAINT "WorkflowStepDefinition_workflowDefinitionId_fkey" FOREIGN KEY ("workflowDefinitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStepDefinition" ADD CONSTRAINT "WorkflowStepDefinition_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequest" ADD CONSTRAINT "WorkflowRequest_workflowDefinitionId_fkey" FOREIGN KEY ("workflowDefinitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequest" ADD CONSTRAINT "WorkflowRequest_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequest" ADD CONSTRAINT "WorkflowRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequest" ADD CONSTRAINT "WorkflowRequest_currentAssigneeId_fkey" FOREIGN KEY ("currentAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequestStep" ADD CONSTRAINT "WorkflowRequestStep_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "WorkflowRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequestStep" ADD CONSTRAINT "WorkflowRequestStep_stepDefinitionId_fkey" FOREIGN KEY ("stepDefinitionId") REFERENCES "WorkflowStepDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequestStep" ADD CONSTRAINT "WorkflowRequestStep_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequestStep" ADD CONSTRAINT "WorkflowRequestStep_actedById_fkey" FOREIGN KEY ("actedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequestAction" ADD CONSTRAINT "WorkflowRequestAction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "WorkflowRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequestAction" ADD CONSTRAINT "WorkflowRequestAction_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "WorkflowRequestStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequestAction" ADD CONSTRAINT "WorkflowRequestAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequestAction" ADD CONSTRAINT "WorkflowRequestAction_fromAssigneeId_fkey" FOREIGN KEY ("fromAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequestAction" ADD CONSTRAINT "WorkflowRequestAction_toAssigneeId_fkey" FOREIGN KEY ("toAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequestAssignment" ADD CONSTRAINT "WorkflowRequestAssignment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "WorkflowRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequestAssignment" ADD CONSTRAINT "WorkflowRequestAssignment_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "WorkflowRequestStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequestAssignment" ADD CONSTRAINT "WorkflowRequestAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequestAssignment" ADD CONSTRAINT "WorkflowRequestAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequestAttachment" ADD CONSTRAINT "WorkflowRequestAttachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "WorkflowRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRequestAttachment" ADD CONSTRAINT "WorkflowRequestAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
