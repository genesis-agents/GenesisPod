/**
 * Kernel Memory Manager Service
 * Process-level memory management backed by ProcessMemory table
 */
import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { MemoryLayer, Prisma } from "@prisma/client";
import type {
  ProcessId,
  MemoryEntry,
  MemoryQuery as KernelMemoryQuery,
} from "../process/process.types";

@Injectable()
export class KernelMemoryManagerService {
  constructor(private readonly prisma: PrismaService) {}

  async read(
    processId: ProcessId,
    layer: MemoryLayer,
    key: string,
  ): Promise<unknown | null> {
    const entry = await this.prisma.processMemory.findUnique({
      where: { processId_layer_key: { processId, layer, key } },
    });
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      await this.prisma.processMemory.delete({ where: { id: entry.id } });
      return null;
    }
    return entry.value;
  }

  async write(entry: MemoryEntry): Promise<void> {
    await this.prisma.processMemory.upsert({
      where: {
        processId_layer_key: {
          processId: entry.processId,
          layer: entry.layer,
          key: entry.key,
        },
      },
      update: {
        value: entry.value as Prisma.InputJsonValue,
        expiresAt: entry.expiresAt ?? null,
      },
      create: {
        processId: entry.processId,
        layer: entry.layer,
        key: entry.key,
        value: entry.value as Prisma.InputJsonValue,
        expiresAt: entry.expiresAt,
      },
    });
  }

  async query(query: KernelMemoryQuery): Promise<MemoryEntry[]> {
    const where: Record<string, unknown> = { processId: query.processId };
    if (query.layer) where.layer = query.layer;
    if (query.keyPattern) where.key = { contains: query.keyPattern };

    const results = await this.prisma.processMemory.findMany({
      where,
      take: query.limit ?? 100,
      orderBy: { updatedAt: "desc" },
    });

    return results.map((r) => ({
      processId: r.processId,
      layer: r.layer,
      key: r.key,
      value: r.value,
      expiresAt: r.expiresAt ?? undefined,
    }));
  }

  async cleanup(processId: ProcessId): Promise<number> {
    const now = new Date();
    const result = await this.prisma.processMemory.deleteMany({
      where: {
        processId,
        expiresAt: { lt: now },
      },
    });
    return result.count;
  }

  async deleteAll(processId: ProcessId): Promise<number> {
    const result = await this.prisma.processMemory.deleteMany({
      where: { processId },
    });
    return result.count;
  }
}
