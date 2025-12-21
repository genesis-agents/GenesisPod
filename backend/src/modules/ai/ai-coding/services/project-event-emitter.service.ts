/**
 * Project Event Emitter Service
 *
 * 用于发送项目执行进度事件到 WebSocket 客户端
 */

import { Injectable, Logger } from "@nestjs/common";

export interface ProjectProgressEvent {
  projectId: string;
  phase:
    | "init"
    | "pm"
    | "architect"
    | "pm_lead"
    | "engineer"
    | "qa"
    | "document"
    | "complete";
  status: "started" | "progress" | "completed" | "failed";
  progress: number; // 0-100
  message: string;
  data?: unknown;
}

export interface AgentStatusEvent {
  projectId: string;
  agent: "pm" | "architect" | "pmLead" | "engineer" | "qa";
  status: "pending" | "running" | "completed" | "failed";
  message?: string;
  output?: unknown;
}

type EmitHandler = (
  projectId: string,
  event: string,
  data: unknown,
) => Promise<void>;

@Injectable()
export class ProjectEventEmitterService {
  private readonly logger = new Logger(ProjectEventEmitterService.name);
  private emitHandler: EmitHandler | null = null;

  /**
   * 注册 emit 处理器（由 Gateway 调用）
   */
  registerEmitHandler(handler: EmitHandler): void {
    this.emitHandler = handler;
    this.logger.log("Emit handler registered");
  }

  /**
   * 发送项目进度事件
   */
  async emitProgress(event: ProjectProgressEvent): Promise<void> {
    if (!this.emitHandler) {
      this.logger.debug("No emit handler registered, skipping emit");
      return;
    }

    try {
      await this.emitHandler(event.projectId, "project:progress", event);
      this.logger.debug(
        `Emitted progress: ${event.phase} - ${event.status} (${event.progress}%)`,
      );
    } catch (error) {
      this.logger.error("Failed to emit progress event", error);
    }
  }

  /**
   * 发送 Agent 状态更新事件
   */
  async emitAgentStatus(event: AgentStatusEvent): Promise<void> {
    if (!this.emitHandler) {
      this.logger.debug("No emit handler registered, skipping emit");
      return;
    }

    try {
      await this.emitHandler(event.projectId, "agent:status", event);
      this.logger.debug(
        `Emitted agent status: ${event.agent} - ${event.status}`,
      );
    } catch (error) {
      this.logger.error("Failed to emit agent status event", error);
    }
  }

  /**
   * 发送项目完成事件
   */
  async emitComplete(
    projectId: string,
    success: boolean,
    result?: unknown,
  ): Promise<void> {
    if (!this.emitHandler) {
      return;
    }

    try {
      await this.emitHandler(projectId, "project:complete", {
        projectId,
        success,
        result,
        timestamp: new Date().toISOString(),
      });
      this.logger.log(`Project ${projectId} completed: success=${success}`);
    } catch (error) {
      this.logger.error("Failed to emit complete event", error);
    }
  }

  /**
   * 发送错误事件
   */
  async emitError(
    projectId: string,
    error: string,
    phase?: string,
  ): Promise<void> {
    if (!this.emitHandler) {
      return;
    }

    try {
      await this.emitHandler(projectId, "project:error", {
        projectId,
        error,
        phase,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.error("Failed to emit error event", err);
    }
  }
}
