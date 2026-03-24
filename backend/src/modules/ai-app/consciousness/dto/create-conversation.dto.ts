import { IsString, IsNotEmpty, MaxLength } from "class-validator";

export class CreateConversationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;
}
