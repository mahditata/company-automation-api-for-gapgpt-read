import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { WorkflowRequestType } from '@prisma/client';
import { CreateWorkflowDefinitionDto } from './dto/create-workflow-definition.dto';
import { CreateWorkflowStepDefinitionDto } from './dto/create-workflow-step-definition.dto';
import { UpdateWorkflowDefinitionDto } from './dto/update-workflow-definition.dto';
import { UpdateWorkflowStepDefinitionDto } from './dto/update-workflow-step-definition.dto';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  createWorkflow(
    @Body() dto: CreateWorkflowDefinitionDto,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);

    return this.workflowsService.createWorkflowDefinition(userId, dto);
  }

  @Get()
  findAllWorkflows(
    @Query('isActive') isActive?: string,
    @Query('type') type?: WorkflowRequestType,
  ) {
    let activeFilter: boolean | undefined;

    if (isActive !== undefined) {
      if (isActive !== 'true' && isActive !== 'false') {
        throw new BadRequestException(
          'isActive must be either true or false.',
        );
      }

      activeFilter = isActive === 'true';
    }

    return this.workflowsService.findAllWorkflowDefinitions(
      activeFilter,
      type,
    );
  }

  @Get(':id')
  findWorkflowById(@Param('id', ParseIntPipe) id: number) {
    return this.workflowsService.findWorkflowDefinitionById(id);
  }

  @Patch(':id')
  updateWorkflow(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkflowDefinitionDto,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);

    return this.workflowsService.updateWorkflowDefinition(
      userId,
      id,
      dto,
    );
  }

  @Delete(':id')
  deleteWorkflow(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);

    return this.workflowsService.removeWorkflowDefinition(userId, id);
  }

  @Post(':workflowId/steps')
  createStep(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Body() dto: CreateWorkflowStepDefinitionDto,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);

    return this.workflowsService.createWorkflowStepDefinition(
      userId,
      workflowId,
      dto,
    );
  }

  @Get(':workflowId/steps')
  findWorkflowSteps(
    @Param('workflowId', ParseIntPipe) workflowId: number,
  ) {
    return this.workflowsService.findWorkflowSteps(workflowId);
  }

  @Get(':workflowId/steps/:stepId')
  findWorkflowStep(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
  ) {
    return this.workflowsService.findWorkflowStepById(
      workflowId,
      stepId,
    );
  }

  @Patch(':workflowId/steps/:stepId')
  updateStep(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @Body() dto: UpdateWorkflowStepDefinitionDto,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);

    return this.workflowsService.updateWorkflowStepDefinition(
      userId,
      workflowId,
      stepId,
      dto,
    );
  }

  @Delete(':workflowId/steps/:stepId')
  deleteStep(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @Req() req: any,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = this.getCurrentUserId(req, userIdHeader);

    return this.workflowsService.removeWorkflowStepDefinition(
      userId,
      workflowId,
      stepId,
    );
  }

  private getCurrentUserId(
    req: any,
    userIdHeader?: string,
  ): number {
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
      throw new UnauthorizedException(
        'User authentication is required.',
      );
    }

    const userId = Number(rawUserId);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BadRequestException('Invalid user identifier.');
    }

    return userId;
  }
}
