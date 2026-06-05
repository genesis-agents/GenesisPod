/**
 * SelfDrivenMissionDispatcher — app-side detached driver for self-driven missions.
 *
 * Decouples mission execution from any HTTP connection: /run fires this in the
 * background (fire-and-forget) and returns immediately. This drives the UNCHANGED
 * SelfDrivenMissionRunner.run() async generator, relays every yielded event onto
 * the global EventBus via SelfDrivenEventRelay (→ socket room + durable buffer),
 * and arbitrates the terminal status (first-writer-wins) via the mission store.
 *
 * The 10-minute HITL gate now blocks INSIDE this detached task — it holds no
 * HTTP connection. Cancellation is cooperative via MissionAbortRegistry (not an
 * HTTP AbortController), so a /cancel request can abort a detached mission.
 *
 * Layering: lives in ai-app and reaches the harness only through the facade
 * (runner + relay + abort registry + lifecycle manager are all facade exports).
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  MissionAbortRegistry,
  MissionFailureCode,
  MissionLifecycleManager,
  SelfDrivenEventRelay,
  SelfDrivenMissionRunner,
} from "@/modules/ai-harness/facade";
import { AskSelfDrivenMissionStore } from "./ask-self-driven-mission.store";

export interface SelfDrivenDispatchInput {
  prompt: string;
  userId: string;
  clarifications?: Record<string, string>;
}

@Injectable()
export class SelfDrivenMissionDispatcher {
  private readonly logger = new Logger(SelfDrivenMissionDispatcher.name);

  constructor(
    private readonly runner: SelfDrivenMissionRunner,
    private readonly relay: SelfDrivenEventRelay,
    private readonly store: AskSelfDrivenMissionStore,
    private readonly abortRegistry: MissionAbortRegistry,
    private readonly lifecycle: MissionLifecycleManager,
  ) {}

  /**
   * Drive one mission to completion in the background. Never rejects — terminal
   * failures are relayed as a `self-driven.error` event and finalized.
   */
  async runInBackground(
    missionId: string,
    input: SelfDrivenDispatchInput,
    userId: string,
  ): Promise<void> {
    const controller = this.abortRegistry.register(missionId);
    let failureMessage: string | undefined;

    try {
      for await (const event of this.runner.run(
        missionId,
        {
          prompt: input.prompt,
          userId,
          clarifications: input.clarifications,
        },
        controller.signal,
      )) {
        await this.relay.emitMissionEvent(event, userId);
        if (event.type === "error") {
          failureMessage = event.message;
        }
      }
    } catch (err) {
      failureMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[self-driven ${missionId}] runner threw: ${failureMessage}`,
      );
      // The generator died before yielding a terminal event — surface one so
      // the UI unsticks even though run() never reached its own error yield.
      await this.relay
        .emitMissionEvent(
          { type: "error", missionId, message: failureMessage },
          userId,
        )
        .catch(() => undefined);
    } finally {
      this.abortRegistry.unregister(missionId);
    }

    await this.finalize(missionId, failureMessage);
  }

  private async finalize(
    missionId: string,
    failureMessage: string | undefined,
  ): Promise<void> {
    const intent = failureMessage
      ? {
          status: "failed" as const,
          failureCode: MissionFailureCode.runtime_crashed,
          errorMessage: failureMessage,
        }
      : { status: "completed" as const };

    await this.lifecycle
      .finalize({
        missionId,
        intent,
        arbiter: this.store,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `[self-driven ${missionId}] finalize failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return { won: false };
      });
  }
}
