import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../../common/guards/admin.guard";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  CreateResearchTemplateDto,
  UpdateResearchTemplateDto,
} from "../dto/research-template-admin.dto";

@ApiTags("Admin - Research Templates")
@Controller("admin/research/templates")
@UseGuards(JwtAuthGuard, AdminGuard)
export class ResearchController {
  private readonly logger = new Logger(ResearchController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "List all research templates" })
  @ApiQuery({
    name: "category",
    required: false,
    description: "Filter by category",
  })
  @ApiQuery({
    name: "enabled",
    required: false,
    description: "Filter by enabled status",
  })
  @ApiResponse({
    status: 200,
    description: "Returns list of research templates",
  })
  async findAll(
    @Query("category") category?: string,
    @Query("enabled") enabled?: string,
  ) {
    this.logger.log("Admin: Fetching research templates");
    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (enabled !== undefined) where.enabled = enabled === "true";

    return this.prisma.researchTemplate.findMany({
      where,
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
  }

  @Get(":id")
  @ApiOperation({ summary: "Get research template by ID" })
  @ApiParam({ name: "id", description: "Research template ID" })
  @ApiResponse({ status: 200, description: "Returns research template" })
  async findOne(@Param("id") id: string) {
    const template = await this.prisma.researchTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException(`Research template ${id} not found`);
    }
    return template;
  }

  @Post()
  @ApiOperation({ summary: "Create research template" })
  @ApiResponse({ status: 201, description: "Research template created" })
  async create(@Body() dto: CreateResearchTemplateDto) {
    this.logger.log(`Admin: Creating research template ${dto.templateId}`);
    return this.prisma.researchTemplate.create({
      data: {
        templateId: dto.templateId,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        dimensions: dto.dimensions as Prisma.InputJsonValue,
        dataSources: dto.dataSources ?? [],
        guidancePrompt: dto.guidancePrompt,
        reportStructure: dto.reportStructure as
          | Prisma.InputJsonValue
          | undefined,
        iterationCount: dto.iterationCount ?? 3,
        enabled: dto.enabled ?? true,
        isBuiltIn: false,
      },
    });
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update research template" })
  @ApiParam({ name: "id", description: "Research template ID" })
  @ApiResponse({ status: 200, description: "Research template updated" })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateResearchTemplateDto,
  ) {
    this.logger.log(`Admin: Updating research template ${id}`);
    const existing = await this.prisma.researchTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Research template ${id} not found`);
    }
    return this.prisma.researchTemplate.update({
      where: { id },
      data: dto as Prisma.ResearchTemplateUpdateInput,
    });
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete research template (non-built-in only)" })
  @ApiParam({ name: "id", description: "Research template ID" })
  @ApiResponse({ status: 200, description: "Research template deleted" })
  async delete(@Param("id") id: string) {
    this.logger.log(`Admin: Deleting research template ${id}`);
    const existing = await this.prisma.researchTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Research template ${id} not found`);
    }
    if (existing.isBuiltIn) {
      throw new BadRequestException("Cannot delete built-in research template");
    }
    return this.prisma.researchTemplate.delete({ where: { id } });
  }

  @Post(":id/duplicate")
  @ApiOperation({ summary: "Duplicate a research template" })
  @ApiParam({ name: "id", description: "Research template ID to duplicate" })
  @ApiResponse({ status: 201, description: "Research template duplicated" })
  async duplicate(@Param("id") id: string) {
    this.logger.log(`Admin: Duplicating research template ${id}`);
    const existing = await this.prisma.researchTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Research template ${id} not found`);
    }

    return this.prisma.researchTemplate.create({
      data: {
        templateId: `${existing.templateId}-copy-${Date.now()}`,
        name: `${existing.name} (Copy)`,
        description: existing.description,
        category: existing.category,
        dimensions: existing.dimensions as Prisma.InputJsonValue,
        dataSources: existing.dataSources,
        guidancePrompt: existing.guidancePrompt,
        reportStructure:
          (existing.reportStructure as Prisma.InputJsonValue | undefined) ??
          undefined,
        iterationCount: existing.iterationCount,
        enabled: existing.enabled,
        isBuiltIn: false,
        usageCount: 0,
      },
    });
  }
}
