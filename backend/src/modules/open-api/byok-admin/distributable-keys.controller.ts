import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../common/guards/admin.guard";
import { DistributableKeysService } from "../../ai-engine/credentials/distributable-keys/distributable-keys.service";
import { KeyAssignmentsService } from "../../ai-engine/credentials/key-assignments/key-assignments.service";
import {
  AssignKeyDto,
  CreateDistributableKeyDto,
  UpdateDistributableKeyDto,
} from "../../ai-engine/credentials/distributable-keys/dto";

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

@ApiTags("Admin - Distributable Keys")
@Controller("admin/distributable-keys")
@UseGuards(JwtAuthGuard, AdminGuard)
export class DistributableKeysController {
  constructor(
    private readonly service: DistributableKeysService,
    private readonly assignments: KeyAssignmentsService,
  ) {}

  @Get()
  async list(
    @Query("provider") provider?: string,
    @Query("isActive") isActive?: string,
  ) {
    const activeFilter =
      isActive === "true" ? true : isActive === "false" ? false : undefined;
    const items = await this.service.list({
      provider,
      isActive: activeFilter,
    });
    return { items };
  }

  @Throttle({ default: { ttl: 3600_000, limit: 50 } })
  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateDistributableKeyDto,
  ) {
    const created = await this.service.create({
      provider: dto.provider,
      label: dto.label,
      apiKey: dto.apiKey,
      apiEndpoint: dto.apiEndpoint,
      monthlyQuotaCents: dto.monthlyQuotaCents,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      createdBy: req.user.email,
    });
    return this.service.getView(created.id);
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const [key, assignments] = await Promise.all([
      this.service.getView(id),
      this.assignments.listByKey(id),
    ]);
    return { key, assignments };
  }

  @Patch(":id")
  async update(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateDistributableKeyDto,
  ) {
    await this.service.update(id, {
      label: dto.label,
      apiKey: dto.apiKey,
      apiEndpoint: dto.apiEndpoint,
      monthlyQuotaCents: dto.monthlyQuotaCents,
      expiresAt:
        dto.expiresAt === undefined
          ? undefined
          : dto.expiresAt === null
            ? null
            : new Date(dto.expiresAt),
      isActive: dto.isActive,
      updatedBy: req.user.email,
    });
    return this.service.getView(id);
  }

  @Delete(":id")
  async deactivate(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    await this.service.deactivate(id, req.user.email);
    return { success: true };
  }

  @Post(":id/assign")
  async assign(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: AssignKeyDto,
  ) {
    return this.assignments.assign({
      keyId: id,
      userId: dto.userId,
      userQuotaCents: dto.userQuotaCents ?? null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      assignedBy: req.user.email,
      note: dto.note,
    });
  }
}
