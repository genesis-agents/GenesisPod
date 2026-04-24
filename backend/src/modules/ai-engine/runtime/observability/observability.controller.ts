import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../../common/guards/admin.guard";
import { TraceCollectorService } from "./trace-collector.service";
import type { TraceType } from "./trace.interface";

/**
 * Admin Observability Controller
 *
 * Exposes Agent Trace data for debugging and monitoring.
 * Requires admin authentication.
 *
 * GET /api/v1/admin/traces         - list recent traces
 * GET /api/v1/admin/traces/stats   - trace statistics
 * GET /api/v1/admin/traces/:id     - trace detail with spans
 */
@ApiTags("Admin - Observability")
@Controller("admin/traces")
@UseGuards(JwtAuthGuard, AdminGuard)
export class ObservabilityController {
  constructor(private readonly traceCollector: TraceCollectorService) {}

  @Get()
  async listTraces(
    @Query("type") type?: string,
    @Query("limit") limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const traces = await this.traceCollector.listTraces({
      type: type as TraceType | undefined,
      limit: Number.isNaN(parsedLimit) ? 50 : parsedLimit,
    });

    return { data: traces };
  }

  // NOTE: @Get("stats") MUST be declared before @Get(":id") to prevent NestJS
  // from treating the literal string "stats" as a trace ID. Do not reorder.
  @Get("stats")
  getStats() {
    return { data: this.traceCollector.getStats() };
  }

  @Get(":id")
  getTrace(@Param("id") id: string) {
    const trace = this.traceCollector.getTrace(id);
    if (!trace) {
      throw new NotFoundException("Trace not found");
    }
    return { data: trace };
  }
}
