/**
 * Kernel API Service
 * Unified entry point for AI Kernel capabilities.
 * Aggregates process management, memory, resources, and event journal.
 */
import { Injectable } from "@nestjs/common";
import { ProcessManagerService } from "../../../ai-harness/process/manager/process-manager.service";
import { EventJournalService } from "../../protocol/journal/event-journal.service";
import { ProcessMemoryManagerService } from "../../memory/working/process-memory-manager.service";
import { ResourceManagerService } from "../../../ai-harness/governance/resource/resource-manager.service";
import { MissionExecutorService } from "../../../ai-harness/runtime/mission/mission-executor.service";
import { CircuitBreakerService } from "../../../ai-engine/safety/resilience/circuit-breaker.service";
import { EventBusService } from "../../../ai-harness/protocol/ipc/event-bus.service";
import { MessageBusService } from "../../../ai-harness/protocol/ipc/message-bus.service";
import { ProgressTrackerService } from "../../../ai-harness/protocol/ipc/progress-tracker.service";
import { AiObservabilityService } from "../../../ai-harness/governance/observability/ai-observability.service";
import { CostAttributionService } from "../../../ai-harness/governance/observability/cost-attribution.service";
import { CapabilityGuardService } from "../../governance/security/capability-guard.service";
import { KernelSchedulerService } from "../../../ai-harness/process/scheduler/kernel-scheduler.service";
import type {
  ProcessId,
  SpawnOptions,
  ProcessSnapshot,
  ResourceConsumption,
} from "../../../ai-harness/process/manager/process.types";
import type {
  MemoryEntry,
  MemoryQuery as KernelMemoryQuery,
} from "../../../ai-harness/process/manager/process.types";
import type { JournalEntry } from "../../../ai-harness/process/manager/process.types";
import type {
  MissionExecuteOptions,
  MissionExecuteResult,
} from "../../../ai-harness/runtime/mission/mission-executor.interface";
import { MemoryLayer, ProcessState } from "@prisma/client";

@Injectable()
export class KernelApiService {
  constructor(
    private readonly processManager: ProcessManagerService,
    private readonly eventJournal: EventJournalService,
    private readonly memoryManager: ProcessMemoryManagerService,
    private readonly resourceManager: ResourceManagerService,
    private readonly missionExecutor: MissionExecutorService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly eventBus: EventBusService,
    private readonly messageBus: MessageBusService,
    private readonly progressTracker: ProgressTrackerService,
    private readonly kernelMetrics: AiObservabilityService,
    private readonly costAttribution: CostAttributionService,
    private readonly capabilityGuard: CapabilityGuardService,
    private readonly kernelScheduler: KernelSchedulerService,
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

  async listAllProcesses(
    states?: ProcessState[],
    limit?: number,
  ): Promise<ProcessSnapshot[]> {
    return this.processManager.listAll(states, limit);
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

  // ─── Circuit Breaker ───

  getCircuitBreakerMetrics() {
    return this.circuitBreaker.getAllHealthMetrics();
  }

  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  resetCircuitBreaker(entityId: string) {
    this.circuitBreaker.reset(entityId);
  }

  // ─── IPC ───

  getEventBusStats() {
    return { activeSubscriptions: this.eventBus.getActiveSubscriptionCount() };
  }

  getMessageBusHistory(sessionId: string) {
    return this.messageBus.getHistory(sessionId);
  }

  getActiveTasks() {
    return this.progressTracker.getActiveTasks();
  }

  getTaskProgress(taskId: string) {
    return this.progressTracker.getProgress(taskId);
  }

  // ─── Observability ───

  getDashboard(periodMinutes?: number) {
    return this.kernelMetrics.getDashboard(periodMinutes);
  }

  async getDashboardWithFallback(periodMinutes?: number) {
    return this.kernelMetrics.getDashboardWithFallback(periodMinutes);
  }

  getCostReport(options?: { periodHours?: number; userId?: string }) {
    return this.costAttribution.getCostReport(options);
  }

  getHourlyTrend(hours?: number) {
    return this.costAttribution.getHourlyTrend(hours);
  }

  checkBudgetAlerts() {
    return this.costAttribution.checkBudgetAlerts();
  }

  // ─── Security ───

  async getCapabilities(processId: ProcessId) {
    return this.capabilityGuard.getCapabilities(processId);
  }

  // ─── Scheduler ───

  async getSchedulerStats() {
    return this.kernelScheduler.getStats();
  }

  // ─── Memory (admin) ───

  async cleanupExpiredMemory(processId: ProcessId) {
    return this.memoryManager.cleanup(processId);
  }
}
