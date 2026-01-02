/**
 * Designer Agent
 * AI 设计助手 Agent
 *
 * 复用现有的 ai-image 模块能力：
 * - AiImageService: 图像生成
 * - 支持多种模板布局
 * - 支持 HTML 渲染和 AI 图像生成
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  PlanBasedAgent,
  BUILTIN_AGENTS,
  AgentInput,
  AgentPlan,
  AgentEvent,
  AgentTemplate,
  ToolId,
} from "../../base/plan-based-agent";
import { BUILTIN_TOOLS, PlanStep } from "../../../core/types/agent.types";
import {
  AiImageService,
  GeneratedImageResult,
} from "../../../../ai-image/generation/generation.service";

@Injectable()
export class DesignerAgent extends PlanBasedAgent {
  private readonly logger = new Logger(DesignerAgent.name);

  readonly id = BUILTIN_AGENTS.DESIGNER;
  readonly name = "AI Designer";
  readonly description = "智能设计助手，创建专业信息图和视觉内容";
  readonly capabilities = [
    "信息图生成",
    "数据可视化",
    "海报设计",
    "流程图绘制",
    "多种模板布局",
    "AI 图像增强",
  ];
  readonly requiredTools: ToolId[] = [
    BUILTIN_TOOLS.TEXT_GENERATION,
    BUILTIN_TOOLS.IMAGE_GENERATION,
    BUILTIN_TOOLS.DATA_FETCH,
    BUILTIN_TOOLS.EXPORT_IMAGE,
  ];

  protected templates: AgentTemplate[] = [
    {
      id: "infographic",
      name: "信息图",
      description: "数据驱动的专业信息图",
      category: "visualization",
      icon: "📊",
      defaultPrompt: "创建关于[主题]的信息图",
      defaultOptions: {
        templateLayout: "cards",
        aspectRatio: "9:16",
        style: "consulting",
      },
    },
    {
      id: "data-visualization",
      name: "数据可视化",
      description: "图表和统计数据展示",
      category: "visualization",
      icon: "📈",
      defaultPrompt: "可视化[数据类型]数据",
      defaultOptions: {
        templateLayout: "statistics",
        aspectRatio: "16:9",
        style: "tech",
      },
    },
    {
      id: "process-flow",
      name: "流程图",
      description: "业务流程和步骤说明",
      category: "diagram",
      icon: "🔄",
      defaultPrompt: "绘制[流程名称]的流程图",
      defaultOptions: {
        templateLayout: "timeline",
        aspectRatio: "16:9",
        style: "minimal",
      },
    },
    {
      id: "comparison",
      name: "对比图",
      description: "方案对比和优劣分析",
      category: "visualization",
      icon: "⚖️",
      defaultPrompt: "对比[选项A]和[选项B]",
      defaultOptions: {
        templateLayout: "comparison",
        aspectRatio: "16:9",
        style: "consulting",
      },
    },
    {
      id: "poster",
      name: "海报设计",
      description: "活动海报和宣传图",
      category: "marketing",
      icon: "🎨",
      defaultPrompt: "设计[活动/产品]的宣传海报",
      defaultOptions: {
        templateLayout: "center_visual",
        aspectRatio: "9:16",
        style: "creative",
      },
    },
  ];

  constructor(private readonly aiImageService: AiImageService) {
    super();
  }

  /**
   * 分析用户输入，生成执行计划
   */
  async plan(input: AgentInput): Promise<AgentPlan> {
    this.logger.log(`[plan] Planning for: ${input.prompt?.slice(0, 100)}...`);

    const taskId = this.generateTaskId();
    const steps: PlanStep[] = [];

    // Step 1: 内容分析
    steps.push({
      id: this.generateStepId(),
      name: "内容分析",
      description: "分析设计需求和素材",
      toolId: BUILTIN_TOOLS.DATA_FETCH,
      dependencies: [],
      estimatedDuration: 3000,
    });

    // Step 2: 如果有 URL，获取内容
    if (input.urls && input.urls.length > 0) {
      steps.push({
        id: this.generateStepId(),
        name: "获取素材",
        description: "从 URL 提取内容",
        toolId: BUILTIN_TOOLS.DATA_FETCH,
        dependencies: [steps[0].id],
        estimatedDuration: 5000,
      });
    }

    // Step 3: 设计规划
    steps.push({
      id: this.generateStepId(),
      name: "设计规划",
      description: "规划布局和视觉元素",
      toolId: BUILTIN_TOOLS.TEXT_GENERATION,
      dependencies: [steps[steps.length - 1].id],
      estimatedDuration: 5000,
    });

    // Step 4: 生成设计
    steps.push({
      id: this.generateStepId(),
      name: "生成设计",
      description: "创建视觉设计",
      toolId: BUILTIN_TOOLS.IMAGE_GENERATION,
      dependencies: [steps[steps.length - 1].id],
      estimatedDuration: 30000,
    });

    // Step 5: 优化输出
    steps.push({
      id: this.generateStepId(),
      name: "优化输出",
      description: "优化图像质量和格式",
      toolId: BUILTIN_TOOLS.EXPORT_IMAGE,
      dependencies: [steps[steps.length - 1].id],
      estimatedDuration: 5000,
    });

    const estimatedTime = steps.reduce(
      (acc, step) => acc + step.estimatedDuration,
      0,
    );

    return {
      taskId,
      agentId: this.id,
      steps,
      estimatedTime,
      toolsRequired: this.requiredTools,
      modelsRequired: ["chat", "image"],
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

    const startTime = Date.now();

    try {
      // 发送开始事件
      yield {
        type: "step_progress",
        stepId: plan.steps[0]?.id || "",
        progress: 10,
        message: "正在分析设计需求...",
      };

      // 准备图像生成选项
      type TemplateLayoutType =
        | "cards"
        | "center_visual"
        | "timeline"
        | "comparison"
        | "pyramid"
        | "radial";
      type AspectRatioType = "9:16" | "16:9" | "1:1" | "4:3";

      const aspectRatioValue =
        (input.options?.aspectRatio as AspectRatioType) || "16:9";
      const templateLayoutValue = input.options?.templateLayout as
        | TemplateLayoutType
        | undefined;

      const imageOptions = {
        prompt: input.prompt,
        urls: input.urls,
        content: input.options?.content as string | undefined,
        templateLayout: templateLayoutValue,
        style: input.options?.style as string | undefined,
        aspectRatio: aspectRatioValue,
        textModelId: input.options?.textModelId as string | undefined,
        imageModelId: input.options?.imageModelId as string | undefined,
        userId: input.options?.userId as string | undefined,
      };

      // 发送规划事件
      yield {
        type: "step_progress",
        stepId: plan.steps[1]?.id || "",
        progress: 30,
        message: "正在规划设计布局...",
      };

      // 发送生成事件
      yield {
        type: "step_progress",
        stepId: plan.steps[2]?.id || "",
        progress: 50,
        message: "正在生成设计...",
      };

      // 调用图像生成服务
      const result: GeneratedImageResult =
        await this.aiImageService.generateImage(imageOptions);

      // 发送优化事件
      yield {
        type: "step_progress",
        stepId: plan.steps[plan.steps.length - 1]?.id || "",
        progress: 90,
        message: "正在优化输出...",
      };

      const duration = Date.now() - startTime;

      // 检查是否有错误
      if (result.error) {
        yield {
          type: "error",
          error: result.error,
        };
        return;
      }

      // 完成
      yield {
        type: "complete",
        result: {
          success: true,
          artifacts: [
            {
              id: result.id,
              type: "image",
              name: "design.png",
              mimeType: "image/png",
              size: 0,
              url: result.imageUrl,
            },
          ],
          summary: `成功生成设计图 (${result.width}x${result.height})`,
          tokensUsed: 0,
          duration,
        },
      };
    } catch (error) {
      this.logger.error(`[execute] Error: ${error}`);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "设计生成失败",
      };
    }
  }
}
