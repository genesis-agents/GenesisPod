/**
 * LeaderChatService (F2)
 *
 * Orchestrates the AG-18-LI LeaderIntent spec for `/leader/chat` and
 * `/leader/message` endpoints. Decodes the user's message into one of
 * DIRECT_ANSWER / CREATE_TODO / CLARIFY / ACKNOWLEDGE and dispatches side
 * effects (persist message, emit LEADER_THINKING + LEADER_RESPONSE, seed a
 * ResearchTodo when CREATE_TODO).
 *
 * Harness-native: no revival of legacy LeaderService — we call the spec
 * through SpecAgentRegistry.get('AG-18-LI').executeSpec(input).
 */

import { Injectable, Logger, NotFoundException } from "@nestjs/common";

import { PrismaService } from "@/common/prisma/prisma.service";
import { SpecAgentRegistry } from "@/modules/ai-engine/harness";
import type {
  LeaderIntentInput,
  LeaderIntentDecision,
} from "@/modules/ai-app/topic-insights/agents/specs";
import { ResearchEventEmitterService } from "@/modules/ai-app/topic-insights/memory/events/event-emitter.service";

export interface LeaderChatInput {
  readonly userId: string;
  readonly userName?: string;
  readonly topicId: string;
  readonly message: string;
  /** Optional mission id; when omitted, the service resolves the most recent. */
  readonly missionId?: string;
}

export interface LeaderChatResult {
  readonly missionId: string | null;
  readonly decisionType: LeaderIntentDecision["decisionType"];
  readonly understanding: string;
  readonly response: string | null;
  readonly todo: {
    readonly id: string;
    readonly title: string;
  } | null;
  readonly clarifyQuestion: string | null;
  readonly clarifyOptions: readonly string[] | null;
}

@Injectable()
export class LeaderChatService {
  private readonly logger = new Logger(LeaderChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly specRegistry: SpecAgentRegistry,
    private readonly events: ResearchEventEmitterService,
  ) {}

  /**
   * Handle a /leader/chat request end-to-end.
   * Fire-and-forget safe: callers await the returned promise for the HTTP
   * response while side effects (emit + persist) complete inline.
   */
  async handle(input: LeaderChatInput): Promise<LeaderChatResult> {
    const topic = await this.prisma.researchTopic.findUnique({
      where: { id: input.topicId },
      select: { id: true, name: true, type: true, userId: true },
    });
    if (!topic) {
      throw new NotFoundException(`Topic ${input.topicId} not found`);
    }

    const mission = await this.resolveMission(input.topicId, input.missionId);
    const missionId = mission?.id ?? null;

    // Persist the user's message first so the timeline reflects order even if
    // spec execution fails.
    if (missionId) {
      await this.events.saveUserMessage(
        input.topicId,
        missionId,
        input.message,
        input.userName,
      );
    }

    // Fire LEADER_THINKING as a UX signal. Fire-and-forget: emit failures are
    // logged inside ResearchEventEmitterService and must not take the chat down.
    void this.events.emitLeaderThinking(input.topicId, missionId, {
      phase: "understanding",
      message: "Leader 正在理解你的消息…",
    });

    const recentMessages = missionId
      ? await this.loadRecentMessages(missionId)
      : [];

    let decision: LeaderIntentDecision;
    try {
      decision = await this.runIntentSpec({
        message: input.message,
        topicId: input.topicId,
        topicName: topic.name,
        topicType: topic.type,
        missionId: missionId ?? undefined,
        missionStatus: mission?.status,
        hasExistingReport: Boolean(mission?.hasReport),
        recentMessages,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[handle] LeaderIntent spec failed for topic=${input.topicId}: ${errMsg}`,
      );
      // Degrade to ACKNOWLEDGE so the UI receives a clear message rather than a 500.
      decision = {
        decisionType: "ACKNOWLEDGE",
        understanding: input.message,
        response:
          "暂时无法解析你的消息，已记录为备忘。稍后可以再试或重新发起 Mission。",
        todoCandidate: null,
        clarifyQuestion: null,
        clarifyOptions: null,
      };
    }

    const todo = await this.applyDecision(
      decision,
      input,
      missionId,
      topic.userId,
    );

    return {
      missionId,
      decisionType: decision.decisionType,
      understanding: decision.understanding,
      response: decision.response,
      todo,
      clarifyQuestion: decision.clarifyQuestion,
      clarifyOptions: decision.clarifyOptions,
    };
  }

  private async resolveMission(
    topicId: string,
    explicit?: string,
  ): Promise<{
    id: string;
    status: string;
    hasReport: boolean;
  } | null> {
    if (explicit) {
      const row = await this.prisma.researchMission.findUnique({
        where: { id: explicit },
        select: { id: true, status: true, topicId: true },
      });
      if (row && row.topicId === topicId) {
        const hasReport = await this.topicHasReport(topicId);
        return { id: row.id, status: row.status, hasReport };
      }
    }
    const latest = await this.prisma.researchMission.findFirst({
      where: { topicId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
    if (!latest) return null;
    const hasReport = await this.topicHasReport(topicId);
    return { id: latest.id, status: latest.status, hasReport };
  }

  private async topicHasReport(topicId: string): Promise<boolean> {
    const reportCount = await this.prisma.topicReport.count({
      where: { topicId },
    });
    return reportCount > 0;
  }

  private async loadRecentMessages(
    missionId: string,
  ): Promise<ReadonlyArray<{ role: "user" | "leader"; content: string }>> {
    const rows = await this.prisma.researchTeamMessage.findMany({
      where: {
        missionId,
        messageType: { in: ["USER_MESSAGE", "LEADER_RESPONSE"] },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { messageType: true, content: true },
    });
    return rows.reverse().map((r) => ({
      role: r.messageType === "USER_MESSAGE" ? "user" : "leader",
      content: r.content,
    }));
  }

  private async runIntentSpec(
    input: LeaderIntentInput,
  ): Promise<LeaderIntentDecision> {
    const agent = this.specRegistry.get<
      LeaderIntentInput,
      LeaderIntentDecision
    >("AG-18-LI");
    if (!agent) {
      throw new Error(
        "[LeaderChatService] AG-18-LI not registered in SpecAgentRegistry",
      );
    }
    const result = await agent.executeSpec(input);
    return result.output;
  }

  private async applyDecision(
    decision: LeaderIntentDecision,
    input: LeaderChatInput,
    missionId: string | null,
    _ownerId: string,
  ): Promise<LeaderChatResult["todo"]> {
    if (decision.decisionType === "DIRECT_ANSWER" && decision.response) {
      if (missionId) {
        await this.events.emitLeaderResponse(
          input.topicId,
          missionId,
          decision.response,
        );
      }
      return null;
    }

    if (
      decision.decisionType === "CREATE_TODO" &&
      decision.todoCandidate &&
      missionId
    ) {
      const todo = await this.prisma.researchTodo.create({
        data: {
          missionId,
          topicId: input.topicId,
          type: "USER_REQUEST",
          title: decision.todoCandidate.title,
          description: decision.todoCandidate.description,
          status: "PENDING",
          priority: this.mapPriority(decision.todoCandidate.priority),
        },
        select: { id: true, title: true },
      });
      if (decision.response) {
        await this.events.emitLeaderResponse(
          input.topicId,
          missionId,
          decision.response,
        );
      }
      return todo;
    }

    if (decision.decisionType === "CLARIFY" && missionId) {
      const clarifyMessage = [
        decision.clarifyQuestion ?? "",
        decision.clarifyOptions && decision.clarifyOptions.length > 0
          ? `候选: ${decision.clarifyOptions.join(" / ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      await this.events.emitLeaderResponse(
        input.topicId,
        missionId,
        clarifyMessage,
      );
      return null;
    }

    // ACKNOWLEDGE path — persist a short response if present.
    if (decision.response && missionId) {
      await this.events.emitLeaderResponse(
        input.topicId,
        missionId,
        decision.response,
      );
    }
    return null;
  }

  private mapPriority(p?: "low" | "medium" | "high"): number {
    switch (p) {
      case "high":
        return 8;
      case "low":
        return 2;
      default:
        return 5;
    }
  }
}
