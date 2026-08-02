import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectWorkflowRequestDto {
  @IsNotEmpty({ message: 'علت رد درخواست باید ذکر شود' })
  @IsString()
  @MaxLength(1000)
  comment: string;
}
