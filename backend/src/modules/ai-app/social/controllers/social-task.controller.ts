import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { SocialTaskService } from '../services/social-task.service';
import { CreateSocialTaskDto } from '../dto/create-social-task.dto';

interface AuthenticatedRequest {
  user?: { id?: string };
}

@Controller('ai-social/tasks')
@UseGuards(JwtAuthGuard)
export class SocialTaskController {
  constructor(private readonly taskService: SocialTaskService) {}

  @Post()
  async createTask(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSocialTaskDto,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.taskService.createTask(dto, userId);
  }

  @Get()
  async listTasks(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.taskService.listTasks(userId, {
      status,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  async getTask(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.taskService.getTask(id, userId);
  }

  @Delete(':id')
  async cancelTask(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    await this.taskService.cancelTask(id, userId);
    return { success: true };
  }
}
