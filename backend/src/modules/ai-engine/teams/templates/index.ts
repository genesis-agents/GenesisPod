/**
 * AI Engine - Team Templates
 *
 * 架构说明:
 * ================
 * 团队配置已完全迁移到 AI Apps 层，各 App 模块在 onModuleInit 中
 * 通过 TeamRegistry.registerConfig() 注册自己的团队配置。
 *
 * 正确的导入路径:
 * - 研究团队: import { RESEARCH_TEAM_CONFIG } from '@/modules/ai-app/research/teams'
 * - 报告团队: import { REPORT_TEAM_CONFIG } from '@/modules/ai-app/office/teams'
 * - PPT 团队: import { SLIDES_TEAM_CONFIG } from '@/modules/ai-app/office/teams'
 * - 辩论团队: import { DEBATE_TEAM_CONFIG } from '@/modules/ai-app/teams/teams'
 * - 设计团队: import { VISUAL_DESIGN_TEAM_CONFIG } from '@/modules/ai-app/office/teams'
 *
 * 架构原则:
 * - AI Engine: 领域无关的通用框架（接口、基类、注册表）
 * - AI Apps: 业务特定的配置和实现
 * - Apps → Engine 注册，而非 Engine → Apps 导入
 *
 * @see .claude/skills/ai/ai-architecture-layering/SKILL.md
 */

// No exports - team configs are registered by AI App modules at runtime
