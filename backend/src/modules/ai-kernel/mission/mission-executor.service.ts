/**
 * Mission Executor Service
 * Wraps MissionOrchestrator with process lifecycle management.
 * Does NOT rewrite the orchestrator — delegates to it while adding
 * process tracking, event journaling, and resource management.
 */
import { Injectable, Logger } from "@nestjs/common";
import { ProcessManagerService } from "../process/process-manager.service";
import { EventJournalService } from "../journal/event-journal.service";
import type { ProcessId } from "../process/process.types";
import type {
  IMissionExecutor,
  MissionExecuteOptions,
  MissionExecuteResult,
} from "./mission-executor.interface";

@Injectable()
export class MissionExecutorService implements IMissionExecutor {
  private readonly logger = new Logger(MissionExecutorService.name);

  constructor(
    private readonly processManager: ProcessManagerService,
    private readonly eventJournal: EventJournalService,
  ) {}

  /**
   * Execute a mission with full process lifecycle tracking.
   *
   * Flow:
   * 1. Spawn AgentProcess (state: CREATED)
   * 2. Transition to READY
   * 3. Transition to RUNNING
   * 4. Record events via EventJournal
   * 5. On completion: transition to COMPLETED
   * 6. On error: transition to FAILED
   */
  async execute(options: MissionExecuteOptions): Promise<MissionExecuteResult> {
    // 1. Create process record
    const process = await this.processManager.spawn({
      userId: options.userId,
      agentId: options.agentId,
      teamSessionId: options.teamSessionId,
      priority: options.priority,
      tokenBudget: options.tokenBudget,
      costBudget: options.costBudget,
      input: options.input,
      grantedTools: options.grantedTools,
      grantedSkills: options.grantedSkills,
    });

    const processId = process.id;

    // 2. Record spawn event
    await this.eventJournal.record(processId, "process:spawned", {
      agentId: options.agentId,
      teamSessionId: options.teamSessionId,
    });

    // 3. Transition to READY then RUNNING
    await this.processManager.transition(processId, "READY");
    const runningProcess = await this.processManager.transition(
      processId,
      "RUNNING",
    );

    await this.eventJournal.record(processId, "process:started");

    this.logger.log(
      `Mission process ${processId} started for agent ${options.agentId}`,
    );

    return {
      processId,
      process: runningProcess,
    };
  }

  /**
   * Mark a mission process as completed
   */
  async complete(
    processId: ProcessId,
    output?: Record<string, unknown>,
  ): Promise<void> {
    if (output) {
      await this.processManager.checkpoint(processId, output);
    }
    await this.processManager.transition(processId, "COMPLETED");
    await this.eventJournal.record(processId, "process:completed", { output });
    this.logger.log(`Mission process ${processId} completed`);
  }

  /**
   * Mark a mission process as failed
   */
  async fail(processId: ProcessId, error: string): Promise<void> {
    try {
      await this.processManager.transition(processId, "FAILED");
    } catch {
      // Process might already be in terminal state
      this.logger.warn(`Could not transition process ${processId} to FAILED`);
    }
    await this.eventJournal.record(processId, "process:failed", { error });
    this.logger.error(`Mission process ${processId} failed: ${error}`);
  }

  /**
   * Cancel a running mission
   */
  async cancel(processId: ProcessId): Promise<void> {
    await this.processManager.cancel(processId);
    await this.eventJournal.record(processId, "process:cancelled");
    this.logger.log(`Mission process ${processId} cancelled`);
  }

  /**
   * Get mission process status
   */
  async getStatus(processId: ProcessId) {
    return this.processManager.getState(processId);
  }
}
