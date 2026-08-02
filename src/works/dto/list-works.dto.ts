import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { WorkStatus, WorkType } from '@prisma/client';

function transformBoolean({ value }: { value: unknown }): unknown {
  if (value === true || value === 'true' || value === '1' || value === 1) {
    return true;
  }

  if (value === false || value === 'false' || value === '0' || value === 0) {
    return false;
  }

  return value;
}

export enum WorkSortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  DEADLINE = 'deadline',
  TITLE = 'title',
  STATUS = 'status',
  PROGRESS = 'progress',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ListWorksDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  search?: string;

  @IsOptional()
  @IsEnum(WorkType)
  type?: WorkType;

  @IsOptional()
  @IsEnum(WorkStatus)
  status?: WorkStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  creatorId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  memberId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeId?: number;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  includeDeleted?: boolean;

  @IsOptional()
  @IsEnum(WorkSortBy)
  sortBy?: WorkSortBy = WorkSortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
