import { IsString, MaxLength } from 'class-validator';

export class AddDailyReportCommentDto {
  @IsString()
  @MaxLength(1000)
  text: string;
}
