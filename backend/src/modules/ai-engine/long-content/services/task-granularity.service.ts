/**
 * 任务粒度控制服务
 * Task Granularity Control Service
 *
 * 核心职责：
 * 1. 预估任务规模
 * 2. 生成粒度约束 Prompt
 * 3. 验证任务分解是否符合约束
 * 4. 自动修正不符合约束的任务分解
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  GranularityConstraint,
  GranularityLevel,
  TaskEstimate,
  TaskDecomposition,
  DecompositionValidation,
  GranularityPromptOptions,
} from "../interfaces";

/**
 * 粒度级别对应的典型输出规模
 */
const GRANULARITY_SIZE_ESTIMATES: Record<
  GranularityLevel,
  { minWords: number; maxWords: number; typicalTokens: number }
> = {
  volume: { minWords: 30000, maxWords: 100000, typicalTokens: 50000 },
  chapter: { minWords: 1000, maxWords: 5000, typicalTokens: 2500 },
  section: { minWords: 300, maxWords: 1500, typicalTokens: 800 },
  paragraph: { minWords: 50, maxWords: 300, typicalTokens: 150 },
  item: { minWords: 20, maxWords: 200, typicalTokens: 80 },
};

/**
 * 安全的单次 LLM 输出上限（字符）
 */
const SAFE_SINGLE_OUTPUT_LIMIT = 4000;

/**
 * 粒度级别的中文名称
 */
const GRANULARITY_NAMES: Record<GranularityLevel, string> = {
  volume: "卷",
  chapter: "章",
  section: "节",
  paragraph: "段落",
  item: "条目",
};

@Injectable()
export class TaskGranularityService {
  private readonly logger = new Logger(TaskGranularityService.name);

  /**
   * 根据用户需求预估任务规模
   */
  async estimateTaskScale(
    userRequirement: string,
    contextInfo?: {
      existingContent?: string;
      totalTargetWords?: number;
      preferredGranularity?: GranularityLevel;
    },
  ): Promise<TaskEstimate> {
    this.logger.debug(`Estimating task scale for: ${userRequirement}`);

    // 解析用户需求中的数量和规模信息
    const parsedRequirement = this.parseRequirement(userRequirement);

    // 确定推荐粒度
    const recommendedGranularity =
      contextInfo?.preferredGranularity ||
      this.determineOptimalGranularity(parsedRequirement);

    // 计算任务数量
    const granularityInfo = GRANULARITY_SIZE_ESTIMATES[recommendedGranularity];
    const estimatedTokensPerTask = granularityInfo.typicalTokens;

    // 根据解析结果确定总任务数
    let totalTasks = parsedRequirement.explicitCount || 1;
    if (parsedRequirement.totalWords && !parsedRequirement.explicitCount) {
      const avgWords =
        (granularityInfo.minWords + granularityInfo.maxWords) / 2;
      totalTasks = Math.ceil(parsedRequirement.totalWords / avgWords);
    }

    // 计算并行批次
    const tasksPerBatch = Math.min(10, Math.ceil(totalTasks / 8));
    const parallelBatches = Math.ceil(totalTasks / tasksPerBatch);

    // 检查是否需要续写机制
    const requiresContinuation =
      granularityInfo.maxWords * 2 > SAFE_SINGLE_OUTPUT_LIMIT;

    // 生成警告
    const warnings: string[] = [];
    if (totalTasks > 100) {
      warnings.push(`任务数量较多 (${totalTasks})，建议分批执行以保证质量`);
    }
    if (requiresContinuation) {
      warnings.push(`单任务预期输出较大，已启用续写机制`);
    }
    if (parsedRequirement.ambiguous) {
      warnings.push(`需求解析存在歧义，建议明确指定数量和粒度`);
    }

    return {
      estimatedTokensPerTask,
      recommendedGranularity,
      totalTasks,
      parallelBatches,
      tasksPerBatch,
      estimatedTotalTokens: estimatedTokensPerTask * totalTasks,
      warnings,
      requiresContinuation,
    };
  }

  /**
   * 构建粒度约束 Prompt
   */
  buildGranularityConstraintPrompt(
    constraint: GranularityConstraint,
    options?: GranularityPromptOptions,
  ): string {
    const granularityName = GRANULARITY_NAMES[constraint.level];
    const maxOutput = constraint.maxOutputPerTask.characters || 3000;

    let prompt = `
## 关键约束 - 必须严格遵守

### 任务粒度要求
- **粒度级别**：${granularityName}
- **每个任务最大输出**：${maxOutput} 字
- **禁止合并**：${constraint.allowMerge ? "允许合理合并" : `不得将多个${granularityName}合并为一个任务`}
`;

    if (constraint.expectedTotalTasks) {
      prompt += `- **预期任务数**：约 ${constraint.expectedTotalTasks} 个任务\n`;
    }

    // 添加错误示例
    prompt += `
### 错误示例（禁止）
`;

    if (constraint.level === "chapter") {
      prompt += `❌ 任务1：第1-10章（违反：合并了10章）
❌ 任务1：第一卷（违反：一卷包含多章）
❌ 任务1：创作前半部分（违反：粒度过大）
`;
    } else if (constraint.level === "section") {
      prompt += `❌ 任务1：第1-5节（违反：合并了5节）
❌ 任务1：完成第一章（违反：一章包含多节）
`;
    } else if (constraint.level === "item") {
      prompt += `❌ 任务1：分析所有数据点（违反：粒度过大）
❌ 任务1：处理10个条目（违反：合并了10个条目）
`;
    }

    // 添加正确示例
    prompt += `
### 正确示例（遵循）
`;

    if (options?.exampleTitles && options.exampleTitles.length > 0) {
      options.exampleTitles.forEach((title, idx) => {
        prompt += `✓ 任务${idx + 1}：${title}\n`;
      });
    } else if (constraint.level === "chapter") {
      prompt += `✓ 任务1：第1章 - 开篇引入
✓ 任务2：第2章 - 角色登场
✓ 任务3：第3章 - 初遇危机
...
`;
    } else if (constraint.level === "section") {
      prompt += `✓ 任务1：1.1 背景介绍
✓ 任务2：1.2 问题定义
✓ 任务3：1.3 研究方法
...
`;
    } else if (constraint.level === "item") {
      prompt += `✓ 任务1：分析数据点 A
✓ 任务2：分析数据点 B
✓ 任务3：分析数据点 C
...
`;
    }

    // 验证规则提醒
    prompt += `
### 验证规则
系统将自动验证你的任务分解：
- 如果单个任务包含多个${granularityName}，将被自动拆分
${constraint.expectedTotalTasks ? `- 如果总任务数与预期 (${constraint.expectedTotalTasks}) 相差超过 20%，将要求重新分解` : ""}
- 每个任务的标题必须明确指出是第几${granularityName}
`;

    if (options?.additionalConstraints) {
      prompt += `\n### 额外要求\n${options.additionalConstraints}\n`;
    }

    return prompt;
  }

  /**
   * 验证任务分解是否符合约束
   */
  validateDecomposition(
    tasks: TaskDecomposition[],
    constraint: GranularityConstraint,
  ): DecompositionValidation {
    const violations: DecompositionValidation["violations"] = [];
    const granularityName = GRANULARITY_NAMES[constraint.level];

    // 检查每个任务
    tasks.forEach((task, index) => {
      // 检查标题是否包含多个单元
      const multiUnitPattern = this.detectMultiUnitPattern(
        task.title,
        constraint.level,
      );
      if (multiUnitPattern) {
        violations.push({
          taskIndex: index,
          taskTitle: task.title,
          issue: `任务标题暗示包含多个${granularityName}：${multiUnitPattern}`,
          severity: "error",
        });
      }

      // 检查预估字数是否超过限制
      if (
        task.estimatedWords &&
        constraint.maxOutputPerTask.characters &&
        task.estimatedWords > constraint.maxOutputPerTask.characters * 1.5
      ) {
        violations.push({
          taskIndex: index,
          taskTitle: task.title,
          issue: `预估字数 (${task.estimatedWords}) 超过限制 (${constraint.maxOutputPerTask.characters})`,
          severity: "warning",
        });
      }
    });

    // 检查总任务数
    if (constraint.expectedTotalTasks) {
      const deviation =
        Math.abs(tasks.length - constraint.expectedTotalTasks) /
        constraint.expectedTotalTasks;
      if (deviation > 0.2) {
        violations.push({
          taskIndex: -1,
          taskTitle: "[总体]",
          issue: `任务总数 (${tasks.length}) 与预期 (${constraint.expectedTotalTasks}) 相差过大`,
          severity: "warning",
        });
      }
    }

    const valid = violations.filter((v) => v.severity === "error").length === 0;

    // 如果验证失败，尝试自动修正
    let autoFixed: TaskDecomposition[] | undefined;
    if (!valid) {
      autoFixed = this.autoRedecompose(tasks, constraint);
    }

    // 计算统计信息
    const totalEstimatedWords = tasks.reduce(
      (sum, t) => sum + (t.estimatedWords || 0),
      0,
    );

    return {
      valid,
      violations,
      autoFixed,
      stats: {
        originalTaskCount: tasks.length,
        fixedTaskCount: autoFixed?.length,
        totalEstimatedWords,
      },
    };
  }

  /**
   * 自动重新分解任务
   */
  autoRedecompose(
    originalTasks: TaskDecomposition[],
    constraint: GranularityConstraint,
  ): TaskDecomposition[] {
    this.logger.log(
      `Auto-redecomposing ${originalTasks.length} tasks to match constraint`,
    );

    const result: TaskDecomposition[] = [];
    let orderCounter = 1;

    for (const task of originalTasks) {
      // 检测是否是多单元任务
      const rangeMatch = this.extractRange(task.title, constraint.level);

      if (rangeMatch) {
        // 拆分为多个单独任务
        const { start, end } = rangeMatch;
        for (let i = start; i <= end; i++) {
          result.push({
            title: this.buildSingleUnitTitle(i, constraint.level, task.title),
            description: this.buildSingleUnitDescription(
              i,
              constraint.level,
              task.description,
            ),
            estimatedWords: constraint.maxOutputPerTask.characters
              ? Math.min(
                  (task.estimatedWords || 2000) / (end - start + 1),
                  constraint.maxOutputPerTask.characters,
                )
              : undefined,
            order: orderCounter++,
          });
        }
      } else {
        // 保持原样
        result.push({
          ...task,
          order: orderCounter++,
        });
      }
    }

    this.logger.log(
      `Redecomposed: ${originalTasks.length} → ${result.length} tasks`,
    );

    return result;
  }

  /**
   * 从约束构建默认配置
   */
  buildDefaultConstraint(
    level: GranularityLevel,
    options?: {
      expectedTotalTasks?: number;
      maxOutputPerTask?: number;
    },
  ): GranularityConstraint {
    const sizeEstimate = GRANULARITY_SIZE_ESTIMATES[level];

    return {
      level,
      maxOutputPerTask: {
        characters: options?.maxOutputPerTask || sizeEstimate.maxWords * 2,
        tokens: sizeEstimate.typicalTokens,
      },
      allowMerge: false,
      expectedTotalTasks: options?.expectedTotalTasks,
    };
  }

  // ============ 私有方法 ============

  /**
   * 解析用户需求
   */
  private parseRequirement(requirement: string): {
    explicitCount?: number;
    totalWords?: number;
    granularityHint?: GranularityLevel;
    ambiguous: boolean;
  } {
    const result: ReturnType<typeof this.parseRequirement> = {
      ambiguous: false,
    };

    // 匹配章节数量
    const chapterMatch = requirement.match(/(\d+)\s*章/);
    if (chapterMatch) {
      result.explicitCount = parseInt(chapterMatch[1], 10);
      result.granularityHint = "chapter";
    }

    // 匹配卷数量
    const volumeMatch = requirement.match(/(\d+)\s*卷/);
    if (volumeMatch) {
      result.explicitCount = parseInt(volumeMatch[1], 10);
      result.granularityHint = "volume";
    }

    // 匹配节数量
    const sectionMatch = requirement.match(/(\d+)\s*节/);
    if (sectionMatch) {
      result.explicitCount = parseInt(sectionMatch[1], 10);
      result.granularityHint = "section";
    }

    // 匹配条目数量
    const itemMatch = requirement.match(/(\d+)\s*(个|条|项)/);
    if (itemMatch) {
      result.explicitCount = parseInt(itemMatch[1], 10);
      result.granularityHint = "item";
    }

    // 匹配总字数
    const wordMatch = requirement.match(/(\d+)\s*(万|千)?\s*字/);
    if (wordMatch) {
      let words = parseInt(wordMatch[1], 10);
      if (wordMatch[2] === "万") words *= 10000;
      if (wordMatch[2] === "千") words *= 1000;
      result.totalWords = words;
    }

    // 检测歧义
    if (!result.explicitCount && !result.totalWords) {
      result.ambiguous = true;
    }

    return result;
  }

  /**
   * 确定最优粒度
   */
  private determineOptimalGranularity(
    parsed: ReturnType<typeof this.parseRequirement>,
  ): GranularityLevel {
    if (parsed.granularityHint) {
      return parsed.granularityHint;
    }

    if (parsed.totalWords) {
      if (parsed.totalWords >= 50000) return "chapter";
      if (parsed.totalWords >= 10000) return "section";
      return "paragraph";
    }

    // 默认使用章节粒度
    return "chapter";
  }

  /**
   * 检测多单元模式
   */
  private detectMultiUnitPattern(
    title: string,
    level: GranularityLevel,
  ): string | null {
    const patterns: Record<GranularityLevel, RegExp[]> = {
      volume: [/第?\d+-\d+卷/, /前\d+卷/, /后\d+卷/],
      chapter: [
        /第?\d+-\d+章/,
        /前\d+章/,
        /后\d+章/,
        /第.卷/,
        /全部章节/,
        /所有章节/,
      ],
      section: [/第?\d+-\d+节/, /\d+\.\d+-\d+\.\d+/],
      paragraph: [/第?\d+-\d+段/, /多个段落/],
      item: [/第?\d+-\d+[个条项]/, /所有[条项目]/, /全部[条项目]/],
    };

    for (const pattern of patterns[level]) {
      const match = title.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return null;
  }

  /**
   * 提取范围
   */
  private extractRange(
    title: string,
    level: GranularityLevel,
  ): { start: number; end: number } | null {
    const rangePatterns: Record<GranularityLevel, RegExp> = {
      volume: /第?(\d+)-(\d+)卷/,
      chapter: /第?(\d+)-(\d+)章/,
      section: /第?(\d+)-(\d+)节/,
      paragraph: /第?(\d+)-(\d+)段/,
      item: /第?(\d+)-(\d+)[个条项]/,
    };

    const match = title.match(rangePatterns[level]);
    if (match) {
      return {
        start: parseInt(match[1], 10),
        end: parseInt(match[2], 10),
      };
    }

    return null;
  }

  /**
   * 构建单单元标题
   */
  private buildSingleUnitTitle(
    index: number,
    level: GranularityLevel,
    originalTitle: string,
  ): string {
    const unitName = GRANULARITY_NAMES[level];

    // 尝试从原标题提取主题
    const themeMatch = originalTitle.match(/[：:]\s*(.+)$/);
    const theme = themeMatch ? themeMatch[1] : "";

    return `第${index}${unitName}${theme ? `：${theme}` : ""}`;
  }

  /**
   * 构建单单元描述
   */
  private buildSingleUnitDescription(
    index: number,
    level: GranularityLevel,
    originalDescription: string,
  ): string {
    const unitName = GRANULARITY_NAMES[level];
    return `完成第${index}${unitName}的创作。${originalDescription}`;
  }
}
