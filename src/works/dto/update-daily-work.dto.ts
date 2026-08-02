import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { WorkStatus } from '@prisma/client';

export class UpdateDailyWorkDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  title?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  description?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsDateString()
  deadline?: string | null;

  @IsOptional()
  @IsEnum(WorkStatus)
  status?: WorkStatus;
}
