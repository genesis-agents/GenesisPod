import { IsString, IsNotEmpty, MaxLength } from "class-validator";

export class SendConsciousnessMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  content!: string;
}
