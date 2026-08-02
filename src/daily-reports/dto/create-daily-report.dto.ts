import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDailyReportAttachmentDto {
  @IsString()
  fileName: string;

  @IsString()
  filePath: string;

  @IsString()
  mimeType: string;

  size: number;
}

export class CreateDailyReportDto {
  @IsDateString()
  reportDate: string;

  @IsString()
  title: string;

  @IsString()
  @MaxLength(500)
  content: string;

  @IsOptional()
  @IsString()
  problems?: string;

  @IsOptional()
  @IsString()
  suggestions?: string;

  @IsOptional()
  @IsArray()
  attachments?: CreateDailyReportAttachmentDto[];
}
