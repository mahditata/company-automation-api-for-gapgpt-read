import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitWorkTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
