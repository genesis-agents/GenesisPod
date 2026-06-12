import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { ForesightGraphService } from "../services/foresight-graph.service";
import { ForesightPropagationService } from "../services/foresight-propagation.service";
import { ForesightReviewService } from "../services/foresight-review.service";
import { ForesightSeedService } from "../services/foresight-seed.service";
import {
  CreateForesightCardDto,
  CreateForesightEdgeDto,
  CreateForesightTopicDto,
  ResolveReviewDto,
  UpdateForesightCardDto,
  UpdateForesightTopicDto,
} from "../dto/foresight.dto";
import { BadRequestException, Query } from "@nestjs/common";

interface AuthenticatedRequest {
  user?: { id?: string };
}

@Controller("foresight")
@UseGuards(JwtAuthGuard)
export class ForesightController {
  constructor(
    private readonly graph: ForesightGraphService,
    private readonly propagation: ForesightPropagationService,
    private readonly review: ForesightReviewService,
    private readonly seedService: ForesightSeedService,
  ) {}

  private userId(req: AuthenticatedRequest): string {
    const id = req.user?.id;
    if (!id) throw new UnauthorizedException();
    return id;
  }

  @Get("topics")
  listTopics(@Req() req: AuthenticatedRequest) {
    return this.graph.listTopics(this.userId(req));
  }

  @Post("topics")
  createTopic(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateForesightTopicDto,
  ) {
    return this.graph.createTopic(this.userId(req), dto);
  }

  @Patch("topics/:id")
  updateTopic(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateForesightTopicDto,
  ) {
    return this.graph.updateTopic(this.userId(req), id, dto);
  }

  @Delete("topics/:id")
  deleteTopic(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.graph.deleteTopic(this.userId(req), id);
  }

  @Get("overview")
  overview(
    @Req() req: AuthenticatedRequest,
    @Query("topicId") topicId?: string,
  ) {
    if (!topicId) throw new BadRequestException("topicId is required");
    return this.graph.overview(this.userId(req), topicId);
  }

  @Post("seed")
  seed(@Req() req: AuthenticatedRequest) {
    return this.seedService.seed(this.userId(req));
  }

  @Post("cards")
  createCard(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateForesightCardDto,
  ) {
    return this.graph.createCard(this.userId(req), dto);
  }

  @Patch("cards/:id")
  updateCard(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateForesightCardDto,
  ) {
    return this.graph.updateCard(this.userId(req), id, dto);
  }

  @Delete("cards/:id")
  deleteCard(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.graph.deleteCard(this.userId(req), id);
  }

  @Get("cards/:id/ledger")
  ledger(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.graph.ledger(this.userId(req), id);
  }

  @Post("edges")
  createEdge(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateForesightEdgeDto,
  ) {
    return this.graph.createEdge(this.userId(req), dto);
  }

  @Delete("edges/:id")
  deleteEdge(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.graph.deleteEdge(this.userId(req), id);
  }

  @Post("signals/:id/inject")
  inject(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.propagation.inject(this.userId(req), id);
  }

  @Post("review/:id/resolve")
  resolve(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: ResolveReviewDto,
  ) {
    return this.review.resolve(this.userId(req), id, dto.decision);
  }
}
