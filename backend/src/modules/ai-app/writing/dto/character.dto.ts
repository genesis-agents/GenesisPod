import { IsString, IsOptional, IsArray, IsEnum, IsObject } from "class-validator";
import { CharacterRole } from "@prisma/client";

export class CreateCharacterDto {
  @IsString()
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
  appearance?: Record<string, any>;

  @IsOptional()
  @IsObject()
  personality?: Record<string, any>;

  @IsOptional()
  @IsString()
  background?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  abilities?: string[];

  @IsOptional()
  @IsObject()
  currentState?: Record<string, any>;
}

export class UpdateCharacterDto {
  @IsOptional()
  @IsString()
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
  appearance?: Record<string, any>;

  @IsOptional()
  @IsObject()
  personality?: Record<string, any>;

  @IsOptional()
  @IsString()
  background?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  abilities?: string[];

  @IsOptional()
  @IsObject()
  currentState?: Record<string, any>;
}

export class CreateCharacterRelationshipDto {
  @IsString()
  targetCharacterId!: string;

  @IsString()
  relationshipType!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
