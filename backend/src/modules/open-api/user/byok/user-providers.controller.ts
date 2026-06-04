/**
 * 用户自定义 AI Provider 控制器（PR-3，2026-05-05）
 *
 * 让用户在 UI "+ 添加自定义 provider" 表单提交后，往 ai_providers 表
 * scope=user/ownerUserId=<self> 写入条目。立刻在自家 BYOK 卡片列表里出现。
 *
 * 隔离：仅看见自己的 user-scope provider；admin 维护的 system-scope 在 list
 * 端点里 merge 显示，但不能从这里改。
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { PrismaService } from "../../../../common/prisma/prisma.service";

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

class UpsertCustomProviderDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: "slug must be lowercase alphanumeric + dash",
  })
  @MaxLength(50)
  slug!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(500)
  endpoint!: string;

  @IsString()
  @Matches(/^(openai|anthropic|google|cohere)$/, {
    message: "apiFormat must be one of: openai / anthropic / google / cohere",
  })
  apiFormat!: string;

  @IsString()
  @MaxLength(100)
  testModel!: string;

  @IsArray()
  @IsString({ each: true })
  capabilities!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  iconUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller("user/providers")
export class UserProvidersController {
  constructor(private readonly prisma: PrismaService) {}

  /** 列出当前用户的自定义 provider（scope=user 部分） */
  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    return this.prisma.aIProvider.findMany({
      where: { scope: "user", ownerUserId: req.user.id },
      orderBy: [{ name: "asc" }],
    });
  }

  @Post()
  async create(
    @Body() dto: UpsertCustomProviderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.prisma.aIProvider.create({
      data: {
        ...dto,
        scope: "user",
        ownerUserId: req.user.id,
      },
    });
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() dto: Partial<UpsertCustomProviderDto>,
    @Req() req: AuthenticatedRequest,
  ) {
    // 只能改自己的
    const existing = await this.prisma.aIProvider.findFirst({
      where: { id, scope: "user", ownerUserId: req.user.id },
    });
    if (!existing) {
      throw new ForbiddenException("Provider not found or not owned by you");
    }
    return this.prisma.aIProvider.update({ where: { id }, data: dto });
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    const existing = await this.prisma.aIProvider.findFirst({
      where: { id, scope: "user", ownerUserId: req.user.id },
    });
    if (!existing) {
      throw new ForbiddenException("Provider not found or not owned by you");
    }
    await this.prisma.aIProvider.delete({ where: { id } });
    return { success: true };
  }
}
