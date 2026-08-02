import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export enum DailyWorkTaskReviewDecision {
  APPROVE = 'APPROVE',
  NEEDS_REVISION = 'NEEDS_REVISION',
}

export class ReviewDailyWorkTaskDto {
  @IsEnum(DailyWorkTaskReviewDecision)
  decision: DailyWorkTaskReviewDecision;

  @ValidateIf(
    (dto: ReviewDailyWorkTaskDto) =>
      dto.decision ===
      DailyWorkTaskReviewDecision.NEEDS_REVISION,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  comment?: string;
}
