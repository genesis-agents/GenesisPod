import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/common/prisma/prisma.service";
import { sanitizePromptInput } from "@/modules/ai-engine/facade";

/**
 * HITL gate outcome returned to the runner at each stage boundary.
 *
 * approved — true means proceed; false means abort the mission.
 * timedOut  — true when the 10-minute gate window elapsed with no human response
 *             (auto-approve is the P4a default; gate is still considered approved).
 * appendInstruction — sanitized text the user appended to refine the next phase
 *             (present only when the user supplied feedback during approval).
 */
export interface HitlGateOutcome {
  approved: boolean;
  timedOut: boolean;
  appendInstruction?: string;
}

/** 10-minute default gate timeout (P4a spec). */
const GATE_TIMEOUT_MS = 10 * 60 * 1000;

/** Fixed owner for approval bookkeeping rows in long_term_memories. */
export const HITL_APPROVAL_USER_ID = "system";

/**
 * longTermMemory key mapping a mission to its current open approval requestId.
 * Shared by the gate (writer) and the owner-scoped approval service (reader) so
 * a non-admin owner can resolve their own gate by missionId alone.
 */
export function selfDrivenMissionGateKey(missionId: string): string {
  return `approval:mission:${missionId}`;
}

/** DB poll interval while waiting for a human response. */
const POLL_INTERVAL_MS = 2_000;

/**
 * SelfDrivenHitlGateService — thin wrapper around the DB-poll approval primitive.
 *
 * Writes an `approval:request:{requestId}` record to `longTermMemory` (same schema
 * used by HumanApprovalTool) then polls for `approval:response:{requestId}` until
 * a human responds or the gate times out.
 *
 * Timeout behaviour (P4a): auto-approve + mark timedOut=true.  The runner emits a
 * `phase` detail event so UI can show "auto-approved after 10 min".
 *
 * Append sanitization: if the human provides a feedback/append string it is passed
 * through `sanitizePromptInput` (engine facade, removes injection patterns) before
 * being returned to the caller for injection into mission context.
 *
 * Interruptible: the polling loop checks `signal.aborted` on every iteration and
 * returns early with approved=false if the abort signal fires.
 *
 * Capability singleton (capability-singleton.spec.ts): registered in
 * SelfDrivenTeamModule and re-exported from harness facade — one authoritative
 * definition in teams/orchestrator/self-driven/.
 */
@Injectable()
export class SelfDrivenHitlGateService {
  private readonly logger = new Logger(SelfDrivenHitlGateService.name);
  private memoryTableReady: boolean | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Open a HITL gate and block until the human responds or the timeout elapses.
   *
   * @param missionId   Used only for logging / correlation.
   * @param gate        Identifies which gate is open (used in approval prompt context).
   * @param prompt      Human-readable description of what is being approved.
   * @param signal      Cooperative abort signal — if fired, gate returns approved=false.
   * @param timeoutMs   Override the default 10-minute timeout (used in tests).
   */
  async open(
    missionId: string,
    gate: "plan_confirm" | "deliver_confirm",
    prompt: string,
    signal?: AbortSignal,
    timeoutMs = GATE_TIMEOUT_MS,
  ): Promise<HitlGateOutcome & { requestId: string }> {
    const requestId = randomUUID();

    this.logger.log(
      `[HitlGate] mission=${missionId} gate=${gate} requestId=${requestId} ` +
        `timeout=${timeoutMs}ms`,
    );

    try {
      if (!(await this.ensureMemoryTable())) {
        // Memory table absent — auto-approve and continue rather than hard-fail.
        this.logger.warn(
          `[HitlGate] mission=${missionId} long_term_memories table not available — ` +
            `auto-approving gate=${gate}`,
        );
        return { requestId, approved: true, timedOut: true };
      }

      await this.storeRequest(requestId, missionId, gate, prompt, timeoutMs);

      const outcome = await this.pollForResponse(
        requestId,
        missionId,
        gate,
        timeoutMs,
        signal,
      );

      return { requestId, ...outcome };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[HitlGate] mission=${missionId} gate=${gate} unexpected error: ${message}`,
      );
      // Unexpected errors auto-approve so the mission is not silently killed.
      return { requestId, approved: true, timedOut: true };
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async ensureMemoryTable(): Promise<boolean> {
    if (this.memoryTableReady !== null) return this.memoryTableReady;
    try {
      const result = await this.prisma.$queryRaw<[{ exists: boolean }]>(
        Prisma.sql`SELECT EXISTS(
          SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='long_term_memories'
        ) AS "exists"`,
      );
      this.memoryTableReady = result[0]?.exists ?? false;
    } catch {
      this.memoryTableReady = false;
    }
    return this.memoryTableReady;
  }

  private async storeRequest(
    requestId: string,
    missionId: string,
    gate: "plan_confirm" | "deliver_confirm",
    prompt: string,
    timeoutMs: number,
  ): Promise<void> {
    const REQUEST_KEY = `approval:request:${requestId}`;
    const USER_ID = "system";
    const expiresAt = new Date(Date.now() + timeoutMs + 60_000);

    const requestPayload = {
      requestId,
      missionId,
      approvalType: "review" as const,
      prompt,
      context: { summary: `Self-driven mission gate: ${gate}` },
      choices: null,
      defaultAction: "approve",
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    await this.prisma.longTermMemory.upsert({
      where: { userId_key: { userId: USER_ID, key: REQUEST_KEY } },
      create: {
        userId: USER_ID,
        key: REQUEST_KEY,
        type: "human_approval_request",
        value: requestPayload as never,
        importance: 8,
        tags: ["human-approval", "self-driven", gate],
        expiresAt,
      },
      update: { value: requestPayload as never, expiresAt },
    });

    // Owner-scoped approval lookup: the frontend only knows the missionId (the
    // awaiting_approval event carries requestId=""), so map missionId -> the
    // current open requestId. AskSelfDrivenApprovalService reads this to resolve
    // the gate without admin access. Last-open-gate-wins (upsert by missionId).
    await this.prisma.longTermMemory.upsert({
      where: {
        userId_key: {
          userId: USER_ID,
          key: selfDrivenMissionGateKey(missionId),
        },
      },
      create: {
        userId: USER_ID,
        key: selfDrivenMissionGateKey(missionId),
        type: "human_approval_mission_gate",
        value: { requestId, gate } as never,
        importance: 8,
        tags: ["human-approval", "self-driven", `mission:${missionId}`],
        expiresAt,
      },
      update: { value: { requestId, gate } as never, expiresAt },
    });

    this.logger.debug(
      `[HitlGate] requestId=${requestId} stored in DB, polling for response`,
    );
  }

  private async pollForResponse(
    requestId: string,
    missionId: string,
    gate: "plan_confirm" | "deliver_confirm",
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<HitlGateOutcome> {
    const RESPONSE_KEY = `approval:response:${requestId}`;
    const REQUEST_KEY = `approval:request:${requestId}`;
    const USER_ID = "system";
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      // Cooperative abort check.
      if (signal?.aborted) {
        this.logger.log(
          `[HitlGate] mission=${missionId} gate=${gate} aborted while waiting`,
        );
        await this.cleanup(USER_ID, REQUEST_KEY, null, missionId).catch(
          () => undefined,
        );
        return { approved: false, timedOut: false };
      }

      await new Promise<void>((resolve) =>
        setTimeout(resolve, POLL_INTERVAL_MS),
      );

      // Re-check abort after sleep (covers the case where abort fires during sleep).
      if (signal?.aborted) {
        await this.cleanup(USER_ID, REQUEST_KEY, null, missionId).catch(
          () => undefined,
        );
        return { approved: false, timedOut: false };
      }

      let responseRecord: { value: unknown } | null = null;
      try {
        responseRecord = await this.prisma.longTermMemory.findUnique({
          where: { userId_key: { userId: USER_ID, key: RESPONSE_KEY } },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[HitlGate] mission=${missionId} DB poll error (will retry): ${message}`,
        );
        continue;
      }

      if (!responseRecord) continue;

      const responseData = responseRecord.value as {
        approved?: boolean;
        feedback?: string;
        input?: unknown;
      };

      const approved = responseData.approved ?? true;

      // Sanitize any append instruction the human provided.
      let appendInstruction: string | undefined;
      const rawFeedback =
        typeof responseData.feedback === "string"
          ? responseData.feedback
          : typeof responseData.input === "string"
            ? responseData.input
            : undefined;

      if (rawFeedback && rawFeedback.trim().length > 0) {
        const sanitized = sanitizePromptInput(rawFeedback, { maxLength: 2000 });
        if (sanitized.sanitized.trim().length > 0) {
          appendInstruction = sanitized.sanitized;
          if (sanitized.detectedPatterns.length > 0) {
            this.logger.warn(
              `[HitlGate] mission=${missionId} gate=${gate} sanitized append: ` +
                `detected patterns=[${sanitized.detectedPatterns.join(", ")}]`,
            );
          }
        }
      }

      this.logger.log(
        `[HitlGate] mission=${missionId} gate=${gate} resolved: ` +
          `approved=${approved} hasAppend=${!!appendInstruction}`,
      );

      await this.cleanup(USER_ID, REQUEST_KEY, RESPONSE_KEY, missionId).catch(
        () => undefined,
      );

      return { approved, timedOut: false, appendInstruction };
    }

    // Timed out — auto-approve (P4a default per ADR-010).
    this.logger.warn(
      `[HitlGate] mission=${missionId} gate=${gate} timed out after ${timeoutMs}ms — auto-approving`,
    );
    await this.cleanup(USER_ID, REQUEST_KEY, null, missionId).catch(
      () => undefined,
    );
    return { approved: true, timedOut: true };
  }

  private async cleanup(
    userId: string,
    requestKey: string,
    responseKey: string | null,
    missionId: string,
  ): Promise<void> {
    const keys: string[] = [requestKey, selfDrivenMissionGateKey(missionId)];
    if (responseKey) keys.push(responseKey);
    await this.prisma.longTermMemory.deleteMany({
      where: { userId, key: { in: keys } },
    });
  }
}
