import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateWorkCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  text: string;
}
