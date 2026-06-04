import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { SelfDrivenMissionRunner } from "../../../ai-harness/facade";
import type { SelfDrivenMissionEvent } from "../../../ai-harness/facade";

export interface SelfDrivenStreamInput {
  prompt: string;
  userId: string;
  clarifications?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Thin dispatch service: generates a missionId and delegates directly to
 * {@link SelfDrivenMissionRunner}. Contains zero business logic — all
 * orchestration lives in the harness layer.
 */
@Injectable()
export class AskSelfDrivenService {
  private readonly logger = new Logger(AskSelfDrivenService.name);

  constructor(
    private readonly selfDrivenMissionRunner: SelfDrivenMissionRunner,
  ) {}

  /**
   * Creates a new mission id and proxies the runner's async generator to
   * the caller for SSE transport.
   */
  async *stream(
    input: SelfDrivenStreamInput,
  ): AsyncGenerator<SelfDrivenMissionEvent, void, unknown> {
    const missionId = randomUUID();
    this.logger.log(
      `[AskSelfDriven] dispatching mission ${missionId} for user ${input.userId}`,
    );

    try {
      yield* this.selfDrivenMissionRunner.run(
        missionId,
        {
          prompt: input.prompt,
          userId: input.userId,
          clarifications: input.clarifications,
        },
        input.signal,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[AskSelfDriven] mission ${missionId} runner threw: ${message}`,
      );
      yield { type: "error", missionId, message };
    }
  }
}
