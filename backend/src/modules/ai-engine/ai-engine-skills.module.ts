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

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

// Registry
import { SkillRegistry } from './skills/registry/skill-registry';

// Loader & Cache
import { SkillLoaderService } from './skills/loader/skill-loader.service';
import { SkillCacheService } from './skills/loader/skill-cache.service';

// Builder
import { SkillPromptBuilder } from './skills/builder/skill-prompt-builder.service';

// Ecosystem
import { SkillsMPClientService } from './skills/ecosystem/skillsmp-client.service';

// Public API
import { SkillsController, SkillsApiService } from './skills/api';

@Module({
  imports: [HttpModule],
  controllers: [SkillsController],
  providers: [
    // Registry
    SkillRegistry,

    // Loader & Cache
    SkillLoaderService,
    SkillCacheService,

    // Builder
    SkillPromptBuilder,

    // Ecosystem
    SkillsMPClientService,

    // API Service
    SkillsApiService,
  ],
  exports: [
    SkillRegistry,
    SkillLoaderService,
    SkillCacheService,
    SkillPromptBuilder,
    SkillsMPClientService,
  ],
})
export class AiEngineSkillsModule {}
