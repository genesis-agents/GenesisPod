import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Logger,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { ConsciousnessService } from "./consciousness.service";
import {
  CreateProfileDto,
  UpdateProfileDto,
  AddDataSourceDto,
  SendConsciousnessMessageDto,
  CreateConversationDto,
  ShareProfileDto,
} from "./dto";

@ApiTags("Consciousness")
@Controller("consciousness")
@UseGuards(JwtAuthGuard)
export class ConsciousnessController {
  private readonly logger = new Logger(ConsciousnessController.name);

  constructor(private readonly consciousnessService: ConsciousnessService) {}

  // ─── Profiles ───

  @Post("profiles")
  @ApiOperation({ summary: "Create consciousness profile" })
  @ApiResponse({ status: 201, description: "Profile created" })
  async createProfile(
    @Request() req: { user: { id: string } },
    @Body() dto: CreateProfileDto,
  ) {
    return this.consciousnessService.createProfile(req.user.id, dto);
  }

  @Get("profiles")
  @ApiOperation({ summary: "Get all profiles for current user" })
  async getProfiles(@Request() req: { user: { id: string } }) {
    return this.consciousnessService.getProfiles(req.user.id);
  }

  @Get("profiles/shared")
  @ApiOperation({ summary: "Get profiles shared with current user" })
  async getSharedProfiles(@Request() req: { user: { id: string } }) {
    return this.consciousnessService.getSharedProfiles(req.user.id);
  }

  @Get("profiles/:id")
  @ApiOperation({ summary: "Get profile details" })
  @ApiResponse({ status: 404, description: "Not found" })
  async getProfile(
    @Request() req: { user: { id: string } },
    @Param("id") id: string,
  ) {
    return this.consciousnessService.getProfile(id, req.user.id);
  }

  @Patch("profiles/:id")
  @ApiOperation({ summary: "Update profile" })
  async updateProfile(
    @Request() req: { user: { id: string } },
    @Param("id") id: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.consciousnessService.updateProfile(id, req.user.id, dto);
  }

  @Delete("profiles/:id")
  @ApiOperation({ summary: "Delete profile" })
  async deleteProfile(
    @Request() req: { user: { id: string } },
    @Param("id") id: string,
  ) {
    return this.consciousnessService.deleteProfile(id, req.user.id);
  }

  // ─── Data Sources ───

  @Post("profiles/:profileId/sources")
  @ApiOperation({ summary: "Add data source to profile" })
  async addDataSource(
    @Request() req: { user: { id: string } },
    @Param("profileId") profileId: string,
    @Body() dto: AddDataSourceDto,
  ) {
    return this.consciousnessService.addDataSource(
      profileId,
      req.user.id,
      dto,
    );
  }

  @Delete("profiles/:profileId/sources/:sourceId")
  @ApiOperation({ summary: "Delete data source" })
  async deleteDataSource(
    @Request() req: { user: { id: string } },
    @Param("profileId") profileId: string,
    @Param("sourceId") sourceId: string,
  ) {
    return this.consciousnessService.deleteDataSource(
      profileId,
      sourceId,
      req.user.id,
    );
  }

  // ─── Analysis ───

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("profiles/:profileId/analyze")
  @ApiOperation({ summary: "Analyze profile data and build consciousness" })
  async analyzeProfile(
    @Request() req: { user: { id: string } },
    @Param("profileId") profileId: string,
  ) {
    return this.consciousnessService.analyzeProfile(
      profileId,
      req.user.id,
    );
  }

  // ─── Memories ───

  @Get("profiles/:profileId/memories")
  @ApiOperation({ summary: "Get profile memories" })
  async getMemories(
    @Request() req: { user: { id: string } },
    @Param("profileId") profileId: string,
    @Query("category") category?: string,
  ) {
    return this.consciousnessService.getMemories(
      profileId,
      req.user.id,
      category,
    );
  }

  // ─── Conversations ───

  @Post("profiles/:profileId/conversations")
  @ApiOperation({ summary: "Create conversation with avatar" })
  async createConversation(
    @Request() req: { user: { id: string } },
    @Param("profileId") profileId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.consciousnessService.createConversation(
      profileId,
      req.user.id,
      dto,
    );
  }

  @Get("profiles/:profileId/conversations")
  @ApiOperation({ summary: "List conversations" })
  async getConversations(
    @Request() req: { user: { id: string } },
    @Param("profileId") profileId: string,
  ) {
    return this.consciousnessService.getConversations(
      profileId,
      req.user.id,
    );
  }

  @Get("conversations/:conversationId")
  @ApiOperation({ summary: "Get conversation with messages" })
  async getConversation(
    @Request() req: { user: { id: string } },
    @Param("conversationId") conversationId: string,
  ) {
    return this.consciousnessService.getConversation(
      conversationId,
      req.user.id,
    );
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post("conversations/:conversationId/messages")
  @ApiOperation({ summary: "Send message to avatar" })
  async sendMessage(
    @Request() req: { user: { id: string } },
    @Param("conversationId") conversationId: string,
    @Body() dto: SendConsciousnessMessageDto,
  ) {
    return this.consciousnessService.sendMessage(
      conversationId,
      req.user.id,
      dto,
    );
  }

  // ─── Sharing ───

  @Post("profiles/:profileId/share")
  @ApiOperation({ summary: "Share profile with another user" })
  async shareProfile(
    @Request() req: { user: { id: string } },
    @Param("profileId") profileId: string,
    @Body() dto: ShareProfileDto,
  ) {
    return this.consciousnessService.shareProfile(
      profileId,
      req.user.id,
      dto,
    );
  }

  @Delete("profiles/:profileId/share/:sharedWithUserId")
  @ApiOperation({ summary: "Remove share" })
  async removeShare(
    @Request() req: { user: { id: string } },
    @Param("profileId") profileId: string,
    @Param("sharedWithUserId") sharedWithUserId: string,
  ) {
    return this.consciousnessService.removeShare(
      profileId,
      sharedWithUserId,
      req.user.id,
    );
  }
}
