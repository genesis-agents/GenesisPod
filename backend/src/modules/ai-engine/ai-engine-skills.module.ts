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
import { SkillRegistry } from "./skills/registry/skill-registry";

// Loader & Cache
import { SkillLoaderService } from "./skills/loader/skill-loader.service";
import { SkillCacheService } from "./skills/loader/skill-cache.service";

// Content - Prompt 内容和版本管理
import { SkillContentService } from "./skills/content/skill-content.service";

// Analytics - 执行监控和分析
import { SkillAnalyticsService } from "./skills/analytics/skill-analytics.service";

// Sandbox - 测试执行
import { SkillSandboxService } from "./skills/sandbox/skill-sandbox.service";

// Builder
import { SkillPromptBuilder } from "./skills/builder/skill-prompt-builder.service";

// Ecosystem
import { SkillsMPClientService } from "./skills/ecosystem/skillsmp-client.service";

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
  ],
})
export class AiEngineSkillsModule {}
