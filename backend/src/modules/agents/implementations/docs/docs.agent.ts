/**
 * Docs Agent
 * AI 文档生成专项 Agent
 *
 * 复用现有的 ai-office 模块能力：
 * - DocumentGenerationService: 文档内容生成
 * - DocumentExportService: 导出为 DOCX/PDF/MD
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseAgent } from "../../core/agent.interface";
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
} from "../../core/agent.types";
import {
  DocumentGenerationService,
  GenerationConfig,
  StreamChunk,
} from "../../../ai-office/document-generation.service";
import {
  DocumentExportService,
  ExportFormat,
} from "../../../ai-office/document-export.service";

@Injectable()
export class DocsAgent extends BaseAgent {
  private readonly logger = new Logger(DocsAgent.name);

  readonly type = AgentType.DOCS;
  readonly name = "AI Docs";
  readonly description = "智能文档生成器，快速创建专业文档";
  readonly capabilities = [
    "自动生成大纲",
    "多种文档类型",
    "资源引用",
    "导出 DOCX/PDF",
    "多语言支持",
    "实时进度展示",
  ];
  readonly requiredTools: ToolType[] = [
    ToolType.TEXT_GENERATION,
    ToolType.WEB_SEARCH,
    ToolType.DATA_FETCH,
    ToolType.EXPORT_DOCX,
    ToolType.EXPORT_PDF,
  ];

  protected templates: AgentTemplate[] = [
    {
      id: "research-report",
      name: "研究报告",
      description: "深度研究分析报告",
      category: "research",
      icon: "📊",
      defaultPrompt: "撰写关于[主题]的研究报告",
      defaultOptions: {
        documentType: "RESEARCH",
        detailLevel: 3,
        language: "zh-CN",
      },
    },
    {
      id: "business-proposal",
      name: "商业提案",
      description: "商业计划和提案文档",
      category: "business",
      icon: "💼",
      defaultPrompt: "撰写[项目]的商业提案",
      defaultOptions: {
        documentType: "PROPOSAL",
        detailLevel: 2,
        language: "zh-CN",
      },
    },
    {
      id: "technical-doc",
      name: "技术文档",
      description: "技术规范和说明文档",
      category: "technical",
      icon: "📖",
      defaultPrompt: "撰写[系统/功能]的技术文档",
      defaultOptions: {
        documentType: "ARTICLE",
        detailLevel: 3,
        language: "zh-CN",
      },
    },
    {
      id: "meeting-minutes",
      name: "会议纪要",
      description: "会议记录和行动项",
      category: "business",
      icon: "📝",
      defaultPrompt: "整理[会议主题]的会议纪要",
      defaultOptions: {
        documentType: "ARTICLE",
        detailLevel: 2,
        language: "zh-CN",
      },
    },
    {
      id: "article",
      name: "文章创作",
      description: "各类文章和博客",
      category: "content",
      icon: "✍️",
      defaultPrompt: "撰写关于[主题]的文章",
      defaultOptions: {
        documentType: "ARTICLE",
        detailLevel: 2,
        language: "zh-CN",
      },
    },
  ];

  constructor(
    private readonly documentGenerationService: DocumentGenerationService,
    private readonly documentExportService: DocumentExportService,
  ) {
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
      description: "分析用户需求和引用资源",
      tool: ToolType.DATA_FETCH,
      dependencies: [],
      estimatedDuration: 3000,
    });

    // Step 2: 资料搜集（如果需要）
    if (input.options?.webSearch !== false) {
      steps.push({
        id: this.generateStepId(),
        name: "资料搜集",
        description: "搜索相关背景资料",
        tool: ToolType.WEB_SEARCH,
        dependencies: [steps[0].id],
        estimatedDuration: 5000,
      });
    }

    // Step 3: 大纲生成
    steps.push({
      id: this.generateStepId(),
      name: "生成大纲",
      description: "规划文档结构和章节",
      tool: ToolType.TEXT_GENERATION,
      dependencies: [steps[steps.length - 1].id],
      estimatedDuration: 5000,
    });

    // Step 4: 内容生成
    steps.push({
      id: this.generateStepId(),
      name: "生成内容",
      description: "撰写文档详细内容",
      tool: ToolType.TEXT_GENERATION,
      dependencies: [steps[steps.length - 1].id],
      estimatedDuration: 30000,
    });

    // Step 5: 格式优化
    steps.push({
      id: this.generateStepId(),
      name: "格式优化",
      description: "优化文档格式和排版",
      dependencies: [steps[steps.length - 1].id],
      estimatedDuration: 3000,
    });

    // Step 6: 导出文档
    const exportFormat =
      (input.options?.exportFormat as ExportFormat) || "docx";
    steps.push({
      id: this.generateStepId(),
      name: "导出文档",
      description: `导出为 ${exportFormat.toUpperCase()} 格式`,
      tool: exportFormat === "pdf" ? ToolType.EXPORT_PDF : ToolType.EXPORT_DOCX,
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
      modelsRequired: [AIModelType.CHAT],
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
      // 准备文档生成配置
      const config: GenerationConfig = {
        documentType: (input.options?.documentType as any) || "ARTICLE",
        title: this.extractTitle(input.prompt || ""),
        prompt: input.prompt || "",
        resourceIds: input.options?.resourceIds as string[] | undefined,
        language: (input.options?.language as "zh-CN" | "en-US") || "zh-CN",
        detailLevel: (input.options?.detailLevel as 1 | 2 | 3) || 2,
        textModelId: input.options?.textModelId as string | undefined,
      };

      // 获取用户 ID（默认为系统用户）
      const userId = (input.options?.userId as string) || "system";

      // 调用文档生成服务
      const generator = this.documentGenerationService.generateDocument(
        userId,
        config,
      );

      let generatedContent = "";
      let documentId = "";

      // 处理生成流
      for await (const chunk of generator) {
        const agentEvent = this.mapStreamChunkToAgentEvent(chunk, plan);
        if (agentEvent) {
          yield agentEvent;
        }

        if (chunk.type === "content" && chunk.content) {
          generatedContent = chunk.content;
        }
      }

      // 导出文档
      const exportFormat =
        (input.options?.exportFormat as ExportFormat) || "docx";

      yield {
        type: "step_progress",
        stepId: plan.steps[plan.steps.length - 1]?.id || "",
        progress: 50,
        message: `正在导出 ${exportFormat.toUpperCase()}...`,
      };

      const exportResult = await this.documentExportService.exportDocument({
        format: exportFormat,
        documentType: config.documentType,
        title: config.title,
        content: generatedContent,
        metadata: {
          author: "AI Docs",
          wordCount: generatedContent.length,
        },
      });

      // 完成
      const duration = Date.now() - startTime;

      yield {
        type: "complete",
        result: {
          success: true,
          artifacts: [
            {
              id: documentId || this.generateTaskId(),
              type:
                exportFormat === "pdf" ? ArtifactType.PDF : ArtifactType.DOCX,
              name: exportResult.filename,
              mimeType: exportResult.mimeType,
              size: exportResult.buffer.length,
              url: `/api/agents/docs/${plan.taskId}/download`,
            },
          ],
          summary: `成功生成文档: ${config.title}`,
          tokensUsed: 0,
          duration,
        },
      };
    } catch (error) {
      this.logger.error(`[execute] Error: ${error}`);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "文档生成失败",
      };
    }
  }

  /**
   * 从提示词中提取标题
   */
  private extractTitle(prompt: string): string {
    // 尝试从提示词中提取标题
    const patterns = [
      /撰写(?:关于)?[《"']?([^《》"']+)[》"']?的/,
      /写一(?:篇|份)[《"']?([^《》"']+)[》"']?/,
      /创建[《"']?([^《》"']+)[》"']?/,
      /生成[《"']?([^《》"']+)[》"']?/,
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // 如果无法提取，使用前 30 个字符
    return prompt.slice(0, 30).trim() || "未命名文档";
  }

  /**
   * 将流事件映射为 Agent 事件
   */
  private mapStreamChunkToAgentEvent(
    chunk: StreamChunk,
    plan: AgentPlan,
  ): AgentEvent | null {
    switch (chunk.type) {
      case "progress":
        if (!chunk.progress) return null;
        return {
          type: "step_progress",
          stepId: this.getStepIdByProgress(chunk.progress.step, plan),
          progress: chunk.progress.percentage,
          message: chunk.progress.message,
        };

      case "error":
        return {
          type: "error",
          error: chunk.error || "未知错误",
        };

      default:
        return null;
    }
  }

  /**
   * 根据进度步骤获取计划步骤 ID
   */
  private getStepIdByProgress(step: string, plan: AgentPlan): string {
    const stepMapping: Record<string, number> = {
      init: 0,
      resources: 0,
      prompt: 1,
      generate: 2,
      process: 3,
      save: 4,
      done: 5,
    };
    const index = stepMapping[step] ?? 0;
    return plan.steps[index]?.id || "";
  }
}
