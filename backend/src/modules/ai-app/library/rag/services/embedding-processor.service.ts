/**
 * Embedding Processor Service
 * Business-level service for generating and storing embeddings
 *
 * Uses AI Engine's EmbeddingService for generation and VectorService for storage.
 *
 * 2026-05-12: 实时进度 + 429 熔断自动恢复 + 失败上抛
 * - 每个 batch 完成后写 KnowledgeBase.progressJson，前端 2s 轮询可见 X/N + cooldown
 * - circuit-open 错误（embedding 服务 60s 冷却）→ 等到 cooldown 过期重试同一 batch 一次
 * - 历史问题：catch 静默吞错 + 后续 batch 都被熔断 → generatedCount=0 → KB 假 READY
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { RAGFacade } from "@/modules/ai-harness/facade";
import { MissionExecutorService } from "@/modules/ai-harness/facade";
import { AiModelConfigService } from "@/modules/ai-engine/facade";
import { LruMap } from "@/common/utils/lru-map";

const BATCH_SIZE = 50;
const COOLDOWN_RETRY_BUFFER_MS = 500; // 醒来再多等 500ms 让熔断器闭合
const COOLDOWN_MAX_WAIT_MS = 90_000; // 最长等 90s, 超过认为上游问题不重试

/**
 * Provider 启发式 RPM 默认（仅当用户 UserModelConfig.rpmLimit 未配时用）
 * 数值取保守 free tier 估计——用户可在 BYOK 配置 UI 显式覆盖。
 * 2026-05-12: gemini free tier embedding 仅 5 RPM，被 155 chunks 打爆触发本次修复
 */
const PROVIDER_RPM_HEURISTIC: Record<string, number> = {
  google: 5, // gemini-embedding-001 free tier
  gemini: 5,
  openai: 1500, // tier 1 paid，保守取一半
  voyage: 300,
  cohere: 100,
  anthropic: 1000,
};
const FALLBACK_RPM = 60; // provider 不认识时的兜底，平均 1s/请求

/**
 * KB 向量化进度形状（写入 KnowledgeBase.progressJson）
 * stage:
 *   - 'embedding': 正常进度中
 *   - 'cooling':   碰到 circuit-open, 正等 cooldown 然后重试 batch
 */
export interface KbVectorizeProgress {
  stage: "embedding" | "cooling" | "throttling";
  processed: number; // 已成功向量化的 chunk 数
  total: number; // 本次需要向量化的 chunk 数
  startedAt: string; // ISO
  cooldownUntil?: string; // ISO, 仅 stage='cooling' 时存在
  nextBatchAt?: string; // ISO, 仅 stage='throttling' 时存在（按 RPM 节流等待）
  rpmLimit?: number; // 当前生效的 RPM 限制（用于前端展示"按 X RPM 节流"）
  lastError?: string;
}

export interface EmbedKbResult {
  generatedCount: number;
  totalNeeded: number;
  failedBatches: number;
  lastError?: string;
}

@Injectable()
export class EmbeddingProcessorService {
  private readonly logger = new Logger(EmbeddingProcessorService.name);
  private readonly kernelProcessIds = new LruMap<string, string>(500);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiModelConfig: AiModelConfigService,
    @Optional() private readonly ragFacade?: RAGFacade,
    @Optional() private readonly missionExecutor?: MissionExecutorService,
  ) {}

  /**
   * 计算 batch 间最小间隔（按 rpmLimit 自适应限速）
   * - userId 上下文：走 pickBYOKModelForUser 拿 rpmLimit
   * - rpmLimit=null → 按 provider 启发式默认
   * - rpmLimit=0 / negative → 不限速
   */
  private async resolveRpmInterval(
    userId: string | undefined,
  ): Promise<{ minIntervalMs: number; rpmLimit: number; provider: string }> {
    const picked = await this.aiModelConfig
      .pickBYOKModelForUser("EMBEDDING", userId)
      .catch(() => null);
    const provider = (picked?.provider ?? "openai").toLowerCase();
    const userRpm = picked?.rpmLimit;
    const heuristic =
      PROVIDER_RPM_HEURISTIC[provider] ??
      PROVIDER_RPM_HEURISTIC[provider.split(/[-_]/)[0]] ??
      FALLBACK_RPM;
    const rpmLimit = userRpm && userRpm > 0 ? userRpm : heuristic;
    const minIntervalMs = Math.ceil(60_000 / rpmLimit);
    return { minIntervalMs, rpmLimit, provider };
  }

  /**
   * Generate embeddings for all child chunks in a knowledge base that don't have embeddings yet.
   *
   * 返回结构化结果（不再是 number），调用方需依此判定 READY / ERROR / PARTIAL。
   */
  async generateEmbeddingsForKnowledgeBase(
    knowledgeBaseId: string,
    userId?: string,
  ): Promise<EmbedKbResult> {
    this.logger.log(
      `Generating embeddings for knowledge base: ${knowledgeBaseId}`,
    );

    // Spawn AI Kernel process for cost tracking
    if (this.missionExecutor && userId) {
      try {
        const kernelResult = await this.missionExecutor.execute({
          userId,
          agentId: "rag-processor",
          teamSessionId: knowledgeBaseId,
          input: { knowledgeBaseId },
        });
        this.kernelProcessIds.set(knowledgeBaseId, kernelResult.processId);
      } catch (err) {
        this.logger.warn(
          `[Kernel] Failed to spawn process: ${(err as Error).message}`,
        );
      }
    }

    // Find all child chunks without embeddings for this KB
    const chunksWithoutEmbeddings = await this.prisma.childChunk.findMany({
      where: {
        parentChunk: {
          document: {
            knowledgeBaseId,
          },
        },
        embeddings: { none: {} },
      },
      select: {
        id: true,
        content: true,
      },
    });

    const totalNeeded = chunksWithoutEmbeddings.length;

    if (totalNeeded === 0) {
      this.logger.log(`No chunks need embeddings for KB ${knowledgeBaseId}`);
      await this.clearProgress(knowledgeBaseId);
      this.completeKernelProcess(knowledgeBaseId, { generatedCount: 0 });
      return { generatedCount: 0, totalNeeded: 0, failedBatches: 0 };
    }

    this.logger.log(`Found ${totalNeeded} chunks needing embeddings`);

    const startedAt = new Date().toISOString();
    let generatedCount = 0;
    let failedBatches = 0;
    let lastError: string | undefined;

    // 自适应限速：按 rpmLimit 计算 batch 间最小间隔
    const { minIntervalMs, rpmLimit, provider } =
      await this.resolveRpmInterval(userId);
    this.logger.log(
      `[embedding] throttle: ${rpmLimit} RPM (provider=${provider}, minInterval=${minIntervalMs}ms)`,
    );

    await this.writeProgress(knowledgeBaseId, {
      stage: "embedding",
      processed: 0,
      total: totalNeeded,
      startedAt,
      rpmLimit,
    });

    const model = await this.ragFacade!.embedding!.getModel();
    let lastBatchAt = 0; // 上一次 batch 完成的时间戳

    for (let i = 0; i < totalNeeded; i += BATCH_SIZE) {
      // 节流：本次 batch 距上次至少 minIntervalMs
      if (lastBatchAt > 0) {
        const elapsed = Date.now() - lastBatchAt;
        const waitMs = minIntervalMs - elapsed;
        if (waitMs > 0) {
          const nextBatchAt = new Date(Date.now() + waitMs).toISOString();
          this.logger.debug(
            `[embedding] throttling batch ${Math.floor(i / BATCH_SIZE) + 1}: wait ${waitMs}ms (RPM=${rpmLimit})`,
          );
          await this.writeProgress(knowledgeBaseId, {
            stage: "throttling",
            processed: generatedCount,
            total: totalNeeded,
            startedAt,
            nextBatchAt,
            rpmLimit,
            lastError,
          });
          await this.sleep(waitMs);
        }
      }

      const batch = chunksWithoutEmbeddings.slice(i, i + BATCH_SIZE);
      const texts = batch.map((chunk) => chunk.content);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      // 单 batch 最多两次：首次失败 → circuit-open 或 429 → 等 cooldown → 二次
      let retried = false;
      while (true) {
        // ★ 2026-05-12: lastBatchAt 必须在调用前记录，否则失败 batch 不算 RPM
        //   消耗，下一个 batch 立即开火 → 5 RPM 上限直接打爆触发 circuit-open。
        //   placement 见 catch 路径——失败也算消耗了 quota。
        lastBatchAt = Date.now();
        try {
          const embeddingResult =
            await this.ragFacade!.embedding!.generateEmbeddings(texts);

          for (let j = 0; j < batch.length; j++) {
            const chunk = batch[j];
            const embedding = embeddingResult.embeddings[j];
            if (embedding && embedding.length > 0) {
              await this.ragFacade!.vector!.storeEmbedding(
                chunk.id,
                embedding,
                model,
              );
              generatedCount++;
            }
          }

          await this.writeProgress(knowledgeBaseId, {
            stage: "embedding",
            processed: generatedCount,
            total: totalNeeded,
            startedAt,
            rpmLimit,
            lastError,
          });
          this.logger.debug(
            `Batch ${batchNum}: ${batch.length} processed, total ${generatedCount}/${totalNeeded}`,
          );
          break;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          const cooldownIso = this.extractCircuitOpenCooldown(msg);
          const is429 = /429|rate.?limit|too many requests/i.test(msg);

          // ★ 2026-05-12: 不只 circuit-open 重试，普通 429 也重试一次。
          //   gemini free tier 5 RPM 在 EmbeddingService 内 3 次重试就能把
          //   quota 打爆，但 circuit-open 阈值是 5 次 → 前 2 个 batch（共 5-6
          //   次 429）会被吞掉无重试。429 重试用 max(minInterval, 60s) 等
          //   quota window 滚一圈。
          if (!retried && (cooldownIso || is429)) {
            retried = true;
            let waitMs: number;
            let cooldownUntil: string;
            if (cooldownIso) {
              const cd = Math.max(
                0,
                new Date(cooldownIso).getTime() - Date.now(),
              );
              waitMs = Math.min(
                cd + COOLDOWN_RETRY_BUFFER_MS,
                COOLDOWN_MAX_WAIT_MS,
              );
              cooldownUntil = cooldownIso;
            } else {
              // 普通 429: 等 60s 让 upstream rate-limit window 完整滚一圈
              waitMs = Math.min(60_000, COOLDOWN_MAX_WAIT_MS);
              cooldownUntil = new Date(Date.now() + waitMs).toISOString();
            }
            this.logger.warn(
              `[embedding] batch ${batchNum} ${cooldownIso ? "circuit-open" : "429"}, waiting ${waitMs}ms`,
            );
            await this.writeProgress(knowledgeBaseId, {
              stage: "cooling",
              processed: generatedCount,
              total: totalNeeded,
              startedAt,
              cooldownUntil,
              rpmLimit,
              lastError: msg,
            });
            await this.sleep(waitMs);
            continue;
          }

          failedBatches++;
          lastError = msg;
          this.logger.error(
            `Failed to generate embeddings for batch ${batchNum}: ${msg}`,
          );
          await this.writeProgress(knowledgeBaseId, {
            stage: "embedding",
            processed: generatedCount,
            total: totalNeeded,
            startedAt,
            rpmLimit,
            lastError,
          });
          break;
        }
      }
    }

    this.logger.log(
      `KB ${knowledgeBaseId}: generated ${generatedCount}/${totalNeeded} embeddings, failedBatches=${failedBatches}`,
    );

    await this.clearProgress(knowledgeBaseId);

    this.completeKernelProcess(knowledgeBaseId, {
      generatedCount,
      totalChunks: totalNeeded,
    });

    return { generatedCount, totalNeeded, failedBatches, lastError };
  }

  /**
   * Generate embeddings for a single document
   */
  async generateEmbeddingsForDocument(
    documentId: string,
    userId?: string,
  ): Promise<number> {
    this.logger.log(`Generating embeddings for document: ${documentId}`);

    // Spawn AI Kernel process for cost tracking
    if (this.missionExecutor && userId) {
      try {
        const kernelResult = await this.missionExecutor.execute({
          userId,
          agentId: "rag-processor",
          teamSessionId: documentId,
          input: { documentId },
        });
        this.kernelProcessIds.set(documentId, kernelResult.processId);
      } catch (err) {
        this.logger.warn(
          `[Kernel] Failed to spawn process: ${(err as Error).message}`,
        );
      }
    }

    const chunksWithoutEmbeddings = await this.prisma.childChunk.findMany({
      where: {
        parentChunk: {
          documentId,
        },
        embeddings: { none: {} },
      },
      select: {
        id: true,
        content: true,
      },
    });

    if (chunksWithoutEmbeddings.length === 0) {
      this.logger.log(`No chunks need embeddings for document ${documentId}`);
      this.completeKernelProcess(documentId, { generatedCount: 0 });
      return 0;
    }

    const texts = chunksWithoutEmbeddings.map((chunk) => chunk.content);
    const model = await this.ragFacade!.embedding!.getModel();

    try {
      const embeddingResult =
        await this.ragFacade!.embedding!.generateEmbeddings(texts);

      let generatedCount = 0;
      for (let i = 0; i < chunksWithoutEmbeddings.length; i++) {
        const chunk = chunksWithoutEmbeddings[i];
        const embedding = embeddingResult.embeddings[i];

        if (embedding && embedding.length > 0) {
          await this.ragFacade!.vector!.storeEmbedding(
            chunk.id,
            embedding,
            model,
          );
          generatedCount++;
        }
      }

      // Complete AI Kernel process
      this.completeKernelProcess(documentId, {
        generatedCount,
        totalChunks: chunksWithoutEmbeddings.length,
      });

      return generatedCount;
    } catch (error) {
      this.logger.error(
        `Failed to generate embeddings for document ${documentId}: ${error}`,
      );
      // Fail AI Kernel process
      this.failKernelProcess(
        documentId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * 从 "circuit-open ... cooldown until <ISO>" 错误消息提取 ISO 时间戳
   * 例：Embedding circuit-open (0 recent 429s). Upstream rate-limit cooldown until 2026-05-11T21:28:45.615Z
   */
  private extractCircuitOpenCooldown(msg: string): string | undefined {
    const match = msg.match(
      /cooldown until (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/i,
    );
    return match?.[1];
  }

  private async writeProgress(
    knowledgeBaseId: string,
    progress: KbVectorizeProgress,
  ): Promise<void> {
    try {
      await this.prisma.knowledgeBase.update({
        where: { id: knowledgeBaseId },
        data: { progressJson: progress as unknown as Prisma.InputJsonValue },
      });
    } catch (err) {
      // 进度写失败不应阻塞向量化主流程（哪怕 KB 在并发中被删了也只是日志）
      this.logger.warn(
        `Failed to write progress for KB ${knowledgeBaseId}: ${(err as Error).message}`,
      );
    }
  }

  private async clearProgress(knowledgeBaseId: string): Promise<void> {
    try {
      await this.prisma.knowledgeBase.update({
        where: { id: knowledgeBaseId },
        data: { progressJson: Prisma.JsonNull },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to clear progress for KB ${knowledgeBaseId}: ${(err as Error).message}`,
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private completeKernelProcess(
    entityId: string,
    output?: Record<string, unknown>,
  ): void {
    const processId = this.kernelProcessIds.get(entityId);
    if (!processId || !this.missionExecutor) return;
    void this.missionExecutor
      .complete(processId, output)
      .catch((err) =>
        this.logger.warn(
          `[Kernel] Failed to complete process: ${(err as Error).message}`,
        ),
      );
    this.kernelProcessIds.delete(entityId);
  }

  private failKernelProcess(entityId: string, error: string): void {
    const processId = this.kernelProcessIds.get(entityId);
    if (!processId || !this.missionExecutor) return;
    void this.missionExecutor
      .fail(processId, error)
      .catch((err) =>
        this.logger.warn(
          `[Kernel] Failed to fail process: ${(err as Error).message}`,
        ),
      );
    this.kernelProcessIds.delete(entityId);
  }
}
