import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AddDailyReportCommentDto } from './dto/add-daily-report-comment.dto';
import { CreateDailyReportDto } from './dto/create-daily-report.dto';
import { UpdateDailyReportStatusDto } from './dto/update-daily-report-status.dto';
import { DailyReportsService } from './daily-reports.service';

const dailyReportsUploadPath = './uploads/daily-reports';

@Controller('daily-reports')
export class DailyReportsController {
  constructor(private readonly dailyReportsService: DailyReportsService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('attachments', 10, {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          if (!existsSync(dailyReportsUploadPath)) {
            mkdirSync(dailyReportsUploadPath, { recursive: true });
          }

          callback(null, dailyReportsUploadPath);
        },
        filename: (_req, file, callback) => {
          const fileExtension = extname(file.originalname);
          const safeOriginalName = file.originalname
            .replace(fileExtension, '')
            .replace(/[^a-zA-Z0-9آ-ی-_]/g, '-');

          const fileName = `${Date.now()}-${Math.round(
            Math.random() * 1e9,
          )}-${safeOriginalName}${fileExtension}`;

          callback(null, fileName);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 10,
      },
      fileFilter: (_req, file, callback) => {
        const allowedMimeTypes = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              'Only image, PDF, Word, and Excel files are allowed',
            ),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  create(
    @Body() createDailyReportDto: CreateDailyReportDto,
    @UploadedFiles() files: any[],
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);

    return this.dailyReportsService.create(
      userId,
      createDailyReportDto,
      files,
    );
  }

  @Get('my')
  findMyReports(
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
    @Query('date') date?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);

    if (date) {
      return this.dailyReportsService.findByDate(userId, date);
    }

    return this.dailyReportsService.findMyReports(userId);
  }

  @Get('manager')
  findReportsForManager(
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
    @Query('date') date?: string,
    @Query('subordinateId') subordinateId?: string,
  ) {
    const managerId = this.getCurrentUserId(req, userIdHeader);

    let normalizedSubordinateId: number | undefined;

    if (
      subordinateId !== undefined &&
      subordinateId !== null &&
      subordinateId.trim() !== ''
    ) {
      normalizedSubordinateId = Number(subordinateId);

      if (
        !Number.isInteger(normalizedSubordinateId) ||
        normalizedSubordinateId <= 0
      ) {
        throw new BadRequestException('Invalid subordinate id');
      }
    }

    return this.dailyReportsService.findReportsForManager(
      managerId,
      date,
      normalizedSubordinateId,
    );
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);

    return this.dailyReportsService.findOne(id, userId);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDailyReportStatusDto: UpdateDailyReportStatusDto,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const managerId = this.getCurrentUserId(req, userIdHeader);

    return this.dailyReportsService.updateStatus(
      id,
      managerId,
      updateDailyReportStatusDto,
    );
  }

  @Post(':id/comments')
  addComment(
    @Param('id', ParseIntPipe) id: number,
    @Body() addDailyReportCommentDto: AddDailyReportCommentDto,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);

    return this.dailyReportsService.addComment(
      id,
      userId,
      addDailyReportCommentDto,
    );
  }

  private getCurrentUserId(req: any, userIdHeader?: string): number {
    const rawUserId =
      req?.user?.userId ??
      req?.user?.id ??
      req?.user?.sub ??
      userIdHeader;

    if (
      rawUserId === undefined ||
      rawUserId === null ||
      String(rawUserId).trim() === ''
    ) {
      throw new UnauthorizedException('User id is required');
    }

    const userId = Number(rawUserId);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('Invalid user id');
    }

    return userId;
  }
}
