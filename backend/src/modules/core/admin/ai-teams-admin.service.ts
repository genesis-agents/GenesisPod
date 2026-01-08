import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  CreateTeamDto,
  UpdateTeamDto,
  CreateTeamMemberDto,
  UpdateTeamMemberDto,
  QueryTeamsDto,
} from "./dto/ai-team.dto";
import { AITeamTemplateStatus, Prisma } from "@prisma/client";

@Injectable()
export class AITeamsAdminService {
  private readonly logger = new Logger(AITeamsAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== Team CRUD ====================

  async createTeam(dto: CreateTeamDto) {
    this.logger.log(`Creating AI team template: ${dto.name}`);

    const {
      members,
      workflowConfig,
      constraintProfile,
      metadata,
      ...teamData
    } = dto;

    const team = await this.prisma.aITeamTemplate.create({
      data: {
        ...teamData,
        workflowConfig: workflowConfig as Prisma.InputJsonValue,
        constraintProfile: constraintProfile as Prisma.InputJsonValue,
        metadata: metadata as Prisma.InputJsonValue,
        members: members
          ? {
              create: members.map((m, index) => ({
                ...m,
                mcpTools: m.mcpTools as unknown as Prisma.InputJsonValue,
                sortOrder: m.sortOrder ?? index,
              })),
            }
          : undefined,
      },
      include: {
        members: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return team;
  }

  async getAllTeams(query: QueryTeamsDto = {}) {
    const { status, category, includeMembers = true } = query;

    const where: any = {};
    if (status) where.status = status;
    if (category) where.category = category;

    const teams = await this.prisma.aITeamTemplate.findMany({
      where,
      include: includeMembers
        ? {
            members: {
              orderBy: { sortOrder: "asc" },
            },
          }
        : undefined,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return {
      items: teams,
      total: teams.length,
    };
  }

  async getTeamById(id: string) {
    const team = await this.prisma.aITeamTemplate.findUnique({
      where: { id },
      include: {
        members: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!team) {
      throw new NotFoundException(`Team template not found: ${id}`);
    }

    return team;
  }

  async updateTeam(id: string, dto: UpdateTeamDto) {
    this.logger.log(`Updating AI team template: ${id}`);

    // Check if team exists
    const existing = await this.prisma.aITeamTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Team template not found: ${id}`);
    }

    // Prevent updating system teams' critical fields
    if (existing.isSystem && dto.isSystem === false) {
      throw new BadRequestException("Cannot change system flag of system team");
    }

    const { workflowConfig, constraintProfile, metadata, ...restDto } = dto;

    const team = await this.prisma.aITeamTemplate.update({
      where: { id },
      data: {
        ...restDto,
        ...(workflowConfig !== undefined && {
          workflowConfig: workflowConfig as Prisma.InputJsonValue,
        }),
        ...(constraintProfile !== undefined && {
          constraintProfile: constraintProfile as Prisma.InputJsonValue,
        }),
        ...(metadata !== undefined && {
          metadata: metadata as Prisma.InputJsonValue,
        }),
      },
      include: {
        members: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return team;
  }

  async deleteTeam(id: string) {
    this.logger.log(`Deleting AI team template: ${id}`);

    const existing = await this.prisma.aITeamTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`Team template not found: ${id}`);
    }

    if (existing.isSystem) {
      throw new BadRequestException("Cannot delete system team template");
    }

    await this.prisma.aITeamTemplate.delete({
      where: { id },
    });

    return { success: true, message: "Team template deleted" };
  }

  // ==================== Member CRUD ====================

  async addMember(teamId: string, dto: CreateTeamMemberDto) {
    this.logger.log(`Adding member to team: ${teamId}`);

    // Check if team exists
    const team = await this.prisma.aITeamTemplate.findUnique({
      where: { id: teamId },
      include: { members: true },
    });

    if (!team) {
      throw new NotFoundException(`Team template not found: ${teamId}`);
    }

    // Auto-assign sortOrder if not provided
    const maxSortOrder = Math.max(0, ...team.members.map((m) => m.sortOrder));

    const member = await this.prisma.aITeamMemberTemplate.create({
      data: {
        teamId,
        ...dto,
        mcpTools: dto.mcpTools as any,
        sortOrder: dto.sortOrder ?? maxSortOrder + 1,
      },
    });

    return member;
  }

  async updateMember(memberId: string, dto: UpdateTeamMemberDto) {
    this.logger.log(`Updating team member: ${memberId}`);

    const existing = await this.prisma.aITeamMemberTemplate.findUnique({
      where: { id: memberId },
    });

    if (!existing) {
      throw new NotFoundException(`Team member not found: ${memberId}`);
    }

    const member = await this.prisma.aITeamMemberTemplate.update({
      where: { id: memberId },
      data: {
        ...dto,
        mcpTools: dto.mcpTools as any,
      },
    });

    return member;
  }

  async deleteMember(memberId: string) {
    this.logger.log(`Deleting team member: ${memberId}`);

    const existing = await this.prisma.aITeamMemberTemplate.findUnique({
      where: { id: memberId },
    });

    if (!existing) {
      throw new NotFoundException(`Team member not found: ${memberId}`);
    }

    await this.prisma.aITeamMemberTemplate.delete({
      where: { id: memberId },
    });

    return { success: true, message: "Team member deleted" };
  }

  async reorderMembers(teamId: string, memberIds: string[]) {
    this.logger.log(`Reordering members for team: ${teamId}`);

    // Verify team exists
    const team = await this.prisma.aITeamTemplate.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new NotFoundException(`Team template not found: ${teamId}`);
    }

    // Update sort orders
    await this.prisma.$transaction(
      memberIds.map((memberId, index) =>
        this.prisma.aITeamMemberTemplate.update({
          where: { id: memberId },
          data: { sortOrder: index },
        }),
      ),
    );

    // Return updated team
    return this.getTeamById(teamId);
  }

  // ==================== Public API (for other apps) ====================

  async getActiveTeamTemplates(category?: string) {
    const where: any = {
      status: AITeamTemplateStatus.ACTIVE,
    };
    if (category) where.category = category;

    const teams = await this.prisma.aITeamTemplate.findMany({
      where,
      include: {
        members: {
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
    });

    return teams;
  }

  async getTeamTemplateById(id: string) {
    const team = await this.prisma.aITeamTemplate.findFirst({
      where: {
        id,
        status: AITeamTemplateStatus.ACTIVE,
      },
      include: {
        members: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!team) {
      throw new NotFoundException(`Active team template not found: ${id}`);
    }

    return team;
  }

  // ==================== Utility ====================

  async getAvailableTools() {
    // Return list of available built-in tools (AICapability enum)
    return {
      builtIn: [
        {
          id: "TEXT_GENERATION",
          name: "文本生成",
          description: "生成文本内容",
        },
        { id: "CODE_GENERATION", name: "代码生成", description: "生成代码" },
        { id: "CODE_REVIEW", name: "代码审查", description: "审查代码质量" },
        { id: "IMAGE_GENERATION", name: "图片生成", description: "生成图片" },
        { id: "IMAGE_ANALYSIS", name: "图片分析", description: "分析图片内容" },
        { id: "WEB_SEARCH", name: "网络搜索", description: "搜索网络信息" },
        { id: "URL_FETCH", name: "URL抓取", description: "抓取网页内容" },
        {
          id: "DOCUMENT_ANALYSIS",
          name: "文档分析",
          description: "分析文档内容",
        },
        { id: "REASONING", name: "深度推理", description: "复杂推理分析" },
        { id: "MATH", name: "数学计算", description: "数学运算" },
        { id: "TRANSLATION", name: "翻译", description: "多语言翻译" },
        { id: "SUMMARIZATION", name: "摘要生成", description: "生成内容摘要" },
      ],
    };
  }

  async getAvailableSkills() {
    // Return predefined skills
    return {
      research: [
        { id: "research-planning", name: "研究规划" },
        { id: "information-retrieval", name: "信息检索" },
        { id: "source-validation", name: "来源验证" },
        { id: "data-collection", name: "数据收集" },
      ],
      analysis: [
        { id: "data-analysis", name: "数据分析" },
        { id: "trend-insight", name: "趋势洞察" },
        { id: "logical-reasoning", name: "逻辑推理" },
        { id: "risk-identification", name: "风险识别" },
      ],
      content: [
        { id: "content-creation", name: "内容创作" },
        { id: "structure-organization", name: "结构组织" },
        { id: "language-polish", name: "语言润色" },
        { id: "style-control", name: "风格控制" },
      ],
      technical: [
        { id: "code-generation", name: "代码生成" },
        { id: "architecture-design", name: "架构设计" },
        { id: "debugging", name: "调试排错" },
        { id: "code-review", name: "代码审查" },
      ],
      collaboration: [
        { id: "quality-review", name: "质量审查" },
        { id: "content-integration", name: "内容整合" },
        { id: "consensus-building", name: "共识构建" },
        { id: "task-delegation", name: "任务分配" },
      ],
    };
  }

  async getBuiltInRoles() {
    return {
      leaders: [
        { id: "research-lead", name: "研究主管", description: "领导研究团队" },
        { id: "content-lead", name: "内容主管", description: "领导内容创作" },
        { id: "tech-lead", name: "技术主管", description: "领导技术开发" },
        { id: "moderator", name: "协调员", description: "协调团队工作" },
      ],
      members: [
        { id: "researcher", name: "研究员", description: "执行研究任务" },
        { id: "analyst", name: "分析师", description: "数据分析" },
        { id: "writer", name: "作家", description: "内容创作" },
        { id: "developer", name: "开发者", description: "代码开发" },
        { id: "designer", name: "设计师", description: "设计工作" },
        { id: "reviewer", name: "审查员", description: "质量审查" },
        { id: "advocate", name: "倡导者", description: "观点倡导" },
      ],
    };
  }

  async getWorkStyles() {
    return [
      {
        id: "AUTONOMOUS",
        name: "自主型",
        description: "独立完成任务，主动汇报",
      },
      {
        id: "COLLABORATIVE",
        name: "协作型",
        description: "频繁与其他Agent交流",
      },
      { id: "SUPPORTIVE", name: "支持型", description: "主要协助其他Agent" },
      { id: "ANALYTICAL", name: "分析型", description: "深度分析，谨慎输出" },
      { id: "CREATIVE", name: "创意型", description: "发散思维，提供创新方案" },
    ];
  }
}
