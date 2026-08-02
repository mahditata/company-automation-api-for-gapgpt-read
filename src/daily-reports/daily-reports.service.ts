import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AddDailyReportCommentDto } from './dto/add-daily-report-comment.dto';
import { CreateDailyReportDto } from './dto/create-daily-report.dto';
import { UpdateDailyReportStatusDto } from './dto/update-daily-report-status.dto';

@Injectable()
export class DailyReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
  userId: number,
  dto: CreateDailyReportDto,
  uploadedFiles: any[] = [],
) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      departmentId: true,
      managerId: true,
    },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  const uploadedAttachments = uploadedFiles.map((file) => ({
    fileName: file.originalname,
    filePath: `/uploads/daily-reports/${file.filename}`,
    mimeType: file.mimetype,
    size: file.size,
  }));

  const bodyAttachments = dto.attachments?.length
    ? dto.attachments.map((attachment) => ({
        fileName: attachment.fileName,
        filePath: attachment.filePath,
        mimeType: attachment.mimeType,
        size: attachment.size,
      }))
    : [];

  const attachments = [
    ...bodyAttachments,
    ...uploadedAttachments,
  ];

  const report = await this.prisma.dailyReport.create({
    data: {
      userId: user.id,
      departmentId: user.departmentId,
      managerId: user.managerId,
      reportDate: new Date(dto.reportDate),
      title: dto.title,
      content: dto.content,
      problems: dto.problems,
      suggestions: dto.suggestions,
      status: ReportStatus.SUBMITTED,
      attachments: attachments.length
        ? {
            create: attachments,
          }
        : undefined,
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          positionTitle: true,
        },
      },
      department: true,
      attachments: true,
      comments: true,
    },
  });

  await this.notificationsService.createForManagerHierarchy({
    subordinateId: report.userId,
    type: NotificationType.REPORT_CREATED,
    title: 'گزارش روزانه جدید',
    message: `${report.user.firstName ?? ''} ${
      report.user.lastName ?? ''
    } گزارش «${report.title}» را ثبت کرد.`.trim(),
    link: `/daily-reports/${report.id}?from=manager`,
    reportId: report.id,
    excludeUserIds: [report.userId],
  });

  return report;
}


  async findByDate(userId: number, date: string) {
    const selectedDate = new Date(date);

    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.dailyReport.findMany({
      where: {
        userId,
        reportDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        attachments: true,
        comments: {
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
          orderBy: {
            createdAt: 'asc',
          },
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
    });
  }

  async findMyReports(userId: number) {
    return this.prisma.dailyReport.findMany({
      where: {
        userId,
      },
      orderBy: {
        reportDate: 'desc',
      },
      include: {
        attachments: true,
        comments: {
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
          orderBy: {
            createdAt: 'asc',
          },
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
    });
  }

  async findOne(id: number, currentUserId: number) {
    const report = await this.prisma.dailyReport.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            positionTitle: true,
            managerId: true,
          },
        },
        department: true,
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
          },
        },
        attachments: true,
        comments: {
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
          orderBy: {
            createdAt: 'asc',
          },
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Daily report not found');
    }

    const isOwner = report.userId === currentUserId;
    
    // بررسی اینکه آیا کاربر فعلی مدیر مستقیم است یا در سلسله‌مراتب مدیریتی بالادستِ نویسنده گزارش قرار دارد
    const isDirectManager = report.managerId === currentUserId;
    const isUpperManager = await this.isUserInManagerHierarchy(currentUserId, report.userId);
    const isAllowedManager = isDirectManager || isUpperManager;

    if (!isOwner && !isAllowedManager) {
      throw new ForbiddenException('You do not have access to this report');
    }

    // اگر مشاهده‌کننده مدیر باشد و گزارش هنوز خوانده نشده باشد، وضعیت آن آپدیت می‌شود
    if (isAllowedManager && !report.readAt) {
      return this.prisma.dailyReport.update({
        where: { id },
        data: {
          status:
            report.status === ReportStatus.SUBMITTED
              ? ReportStatus.READ
              : report.status,
          readAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              positionTitle: true,
              managerId: true,
            },
          },
          department: true,
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
            },
          },
          attachments: true,
          comments: {
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
            orderBy: {
              createdAt: 'asc',
            },
          },
          _count: {
            select: {
              comments: true,
              attachments: true,
            },
          },
        },
      });
    }

    return report;
  }

  async findReportsForManager(
    managerId: number,
    date?: string,
    subordinateId?: number,
  ) {
    const dateFilter = date ? this.createDateFilter(date) : undefined;

    if (subordinateId !== undefined) {
      const subordinate = await this.prisma.user.findUnique({
        where: { id: subordinateId },
        select: {
          id: true,
        },
      });

      if (!subordinate) {
        throw new NotFoundException('Subordinate not found');
      }

      // ترتیب پارامترها: اول شناسه مدیر بالادست، بعد زیرمجموعه
      const canAccess = await this.isUserInManagerHierarchy(
        managerId,
        subordinateId,
      );

      if (!canAccess) {
        throw new ForbiddenException(
          'You do not have access to this user reports',
        );
      }

      return this.prisma.dailyReport.findMany({
        where: {
          userId: subordinateId,
          ...(dateFilter
            ? {
                reportDate: dateFilter,
              }
            : {}),
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
              positionTitle: true,
            },
          },
          department: true,
          attachments: true,
          comments: {
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
            orderBy: {
              createdAt: 'asc',
            },
          },
          _count: {
            select: {
              comments: true,
              attachments: true,
            },
          },
        },
      });
    }

    // گرفتن تمام رکوردهایی که کاربر مدیر مستقیم یا غیرمستقیم آن‌هاست
    const subordinateIds = await this.getAllSubordinateIds(managerId);

    return this.prisma.dailyReport.findMany({
      where: {
        OR: [
          { managerId: managerId },
          { userId: { in: subordinateIds } }
        ],
        ...(dateFilter
          ? {
              reportDate: dateFilter,
            }
          : {}),
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
            positionTitle: true,
          },
        },
        department: true,
        attachments: true,
        comments: {
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
          orderBy: {
            createdAt: 'asc',
          },
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
    });
  }

  async updateStatus(
  id: number,
  managerId: number,
  dto: UpdateDailyReportStatusDto,
) {
  const report = await this.prisma.dailyReport.findUnique({
    where: { id },
  });

  if (!report) {
    throw new NotFoundException('Daily report not found');
  }

  const isDirectManager = report.managerId === managerId;

  const isUpperManager =
    await this.isUserInManagerHierarchy(
      managerId,
      report.userId,
    );

  if (!isDirectManager && !isUpperManager) {
    throw new ForbiddenException(
      'You are not allowed to update this report',
    );
  }

  const updatedReport =
    await this.prisma.dailyReport.update({
      where: { id },
      data: {
        status: dto.status,
        managerComment: dto.managerComment,
        managerActionAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            positionTitle: true,
          },
        },
        department: true,
        attachments: true,
        comments: {
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
          orderBy: {
            createdAt: 'asc',
          },
        },
        _count: {
          select: {
            comments: true,
            attachments: true,
          },
        },
      },
    });

  const notificationMessage =
    `وضعیت گزارش «${updatedReport.title}» به ` +
    `${updatedReport.status} تغییر کرد.`;

  const notificationTasks: Promise<unknown>[] = [];

  if (updatedReport.userId !== managerId) {
    notificationTasks.push(
      this.notificationsService.create({
        userId: updatedReport.userId,
        type: NotificationType.REPORT_STATUS_CHANGED,
        title: 'تغییر وضعیت گزارش',
        message: notificationMessage,
        link: `/daily-reports/${updatedReport.id}?from=my`,
        reportId: updatedReport.id,
      }),
    );
  }

  notificationTasks.push(
    this.notificationsService.createForManagerHierarchy({
      subordinateId: updatedReport.userId,
      type: NotificationType.REPORT_STATUS_CHANGED,
      title: 'تغییر وضعیت گزارش',
      message: notificationMessage,
      link: `/daily-reports/${updatedReport.id}?from=manager`,
      reportId: updatedReport.id,
      excludeUserIds: [
        managerId,
        updatedReport.userId,
      ],
    }),
  );

  await Promise.all(notificationTasks);

  return updatedReport;
}


  async addComment(
  reportId: number,
  userId: number,
  dto: AddDailyReportCommentDto,
) {
  const report = await this.prisma.dailyReport.findUnique({
    where: { id: reportId },
  });

  if (!report) {
    throw new NotFoundException('Daily report not found');
  }

  const isOwner = report.userId === userId;
  const isDirectManager = report.managerId === userId;

  const isUpperManager =
    await this.isUserInManagerHierarchy(
      userId,
      report.userId,
    );

  const isAllowedManager =
    isDirectManager || isUpperManager;

  if (!isOwner && !isAllowedManager) {
    throw new ForbiddenException(
      'You do not have access to this report',
    );
  }

  const comment =
    await this.prisma.dailyReportComment.create({
      data: {
        reportId,
        userId,
        text: dto.text,
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

  const commenterName =
    `${comment.user.firstName ?? ''} ` +
    `${comment.user.lastName ?? ''}`;

  const normalizedCommenterName =
    commenterName.trim() ||
    comment.user.username ||
    'یک کاربر';

  const managerMessage =
    `${normalizedCommenterName} روی گزارش ` +
    `«${report.title}» نظر ثبت کرد.`;

  const notificationTasks: Promise<unknown>[] = [];

  /*
   * اگر ثبت‌کننده نظر مدیر باشد، صاحب گزارش باید اعلان بگیرد.
   */
  if (!isOwner && report.userId !== userId) {
    notificationTasks.push(
      this.notificationsService.create({
        userId: report.userId,
        type: NotificationType.REPORT_COMMENT_ADDED,
        title: 'نظر جدید روی گزارش',
        message:
          `${normalizedCommenterName} روی گزارش شما ` +
          `نظر ثبت کرد.`,
        link: `/daily-reports/${report.id}?from=my`,
        reportId: report.id,
      }),
    );
  }

  /*
   * تمام مدیران مستقیم و غیرمستقیم نویسنده گزارش اعلان
   * می‌گیرند، به‌جز کسی که خودش کامنت را ثبت کرده است.
   */
  notificationTasks.push(
    this.notificationsService.createForManagerHierarchy({
      subordinateId: report.userId,
      type: NotificationType.REPORT_COMMENT_ADDED,
      title: 'نظر جدید روی گزارش',
      message: managerMessage,
      link: `/daily-reports/${report.id}?from=manager`,
      reportId: report.id,
      excludeUserIds: [
        userId,
        report.userId,
      ],
    }),
  );

  await Promise.all(notificationTasks);

  return comment;
}


  private async isUserInManagerHierarchy(
    managerId: number,
    subordinateId: number,
  ): Promise<boolean> {
    if (managerId === subordinateId) {
      return false;
    }

    const visitedUserIds = new Set<number>();
    let currentUserId: number | null = subordinateId;

    while (currentUserId !== null) {
      if (visitedUserIds.has(currentUserId)) {
        return false;
      }

      visitedUserIds.add(currentUserId);

      const user = await this.prisma.user.findUnique({
        where: { id: currentUserId },
        select: {
          managerId: true,
        },
      });

      if (!user || user.managerId === null) {
        return false;
      }

      if (user.managerId === managerId) {
        return true;
      }

      currentUserId = user.managerId;
    }

    return false;
  }

  private async getAllSubordinateIds(managerId: number): Promise<number[]> {
    const result: number[] = [];
    const visitedUserIds = new Set<number>();

    const collect = async (currentManagerId: number) => {
      const directSubordinates = await this.prisma.user.findMany({
        where: {
          managerId: currentManagerId,
        },
        select: {
          id: true,
        },
      });

      for (const subordinate of directSubordinates) {
        if (visitedUserIds.has(subordinate.id)) {
          continue;
        }

        visitedUserIds.add(subordinate.id);
        result.push(subordinate.id);

        await collect(subordinate.id);
      }
    };

    await collect(managerId);
    return result;
  }

  private createDateFilter(date: string) {
    const selectedDate = new Date(date);

    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    return {
      gte: startOfDay,
      lte: endOfDay,
    };
  }
}
