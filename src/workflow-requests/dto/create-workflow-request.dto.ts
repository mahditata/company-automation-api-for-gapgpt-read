import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateWorkflowRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  workflowDefinitionId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  formData?: Record<string, any>;

  /**
   * اگر ارسال نشود، واحد سازمانی سازنده درخواست استفاده می‌شود.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departmentId?: number;
}
