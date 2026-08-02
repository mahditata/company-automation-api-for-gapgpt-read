import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { WorkTaskStatus } from '@prisma/client';

export class UpdateWorkTaskStatusDto {
  @IsEnum(WorkTaskStatus)
  status: WorkTaskStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
