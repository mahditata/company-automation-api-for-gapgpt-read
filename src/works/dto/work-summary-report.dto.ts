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
  WorkTaskStatus,
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

export class WorkSummaryReportDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeId?: number;

  @IsOptional()
  @IsEnum(WorkStatus)
  occurrenceStatus?: WorkStatus;

  @IsOptional()
  @IsEnum(WorkTaskStatus)
  taskStatus?: WorkTaskStatus;

  @IsOptional()
  @IsEnum(DailyOccurrenceGenerationType)
  generationType?: DailyOccurrenceGenerationType;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  includeOccurrences?: boolean;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  includeTasks?: boolean;

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
