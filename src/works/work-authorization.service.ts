import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkTaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkAuthorizationService {
  private readonly globalViewerIds = new Set<number>([10, 11]);

  constructor(private readonly prisma: PrismaService) {}

  isGlobalViewer(userId: number): boolean {
    return this.globalViewerIds.has(userId);
  }

  async getAccessibleWorkOrThrow(
    workId: number,
    userId: number,
    options?: {
      includeDeleted?: boolean;
    },
  ) {
    const work = await this.prisma.work.findUnique({
      where: {
        id: workId,
      },
      include: {
        members: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!work) {
      throw new NotFoundException('Work not found');
    }

    const isCreator = work.creatorId === userId;
    const isMember = work.members.some((member) => member.userId === userId);
    const isGlobalViewer = this.isGlobalViewer(userId);

    if (work.deletedAt) {
      const canSeeDeleted =
        options?.includeDeleted === true &&
        (isCreator || isGlobalViewer);

      if (!canSeeDeleted) {
        throw new NotFoundException('Work not found');
      }
    }

    if (!isCreator && !isMember && !isGlobalViewer) {
      throw new ForbiddenException(
        'You do not have access to this work',
      );
    }

    return work;
  }

  async assertCanViewWork(
    workId: number,
    userId: number,
    includeDeleted = false,
  ) {
    return this.getAccessibleWorkOrThrow(workId, userId, {
      includeDeleted,
    });
  }

  async assertCanManageWork(workId: number, userId: number) {
    const work = await this.getAccessibleWorkOrThrow(workId, userId, {
      includeDeleted: false,
    });

    if (work.creatorId !== userId) {
      throw new ForbiddenException(
        'Only the work creator can manage this work',
      );
    }

    return work;
  }

  async assertCanDeleteWork(workId: number, userId: number) {
    return this.assertCanManageWork(workId, userId);
  }

  async assertCanRestoreWork(workId: number, userId: number) {
    const work = await this.prisma.work.findUnique({
      where: {
        id: workId,
      },
      select: {
        id: true,
        creatorId: true,
        deletedAt: true,
      },
    });

    if (!work) {
      throw new NotFoundException('Work not found');
    }

    if (work.creatorId !== userId) {
      throw new ForbiddenException(
        'Only the work creator can restore this work',
      );
    }

    return work;
  }

  async getAccessibleTaskOrThrow(taskId: number, userId: number) {
    const task = await this.prisma.workTask.findUnique({
      where: {
        id: taskId,
      },
      include: {
        work: {
          include: {
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!task || task.work.deletedAt) {
      throw new NotFoundException('Work task not found');
    }

    const isCreator = task.work.creatorId === userId;
    const isMember = task.work.members.some(
      (member) => member.userId === userId,
    );
    const isAssignee = task.assigneeId === userId;
    const isGlobalViewer = this.isGlobalViewer(userId);

    if (!isCreator && !isMember && !isAssignee && !isGlobalViewer) {
      throw new ForbiddenException(
        'You do not have access to this work task',
      );
    }

    return task;
  }

  async assertCanManageTask(taskId: number, userId: number) {
    const task = await this.getAccessibleTaskOrThrow(taskId, userId);

    if (task.work.creatorId !== userId) {
      throw new ForbiddenException(
        'Only the work creator can manage this task',
      );
    }

    return task;
  }

  async assertCanSubmitTask(taskId: number, userId: number) {
    const task = await this.getAccessibleTaskOrThrow(taskId, userId);

    const isAssignee = task.assigneeId === userId;
    const creatorIsAssignee =
      task.work.creatorId === userId && task.assigneeId === userId;

    if (!isAssignee && !creatorIsAssignee) {
      throw new ForbiddenException(
        'Only the task assignee can submit this task',
      );
    }

    const allowedStatuses: WorkTaskStatus[] = [
      WorkTaskStatus.TODO,
      WorkTaskStatus.IN_PROGRESS,
      WorkTaskStatus.NEEDS_REVISION,
    ];

    if (!allowedStatuses.includes(task.status)) {
      throw new ForbiddenException(
        `Task cannot be submitted from status ${task.status}`,
      );
    }

    return task;
  }

  async assertCanReviewTask(taskId: number, userId: number) {
    const task = await this.getAccessibleTaskOrThrow(taskId, userId);

    if (task.work.creatorId !== userId) {
      throw new ForbiddenException(
        'Only the work creator can review this task',
      );
    }

    if (task.status !== WorkTaskStatus.PENDING_APPROVAL) {
      throw new ForbiddenException(
        'Only tasks pending approval can be reviewed',
      );
    }

    return task;
  }

  async assertCanChangeTaskStatus(taskId: number, userId: number) {
    const task = await this.getAccessibleTaskOrThrow(taskId, userId);

    const isCreator = task.work.creatorId === userId;
    const isAssignee = task.assigneeId === userId;

    if (!isCreator && !isAssignee) {
      throw new ForbiddenException(
        'Only the work creator or task assignee can change task status',
      );
    }

    return task;
  }

  async assertCanComment(workId: number, userId: number) {
    return this.getAccessibleWorkOrThrow(workId, userId, {
      includeDeleted: false,
    });
  }
}
