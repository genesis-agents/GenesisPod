import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { KeyAssignmentStatus } from "@prisma/client";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../../common/guards/admin.guard";
import { KeyAssignmentsService } from "./key-assignments.service";
import {
  RevokeAssignmentDto,
  UpdateAssignmentDto,
} from "../distributable-keys/dto";

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

@ApiTags("Admin - Key Assignments")
@Controller("admin/key-assignments")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminKeyAssignmentsController {
  constructor(private readonly service: KeyAssignmentsService) {}

  @Get()
  async list(
    @Query("status") status?: string,
    @Query("provider") provider?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ) {
    const parsedStatus =
      status &&
      Object.values(KeyAssignmentStatus).includes(status as KeyAssignmentStatus)
        ? (status as KeyAssignmentStatus)
        : undefined;
    const items = await this.service.listAll({
      status: parsedStatus,
      provider,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
    return { items };
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateAssignmentDto) {
    const status: KeyAssignmentStatus | undefined =
      dto.status === "ACTIVE" || dto.status === "SUSPENDED"
        ? (dto.status as KeyAssignmentStatus)
        : undefined;
    return this.service.update(id, {
      userQuotaCents:
        dto.userQuotaCents === undefined ? undefined : dto.userQuotaCents,
      expiresAt:
        dto.expiresAt === undefined
          ? undefined
          : dto.expiresAt === null
            ? null
            : new Date(dto.expiresAt),
      note: dto.note === undefined ? undefined : dto.note,
      status,
    });
  }

  @Delete(":id")
  async revoke(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: RevokeAssignmentDto,
  ) {
    return this.service.revoke(id, req.user.email, dto.reason);
  }
}
