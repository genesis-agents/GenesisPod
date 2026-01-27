/**
 * Slides Skills Module
 * 幻灯片技能注册模块
 *
 * 职责：
 * - 将 15 个 Slides 技能注册到 AI Engine 的 SkillRegistry
 * - 在模块初始化时自动完成注册
 *
 * 技能按层次划分：
 * - Layer 3 (Template Dispatch): template-matcher, page-type-selection
 * - Layer 4 (Content Generation): task-decomposition, outline-planning, etc.
 * - Layer 4.5 (Content-Driven Layout): content-analyzer, layout-optimizer
 * - Layer 5 (Consistency): terminology-unifier, transition-checker
 * - Layer 6 (Quality Assurance): quality-audit
 */

import { Module, OnModuleInit, Logger, forwardRef } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { SkillRegistry } from "@/modules/ai-engine/skills/registry/skill-registry";
// 直接从文件导入，避免 barrel export 循环依赖
import { AiEngineModule } from "@/modules/ai-engine/ai-engine.module";
import { AIModelService } from "../../core/ai-model.service";
import { PrismaModule } from "@/common/prisma/prisma.module";

// Layer 3 - Template Dispatch
import { TemplateMatcherSkill } from "./template-matcher.skill";
import { PageTypeSelectionSkill } from "./page-type-selection.skill";

// Layer 4 - Content Generation
import { TaskDecompositionSkill } from "./task-decomposition.skill";
import { OutlinePlanningSkill } from "./outline-planning.skill";
import { FourStepDesignSkill } from "./four-step-design.skill";
import { ContentCompressionSkill } from "./content-compression.skill";
import { DataSupplementSkill } from "./data-supplement.skill";
import { TemplateRenderingSkill } from "./template-rendering.skill";
import { ChartRendererSkill } from "./chart-renderer.skill";
import { ImageFetcherSkill } from "./image-fetcher.skill";

// Layer 4.5 - Content-Driven Layout
import { ContentAnalyzerSkill } from "./content-analyzer.skill";
import { LayoutOptimizerSkill } from "./layout-optimizer.skill";

// Layer 5.5 - AI Edit Skills (v5.0)
import { LayoutFixerSkill } from "./layout-fixer.skill";
import { ContentPolisherSkill } from "./content-polisher.skill";
import { FactCheckerSkill } from "./fact-checker.skill";

// Layer 5 - Consistency
import { TerminologyUnifierSkill } from "./terminology-unifier.skill";
import { TransitionCheckerSkill } from "./transition-checker.skill";

// Layer 6 - Quality Assurance
import { QualityAuditSkill } from "./quality-audit.skill";

// Layer 7 - Monitoring & Transparency (v5.0)
import { SlideThinkingSkill } from "./slide-thinking.skill";

// Layer 8 - Voice & Narration (v5.0)
import { VoiceNarrationSkill } from "./voice-narration.skill";

// Layer 0 - Orchestration
import { PagePipelineSkill } from "./page-pipeline.skill";

/**
 * 所有 Slides 技能的列表
 */
const SLIDES_SKILL_PROVIDERS = [
  // Layer 0 - Orchestration (页面生成流水线)
  PagePipelineSkill,
  // Layer 3
  TemplateMatcherSkill,
  PageTypeSelectionSkill,
  // Layer 4
  TaskDecompositionSkill,
  OutlinePlanningSkill,
  FourStepDesignSkill,
  ContentCompressionSkill,
  DataSupplementSkill,
  TemplateRenderingSkill,
  ChartRendererSkill,
  ImageFetcherSkill,
  // Layer 4.5
  ContentAnalyzerSkill,
  LayoutOptimizerSkill,
  // Layer 5.5
  LayoutFixerSkill,
  ContentPolisherSkill,
  FactCheckerSkill,
  // Layer 5
  TerminologyUnifierSkill,
  TransitionCheckerSkill,
  // Layer 6
  QualityAuditSkill,
  // Layer 7
  SlideThinkingSkill,
  // Layer 8
  VoiceNarrationSkill,
];

@Module({
  // 使用 forwardRef 打破循环: AiEngineModule → AiImageModule → AiOfficeModule → SlidesSkillsModule → AiEngineModule
  imports: [forwardRef(() => AiEngineModule), HttpModule, PrismaModule],
  providers: [AIModelService, ...SLIDES_SKILL_PROVIDERS],
  exports: [AIModelService, ...SLIDES_SKILL_PROVIDERS],
})
export class SlidesSkillsModule implements OnModuleInit {
  private readonly logger = new Logger(SlidesSkillsModule.name);

  constructor(
    private readonly skillRegistry: SkillRegistry,
    // Layer 0 - Orchestration
    private readonly pagePipeline: PagePipelineSkill,
    // Layer 3
    private readonly templateMatcher: TemplateMatcherSkill,
    private readonly pageTypeSelection: PageTypeSelectionSkill,
    // Layer 4
    private readonly taskDecomposition: TaskDecompositionSkill,
    private readonly outlinePlanning: OutlinePlanningSkill,
    private readonly fourStepDesign: FourStepDesignSkill,
    private readonly contentCompression: ContentCompressionSkill,
    private readonly dataSupplement: DataSupplementSkill,
    private readonly templateRendering: TemplateRenderingSkill,
    private readonly chartRenderer: ChartRendererSkill,
    private readonly imageFetcher: ImageFetcherSkill,
    // Layer 4.5
    private readonly contentAnalyzer: ContentAnalyzerSkill,
    private readonly layoutOptimizer: LayoutOptimizerSkill,
    // Layer 5.5
    private readonly layoutFixer: LayoutFixerSkill,
    private readonly contentPolisher: ContentPolisherSkill,
    private readonly factChecker: FactCheckerSkill,
    // Layer 5
    private readonly terminologyUnifier: TerminologyUnifierSkill,
    private readonly transitionChecker: TransitionCheckerSkill,
    // Layer 6
    private readonly qualityAudit: QualityAuditSkill,
    // Layer 7
    private readonly slideThinking: SlideThinkingSkill,
    // Layer 8
    private readonly voiceNarration: VoiceNarrationSkill,
  ) {}

  /**
   * 模块初始化时注册所有技能
   */
  onModuleInit() {
    this.logger.log("Registering Slides skills to SkillRegistry...");

    const skills = [
      // Layer 0 - Orchestration
      this.pagePipeline,
      // Layer 3
      this.templateMatcher,
      this.pageTypeSelection,
      // Layer 4
      this.taskDecomposition,
      this.outlinePlanning,
      this.fourStepDesign,
      this.contentCompression,
      this.dataSupplement,
      this.templateRendering,
      this.chartRenderer,
      this.imageFetcher,
      // Layer 4.5
      this.contentAnalyzer,
      this.layoutOptimizer,
      // Layer 5.5
      this.layoutFixer,
      this.contentPolisher,
      this.factChecker,
      // Layer 5
      this.terminologyUnifier,
      this.transitionChecker,
      // Layer 6
      this.qualityAudit,
      // Layer 7
      this.slideThinking,
      // Layer 8
      this.voiceNarration,
    ];

    let registered = 0;
    for (const skill of skills) {
      try {
        // 检查技能是否实现了 ISkill 接口的必需属性
        if (this.isValidSkill(skill)) {
          this.skillRegistry.register(skill);
          registered++;
          this.logger.debug(`Registered skill: ${skill.id} (${skill.layer})`);
        } else {
          const skillName =
            skill && typeof skill === "object" && "name" in skill
              ? String((skill as Record<string, unknown>).name)
              : "Unknown Skill";
          this.logger.warn(
            `Skill ${skillName} does not implement ISkill interface, skipping`,
          );
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : "Unknown error during skill registration";
        this.logger.error(`Failed to register skill: ${errorMsg}`);
      }
    }

    this.logger.log(
      `Slides skills registration complete: ${registered}/${skills.length} skills registered`,
    );

    // 输出注册统计
    const stats = this.skillRegistry.getStats();
    this.logger.debug(`SkillRegistry stats: ${JSON.stringify(stats)}`);
  }

  /**
   * 验证技能是否实现了 ISkill 接口
   */
  private isValidSkill(skill: unknown): skill is {
    id: string;
    name: string;
    description: string;
    layer: string;
    domain: string;
    execute: Function;
  } {
    const s = skill as Record<string, unknown>;
    return (
      typeof s.id === "string" &&
      typeof s.name === "string" &&
      typeof s.description === "string" &&
      typeof s.layer === "string" &&
      typeof s.domain === "string" &&
      typeof s.execute === "function"
    );
  }
}
