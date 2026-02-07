import { IsString, IsOptional, MaxLength } from "class-validator";

export class PublishContentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  connectionId?: string;
}
