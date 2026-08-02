import { IsOptional, IsString, MaxLength, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ApproveWorkflowRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  /**
   * اگر مرحله بعدی نیاز به تعیین دستی گیرنده داشته باشد (مثلاً در گردش کارهای پویا)
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  nextAssigneeId?: number;
}
