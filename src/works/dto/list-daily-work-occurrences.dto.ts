import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import {
  DailyOccurrenceGenerationType,
  WorkStatus,
} from '@prisma/client';

function transformBoolean({
  value,
}: {
  value: unknown;
}): unknown {
  if (
    value === true ||
    value === 'true' ||
    value === '1' ||
    value === 1
  ) {
    return true;
  }

  if (
    value === false ||
    value === 'false' ||
    value === '0' ||
    value === 0
  ) {
    return false;
  }

  return value;
}

export enum DailyOccurrenceSortBy {
  DATE = 'date',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  STATUS = 'status',
  PROGRESS = 'progress',
}

export enum DailyOccurrenceSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ListDailyWorkOccurrencesDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsEnum(WorkStatus)
  status?: WorkStatus;

  @IsOptional()
  @IsEnum(DailyOccurrenceGenerationType)
  generationType?: DailyOccurrenceGenerationType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  creatorId?: number;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  includeTasks?: boolean;

  @IsOptional()
  @IsEnum(DailyOccurrenceSortBy)
  sortBy?: DailyOccurrenceSortBy = DailyOccurrenceSortBy.DATE;

  @IsOptional()
  @IsEnum(DailyOccurrenceSortOrder)
  sortOrder?: DailyOccurrenceSortOrder =
    DailyOccurrenceSortOrder.DESC;

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
