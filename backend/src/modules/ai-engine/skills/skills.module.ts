/**
 * AI Engine Skills Module
 * 技能系统子模块
 *
 * 提供:
 * - Skill Registry
 * - Skill Loader (SKILL.md parser)
 * - Skill Prompt Builder
 * - SkillsMP Client
 */

import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";

// Registry
import { SkillRegistry } from "./registry/skill.registry";

// Loader & Cache
import { SkillLoaderService } from "./loader/loading/skill-loader.service";
import { SkillCacheService } from "./loader/caching/skill-cache.service";

// Content - Prompt 内容和版本管理
import { SkillContentService } from "./content/skill-content.service";

// Analytics - 执行监控和分析
import { SkillAnalyticsService } from "./analytics/skill-analytics.service";

// Sandbox - 测试执行
import { SkillSandboxService } from "./sandbox/skill-sandbox.service";

// Builder
import { SkillPromptBuilder } from "./builder/skill-prompt-builder.service";

// Ecosystem
import { SkillsMPClientService } from "./ecosystem/skillsmp-client.service";

// 2026-05-01 (PR-X-K): EngineSkillProvider 适配到 harness ISkillProvider 端口，
// 让用户在 Admin UI / API 创建的 skill 自动透出到 harness agent 运行时
import { EngineSkillProvider } from "./runtime/adapters/engine-skill-provider.adapter";

// PR-X16: SkillsController + SkillsApiService 已迁移至 open-api/skills-api/
// （HTTP Controller 上提，由 open-api 装配）

@Module({
  imports: [HttpModule],
  controllers: [],
  providers: [
    // Registry
    SkillRegistry,

    // Loader & Cache
    SkillLoaderService,
    SkillCacheService,

    // Content
    SkillContentService,

    // Builder
    SkillPromptBuilder,

    // Ecosystem
    SkillsMPClientService,

    // Analytics
    SkillAnalyticsService,

    // Sandbox
    SkillSandboxService,

    // Bridge: ai-engine SkillRegistry → harness ISkillProvider
    EngineSkillProvider,
  ],
  exports: [
    SkillRegistry,
    SkillLoaderService,
    SkillCacheService,
    SkillContentService,
    SkillAnalyticsService,
    SkillSandboxService,
    SkillPromptBuilder,
    SkillsMPClientService,
    EngineSkillProvider,
  ],
})
export class AiEngineSkillsModule {}
