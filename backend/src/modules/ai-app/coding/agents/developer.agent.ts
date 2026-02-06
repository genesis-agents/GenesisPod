/**
 * Developer Agent
 * AI 代码助手 Agent
 *
 * 能力：
 * - 代码生成
 * - 代码解释
 * - 代码优化
 * - Bug 修复
 * - 单元测试生成
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
} from "../../../ai-engine/agents/base/plan-based-agent";
import {
  BUILTIN_TOOLS,
  PlanStep,
} from "../../../ai-engine/core/types/agent.types";
import {
  AiChatService,
  ChatMessage,
} from "../../../ai-engine/llm/services/ai-chat.service";
import { AIEngineFacade } from "../../../ai-engine/facade/ai-engine.facade";

@Injectable()
export class DeveloperAgent extends PlanBasedAgent {
  private readonly logger = new Logger(DeveloperAgent.name);

  readonly id = BUILTIN_AGENTS.DEVELOPER;
  readonly name = "AI Developer";
  readonly description = "智能代码助手，帮助编写、优化和调试代码";
  readonly capabilities = [
    "代码生成",
    "代码解释",
    "代码优化",
    "Bug 修复",
    "单元测试生成",
    "代码审查",
  ];
  readonly requiredTools: ToolId[] = [
    BUILTIN_TOOLS.TEXT_GENERATION,
    BUILTIN_TOOLS.CODE_GENERATION,
  ];

  protected templates: AgentTemplate[] = [
    {
      id: "code-generation",
      name: "代码生成",
      description: "根据描述生成代码",
      category: "coding",
      icon: "💻",
      defaultPrompt: "实现一个[功能描述]的函数",
      defaultOptions: {
        language: "typescript",
        includeTests: true,
      },
    },
    {
      id: "code-explain",
      name: "代码解释",
      description: "解释代码的功能和原理",
      category: "coding",
      icon: "📖",
      defaultPrompt: "解释以下代码的功能",
      defaultOptions: {
        detailLevel: 2,
      },
    },
    {
      id: "code-optimize",
      name: "代码优化",
      description: "优化代码性能和可读性",
      category: "coding",
      icon: "⚡",
      defaultPrompt: "优化以下代码",
      defaultOptions: {
        optimizationType: "performance",
      },
    },
    {
      id: "bug-fix",
      name: "Bug 修复",
      description: "分析并修复代码问题",
      category: "debugging",
      icon: "🐛",
      defaultPrompt: "修复以下代码中的问题",
      defaultOptions: {
        includeExplanation: true,
      },
    },
    {
      id: "unit-test",
      name: "单元测试",
      description: "生成单元测试代码",
      category: "testing",
      icon: "🧪",
      defaultPrompt: "为以下代码生成单元测试",
      defaultOptions: {
        testFramework: "jest",
        coverage: "comprehensive",
      },
    },
  ];

  protected selectionKeywords: string[] = [
    "代码",
    "程序",
    "code",
    "编程",
    "开发",
    "developer",
    "coding",
  ];

  constructor(
    private readonly aiChatService: AiChatService,
    private readonly aiFacade: AIEngineFacade,
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

    // Step 1: 需求分析
    steps.push({
      id: this.generateStepId(),
      name: "需求分析",
      description: "分析代码需求和上下文",
      toolId: BUILTIN_TOOLS.TEXT_GENERATION,
      dependencies: [],
      estimatedDuration: 3000,
    });

    // Step 2: 代码生成/分析
    const taskType = this.detectTaskType(input.prompt || "");
    steps.push({
      id: this.generateStepId(),
      name: this.getStepNameByTaskType(taskType),
      description: this.getStepDescByTaskType(taskType),
      toolId: BUILTIN_TOOLS.CODE_GENERATION,
      dependencies: [steps[0].id],
      estimatedDuration: 10000,
    });

    // Step 3: 代码优化（如果是生成任务）
    if (taskType === "generate" || taskType === "optimize") {
      steps.push({
        id: this.generateStepId(),
        name: "代码优化",
        description: "优化代码质量和可读性",
        toolId: BUILTIN_TOOLS.CODE_GENERATION,
        dependencies: [steps[1].id],
        estimatedDuration: 5000,
      });
    }

    // Step 4: 测试生成（如果需要）
    if (input.options?.includeTests !== false && taskType === "generate") {
      steps.push({
        id: this.generateStepId(),
        name: "生成测试",
        description: "生成单元测试代码",
        toolId: BUILTIN_TOOLS.CODE_GENERATION,
        dependencies: [steps[steps.length - 1].id],
        estimatedDuration: 8000,
      });
    }

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
      // 获取 AI 模型
      yield {
        type: "step_progress",
        stepId: plan.steps[0]?.id || "",
        progress: 10,
        message: "正在分析需求...",
      };

      // ★ 使用 AIEngineFacade 获取默认文本模型
      const preferredModelId = input.options?.textModelId as string | undefined;
      const textModel = preferredModelId
        ? await this.aiFacade.getModelById(preferredModelId)
        : await this.aiFacade.getDefaultTextModel();

      if (!textModel) {
        throw new Error("No text model available");
      }

      // 构建系统提示
      const systemPrompt = this.buildSystemPrompt(input);
      const userPrompt = this.buildUserPrompt(input);

      // 发送生成事件
      yield {
        type: "step_progress",
        stepId: plan.steps[1]?.id || "",
        progress: 30,
        message: "正在生成代码...",
      };

      // 调用 AI 服务
      // ★ 不传递 apiKey/provider，让 aiChatService 自动从 Secret Manager 获取
      const messages: ChatMessage[] = [{ role: "user", content: userPrompt }];
      const result = await this.aiChatService.chat({
        model: textModel.modelId,
        systemPrompt,
        messages,
        maxTokens: textModel.maxTokens || 4096,
        temperature: 0.2, // 低温度以获得更确定性的代码
      });

      yield {
        type: "step_progress",
        stepId: plan.steps[plan.steps.length - 1]?.id || "",
        progress: 90,
        message: "正在完成处理...",
      };

      const duration = Date.now() - startTime;

      // 解析代码块
      const codeBlocks = this.extractCodeBlocks(result.content);
      const language = (input.options?.language as string) || "typescript";

      // 完成
      yield {
        type: "complete",
        result: {
          success: true,
          artifacts: codeBlocks.map((code, index) => ({
            id: `code_${index}`,
            type: "code",
            name: `code_${index}.${this.getFileExtension(language)}`,
            mimeType: "text/plain",
            size: code.length,
            url: "", // 代码直接在 content 中
            content: code,
          })),
          summary: `成功生成 ${codeBlocks.length} 个代码块`,
          tokensUsed: result.usage?.totalTokens || 0,
          duration,
        },
      };
    } catch (error) {
      this.logger.error(`[execute] Error: ${error}`);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "代码生成失败",
      };
    }
  }

  /**
   * 检测任务类型
   */
  private detectTaskType(
    prompt: string,
  ): "generate" | "explain" | "optimize" | "fix" | "test" {
    const lowerPrompt = prompt.toLowerCase();

    if (
      lowerPrompt.includes("解释") ||
      lowerPrompt.includes("explain") ||
      lowerPrompt.includes("什么意思")
    ) {
      return "explain";
    }
    if (
      lowerPrompt.includes("优化") ||
      lowerPrompt.includes("optimize") ||
      lowerPrompt.includes("改进")
    ) {
      return "optimize";
    }
    if (
      lowerPrompt.includes("修复") ||
      lowerPrompt.includes("fix") ||
      lowerPrompt.includes("bug") ||
      lowerPrompt.includes("错误")
    ) {
      return "fix";
    }
    if (
      lowerPrompt.includes("测试") ||
      lowerPrompt.includes("test") ||
      lowerPrompt.includes("单元测试")
    ) {
      return "test";
    }

    return "generate";
  }

  /**
   * 根据任务类型获取步骤名称
   */
  private getStepNameByTaskType(taskType: string): string {
    switch (taskType) {
      case "explain":
        return "代码解释";
      case "optimize":
        return "代码优化";
      case "fix":
        return "问题修复";
      case "test":
        return "测试生成";
      default:
        return "代码生成";
    }
  }

  /**
   * 根据任务类型获取步骤描述
   */
  private getStepDescByTaskType(taskType: string): string {
    switch (taskType) {
      case "explain":
        return "分析并解释代码功能";
      case "optimize":
        return "优化代码性能和可读性";
      case "fix":
        return "分析并修复代码问题";
      case "test":
        return "生成单元测试代码";
      default:
        return "根据需求生成代码";
    }
  }

  /**
   * 构建系统提示
   */
  private buildSystemPrompt(input: AgentInput): string {
    const language = (input.options?.language as string) || "TypeScript";
    const taskType = this.detectTaskType(input.prompt || "");

    let basePrompt = `你是一个专业的编程助手，精通多种编程语言和最佳实践。
当前主要使用 ${language} 语言。

要求：
- 代码要清晰、可读、可维护
- 遵循该语言的最佳实践和编码规范
- 添加必要的注释解释复杂逻辑
- 使用有意义的变量和函数命名`;

    switch (taskType) {
      case "explain":
        basePrompt += `

你的任务是解释代码：
1. 首先概述代码的整体功能
2. 逐段解释关键逻辑
3. 指出代码中的设计模式或技术
4. 说明可能的改进点`;
        break;

      case "optimize":
        basePrompt += `

你的任务是优化代码：
1. 分析代码的性能瓶颈
2. 提供优化后的代码
3. 解释每个优化点
4. 保持代码的可读性`;
        break;

      case "fix":
        basePrompt += `

你的任务是修复代码问题：
1. 分析代码中的问题
2. 解释问题的原因
3. 提供修复后的代码
4. 解释修复方案`;
        break;

      case "test":
        basePrompt += `

你的任务是生成单元测试：
1. 分析代码的功能点
2. 为每个功能编写测试用例
3. 包含正常情况和边界情况
4. 使用 ${input.options?.testFramework || "Jest"} 测试框架`;
        break;

      default:
        basePrompt += `

你的任务是生成代码：
1. 理解用户需求
2. 设计合理的代码结构
3. 实现功能并添加注释
4. 考虑错误处理和边界情况`;
    }

    return basePrompt;
  }

  /**
   * 构建用户提示
   */
  private buildUserPrompt(input: AgentInput): string {
    let prompt = input.prompt || "";

    // 如果有代码内容，添加到提示中
    if (input.options?.content) {
      prompt += `\n\n代码内容：\n\`\`\`\n${input.options.content}\n\`\`\``;
    }

    return prompt;
  }

  /**
   * 从响应中提取代码块
   */
  private extractCodeBlocks(content: string): string[] {
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
    const blocks: string[] = [];
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      blocks.push(match[1].trim());
    }

    // 如果没有代码块，返回整个内容
    if (blocks.length === 0) {
      blocks.push(content);
    }

    return blocks;
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(language: string): string {
    const extensions: Record<string, string> = {
      typescript: "ts",
      javascript: "js",
      python: "py",
      java: "java",
      go: "go",
      rust: "rs",
      cpp: "cpp",
      c: "c",
      csharp: "cs",
      ruby: "rb",
      php: "php",
      swift: "swift",
      kotlin: "kt",
    };
    return extensions[language.toLowerCase()] || "txt";
  }
}
