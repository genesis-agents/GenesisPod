/**
 * AskSelfDrivenMissionStore — durable ownership + terminal-status store for
 * self-driven missions (ask_self_driven_missions table).
 *
 * Provides:
 *  - create(): register a mission row at /run time (durable ownership).
 *  - getOwnerById(): IDOR fallback for socket-join / replay after pod recycle.
 *  - countRunningByUser(): per-user concurrency pre-check.
 *  - applyTerminalIfRunning(): MissionTerminalArbiter — first-writer-wins
 *    conditional terminal write (WHERE status='running'), so the runner's
 *    terminal event and a future liveness-guard reclaim can't double-write.
 *  - markHeartbeat(): liveness heartbeat (consumed in stage 5).
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import type {
  MissionTerminalArbiter,
  MissionTerminalIntent,
} from "@/modules/ai-harness/facade";

@Injectable()
export class AskSelfDrivenMissionStore implements MissionTerminalArbiter {
  private readonly logger = new Logger(AskSelfDrivenMissionStore.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    missionId: string,
    userId: string,
    prompt: string,
  ): Promise<void> {
    await this.prisma.askSelfDrivenMission.create({
      data: { id: missionId, userId, prompt: prompt.slice(0, 4000) },
    });
  }

  /** Owner userId for a mission, or null if unknown (IDOR fallback). */
  async getOwnerById(missionId: string): Promise<string | null> {
    const row = await this.prisma.askSelfDrivenMission.findUnique({
      where: { id: missionId },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  async countRunningByUser(userId: string): Promise<number> {
    return this.prisma.askSelfDrivenMission.count({
      where: { userId, status: "running" },
    });
  }

  async markHeartbeat(missionId: string): Promise<void> {
    await this.prisma.askSelfDrivenMission
      .updateMany({
        where: { id: missionId, status: "running" },
        data: { heartbeatAt: new Date() },
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `[heartbeat ${missionId}] failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  /**
   * First-writer-wins terminal write. Returns true if THIS call transitioned
   * the row out of `running` (i.e. won the race), false if it was already
   * terminal.
   */
  async applyTerminalIfRunning(
    missionId: string,
    intent: MissionTerminalIntent,
  ): Promise<boolean> {
    const res = await this.prisma.askSelfDrivenMission.updateMany({
      where: { id: missionId, status: "running" },
      data: {
        status: intent.status,
        errorMessage: intent.errorMessage?.slice(0, 4000) ?? null,
      },
    });
    return res.count > 0;
  }
}
