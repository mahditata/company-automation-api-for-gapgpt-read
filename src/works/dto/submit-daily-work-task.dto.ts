import {
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SubmitDailyWorkTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
