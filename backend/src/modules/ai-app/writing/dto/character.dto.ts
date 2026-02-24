import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsObject,
  MaxLength,
  IsNotEmpty,
} from "class-validator";
import { CharacterRole } from "@prisma/client";

export class CreateCharacterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @IsOptional()
  @IsEnum(CharacterRole)
  role?: CharacterRole;

  @IsOptional()
  @IsObject()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- character appearance is an open DTO; shape varies by character type
  appearance?: Record<string, any>;

  @IsOptional()
  @IsObject()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- character personality is an open DTO; shape varies by character type
  personality?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  background?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  abilities?: string[];

  @IsOptional()
  @IsObject()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- character current state is an open DTO; shape varies at runtime
  currentState?: Record<string, any>;
}

export class UpdateCharacterDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @IsOptional()
  @IsEnum(CharacterRole)
  role?: CharacterRole;

  @IsOptional()
  @IsObject()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- character appearance is an open DTO; shape varies by character type
  appearance?: Record<string, any>;

  @IsOptional()
  @IsObject()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- character personality is an open DTO; shape varies by character type
  personality?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  background?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  abilities?: string[];

  @IsOptional()
  @IsObject()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- character current state is an open DTO; shape varies at runtime
  currentState?: Record<string, any>;
}

export class CreateCharacterRelationshipDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  targetCharacterId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  relationshipType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
