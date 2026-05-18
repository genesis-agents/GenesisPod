import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import {
  NarrativeService,
  NarrativeThread,
} from "../services/briefing/narrative.service";

@Controller("api/v1/radar/topics")
@UseGuards(JwtAuthGuard)
export class NarrativeController {
  constructor(private readonly svc: NarrativeService) {}

  @Get(":topicId/narratives/:narrativeId")
  async getNarrative(
    @Param("topicId") topicId: string,
    @Param("narrativeId") narrativeId: string,
  ): Promise<NarrativeThread> {
    const result = await this.svc.getNarrativeThread(topicId, narrativeId);
    if (!result) {
      throw new NotFoundException(
        "narrative not found or insufficient episodes",
      );
    }
    return result;
  }
}
