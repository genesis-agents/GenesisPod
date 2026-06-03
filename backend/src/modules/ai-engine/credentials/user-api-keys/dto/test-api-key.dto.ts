import { IsString, MaxLength, MinLength, IsOptional } from "class-validator";

export class TestApiKeyDto {
  @IsString()
  @MinLength(1, { message: "API Key cannot be empty" })
  @MaxLength(500)
  apiKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiEndpoint?: string;
}
