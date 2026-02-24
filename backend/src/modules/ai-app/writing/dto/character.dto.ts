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
  appearance?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  personality?: Record<string, unknown>;

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
  currentState?: Record<string, unknown>;
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
  appearance?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  personality?: Record<string, unknown>;

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
  currentState?: Record<string, unknown>;
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
