import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  WorkActivityType,
  WorkStatus,
  WorkTaskStatus,
  WorkType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddWorkMemberDto } from './dto/add-work-member.dto';
import { CreateWorkCommentDto } from './dto/create-work-comment.dto';
import { CreateWorkDto } from './dto/create-work.dto';
import { CreateWorkTaskDto } from './dto/create-work-task.dto';
import {
  ListWorksDto,
  SortOrder,
  WorkSortBy,
} from './dto/list-works.dto';
import {
  WorkTaskReviewDecision,
  ReviewWorkTaskDto,
} from './dto/review-work-task.dto';
import { SubmitWorkTaskDto } from './dto/submit-work-task.dto';
import { UpdateWorkDto } from './dto/update-work.dto';
import { UpdateWorkTaskDto } from './dto/update-work-task.dto';
import { UpdateWorkTaskStatusDto } from './dto/update-work-task-status.dto';
import { WorkAuthorizationService } from './work-authorization.service';
import { WorkNotificationsService } from './work-notifications.service';

type TransactionClient = Prisma.TransactionClient;

const workDetailsInclude = Prisma.validator<Prisma.WorkInclude>()({
  creator: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
    },
  },
  members: {
    orderBy: {
      createdAt: 'asc',
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
        },
      },
    },
  },
  tasks: {
    orderBy: {
      createdAt: 'asc',
    },
    include: {
      assignee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
        },
      },
    },
  },
  dailySchedule: true,
  _count: {
    select: {
      comments: true,
      attachments: true,
      activities: true,
      occurrences: true,
    },
  },
});

@Injectable()
export class WorksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkAuthorizationService,
    private readonly notifications: WorkNotificationsService,
  ) {}

  async create(userId: number, dto: CreateWorkDto) {
    if (dto.type === WorkType.DAILY) {
      throw new BadRequestException(
        'Use the daily works endpoint to create a daily work',
      );
    }

    const memberIds = this.normalizeIds(dto.memberIds);
    const assigneeIds = this.normalizeIds(
      dto.tasks?.map((task) => task.assigneeId),
    );

    await this.assertUsersExist([...memberIds, ...assigneeIds]);

    return this.prisma.$transaction(async (tx) => {
      const work = await tx.work.create({
        data: {
          title: dto.title,
          description: dto.description,
          type: WorkType.NORMAL,
          creatorId: userId,
          deadline: dto.deadline ? new Date(dto.deadline) : null,
          members:
            memberIds.length > 0
              ? {
                  create: memberIds.map((memberId) => ({
                    userId: memberId,
                  })),
                }
              : undefined,
          tasks:
            dto.tasks && dto.tasks.length > 0
              ? {
                  create: dto.tasks.map((task) => ({
                    title: task.title,
                    description: task.description,
                    deadline: task.deadline
                      ? new Date(task.deadline)
                      : null,
                    assigneeId: task.assigneeId,
                    status: WorkTaskStatus.TODO,
                  })),
                }
              : undefined,
          activities: {
            create: {
              userId,
              type: WorkActivityType.CREATED,
              description: 'Work created',
            },
          },
        },
        include: workDetailsInclude,
      });

      const notificationRecipientIds = this.normalizeIds([
        ...memberIds,
        ...assigneeIds,
      ]);

      await this.notifications.notifyWorkCreated(
        work.id,
        work.title,
        notificationRecipientIds,
        userId,
        tx,
      );

      return work;
    });
  }

  async findAll(userId: number, query: ListWorksDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const includeDeleted = query.includeDeleted === true;
    const isGlobalViewer = this.authorization.isGlobalViewer(userId);

    const accessConditions: Prisma.WorkWhereInput[] = [
      { creatorId: userId },
      { members: { some: { userId } } },
      { tasks: { some: { assigneeId: userId } } },
    ];

    const where: Prisma.WorkWhereInput = {
      AND: [
        isGlobalViewer ? {} : { OR: accessConditions },
        includeDeleted
          ? isGlobalViewer
            ? {}
            : { OR: [{ deletedAt: null }, { creatorId: userId }] }
          : { deletedAt: null },
        query.search
          ? {
              OR: [
                {
                  title: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
                {
                  description: {
                    contains: query.search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {},
        query.type ? { type: query.type } : {},
        query.status ? { status: query.status } : {},
        query.creatorId ? { creatorId: query.creatorId } : {},
        query.memberId
          ? { members: { some: { userId: query.memberId } } }
          : {},
        query.assigneeId
          ? { tasks: { some: { assigneeId: query.assigneeId } } }
          : {},
        query.fromDate || query.toDate
          ? {
              createdAt: {
                ...(query.fromDate
                  ? { gte: new Date(query.fromDate) }
                  : {}),
                ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
              },
            }
          : {},
        query.overdue
          ? {
              deadline: {
                lt: new Date(),
              },
              status: {
                not: WorkStatus.COMPLETED,
              },
            }
          : {},
      ],
    };

    const sortBy = query.sortBy ?? WorkSortBy.CREATED_AT;
    const sortOrder = query.sortOrder ?? SortOrder.DESC;

    const orderBy: Prisma.WorkOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.work.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: workDetailsInclude,
      }),
      this.prisma.work.count({ where }),
    ]);

    return {
      items,
      pagination: this.createPagination(page, limit, total),
    };
  }

  async findOne(workId: number, userId: number, includeDeleted = false) {
    await this.authorization.assertCanViewWork(
      workId,
      userId,
      includeDeleted,
    );

    const work = await this.prisma.work.findUnique({
      where: { id: workId },
      include: workDetailsInclude,
    });

    if (!work) {
      throw new NotFoundException('Work not found');
    }

    return work;
  }

  async update(workId: number, userId: number, dto: UpdateWorkDto) {
    const currentWork = await this.authorization.assertCanManageWork(
      workId,
      userId,
    );

    const updatedWork = await this.prisma.$transaction(async (tx) => {
      const work = await tx.work.update({
        where: { id: workId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.deadline !== undefined
            ? {
                deadline: dto.deadline ? new Date(dto.deadline) : null,
              }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          activities: {
            create: {
              userId,
              type:
                dto.status !== undefined &&
                dto.status !== currentWork.status
                  ? WorkActivityType.STATUS_CHANGED
                  : WorkActivityType.UPDATED,
              description:
                dto.status !== undefined &&
                dto.status !== currentWork.status
                  ? `Work status changed from ${currentWork.status} to ${dto.status}`
                  : 'Work updated',
              metadata:
                dto.status !== undefined &&
                dto.status !== currentWork.status
                  ? {
                      previousStatus: currentWork.status,
                      nextStatus: dto.status,
                    }
                  : undefined,
            },
          },
        },
        include: workDetailsInclude,
      });

      if (
        dto.status !== undefined &&
        dto.status !== currentWork.status
      ) {
        await this.notifications.notifyWorkStatusChanged(
          work.id,
          work.title,
          dto.status,
          this.getWorkRecipientIds(work),
          userId,
          tx,
        );
      }

      return work;
    });

    return updatedWork;
  }

  async softDelete(workId: number, userId: number) {
    const work = await this.authorization.assertCanDeleteWork(workId, userId);

    if (work.deletedAt) {
      throw new BadRequestException('Work is already deleted');
    }

    return this.prisma.work.update({
      where: { id: workId },
      data: {
        deletedAt: new Date(),
        activities: {
          create: {
            userId,
            type: WorkActivityType.DELETED,
            description: 'Work deleted',
          },
        },
      },
      include: workDetailsInclude,
    });
  }

  async restore(workId: number, userId: number) {
    const work = await this.authorization.assertCanRestoreWork(workId, userId);

    if (!work.deletedAt) {
      throw new BadRequestException('Work is not deleted');
    }

    return this.prisma.work.update({
      where: { id: workId },
      data: {
        deletedAt: null,
        activities: {
          create: {
            userId,
            type: WorkActivityType.RESTORED,
            description: 'Work restored',
          },
        },
      },
      include: workDetailsInclude,
    });
  }

  async addMembers(
    workId: number,
    userId: number,
    dto: AddWorkMemberDto,
  ) {
    const work = await this.authorization.assertCanManageWork(workId, userId);
    const userIds = this.normalizeIds(dto.userIds).filter(
      (memberId) => memberId !== work.creatorId,
    );

    await this.assertUsersExist(userIds);

    const existingMembers = await this.prisma.workMember.findMany({
      where: {
        workId,
        userId: {
          in: userIds,
        },
      },
      select: {
        userId: true,
      },
    });

    const existingMemberIds = new Set(
      existingMembers.map((member) => member.userId),
    );
    const newMemberIds = userIds.filter(
      (memberId) => !existingMemberIds.has(memberId),
    );

    if (newMemberIds.length === 0) {
      return this.findOne(workId, userId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workMember.createMany({
        data: newMemberIds.map((memberId) => ({
          workId,
          userId: memberId,
        })),
        skipDuplicates: true,
      });

      await tx.workActivity.create({
        data: {
          workId,
          userId,
          type: WorkActivityType.MEMBER_ADDED,
          description: 'Work members added',
          metadata: {
            userIds: newMemberIds,
          },
        },
      });

      await this.notifications.notifyWorkAssigned(
        workId,
        work.title,
        newMemberIds,
        userId,
        tx,
      );
    });

    return this.findOne(workId, userId);
  }

  async removeMember(
    workId: number,
    memberId: number,
    userId: number,
  ) {
    await this.authorization.assertCanManageWork(workId, userId);

    const member = await this.prisma.workMember.findUnique({
      where: {
        workId_userId: {
          workId,
          userId: memberId,
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Work member not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workMember.delete({
        where: {
          workId_userId: {
            workId,
            userId: memberId,
          },
        },
      });

      await tx.workActivity.create({
        data: {
          workId,
          userId,
          type: WorkActivityType.MEMBER_REMOVED,
          description: 'Work member removed',
          metadata: {
            memberId,
          },
        },
      });
    });

    return this.findOne(workId, userId);
  }

  async createTask(
    workId: number,
    userId: number,
    dto: CreateWorkTaskDto,
  ) {
    const work = await this.authorization.assertCanManageWork(workId, userId);

    if (work.type !== WorkType.NORMAL) {
      throw new BadRequestException(
        'Use the daily work task endpoint for daily works',
      );
    }

    if (dto.assigneeId) {
      await this.assertUsersExist([dto.assigneeId]);
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.workTask.create({
        data: {
          workId,
          title: dto.title,
          description: dto.description,
          deadline: dto.deadline ? new Date(dto.deadline) : null,
          assigneeId: dto.assigneeId,
          status: WorkTaskStatus.TODO,
        },
        include: {
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
        },
      });

      await tx.workActivity.create({
        data: {
          workId,
          taskId: task.id,
          userId,
          type: WorkActivityType.TASK_ADDED,
          description: `Task "${task.title}" added`,
        },
      });

      if (task.assigneeId) {
        await this.notifications.notifyWorkAssigned(
          workId,
          work.title,
          [task.assigneeId],
          userId,
          tx,
        );
      }

      await this.recalculateWorkProgress(workId, tx);

      return task;
    });
  }

  async updateTask(
    taskId: number,
    userId: number,
    dto: UpdateWorkTaskDto,
  ) {
    const currentTask = await this.authorization.assertCanManageTask(
      taskId,
      userId,
    );

    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      await this.assertUsersExist([dto.assigneeId]);
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.workTask.update({
        where: { id: taskId },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.deadline !== undefined
            ? {
                deadline: dto.deadline ? new Date(dto.deadline) : null,
              }
            : {}),
          ...(dto.assigneeId !== undefined
            ? { assigneeId: dto.assigneeId }
            : {}),
        },
        include: {
          work: {
            select: {
              id: true,
              title: true,
            },
          },
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
        },
      });

      await tx.workActivity.create({
        data: {
          workId: task.workId,
          taskId: task.id,
          userId,
          type: WorkActivityType.TASK_UPDATED,
          description: `Task "${task.title}" updated`,
        },
      });

      if (
        task.assigneeId &&
        task.assigneeId !== currentTask.assigneeId
      ) {
        await this.notifications.notifyWorkAssigned(
          task.work.id,
          task.work.title,
          [task.assigneeId],
          userId,
          tx,
        );
      }

      return task;
    });
  }

  async removeTask(taskId: number, userId: number) {
    const task = await this.authorization.assertCanManageTask(taskId, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.workActivity.create({
        data: {
          workId: task.workId,
          taskId,
          userId,
          type: WorkActivityType.DELETED,
          description: `Task "${task.title}" deleted`,
        },
      });

      await tx.workTask.delete({
        where: { id: taskId },
      });

      await this.recalculateWorkProgress(task.workId, tx);
    });

    return {
      success: true,
      message: 'Work task deleted successfully',
    };
  }

  async updateTaskStatus(
    taskId: number,
    userId: number,
    dto: UpdateWorkTaskStatusDto,
  ) {
    const currentTask =
      await this.authorization.assertCanChangeTaskStatus(taskId, userId);

    if (currentTask.status === dto.status) {
      return this.getTask(taskId, userId);
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.workTask.update({
        where: { id: taskId },
        data: {
          status: dto.status,
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
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
        },
      });

      await tx.workActivity.create({
        data: {
          workId: task.workId,
          taskId: task.id,
          userId,
          type: WorkActivityType.TASK_STATUS_CHANGED,
          description: `Task status changed from ${currentTask.status} to ${dto.status}`,
          metadata: {
            previousStatus: currentTask.status,
            nextStatus: dto.status,
          },
        },
      });

      if (dto.comment) {
        await this.createCommentRecord(
          tx,
          task.workId,
          userId,
          dto.comment,
          task.id,
        );
      }

      await this.recalculateWorkProgress(task.workId, tx);

      await this.notifications.notifyTaskStatusChanged(
        task.workId,
        task.work.title,
        task.title,
        dto.status,
        this.getWorkRecipientIds(task.work),
        userId,
        tx,
      );

      return task;
    });
  }

  async submitTask(
    taskId: number,
    userId: number,
    dto: SubmitWorkTaskDto,
  ) {
    const currentTask = await this.authorization.assertCanSubmitTask(
      taskId,
      userId,
    );

    if (
      ![
        WorkTaskStatus.TODO,
        WorkTaskStatus.IN_PROGRESS,
        WorkTaskStatus.NEEDS_REVISION,
      ].includes(currentTask.status)
    ) {
      throw new BadRequestException(
        'Only active or revision tasks can be submitted',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.workTask.update({
        where: { id: taskId },
        data: {
          status: WorkTaskStatus.PENDING_APPROVAL,
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
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
        },
      });

      await tx.workActivity.create({
        data: {
          workId: task.workId,
          taskId: task.id,
          userId,
          type: WorkActivityType.TASK_STATUS_CHANGED,
          description: 'Task submitted for approval',
          metadata: {
            previousStatus: currentTask.status,
            nextStatus: WorkTaskStatus.PENDING_APPROVAL,
          },
        },
      });

      if (dto.comment) {
        await this.createCommentRecord(
          tx,
          task.workId,
          userId,
          dto.comment,
          task.id,
        );
      }

      await this.recalculateWorkProgress(task.workId, tx);

      await this.notifications.notifyTaskStatusChanged(
        task.workId,
        task.work.title,
        task.title,
        WorkTaskStatus.PENDING_APPROVAL,
        [task.work.creatorId],
        userId,
        tx,
      );

      return task;
    });
  }

  async reviewTask(
    taskId: number,
    userId: number,
    dto: ReviewWorkTaskDto,
  ) {
    const currentTask = await this.authorization.assertCanReviewTask(
      taskId,
      userId,
    );

    if (currentTask.status !== WorkTaskStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Only tasks pending approval can be reviewed',
      );
    }

    const nextStatus =
      dto.decision === WorkTaskReviewDecision.APPROVE
        ? WorkTaskStatus.COMPLETED
        : WorkTaskStatus.NEEDS_REVISION;

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.workTask.update({
        where: { id: taskId },
        data: {
          status: nextStatus,
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
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
        },
      });

      await tx.workActivity.create({
        data: {
          workId: task.workId,
          taskId: task.id,
          userId,
          type: WorkActivityType.TASK_STATUS_CHANGED,
          description:
            nextStatus === WorkTaskStatus.COMPLETED
              ? 'Task approved'
              : 'Task revision requested',
          metadata: {
            previousStatus: currentTask.status,
            nextStatus,
            decision: dto.decision,
          },
        },
      });

      if (dto.comment) {
        await this.createCommentRecord(
          tx,
          task.workId,
          userId,
          dto.comment,
          task.id,
        );
      }

      await this.recalculateWorkProgress(task.workId, tx);

      if (
        nextStatus === WorkTaskStatus.NEEDS_REVISION &&
        task.assigneeId
      ) {
        await this.notifications.notifyRevisionRequested(
          task.workId,
          task.work.title,
          task.title,
          [task.assigneeId],
          userId,
          tx,
        );
      } else {
        await this.notifications.notifyTaskStatusChanged(
          task.workId,
          task.work.title,
          task.title,
          nextStatus,
          task.assigneeId ? [task.assigneeId] : [],
          userId,
          tx,
        );
      }

      return task;
    });
  }

  async getTask(taskId: number, userId: number) {
    await this.authorization.getAccessibleTaskOrThrow(taskId, userId);

    const task = await this.prisma.workTask.findUnique({
      where: { id: taskId },
      include: {
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        comments: {
          orderBy: {
            createdAt: 'asc',
          },
          include: {
            user: {
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
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            uploadedBy: {
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
    });

    if (!task) {
      throw new NotFoundException('Work task not found');
    }

    return task;
  }

  async addComment(
    workId: number,
    userId: number,
    dto: CreateWorkCommentDto,
  ) {
    const work = await this.authorization.assertCanComment(workId, userId);

    return this.prisma.$transaction(async (tx) => {
      const comment = await this.createCommentRecord(
        tx,
        workId,
        userId,
        dto.text,
      );

      const members = await tx.workMember.findMany({
        where: { workId },
        select: { userId: true },
      });

      await this.notifications.notifyCommentAdded(
        workId,
        work.title,
        this.normalizeIds([
          work.creatorId,
          ...members.map((member) => member.userId),
        ]),
        userId,
        tx,
      );

      return comment;
    });
  }

  async getComments(workId: number, userId: number) {
    await this.authorization.assertCanViewWork(workId, userId);

    return this.prisma.workComment.findMany({
      where: {
        workId,
      },
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
          },
        },
        occurrence: {
          select: {
            id: true,
            date: true,
          },
        },
        dailyWorkTask: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  }

  async getActivities(workId: number, userId: number) {
    await this.authorization.assertCanViewWork(workId, userId);

    return this.prisma.workActivity.findMany({
      where: {
        workId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
          },
        },
        occurrence: {
          select: {
            id: true,
            date: true,
          },
        },
        dailyWorkTask: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  }

  private async recalculateWorkProgress(
    workId: number,
    tx: TransactionClient,
  ) {
    const tasks = await tx.workTask.findMany({
      where: { workId },
      select: { status: true },
    });

    const completedTasks = tasks.filter(
      (task) => task.status === WorkTaskStatus.COMPLETED,
    ).length;

    const progress =
      tasks.length === 0
        ? 0
        : Number(((completedTasks / tasks.length) * 100).toFixed(2));

    let status: WorkStatus;

    if (tasks.length === 0) {
      status = WorkStatus.TODO;
    } else if (completedTasks === tasks.length) {
      status = WorkStatus.COMPLETED;
    } else if (
      tasks.some(
        (task) => task.status === WorkTaskStatus.NEEDS_REVISION,
      )
    ) {
      status = WorkStatus.NEEDS_REVISION;
    } else if (
      tasks.some(
        (task) => task.status === WorkTaskStatus.PENDING_APPROVAL,
      )
    ) {
      status = WorkStatus.PENDING_APPROVAL;
    } else if (
      tasks.some(
        (task) => task.status !== WorkTaskStatus.TODO,
      )
    ) {
      status = WorkStatus.IN_PROGRESS;
    } else {
      status = WorkStatus.TODO;
    }

    return tx.work.update({
      where: { id: workId },
      data: {
        progress,
        status,
      },
      select: {
        id: true,
        progress: true,
        status: true,
      },
    });
  }

  private async createCommentRecord(
    tx: TransactionClient,
    workId: number,
    userId: number,
    text: string,
    taskId?: number,
  ) {
    const comment = await tx.workComment.create({
      data: {
        workId,
        userId,
        taskId,
        text,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
      },
    });

    await tx.workActivity.create({
      data: {
        workId,
        taskId,
        userId,
        type: WorkActivityType.COMMENT_ADDED,
        description: taskId
          ? 'Comment added to work task'
          : 'Comment added to work',
        metadata: {
          commentId: comment.id,
        },
      },
    });

    return comment;
  }

  private async assertUsersExist(userIds: number[]) {
    const uniqueUserIds = this.normalizeIds(userIds);

    if (uniqueUserIds.length === 0) {
      return;
    }

    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: uniqueUserIds,
        },
      },
      select: {
        id: true,
      },
    });

    const existingIds = new Set(users.map((user) => user.id));
    const missingIds = uniqueUserIds.filter(
      (userId) => !existingIds.has(userId),
    );

    if (missingIds.length > 0) {
      throw new BadRequestException(
        `Users not found: ${missingIds.join(', ')}`,
      );
    }
  }

  private normalizeIds(
    values?: Array<number | null | undefined>,
  ): number[] {
    if (!values) {
      return [];
    }

    return [
      ...new Set(
        values.filter(
          (value): value is number =>
            typeof value === 'number' &&
            Number.isInteger(value) &&
            value > 0,
        ),
      ),
    ];
  }

  private getWorkRecipientIds(work: {
    creatorId: number;
    members?: Array<{ userId: number }>;
    tasks?: Array<{ assigneeId: number | null }>;
  }) {
    return this.normalizeIds([
      work.creatorId,
      ...(work.members?.map((member) => member.userId) ?? []),
      ...(work.tasks?.map((task) => task.assigneeId) ?? []),
    ]);
  }

  private createPagination(page: number, limit: number, total: number) {
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }
}
