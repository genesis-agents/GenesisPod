import { IsString, IsOptional } from "class-validator";

export class PublishContentDto {
  @IsOptional()
  @IsString()
  connectionId?: string;
}
