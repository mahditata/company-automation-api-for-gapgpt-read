import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AddWorkMemberDto } from './dto/add-work-member.dto';
import { CreateDailyWorkDto } from './dto/create-daily-work.dto';
import { CreateDailyWorkTaskDto } from './dto/create-daily-work-task.dto';
import { CreateWorkCommentDto } from './dto/create-work-comment.dto';
import { CreateWorkDto } from './dto/create-work.dto';
import { CreateWorkTaskDto } from './dto/create-work-task.dto';
import { ListDailyWorkOccurrencesDto } from './dto/list-daily-work-occurrences.dto';
import { ListWorksDto } from './dto/list-works.dto';
import { ReviewDailyWorkTaskDto } from './dto/review-daily-work-task.dto';
import { ReviewWorkTaskDto } from './dto/review-work-task.dto';
import { SubmitDailyWorkTaskDto } from './dto/submit-daily-work-task.dto';
import { SubmitWorkTaskDto } from './dto/submit-work-task.dto';
import { UpdateDailyWorkDto } from './dto/update-daily-work.dto';
import { UpdateDailyWorkTaskDto } from './dto/update-daily-work-task.dto';
import { UpdateWorkDto } from './dto/update-work.dto';
import { UpdateWorkTaskDto } from './dto/update-work-task.dto';
import { UpdateWorkTaskStatusDto } from './dto/update-work-task-status.dto';
import { WorkSummaryReportDto } from './dto/work-summary-report.dto';
import { DailyWorksService } from './daily-works.service';
import { WorkReportsService } from './work-reports.service';
import { WorksService } from './works.service';

type AuthenticatedRequest = Request & {
  user: {
    userId: number;
    username: string;
    phone: string | null;
    role: string;
    departmentId: number;
  };
};

@UseGuards(JwtAuthGuard)
@Controller('works')
export class WorksController {
  constructor(
    private readonly worksService: WorksService,
    private readonly dailyWorksService: DailyWorksService,
    private readonly workReportsService: WorkReportsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------------

  /**
   * گزارش خلاصه از Workهای متناظر با فیلترها.
   *
   * GET /works/reports/summary
   */
  @Get('reports/summary')
  getSummaryReport(
    @Req() req: AuthenticatedRequest,
    @Query() query: WorkSummaryReportDto,
  ) {
    return this.workReportsService.getSummary(req.user.userId, query);
  }

  // ---------------------------------------------------------------------------
  // Daily Works
  // ---------------------------------------------------------------------------

  /**
   * ایجاد Daily Work با مشخصات schedule و template taskها.
   *
   * POST /works/daily
   */
  @Post('daily')
  createDailyWork(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateDailyWorkDto,
  ) {
    return this.dailyWorksService.create(req.user.userId, dto);
  }

  /**
   * دریافت جزئیات یک Daily Work.
   *
   * GET /works/daily/:workId
   */
  @Get('daily/:workId')
  findDailyWork(
    @Req() req: AuthenticatedRequest,
    @Param('workId', ParseIntPipe) workId: number,
  ) {
    return this.dailyWorksService.findOne(req.user.userId, workId);
  }

  /**
   * به‌روزرسانی Daily Work و schedule آن.
   *
   * PATCH /works/daily/:workId
   */
  @Patch('daily/:workId')
  updateDailyWork(
    @Req() req: AuthenticatedRequest,
    @Param('workId', ParseIntPipe) workId: number,
    @Body() dto: UpdateDailyWorkDto,
  ) {
    return this.dailyWorksService.update(req.user.userId, workId, dto);
  }

  /**
   * تولید یک occurrence جدید برای Daily Work.
   *
   * POST /works/daily/:workId/occurrences
   */
  @Post('daily/:workId/occurrences')
  generateDailyOccurrence(
    @Req() req: AuthenticatedRequest,
    @Param('workId', ParseIntPipe) workId: number,
  ) {
    return this.dailyWorksService.generateOccurrence(req.user.userId, workId);
  }

  /**
   * لیست occurrenceهای یک Daily Work با فیلتر و صفحه‌بندی.
   *
   * GET /works/daily/:workId/occurrences
   */
  @Get('daily/:workId/occurrences')
  listDailyOccurrences(
    @Req() req: AuthenticatedRequest,
    @Param('workId', ParseIntPipe) workId: number,
    @Query() query: ListDailyWorkOccurrencesDto,
  ) {
    return this.dailyWorksService.listOccurrences(
      req.user.userId,
      workId,
      query,
    );
  }

  /**
   * دریافت یک occurrence.
   *
   * GET /works/daily/occurrences/:occurrenceId
   */
  @Get('daily/occurrences/:occurrenceId')
  findDailyOccurrence(
    @Req() req: AuthenticatedRequest,
    @Param('occurrenceId', ParseIntPipe) occurrenceId: number,
  ) {
    return this.dailyWorksService.findOccurrence(
      req.user.userId,
      occurrenceId,
    );
  }

  /**
   * گزارش خلاصه برای Daily Work مشخص.
   *
   * GET /works/daily/:workId/report
   */
  @Get('daily/:workId/report')
  getDailyWorkReport(
    @Req() req: AuthenticatedRequest,
    @Param('workId', ParseIntPipe) workId: number,
    @Query() query: WorkSummaryReportDto,
  ) {
    return this.workReportsService.getSummary(req.user.userId, {
      ...query,
      workId,
    });
  }

  // ---------------------------------------------------------------------------
  // Daily Work template tasks
  // ---------------------------------------------------------------------------

  /**
   * افزودن template task به Daily Work.
   *
   * POST /works/daily/:workId/tasks
   */
  @Post('daily/:workId/tasks')
  createDailyWorkTemplateTask(
    @Req() req: AuthenticatedRequest,
    @Param('workId', ParseIntPipe) workId: number,
    @Body() dto: CreateDailyWorkTaskDto,
  ) {
    return this.dailyWorksService.createTemplateTask(
      req.user.userId,
      workId,
      dto,
    );
  }

  /**
   * به‌روزرسانی template task تعریف‌شده در Daily Work.
   *
   * PATCH /works/daily/template-tasks/:taskId
   */
  @Patch('daily/template-tasks/:taskId')
  updateDailyWorkTemplateTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateDailyWorkTaskDto,
  ) {
    return this.dailyWorksService.updateTemplateTask(
      req.user.userId,
      taskId,
      dto,
    );
  }

  /**
   * حذف template task تعریف‌شده در Daily Work.
   *
   * DELETE /works/daily/template-tasks/:taskId
   */
  @Delete('daily/template-tasks/:taskId')
  removeDailyWorkTemplateTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.dailyWorksService.removeTemplateTask(req.user.userId, taskId);
  }

  // ---------------------------------------------------------------------------
  // Daily occurrence tasks
  // ---------------------------------------------------------------------------

  /**
   * افزودن task مستقل به occurrence.
   *
   * POST /works/daily/occurrences/:occurrenceId/tasks
   */
  @Post('daily/occurrences/:occurrenceId/tasks')
  createDailyOccurrenceTask(
    @Req() req: AuthenticatedRequest,
    @Param('occurrenceId', ParseIntPipe) occurrenceId: number,
    @Body() dto: CreateDailyWorkTaskDto,
  ) {
    return this.dailyWorksService.createOccurrenceTask(
      req.user.userId,
      occurrenceId,
      dto,
    );
  }

  /**
   * به‌روزرسانی task مربوط به occurrence.
   *
   * PATCH /works/daily/tasks/:taskId
   */
  @Patch('daily/tasks/:taskId')
  updateDailyOccurrenceTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateDailyWorkTaskDto,
  ) {
    return this.dailyWorksService.updateOccurrenceTask(
      req.user.userId,
      taskId,
      dto,
    );
  }

  /**
   * حذف task مربوط به occurrence.
   *
   * DELETE /works/daily/tasks/:taskId
   */
  @Delete('daily/tasks/:taskId')
  removeDailyOccurrenceTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.dailyWorksService.removeOccurrenceTask(req.user.userId, taskId);
  }

  /**
   * ارسال task انجام‌شده توسط مسئول.
   *
   * POST /works/daily/tasks/:taskId/submit
   */
  @Post('daily/tasks/:taskId/submit')
  submitDailyOccurrenceTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: SubmitDailyWorkTaskDto,
  ) {
    return this.dailyWorksService.submitTask(req.user.userId, taskId, dto);
  }

  /**
   * بررسی و تایید/رد task انجام‌شده.
   *
   * POST /works/daily/tasks/:taskId/review
   */
  @Post('daily/tasks/:taskId/review')
  reviewDailyOccurrenceTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: ReviewDailyWorkTaskDto,
  ) {
    return this.dailyWorksService.reviewTask(req.user.userId, taskId, dto);
  }

  // ---------------------------------------------------------------------------
  // Normal Work tasks (ثبت قبل از :workId — مسیر tasks/*)
  // ---------------------------------------------------------------------------

  /**
   * دریافت جزئیات task.
   *
   * GET /works/tasks/:taskId
   */
  @Get('tasks/:taskId')
  findWorkTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.worksService.findTask(req.user.userId, taskId);
  }

  /**
   * به‌روزرسانی task.
   *
   * PATCH /works/tasks/:taskId
   */
  @Patch('tasks/:taskId')
  updateWorkTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateWorkTaskDto,
  ) {
    return this.worksService.updateTask(req.user.userId, taskId, dto);
  }

  /**
   * حذف task.
   *
   * DELETE /works/tasks/:taskId
   */
  @Delete('tasks/:taskId')
  removeWorkTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.worksService.removeTask(req.user.userId, taskId);
  }

  /**
   * تغییر وضعیت task.
   *
   * PATCH /works/tasks/:taskId/status
   */
  @Patch('tasks/:taskId/status')
  updateWorkTaskStatus(
    @Req() req: AuthenticatedRequest,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateWorkTaskStatusDto,
  ) {
    return this.worksService.updateTaskStatus(req.user.userId, taskId, dto);
  }

  /**
   * ارسال task توسط مسئول.
   *
   * POST /works/tasks/:taskId/submit
   */
  @Post('tasks/:taskId/submit')
  submitWorkTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: SubmitWorkTaskDto,
  ) {
    return this.worksService.submitTask(req.user.userId, taskId, dto);
  }

  /**
   * بررسی task توسط مدیر.
   *
   * POST /works/tasks/:taskId/review
   */
  @Post('tasks/:taskId/review')
  reviewWorkTask(
    @Req() req: AuthenticatedRequest,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: ReviewWorkTaskDto,
  ) {
    return this.worksService.reviewTask(req.user.userId, taskId, dto);
  }

  // ---------------------------------------------------------------------------
  // Normal Works
  // ---------------------------------------------------------------------------

  /**
   * ایجاد Work عادی.
   *
   * POST /works
   */
  @Post()
  createWork(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateWorkDto,
  ) {
    return this.worksService.create(req.user.userId, dto);
  }

  /**
   * لیست Workهای متناظر با فیلترها.
   *
   * GET /works
   */
  @Get()
  listWorks(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListWorksDto,
  ) {
    return this.worksService.findAll(req.user.userId, query);
  }

  /**
   * دریافت جزئیات یک Work.
   *
   * GET /works/:workId
   */
  @Get(':workId')
  findWork(
    @Req() req: AuthenticatedRequest,
    @Param('workId', ParseIntPipe) workId: number,
  ) {
    return this.worksService.findOne(req.user.userId, workId);
  }

  /**
   * به‌روزرسانی Work.
   *
   * PATCH /works/:workId
   */
  @Patch(':workId')
  updateWork(
    @Req() req: AuthenticatedRequest,
    @Param('workId', ParseIntPipe) workId: number,
    @Body() dto: UpdateWorkDto,
  ) {
    return this.worksService.update(req.user.userId, workId, dto);
  }

  /**
   * حذف نرم Work.
   *
   * DELETE /works/:workId
   */
  @Delete(':workId')
  removeWork(
    @Req() req: AuthenticatedRequest,
    @Param('workId', ParseIntPipe) workId: number,
  ) {
    return this.worksService.remove(req.user.userId, workId);
  }

  /**
   * بازگردانی Work حذف‌شده.
   *
   * POST /works/:workId/restore
   */
  @Post(':workId/restore')
  restoreWork(
    @Req() req: AuthenticatedRequest,
    @Param('workId', ParseIntPipe) workId: number,
  ) {
    return this.worksService.restore(req.user.userId, workId);
  }

  // ---------------------------------------------------------------------------
  // Work members
  // ---------------------------------------------------------------------------

  /**
   * افزودن عضو به Work.
   *
   * POST /works/:workId/members
   */
  @Post(':workId/members')
  addWorkMember(
    @Req() req: AuthenticatedRequest,
    @Param('workId', ParseIntPipe) workId: number,
    @Body() dto: AddWorkMemberDto,
  ) {
    return this.worksService.addMember(req.user.userId, workId, dto);
  }

  /**
   * حذف عضو از Work.
   *
   * DELETE /works/:workId/members/:memberUserId
   */
  @Delete(':workId/members/:memberUserId')
  removeWorkMember(
    @Req() req: AuthenticatedRequest,
    @Param('workId', ParseIntPipe) workId: number,
    @Param('memberUserId', ParseIntPipe) memberUserId: number,
  ) {
    return this.worksService.removeMember(
      req.user.userId,
      workId,
      memberUserId,
    );
  }

  // ---------------------------------------------------------------------------
  // Work comments
  // ---------------------------------------------------------------------------

  /**
   * ثبت نظر روی Work.
   *
   * POST /works/:workId/comments
   */
  @Post(':workId/comments')
  createWorkComment(
    @Req() req: AuthenticatedRequest,
    @Param('workId', ParseIntPipe) workId: number,
    @Body() dto: CreateWorkCommentDto,
  ) {
    return this.worksService.addComment(req.user.userId, workId, dto);
  }

  // ---------------------------------------------------------------------------
  // Normal Work tasks (زیرمجموعه یک Work)
  // ---------------------------------------------------------------------------

  /**
   * افزودن task به Work.
   *
   * POST /works/:workId/tasks
   */
  @Post(':workId/tasks')
  createWorkTask(
    @Req() req: AuthenticatedRequest,
    @Param('workId', ParseIntPipe) workId: number,
    @Body() dto: CreateWorkTaskDto,
  ) {
    return this.worksService.createTask(req.user.userId, workId, dto);
  }
}
