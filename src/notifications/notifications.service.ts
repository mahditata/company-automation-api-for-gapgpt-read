import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type CreateNotificationInput = {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  reportId?: number | null;
};

type CreateManagerHierarchyNotificationsInput = {
  /**
   * شناسه کاربری که می‌خواهیم تمام مدیران بالادست او را پیدا کنیم.
   */
  subordinateId: number;

  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  reportId?: number | null;

  /**
   * شناسه کاربرانی که نباید برای آن‌ها اعلان ساخته شود.
   * معمولاً کاربری که خودش عملیات را انجام داده است.
   */
  excludeUserIds?: number[];
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateNotificationInput) {
    return this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
        reportId: input.reportId ?? null,
      },
    });
  }

  /**
   * ساخت اعلان برای چند کاربر.
   *
   * شناسه‌های تکراری و نامعتبر حذف می‌شوند.
   */
  async createForUsers(
    userIds: number[],
    input: Omit<CreateNotificationInput, 'userId'>,
  ) {
    const uniqueUserIds = [
      ...new Set(
        userIds.filter(
          (userId) => Number.isInteger(userId) && userId > 0,
        ),
      ),
    ];

    if (uniqueUserIds.length === 0) {
      return {
        count: 0,
        userIds: [],
      };
    }

    const result = await this.prisma.notification.createMany({
      data: uniqueUserIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
        reportId: input.reportId ?? null,
      })),
    });

    return {
      count: result.count,
      userIds: uniqueUserIds,
    };
  }

  /**
   * گرفتن تمام مدیران بالادست یک کاربر.
   *
   * مثال:
   * کارمند -> سرپرست -> مدیر واحد -> مدیرکل
   *
   * خروجی شامل هر سه مدیر خواهد بود.
   */
  async getAllManagerIds(userId: number): Promise<number[]> {
    const managerIds: number[] = [];
    const visitedUserIds = new Set<number>();

    let currentUserId: number | null = userId;

    while (currentUserId !== null) {
      if (visitedUserIds.has(currentUserId)) {
        break;
      }

      visitedUserIds.add(currentUserId);

      const user: { managerId: number | null } | null =
        await this.prisma.user.findUnique({
          where: {
            id: currentUserId,
          },
          select: {
            managerId: true,
          },
        });

      if (!user || user.managerId === null) {
        break;
      }

      const managerId: number = user.managerId;

      if (visitedUserIds.has(managerId)) {
        break;
      }

      managerIds.push(managerId);
      currentUserId = managerId;
    }

    return [...new Set(managerIds)];
  }

  /**
   * ساخت اعلان برای تمام مدیران مستقیم و غیرمستقیم یک کاربر.
   */
  async createForManagerHierarchy(
    input: CreateManagerHierarchyNotificationsInput,
  ) {
    const managerIds = await this.getAllManagerIds(
      input.subordinateId,
    );

    const excludedUserIds = new Set(
      (input.excludeUserIds ?? []).filter(
        (userId) => Number.isInteger(userId) && userId > 0,
      ),
    );

    const recipientIds = managerIds.filter(
      (managerId) =>
        managerId !== input.subordinateId &&
        !excludedUserIds.has(managerId),
    );

    return this.createForUsers(recipientIds, {
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link,
      reportId: input.reportId,
    });
  }

  async findAll(userId: number) {
    return this.prisma.notification.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        report: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });
  }

  async getUnreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return { count };
  }

  async markAsRead(id: number, userId: number) {
    const notification =
      await this.prisma.notification.findFirst({
        where: {
          id,
          userId,
        },
        select: {
          id: true,
          isRead: true,
        },
      });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.isRead) {
      return this.prisma.notification.findUnique({
        where: { id },
      });
    }

    return this.prisma.notification.update({
      where: {
        id,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  async markAllAsRead(userId: number) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      updatedCount: result.count,
    };
  }
}
