import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
  UnauthorizedException,
  ParseUUIDPipe,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import type { RequestWithUser } from "../../../../common/types/express-request.types";
import { ResearchIdeaService } from "./research-idea.service";
import {
  CreateResearchIdeaDto,
  UpdateResearchIdeaDto,
} from "./research-idea.dto";

@ApiTags("ai-studio")
@ApiBearerAuth("access-token")
@Controller("ai-studio/projects/:projectId/ideas")
@UseGuards(JwtAuthGuard)
export class ResearchIdeaController {
  constructor(private readonly ideaService: ResearchIdeaService) {}

  @Get()
  @ApiOperation({ summary: "List all ideas for a project" })
  async listIdeas(
    @Request() req: RequestWithUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    const ideas = await this.ideaService.listByProject(userId, projectId);
    return { success: true, data: ideas };
  }

  @Post()
  @ApiOperation({ summary: "Create a new idea" })
  async createIdea(
    @Request() req: RequestWithUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body() dto: CreateResearchIdeaDto,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    const idea = await this.ideaService.create(userId, projectId, dto);
    return { success: true, data: idea };
  }

  @Patch(":ideaId")
  @ApiOperation({ summary: "Update an idea" })
  async updateIdea(
    @Request() req: RequestWithUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("ideaId", ParseUUIDPipe) ideaId: string,
    @Body() dto: UpdateResearchIdeaDto,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    const idea = await this.ideaService.update(userId, projectId, ideaId, dto);
    return { success: true, data: idea };
  }

  @Delete(":ideaId")
  @ApiOperation({ summary: "Delete an idea" })
  async deleteIdea(
    @Request() req: RequestWithUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("ideaId", ParseUUIDPipe) ideaId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    await this.ideaService.delete(userId, projectId, ideaId);
    return { success: true };
  }

  @Post("sessions/:sessionId/extract")
  @ApiOperation({ summary: "Extract ideas from a discussion session" })
  async extractIdeas(
    @Request() req: RequestWithUser,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException("User not authenticated");

    const ideas = await this.ideaService.extractFromSession(
      userId,
      projectId,
      sessionId,
    );
    return { success: true, data: ideas };
  }
}
