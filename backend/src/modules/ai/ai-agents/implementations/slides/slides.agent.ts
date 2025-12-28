/**
 * Slides Agent
 * AI PPT 生成专项 Agent
 *
 * 复用现有的 ai-office/ppt 模块能力：
 * - PPTOrchestratorService: 总调度器
 * - SlidePlanningService: 大纲规划
 * - SlideContentService: 内容生成
 * - SlideImageService: 图像生成
 * - SlideRendererService: HTML 渲染
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseAgent } from "../../core";
import {
  AgentType,
  AgentInput,
  AgentPlan,
  AgentEvent,
  AgentTemplate,
  ToolType,
  PlanStep,
  ArtifactType,
  AIModelType,
} from "../../core";
import {
  SlidesOrchestratorService,
  PPTStreamEvent,
  PPT_THEMES,
} from "../../../ai-office/slides";

@Injectable()
export class SlidesAgent extends BaseAgent {
  private readonly logger = new Logger(SlidesAgent.name);

  readonly type = AgentType.SLIDES;
  readonly name = "AI Slides";
  readonly description = "智能 PPT 生成器，快速创建专业演示文稿";
  readonly capabilities = [
    "自动生成大纲",
    "智能配图",
    "多种主题风格",
    "导出 PPTX",
    "演讲稿生成",
    "实时进度展示",
  ];
  readonly requiredTools: ToolType[] = [
    ToolType.TEXT_GENERATION,
    ToolType.IMAGE_GENERATION,
    ToolType.WEB_SEARCH,
    ToolType.EXPORT_PPTX,
  ];

  protected templates: AgentTemplate[] = [
    {
      id: "business-pitch",
      name: "商业提案",
      description: "适合商业计划书、投资提案",
      category: "business",
      icon: "📈",
      defaultPrompt: "为[公司/产品]创建一份商业提案PPT",
      defaultOptions: {
        themeId: "professional",
        slideCount: 10,
        includeImages: true,
      },
    },
    {
      id: "product-launch",
      name: "产品发布",
      description: "产品发布会演示文稿",
      category: "marketing",
      icon: "🚀",
      defaultPrompt: "创建[产品名]发布会PPT",
      defaultOptions: {
        themeId: "modern",
        slideCount: 12,
        includeImages: true,
      },
    },
    {
      id: "quarterly-report",
      name: "季度汇报",
      description: "季度/年度工作汇报",
      category: "business",
      icon: "📊",
      defaultPrompt: "创建[时间段]季度汇报PPT",
      defaultOptions: {
        themeId: "professional",
        slideCount: 15,
        includeImages: false,
      },
    },
    {
      id: "team-intro",
      name: "团队介绍",
      description: "团队或公司介绍",
      category: "introduction",
      icon: "👥",
      defaultPrompt: "介绍[团队/公司名称]",
      defaultOptions: {
        themeId: "creative",
        slideCount: 8,
        includeImages: true,
      },
    },
    {
      id: "education",
      name: "教学课件",
      description: "教育培训课件",
      category: "education",
      icon: "📚",
      defaultPrompt: "创建关于[主题]的教学课件",
      defaultOptions: {
        themeId: "minimal",
        slideCount: 20,
        includeSpeakerNotes: true,
      },
    },
  ];

  constructor(private readonly slidesOrchestrator: SlidesOrchestratorService) {
    super();
  }

  /**
   * 分析用户输入，生成执行计划
   */
  async plan(input: AgentInput): Promise<AgentPlan> {
    this.logger.log(`[plan] Planning for: ${input.prompt?.slice(0, 100)}...`);

    const taskId = this.generateTaskId();
    const steps: PlanStep[] = [];

    // Step 1: 内容提取
    steps.push({
      id: this.generateStepId(),
      name: "内容提取",
      description: "从提示词、URL 或文件中提取内容",
      tool: ToolType.DATA_FETCH,
      dependencies: [],
      estimatedDuration: 5000,
    });

    // Step 2: 大纲生成
    steps.push({
      id: this.generateStepId(),
      name: "生成大纲",
      description: "分析内容，生成 PPT 结构大纲",
      tool: ToolType.TEXT_GENERATION,
      dependencies: [steps[0].id],
      estimatedDuration: 8000,
    });

    // Step 3: 逐页规划
    steps.push({
      id: this.generateStepId(),
      name: "页面规划",
      description: "规划每页的布局和内容结构",
      tool: ToolType.TEXT_GENERATION,
      dependencies: [steps[1].id],
      estimatedDuration: 10000,
    });

    // Step 4: 内容生成
    steps.push({
      id: this.generateStepId(),
      name: "生成内容",
      description: "生成每页的详细文本内容",
      tool: ToolType.TEXT_GENERATION,
      dependencies: [steps[2].id],
      estimatedDuration: 30000,
    });

    // Step 5: 图像生成（如果需要）
    const includeImages = input.options?.includeImages !== false;
    if (includeImages) {
      steps.push({
        id: this.generateStepId(),
        name: "生成配图",
        description: "为幻灯片生成 AI 配图",
        tool: ToolType.IMAGE_GENERATION,
        dependencies: [steps[3].id],
        estimatedDuration: 60000,
      });
    }

    // Step 6: 渲染和组装
    steps.push({
      id: this.generateStepId(),
      name: "渲染组装",
      description: "渲染 HTML 预览并组装完整文档",
      dependencies: [steps[steps.length - 1].id],
      estimatedDuration: 5000,
    });

    const estimatedTime = steps.reduce(
      (acc, step) => acc + step.estimatedDuration,
      0,
    );

    return {
      taskId,
      agentType: this.type,
      steps,
      estimatedTime,
      toolsRequired: this.requiredTools,
      modelsRequired: [AIModelType.CHAT, AIModelType.IMAGE],
    };
  }

  /**
   * 执行计划，流式返回进度和结果
   */
  async *execute(plan: AgentPlan): AsyncGenerator<AgentEvent> {
    this.logger.log(`[execute] Starting execution for task: ${plan.taskId}`);

    // 从 plan 中获取输入（通过 context 传递）
    const input = (plan as any).input as AgentInput;
    if (!input) {
      yield {
        type: "error",
        error: "No input provided in plan context",
        stepId: plan.steps[0]?.id,
      };
      return;
    }

    // 准备 PPT 生成输入
    const pptInput = this.convertToPPTInput(input);

    // 调用现有的 PPT 生成流
    const pptStream = this.slidesOrchestrator.generatePPTStream(pptInput);

    // 转换事件流
    const currentStepIndex = 0;

    yield* await this.convertPPTStreamToAgentEvents(
      pptStream,
      plan,
      currentStepIndex,
    );
  }

  /**
   * 将 AgentInput 转换为 PPTGenerationInput
   */
  private convertToPPTInput(input: AgentInput): any {
    return {
      prompt: input.prompt,
      urls: input.urls,
      files: input.files?.map((f) => ({
        buffer: Buffer.from(""), // 实际实现需要获取文件内容
        mimeType: f.mimeType,
        filename: f.name,
      })),
      slideCount: input.options?.slideCount as number | undefined,
      themeId: input.options?.themeId as string | undefined,
      aspectRatio: (input.options?.aspectRatio as "16:9" | "4:3") || "16:9",
      language: (input.options?.language as "zh" | "en" | "auto") || "auto",
      textModelId: input.options?.textModelId as string | undefined,
      imageModelId: input.options?.imageModelId as string | undefined,
      includeImages: input.options?.includeImages !== false,
      includeSpeakerNotes: input.options?.includeSpeakerNotes !== false,
      targetAudience: input.options?.targetAudience as string | undefined,
      presentationStyle: input.options?.presentationStyle as
        | "formal"
        | "casual"
        | "educational"
        | "persuasive"
        | undefined,
      userId: input.options?.userId as string | undefined,
    };
  }

  /**
   * 将 PPT 事件流转换为 Agent 事件流
   */
  private async *convertPPTStreamToAgentEvents(
    pptStream: import("rxjs").Observable<PPTStreamEvent>,
    plan: AgentPlan,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _currentStepIndex: number,
  ): AsyncGenerator<AgentEvent> {
    // 将 Observable 转换为 AsyncIterator
    const events: PPTStreamEvent[] = [];
    let completed = false;
    let streamError: Error | null = null;

    const subscription = pptStream.subscribe({
      next: (event) => events.push(event),
      error: (err: Error) => {
        streamError = err;
        completed = true;
      },
      complete: () => {
        completed = true;
      },
    });

    try {
      // 处理事件
      while (!completed || events.length > 0) {
        if (events.length > 0) {
          const event = events.shift()!;
          const agentEvent = this.mapPPTEventToAgentEvent(event, plan);
          if (agentEvent) {
            yield agentEvent;
          }
        } else {
          // 等待更多事件
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      if (streamError !== null) {
        yield {
          type: "error",
          error: (streamError as Error).message,
        };
      }
    } finally {
      subscription.unsubscribe();
    }
  }

  /**
   * 将 PPT 事件映射为 Agent 事件
   */
  private mapPPTEventToAgentEvent(
    event: PPTStreamEvent,
    plan: AgentPlan,
  ): AgentEvent | null {
    switch (event.type) {
      case "progress":
        return {
          type: "step_progress",
          stepId: this.getStepIdByPhase(event.progress?.phase || "", plan),
          progress: event.progress?.percentage || 0,
          message: event.progress?.message || "",
        };

      case "outline_complete":
        return {
          type: "step_complete",
          stepId: plan.steps[1]?.id || "", // 大纲生成步骤
          result: event.outline,
        };

      case "slide_planned":
        return {
          type: "step_progress",
          stepId: plan.steps[2]?.id || "", // 页面规划步骤
          progress: ((event.slide?.index || 0) / 10) * 100,
          message: `规划第 ${(event.slide?.index || 0) + 1} 页`,
        };

      case "slide_content_complete":
        return {
          type: "step_progress",
          stepId: plan.steps[3]?.id || "", // 内容生成步骤
          progress: ((event.slide?.index || 0) / 10) * 100,
          message: `内容生成：第 ${(event.slide?.index || 0) + 1} 页`,
        };

      case "slide_image_complete":
        return {
          type: "tool_result",
          tool: ToolType.IMAGE_GENERATION,
          output: event.slide?.images,
          duration: 0,
        };

      case "slide_complete":
        return {
          type: "step_progress",
          stepId: plan.steps[3]?.id || "",
          progress: ((event.slide?.index || 0) / 10) * 100,
          message: `第 ${(event.slide?.index || 0) + 1} 页完成`,
        };

      case "complete":
        return {
          type: "complete",
          result: {
            success: true,
            artifacts: [
              {
                id: event.result?.pptId || "",
                type: ArtifactType.PPTX,
                name: "presentation.pptx",
                mimeType:
                  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                size: 0,
                url: `/api/agents/slides/${event.result?.pptId}/download`,
              },
            ],
            summary: `成功生成 ${event.result?.totalSlides || 0} 页 PPT`,
            tokensUsed: 0,
            duration: event.result?.duration || 0,
          },
        };

      case "error":
        return {
          type: "error",
          error: event.error?.message || "Unknown error",
          stepId: event.error?.slideIndex?.toString(),
        };

      default:
        return null;
    }
  }

  /**
   * 根据阶段名称获取步骤 ID
   */
  private getStepIdByPhase(phase: string, plan: AgentPlan): string {
    const phaseToStepIndex: Record<string, number> = {
      outline: 1,
      planning: 2,
      content: 3,
      images: 4,
      rendering: 5,
      complete: 5,
    };
    const stepIndex = phaseToStepIndex[phase] || 0;
    return plan.steps[stepIndex]?.id || "";
  }

  /**
   * 获取可用主题列表
   */
  getAvailableThemes(): typeof PPT_THEMES {
    return PPT_THEMES;
  }
}
