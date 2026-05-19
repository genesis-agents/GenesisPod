import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { SocialDataSourceRegistry } from '../registry/social-data-source.registry';

interface AuthenticatedRequest {
  user?: { id?: string };
}

@Controller('ai-social/data-sources')
@UseGuards(JwtAuthGuard)
export class SocialDataSourceController {
  constructor(private readonly registry: SocialDataSourceRegistry) {}

  @Get()
  list() {
    return { items: this.registry.listDescriptors() };
  }

  @Get(':id/items')
  async listItems(
    @Param('id') id: string,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    const source = this.registry.get(id);
    if (!source) throw new NotFoundException(`Unknown source: ${id}`);

    const userId = req?.user?.id;
    if (!userId) throw new UnauthorizedException();

    return source.listItems(userId, {
      search,
      cursor,
      limit: limit ? parseInt(limit, 10) : 30,
    });
  }
}
