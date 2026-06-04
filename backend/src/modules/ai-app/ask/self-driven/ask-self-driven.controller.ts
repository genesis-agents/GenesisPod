import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Res,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { IsString, IsOptional, IsObject } from "class-validator";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { AskSelfDrivenService } from "./ask-self-driven.service";

class SelfDrivenStreamDto {
  @IsString()
  prompt!: string;

  @IsOptional()
  @IsObject()
  clarifications?: Record<string, string>;
}

/**
 * Isolated SSE endpoint for the Self-Driven Agent Team pseudo-model.
 *
 * Deliberately separate from AiAskController so the shared BYOK chat path
 * is never touched when the user picks the `self-driven-team` sentinel.
 *
 * POST /api/v1/ask/self-driven/stream
 */
@ApiTags("AI Ask")
@Controller("ask/self-driven")
@UseGuards(JwtAuthGuard)
export class AskSelfDrivenController {
  private readonly logger = new Logger(AskSelfDrivenController.name);
  private static readonly SSE_HEARTBEAT_MS = 15000;

  constructor(private readonly askSelfDrivenService: AskSelfDrivenService) {}

  /**
   * Stream a self-driven mission as SSE.
   * POST /api/v1/ask/self-driven/stream
   */
  @Post("stream")
  @ApiOperation({ summary: "Self-Driven Agent Team — SSE stream" })
  @ApiResponse({ status: 200, description: "text/event-stream SSE" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async stream(
    @Request() req: { user: { id: string } },
    @Body() dto: SelfDrivenStreamDto,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    let connectionOpen = true;
    const abortController = new AbortController();

    res.on("close", () => {
      connectionOpen = false;
      abortController.abort();
    });

    const writeEvent = (event: unknown): boolean => {
      if (!connectionOpen) return false;
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        return true;
      } catch {
        connectionOpen = false;
        return false;
      }
    };

    const heartbeat = setInterval(() => {
      if (!connectionOpen) return;
      try {
        res.write(":heartbeat\n\n");
      } catch {
        connectionOpen = false;
      }
    }, AskSelfDrivenController.SSE_HEARTBEAT_MS);

    try {
      for await (const event of this.askSelfDrivenService.stream({
        prompt: dto.prompt,
        userId: req.user.id,
        clarifications: dto.clarifications,
        signal: abortController.signal,
      })) {
        if (!writeEvent(event)) break;
        if (event.type === "done" || event.type === "error") {
          break;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[AskSelfDriven] stream failed: ${message}`);
      writeEvent({ type: "error", message });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }
}
