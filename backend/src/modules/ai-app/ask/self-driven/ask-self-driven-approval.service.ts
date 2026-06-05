/**
 * AskSelfDrivenApprovalService — owner-scoped HITL approval resolution.
 *
 * The self-driven `awaiting_approval` event carries requestId="" (the runner
 * yields it before the gate generates an id), and the admin /approvals endpoint
 * is admin-only — so a normal mission owner could never actually approve their
 * own plan; it would only ever auto-approve on the 10-minute timeout. This
 * service closes that gap: it resolves the open gate by missionId (via the
 * mission->requestId mapping the gate writes) and records the human response in
 * the same long_term_memories row the gate polls, exactly like the admin path.
 *
 * Ownership is asserted by the controller before this is called.
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  HITL_APPROVAL_USER_ID,
  selfDrivenMissionGateKey,
} from "@/modules/ai-harness/facade";

@Injectable()
export class AskSelfDrivenApprovalService {
  private readonly logger = new Logger(AskSelfDrivenApprovalService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the mission's currently open gate. Writes the
   * approval:response:{requestId} row the SelfDrivenHitlGateService poll picks
   * up within ~2s. Throws NotFound if there is no open gate for the mission.
   */
  async approve(
    missionId: string,
    approved: boolean,
    feedback?: string,
  ): Promise<{ requestId: string }> {
    const mapping = await this.prisma.longTermMemory.findUnique({
      where: {
        userId_key: {
          userId: HITL_APPROVAL_USER_ID,
          key: selfDrivenMissionGateKey(missionId),
        },
      },
    });
    const requestId = (mapping?.value as { requestId?: string } | null)
      ?.requestId;
    if (!requestId) {
      throw new NotFoundException("No open approval gate for this mission");
    }

    const RESPONSE_KEY = `approval:response:${requestId}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const value = {
      approved,
      choice: null,
      input: null,
      feedback: feedback ?? null,
    } as never;

    await this.prisma.longTermMemory.upsert({
      where: {
        userId_key: { userId: HITL_APPROVAL_USER_ID, key: RESPONSE_KEY },
      },
      create: {
        userId: HITL_APPROVAL_USER_ID,
        key: RESPONSE_KEY,
        type: "human_approval_response",
        value,
        importance: 10,
        tags: ["human-approval", "response"],
        expiresAt,
      },
      update: { value, expiresAt },
    });

    this.logger.log(
      `[approve] mission=${missionId} requestId=${requestId} approved=${approved}`,
    );
    return { requestId };
  }
}
