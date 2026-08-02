import { WorkflowAssigneeType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateWorkflowStepDefinitionDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  stepOrder: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(WorkflowAssigneeType)
  assigneeType: WorkflowAssigneeType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  roleId?: number;

  @IsOptional()
  @IsBoolean()
  canReject?: boolean;

  @IsOptional()
  @IsBoolean()
  canReturn?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresApprovalComment?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
