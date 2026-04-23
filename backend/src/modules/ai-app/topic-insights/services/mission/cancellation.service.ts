/**
 * MissionCancellationService — external cancel signal registry for harness runs.
 *
 * Goal: `/mission/cancel` endpoint needs to interrupt an in-flight harness pipeline.
 * The harness already threads AbortSignal through Stage.execute / Agent.executeSpec.
 * We just need a process-local map so a controller can find the right AbortController
 * by missionId and call .abort().
 *
 * Single-process only (no cross-instance coordination). Multi-instance deployments
 * need a DB-backed cancellation flag + polling inside stages — out of scope for v1.
 */

import { Injectable, Logger } from "@nestjs/common";

export interface CancelRequest {
  readonly reason: string;
  readonly requestedBy: string;
  readonly requestedAt: Date;
}

@Injectable()
export class MissionCancellationService {
  private readonly logger = new Logger(MissionCancellationService.name);
  private readonly active = new Map<
    string,
    { controller: AbortController; registeredAt: Date }
  >();

  /** Called by runWithHarness at pipeline start. */
  register(missionId: string, controller: AbortController): void {
    if (this.active.has(missionId)) {
      this.logger.warn(
        `[register] mission=${missionId} already registered — replacing (previous run must have leaked)`,
      );
    }
    this.active.set(missionId, { controller, registeredAt: new Date() });
  }

  /** Called by runWithHarness on pipeline settle (success, error, or external cancel). */
  unregister(missionId: string): void {
    this.active.delete(missionId);
  }

  /**
   * External cancel — flips the AbortController. Returns true if mission was active,
   * false if it was already settled or never registered.
   */
  cancel(missionId: string, req: CancelRequest): boolean {
    const entry = this.active.get(missionId);
    if (!entry) {
      this.logger.log(
        `[cancel] mission=${missionId} not active — no-op (reason="${req.reason}")`,
      );
      return false;
    }
    this.logger.warn(
      `[cancel] mission=${missionId} aborting — reason="${req.reason}" requestedBy=${req.requestedBy}`,
    );
    entry.controller.abort(new Error(`cancelled: ${req.reason}`));
    // Do NOT unregister here — runWithHarness's finally block handles it.
    return true;
  }

  isActive(missionId: string): boolean {
    return this.active.has(missionId);
  }

  /** Debug/observability — list current active mission ids. */
  listActive(): string[] {
    return Array.from(this.active.keys());
  }
}
