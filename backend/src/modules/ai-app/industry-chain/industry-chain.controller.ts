/**
 * Industry Chain Controller
 *
 * 安全规格（M6/M7）：
 *   - 类级 JwtAuthGuard（全端点需登录）
 *   - 分级限流：analyze ≤5/min，GET ≤30/min
 *   - service 层带 ownerId 越权过滤（M6）
 *   - topic 经 sanitizePromptInput 后再入编排（M7，防直接注入）
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import type { RequestWithUser } from "@/common/types/express-request.types";
import { sanitizePromptInput } from "@/modules/ai-engine/facade";
import { IndustryChainService } from "./industry-chain.service";
import { AnalyzeChainDto } from "./dto/analyze-chain.dto";

@UseGuards(JwtAuthGuard)
@Controller("industry-chain")
export class IndustryChainController {
  constructor(private readonly service: IndustryChainService) {}

  /** 发起产业链分析（动态编排 mission）。 */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("analyze")
  async analyze(@Request() req: RequestWithUser, @Body() dto: AnalyzeChainDto) {
    const userId = req.user!.id;
    const topic = sanitizePromptInput(dto.topic).sanitized;
    return this.service.analyze(userId, topic);
  }

  /** 产业链元信息 + 状态。 */
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get(":id")
  async getChain(@Request() req: RequestWithUser, @Param("id") id: string) {
    return this.service.getChain(req.user!.id, id);
  }

  /** 产业链图谱 {nodes,edges,stats}（供 KnowledgeGraphView）。 */
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get(":id/graph")
  async getGraph(@Request() req: RequestWithUser, @Param("id") id: string) {
    return this.service.getGraph(req.user!.id, id);
  }

  /** 单实体详情（点击节点）。 */
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get("entity/:entityId")
  async getEntity(
    @Request() req: RequestWithUser,
    @Param("entityId") entityId: string,
  ) {
    return this.service.getEntity(req.user!.id, entityId);
  }
}
