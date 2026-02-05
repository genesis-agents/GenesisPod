/**
 * Slides Engine v4.0 - Page Generation Pipeline Skill
 *
 * 页面生成流水线：协调逐页生成和渲染
 * - 获取大纲规划中的所有页面
 * - 为每页生成内容
 * - 为每页渲染 HTML
 * - 每完成一页就通过回调发送事件
 *
 * 这是实现"完成一页发送一页"的核心组件
 */

import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  ISkill,
  SkillContext,
  SkillResult,
  SkillLayer,
} from "@/modules/ai-engine/skills/abstractions/skill.interface";
import {
  OutlinePlan,
  PageOutline,
  PageContent,
} from "../checkpoint/checkpoint.types";
import { TemplateRenderingSkill } from "./template-rendering.skill";
import { ContentCompressionSkill } from "./content-compression.skill";

/**
 * 单页生成结果
 */
export interface PageGenerationResult {
  pageNumber: number;
  title: string;
  html: string;
  templateId: string;
  status: "completed" | "failed";
  error?: string;
  duration: number;
}

/**
 * 页面流水线输出
 */
export interface PagePipelineOutput {
  pages: PageGenerationResult[];
  totalPages: number;
  completedPages: number;
  failedPages: number;
  totalDuration: number;
}

/**
 * 页面设计思考数据（同步到 Thinking TAB）
 */
export interface PageDesignThinking {
  step1_drafting: {
    style: string;
    coreElements: string[];
    mood: string;
  };
  step2_refiningLayout: {
    alignment: string;
    graphicsPosition: string;
    spacing: string;
  };
  step3_planningVisuals: {
    backgroundColor: string;
    accentColors: string[];
    decorations: string[];
  };
  step4_formulatingHTML: {
    templateUsed: string;
    sectionsCount: number;
    hasImages: boolean;
  };
  reasoning: string; // 整体思考过程
}

/**
 * 页面生成事件（用于流式输出）
 */
export interface PageGeneratedEvent {
  type: "page:generated";
  pageNumber: number;
  totalPages: number;
  title: string;
  html: string;
  templateId: string;
  sessionId: string;
  /** 页面设计思考数据 */
  design?: PageDesignThinking;
  /** 页面大纲关键点 */
  keyPoints?: string[];
}

/**
 * MissionOrchestrator 传递的输入格式
 */
interface OrchestratorInput {
  task?: string;
  context?: {
    input?: {
      sourceText?: string;
      userRequirement?: string;
      themeId?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  previousOutputs?: Record<string, unknown>;
}

@Injectable()
export class PagePipelineSkill implements ISkill<
  OrchestratorInput,
  PagePipelineOutput
> {
  private readonly logger = new Logger(PagePipelineSkill.name);

  readonly id = "slides-page-pipeline";
  readonly name = "页面生成流水线";
  readonly description = "协调逐页生成内容和渲染 HTML，支持流式输出";
  readonly layer: SkillLayer = "orchestration";
  readonly domain = "slides";
  readonly tags = ["slides", "pipeline", "streaming", "generation"];
  readonly version = "1.0.0";

  constructor(
    private readonly templateRendering: TemplateRenderingSkill,
    private readonly contentCompression: ContentCompressionSkill,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * 执行页面生成流水线
   */
  async execute(
    input: OrchestratorInput,
    context: SkillContext,
  ): Promise<SkillResult<PagePipelineOutput>> {
    const startTime = Date.now();
    const sessionId = context.sessionId || "unknown";

    // ★★★ 关键诊断日志 ★★★
    this.logger.warn(
      `[execute] ★★★ PAGE-PIPELINE CALLED ★★★ sessionId=${sessionId}, eventEmitter exists=${!!this.eventEmitter}`,
    );
    this.logger.warn(
      `[execute] ★★★ INPUT KEYS: ${Object.keys(input).join(", ")}`,
    );
    if (input.previousOutputs) {
      this.logger.warn(
        `[execute] ★★★ previousOutputs KEYS: ${Object.keys(input.previousOutputs).join(", ")}`,
      );
    }
    const inputWithOutline = input as OrchestratorInput & { outline?: unknown };
    this.logger.warn(
      `[execute] ★★★ input.outline exists=${!!inputWithOutline.outline}, type=${typeof inputWithOutline.outline}`,
    );

    this.logger.log(
      `[execute] Starting page pipeline for session ${sessionId}`,
    );

    // 1. 提取必要数据
    const { outlinePlan, sourceText, themeId } = this.extractInputData(input);

    if (!outlinePlan?.pages || outlinePlan.pages.length === 0) {
      this.logger.error("[execute] No outline plan or pages found");
      return {
        success: false,
        error: {
          code: "NO_OUTLINE_PLAN",
          message: "未找到大纲规划或页面列表",
          retryable: false,
        },
        metadata: {
          executionId: context.executionId,
          startTime: new Date(startTime),
          endTime: new Date(),
          duration: Date.now() - startTime,
        },
      };
    }

    const totalPages = outlinePlan.pages.length;
    const pages: PageGenerationResult[] = [];
    let completedPages = 0;
    let failedPages = 0;

    // 2. 逐页生成
    for (let i = 0; i < totalPages; i++) {
      const pageOutline = outlinePlan.pages[i];
      const pageNumber = pageOutline.pageNumber || i + 1;
      const pageStartTime = Date.now();

      this.logger.log(
        `[execute] Processing page ${pageNumber}/${totalPages}: ${pageOutline.title}`,
      );

      // ★ 发送页面开始生成事件
      this.eventEmitter.emit("slides.page.generating", {
        pageNumber,
        totalPages,
        title: pageOutline.title,
        templateType: pageOutline.templateType || "content",
        sessionId,
      });

      try {
        // 2a. 生成页面内容
        const pageContent = await this.generatePageContent(
          pageOutline,
          sourceText,
          context,
        );

        // 2b. 渲染 HTML
        const renderResult = await this.renderPage(
          pageOutline,
          pageContent,
          themeId,
          context,
        );

        if (renderResult.success && renderResult.data) {
          const htmlLength = renderResult.data.html?.length || 0;
          this.logger.log(
            `[execute] ★ Page ${pageNumber} rendered successfully, HTML length: ${htmlLength}`,
          );

          const result: PageGenerationResult = {
            pageNumber,
            title: pageOutline.title,
            html: renderResult.data.html,
            templateId: renderResult.data.templateId,
            status: "completed",
            duration: Date.now() - pageStartTime,
          };

          pages.push(result);
          completedPages++;

          // 2c. 生成设计思考数据
          const designThinking = this.generateDesignThinking(
            pageOutline,
            pageContent,
            renderResult.data.templateId,
          );

          // 2d. 发送页面生成事件（流式输出的关键）
          this.emitPageGenerated({
            type: "page:generated",
            pageNumber,
            totalPages,
            title: pageOutline.title,
            html: renderResult.data.html,
            templateId: renderResult.data.templateId,
            sessionId,
            design: designThinking,
            keyPoints: pageOutline.keyElements || [],
          });

          this.logger.log(
            `[execute] Page ${pageNumber} completed in ${result.duration}ms`,
          );
        } else {
          throw new Error(renderResult.error?.message || "渲染失败");
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "未知错误";

        this.logger.error(
          `[execute] Page ${pageNumber} failed: ${errorMessage}`,
        );

        pages.push({
          pageNumber,
          title: pageOutline.title,
          html: "",
          templateId: "",
          status: "failed",
          error: errorMessage,
          duration: Date.now() - pageStartTime,
        });

        failedPages++;

        // 发送失败事件
        this.eventEmitter.emit("slides.page.failed", {
          pageNumber,
          totalPages,
          title: pageOutline.title,
          error: errorMessage,
          sessionId,
        });
      }
    }

    // 3. 返回结果
    const output: PagePipelineOutput = {
      pages,
      totalPages,
      completedPages,
      failedPages,
      totalDuration: Date.now() - startTime,
    };

    this.logger.log(
      `[execute] Pipeline completed: ${completedPages}/${totalPages} pages, ${failedPages} failed`,
    );

    return {
      success: failedPages === 0,
      data: output,
      metadata: {
        executionId: context.executionId,
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime,
      },
    };
  }

  /**
   * 提取输入数据
   */
  private extractInputData(input: OrchestratorInput): {
    outlinePlan: OutlinePlan | null;
    sourceText: string;
    themeId: string;
  } {
    const previousOutputs = input.previousOutputs || {};
    const contextInput = input.context?.input || {};

    // ★ 修复：从多个位置获取大纲规划（包括 input.outline）
    const inputWithOutline = input as OrchestratorInput & {
      outline?: OutlinePlan;
      sourceText?: string;
      themeId?: string;
    };

    let outlinePlan =
      // 1. 直接在 input.outline（SlidesTeamMember.buildSkillInput 设置）
      inputWithOutline.outline ||
      // 2. 从 previousOutputs 获取（完整 OutlinePlan）
      (previousOutputs["slides-outline-planning"] as OutlinePlan) ||
      (previousOutputs["outline-planning"] as OutlinePlan) ||
      // 3. 从 context 获取
      (input.context?.outlinePlan as OutlinePlan) ||
      (input.context?.outline as OutlinePlan) ||
      null;

    // 如果大纲在 data 字段中（嵌套结构）
    if (!outlinePlan && previousOutputs["slides-outline-planning"]) {
      const maybeNested = previousOutputs["slides-outline-planning"] as {
        data?: OutlinePlan;
      };
      if (maybeNested.data?.pages) {
        outlinePlan = maybeNested.data;
      }
    }

    // ★ 修复：sourceText 和 themeId 也可能在顶层
    const sourceText =
      inputWithOutline.sourceText ||
      (contextInput.sourceText as string) ||
      (input.context?.sourceText as string) ||
      "";
    const themeId =
      inputWithOutline.themeId ||
      (contextInput.themeId as string) ||
      (input.context?.themeId as string) ||
      "genspark-dark";

    this.logger.log(
      `[extractInputData] ★ Found outline: ${!!outlinePlan}, pages: ${outlinePlan?.pages?.length || 0}, sourceText: ${sourceText.length} chars, themeId: ${themeId}`,
    );
    if (!outlinePlan) {
      this.logger.error(
        `[extractInputData] ✗ OUTLINE NOT FOUND! input keys: ${Object.keys(input).join(", ")}, previousOutputs keys: ${Object.keys(input.previousOutputs || {}).join(", ")}`,
      );
    }

    return { outlinePlan, sourceText, themeId };
  }

  /**
   * 生成页面内容
   * 使用 ContentCompression 将源文本压缩为页面内容
   */
  private async generatePageContent(
    pageOutline: PageOutline,
    sourceText: string,
    context: SkillContext,
  ): Promise<PageContent> {
    // 使用 ContentCompression 压缩源文本
    try {
      const result = await this.contentCompression.execute(
        {
          pageOutline,
          sourceText,
          maxCharacters: 500, // 每页最大字数
        },
        {
          ...context,
          executionId: `${context.executionId}-compress-${pageOutline.pageNumber}`,
        },
      );

      if (result.success && result.data?.pageContent) {
        return result.data.pageContent;
      }
    } catch (error) {
      this.logger.warn(
        `[generatePageContent] ContentCompression failed: ${error}`,
      );
    }

    // 降级：创建基础内容
    return this.createBasicPageContent(pageOutline);
  }

  /**
   * 创建基础页面内容（降级方案）
   */
  private createBasicPageContent(pageOutline: PageOutline): PageContent {
    return {
      title: pageOutline.title,
      subtitle: pageOutline.subtitle,
      sections:
        pageOutline.keyElements?.map((element) => ({
          type: "text" as const,
          position: "center" as const,
          content: element,
        })) || [],
    };
  }

  /**
   * 渲染页面 HTML
   */
  private async renderPage(
    pageOutline: PageOutline,
    pageContent: PageContent,
    themeId: string,
    context: SkillContext,
  ) {
    return this.templateRendering.execute(
      {
        pageOutline,
        pageContent,
        themeId,
      },
      {
        ...context,
        executionId: `${context.executionId}-render-${pageOutline.pageNumber}`,
      },
    );
  }

  /**
   * 生成页面设计思考数据
   * 这些数据将同步到前端的 Thinking TAB，便于 AI 持续改进
   */
  private generateDesignThinking(
    pageOutline: PageOutline,
    pageContent: PageContent,
    templateId: string,
  ): PageDesignThinking {
    // 从页面大纲和内容中提取设计思考
    const templateType = pageOutline.templateType || "content";
    const hasSubtitle = !!pageOutline.subtitle || !!pageContent.subtitle;
    const sectionsCount = pageContent.sections?.length || 0;
    const hasImages = pageContent.sections?.some((s) => s.type === "image");

    // 根据模板类型确定样式
    const styleMap: Record<string, string> = {
      cover: "大标题居中，强调视觉冲击",
      chapterTitle: "章节标题突出，引导阅读",
      toc: "目录结构清晰，便于导航",
      questions: "问题导向，引发思考",
      pillars: "支柱结构，层次分明",
      framework: "框架展示，逻辑清晰",
      timeline: "时间线结构，流程清晰",
      evolutionRoadmap: "演进路线图，发展脉络",
      dashboard: "数据仪表盘，指标突出",
      comparison: "对比布局，差异突出",
      splitLayout: "分栏布局，内容均衡",
      caseStudy: "案例分析，深度剖析",
      multiColumn: "多栏布局，信息密集",
      recommendations: "建议方案，行动导向",
      maturityModel: "成熟度模型，阶段清晰",
      riskOpportunity: "风险机遇分析，决策支持",
      closing: "总结归纳，要点突出",
    };

    // 根据模板类型确定对齐方式
    const alignmentMap: Record<string, string> = {
      cover: "居中对齐，视觉焦点集中",
      chapterTitle: "左对齐标题，右侧装饰",
      toc: "左对齐列表，层次缩进",
      questions: "居中问题，答案分布",
      pillars: "多栏均分，间距适中",
      framework: "框架居中，元素环绕",
      timeline: "时间轴居中，事件左右交替",
      evolutionRoadmap: "横向时间轴，阶段分明",
      dashboard: "网格布局，指标卡片",
      comparison: "左右对称，对比鲜明",
      splitLayout: "左右分栏，比例均衡",
      caseStudy: "上下结构，案例详情",
      multiColumn: "多栏并列，内容独立",
      recommendations: "列表布局，优先级排列",
      maturityModel: "阶梯布局，层级递进",
      riskOpportunity: "双栏对比，红绿标识",
      closing: "居中总结，要点列表",
    };

    // 生成核心元素列表
    const coreElements: string[] = [
      `标题: ${pageOutline.title}`,
      ...(hasSubtitle ? [`副标题: ${pageOutline.subtitle}`] : []),
      ...(pageOutline.keyElements?.slice(0, 3).map((e) => `要点: ${e}`) || []),
    ];

    // 推断情绪/氛围
    const moodMap: Record<string, string> = {
      cover: "专业、大气、引人注目",
      chapterTitle: "过渡、引导、承上启下",
      toc: "结构化、导航感、全局视角",
      questions: "好奇、探索、引人思考",
      pillars: "稳固、支撑、核心要素",
      framework: "系统化、结构化、逻辑性",
      timeline: "有序、流程感、时间感",
      evolutionRoadmap: "发展、进步、未来导向",
      dashboard: "数据驱动、量化、精确",
      comparison: "对比、选择、决策导向",
      splitLayout: "对比、平衡、逻辑清晰",
      caseStudy: "实践、证据、深度分析",
      multiColumn: "信息密集、并列、多维度",
      recommendations: "行动导向、建议、下一步",
      maturityModel: "成长、阶段、进阶",
      riskOpportunity: "权衡、决策、战略思维",
      closing: "归纳、重点、收尾",
    };

    // 生成装饰元素列表
    const decorations: string[] = [];
    if (templateType === "cover") {
      decorations.push("渐变背景", "品牌 Logo", "装饰线条");
    } else if (templateType === "chapterTitle") {
      decorations.push("章节编号", "分隔线", "背景图案");
    } else if (templateType === "dashboard") {
      decorations.push("指标卡片", "进度条", "图表边框");
    } else {
      decorations.push("列表图标", "分隔线");
      if (hasImages) decorations.push("图片边框", "阴影效果");
    }

    // 构建完整的思考过程
    const reasoning = `
【页面 ${pageOutline.pageNumber} 设计思考】

1️⃣ 草稿阶段 (Drafting):
   - 确定页面类型: ${templateType}
   - 核心内容: ${pageOutline.title}
   - 关键要素: ${pageOutline.keyElements?.join(", ") || "无"}

2️⃣ 布局精化 (Refining Layout):
   - 选择模板: ${templateId}
   - 对齐方式: ${alignmentMap[templateType] || "标准左对齐"}
   - 内容区块: ${sectionsCount} 个部分

3️⃣ 视觉规划 (Planning Visuals):
   - 配色方案: 继承主题色
   - 装饰元素: ${decorations.join(", ")}
   - 图片使用: ${hasImages ? "是" : "否"}

4️⃣ HTML 生成 (Formulating HTML):
   - 使用模板: ${templateId}
   - 响应式设计: 是
   - 动画效果: 淡入

✅ 设计决策依据:
   - 模板 "${templateType}" 适合展示 "${pageOutline.title}"
   - ${sectionsCount} 个内容块保持页面信息量适中
   - ${hasSubtitle ? "副标题增强了层次感" : "无副标题，保持简洁"}
`.trim();

    return {
      step1_drafting: {
        style: styleMap[templateType] || "标准内容布局",
        coreElements,
        mood: moodMap[templateType] || "专业、清晰",
      },
      step2_refiningLayout: {
        alignment: alignmentMap[templateType] || "左对齐",
        graphicsPosition: hasImages ? "右侧或下方" : "无图片",
        spacing: "标准间距 (24px)",
      },
      step3_planningVisuals: {
        backgroundColor: "继承主题背景色",
        accentColors: ["主题强调色", "辅助色"],
        decorations,
      },
      step4_formulatingHTML: {
        templateUsed: templateId,
        sectionsCount,
        hasImages: hasImages || false,
      },
      reasoning,
    };
  }

  /**
   * 发送页面生成事件
   */
  private emitPageGenerated(event: PageGeneratedEvent): void {
    // ★★★ 关键诊断日志 ★★★
    this.logger.warn(
      `[emitPageGenerated] ★★★ EMITTING EVENT ★★★ page=${event.pageNumber}, sessionId=${event.sessionId}, htmlLength=${event.html?.length || 0}`,
    );

    // 通过 EventEmitter 发送事件
    if (!this.eventEmitter) {
      this.logger.error(
        `[emitPageGenerated] ★★★ ERROR: eventEmitter is NULL! ★★★`,
      );
      return;
    }

    this.eventEmitter.emit("slides.page.generated", event);

    this.logger.warn(
      `[emitPageGenerated] ★★★ EVENT EMITTED ★★★ page=${event.pageNumber}`,
    );
  }
}
