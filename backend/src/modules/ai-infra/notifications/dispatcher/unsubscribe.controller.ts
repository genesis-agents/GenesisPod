import { Controller, Get, Query, BadRequestException } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { UnsubscribeTokenService } from "./preferences/unsubscribe-token.service";

/**
 * UnsubscribeController —— 三级退订 endpoint（K5）
 *
 * 设计：
 * - token-only auth：邮件 footer 链接含 7d JWT，用户**无需登录**即可点退订
 * - 出于安全考虑：JWT 验证失败 / 过期 → 401（不暴露细节）
 * - 成功：返回简单文本（不含 user PII），前端可展示"退订成功"页
 *
 * 来源：daily-briefing-redesign-2026-05-18.md §7.3.3 K5 三级退订
 */
@ApiTags("notifications")
// 注：AppModule 全局 setGlobalPrefix('api/v1') 自动加前缀，本 Controller 不重复
@Controller("notifications/unsubscribe")
export class UnsubscribeController {
  constructor(private readonly tokens: UnsubscribeTokenService) {}

  @Get()
  @ApiOperation({ summary: "三级退订（token-only auth，无需登录）" })
  async unsubscribe(@Query("token") token?: string): Promise<{
    success: true;
    scope: string;
    message: string;
  }> {
    if (!token) {
      throw new BadRequestException("missing token");
    }
    const result = await this.tokens.verifyAndApply(token);
    return {
      success: true,
      scope: result.scope,
      message: this.scopeMessage(result.scope),
    };
  }

  private scopeMessage(scope: string): string {
    switch (scope) {
      case "global":
        return "已退订全部通知。可在账户设置重新启用";
      case "radar_all":
        return "已退订所有 AI 雷达通知";
      case "weekly":
        return "已退订 AI 雷达周报";
      case "topic":
        return "已退订该雷达主题的通知";
      default:
        return "已退订";
    }
  }
}
