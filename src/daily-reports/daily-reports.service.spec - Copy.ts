import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddDailyReportCommentDto } from './dto/add-daily-report-comment.dto';
import { CreateDailyReportDto } from './dto/create-daily-report.dto';
import { UpdateDailyReportStatusDto } from './dto/update-daily-report-status.dto';

@Injectable()
export class DailyReportsService {
  constructor(private readonly prisma: PrismaService) {}

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

    const attachments = [...bodyAttachments, ...uploadedAttachments];

    return this.prisma.dailyReport.create({
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
      },
    });

    if (!report) {
      throw new NotFoundException('Daily report not found');
    }

    const isOwner = report.userId === currentUserId;
    const isManager = report.managerId === currentUserId;

    if (!isOwner && !isManager) {
      throw new ForbiddenException('You do not have access to this report');
    }

    if (isManager && !report.readAt) {
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
        },
      });
    }

    return this.prisma.dailyReport.findMany({
      where: {
        managerId,
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

    if (report.managerId !== managerId) {
      throw new ForbiddenException('You are not allowed to update this report');
    }

    return this.prisma.dailyReport.update({
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
        comments: true,
      },
    });
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
    const isManager = report.managerId === userId;

    if (!isOwner && !isManager) {
      throw new ForbiddenException('You do not have access to this report');
    }

    return this.prisma.dailyReportComment.create({
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
