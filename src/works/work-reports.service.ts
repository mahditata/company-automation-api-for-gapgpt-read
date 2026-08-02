import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import {
  Prisma,
  WorkStatus,
  WorkTaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkSummaryReportDto } from './dto/work-summary-report.dto';
import { WorkAuthorizationService } from './work-authorization.service';

const reportUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
} satisfies Prisma.UserSelect;

type StatusCount<TStatus extends string> = {
  status: TStatus;
  count: number;
};

@Injectable()
export class WorkReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkAuthorizationService,
  ) {}

  /**
   * ????? ????? Work?? ?? ????? ??????? ? task??? ??????.
   *
   * ??????:
   * - Global viewer: ???? Work??? ????????
   * - ???? ???????: Work??? ????????? ???? ????? ?? Work???? ?? ??? ?? ?????
   * - ?? ???? ????? workId? ??? ?????? ???? Work ??????? ????? ??????
   */
  async getSummary(
    userId: number,
    query: WorkSummaryReportDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const fromDate = query.fromDate
      ? this.toUtcDateOnly(query.fromDate)
      : undefined;

    const toDate = query.toDate
      ? this.toUtcDateOnly(query.toDate)
      : undefined;

    if (
      fromDate &&
      toDate &&
      fromDate.getTime() > toDate.getTime()
    ) {
      throw new BadRequestException(
        'fromDate cannot be later than toDate',
      );
    }

    if (query.workId !== undefined) {
      await this.authorization.assertCanViewWork(
        query.workId,
        userId,
      );
    }

    const occurrenceWhere =
      this.createOccurrenceWhere(query, fromDate, toDate);

    const workWhere = this.createWorkWhere(
      userId,
      query,
      occurrenceWhere,
    );

    const includeOccurrences =
      query.includeOccurrences ?? false;

    const includeTasks = query.includeTasks ?? false;

    /*
     * includeTasks ???? includeOccurrences ??? ????? ???.
     * ?? ??? ???? occurrences ???? ???????? task??? ?????? ?? ????
     * ????? ??????? ??? ??????? ????? ?? ??????? ????? ????? ????? ???.
     */
    const shouldLoadOccurrences =
      includeOccurrences || includeTasks;

    const workInclude = this.createWorkInclude(
      occurrenceWhere,
      includeOccurrences,
      includeTasks,
    );

    const [items, total, summary] =
      await this.prisma.$transaction(async (tx) => {
        const works = await tx.work.findMany({
          where: workWhere,
          orderBy: [
            {
              updatedAt: Prisma.SortOrder.desc,
            },
            {
              id: Prisma.SortOrder.desc,
            },
          ],
          skip,
          take: limit,
          ...(shouldLoadOccurrences
            ? {
                include: workInclude,
              }
            : {
                include: {
                  creator: {
                    select: reportUserSelect,
                  },
                  members: {
                    orderBy: {
                      createdAt: Prisma.SortOrder.asc,
                    },
                    include: {
                      user: {
                        select: reportUserSelect,
                      },
                    },
                  },
                  _count: {
                    select: {
                      tasks: true,
                      occurrences: true,
                      comments: true,
                      attachments: true,
                    },
                  },
                },
              }),
        });

        const workCount = await tx.work.count({
          where: workWhere,
        });

        const reportSummary =
          await this.calculateSummary(
            tx,
            workWhere,
            occurrenceWhere,
          );

        return [works, workCount, reportSummary] as const;
      });

    return {
      items,
      summary,
      pagination: this.createPagination(
        page,
        limit,
        total,
      ),
    };
  }

  /**
   * ??? ??????? ???? ??????? ??????? ?? controller.
   */
  async summary(
    userId: number,
    query: WorkSummaryReportDto,
  ) {
    return this.getSummary(userId, query);
  }

  private createWorkWhere(
    userId: number,
    query: WorkSummaryReportDto,
    occurrenceWhere: Prisma.DailyWorkOccurrenceWhereInput,
  ): Prisma.WorkWhereInput {
    const hasOccurrenceFilters =
      this.hasOccurrenceFilters(query);

    const accessWhere: Prisma.WorkWhereInput =
      this.authorization.isGlobalViewer(userId)
        ? {}
        : {
            OR: [
              {
                creatorId: userId,
              },
              {
                members: {
                  some: {
                    userId,
                  },
                },
              },
            ],
          };

    return {
      deletedAt: null,
      ...(query.workId !== undefined
        ? {
            id: query.workId,
          }
        : {}),
      ...accessWhere,
      ...(hasOccurrenceFilters
        ? {
            occurrences: {
              some: occurrenceWhere,
            },
          }
        : {}),
    };
  }

  private createOccurrenceWhere(
    query: WorkSummaryReportDto,
    fromDate?: Date,
    toDate?: Date,
  ): Prisma.DailyWorkOccurrenceWhereInput {
    const dateFilter:
      | Prisma.DateTimeFilter
      | undefined =
      fromDate || toDate
        ? {
            ...(fromDate
              ? {
                  gte: fromDate,
                }
              : {}),
            ...(toDate
              ? {
                  lte: toDate,
                }
              : {}),
          }
        : undefined;

    const taskFilter =
      this.createDailyTaskWhere(query);

    const hasTaskFilters =
      query.assigneeId !== undefined ||
      query.taskStatus !== undefined;

    return {
      ...(dateFilter
        ? {
            date: dateFilter,
          }
        : {}),
      ...(query.occurrenceStatus !== undefined
        ? {
            status: query.occurrenceStatus,
          }
        : {}),
      ...(query.generationType !== undefined
        ? {
            generationType: query.generationType,
          }
        : {}),
      ...(hasTaskFilters
        ? {
            tasks: {
              some: taskFilter,
            },
          }
        : {}),
    };
  }

  private createDailyTaskWhere(
    query: WorkSummaryReportDto,
  ): Prisma.DailyWorkTaskWhereInput {
    return {
      ...(query.assigneeId !== undefined
        ? {
            assigneeId: query.assigneeId,
          }
        : {}),
      ...(query.taskStatus !== undefined
        ? {
            status: query.taskStatus,
          }
        : {}),
    };
  }

  private createWorkInclude(
    occurrenceWhere: Prisma.DailyWorkOccurrenceWhereInput,
    includeOccurrences: boolean,
    includeTasks: boolean,
  ): Prisma.WorkInclude {
    const taskWhere =
      this.extractTaskWhereFromOccurrenceWhere(
        occurrenceWhere,
      );

    return {
      creator: {
        select: reportUserSelect,
      },
      members: {
        orderBy: {
          createdAt: Prisma.SortOrder.asc,
        },
        include: {
          user: {
            select: reportUserSelect,
          },
        },
      },
      _count: {
        select: {
          tasks: true,
          occurrences: true,
          comments: true,
          attachments: true,
        },
      },
      occurrences: {
        where: occurrenceWhere,
        orderBy: [
          {
            date: Prisma.SortOrder.desc,
          },
          {
            id: Prisma.SortOrder.desc,
          },
        ],
        ...(includeOccurrences
          ? {
              include: {
                creator: {
                  select: reportUserSelect,
                },
                ...(includeTasks
                  ? {
                      tasks: {
                        where: taskWhere,
                        orderBy: [
                          {
                            createdAt:
                              Prisma.SortOrder.asc,
                          },
                          {
                            id: Prisma.SortOrder.asc,
                          },
                        ],
                        include: {
                          assignee: {
                            select: reportUserSelect,
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
                    }
                  : {}),
                _count: {
                  select: {
                    tasks: true,
                    comments: true,
                    attachments: true,
                    activities: true,
                  },
                },
              },
            }
          : {
              select: {
                id: true,
                workId: true,
                date: true,
                status: true,
                progress: true,
                generationType: true,
                createdAt: true,
                updatedAt: true,
                ...(includeTasks
                  ? {
                      tasks: {
                        where: taskWhere,
                        orderBy: [
                          {
                            createdAt:
                              Prisma.SortOrder.asc,
                          },
                          {
                            id: Prisma.SortOrder.asc,
                          },
                        ],
                        include: {
                          assignee: {
                            select: reportUserSelect,
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
                    }
                  : {}),
              },
            }),
      },
    };
  }

  private extractTaskWhereFromOccurrenceWhere(
    occurrenceWhere: Prisma.DailyWorkOccurrenceWhereInput,
  ): Prisma.DailyWorkTaskWhereInput {
    const tasksFilter = occurrenceWhere.tasks;

    if (
      !tasksFilter ||
      typeof tasksFilter !== 'object' ||
      !('some' in tasksFilter) ||
      !tasksFilter.some
    ) {
      return {};
    }

    return tasksFilter.some;
  }

  private async calculateSummary(
    tx: Prisma.TransactionClient,
    workWhere: Prisma.WorkWhereInput,
    occurrenceWhere: Prisma.DailyWorkOccurrenceWhereInput,
  ) {
    const scopedOccurrenceWhere:
      Prisma.DailyWorkOccurrenceWhereInput = {
      ...occurrenceWhere,
      work: {
        is: workWhere,
      },
    };

    const scopedTaskWhere:
      Prisma.DailyWorkTaskWhereInput = {
      occurrence: {
        is: scopedOccurrenceWhere,
      },
    };

    const [
      workStatusGroups,
      occurrenceStatusGroups,
      taskStatusGroups,
      occurrenceAggregate,
      totalTemplateTasks,
      totalDailyTasks,
      overdueTemplateTasks,
      overdueDailyTasks,
    ] = await Promise.all([
      tx.work.groupBy({
        by: ['status'],
        where: workWhere,
        _count: {
          _all: true,
        },
      }),

      tx.dailyWorkOccurrence.groupBy({
        by: ['status'],
        where: scopedOccurrenceWhere,
        _count: {
          _all: true,
        },
      }),

      tx.dailyWorkTask.groupBy({
        by: ['status'],
        where: scopedTaskWhere,
        _count: {
          _all: true,
        },
      }),

      tx.dailyWorkOccurrence.aggregate({
        where: scopedOccurrenceWhere,
        _count: {
          _all: true,
        },
        _avg: {
          progress: true,
        },
      }),

      tx.workTask.count({
        where: {
          work: {
            is: workWhere,
          },
        },
      }),

      tx.dailyWorkTask.count({
        where: scopedTaskWhere,
      }),

      tx.workTask.count({
        where: {
          work: {
            is: workWhere,
          },
          deadline: {
            lt: new Date(),
          },
          status: {
            not: WorkTaskStatus.COMPLETED,
          },
        },
      }),

      tx.dailyWorkTask.count({
        where: {
          ...scopedTaskWhere,
          deadline: {
            lt: new Date(),
          },
          status: {
            not: WorkTaskStatus.COMPLETED,
          },
        },
      }),
    ]);

    const worksByStatus =
      this.normalizeWorkStatusCounts(
        workStatusGroups.map((item) => ({
          status: item.status,
          count: item._count._all,
        })),
      );

    const occurrencesByStatus =
      this.normalizeWorkStatusCounts(
        occurrenceStatusGroups.map((item) => ({
          status: item.status,
          count: item._count._all,
        })),
      );

    const dailyTasksByStatus =
      this.normalizeTaskStatusCounts(
        taskStatusGroups.map((item) => ({
          status: item.status,
          count: item._count._all,
        })),
      );

    const totalWorks = Object.values(
      worksByStatus,
    ).reduce(
      (total, count) => total + count,
      0,
    );

    const completedWorks =
      worksByStatus[WorkStatus.COMPLETED];

    const totalOccurrences =
      occurrenceAggregate._count._all;

    const completedOccurrences =
      occurrencesByStatus[WorkStatus.COMPLETED];

    const completedDailyTasks =
      dailyTasksByStatus[WorkTaskStatus.COMPLETED];

    return {
      totalWorks,
      completedWorks,
      workCompletionRate: this.calculatePercentage(
        completedWorks,
        totalWorks,
      ),

      totalOccurrences,
      completedOccurrences,
      occurrenceCompletionRate:
        this.calculatePercentage(
          completedOccurrences,
          totalOccurrences,
        ),
      averageOccurrenceProgress: Number(
        (
          occurrenceAggregate._avg.progress ?? 0
        ).toFixed(2),
      ),

      totalTemplateTasks,
      totalDailyTasks,
      completedDailyTasks,
      dailyTaskCompletionRate:
        this.calculatePercentage(
          completedDailyTasks,
          totalDailyTasks,
        ),

      overdueTemplateTasks,
      overdueDailyTasks,

      worksByStatus,
      occurrencesByStatus,
      dailyTasksByStatus,
    };
  }

  private normalizeWorkStatusCounts(
    items: StatusCount<WorkStatus>[],
  ): Record<WorkStatus, number> {
    const result: Record<WorkStatus, number> = {
      [WorkStatus.TODO]: 0,
      [WorkStatus.IN_PROGRESS]: 0,
      [WorkStatus.PENDING_APPROVAL]: 0,
      [WorkStatus.COMPLETED]: 0,
      [WorkStatus.NEEDS_REVISION]: 0,
    };

    for (const item of items) {
      result[item.status] = item.count;
    }

    return result;
  }

  private normalizeTaskStatusCounts(
    items: StatusCount<WorkTaskStatus>[],
  ): Record<WorkTaskStatus, number> {
    const result: Record<WorkTaskStatus, number> = {
      [WorkTaskStatus.TODO]: 0,
      [WorkTaskStatus.IN_PROGRESS]: 0,
      [WorkTaskStatus.PENDING_APPROVAL]: 0,
      [WorkTaskStatus.COMPLETED]: 0,
      [WorkTaskStatus.NEEDS_REVISION]: 0,
    };

    for (const item of items) {
      result[item.status] = item.count;
    }

    return result;
  }

  private hasOccurrenceFilters(
    query: WorkSummaryReportDto,
  ) {
    return (
      query.fromDate !== undefined ||
      query.toDate !== undefined ||
      query.assigneeId !== undefined ||
      query.occurrenceStatus !== undefined ||
      query.taskStatus !== undefined ||
      query.generationType !== undefined
    );
  }

  private calculatePercentage(
    completed: number,
    total: number,
  ) {
    if (total === 0) {
      return 0;
    }

    return Number(
      ((completed / total) * 100).toFixed(2),
    );
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

  private toUtcDateOnly(value: string | Date) {
    /*
     * ???? ??????? ?? ????????? ??? ?? ??? timezone? ??? YYYY-MM-DD
     * ???????? ?? ????? UTC ????? ??????.
     */
    if (typeof value === 'string') {
      const datePart = value.slice(0, 10);
      const match =
        /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);

      if (!match) {
        throw new BadRequestException(
          'Invalid date format',
        );
      }

      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);

      const result = new Date(
        Date.UTC(year, month - 1, day),
      );

      if (
        result.getUTCFullYear() !== year ||
        result.getUTCMonth() !== month - 1 ||
        result.getUTCDate() !== day
      ) {
        throw new BadRequestException('Invalid date');
      }

      return result;
    }

    const source = new Date(value);

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
}
