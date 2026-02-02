import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  MinLength,
} from "class-validator";

export enum ApiKeyMode {
  PERSONAL = "personal",
  DONATED = "donated",
}

export class SaveUserApiKeyDto {
  @IsString()
  @MinLength(1, { message: "API Key cannot be empty" })
  @MaxLength(500)
  apiKey!: string;

  @IsEnum(ApiKeyMode)
  mode!: ApiKeyMode;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  preferredModelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiEndpoint?: string;
}
