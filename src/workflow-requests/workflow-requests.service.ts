import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  UserStatus,
  WorkflowActionType,
  WorkflowAssigneeType,
  WorkflowAssignmentStatus,
  WorkflowRequestStatus,
  WorkflowRequestStepStatus,
  WorkflowRequestType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowRequestDto } from './dto/create-workflow-request.dto';
import {
  ListWorkflowRequestsDto,
  WorkflowRequestListScope,
} from './dto/list-workflow-requests.dto';
import { SubmitWorkflowRequestDto } from './dto/submit-workflow-request.dto';
import { ApproveWorkflowRequestDto } from './dto/approve-workflow-request.dto';
import { RejectWorkflowRequestDto } from './dto/reject-workflow-request.dto';
import { ForwardWorkflowRequestDto } from './dto/forward-workflow-request.dto';

const PREDEFINED_INITIAL_ASSIGNEE_USER_ID = 11;

@Injectable()
export class WorkflowRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, dto: CreateWorkflowRequestDto) {
    const creator = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        status: true,
        departmentId: true,
      },
    });

    if (!creator) {
      throw new ForbiddenException(`User with id ${userId} does not exist.`);
    }

    if (creator.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Inactive users cannot create workflow requests.');
    }

    const workflowDefinition = await this.prisma.workflowDefinition.findUnique({
      where: { id: dto.workflowDefinitionId },
      include: {
        steps: {
          where: { isActive: true },
          orderBy: { stepOrder: 'asc' },
        },
      },
    });

    if (!workflowDefinition) {
      throw new NotFoundException(`Workflow definition with id ${dto.workflowDefinitionId} not found.`);
    }

    if (!workflowDefinition.isActive) {
      throw new BadRequestException('The selected workflow is inactive.');
    }

    if (workflowDefinition.steps.length === 0) {
      throw new BadRequestException('The selected workflow has no active steps.');
    }

    // بررسی نوع گردش کار برای تعیین دستی دپارتمان
    const isPredefined = workflowDefinition.type !== WorkflowRequestType.GENERAL && !workflowDefinition.isManual;
    if (isPredefined && dto.departmentId !== undefined) {
      throw new BadRequestException('Cannot manually set departmentId for predefined workflows.');
    }

    const departmentId = isPredefined ? (creator.departmentId ?? null) : (dto.departmentId ?? creator.departmentId ?? null);

    if (departmentId !== null) {
      const department = await this.prisma.department.findUnique({
        where: { id: departmentId },
        select: { id: true },
      });

      if (!department) {
        throw new NotFoundException(`Department with id ${departmentId} not found.`);
      }
    }

    const normalizedTitle = dto.title.trim();

    if (!normalizedTitle) {
      throw new BadRequestException('Request title cannot be empty.');
    }

    // بررسی و صحت‌سنجی فیلدهای پویای مربوط به وام و مساعده در formData
    if (
      (workflowDefinition.type === WorkflowRequestType.LOAN ||
        workflowDefinition.type === WorkflowRequestType.ADVANCE) &&
      dto.formData
    ) {
      const { amount, installmentsCount, startMonth } = dto.formData;
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        throw new BadRequestException('مبلغ درخواست معتبر نمی‌باشد.');
      }
      if (workflowDefinition.type === WorkflowRequestType.LOAN) {
        if (!installmentsCount || isNaN(Number(installmentsCount)) || Number(installmentsCount) <= 0) {
          throw new BadRequestException('تعداد اقساط برای درخواست وام الزامی و باید بیشتر از صفر باشد.');
        }
        if (!startMonth || typeof startMonth !== 'string' || startMonth.trim() === '') {
          throw new BadRequestException('ماه شروع اقساط الزامی است.');
        }
      }
    }

    const requestNumber = await this.generateRequestNumber();

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.workflowRequest.create({
        data: {
          requestNumber,
          workflowDefinitionId: workflowDefinition.id,
          type: workflowDefinition.type,
          creatorId: creator.id,
          departmentId,
          title: normalizedTitle,
          description: dto.description?.trim() || null,
          formData: dto.formData !== undefined ? (dto.formData as Prisma.InputJsonValue) : Prisma.JsonNull,
          status: WorkflowRequestStatus.DRAFT,
          currentStepOrder: null,
          currentAssigneeId: null,
          steps: {
            create: workflowDefinition.steps.map((step) => ({
              stepDefinitionId: step.id,
              stepOrder: step.stepOrder,
              code: step.code,
              title: step.title,
              assigneeType: step.assigneeType,
              assigneeId: null,
              status: WorkflowRequestStepStatus.PENDING,
            })),
          },
        },
      });

      await tx.workflowRequestAction.create({
        data: {
          requestId: request.id,
          actorId: creator.id,
          action: WorkflowActionType.CREATED,
          fromStatus: null,
          toStatus: WorkflowRequestStatus.DRAFT,
          comment: null,
          metadata: {
            workflowDefinitionId: workflowDefinition.id,
            workflowCode: workflowDefinition.code,
            workflowTitle: workflowDefinition.title,
          },
        },
      });

      return tx.workflowRequest.findUnique({
        where: { id: request.id },
        include: this.getRequestInclude(),
      });
    });
  }

  async submit(userId: number, requestId: number, dto: SubmitWorkflowRequestDto) {
    await this.ensureActiveUser(userId);

    const normalizedComment = dto.comment?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.workflowRequest.findUnique({
        where: { id: requestId },
        include: {
          workflowDefinition: {
            select: { id: true, code: true, title: true, type: true, isManual: true, isActive: true },
          },
          creator: {
            select: { id: true, status: true, managerId: true },
          },
          steps: {
            orderBy: { stepOrder: 'asc' },
            include: {
              stepDefinition: {
                select: { id: true, roleId: true, isActive: true },
              },
            },
          },
        },
      });

      if (!request) {
        throw new NotFoundException(`Workflow request with id ${requestId} not found.`);
      }

      if (request.creatorId !== userId) {
        throw new ForbiddenException('Only the creator of the request can submit it.');
      }

      if (request.creator.status !== UserStatus.ACTIVE) {
        throw new ForbiddenException('The creator of this request is inactive.');
      }

      if (request.status !== WorkflowRequestStatus.DRAFT && request.status !== WorkflowRequestStatus.REJECTED) {
        throw new BadRequestException(`Only requests with DRAFT or REJECTED status can be submitted. Current status: ${request.status}.`);
      }

      if (!request.workflowDefinition.isActive) {
        throw new BadRequestException('The workflow definition of this request is inactive.');
      }

      if (request.steps.length === 0) {
        throw new BadRequestException('This request has no workflow steps.');
      }

      const firstStep = request.steps[0];
      if (firstStep.stepDefinition && !firstStep.stepDefinition.isActive) {
        throw new BadRequestException('The first workflow step is inactive.');
      }

      let assigneeId: number;

      // تشخیص نوع جریان درخواست بر اساس اینام‌های اصلاح‌شده‌ی پریزما
      const isDirect = (request.type === WorkflowRequestType.ADVANCE || request.type === WorkflowRequestType.LOAN);
      const isHierarchical = (
        request.type === WorkflowRequestType.PART_SUPPLY ||
        request.type === WorkflowRequestType.MATERIAL_SUPPLY ||
        request.type === WorkflowRequestType.EQUIPMENT_SUPPLY
      );

      if (isDirect) {
        // ۱. مستقیم به مدیر داخلی (شناسه ۱۱)
        const targetUser = await tx.user.findUnique({
          where: { id: PREDEFINED_INITIAL_ASSIGNEE_USER_ID },
          select: { id: true, status: true },
        });

        if (!targetUser || targetUser.status !== UserStatus.ACTIVE) {
          throw new BadRequestException(`کاربر مدیر داخلی (شناسه ${PREDEFINED_INITIAL_ASSIGNEE_USER_ID}) فعال یا یافت نشد.`);
        }
        assigneeId = targetUser.id;
      } else if (isHierarchical) {
        // ۲. سلسله‌مراتبی: اولین گیرنده مدیر مستقیم فرستنده است
        if (!request.creator.managerId) {
          throw new BadRequestException('شما مدیر مستقیم ندارید؛ امکان ثبت درخواست سلسله‌مراتبی وجود ندارد.');
        }
        const manager = await tx.user.findUnique({
          where: { id: request.creator.managerId },
          select: { id: true, status: true },
        });
        if (!manager || manager.status !== UserStatus.ACTIVE) {
          throw new BadRequestException('مدیر مستقیم شما غیرفعال است یا در سیستم یافت نشد.');
        }
        assigneeId = manager.id;
      } else {
        // ۳. عمومی / آزاد
        assigneeId = await this.resolveStepAssignee(
          tx,
          request.creator,
          firstStep as any,
          dto.assigneeId,
        );
      }

      const now = new Date();

      // ریست کردن وضعیت پله‌ها در صورتی که قبلا رد شده بود
      await tx.workflowRequestStep.updateMany({
        where: { requestId: request.id },
        data: { status: WorkflowRequestStepStatus.PENDING, assigneeId: null, actedById: null, actedAt: null, activatedAt: null },
      });

      const requestUpdateResult = await tx.workflowRequest.updateMany({
        where: {
          id: request.id,
          creatorId: userId,
          version: request.version,
        },
        data: {
          status: WorkflowRequestStatus.PENDING,
          currentStepOrder: firstStep.stepOrder,
          currentAssigneeId: assigneeId,
          submittedAt: now,
          version: { increment: 1 },
        },
      });

      if (requestUpdateResult.count !== 1) {
        throw new ConflictException('The request was changed by another operation.');
      }

      await tx.workflowRequestStep.update({
        where: { id: firstStep.id },
        data: {
          status: WorkflowRequestStepStatus.CURRENT,
          assigneeId,
          activatedAt: now,
        },
      });

      // غیرفعال کردن تخصیص‌های قبلی فعال
      await tx.workflowRequestAssignment.updateMany({
        where: { requestId: request.id, status: WorkflowAssignmentStatus.ACTIVE },
        data: { status: WorkflowAssignmentStatus.ENDED, endedAt: now },
      });

      const assignment = await tx.workflowRequestAssignment.create({
        data: {
          requestId: request.id,
          stepId: firstStep.id,
          assigneeId,
          assignedById: userId,
          status: WorkflowAssignmentStatus.ACTIVE,
          assignedAt: now,
          reason: 'Initial workflow assignment',
        },
      });

      await tx.workflowRequestAction.create({
        data: {
          requestId: request.id,
          stepId: firstStep.id,
          actorId: userId,
          action: WorkflowActionType.SUBMITTED,
          fromStatus: request.status,
          toStatus: WorkflowRequestStatus.PENDING,
          fromAssigneeId: request.currentAssigneeId,
          toAssigneeId: assigneeId,
          comment: normalizedComment,
          metadata: {
            stepId: firstStep.id,
            stepCode: firstStep.code,
            stepOrder: firstStep.stepOrder,
            assignmentId: assignment.id,
          },
        },
      });

      return tx.workflowRequest.findUnique({
        where: { id: request.id },
        include: this.getRequestInclude(),
      });
    });
  }

  async approve(userId: number, requestId: number, dto: ApproveWorkflowRequestDto) {
    return this.handleAction(userId, requestId, WorkflowActionType.APPROVED, dto.comment, dto.nextAssigneeId);
  }

  async reject(userId: number, requestId: number, dto: RejectWorkflowRequestDto) {
    return this.handleAction(userId, requestId, WorkflowActionType.REJECTED, dto.comment);
  }

  private async handleAction(
    userId: number,
    requestId: number,
    action: WorkflowActionType,
    comment?: string,
    nextAssigneeIdFromDto?: number,
  ) {
    await this.ensureActiveUser(userId);

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.workflowRequest.findUnique({
        where: { id: requestId },
        include: {
          steps: { orderBy: { stepOrder: 'asc' } },
          creator: { select: { id: true, status: true, managerId: true } },
        },
      });

      if (!request) throw new NotFoundException('درخواست یافت نشد.');
      
      if (request.status !== WorkflowRequestStatus.PENDING && request.status !== WorkflowRequestStatus.IN_PROGRESS) {
        throw new BadRequestException('عملیات فقط روی درخواست‌های در حال جریان امکان‌پذیر است.');
      }

      if (request.currentAssigneeId !== userId) {
        throw new ForbiddenException('شما گیرنده فعلی این درخواست نیستید.');
      }

      const currentStep = request.steps.find((s) => s.stepOrder === request.currentStepOrder);
      if (!currentStep) throw new Error('مرحله جاری درخواست یافت نشد.');

      const now = new Date();
      let nextStatus: WorkflowRequestStatus = WorkflowRequestStatus.IN_PROGRESS;
      let nextStepOrder: number | null = request.currentStepOrder;
      let nextAssigneeId: number | null = null;

      if (action === WorkflowActionType.APPROVED) {
        await tx.workflowRequestStep.update({
          where: { id: currentStep.id },
          data: {
            status: WorkflowRequestStepStatus.APPROVED,
            actedById: userId,
            actedAt: now,
            completedAt: now,
          },
        });

        // تعیین اینکه آیا درخواست سلسله‌مراتبی است یا خیر
        const isHierarchical = (
          request.type === WorkflowRequestType.PART_SUPPLY ||
          request.type === WorkflowRequestType.MATERIAL_SUPPLY ||
          request.type === WorkflowRequestType.EQUIPMENT_SUPPLY
        );

        if (isHierarchical) {
          // در فرآیند سلسله‌مراتبی، تاییدکننده فعلی را بررسی می‌کنیم.
          if (userId === PREDEFINED_INITIAL_ASSIGNEE_USER_ID) {
            // تایید نهایی توسط مدیر داخلی انجام شد
            nextStatus = WorkflowRequestStatus.COMPLETED;
            nextStepOrder = null;
            nextAssigneeId = null;
          } else {
            // پیدا کردن مدیر بالاسری تاییدکننده فعلی
            const currentUserObj = await tx.user.findUnique({
              where: { id: userId },
              select: { managerId: true },
            });

            if (!currentUserObj || !currentUserObj.managerId) {
              // اگر مدیر بعدی وجود نداشت، مستقیماً به مدیر داخلی (۱۱) می‌فرستیم
              nextAssigneeId = PREDEFINED_INITIAL_ASSIGNEE_USER_ID;
            } else {
              nextAssigneeId = currentUserObj.managerId;
            }

            // اطمینان از فعال بودن مدیر بعدی
            const nextManager = await tx.user.findUnique({
              where: { id: nextAssigneeId },
              select: { id: true, status: true },
            });

            if (!nextManager || nextManager.status !== UserStatus.ACTIVE) {
              throw new BadRequestException('مدیر بالاسری گیرنده بعدی غیرفعال یا نامعتبر است.');
            }

            // پیدا کردن پله بعدی برای گردش کار سلسله‌مراتب
            const followingStep = request.steps.find((s) => s.stepOrder > currentStep.stepOrder);
            if (followingStep) {
              nextStepOrder = followingStep.stepOrder;
              await tx.workflowRequestStep.update({
                where: { id: followingStep.id },
                data: {
                  status: WorkflowRequestStepStatus.CURRENT,
                  assigneeId: nextAssigneeId,
                  activatedAt: now,
                },
              });
            } else {
              // اگر پله تعریف‌شده‌ی بعدی وجود نداشت، روی همان گام جاری جلو می‌بریم یا گام جدید را مدیریت می‌کنیم.
              nextStepOrder = currentStep.stepOrder;
            }
          }
        } else {
          // فرآیند خطی معمولی - پیدا کردن اولین پله با ترتیب بالاتر به جای فرض ترتیب متوالی بدون فاصله (+1)
          const followingStep = request.steps.find((s) => s.stepOrder > currentStep.stepOrder);

          if (followingStep) {
            const followingStepWithDef = await tx.workflowRequestStep.findUnique({
              where: { id: followingStep.id },
              include: { stepDefinition: true },
            });

            nextStepOrder = followingStep.stepOrder;
            nextAssigneeId = await this.resolveStepAssignee(
              tx,
              request.creator,
              followingStepWithDef as any,
              nextAssigneeIdFromDto,
            );

            await tx.workflowRequestStep.update({
              where: { id: followingStep.id },
              data: {
                status: WorkflowRequestStepStatus.CURRENT,
                assigneeId: nextAssigneeId,
                activatedAt: now,
              },
            });
          } else {
            nextStatus = WorkflowRequestStatus.COMPLETED;
            nextStepOrder = null;
            nextAssigneeId = null;
          }
        }
      } else if (action === WorkflowActionType.REJECTED) {
        // در صورت Reject، وضعیت به REJECTED رفته و جهت اصلاح به سازنده اصلی باز می‌گردد.
        nextStatus = WorkflowRequestStatus.REJECTED;
        nextStepOrder = null;
        nextAssigneeId = request.creatorId; 

        await tx.workflowRequestStep.update({
          where: { id: currentStep.id },
          data: {
            status: WorkflowRequestStepStatus.REJECTED,
            actedById: userId,
            actedAt: now,
          },
        });
      }

      const updateResult = await tx.workflowRequest.updateMany({
        where: { id: requestId, version: request.version },
        data: {
          status: nextStatus,
          currentStepOrder: nextStepOrder,
          currentAssigneeId: nextAssigneeId,
          completedAt: nextStatus === WorkflowRequestStatus.COMPLETED ? now : undefined,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) throw new ConflictException('درخواست توسط عملیات دیگری تغییر یافته است.');

      await tx.workflowRequestAssignment.updateMany({
        where: { requestId, status: WorkflowAssignmentStatus.ACTIVE },
        data: { 
            status: WorkflowAssignmentStatus.ENDED, 
            endedAt: now 
        },
      });

      // در صورت رد شدن یا وجود پله بعدی تخصیص جدید ثبت می‌کنیم
      if (nextAssigneeId) {
        const nextStepRecord = request.steps.find((s) => s.stepOrder === nextStepOrder);
        await tx.workflowRequestAssignment.create({
          data: {
            requestId,
            stepId: nextStepRecord?.id || currentStep.id,
            assigneeId: nextAssigneeId,
            assignedById: userId,
            status: WorkflowAssignmentStatus.ACTIVE,
            assignedAt: now,
            reason: `Action: ${action}`,
          },
        });
      }

      await tx.workflowRequestAction.create({
        data: {
          requestId,
          stepId: currentStep.id,
          actorId: userId,
          action: action,
          fromStatus: request.status,
          toStatus: nextStatus,
          fromAssigneeId: request.currentAssigneeId,
          toAssigneeId: nextAssigneeId,
          comment: comment?.trim() || null,
        },
      });

      return tx.workflowRequest.findUnique({
        where: { id: requestId },
        include: this.getRequestInclude(),
      });
    });
  }

  async forward(userId: number, requestId: number, dto: ForwardWorkflowRequestDto) {
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        role: { select: { name: true } },
      },
    });

    if (!actor || actor.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User is inactive or not found.');
    }

    const actorRole = actor.role?.name?.toLowerCase();
    if (actorRole !== 'internal_manager' && actorRole !== 'ceo') {
      throw new ForbiddenException('Only managers and CEO are authorized to forward workflow requests.');
    }

    if (!dto.targetUserId && !dto.targetDepartmentId) {
      throw new BadRequestException('Must specify either targetUserId or targetDepartmentId.');
    }

    if (dto.targetUserId && dto.targetDepartmentId) {
      throw new BadRequestException('Cannot specify both targetUserId and targetDepartmentId.');
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.workflowRequest.findUnique({
        where: { id: requestId },
        include: {
          steps: { orderBy: { stepOrder: 'asc' } },
        },
      });

      if (!request) {
        throw new NotFoundException('Workflow request not found.');
      }

      if (request.status !== WorkflowRequestStatus.PENDING && request.status !== WorkflowRequestStatus.IN_PROGRESS) {
        throw new BadRequestException('Can only forward active workflow requests.');
      }

      let targetUserId = dto.targetUserId;

      if (dto.targetDepartmentId) {
        const managerInDept = await tx.user.findFirst({
          where: {
            departmentId: dto.targetDepartmentId,
            status: UserStatus.ACTIVE,
            role: {
              name: {
                equals: 'internal_manager',
                mode: 'insensitive',
              },
            },
          },
          select: { id: true },
        });

        if (!managerInDept) {
          throw new BadRequestException('No active internal manager found in the specified department.');
        }

        targetUserId = managerInDept.id;
      }

      const targetUser = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, status: true },
      });

      if (!targetUser || targetUser.status !== UserStatus.ACTIVE) {
        throw new BadRequestException('Target assignee user is inactive or does not exist.');
      }

      const currentStep = request.steps.find((s) => s.stepOrder === request.currentStepOrder);
      if (!currentStep) {
        throw new Error('Current workflow step not found.');
      }

      const now = new Date();

      const updateResult = await tx.workflowRequest.updateMany({
        where: { id: requestId, version: request.version },
        data: {
          currentAssigneeId: targetUserId,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException('The request was updated by another operation.');
      }

      await tx.workflowRequestStep.update({
        where: { id: currentStep.id },
        data: {
          assigneeId: targetUserId,
        },
      });

      await tx.workflowRequestAssignment.updateMany({
        where: { requestId, status: WorkflowAssignmentStatus.ACTIVE },
        data: {
          status: WorkflowAssignmentStatus.ENDED,
          endedAt: now,
        },
      });

      await tx.workflowRequestAssignment.create({
        data: {
          requestId,
          stepId: currentStep.id,
          assigneeId: targetUserId!,
          assignedById: userId,
          status: WorkflowAssignmentStatus.ACTIVE,
          assignedAt: now,
          reason: `Forwarded by ${actorRole}`,
        },
      });

      await tx.workflowRequestAction.create({
        data: {
          requestId,
          stepId: currentStep.id,
          actorId: userId,
          action: WorkflowActionType.REFERRED,
          fromStatus: request.status,
          toStatus: request.status,
          fromAssigneeId: request.currentAssigneeId,
          toAssigneeId: targetUserId,
          comment: dto.comment?.trim() || null,
        },
      });

      return tx.workflowRequest.findUnique({
        where: { id: requestId },
        include: this.getRequestInclude(),
      });
    });
  }

  async findAll(userId: number, query: ListWorkflowRequestsDto) {
    const actor = await this.ensureActiveUser(userId);
    const actorRole = actor.role?.name?.toLowerCase();
    const isCeo = actorRole === 'ceo';

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const scope = query.scope ?? WorkflowRequestListScope.ALL;

    // اگر کاربر مدیرعامل باشد فیلتر حریم شخصی اعمال نمی‌شود و کل درخواست‌ها را رصد می‌کند.
    const visibilityWhere: Prisma.WorkflowRequestWhereInput = isCeo
      ? {}
      : scope === WorkflowRequestListScope.CREATED_BY_ME
        ? { creatorId: userId }
        : scope === WorkflowRequestListScope.ASSIGNED_TO_ME
          ? { currentAssigneeId: userId }
          : {
              OR: [
                { creatorId: userId },
                { currentAssigneeId: userId },
                { assignments: { some: { assigneeId: userId } } },
              ],
            };

    // پیاده‌سازی فیلتر جستجوی کد درخواست، عنوان و متن
    const searchFilter: Prisma.WorkflowRequestWhereInput = query.search
      ? {
          OR: [
            { requestNumber: { contains: query.search.trim(), mode: 'insensitive' } },
            { title: { contains: query.search.trim(), mode: 'insensitive' } },
            { description: { contains: query.search.trim(), mode: 'insensitive' } },
          ],
        }
      : {};

    const where: Prisma.WorkflowRequestWhereInput = {
      AND: [
        visibilityWhere,
        searchFilter,
        query.status ? { status: query.status } : {},
        query.type ? { type: query.type } : {},
        query.workflowDefinitionId ? { workflowDefinitionId: query.workflowDefinitionId } : {},
        query.departmentId ? { departmentId: query.departmentId } : {},
      ],
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.workflowRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          workflowDefinition: {
            select: {
              id: true,
              code: true,
              title: true,
              type: true,
              isManual: true,
              isActive: true,
            },
          },
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              positionTitle: true,
            },
          },
          department: {
            select: { id: true, name: true },
          },
          currentAssignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              positionTitle: true,
            },
          },
          _count: {
            select: {
              steps: true,
              actions: true,
              assignments: true,
              attachments: true,
            },
          },
        },
      }),
      this.prisma.workflowRequest.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async findOne(userId: number, requestId: number) {
    const actor = await this.ensureActiveUser(userId);
    const actorRole = actor.role?.name?.toLowerCase();
    const isCeo = actorRole === 'ceo';

    const request = await this.prisma.workflowRequest.findUnique({
      where: { id: requestId },
      include: this.getRequestInclude(),
    });

    if (!request) {
      throw new NotFoundException(`Workflow request with id ${requestId} not found.`);
    }

    if (!isCeo) {
      const hasAssignment = request.assignments.some((assignment) => assignment.assigneeId === userId);
      const isAllowed = request.creatorId === userId || request.currentAssigneeId === userId || hasAssignment;

      if (!isAllowed) {
        throw new ForbiddenException('You do not have permission to view this workflow request.');
      }
    }

    return request;
  }

  // --- Helper Methods ---

  private async resolveStepAssignee(
    tx: Prisma.TransactionClient,
    creator: { id: number; status: UserStatus; managerId: number | null },
    step: {
      id: number;
      code: string;
      title: string;
      stepOrder: number;
      assigneeType: WorkflowAssigneeType;
      stepDefinition: { id: number; roleId: number | null; isActive: boolean } | null;
    },
    manualAssigneeId?: number,
  ): Promise<number> {
    switch (step.assigneeType) {
      case WorkflowAssigneeType.DIRECT_MANAGER: {
        if (!creator.managerId) {
          throw new BadRequestException('سازنده درخواست مدیر مستقیم ثبت شده ندارد.');
        }

        const manager = await tx.user.findUnique({
          where: { id: creator.managerId },
          select: { id: true, status: true },
        });

        if (!manager || manager.status !== UserStatus.ACTIVE) {
          throw new BadRequestException('مدیر مستقیم سازنده غیرفعال یا یافت نشد.');
        }

        return manager.id;
      }

      case WorkflowAssigneeType.ROLE: {
        const roleId = step.stepDefinition?.roleId ?? null;

        if (!roleId) {
          throw new BadRequestException(`نقشی برای مرحله "${step.title}" تعریف نشده است.`);
        }

        const roleAssignee = await tx.user.findFirst({
          where: { roleId, status: UserStatus.ACTIVE },
          orderBy: { id: 'asc' },
          select: { id: true },
        });

        if (!roleAssignee) {
          throw new BadRequestException(`کاربر فعالی برای نقش مورد نظر در مرحله "${step.title}" یافت نشد.`);
        }

        return roleAssignee.id;
      }

      case WorkflowAssigneeType.MANUAL: {
        if (!manualAssigneeId) {
          throw new BadRequestException('انتخاب دستی گیرنده برای این مرحله الزامی است.');
        }

        const manualAssignee = await tx.user.findUnique({
          where: { id: manualAssigneeId },
          select: { id: true, status: true },
        });

        if (!manualAssignee || manualAssignee.status !== UserStatus.ACTIVE) {
          throw new NotFoundException(`کاربر انتخاب شده غیرفعال یا یافت نشد.`);
        }

        return manualAssignee.id;
      }

      default:
        throw new BadRequestException(`نوع تعیین گیرنده "${step.assigneeType}" پشتیبانی نمی‌شود.`);
    }
  }

  private getRequestInclude() {
    return {
      workflowDefinition: {
        select: {
          id: true,
          code: true,
          title: true,
          description: true,
          type: true,
          isManual: true,
          isActive: true,
        },
      },
      creator: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          positionTitle: true,
          departmentId: true,
        },
      },
      department: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
      currentAssignee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          positionTitle: true,
          departmentId: true,
          roleId: true,
        },
      },
      steps: {
        orderBy: { stepOrder: 'asc' as const },
        include: {
          stepDefinition: {
            select: {
              id: true,
              description: true,
              roleId: true,
              canReject: true,
              canReturn: true,
              requiresApprovalComment: true,
            },
          },
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              positionTitle: true,
            },
          },
          actedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
          assignments: {
            orderBy: { assignedAt: 'desc' as const },
            include: {
              assignee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  username: true,
                  positionTitle: true,
                },
              },
              assignedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  username: true,
                },
              },
            },
          },
        },
      },
      actions: {
        orderBy: { createdAt: 'asc' as const },
        include: {
          actor: {
            select: { id: true, firstName: true, lastName: true, username: true },
          },
          fromAssignee: {
            select: { id: true, firstName: true, lastName: true, username: true },
          },
          toAssignee: {
            select: { id: true, firstName: true, lastName: true, username: true },
          },
        },
      },
      assignments: {
        orderBy: { assignedAt: 'asc' as const },
        include: {
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              positionTitle: true,
            },
          },
          assignedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
        },
      },
      attachments: {
        orderBy: { createdAt: 'desc' as const },
        include: {
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true, username: true },
          },
        },
      },
    } satisfies Prisma.WorkflowRequestInclude;
  }

  private async ensureActiveUser(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        role: { select: { name: true } },
      },
    });

    if (!user) {
      throw new ForbiddenException(`User with id ${userId} does not exist.`);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('The current user is inactive.');
    }

    return user;
  }

  private async generateRequestNumber() {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    const randomPart = Math.floor(1000 + Math.random() * 9000);

    return ['WR', year, month, day, hours, minutes, seconds, milliseconds, randomPart].join('-');
  }
}