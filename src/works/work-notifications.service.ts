import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTransactionClient = Prisma.TransactionClient;

type NotificationClient = Pick<
  PrismaService,
  'notification'
> | PrismaTransactionClient;

type CreateWorkNotificationInput = {
  userId: number;
  workId: number;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
};

type CreateWorkNotificationsInput = {
  userIds: number[];
  workId: number;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  excludeUserIds?: number[];
};

@Injectable()
export class WorkNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateWorkNotificationInput,
    client: NotificationClient = this.prisma,
  ) {
    return client.notification.create({
      data: {
        userId: input.userId,
        workId: input.workId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? `/works/${input.workId}`,
      },
    });
  }

  async createForUsers(
    input: CreateWorkNotificationsInput,
    client: NotificationClient = this.prisma,
  ) {
    const excludedUserIds = new Set(
      (input.excludeUserIds ?? []).filter(
        (userId) => Number.isInteger(userId) && userId > 0,
      ),
    );

    const userIds = [
      ...new Set(
        input.userIds.filter(
          (userId) =>
            Number.isInteger(userId) &&
            userId > 0 &&
            !excludedUserIds.has(userId),
        ),
      ),
    ];

    if (userIds.length === 0) {
      return {
        count: 0,
        userIds: [],
      };
    }

    const result = await client.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        workId: input.workId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? `/works/${input.workId}`,
      })),
    });

    return {
      count: result.count,
      userIds,
    };
  }

  async notifyWorkCreated(
    workId: number,
    workTitle: string,
    recipientIds: number[],
    actorId: number,
    client: NotificationClient = this.prisma,
  ) {
    return this.createForUsers(
      {
        userIds: recipientIds,
        excludeUserIds: [actorId],
        workId,
        type: NotificationType.WORK_CREATED,
        title: 'New work created',
        message: `You have been added to "${workTitle}".`,
      },
      client,
    );
  }

  async notifyWorkAssigned(
    workId: number,
    workTitle: string,
    recipientIds: number[],
    actorId: number,
    client: NotificationClient = this.prisma,
  ) {
    return this.createForUsers(
      {
        userIds: recipientIds,
        excludeUserIds: [actorId],
        workId,
        type: NotificationType.WORK_ASSIGNED,
        title: 'Work assigned',
        message: `You have been assigned to "${workTitle}".`,
      },
      client,
    );
  }

  async notifyWorkStatusChanged(
    workId: number,
    workTitle: string,
    status: string,
    recipientIds: number[],
    actorId: number,
    client: NotificationClient = this.prisma,
  ) {
    return this.createForUsers(
      {
        userIds: recipientIds,
        excludeUserIds: [actorId],
        workId,
        type: NotificationType.WORK_STATUS_CHANGED,
        title: 'Work status changed',
        message: `Status of "${workTitle}" changed to ${status}.`,
      },
      client,
    );
  }

  async notifyTaskStatusChanged(
    workId: number,
    workTitle: string,
    taskTitle: string,
    status: string,
    recipientIds: number[],
    actorId: number,
    client: NotificationClient = this.prisma,
  ) {
    return this.createForUsers(
      {
        userIds: recipientIds,
        excludeUserIds: [actorId],
        workId,
        type: NotificationType.WORK_TASK_STATUS_CHANGED,
        title: 'Task status changed',
        message: `Task "${taskTitle}" in "${workTitle}" changed to ${status}.`,
      },
      client,
    );
  }

  async notifyRevisionRequested(
    workId: number,
    workTitle: string,
    taskTitle: string,
    recipientIds: number[],
    actorId: number,
    client: NotificationClient = this.prisma,
  ) {
    return this.createForUsers(
      {
        userIds: recipientIds,
        excludeUserIds: [actorId],
        workId,
        type: NotificationType.WORK_REVISION_REQUESTED,
        title: 'Task revision requested',
        message: `Revision was requested for task "${taskTitle}" in "${workTitle}".`,
      },
      client,
    );
  }

  async notifyCommentAdded(
    workId: number,
    workTitle: string,
    recipientIds: number[],
    actorId: number,
    client: NotificationClient = this.prisma,
  ) {
    return this.createForUsers(
      {
        userIds: recipientIds,
        excludeUserIds: [actorId],
        workId,
        type: NotificationType.WORK_COMMENT_ADDED,
        title: 'New work comment',
        message: `A new comment was added to "${workTitle}".`,
      },
      client,
    );
  }
}
