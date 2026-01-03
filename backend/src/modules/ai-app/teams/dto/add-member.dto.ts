import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  MaxLength,
} from "class-validator";
import { TopicRole } from "@prisma/client";

export class AddMemberDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsEnum(TopicRole)
  role?: TopicRole;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nickname?: string;
}

export class AddMembersDto {
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];

  @IsOptional()
  @IsEnum(TopicRole)
  role?: TopicRole;
}

export class InviteMemberByEmailDto {
  @IsString()
  email!: string;

  @IsOptional()
  @IsEnum(TopicRole)
  role?: TopicRole;
}
