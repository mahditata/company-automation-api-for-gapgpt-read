import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WorkflowAssigneeType,
  WorkflowRequestType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDefinitionDto } from './dto/create-workflow-definition.dto';
import { CreateWorkflowStepDefinitionDto } from './dto/create-workflow-step-definition.dto';
import { UpdateWorkflowDefinitionDto } from './dto/update-workflow-definition.dto';
import { UpdateWorkflowStepDefinitionDto } from './dto/update-workflow-step-definition.dto';

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  async createWorkflowDefinition(
    userId: number,
    dto: CreateWorkflowDefinitionDto,
  ) {
    await this.ensureUserExists(userId);

    const existingByCode =
      await this.prisma.workflowDefinition.findUnique({
        where: { code: dto.code },
      });

    if (existingByCode) {
      throw new BadRequestException(
        `Workflow code "${dto.code}" already exists.`,
      );
    }

    const existingByType =
      await this.prisma.workflowDefinition.findUnique({
        where: { type: dto.type },
      });

    if (existingByType) {
      throw new BadRequestException(
        `A workflow for type "${dto.type}" already exists.`,
      );
    }

    // ولیدیشن فیلد isManual بر اساس قوانین کسب‌وکار
    const isPredefined = dto.type !== WorkflowRequestType.GENERAL;
    const isManual = isPredefined ? false : (dto.isManual ?? false);

    return this.prisma.workflowDefinition.create({
      data: {
        code: dto.code,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        isManual,
        isActive: dto.isActive ?? true,
      },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
        },
      },
    });
  }

  async findAllWorkflowDefinitions(
    isActive?: boolean,
    type?: WorkflowRequestType,
  ) {
    return this.prisma.workflowDefinition.findMany({
      where: {
        ...(isActive !== undefined ? { isActive } : {}),
        ...(type !== undefined ? { type } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
        },
      },
    });
  }

  async findWorkflowDefinitionById(id: number) {
    const workflow =
      await this.prisma.workflowDefinition.findUnique({
        where: { id },
        include: {
          steps: {
            orderBy: { stepOrder: 'asc' },
          },
        },
      });

    if (!workflow) {
      throw new NotFoundException(
        `Workflow definition with id ${id} not found.`,
      );
    }

    return workflow;
  }

  async updateWorkflowDefinition(
    userId: number,
    id: number,
    dto: UpdateWorkflowDefinitionDto,
  ) {
    await this.ensureUserExists(userId);
    const existingWorkflow = await this.findWorkflowDefinitionById(id);

    if (dto.code !== undefined) {
      const duplicate =
        await this.prisma.workflowDefinition.findFirst({
          where: {
            code: dto.code,
            id: { not: id },
          },
        });

      if (duplicate) {
        throw new BadRequestException(
          `Workflow code "${dto.code}" already exists.`,
        );
      }
    }

    const nextType = dto.type !== undefined ? dto.type : existingWorkflow.type;

    if (dto.type !== undefined) {
      const duplicate =
        await this.prisma.workflowDefinition.findFirst({
          where: {
            type: dto.type,
            id: { not: id },
          },
        });

      if (duplicate) {
        throw new BadRequestException(
          `A workflow for type "${dto.type}" already exists.`,
        );
      }
    }

    const isPredefined = nextType !== WorkflowRequestType.GENERAL;
    let isManual = dto.isManual;
    if (isPredefined) {
      isManual = false;
    }

    return this.prisma.workflowDefinition.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(isManual !== undefined
          ? { isManual }
          : {}),
        ...(dto.isActive !== undefined
          ? { isActive: dto.isActive }
          : {}),
      },
      include: {
        steps: {
          orderBy: { stepOrder: 'asc' },
        },
      },
    });
  }

  async removeWorkflowDefinition(userId: number, id: number) {
    await this.ensureUserExists(userId);
    await this.findWorkflowDefinitionById(id);

    const requestCount =
      await this.prisma.workflowRequest.count({
        where: {
          workflowDefinitionId: id,
        },
      });

    if (requestCount > 0) {
      throw new BadRequestException(
        'This workflow cannot be deleted because it is used by workflow requests. Deactivate it instead.',
      );
    }

    return this.prisma.workflowDefinition.delete({
      where: { id },
    });
  }

  async createWorkflowStepDefinition(
    userId: number,
    workflowDefinitionId: number,
    dto: CreateWorkflowStepDefinitionDto,
  ) {
    await this.ensureUserExists(userId);
    await this.findWorkflowDefinitionById(workflowDefinitionId);

    await this.validateRoleAndAssigneeType(
      dto.assigneeType,
      dto.roleId,
    );

    const duplicateOrder =
      await this.prisma.workflowStepDefinition.findFirst({
        where: {
          workflowDefinitionId,
          stepOrder: dto.stepOrder,
        },
      });

    if (duplicateOrder) {
      throw new BadRequestException(
        `Step order ${dto.stepOrder} already exists in this workflow.`,
      );
    }

    const duplicateCode =
      await this.prisma.workflowStepDefinition.findFirst({
        where: {
          workflowDefinitionId,
          code: dto.code,
        },
      });

    if (duplicateCode) {
      throw new BadRequestException(
        `Step code "${dto.code}" already exists in this workflow.`,
      );
    }

    return this.prisma.workflowStepDefinition.create({
      data: {
        workflowDefinitionId,
        stepOrder: dto.stepOrder,
        code: dto.code,
        title: dto.title,
        description: dto.description,
        assigneeType: dto.assigneeType,
        roleId: dto.roleId,
        canReject: dto.canReject ?? true,
        canReturn: dto.canReturn ?? true,
        requiresApprovalComment:
          dto.requiresApprovalComment ?? false,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findWorkflowSteps(workflowDefinitionId: number) {
    await this.findWorkflowDefinitionById(workflowDefinitionId);

    return this.prisma.workflowStepDefinition.findMany({
      where: { workflowDefinitionId },
      orderBy: { stepOrder: 'asc' },
    });
  }

  async findWorkflowStepById(
    workflowDefinitionId: number,
    stepId: number,
  ) {
    const step =
      await this.prisma.workflowStepDefinition.findFirst({
        where: {
          id: stepId,
          workflowDefinitionId,
        },
      });

    if (!step) {
      throw new NotFoundException(
        `Workflow step with id ${stepId} not found.`,
      );
    }

    return step;
  }

  async updateWorkflowStepDefinition(
    userId: number,
    workflowDefinitionId: number,
    stepId: number,
    dto: UpdateWorkflowStepDefinitionDto,
  ) {
    await this.ensureUserExists(userId);

    const currentStep = await this.findWorkflowStepById(
      workflowDefinitionId,
      stepId,
    );

    if (
      dto.assigneeType !== undefined ||
      dto.roleId !== undefined
    ) {
      const nextAssigneeType =
        dto.assigneeType ?? currentStep.assigneeType;

      const nextRoleId =
        dto.roleId !== undefined
          ? dto.roleId
          : currentStep.roleId;

      await this.validateRoleAndAssigneeType(
        nextAssigneeType,
        nextRoleId,
      );
    }

    if (dto.stepOrder !== undefined) {
      const duplicateOrder =
        await this.prisma.workflowStepDefinition.findFirst({
          where: {
            workflowDefinitionId,
            stepOrder: dto.stepOrder,
            id: { not: stepId },
          },
        });

      if (duplicateOrder) {
        throw new BadRequestException(
          `Step order ${dto.stepOrder} already exists in this workflow.`,
        );
      }
    }

    if (dto.code !== undefined) {
      const duplicateCode =
        await this.prisma.workflowStepDefinition.findFirst({
          where: {
            workflowDefinitionId,
            code: dto.code,
            id: { not: stepId },
          },
        });

      if (duplicateCode) {
        throw new BadRequestException(
          `Step code "${dto.code}" already exists in this workflow.`,
        );
      }
    }

    return this.prisma.workflowStepDefinition.update({
      where: { id: stepId },
      data: {
        ...(dto.stepOrder !== undefined
          ? { stepOrder: dto.stepOrder }
          : {}),
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.assigneeType !== undefined
          ? { assigneeType: dto.assigneeType }
          : {}),
        ...(dto.roleId !== undefined
          ? { roleId: dto.roleId }
          : {}),
        ...(dto.canReject !== undefined
          ? { canReject: dto.canReject }
          : {}),
        ...(dto.canReturn !== undefined
          ? { canReturn: dto.canReturn }
          : {}),
        ...(dto.requiresApprovalComment !== undefined
          ? {
              requiresApprovalComment:
                dto.requiresApprovalComment,
            }
          : {}),
        ...(dto.isActive !== undefined
          ? { isActive: dto.isActive }
          : {}),
      },
    });
  }

  async removeWorkflowStepDefinition(
    userId: number,
    workflowDefinitionId: number,
    stepId: number,
  ) {
    await this.ensureUserExists(userId);

    await this.findWorkflowStepById(
      workflowDefinitionId,
      stepId,
    );

    const requestStepCount =
      await this.prisma.workflowRequestStep.count({
        where: {
          stepDefinitionId: stepId,
        },
      });

    if (requestStepCount > 0) {
      throw new BadRequestException(
        'This workflow step cannot be deleted because it is used by workflow requests. Deactivate it instead.',
      );
    }

    return this.prisma.workflowStepDefinition.delete({
      where: { id: stepId },
    });
  }

  private async validateRoleAndAssigneeType(
    assigneeType: WorkflowAssigneeType,
    roleId?: number | null,
  ) {
    if (
      assigneeType === WorkflowAssigneeType.ROLE &&
      !roleId
    ) {
      throw new BadRequestException(
        'roleId is required when assigneeType is ROLE.',
      );
    }

    if (
      assigneeType !== WorkflowAssigneeType.ROLE &&
      roleId
    ) {
      throw new BadRequestException(
        'roleId can only be set when assigneeType is ROLE.',
      );
    }

    if (roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        throw new NotFoundException(
          `Role with id ${roleId} not found.`,
        );
      }
    }
  }

  private async ensureUserExists(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new ForbiddenException(
        `User with id ${userId} does not exist.`,
      );
    }
  }
}
