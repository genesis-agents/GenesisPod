import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  ProcessId,
  SpawnOptions,
  ProcessSnapshot,
  ProcessTree,
  ResourceConsumption,
  VALID_TRANSITIONS,
  TERMINAL_STATES,
  ProcessState,
} from "./process.types";

@Injectable()
export class ProcessManagerService {
  private readonly logger = new Logger(ProcessManagerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new AgentProcess record with state CREATED and return its snapshot.
   */
  async spawn(options: SpawnOptions): Promise<ProcessSnapshot> {
    const record = await this.prisma.agentProcess.create({
      data: {
        userId: options.userId,
        agentId: options.agentId,
        parentId: options.parentId ?? null,
        teamSessionId: options.teamSessionId ?? null,
        priority: options.priority ?? 5,
        tokenBudget: options.tokenBudget ?? 50000,
        costBudget: options.costBudget ?? 1.0,
        input: options.input as Prisma.InputJsonValue | undefined,
        grantedTools: options.grantedTools ?? [],
        grantedSkills: options.grantedSkills ?? [],
        dataScope: options.dataScope as Prisma.InputJsonValue | undefined,
        metadata: options.metadata as Prisma.InputJsonValue | undefined,
        state: "CREATED",
      },
    });

    this.logger.log(
      `[spawn] Created process ${record.id} for agent ${options.agentId}`,
    );

    return this.toSnapshot(record);
  }

  /**
   * Fork a child process from an existing parent, inheriting the parent's userId.
   */
  async fork(
    parentId: ProcessId,
    options: Omit<SpawnOptions, "userId">,
  ): Promise<ProcessSnapshot> {
    const parent = await this.prisma.agentProcess.findUniqueOrThrow({
      where: { id: parentId },
    });

    return this.spawn({
      ...options,
      userId: parent.userId,
      parentId,
    });
  }

  /**
   * Retrieve a single process by id, or null if not found.
   */
  async getState(processId: ProcessId): Promise<ProcessSnapshot | null> {
    const record = await this.prisma.agentProcess.findUnique({
      where: { id: processId },
    });

    return record ? this.toSnapshot(record) : null;
  }

  /**
   * List processes owned by a user, optionally filtered to specific states.
   */
  async listByUser(
    userId: string,
    states?: ProcessState[],
  ): Promise<ProcessSnapshot[]> {
    const records = await this.prisma.agentProcess.findMany({
      where: {
        userId,
        ...(states && states.length > 0 ? { state: { in: states } } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return records.map((r) => this.toSnapshot(r));
  }

  /**
   * Recursively build the full process tree rooted at the given processId.
   */
  async getProcessTree(processId: ProcessId): Promise<ProcessTree> {
    const record = await this.prisma.agentProcess.findUniqueOrThrow({
      where: { id: processId },
    });

    const children = await this.prisma.agentProcess.findMany({
      where: { parentId: processId },
    });

    const childTrees = await Promise.all(
      children.map((child) => this.getProcessTree(child.id)),
    );

    return {
      process: this.toSnapshot(record),
      children: childTrees,
    };
  }

  /**
   * Validate and apply a state transition, setting timestamps as appropriate.
   * Throws if the transition is not permitted by VALID_TRANSITIONS.
   */
  async transition(
    processId: ProcessId,
    newState: ProcessState,
  ): Promise<ProcessSnapshot> {
    const current = await this.prisma.agentProcess.findUniqueOrThrow({
      where: { id: processId },
    });

    const allowed = VALID_TRANSITIONS[current.state as ProcessState] ?? [];
    if (!allowed.includes(newState)) {
      throw new Error(
        `Invalid state transition: ${current.state} -> ${newState} for process ${processId}`,
      );
    }

    const now = new Date();
    const updateData: Record<string, unknown> = { state: newState };

    if (newState === "RUNNING") {
      updateData.startedAt = now;
    }

    if (TERMINAL_STATES.includes(newState)) {
      updateData.completedAt = now;
    }

    const updated = await this.prisma.agentProcess.update({
      where: { id: processId },
      data: updateData,
    });

    this.logger.log(
      `[transition] Process ${processId}: ${current.state} -> ${newState}`,
    );

    return this.toSnapshot(updated);
  }

  /**
   * Save checkpoint data with optimistic locking using the version field.
   * Throws "Optimistic lock conflict" if the record was modified concurrently.
   */
  async checkpoint(
    processId: ProcessId,
    data: Record<string, unknown>,
  ): Promise<ProcessSnapshot> {
    const current = await this.prisma.agentProcess.findUniqueOrThrow({
      where: { id: processId },
    });

    const currentVersion = current.version;

    const result = await this.prisma.agentProcess.updateMany({
      where: { id: processId, version: currentVersion },
      data: {
        checkpoint: data as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new Error(
        `Optimistic lock conflict for process ${processId} at version ${currentVersion}`,
      );
    }

    const updated = await this.prisma.agentProcess.findUniqueOrThrow({
      where: { id: processId },
    });

    this.logger.debug(
      `[checkpoint] Process ${processId} saved checkpoint at version ${updated.version}`,
    );

    return this.toSnapshot(updated);
  }

  /**
   * Increment tokensUsed and/or costUsed for a process.
   */
  async consumeResources(
    processId: ProcessId,
    consumption: ResourceConsumption,
  ): Promise<ProcessSnapshot> {
    const updateData: Record<string, unknown> = {};

    if (consumption.tokensUsed !== undefined) {
      updateData.tokensUsed = { increment: consumption.tokensUsed };
    }

    if (consumption.costUsed !== undefined) {
      updateData.costUsed = { increment: consumption.costUsed };
    }

    const updated = await this.prisma.agentProcess.update({
      where: { id: processId },
      data: updateData,
    });

    return this.toSnapshot(updated);
  }

  /**
   * Pause a running process (transitions to PAUSED).
   */
  async pause(processId: ProcessId): Promise<ProcessSnapshot> {
    return this.transition(processId, "PAUSED");
  }

  /**
   * Resume a paused process (transitions to READY).
   */
  async resume(processId: ProcessId): Promise<ProcessSnapshot> {
    return this.transition(processId, "READY");
  }

  /**
   * Cancel a process via the normal state machine.
   */
  async cancel(processId: ProcessId): Promise<ProcessSnapshot> {
    return this.transition(processId, "CANCELLED");
  }

  /**
   * Force-cancel a process regardless of current state (bypass state machine validation).
   */
  async kill(processId: ProcessId): Promise<ProcessSnapshot> {
    const updated = await this.prisma.agentProcess.update({
      where: { id: processId },
      data: {
        state: "CANCELLED",
        completedAt: new Date(),
      },
    });

    this.logger.warn(`[kill] Force-cancelled process ${processId}`);

    return this.toSnapshot(updated);
  }

  /**
   * Poll until the process reaches a terminal state or the timeout elapses.
   * Default timeout is 5 minutes (300 000 ms). Polls every 1 second.
   * Throws if the timeout is exceeded before a terminal state is reached.
   */
  async wait(
    processId: ProcessId,
    timeoutMs: number = 300_000,
  ): Promise<ProcessSnapshot> {
    const deadline = Date.now() + timeoutMs;
    const pollIntervalMs = 1_000;

    while (Date.now() < deadline) {
      const record = await this.prisma.agentProcess.findUniqueOrThrow({
        where: { id: processId },
      });

      if (TERMINAL_STATES.includes(record.state as ProcessState)) {
        return this.toSnapshot(record);
      }

      await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(
      `Process ${processId} did not reach a terminal state within ${timeoutMs}ms`,
    );
  }

  /**
   * Cast a Prisma AgentProcess record to ProcessSnapshot.
   * The field shapes are compatible — just cast via unknown.
   */
  private toSnapshot(record: unknown): ProcessSnapshot {
    return record as ProcessSnapshot;
  }
}
