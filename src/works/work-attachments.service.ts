import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { WorkAuthorizationService } from './work-authorization.service';

type CreateAttachmentInput = {
  workId: number;
  taskId?: number | null;
  occurrenceId?: number | null;
  dailyWorkTaskId?: number | null;
  fileName: string;
  filePath: string;
  mimeType: string;
  size: number;
};

@Injectable()
export class WorkAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkAuthorizationService,
  ) {}

  async findByWork(workId: number, userId: number) {
    await this.authorization.assertCanViewWork(workId, userId);

    return this.prisma.workAttachment.findMany({
      where: {
        workId,
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(
    input: CreateAttachmentInput,
    uploadedById: number,
  ) {
    await this.authorization.assertCanViewWork(
      input.workId,
      uploadedById,
    );

    const targetCount = [
      input.taskId,
      input.occurrenceId,
      input.dailyWorkTaskId,
    ].filter((value) => value !== undefined && value !== null).length;

    if (targetCount > 1) {
      throw new BadRequestException(
        'An attachment can belong to only one task or daily occurrence target',
      );
    }

    if (input.taskId) {
      const task = await this.prisma.workTask.findFirst({
        where: {
          id: input.taskId,
          workId: input.workId,
        },
        select: {
          id: true,
        },
      });

      if (!task) {
        throw new BadRequestException(
          'Task does not belong to this work',
        );
      }
    }

    if (input.occurrenceId) {
      const occurrence =
        await this.prisma.dailyWorkOccurrence.findFirst({
          where: {
            id: input.occurrenceId,
            workId: input.workId,
          },
          select: {
            id: true,
          },
        });

      if (!occurrence) {
        throw new BadRequestException(
          'Daily occurrence does not belong to this work',
        );
      }
    }

    if (input.dailyWorkTaskId) {
      const dailyTask = await this.prisma.dailyWorkTask.findFirst({
        where: {
          id: input.dailyWorkTaskId,
          occurrence: {
            workId: input.workId,
          },
        },
        select: {
          id: true,
        },
      });

      if (!dailyTask) {
        throw new BadRequestException(
          'Daily task does not belong to this work',
        );
      }
    }

    const attachment = await this.prisma.$transaction(
      async (transaction) => {
        const createdAttachment =
          await transaction.workAttachment.create({
            data: {
              workId: input.workId,
              taskId: input.taskId ?? null,
              occurrenceId: input.occurrenceId ?? null,
              dailyWorkTaskId: input.dailyWorkTaskId ?? null,
              fileName: input.fileName,
              filePath: input.filePath,
              mimeType: input.mimeType,
              size: input.size,
              uploadedById,
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
          });

        await transaction.workActivity.create({
          data: {
            workId: input.workId,
            userId: uploadedById,
            taskId: input.taskId ?? null,
            occurrenceId: input.occurrenceId ?? null,
            dailyWorkTaskId: input.dailyWorkTaskId ?? null,
            type: 'ATTACHMENT_ADDED',
            description: `Attachment "${input.fileName}" was added`,
            metadata: {
              attachmentId: createdAttachment.id,
              fileName: input.fileName,
              mimeType: input.mimeType,
              size: input.size,
            },
          },
        });

        return createdAttachment;
      },
    );

    return attachment;
  }

  async remove(attachmentId: number, userId: number) {
    const attachment = await this.prisma.workAttachment.findUnique({
      where: {
        id: attachmentId,
      },
      include: {
        work: {
          select: {
            creatorId: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!attachment || attachment.work.deletedAt) {
      throw new NotFoundException('Work attachment not found');
    }

    const canDelete =
      attachment.uploadedById === userId ||
      attachment.work.creatorId === userId;

    if (!canDelete) {
      throw new BadRequestException(
        'Only the uploader or work creator can remove this attachment',
      );
    }

    await this.prisma.workAttachment.delete({
      where: {
        id: attachmentId,
      },
    });

    await this.deletePhysicalFile(attachment.filePath);

    return {
      message: 'Attachment removed successfully',
      id: attachmentId,
    };
  }

  private async deletePhysicalFile(filePath: string) {
    const uploadsRoot = resolve(process.cwd(), 'uploads');
    const absoluteFilePath = resolve(process.cwd(), filePath);

    if (
      absoluteFilePath !== uploadsRoot &&
      !absoluteFilePath.startsWith(`${uploadsRoot}/`) &&
      !absoluteFilePath.startsWith(`${uploadsRoot}\\`)
    ) {
      return;
    }

    try {
      await fs.unlink(absoluteFilePath);
    } catch (error) {
      const fileError = error as NodeJS.ErrnoException;

      if (fileError.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
