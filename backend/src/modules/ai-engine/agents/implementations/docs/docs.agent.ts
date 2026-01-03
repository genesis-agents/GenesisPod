/**
 * Docs Agent
 * AI 文档生成专项 Agent
 *
 * 复用现有的 ai-office 模块能力：
 * - DocumentGenerationService: 文档内容生成
 * - DocumentExportService: 导出为 DOCX/PDF/MD
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
  GenerationService,
  GenerationConfig,
  StreamChunk,
} from "../../../../ai-app/office/generation";
import { ExportOrchestratorService } from "../../../../../common/export";
import { ExportFormat } from "@prisma/client";

@Injectable()
export class DocsAgent extends PlanBasedAgent {
  private readonly logger = new Logger(DocsAgent.name);

  readonly id = BUILTIN_AGENTS.DOCS;
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
  readonly requiredTools: ToolId[] = [
    BUILTIN_TOOLS.TEXT_GENERATION,
    BUILTIN_TOOLS.WEB_SEARCH,
    BUILTIN_TOOLS.DATA_FETCH,
    BUILTIN_TOOLS.EXPORT_DOCX,
    BUILTIN_TOOLS.EXPORT_PDF,
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
    private readonly generationService: GenerationService,
    private readonly exportOrchestrator: ExportOrchestratorService,
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
      toolId: BUILTIN_TOOLS.DATA_FETCH,
      dependencies: [],
      estimatedDuration: 3000,
    });

    // Step 2: 资料搜集（如果需要）
    if (input.options?.webSearch !== false) {
      steps.push({
        id: this.generateStepId(),
        name: "资料搜集",
        description: "搜索相关背景资料",
        toolId: BUILTIN_TOOLS.WEB_SEARCH,
        dependencies: [steps[0].id],
        estimatedDuration: 5000,
      });
    }

    // Step 3: 大纲生成
    steps.push({
      id: this.generateStepId(),
      name: "生成大纲",
      description: "规划文档结构和章节",
      toolId: BUILTIN_TOOLS.TEXT_GENERATION,
      dependencies: [steps[steps.length - 1].id],
      estimatedDuration: 5000,
    });

    // Step 4: 内容生成
    steps.push({
      id: this.generateStepId(),
      name: "生成内容",
      description: "撰写文档详细内容",
      toolId: BUILTIN_TOOLS.TEXT_GENERATION,
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
    const exportFormatOption =
      (input.options?.exportFormat as string) || "docx";
    steps.push({
      id: this.generateStepId(),
      name: "导出文档",
      description: `导出为 ${exportFormatOption.toUpperCase()} 格式`,
      toolId:
        exportFormatOption === "pdf"
          ? BUILTIN_TOOLS.EXPORT_PDF
          : BUILTIN_TOOLS.EXPORT_DOCX,
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
      modelsRequired: ["chat"],
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
      const generator = this.generationService.generateDocument(userId, config);

      let generatedContent = "";
      const documentId = "";

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
      const exportFormatStr = String(input.options?.exportFormat || "docx");
      const exportFormat =
        exportFormatStr === "pdf" ? ExportFormat.PDF : ExportFormat.DOCX;

      yield {
        type: "step_progress",
        stepId: plan.steps[plan.steps.length - 1]?.id || "",
        progress: 50,
        message: `正在导出 ${exportFormatStr.toUpperCase()}...`,
      };

      // 使用统一导出模块
      const job = await this.exportOrchestrator.createExportJob(userId, {
        source: {
          type: "RAW",
          content: generatedContent,
          contentType: "markdown",
          title: config.title,
        },
        format: exportFormat,
      });

      // 等待导出完成
      let exportResult = job;
      const maxWait = 60000;
      const exportStartTime = Date.now();

      while (
        exportResult.status !== "COMPLETED" &&
        exportResult.status !== "FAILED" &&
        Date.now() - exportStartTime < maxWait
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        exportResult = await this.exportOrchestrator.getJobStatus(
          job.jobId,
          userId,
        );
      }

      // 完成
      const duration = Date.now() - startTime;

      if (exportResult.status === "COMPLETED") {
        yield {
          type: "complete",
          result: {
            success: true,
            artifacts: [
              {
                id: documentId || this.generateTaskId(),
                type: exportFormat === ExportFormat.PDF ? "pdf" : "docx",
                name:
                  exportResult.fileName || `${config.title}.${exportFormatStr}`,
                mimeType:
                  exportFormat === ExportFormat.PDF
                    ? "application/pdf"
                    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                size: exportResult.fileSize || 0,
                url: `/api/agents/docs/${plan.taskId}/download`,
              },
            ],
            summary: `成功生成文档: ${config.title}`,
            tokensUsed: 0,
            duration,
          },
        };
      } else {
        throw new Error(exportResult.error || "导出失败");
      }
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
