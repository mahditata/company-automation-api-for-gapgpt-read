import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitWorkflowRequestDto {
  /**
   * فقط زمانی لازم است که نوع گیرنده مرحله اول MANUAL باشد.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
