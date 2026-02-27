/**
 * Kernel API Service
 * Unified entry point for AI Kernel capabilities.
 * Aggregates process management, memory, resources, and event journal.
 */
import { Injectable } from "@nestjs/common";
import { ProcessManagerService } from "../process/process-manager.service";
import { EventJournalService } from "../journal/event-journal.service";
import { KernelMemoryManagerService } from "../memory/kernel-memory-manager.service";
import { ResourceManagerService } from "../resource/resource-manager.service";
import { MissionExecutorService } from "../mission/mission-executor.service";
import type {
  ProcessId,
  SpawnOptions,
  ProcessSnapshot,
  ResourceConsumption,
} from "../process/process.types";
import type {
  MemoryEntry,
  MemoryQuery as KernelMemoryQuery,
} from "../process/process.types";
import type { JournalEntry } from "../process/process.types";
import type {
  MissionExecuteOptions,
  MissionExecuteResult,
} from "../mission/mission-executor.interface";
import { MemoryLayer, ProcessState } from "@prisma/client";

@Injectable()
export class KernelApiService {
  constructor(
    private readonly processManager: ProcessManagerService,
    private readonly eventJournal: EventJournalService,
    private readonly memoryManager: KernelMemoryManagerService,
    private readonly resourceManager: ResourceManagerService,
    private readonly missionExecutor: MissionExecutorService,
  ) {}

  // ─── Process Management ───

  async spawn(options: SpawnOptions): Promise<ProcessSnapshot> {
    return this.processManager.spawn(options);
  }

  async getProcess(processId: ProcessId): Promise<ProcessSnapshot | null> {
    return this.processManager.getState(processId);
  }

  async listProcesses(
    userId: string,
    states?: ProcessState[],
  ): Promise<ProcessSnapshot[]> {
    return this.processManager.listByUser(userId, states);
  }

  async pauseProcess(processId: ProcessId): Promise<ProcessSnapshot> {
    return this.processManager.pause(processId);
  }

  async resumeProcess(processId: ProcessId): Promise<ProcessSnapshot> {
    return this.processManager.resume(processId);
  }

  async cancelProcess(processId: ProcessId): Promise<ProcessSnapshot> {
    return this.processManager.cancel(processId);
  }

  // ─── Mission ───

  async executeMission(
    options: MissionExecuteOptions,
  ): Promise<MissionExecuteResult> {
    return this.missionExecutor.execute(options);
  }

  async completeMission(
    processId: ProcessId,
    output?: Record<string, unknown>,
  ): Promise<void> {
    return this.missionExecutor.complete(processId, output);
  }

  async failMission(processId: ProcessId, error: string): Promise<void> {
    return this.missionExecutor.fail(processId, error);
  }

  // ─── Memory ───

  async readMemory(
    processId: ProcessId,
    layer: MemoryLayer,
    key: string,
  ): Promise<unknown | null> {
    return this.memoryManager.read(processId, layer, key);
  }

  async writeMemory(entry: MemoryEntry): Promise<void> {
    return this.memoryManager.write(entry);
  }

  async queryMemory(query: KernelMemoryQuery): Promise<MemoryEntry[]> {
    return this.memoryManager.query(query);
  }

  // ─── Resources ───

  async checkBudget(
    processId: ProcessId,
  ): Promise<{ canProceed: boolean; reason?: string }> {
    return this.resourceManager.checkBudget(processId);
  }

  async consumeResources(
    processId: ProcessId,
    consumption: ResourceConsumption,
  ): Promise<void> {
    return this.resourceManager.consume(processId, consumption);
  }

  // ─── Journal ───

  async recordEvent(
    processId: ProcessId,
    type: string,
    payload?: Record<string, unknown>,
  ): Promise<JournalEntry> {
    return this.eventJournal.record(processId, type, payload);
  }

  async getEventHistory(
    processId: ProcessId,
    options?: { limit?: number; offset?: number },
  ): Promise<{ entries: JournalEntry[]; total: number }> {
    return this.eventJournal.getHistory(processId, options);
  }
}
