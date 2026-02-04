/**
 * Self-Consistency Service
 *
 * P1 优化：自一致性验证服务
 * 参考：Self-Consistency (Wang et al., 2022)
 *
 * 功能：
 * 1. 生成多条独立推理路径
 * 2. 分析路径间的一致性
 * 3. 聚合多数结论
 * 4. 识别需要人工审核的分歧
 */

import { Injectable, Logger } from "@nestjs/common";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { extractJsonFromAIResponse } from "@/common/utils/json-extraction.utils";
import {
  ReasoningPath,
  ConsistencyCheckResult,
  SelfConsistencyConfig,
  DEFAULT_SELF_CONSISTENCY_CONFIG,
} from "../../types/quality-enhancement.types";

export interface SelfConsistencyRequest {
  question: string;
  context: {
    topicName: string;
    dimensionName: string;
    evidences: Array<{
      id: string;
      content: string;
      source: string;
    }>;
  };
  config?: Partial<SelfConsistencyConfig>;
}

@Injectable()
export class SelfConsistencyService {
  private readonly logger = new Logger(SelfConsistencyService.name);

  constructor(private readonly aiFacade: AIEngineFacade) {}

  /**
   * 执行自一致性检查
   */
  async checkConsistency(
    request: SelfConsistencyRequest,
  ): Promise<ConsistencyCheckResult> {
    const startTime = Date.now();
    const config = { ...DEFAULT_SELF_CONSISTENCY_CONFIG, ...request.config };

    this.logger.log(
      `[checkConsistency] Starting for: ${request.question.substring(0, 50)}...`,
    );

    // 1. 生成多条推理路径
    const paths = await this.generateReasoningPaths(request, config);

    // 2. 分析一致性
    const result = await this.analyzeConsistency(
      paths,
      request.question,
      config,
    );

    this.logger.log(
      `[checkConsistency] Completed in ${Date.now() - startTime}ms, ` +
        `agreement rate: ${result.agreementRate.toFixed(2)}`,
    );

    return result;
  }

  /**
   * 生成多条独立推理路径
   */
  private async generateReasoningPaths(
    request: SelfConsistencyRequest,
    config: SelfConsistencyConfig,
  ): Promise<ReasoningPath[]> {
    const { numPaths, temperatureRange } = config;
    const paths: ReasoningPath[] = [];

    // 计算每条路径的 temperature
    const temperatures = this.calculateTemperatures(
      numPaths,
      temperatureRange.min,
      temperatureRange.max,
    );

    // 构建证据上下文
    const evidenceContext = request.context.evidences
      .map((e, i) => `[证据 ${i + 1}] (来源: ${e.source})\n${e.content}`)
      .join("\n\n");

    // 并行生成推理路径
    const pathPromises = temperatures.map(async (temp, index) => {
      const pathId = `path-${index + 1}`;

      const prompt = `你是一个严谨的分析师。请基于以下证据，独立分析并回答问题。

## 研究背景
- 主题：${request.context.topicName}
- 维度：${request.context.dimensionName}

## 问题
${request.question}

## 可用证据
${evidenceContext}

## 要求
1. 仔细分析每条证据
2. 展示你的推理过程
3. 得出明确的结论
4. 评估你的置信度

## 输出格式（JSON）
{
  "reasoning": "详细的推理过程（200-500字）",
  "conclusion": "简洁明确的结论（50-100字）",
  "confidence": 0.85,
  "keySteps": ["推理步骤1", "推理步骤2", "推理步骤3"],
  "evidenceUsed": ["证据1的关键点", "证据2的关键点"]
}

只输出 JSON。`;

      try {
        // ★ Major Fix: 实际传递 temperature 参数以实现多样性推理路径
        // 通过 taskProfile.creativity 映射 temperature:
        // - deterministic (0.1), low (0.3), medium (0.7), high (0.9)
        // 根据计算出的 temp 值选择合适的 creativity 级别
        const creativityLevel =
          temp <= 0.2
            ? ("deterministic" as const)
            : temp <= 0.4
              ? ("low" as const)
              : temp <= 0.7
                ? ("medium" as const)
                : ("high" as const);

        const response = await this.aiFacade.chat({
          messages: [{ role: "user", content: prompt }],
          taskProfile: { creativity: creativityLevel, outputLength: "medium" },
        });

        const result = extractJsonFromAIResponse<{
          reasoning: string;
          conclusion: string;
          confidence: number;
          keySteps: string[];
          evidenceUsed: string[];
        }>(response.content);

        if (result.success && result.data) {
          return {
            id: pathId,
            reasoning: result.data.reasoning,
            conclusion: result.data.conclusion,
            confidence: Math.max(0, Math.min(1, result.data.confidence || 0.5)),
            keySteps: result.data.keySteps || [],
            evidenceUsed: result.data.evidenceUsed || [],
            temperature: temp,
            generatedAt: new Date(),
          };
        }
      } catch (error) {
        this.logger.warn(
          `[generateReasoningPaths] Path ${pathId} failed: ${error}`,
        );
      }

      return null;
    });

    const results = await Promise.all(pathPromises);

    for (const path of results) {
      if (path) {
        paths.push(path);
      }
    }

    this.logger.log(
      `[generateReasoningPaths] Generated ${paths.length}/${numPaths} paths`,
    );

    return paths;
  }

  /**
   * 分析推理路径一致性
   */
  private async analyzeConsistency(
    paths: ReasoningPath[],
    question: string,
    config: SelfConsistencyConfig,
  ): Promise<ConsistencyCheckResult> {
    if (paths.length === 0) {
      return this.createEmptyResult(config);
    }

    if (paths.length === 1) {
      return this.createSinglePathResult(paths[0], config);
    }

    // 使用 AI 分析结论一致性
    const conclusionsText = paths
      .map(
        (p, i) =>
          `路径 ${i + 1}（置信度 ${p.confidence.toFixed(2)}）: ${p.conclusion}`,
      )
      .join("\n");

    const prompt = `分析以下多条独立推理路径的结论一致性。

## 问题
${question}

## 各路径结论
${conclusionsText}

## 任务
1. 判断各结论是否一致
2. 识别多数观点
3. 识别异议观点
4. 综合所有观点形成最终结论

## 输出格式（JSON）
{
  "agreementRate": 0.8,
  "majorityConclusion": "多数路径的共识结论",
  "clusters": [
    {
      "theme": "观点类别描述",
      "pathIndices": [0, 1, 2],
      "isMajority": true,
      "representativeConclusion": "该类别的代表性结论"
    }
  ],
  "synthesizedConclusion": "综合所有观点的最终结论",
  "needsHumanReview": false,
  "reviewReasons": []
}

只输出 JSON。`;

    try {
      const response = await this.aiFacade.chat({
        messages: [{ role: "user", content: prompt }],
        taskProfile: { creativity: "low", outputLength: "medium" },
      });

      const result = extractJsonFromAIResponse<{
        agreementRate: number;
        majorityConclusion: string;
        clusters: Array<{
          theme: string;
          pathIndices: number[];
          isMajority: boolean;
          representativeConclusion: string;
        }>;
        synthesizedConclusion: string;
        needsHumanReview: boolean;
        reviewReasons: string[];
      }>(response.content);

      if (result.success && result.data) {
        const agreementRate = Math.max(
          0,
          Math.min(1, result.data.agreementRate),
        );
        const isConsistent = agreementRate >= config.consistencyThreshold;
        const needsHumanReview =
          result.data.needsHumanReview ||
          agreementRate < config.humanReviewThreshold;

        // 识别异议路径
        const dissidentPaths = paths.filter((_, index) => {
          const cluster = result.data!.clusters.find((c) =>
            c.pathIndices.includes(index),
          );
          return cluster && !cluster.isMajority;
        });

        return {
          paths,
          majorityConclusion: result.data.majorityConclusion,
          agreementRate,
          isConsistent,
          dissidentPaths,
          synthesizedConclusion: isConsistent
            ? result.data.majorityConclusion
            : result.data.synthesizedConclusion,
          clusters: result.data.clusters.map((c) => ({
            theme: c.theme,
            pathIds: c.pathIndices.map((i) => paths[i]?.id || `path-${i + 1}`),
            isMajority: c.isMajority,
            representativeConclusion: c.representativeConclusion,
          })),
          needsHumanReview,
          reviewReasons: result.data.reviewReasons,
        };
      }
    } catch (error) {
      this.logger.error(`[analyzeConsistency] Error: ${error}`);
    }

    // 回退：简单多数投票
    return this.simpleMajorityVote(paths, config);
  }

  /**
   * 简单多数投票（回退方案）
   */
  private simpleMajorityVote(
    paths: ReasoningPath[],
    config: SelfConsistencyConfig,
  ): ConsistencyCheckResult {
    // 选择置信度最高的路径作为代表
    const sortedPaths = [...paths].sort((a, b) => b.confidence - a.confidence);
    const majorityPath = sortedPaths[0];

    // 假设简单一致性（保守估计）
    const agreementRate = 0.6;

    return {
      paths,
      majorityConclusion: majorityPath.conclusion,
      agreementRate,
      isConsistent: agreementRate >= config.consistencyThreshold,
      dissidentPaths: [],
      synthesizedConclusion: majorityPath.conclusion,
      clusters: [
        {
          theme: "主要观点",
          pathIds: paths.map((p) => p.id),
          isMajority: true,
          representativeConclusion: majorityPath.conclusion,
        },
      ],
      needsHumanReview: true,
      reviewReasons: ["自动分析失败，建议人工审核"],
    };
  }

  /**
   * 创建空结果
   */
  private createEmptyResult(
    _config: SelfConsistencyConfig,
  ): ConsistencyCheckResult {
    return {
      paths: [],
      majorityConclusion: "",
      agreementRate: 0,
      isConsistent: false,
      dissidentPaths: [],
      synthesizedConclusion: "",
      clusters: [],
      needsHumanReview: true,
      reviewReasons: ["未能生成任何推理路径"],
    };
  }

  /**
   * 创建单路径结果
   */
  private createSinglePathResult(
    path: ReasoningPath,
    config: SelfConsistencyConfig,
  ): ConsistencyCheckResult {
    return {
      paths: [path],
      majorityConclusion: path.conclusion,
      agreementRate: 1,
      isConsistent: true,
      dissidentPaths: [],
      synthesizedConclusion: path.conclusion,
      clusters: [
        {
          theme: "唯一观点",
          pathIds: [path.id],
          isMajority: true,
          representativeConclusion: path.conclusion,
        },
      ],
      needsHumanReview: path.confidence < config.humanReviewThreshold,
      reviewReasons:
        path.confidence < config.humanReviewThreshold
          ? ["单路径置信度较低"]
          : undefined,
    };
  }

  /**
   * 计算温度序列
   */
  private calculateTemperatures(
    count: number,
    min: number,
    max: number,
  ): number[] {
    if (count === 1) return [(min + max) / 2];

    const step = (max - min) / (count - 1);
    return Array.from({ length: count }, (_, i) => min + i * step);
  }
}
