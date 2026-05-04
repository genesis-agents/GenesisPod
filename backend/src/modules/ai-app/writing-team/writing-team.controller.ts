/**
 * WritingTeamController —— REST 入口（v5.1 §4 R3-A demo）
 *
 * POST /api/v1/writing-team/run
 *   body: { topic: string, targetWords?: number, tone?: "neutral"|"casual"|"formal" }
 *   200: { missionId, status, plan, draft, signoff }
 */
import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { WritingTeamService } from "./writing-team.service";
import type {
  WritingTeamInput,
  WritingTeamResult,
} from "./abstractions/writing-team.types";

@Controller("writing-team")
export class WritingTeamController {
  constructor(private readonly service: WritingTeamService) {}

  @Post("run")
  async run(@Body() body: unknown): Promise<WritingTeamResult> {
    const input = this.parseInput(body);
    return this.service.run(input);
  }

  private parseInput(body: unknown): WritingTeamInput {
    if (!body || typeof body !== "object") {
      throw new BadRequestException("body must be a JSON object");
    }
    const b = body as Record<string, unknown>;
    if (typeof b.topic !== "string" || b.topic.trim().length === 0) {
      throw new BadRequestException("topic must be a non-empty string");
    }
    if (b.targetWords !== undefined && typeof b.targetWords !== "number") {
      throw new BadRequestException("targetWords must be a number");
    }
    if (
      b.tone !== undefined &&
      !["neutral", "casual", "formal"].includes(b.tone as string)
    ) {
      throw new BadRequestException(
        "tone must be 'neutral' | 'casual' | 'formal'",
      );
    }
    return {
      topic: b.topic.trim(),
      targetWords: b.targetWords,
      tone: b.tone as WritingTeamInput["tone"],
    };
  }
}
