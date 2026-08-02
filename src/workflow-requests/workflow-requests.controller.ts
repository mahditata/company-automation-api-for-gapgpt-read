import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateWorkflowRequestDto } from './dto/create-workflow-request.dto';
import { ListWorkflowRequestsDto } from './dto/list-workflow-requests.dto';
import { SubmitWorkflowRequestDto } from './dto/submit-workflow-request.dto';
import { ApproveWorkflowRequestDto } from './dto/approve-workflow-request.dto';
import { RejectWorkflowRequestDto } from './dto/reject-workflow-request.dto';
import { ForwardWorkflowRequestDto } from './dto/forward-workflow-request.dto';
import { WorkflowRequestsService } from './workflow-requests.service';

@Controller('workflow-requests')
export class WorkflowRequestsController {
  constructor(
    private readonly workflowRequestsService: WorkflowRequestsService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateWorkflowRequestDto,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);
    return this.workflowRequestsService.create(userId, dto);
  }

  @Post(':id/submit')
  submit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitWorkflowRequestDto,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);
    return this.workflowRequestsService.submit(userId, id, dto);
  }

  @Post(':id/approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveWorkflowRequestDto,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);
    return this.workflowRequestsService.approve(userId, id, dto);
  }

  @Post(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectWorkflowRequestDto,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);
    return this.workflowRequestsService.reject(userId, id, dto);
  }

  @Post(':id/forward')
  forward(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ForwardWorkflowRequestDto,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);
    return this.workflowRequestsService.forward(userId, id, dto);
  }

  @Get()
  findAll(
    @Query() query: ListWorkflowRequestsDto,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);
    return this.workflowRequestsService.findAll(userId, query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);
    return this.workflowRequestsService.findOne(userId, id);
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
      throw new UnauthorizedException('User authentication is required.');
    }

    const userId = Number(rawUserId);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('Invalid user identifier.');
    }

    return userId;
  }
}
