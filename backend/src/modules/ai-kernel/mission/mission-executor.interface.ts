import type { ProcessId, ProcessSnapshot } from "../process/process.types";

/**
 * Mission Executor Interface
 * Wraps mission orchestration with process lifecycle management
 */
export interface IMissionExecutor {
  /**
   * Execute a mission, creating a tracked process
   */
  execute(options: MissionExecuteOptions): Promise<MissionExecuteResult>;

  /**
   * Cancel a running mission
   */
  cancel(processId: ProcessId): Promise<void>;

  /**
   * Get mission status
   */
  getStatus(processId: ProcessId): Promise<ProcessSnapshot | null>;
}

export interface MissionExecuteOptions {
  userId: string;
  agentId: string;
  teamSessionId?: string;
  input: Record<string, unknown>;
  priority?: number;
  tokenBudget?: number;
  costBudget?: number;
  grantedTools?: string[];
  grantedSkills?: string[];
}

export interface MissionExecuteResult {
  processId: ProcessId;
  process: ProcessSnapshot;
}
