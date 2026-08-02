import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { WorkflowRequestStatus, WorkflowRequestType } from '@prisma/client';

export enum WorkflowRequestListScope {
  ALL = 'all',
  CREATED_BY_ME = 'created_by_me',
  ASSIGNED_TO_ME = 'assigned_to_me',
}

export class ListWorkflowRequestsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsEnum(WorkflowRequestListScope)
  scope?: WorkflowRequestListScope;

  @IsOptional()
  @IsEnum(WorkflowRequestStatus)
  status?: WorkflowRequestStatus;

  @IsOptional()
  @IsEnum(WorkflowRequestType)
  type?: WorkflowRequestType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workflowDefinitionId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number;

  @IsOptional()
  @IsString()
  search?: string;
}
