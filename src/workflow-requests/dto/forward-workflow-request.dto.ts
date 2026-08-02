import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ForwardWorkflowRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetUserId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  targetDepartmentId?: number;

  @IsNotEmpty({ message: 'توضیح ارجاع باید وارد شود' })
  @IsString()
  @MaxLength(1000)
  comment: string;
}
