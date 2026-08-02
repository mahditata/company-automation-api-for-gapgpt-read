import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DailyOccurrenceGenerationType,
  DailyWorkScheduleType,
  Prisma,
  WorkActivityType,
  WorkStatus,
  WorkTaskStatus,
  WorkType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDailyWorkDto } from './dto/create-daily-work.dto';
import { CreateDailyWorkTaskDto } from './dto/create-daily-work-task.dto';
import {
  DailyOccurrenceSortBy,
  DailyOccurrenceSortOrder,
  ListDailyWorkOccurrencesDto,
} from './dto/list-daily-work-occurrences.dto';
import {
  DailyWorkTaskReviewDecision,
  ReviewDailyWorkTaskDto,
} from './dto/review-daily-work-task.dto';
import { SubmitDailyWorkTaskDto } from './dto/submit-daily-work-task.dto';
import { UpdateDailyWorkDto } from './dto/update-daily-work.dto';
import { UpdateDailyWorkTaskDto } from './dto/update-daily-work-task.dto';
import { WorkAuthorizationService } from './work-authorization.service';
import { WorkNotificationsService } from './work-notifications.service';

type TransactionClient = Prisma.TransactionClient;

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
} satisfies Prisma.UserSelect;

const dailyWorkInclude = Prisma.validator<Prisma.WorkInclude>()({
  creator: {
    select: userSelect,
  },
  members: {
    orderBy: {
      createdAt: 'asc',
    },
    include: {
      user: {
        select: userSelect,
      },
    },
  },
  tasks: {
    orderBy: {
      createdAt: 'asc',
    },
    include: {
      assignee: {
        select: userSelect,
      },
    },
  },
  dailySchedule: true,
  _count: {
    select: {
      occurrences: true,
      comments: true,
      attachments: true,
      activities: true,
    },
  },
});

const occurrenceDetailsInclude =
  Prisma.validator<Prisma.DailyWorkOccurrenceInclude>()({
    creator: {
      select: userSelect,
    },
    work: {
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        creatorId: true,
      },
    },
    tasks: {
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        assignee: {
          select: userSelect,
        },
        sourceTask: {
          select: {
            id: true,
            title: true,
          },
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
    },
    _count: {
      select: {
        comments: true,
        attachments: true,
        activities: true,
      },
    },
  });

@Injectable()
export class DailyWorksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkAuthorizationService,
    private readonly notifications: WorkNotificationsService,
  ) {}

  async create(userId: number, dto: CreateDailyWorkDto) {
    const scheduleType =
      dto.scheduleType ?? DailyWorkScheduleType.EVERY_DAY;
    const weekDays = this.resolveWeekDays(scheduleType, dto.weekDays);
    const startDate = this.toUtcDateOnly(dto.startDate);
    const endDate = dto.endDate
      ? this.toUtcDateOnly(dto.endDate)
      : null;

    if (endDate && endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException(
        'endDate cannot be earlier than startDate',
      );
    }

    const memberIds = this.normalizeIds(dto.memberIds).filter(
      (memberId) => memberId !== userId,
    );
    const assigneeIds = this.normalizeIds(
      dto.tasks?.map((task) => task.assigneeId),
    );

    await this.assertUsersExist([...memberIds, ...assigneeIds]);

    return this.prisma.$transaction(async (tx) => {
      const work = await tx.work.create({
        data: {
          title: dto.title,
          description: dto.description,
          type: WorkType.DAILY,
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
                    dailyDeadlineOffsetMinutes:
                      task.dailyDeadlineOffsetMinutes,
                    assigneeId: task.assigneeId,
                    status: WorkTaskStatus.TODO,
                  })),
                }
              : undefined,
          dailySchedule: {
            create: {
              scheduleType,
              weekDays,
              generationHour: dto.generationHour ?? 0,
              generationMinute: dto.generationMinute ?? 5,
              timezone: dto.timezone ?? 'Asia/Tehran',
              startDate,
              endDate,
              isActive: true,
              nextRunAt: this.calculateInitialNextRun(
                startDate,
                dto.generationHour ?? 0,
                dto.generationMinute ?? 5,
              ),
            },
          },
          activities: {
            create: {
              userId,
              type: WorkActivityType.CREATED,
              description: 'Daily work created',
              metadata: {
                scheduleType,
                weekDays,
              },
            },
          },
        },
        include: dailyWorkInclude,
      });

      await this.notifications.notifyWorkCreated(
        work.id,
        work.title,
        this.normalizeIds([...memberIds, ...assigneeIds]),
        userId,
        tx,
      );

      return work;
    });
  }

  async findOne(
    workId: number,
    userId: number,
    includeDeleted = false,
  ) {
    await this.authorization.assertCanViewWork(
      workId,
      userId,
      includeDeleted,
    );

    const work = await this.prisma.work.findFirst({
      where: {
        id: workId,
        type: WorkType.DAILY,
      },
      include: dailyWorkInclude,
    });

    if (!work) {
      throw new NotFoundException('Daily work not found');
    }

    return work;
  }

  async update(
    workId: number,
    userId: number,
    dto: UpdateDailyWorkDto,
  ) {
    const currentWork = await this.assertCanManageDailyWork(
      workId,
      userId,
    );

    return this.prisma.$transaction(async (tx) => {
      const work = await tx.work.update({
        where: {
          id: workId,
        },
        data: {
          ...(dto.title !== undefined
            ? { title: dto.title }
            : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.deadline !== undefined
            ? {
                deadline: dto.deadline
                  ? new Date(dto.deadline)
                  : null,
              }
            : {}),
          ...(dto.status !== undefined
            ? { status: dto.status }
            : {}),
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
                  ? `Daily work status changed from ${currentWork.status} to ${dto.status}`
                  : 'Daily work updated',
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
        include: dailyWorkInclude,
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
  }

  async createTemplateTask(
    workId: number,
    userId: number,
    dto: CreateDailyWorkTaskDto,
  ) {
    const work = await this.assertCanManageDailyWork(workId, userId);

    if (dto.assigneeId) {
      await this.assertUsersExist([dto.assigneeId]);
    }

    if (dto.sourceTaskId) {
      await this.assertSourceTaskBelongsToWork(
        dto.sourceTaskId,
        workId,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.workTask.create({
        data: {
          workId,
          title: dto.title,
          description: dto.description,
          deadline: dto.deadline
            ? new Date(dto.deadline)
            : null,
          dailyDeadlineOffsetMinutes:
            dto.dailyDeadlineOffsetMinutes,
          assigneeId: dto.assigneeId,
          sourceTaskId: dto.sourceTaskId,
          status: WorkTaskStatus.TODO,
        },
        include: {
          assignee: {
            select: userSelect,
          },
          sourceTask: {
            select: {
              id: true,
              title: true,
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
          description: `Daily task template "${task.title}" added`,
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

      return task;
    });
  }

  async updateTemplateTask(
    taskId: number,
    userId: number,
    dto: UpdateDailyWorkTaskDto,
  ) {
    const currentTask =
      await this.authorization.assertCanManageTask(taskId, userId);

    await this.assertDailyWork(currentTask.workId);

    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      await this.assertUsersExist([dto.assigneeId]);
    }

    if (dto.sourceTaskId !== undefined && dto.sourceTaskId !== null) {
      await this.assertSourceTaskBelongsToWork(
        dto.sourceTaskId,
        currentTask.workId,
      );

      if (dto.sourceTaskId === taskId) {
        throw new BadRequestException(
          'A task cannot reference itself as sourceTaskId',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.workTask.update({
        where: {
          id: taskId,
        },
        data: {
          ...(dto.title !== undefined
            ? { title: dto.title }
            : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.deadline !== undefined
            ? {
                deadline: dto.deadline
                  ? new Date(dto.deadline)
                  : null,
              }
            : {}),
          ...(dto.dailyDeadlineOffsetMinutes !== undefined
            ? {
                dailyDeadlineOffsetMinutes:
                  dto.dailyDeadlineOffsetMinutes,
              }
            : {}),
          ...(dto.assigneeId !== undefined
            ? { assigneeId: dto.assigneeId }
            : {}),
          ...(dto.sourceTaskId !== undefined
            ? { sourceTaskId: dto.sourceTaskId }
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
            select: userSelect,
          },
          sourceTask: {
            select: {
              id: true,
              title: true,
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
          description: `Daily task template "${task.title}" updated`,
        },
      });

      if (
        task.assigneeId &&
        task.assigneeId !== currentTask.assigneeId
      ) {
        await this.notifications.notifyWorkAssigned(
          task.workId,
          task.work.title,
          [task.assigneeId],
          userId,
          tx,
        );
      }

      return task;
    });
  }

  async removeTemplateTask(taskId: number, userId: number) {
    const task = await this.authorization.assertCanManageTask(
      taskId,
      userId,
    );

    await this.assertDailyWork(task.workId);

    await this.prisma.$transaction(async (tx) => {
      await tx.workActivity.create({
        data: {
          workId: task.workId,
          userId,
          type: WorkActivityType.DELETED,
          description: `Daily task template "${task.title}" deleted`,
          metadata: {
            taskId,
          },
        },
      });

      await tx.workTask.delete({
        where: {
          id: taskId,
        },
      });
    });

    return {
      success: true,
      message: 'Daily task template deleted successfully',
    };
  }

  async createOccurrenceTask(
    occurrenceId: number,
    userId: number,
    dto: CreateDailyWorkTaskDto,
  ) {
    const occurrence =
      await this.prisma.dailyWorkOccurrence.findUnique({
        where: {
          id: occurrenceId,
        },
        include: {
          work: {
            select: {
              id: true,
              title: true,
              type: true,
              deletedAt: true,
            },
          },
        },
      });

    if (!occurrence || occurrence.work.deletedAt) {
      throw new NotFoundException(
        'Daily work occurrence not found',
      );
    }

    if (occurrence.work.type !== WorkType.DAILY) {
      throw new BadRequestException('Work is not a daily work');
    }

    await this.authorization.assertCanManageWork(
      occurrence.workId,
      userId,
    );

    if (dto.assigneeId) {
      await this.assertUsersExist([dto.assigneeId]);
    }

    if (dto.sourceTaskId) {
      await this.assertSourceTaskBelongsToWork(
        dto.sourceTaskId,
        occurrence.workId,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.dailyWorkTask.create({
        data: {
          occurrenceId,
          title: dto.title,
          description: dto.description,
          deadline: dto.deadline
            ? new Date(dto.deadline)
            : null,
          assigneeId: dto.assigneeId,
          sourceTaskId: dto.sourceTaskId,
          status: WorkTaskStatus.TODO,
        },
        include: {
          assignee: {
            select: userSelect,
          },
          sourceTask: {
            select: {
              id: true,
              title: true,
            },
          },
          occurrence: {
            include: {
              work: {
                select: {
                  id: true,
                  title: true,
                  creatorId: true,
                },
              },
            },
          },
        },
      });

      await tx.workActivity.create({
        data: {
          workId: occurrence.workId,
          occurrenceId,
          dailyWorkTaskId: task.id,
          userId,
          type: WorkActivityType.TASK_ADDED,
          description: `Daily occurrence task "${task.title}" added`,
        },
      });

      if (task.assigneeId) {
        await this.notifications.notifyWorkAssigned(
          occurrence.workId,
          occurrence.work.title,
          [task.assigneeId],
          userId,
          tx,
        );
      }

      await this.recalculateOccurrenceProgress(
        occurrenceId,
        tx,
      );

      return task;
    });
  }

  async updateOccurrenceTask(
    dailyTaskId: number,
    userId: number,
    dto: UpdateDailyWorkTaskDto,
  ) {
    const currentTask = await this.getAccessibleDailyTask(
      dailyTaskId,
      userId,
    );

    await this.authorization.assertCanManageWork(
      currentTask.occurrence.workId,
      userId,
    );

    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      await this.assertUsersExist([dto.assigneeId]);
    }

    if (dto.sourceTaskId !== undefined && dto.sourceTaskId !== null) {
      await this.assertSourceTaskBelongsToWork(
        dto.sourceTaskId,
        currentTask.occurrence.workId,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.dailyWorkTask.update({
        where: {
          id: dailyTaskId,
        },
        data: {
          ...(dto.title !== undefined
            ? { title: dto.title }
            : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.deadline !== undefined
            ? {
                deadline: dto.deadline
                  ? new Date(dto.deadline)
                  : null,
              }
            : {}),
          ...(dto.assigneeId !== undefined
            ? { assigneeId: dto.assigneeId }
            : {}),
          ...(dto.sourceTaskId !== undefined
            ? { sourceTaskId: dto.sourceTaskId }
            : {}),
        },
        include: {
          assignee: {
            select: userSelect,
          },
          sourceTask: {
            select: {
              id: true,
              title: true,
            },
          },
          occurrence: {
            include: {
              work: {
                select: {
                  id: true,
                  title: true,
                  creatorId: true,
                },
              },
            },
          },
        },
      });

      await tx.workActivity.create({
        data: {
          workId: task.occurrence.workId,
          occurrenceId: task.occurrenceId,
          dailyWorkTaskId: task.id,
          userId,
          type: WorkActivityType.TASK_UPDATED,
          description: `Daily occurrence task "${task.title}" updated`,
        },
      });

      if (
        task.assigneeId &&
        task.assigneeId !== currentTask.assigneeId
      ) {
        await this.notifications.notifyWorkAssigned(
          task.occurrence.workId,
          task.occurrence.work.title,
          [task.assigneeId],
          userId,
          tx,
        );
      }

      await this.recalculateOccurrenceProgress(
        task.occurrenceId,
        tx,
      );

      return task;
    });
  }

  async removeOccurrenceTask(
    dailyTaskId: number,
    userId: number,
  ) {
    const task = await this.getAccessibleDailyTask(
      dailyTaskId,
      userId,
    );

    await this.authorization.assertCanManageWork(
      task.occurrence.workId,
      userId,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.workActivity.create({
        data: {
          workId: task.occurrence.workId,
          occurrenceId: task.occurrenceId,
          dailyWorkTaskId: dailyTaskId,
          userId,
          type: WorkActivityType.DELETED,
          description: `Daily occurrence task "${task.title}" deleted`,
          metadata: {
            dailyTaskId,
          },
        },
      });

      await tx.dailyWorkTask.delete({
        where: {
          id: dailyTaskId,
        },
      });

      await this.recalculateOccurrenceProgress(
        task.occurrenceId,
        tx,
      );
    });

    return {
      success: true,
      message: 'Daily occurrence task deleted successfully',
    };
  }

  async generateOccurrence(
    workId: number,
    userId: number,
    dateInput?: string,
    generationType: DailyOccurrenceGenerationType =
      DailyOccurrenceGenerationType.MANUAL,
  ) {
    const work = await this.assertCanManageDailyWork(workId, userId);
    const schedule = await this.prisma.dailyWorkSchedule.findUnique({
      where: {
        workId,
      },
    });

    if (!schedule) {
      throw new NotFoundException('Daily work schedule not found');
    }

    if (!schedule.isActive) {
      throw new BadRequestException(
        'Daily work schedule is not active',
      );
    }

    const occurrenceDate = dateInput
      ? this.toUtcDateOnly(dateInput)
      : this.toUtcDateOnly(new Date());

    this.assertDateWithinSchedule(
      occurrenceDate,
      schedule.startDate,
      schedule.endDate,
    );

    if (!this.isScheduledDate(occurrenceDate, schedule)) {
      throw new BadRequestException(
        'The selected date does not match the daily work schedule',
      );
    }

    const existingOccurrence =
      await this.prisma.dailyWorkOccurrence.findUnique({
        where: {
          workId_date: {
            workId,
            date: occurrenceDate,
          },
        },
        include: occurrenceDetailsInclude,
      });

    if (existingOccurrence) {
      return existingOccurrence;
    }

    const templateTasks = await this.prisma.workTask.findMany({
      where: {
        workId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const occurrence =
          await tx.dailyWorkOccurrence.create({
            data: {
              workId,
              date: occurrenceDate,
              status: WorkStatus.TODO,
              progress: 0,
              generationType,
              creatorId: userId,
              tasks:
                templateTasks.length > 0
                  ? {
                      create: templateTasks.map((task) => ({
                        sourceTaskId: task.id,
                        title: task.title,
                        description: task.description,
                        status: WorkTaskStatus.TODO,
                        deadline: this.resolveOccurrenceTaskDeadline(
                          occurrenceDate,
                          task.deadline,
                          task.dailyDeadlineOffsetMinutes,
                        ),
                        assigneeId: task.assigneeId,
                      })),
                    }
                  : undefined,
              activities: {
                create: {
                  workId,
                  userId,
                  type: WorkActivityType.CREATED,
                  description: 'Daily work occurrence generated',
                  metadata: {
                    date: occurrenceDate.toISOString(),
                    generationType,
                  },
                },
              },
            },
            include: occurrenceDetailsInclude,
          });

        await tx.dailyWorkSchedule.update({
          where: {
            workId,
          },
          data: {
            lastGeneratedAt: new Date(),
            nextRunAt: this.calculateNextRun(
              occurrenceDate,
              schedule.scheduleType,
              schedule.weekDays,
              schedule.generationHour,
              schedule.generationMinute,
              schedule.endDate,
            ),
          },
        });

        const assigneeIds = this.normalizeIds(
          occurrence.tasks.map((task) => task.assigneeId),
        );

        await this.notifications.notifyWorkAssigned(
          work.id,
          work.title,
          assigneeIds,
          userId,
          tx,
        );

        return occurrence;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const occurrence =
          await this.prisma.dailyWorkOccurrence.findUnique({
            where: {
              workId_date: {
                workId,
                date: occurrenceDate,
              },
            },
            include: occurrenceDetailsInclude,
          });

        if (occurrence) {
          return occurrence;
        }
      }

      throw error;
    }
  }

  async listOccurrences(
    workId: number,
    userId: number,
    query: ListDailyWorkOccurrencesDto,
  ) {
    await this.authorization.assertCanViewWork(workId, userId);
    await this.assertDailyWork(workId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.DailyWorkOccurrenceWhereInput = {
      workId,
      ...(query.fromDate || query.toDate
        ? {
            date: {
              ...(query.fromDate
                ? { gte: this.toUtcDateOnly(query.fromDate) }
                : {}),
              ...(query.toDate
                ? { lte: this.toUtcDateOnly(query.toDate) }
                : {}),
            },
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.generationType
        ? { generationType: query.generationType }
        : {}),
      ...(query.creatorId
        ? { creatorId: query.creatorId }
        : {}),
    };

    const sortBy =
      query.sortBy ?? DailyOccurrenceSortBy.DATE;
    const sortOrder =
      query.sortOrder ?? DailyOccurrenceSortOrder.DESC;

    const orderBy: Prisma.DailyWorkOccurrenceOrderByWithRelationInput =
      {
        [sortBy]: sortOrder,
      };

    const include: Prisma.DailyWorkOccurrenceInclude = {
      creator: {
        select: userSelect,
      },
      _count: {
        select: {
          tasks: true,
          comments: true,
          attachments: true,
          activities: true,
        },
      },
      ...(query.includeTasks
        ? {
            tasks: {
              orderBy: {
                createdAt: Prisma.SortOrder.asc,
              },
              include: {
                assignee: {
                  select: userSelect,
                },
                sourceTask: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.dailyWorkOccurrence.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include,
      }),
      this.prisma.dailyWorkOccurrence.count({
        where,
      }),
    ]);

    return {
      items,
      pagination: this.createPagination(page, limit, total),
    };
  }

  async findOccurrence(
    occurrenceId: number,
    userId: number,
  ) {
    const occurrence =
      await this.prisma.dailyWorkOccurrence.findUnique({
        where: {
          id: occurrenceId,
        },
        select: {
          workId: true,
        },
      });

    if (!occurrence) {
      throw new NotFoundException(
        'Daily work occurrence not found',
      );
    }

    await this.authorization.assertCanViewWork(
      occurrence.workId,
      userId,
    );

    const result =
      await this.prisma.dailyWorkOccurrence.findUnique({
        where: {
          id: occurrenceId,
        },
        include: occurrenceDetailsInclude,
      });

    if (!result) {
      throw new NotFoundException(
        'Daily work occurrence not found',
      );
    }

    return result;
  }

  async submitTask(
    dailyTaskId: number,
    userId: number,
    dto: SubmitDailyWorkTaskDto,
  ) {
    const currentTask = await this.getAccessibleDailyTask(
      dailyTaskId,
      userId,
    );

    if (
      currentTask.assigneeId !== userId &&
      currentTask.occurrence.work.creatorId !== userId
    ) {
      throw new ForbiddenException(
        'Only the assignee can submit this daily task',
      );
    }

    const submittableStatuses: WorkTaskStatus[] = [
      WorkTaskStatus.TODO,
      WorkTaskStatus.IN_PROGRESS,
      WorkTaskStatus.NEEDS_REVISION,
    ];

    if (!submittableStatuses.includes(currentTask.status)) {
      throw new BadRequestException(
        'Only active or revision tasks can be submitted',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.dailyWorkTask.update({
        where: {
          id: dailyTaskId,
        },
        data: {
          status: WorkTaskStatus.PENDING_APPROVAL,
          submittedAt: new Date(),
          reviewedAt: null,
          completedAt: null,
        },
        include: {
          assignee: {
            select: userSelect,
          },
          occurrence: {
            include: {
              work: {
                select: {
                  id: true,
                  title: true,
                  creatorId: true,
                },
              },
            },
          },
        },
      });

      await tx.workActivity.create({
        data: {
          workId: task.occurrence.workId,
          occurrenceId: task.occurrenceId,
          dailyWorkTaskId: task.id,
          userId,
          type: WorkActivityType.TASK_STATUS_CHANGED,
          description: 'Daily task submitted for approval',
          metadata: {
            previousStatus: currentTask.status,
            nextStatus: WorkTaskStatus.PENDING_APPROVAL,
          },
        },
      });

      if (dto.comment) {
        await this.createDailyTaskComment(
          tx,
          task.occurrence.workId,
          task.occurrenceId,
          task.id,
          userId,
          dto.comment,
        );
      }

      await this.recalculateOccurrenceProgress(
        task.occurrenceId,
        tx,
      );

      await this.notifications.notifyTaskStatusChanged(
        task.occurrence.workId,
        task.occurrence.work.title,
        task.title,
        WorkTaskStatus.PENDING_APPROVAL,
        [task.occurrence.work.creatorId],
        userId,
        tx,
      );

      return task;
    });
  }

  async reviewTask(
    dailyTaskId: number,
    userId: number,
    dto: ReviewDailyWorkTaskDto,
  ) {
    const currentTask = await this.getAccessibleDailyTask(
      dailyTaskId,
      userId,
    );

    if (currentTask.occurrence.work.creatorId !== userId) {
      throw new ForbiddenException(
        'Only the work creator can review this daily task',
      );
    }

    if (currentTask.status !== WorkTaskStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Only tasks pending approval can be reviewed',
      );
    }

    const nextStatus =
      dto.decision === DailyWorkTaskReviewDecision.APPROVE
        ? WorkTaskStatus.COMPLETED
        : WorkTaskStatus.NEEDS_REVISION;

    const reviewedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.dailyWorkTask.update({
        where: {
          id: dailyTaskId,
        },
        data: {
          status: nextStatus,
          reviewedAt,
          completedAt:
            nextStatus === WorkTaskStatus.COMPLETED
              ? reviewedAt
              : null,
        },
        include: {
          assignee: {
            select: userSelect,
          },
          occurrence: {
            include: {
              work: {
                select: {
                  id: true,
                  title: true,
                  creatorId: true,
                },
              },
            },
          },
        },
      });

      await tx.workActivity.create({
        data: {
          workId: task.occurrence.workId,
          occurrenceId: task.occurrenceId,
          dailyWorkTaskId: task.id,
          userId,
          type: WorkActivityType.TASK_STATUS_CHANGED,
          description:
            nextStatus === WorkTaskStatus.COMPLETED
              ? 'Daily task approved'
              : 'Daily task revision requested',
          metadata: {
            previousStatus: currentTask.status,
            nextStatus,
            decision: dto.decision,
          },
        },
      });

      if (dto.comment) {
        await this.createDailyTaskComment(
          tx,
          task.occurrence.workId,
          task.occurrenceId,
          task.id,
          userId,
          dto.comment,
        );
      }

      await this.recalculateOccurrenceProgress(
        task.occurrenceId,
        tx,
      );

      if (
        nextStatus === WorkTaskStatus.NEEDS_REVISION &&
        task.assigneeId
      ) {
        await this.notifications.notifyRevisionRequested(
          task.occurrence.workId,
          task.occurrence.work.title,
          task.title,
          [task.assigneeId],
          userId,
          tx,
        );
      } else {
        await this.notifications.notifyTaskStatusChanged(
          task.occurrence.workId,
          task.occurrence.work.title,
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

  private async recalculateOccurrenceProgress(
    occurrenceId: number,
    tx: TransactionClient,
  ) {
    const tasks = await tx.dailyWorkTask.findMany({
      where: {
        occurrenceId,
      },
      select: {
        status: true,
      },
    });

    const completedCount = tasks.filter(
      (task) => task.status === WorkTaskStatus.COMPLETED,
    ).length;

    const progress =
      tasks.length === 0
        ? 0
        : Number(
            ((completedCount / tasks.length) * 100).toFixed(2),
          );

    let status: WorkStatus;

    if (tasks.length === 0) {
      status = WorkStatus.TODO;
    } else if (completedCount === tasks.length) {
      status = WorkStatus.COMPLETED;
    } else if (
      tasks.some(
        (task) =>
          task.status === WorkTaskStatus.NEEDS_REVISION,
      )
    ) {
      status = WorkStatus.NEEDS_REVISION;
    } else if (
      tasks.some(
        (task) =>
          task.status === WorkTaskStatus.PENDING_APPROVAL,
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

    const occurrence =
      await tx.dailyWorkOccurrence.update({
        where: {
          id: occurrenceId,
        },
        data: {
          progress,
          status,
        },
        select: {
          workId: true,
        },
      });

    await this.recalculateDailyWorkProgress(
      occurrence.workId,
      tx,
    );

    return {
      progress,
      status,
    };
  }

  private async recalculateDailyWorkProgress(
    workId: number,
    tx: TransactionClient,
  ) {
    const occurrences =
      await tx.dailyWorkOccurrence.findMany({
        where: {
          workId,
        },
        select: {
          progress: true,
          status: true,
        },
      });

    if (occurrences.length === 0) {
      return tx.work.update({
        where: {
          id: workId,
        },
        data: {
          progress: 0,
          status: WorkStatus.TODO,
        },
      });
    }

    const progress = Number(
      (
        occurrences.reduce(
          (total, occurrence) =>
            total + occurrence.progress,
          0,
        ) / occurrences.length
      ).toFixed(2),
    );

    let status: WorkStatus;

    if (
      occurrences.every(
        (occurrence) =>
          occurrence.status === WorkStatus.COMPLETED,
      )
    ) {
      status = WorkStatus.COMPLETED;
    } else if (
      occurrences.some(
        (occurrence) =>
          occurrence.status === WorkStatus.NEEDS_REVISION,
      )
    ) {
      status = WorkStatus.NEEDS_REVISION;
    } else if (
      occurrences.some(
        (occurrence) =>
          occurrence.status === WorkStatus.PENDING_APPROVAL,
      )
    ) {
      status = WorkStatus.PENDING_APPROVAL;
    } else if (
      occurrences.some(
        (occurrence) =>
          occurrence.status !== WorkStatus.TODO,
      )
    ) {
      status = WorkStatus.IN_PROGRESS;
    } else {
      status = WorkStatus.TODO;
    }

    return tx.work.update({
      where: {
        id: workId,
      },
      data: {
        progress,
        status,
      },
    });
  }

  private async createDailyTaskComment(
    tx: TransactionClient,
    workId: number,
    occurrenceId: number,
    dailyWorkTaskId: number,
    userId: number,
    text: string,
  ) {
    const comment = await tx.workComment.create({
      data: {
        workId,
        occurrenceId,
        dailyWorkTaskId,
        userId,
        text,
      },
      include: {
        user: {
          select: userSelect,
        },
      },
    });

    await tx.workActivity.create({
      data: {
        workId,
        occurrenceId,
        dailyWorkTaskId,
        userId,
        type: WorkActivityType.COMMENT_ADDED,
        description: 'Comment added to daily work task',
        metadata: {
          commentId: comment.id,
        },
      },
    });

    return comment;
  }

  private async getAccessibleDailyTask(
    dailyTaskId: number,
    userId: number,
  ) {
    const task = await this.prisma.dailyWorkTask.findUnique({
      where: {
        id: dailyTaskId,
      },
      include: {
        occurrence: {
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
        },
      },
    });

    if (!task || task.occurrence.work.deletedAt) {
      throw new NotFoundException('Daily work task not found');
    }

    const work = task.occurrence.work;
    const isMember = work.members.some(
      (member) => member.userId === userId,
    );
    const isAssignee = task.assigneeId === userId;

    if (
      work.creatorId !== userId &&
      !isMember &&
      !isAssignee &&
      !this.authorization.isGlobalViewer(userId)
    ) {
      throw new ForbiddenException(
        'You do not have access to this daily work task',
      );
    }

    return task;
  }

  private async assertCanManageDailyWork(
    workId: number,
    userId: number,
  ) {
    const work = await this.authorization.assertCanManageWork(
      workId,
      userId,
    );

    if (work.type !== WorkType.DAILY) {
      throw new BadRequestException('Work is not a daily work');
    }

    return work;
  }

  private async assertDailyWork(workId: number) {
    const work = await this.prisma.work.findFirst({
      where: {
        id: workId,
        type: WorkType.DAILY,
      },
      select: {
        id: true,
      },
    });

    if (!work) {
      throw new NotFoundException('Daily work not found');
    }
  }

  private async assertSourceTaskBelongsToWork(
    taskId: number,
    workId: number,
  ) {
    const task = await this.prisma.workTask.findFirst({
      where: {
        id: taskId,
        workId,
      },
      select: {
        id: true,
      },
    });

    if (!task) {
      throw new BadRequestException(
        'sourceTaskId does not belong to this daily work',
      );
    }
  }

  private async assertUsersExist(userIds: number[]) {
    const uniqueIds = this.normalizeIds(userIds);

    if (uniqueIds.length === 0) {
      return;
    }

    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: uniqueIds,
        },
      },
      select: {
        id: true,
      },
    });

    const existingIds = new Set(
      users.map((user) => user.id),
    );
    const missingIds = uniqueIds.filter(
      (userId) => !existingIds.has(userId),
    );

    if (missingIds.length > 0) {
      throw new BadRequestException(
        `Users not found: ${missingIds.join(', ')}`,
      );
    }
  }

  private resolveWeekDays(
    scheduleType: DailyWorkScheduleType,
    input?: number[],
  ) {
    if (scheduleType === DailyWorkScheduleType.CUSTOM_DAYS) {
      if (!input || input.length === 0) {
        throw new BadRequestException(
          'weekDays is required for CUSTOM_DAYS schedule',
        );
      }

      return [...new Set(input)].sort((a, b) => a - b);
    }

    if (scheduleType === DailyWorkScheduleType.WORK_DAYS) {
      // JavaScript weekdays: Sunday=0 through Saturday=6.
      // Saturday through Thursday equals [6, 0, 1, 2, 3, 4].
      return [0, 1, 2, 3, 4, 6];
    }

    return [];
  }

  private isScheduledDate(
    date: Date,
    schedule: {
      scheduleType: DailyWorkScheduleType;
      weekDays: number[];
    },
  ) {
    if (
      schedule.scheduleType ===
      DailyWorkScheduleType.EVERY_DAY
    ) {
      return true;
    }

    const weekDay = date.getUTCDay();

    if (
      schedule.scheduleType ===
      DailyWorkScheduleType.WORK_DAYS
    ) {
      return [0, 1, 2, 3, 4, 6].includes(weekDay);
    }

    return schedule.weekDays.includes(weekDay);
  }

  private assertDateWithinSchedule(
    date: Date,
    startDate: Date,
    endDate: Date | null,
  ) {
    const normalizedStart = this.toUtcDateOnly(startDate);
    const normalizedEnd = endDate
      ? this.toUtcDateOnly(endDate)
      : null;

    if (date.getTime() < normalizedStart.getTime()) {
      throw new BadRequestException(
        'Occurrence date is earlier than schedule startDate',
      );
    }

    if (
      normalizedEnd &&
      date.getTime() > normalizedEnd.getTime()
    ) {
      throw new BadRequestException(
        'Occurrence date is later than schedule endDate',
      );
    }
  }

  private resolveOccurrenceTaskDeadline(
    occurrenceDate: Date,
    templateDeadline: Date | null,
    offsetMinutes: number | null,
  ) {
    if (offsetMinutes !== null) {
      const deadline = new Date(occurrenceDate);
      deadline.setUTCMinutes(offsetMinutes);
      return deadline;
    }

    if (templateDeadline) {
      const deadline = new Date(occurrenceDate);
      deadline.setUTCHours(
        templateDeadline.getUTCHours(),
        templateDeadline.getUTCMinutes(),
        templateDeadline.getUTCSeconds(),
        templateDeadline.getUTCMilliseconds(),
      );
      return deadline;
    }

    return null;
  }

  private calculateInitialNextRun(
    startDate: Date,
    hour: number,
    minute: number,
  ) {
    const nextRun = new Date(startDate);
    nextRun.setUTCHours(hour, minute, 0, 0);
    return nextRun;
  }

  private calculateNextRun(
    occurrenceDate: Date,
    scheduleType: DailyWorkScheduleType,
    weekDays: number[],
    hour: number,
    minute: number,
    endDate: Date | null,
  ) {
    const candidate = new Date(occurrenceDate);
    candidate.setUTCDate(candidate.getUTCDate() + 1);
    candidate.setUTCHours(hour, minute, 0, 0);

    for (let index = 0; index < 14; index += 1) {
      if (endDate && candidate.getTime() > endDate.getTime()) {
        return null;
      }

      const weekDay = candidate.getUTCDay();
      const matches =
        scheduleType === DailyWorkScheduleType.EVERY_DAY ||
        (scheduleType === DailyWorkScheduleType.WORK_DAYS &&
          [0, 1, 2, 3, 4, 6].includes(weekDay)) ||
        (scheduleType === DailyWorkScheduleType.CUSTOM_DAYS &&
          weekDays.includes(weekDay));

      if (matches) {
        return candidate;
      }

      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }

    return null;
  }

  private toUtcDateOnly(value: string | Date) {
    const source =
      value instanceof Date ? new Date(value) : new Date(value);

    if (Number.isNaN(source.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    return new Date(
      Date.UTC(
        source.getUTCFullYear(),
        source.getUTCMonth(),
        source.getUTCDate(),
      ),
    );
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

  private createPagination(
    page: number,
    limit: number,
    total: number,
  ) {
    const totalPages =
      total === 0 ? 0 : Math.ceil(total / limit);

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
