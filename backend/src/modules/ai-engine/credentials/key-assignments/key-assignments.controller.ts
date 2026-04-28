import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { KeyAssignmentsService } from "./key-assignments.service";

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

@ApiTags("User - Key Assignments")
@Controller("user/key-assignments")
@UseGuards(JwtAuthGuard)
export class UserKeyAssignmentsController {
  constructor(private readonly service: KeyAssignmentsService) {}

  @Get()
  async listMine(@Req() req: AuthenticatedRequest) {
    return { items: await this.service.listByUser(req.user.id) };
  }
}
