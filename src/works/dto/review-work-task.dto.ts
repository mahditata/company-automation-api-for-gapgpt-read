import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export enum WorkTaskReviewDecision {
  APPROVE = 'APPROVE',
  NEEDS_REVISION = 'NEEDS_REVISION',
}

export class ReviewWorkTaskDto {
  @IsEnum(WorkTaskReviewDecision)
  decision: WorkTaskReviewDecision;

  @IsOptional()
  @ValidateIf(
    (dto: ReviewWorkTaskDto) =>
      dto.decision === WorkTaskReviewDecision.NEEDS_REVISION,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  comment?: string;
}
