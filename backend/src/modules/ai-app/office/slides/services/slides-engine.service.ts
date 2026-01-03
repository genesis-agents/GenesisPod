/**
 * Slides Engine Service v4.0
 * 幻灯片生成引擎服务
 *
 * 核心职责：
 * - 通过 AI Engine 的 TeamsService 编排 PPT 生成任务
 * - 事件格式转换（MissionEvent → StreamEvent）
 * - 检查点管理
 * - 导出功能
 *
 * 架构：
 * SlidesEngineService → TeamsService → MissionOrchestrator → slides-team
 */

import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import {
  TeamsService,
  CreateMissionDto,
} from "@/modules/ai-engine/teams/services/teams.service";
import {
  MissionEvent,
  MissionResult,
} from "@/modules/ai-engine/teams/abstractions/mission.interface";
import { BUILTIN_TEAMS } from "@/modules/ai-engine/teams/abstractions/team.interface";
import { CheckpointService } from "../checkpoint/checkpoint.service";
import { SlidesExportService } from "../rendering/slides-export.service";
import {
  CheckpointState,
  StreamEventType,
  StreamEvent,
} from "../checkpoint/checkpoint.types";
import { PageGeneratedEvent } from "../skills/page-pipeline.skill";

/**
 * PPT 生成输入参数
 */
export interface SlidesGenerateInput {
  /** 用户 ID */
  userId: string;

  /** 源文本内容 */
  sourceText: string;

  /** 用户需求描述（可选） */
  userRequirement?: string;

  /** 目标页数（可选，自动推断） */
  targetPages?: number;

  /** 风格偏好 */
  stylePreference?: "dark" | "light";

  /** 主题 ID */
  themeId?: string;

  /** 会话 ID（可选，用于恢复） */
  sessionId?: string;

  /** 目标受众（可选） */
  targetAudience?: string;
}

// Re-export StreamEvent for convenience
export { StreamEvent };

/**
 * 导出选项
 */
export interface ExportOptions {
  format: "pptx" | "pdf" | "png" | "html";
  quality?: "standard" | "high";
}

/**
 * PPT 生成引擎服务
 */
@Injectable()
export class SlidesEngineService {
  private readonly logger = new Logger(SlidesEngineService.name);

  /**
   * 实时页面事件缓冲区
   * 用于存储 PagePipelineSkill 通过 EventEmitter2 发出的页面生成事件
   * 这些事件会在 generateSlides 循环中被提取并发送到 SSE 流
   */
  private readonly pageEventBuffer = new Map<string, StreamEvent[]>();

  constructor(
    private readonly teamsService: TeamsService,
    private readonly checkpointService: CheckpointService,
    private readonly exportService: SlidesExportService,
  ) {}

  /**
   * 监听 PagePipelineSkill 发出的实时页面生成事件
   * 将事件缓存到对应 session 的缓冲区
   */
  @OnEvent("slides.page.generated")
  handlePageGenerated(event: PageGeneratedEvent): void {
    const sessionId = event.sessionId;
    if (!sessionId) {
      this.logger.warn(
        "[handlePageGenerated] Received page event without sessionId",
      );
      return;
    }

    // 创建 slide:generated 事件
    const streamEvent = this.createEvent("slide:generated", sessionId, {
      pageNumber: event.pageNumber,
      totalPages: event.totalPages,
      title: event.title,
      html: event.html,
      templateId: event.templateId,
      contentLength: event.html?.length || 0,
    });

    // 添加到缓冲区
    if (!this.pageEventBuffer.has(sessionId)) {
      this.pageEventBuffer.set(sessionId, []);
    }
    this.pageEventBuffer.get(sessionId)!.push(streamEvent);

    this.logger.log(
      `[handlePageGenerated] Buffered page ${event.pageNumber}/${event.totalPages} for session ${sessionId}`,
    );
  }

  /**
   * 提取并清空指定 session 的缓冲事件
   */
  private flushPageEventBuffer(sessionId: string): StreamEvent[] {
    const events = this.pageEventBuffer.get(sessionId) || [];
    this.pageEventBuffer.delete(sessionId);
    return events;
  }

  /**
   * 生成 PPT（流式）
   * 通过 AI Engine 的 TeamsService 编排
   */
  async *generateSlides(
    input: SlidesGenerateInput,
  ): AsyncGenerator<StreamEvent> {
    this.logger.log(
      `[generateSlides] Starting PPT generation for user ${input.userId}`,
    );

    // 1. 创建或恢复会话
    let sessionId = input.sessionId;
    if (!sessionId) {
      this.logger.log(`[generateSlides] Creating new session...`);
      const session = await this.checkpointService.createSession(
        input.userId,
        input.userRequirement || "PPT 生成",
      );
      sessionId = session.id;
      this.logger.log(`[generateSlides] Session created: ${sessionId}`);
    } else {
      this.logger.log(`[generateSlides] Using existing session: ${sessionId}`);
    }

    // 2. 发送 execution:started 事件
    this.logger.log(
      `[generateSlides] Sending execution:started event for session ${sessionId}`,
    );
    yield this.createEvent("execution:started", sessionId, {
      sessionId,
      sourceLength: input.sourceText?.length || 0,
      targetPages: input.targetPages,
    });
    this.logger.log(`[generateSlides] execution:started event sent`);

    // 3. 构建 Mission 输入
    const missionDto: CreateMissionDto = {
      teamId: BUILTIN_TEAMS.SLIDES,
      goal: this.buildMissionGoal(input),
      context: input.sourceText,
      constraints: {
        quality: {
          depth: "standard",
          accuracy: "prefer_evidence",
          reviewRequired: true,
          minReviewScore: 7,
          maxReworks: 2,
        },
        efficiency: {
          maxDuration: 10 * 60 * 1000, // 10 分钟
          priority: "normal",
          allowParallel: true,
          maxParallelism: 3,
        },
      },
      userId: input.userId,
      sessionId,
      metadata: {
        themeId: input.themeId || "genspark-dark",
        stylePreference: input.stylePreference || "dark",
        targetPages: input.targetPages,
        targetAudience: input.targetAudience,
      },
    };

    // 4. 心跳/缓冲区刷新间隔（不再只是空心跳）
    const BUFFER_FLUSH_INTERVAL_MS = 2000; // 每 2 秒检查一次缓冲区

    try {
      // 5. 执行 Mission（流式）
      this.logger.log(
        `[generateSlides] Starting mission execution for team ${missionDto.teamId}`,
      );
      const generator = this.teamsService.executeMissionStream(missionDto);
      this.logger.log(`[generateSlides] Mission generator created`);

      let currentPhase = "";
      let missionResult: MissionResult | undefined;
      let eventCount = 0;
      let done = false;

      // ★ 使用 Promise.race 实现实时事件推送
      // 每次等待时，要么收到 MissionEvent，要么超时后刷新缓冲区
      const iterator = generator[Symbol.asyncIterator]();

      while (!done) {
        // 创建超时 Promise，用于定期刷新缓冲区
        const timeoutPromise = new Promise<{ timeout: true }>((resolve) =>
          setTimeout(
            () => resolve({ timeout: true }),
            BUFFER_FLUSH_INTERVAL_MS,
          ),
        );

        // 获取下一个 MissionEvent 的 Promise
        const nextEventPromise = iterator.next().then((result) => ({
          timeout: false as const,
          result,
        }));

        // Race: 要么收到事件，要么超时
        const raceResult = await Promise.race([
          nextEventPromise,
          timeoutPromise,
        ]);

        // ★ 无论哪种情况，先刷新缓冲区（实时推送页面事件）
        const bufferedPageEvents = this.flushPageEventBuffer(sessionId);
        for (const pageEvent of bufferedPageEvents) {
          yield pageEvent;
          this.logger.log(
            `[generateSlides] Yielded buffered page event: page ${(pageEvent.data as { pageNumber?: number })?.pageNumber}`,
          );
        }

        if (raceResult.timeout) {
          // 超时：只刷新缓冲区，继续等待
          this.logger.debug(
            `[generateSlides] Buffer flush tick, buffered ${bufferedPageEvents.length} events`,
          );
          continue;
        }

        // 收到 MissionEvent
        const { result } = raceResult;
        if (result.done) {
          done = true;
          continue;
        }

        const event = result.value;
        eventCount++;
        this.logger.log(
          `[generateSlides] Received event #${eventCount}: ${event.type}`,
        );

        // 6. 转换事件格式（可能返回多个事件）
        const streamEvents = this.transformMissionEvent(event, sessionId);
        this.logger.debug(
          `[generateSlides] Transformed to ${streamEvents.length} stream events`,
        );
        for (const streamEvent of streamEvents) {
          this.logger.log(
            `[generateSlides] Yielding stream event: ${streamEvent.type}`,
          );
          yield streamEvent;
        }

        // 7. 跟踪阶段并保存检查点
        if (event.type === "step_started") {
          currentPhase = (event.data as { stepId?: string })?.stepId || "";
          this.logger.debug(`[generateSlides] Phase started: ${currentPhase}`);
        }

        if (event.type === "step_completed") {
          const stepId = (event.data as { stepId?: string })?.stepId;
          if (stepId && this.isCheckpointPhase(stepId)) {
            await this.saveCheckpoint(sessionId, stepId, event.data);
          }
        }

        if (event.type === "mission_completed") {
          missionResult = (event.data as { result?: MissionResult })?.result;
        }
      }

      // 8. 保存最终检查点
      if (missionResult) {
        await this.saveFinalCheckpoint(sessionId, missionResult);
      }

      // 8.5 最后一次刷新缓冲区，确保所有页面事件都已发送
      const finalPageEvents = this.flushPageEventBuffer(sessionId);
      for (const pageEvent of finalPageEvents) {
        yield pageEvent;
        this.logger.log(
          `[generateSlides] Yielded final page event: page ${(pageEvent.data as { pageNumber?: number })?.pageNumber}`,
        );
      }

      // 9. 发送 execution:completed 事件
      const totalPages =
        (missionResult?.deliverables as unknown[])?.length || 0;
      yield this.createEvent("execution:completed", sessionId, {
        totalPages,
        totalTime: missionResult?.duration || 0,
        checkpointId: sessionId, // 使用 sessionId 作为 checkpointId
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `[generateSlides] Error during PPT generation: ${errorMessage}`,
      );
      if (errorStack) {
        this.logger.error(`[generateSlides] Stack trace:\n${errorStack}`);
      }

      yield this.createEvent("execution:failed", sessionId, {
        error: errorMessage,
        phase: "unknown",
        recoverable: false,
      });
    } finally {
      // 清理缓冲区，防止内存泄漏
      this.pageEventBuffer.delete(sessionId);
    }
  }

  /**
   * 获取会话状态
   */
  async getSessionState(sessionId: string): Promise<CheckpointState | null> {
    const checkpoint =
      await this.checkpointService.getLatestCheckpoint(sessionId);
    return checkpoint?.state || null;
  }

  /**
   * 恢复到指定检查点
   */
  async restoreCheckpoint(
    checkpointId: string,
  ): Promise<{ state: CheckpointState; sessionId: string }> {
    return this.checkpointService.restore(checkpointId);
  }

  /**
   * 导出 PPTX
   */
  async exportPptx(sessionId: string): Promise<Buffer> {
    const state = await this.getSessionState(sessionId);
    if (!state) {
      throw new Error(`Session ${sessionId} not found`);
    }
    const result = await this.exportService.exportToPPTX(
      state as unknown as Parameters<typeof this.exportService.exportToPPTX>[0],
    );
    return result.buffer;
  }

  /**
   * 导出 PDF
   */
  async exportPdf(sessionId: string): Promise<Buffer> {
    const state = await this.getSessionState(sessionId);
    if (!state) {
      throw new Error(`Session ${sessionId} not found`);
    }
    const result = await this.exportService.exportToPDF(
      state as unknown as Parameters<typeof this.exportService.exportToPDF>[0],
    );
    return result.buffer;
  }

  /**
   * 重新生成指定页面
   */
  async regeneratePage(
    sessionId: string,
    pageNumber: number,
    _feedback?: string,
  ): Promise<StreamEvent[]> {
    this.logger.log(
      `[regeneratePage] Regenerating page ${pageNumber} for session ${sessionId}`,
    );

    // 获取当前状态
    const state = await this.getSessionState(sessionId);
    if (!state) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // TODO: 实现单页重新生成逻辑
    // 这需要调用特定的技能来重新生成单个页面

    return [];
  }

  // ==================== 私有方法 ====================

  /**
   * 构建任务目标描述
   */
  private buildMissionGoal(input: SlidesGenerateInput): string {
    let goal = "根据提供的内容生成专业的 PPT 演示文稿";

    if (input.targetPages) {
      goal += `，目标 ${input.targetPages} 页`;
    }

    if (input.userRequirement) {
      goal += `。用户需求：${input.userRequirement}`;
    }

    if (input.targetAudience) {
      goal += `。目标受众：${input.targetAudience}`;
    }

    return goal;
  }

  /**
   * 转换 MissionEvent 为 StreamEvent 数组
   * 使用前端期望的事件类型格式
   * 同时发送 phase 事件和对应的 agent 事件
   */
  private transformMissionEvent(
    event: MissionEvent,
    sessionId: string,
  ): StreamEvent[] {
    const data = event.data as Record<string, unknown> | undefined;
    const events: StreamEvent[] = [];

    // 根据不同的事件类型返回不同格式的事件
    switch (event.type) {
      case "mission_started":
        // 注意: execution:started 已在 generateSlides() 开始时发送
        // 这里不再重复发送，避免前端收到两个 "开始生成" 事件
        // 如果需要，可以发送一个内部的 mission 状态事件
        this.logger.debug(
          `[transformMissionEvent] mission_started received, skipping duplicate execution:started`,
        );
        break;

      case "parsing_started":
      case "planning_started":
      case "step_started":
      case "review_started": {
        const stepId = data?.stepId || data?.phase || event.type;
        const phase = this.mapStepToPhase(String(stepId));
        const agent = this.mapPhaseToAgent(phase);
        const agentName = this.getAgentName(agent);

        // 发送 phase:started 事件
        events.push(
          this.createEvent("phase:started", sessionId, {
            phase,
            agent,
            description: this.getPhaseDescription(phase),
          }),
        );

        // 发送 agent:working 事件 - 让 agent 卡片显示工作状态
        events.push(
          this.createEvent("agent:working", sessionId, {
            agent,
            agentName,
            task: this.getPhaseDescription(phase),
            progress: 0,
          }),
        );
        break;
      }

      case "step_progress": {
        const stepId = data?.stepId || "generating";
        const phase = this.mapStepToPhase(String(stepId));
        const agent = this.mapPhaseToAgent(phase);
        const agentName = this.getAgentName(agent);

        events.push(
          this.createEvent("phase:progress", sessionId, {
            phase: stepId,
            progress: data?.progress || 0,
            message: data?.message || "处理中...",
          }),
        );

        // 更新 agent 的工作进度
        events.push(
          this.createEvent("agent:working", sessionId, {
            agent,
            agentName,
            task: (data?.message as string) || "处理中...",
            progress: data?.progress || 0,
          }),
        );
        break;
      }

      case "parsing_completed":
      case "planning_completed":
      case "step_completed":
      case "review_completed": {
        const stepId = data?.stepId || data?.phase || event.type;
        const phase = this.mapStepToPhase(String(stepId));
        const agent = this.mapPhaseToAgent(phase);
        const agentName = this.getAgentName(agent);

        // 发送 agent:completed 事件
        events.push(
          this.createEvent("agent:completed", sessionId, {
            agent,
            agentName,
            result: this.getPhaseCompletedMessage(phase),
            duration: (data?.duration as number) || 0,
          }),
        );

        // 发送 phase:completed 事件
        events.push(
          this.createEvent("phase:completed", sessionId, {
            phase,
            duration: data?.duration || 0,
            result: data?.output,
          }),
        );

        // ★ 关键修复：从 step_completed 事件中提取 HTML 页面并立即发送
        // 当 page-rendering 或 template-rendering 步骤完成时，提取 HTML
        const output = data?.output as Record<string, unknown> | undefined;
        if (output) {
          // 情况 1: output 直接包含 html（单页渲染结果）
          if (output.html && typeof output.html === "string") {
            const pageNumber = (output.pageNumber as number) || 1;
            events.push(
              this.createEvent("slide:generated", sessionId, {
                pageNumber,
                title: (output.title as string) || `第 ${pageNumber} 页`,
                contentLength: (output.html as string).length,
                html: output.html,
              }),
            );
            this.logger.log(
              `[transformMissionEvent] Emitted slide:generated for page ${pageNumber}`,
            );
          }

          // 情况 2: output.skillResults 包含渲染结果（Skill 执行结果）
          const skillResults = output.skillResults as
            | Array<{ skillId: string; result: { data?: unknown } }>
            | undefined;
          if (skillResults && Array.isArray(skillResults)) {
            for (const { skillId, result } of skillResults) {
              if (
                skillId.includes("template-rendering") ||
                skillId.includes("page-rendering")
              ) {
                const renderResult = result?.data as
                  | { html?: string; pageNumber?: number; title?: string }
                  | undefined;
                if (renderResult?.html) {
                  const pageNumber = renderResult.pageNumber || 1;
                  events.push(
                    this.createEvent("slide:generated", sessionId, {
                      pageNumber,
                      title: renderResult.title || `第 ${pageNumber} 页`,
                      contentLength: renderResult.html.length,
                      html: renderResult.html,
                    }),
                  );
                  this.logger.log(
                    `[transformMissionEvent] Emitted slide:generated from skill ${skillId} for page ${pageNumber}`,
                  );
                }
              }
            }
          }

          // 情况 3: output.data 包含 html（嵌套结构）
          const nestedData = output.data as
            | { html?: string; pageNumber?: number; title?: string }
            | undefined;
          if (nestedData?.html && typeof nestedData.html === "string") {
            const pageNumber = nestedData.pageNumber || 1;
            events.push(
              this.createEvent("slide:generated", sessionId, {
                pageNumber,
                title: nestedData.title || `第 ${pageNumber} 页`,
                contentLength: nestedData.html.length,
                html: nestedData.html,
              }),
            );
            this.logger.log(
              `[transformMissionEvent] Emitted slide:generated from nested data for page ${pageNumber}`,
            );
          }

          // 情况 4: PagePipelineSkill 返回 pages[] 数组
          // 检查 skillResults 中的 page-pipeline 结果
          if (skillResults && Array.isArray(skillResults)) {
            for (const { skillId, result } of skillResults) {
              if (skillId.includes("page-pipeline")) {
                const pipelineResult = result?.data as
                  | {
                      pages?: Array<{
                        html?: string;
                        pageNumber?: number;
                        title?: string;
                        templateId?: string;
                        status?: string;
                      }>;
                    }
                  | undefined;

                if (
                  pipelineResult?.pages &&
                  Array.isArray(pipelineResult.pages)
                ) {
                  for (const page of pipelineResult.pages) {
                    if (page.html && page.status === "completed") {
                      events.push(
                        this.createEvent("slide:generated", sessionId, {
                          pageNumber: page.pageNumber || 1,
                          title: page.title || `第 ${page.pageNumber} 页`,
                          contentLength: page.html.length,
                          html: page.html,
                        }),
                      );
                      this.logger.log(
                        `[transformMissionEvent] Emitted slide:generated from PagePipeline for page ${page.pageNumber}`,
                      );
                    }
                  }
                }
              }
            }
          }

          // 情况 5: output.data.pages 直接包含页面数组
          const pagesData = (output.data as { pages?: unknown[] })?.pages;
          if (pagesData && Array.isArray(pagesData)) {
            for (const page of pagesData) {
              const p = page as {
                html?: string;
                pageNumber?: number;
                title?: string;
                status?: string;
              };
              if (p.html && (!p.status || p.status === "completed")) {
                events.push(
                  this.createEvent("slide:generated", sessionId, {
                    pageNumber: p.pageNumber || 1,
                    title: p.title || `第 ${p.pageNumber} 页`,
                    contentLength: p.html.length,
                    html: p.html,
                  }),
                );
                this.logger.log(
                  `[transformMissionEvent] Emitted slide:generated from pages array for page ${p.pageNumber}`,
                );
              }
            }
          }
        }
        break;
      }

      case "deliverable_ready": {
        // deliverable 结构可能是 { deliverable: { ... } } 或直接在 data 里
        const deliverable = (data?.deliverable || data) as Record<
          string,
          unknown
        >;

        // 检查 deliverable.content.outputs 中是否有 HTML 页面
        const content = deliverable?.content as Record<string, unknown>;
        const outputs = content?.outputs as unknown[];

        if (outputs && Array.isArray(outputs)) {
          // 遍历所有输出，提取包含 HTML 的页面
          let pageIndex = 1;
          for (const output of outputs) {
            const outputObj = output as Record<string, unknown>;

            // 检查是否是渲染结果（包含 html 字段）
            if (outputObj?.html && typeof outputObj.html === "string") {
              events.push(
                this.createEvent("slide:generated", sessionId, {
                  pageNumber: (outputObj.pageNumber as number) || pageIndex,
                  title: (outputObj.title as string) || `第 ${pageIndex} 页`,
                  contentLength: (outputObj.html as string).length,
                  html: outputObj.html,
                }),
              );
              this.logger.log(
                `[transformMissionEvent] Extracted slide from deliverable outputs, page ${pageIndex}`,
              );
              pageIndex++;
            }

            // 检查嵌套的 data 字段
            const nestedData = outputObj?.data as Record<string, unknown>;
            if (nestedData?.html && typeof nestedData.html === "string") {
              events.push(
                this.createEvent("slide:generated", sessionId, {
                  pageNumber: (nestedData.pageNumber as number) || pageIndex,
                  title: (nestedData.title as string) || `第 ${pageIndex} 页`,
                  contentLength: (nestedData.html as string).length,
                  html: nestedData.html,
                }),
              );
              this.logger.log(
                `[transformMissionEvent] Extracted slide from nested data, page ${pageIndex}`,
              );
              pageIndex++;
            }
          }
        }

        // 兼容旧格式：直接在 data 里有 html
        if (data?.html && typeof data.html === "string") {
          const pageNumber = (data?.pageNumber as number) || 1;
          events.push(
            this.createEvent("slide:generated", sessionId, {
              pageNumber,
              title: (data?.title as string) || `第 ${pageNumber} 页`,
              contentLength: (data.html as string).length,
              html: data.html,
            }),
          );
        }
        break;
      }

      case "mission_completed":
        // 发送 leader 完成事件（用于 AgentTeamPanel）
        events.push(
          this.createEvent("agent:completed", sessionId, {
            agent: "leader",
            agentName: "Slides Architect",
            result: "PPT 生成完成！",
            duration: (data?.result as { duration?: number })?.duration || 0,
          }),
        );
        // 注意: execution:completed 在 generateSlides() 循环结束后发送
        // 这里不再重复发送，避免前端收到两个 "生成完成" 事件
        this.logger.debug(
          `[transformMissionEvent] mission_completed received, execution:completed will be sent after loop`,
        );
        break;

      case "mission_failed":
        events.push(
          this.createEvent("execution:failed", sessionId, {
            error: (data?.error as string) || "Unknown error",
            phase: "unknown",
            recoverable: false,
          }),
        );
        break;

      default:
        // 未映射的事件类型，忽略
        break;
    }

    return events;
  }

  /**
   * 将 step ID 映射到 phase
   */
  private mapStepToPhase(stepId: string): string {
    const mapping: Record<string, string> = {
      // Workflow 步骤映射
      "task-decomposition": "analyzing",
      "outline-planning": "planning",
      "content-filling": "content_filling", // 内容填充阶段
      "image-generation": "image_generation", // 图片生成阶段
      "page-rendering": "rendering", // 页面渲染阶段
      "batch-review": "reviewing",
      finalize: "completed",
      // 事件类型映射
      parsing_started: "analyzing",
      planning_started: "planning",
      review_started: "reviewing",
    };
    // 如果找不到映射，返回原始 stepId 而不是默认 generating
    return mapping[stepId] || stepId;
  }

  /**
   * 将 phase 映射到 agent role
   */
  private mapPhaseToAgent(
    phase: string,
  ): "leader" | "analyst" | "strategist" | "writer" | "reviewer" {
    const mapping: Record<
      string,
      "leader" | "analyst" | "strategist" | "writer" | "reviewer"
    > = {
      initializing: "leader",
      analyzing: "analyst",
      planning: "strategist",
      content_filling: "writer", // 内容填充由 Writer 负责
      image_generation: "writer", // 图片生成由 Writer/Designer 负责
      rendering: "writer", // 渲染由 Writer 负责
      reviewing: "reviewer",
      completed: "leader",
    };
    return mapping[phase] || "leader";
  }

  /**
   * 获取 phase 描述
   */
  private getPhaseDescription(phase: string): string {
    const descriptions: Record<string, string> = {
      initializing: "正在初始化 AI 团队...",
      analyzing: "正在分析内容结构...",
      planning: "正在规划 PPT 大纲...",
      content_filling: "正在填充页面内容...",
      image_generation: "正在生成配图...",
      rendering: "正在渲染页面 HTML...",
      reviewing: "正在进行质量检查...",
      completed: "生成完成！",
    };
    return descriptions[phase] || `正在执行 ${phase}...`;
  }

  /**
   * 获取 agent 名称
   */
  private getAgentName(
    agent: "leader" | "analyst" | "strategist" | "writer" | "reviewer",
  ): string {
    const names: Record<string, string> = {
      leader: "Slides Architect",
      analyst: "Content Analyst",
      strategist: "Visual Strategist",
      writer: "Content Writer",
      reviewer: "Quality Reviewer",
    };
    return names[agent] || agent;
  }

  /**
   * 获取 phase 完成消息
   */
  private getPhaseCompletedMessage(phase: string): string {
    const messages: Record<string, string> = {
      analyzing: "内容分析完成",
      planning: "大纲规划完成",
      content_filling: "内容填充完成",
      image_generation: "配图生成完成",
      rendering: "页面渲染完成",
      reviewing: "质量检查完成",
      completed: "全部完成",
    };
    return messages[phase] || `${phase} 完成`;
  }

  /**
   * 创建流式事件
   * 使用前端期望的 SlidesTeamEvent 格式
   */
  private createEvent(
    type: StreamEventType,
    executionId: string,
    data: unknown = {},
  ): StreamEvent {
    return {
      type,
      timestamp: new Date().toISOString(),
      executionId,
      data,
    };
  }

  /**
   * 判断是否为需要保存检查点的阶段
   */
  private isCheckpointPhase(stepId: string): boolean {
    const checkpointPhases = [
      "task-decomposition",
      "outline-planning",
      "page-rendering",
      "batch-review",
      "finalize",
    ];
    return checkpointPhases.includes(stepId);
  }

  /**
   * 保存检查点
   */
  private async saveCheckpoint(
    sessionId: string,
    stepId: string,
    data: unknown,
  ): Promise<void> {
    try {
      const checkpointType = this.stepIdToCheckpointType(stepId);
      await this.checkpointService.create({
        sessionId,
        type: checkpointType,
        state: {
          // 从 data 中提取状态
          ...(data as object),
        } as CheckpointState,
        metadata: {
          trigger: "auto",
          description: `Step: ${stepId}`,
        },
      });
      this.logger.debug(`[saveCheckpoint] Saved checkpoint for ${stepId}`);
    } catch (error) {
      this.logger.warn(`[saveCheckpoint] Failed to save checkpoint: ${error}`);
    }
  }

  /**
   * 保存最终检查点
   */
  private async saveFinalCheckpoint(
    sessionId: string,
    result: MissionResult,
  ): Promise<void> {
    try {
      await this.checkpointService.create({
        sessionId,
        type: "batch_rendered",
        state: {
          // 从 result 中提取最终状态
          pages: result.deliverables || [],
        } as unknown as CheckpointState,
        metadata: {
          trigger: "auto",
          description: "Mission completed",
          tokensUsed: result.tokensUsed,
          durationMs: result.duration,
        },
      });
      this.logger.log(`[saveFinalCheckpoint] Saved final checkpoint`);
    } catch (error) {
      this.logger.warn(
        `[saveFinalCheckpoint] Failed to save final checkpoint: ${error}`,
      );
    }
  }

  /**
   * 将步骤 ID 转换为检查点类型
   */
  private stepIdToCheckpointType(
    stepId: string,
  ):
    | "task_decomposition"
    | "outline_confirmed"
    | "page_rendered"
    | "batch_rendered" {
    switch (stepId) {
      case "task-decomposition":
        return "task_decomposition";
      case "outline-planning":
        return "outline_confirmed";
      case "page-rendering":
        return "page_rendered";
      case "batch-review":
      case "finalize":
        return "batch_rendered";
      default:
        return "page_rendered";
    }
  }
}
