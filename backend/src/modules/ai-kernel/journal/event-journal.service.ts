import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ProcessId, JournalEntry, StepResult } from "../process/process.types";

@Injectable()
export class EventJournalService {
  private readonly logger = new Logger(EventJournalService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a new event for the process.
   * Sequence number is derived from the current count of existing events + 1.
   */
  async record(
    processId: ProcessId,
    type: string,
    payload?: Record<string, unknown>,
    result?: Record<string, unknown>,
  ): Promise<JournalEntry> {
    const existingCount = await this.prisma.processEvent.count({
      where: { processId },
    });

    const sequence = existingCount + 1;

    const entry = await this.prisma.processEvent.create({
      data: {
        processId,
        sequence,
        type,
        payload: payload as Prisma.InputJsonValue | undefined,
        result: result as Prisma.InputJsonValue | undefined,
      },
    });

    this.logger.debug(
      `[record] Process ${processId} event #${sequence} type="${type}"`,
    );

    return this.toJournalEntry(entry);
  }

  /**
   * Idempotent step execution with event sourcing.
   *
   * If an event with the same processId + type already exists in the DB,
   * the stored result is returned directly (replay mode).
   * Otherwise, the step is executed, the result is persisted, and then returned.
   */
  async recordStep<T>(processId: ProcessId, step: StepResult<T>): Promise<T> {
    const existing = await this.prisma.processEvent.findFirst({
      where: {
        processId,
        type: step.type,
      },
    });

    if (existing) {
      this.logger.debug(
        `[recordStep] Replaying existing event type="${step.type}" for process ${processId}`,
      );
      return existing.result as T;
    }

    const result = await step.execute();

    await this.record(
      processId,
      step.type,
      step.payload,
      result as Record<string, unknown>,
    );

    return result;
  }

  /**
   * Return all events for a process in chronological order.
   */
  async replay(processId: ProcessId): Promise<JournalEntry[]> {
    const events = await this.prisma.processEvent.findMany({
      where: { processId },
      orderBy: { sequence: "asc" },
    });

    return events.map((e) => this.toJournalEntry(e));
  }

  /**
   * Paginated event history for a process.
   */
  async getHistory(
    processId: ProcessId,
    options?: { limit?: number; offset?: number },
  ): Promise<{ entries: JournalEntry[]; total: number }> {
    const limit = options?.limit;
    const offset = options?.offset ?? 0;

    const [events, total] = await Promise.all([
      this.prisma.processEvent.findMany({
        where: { processId },
        orderBy: { sequence: "asc" },
        skip: offset,
        ...(limit !== undefined ? { take: limit } : {}),
      }),
      this.prisma.processEvent.count({ where: { processId } }),
    ]);

    return {
      entries: events.map((e) => this.toJournalEntry(e)),
      total,
    };
  }

  /**
   * Cast a Prisma ProcessEvent record to JournalEntry.
   * Field shapes are compatible — cast via unknown.
   */
  private toJournalEntry(record: unknown): JournalEntry {
    return record as JournalEntry;
  }
}
