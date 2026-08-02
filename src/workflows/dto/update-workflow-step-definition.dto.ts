import { WorkflowAssigneeType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateWorkflowStepDefinitionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  stepOrder?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(WorkflowAssigneeType)
  assigneeType?: WorkflowAssigneeType;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    return Number(value);
  })
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @IsPositive()
  roleId?: number | null;

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
