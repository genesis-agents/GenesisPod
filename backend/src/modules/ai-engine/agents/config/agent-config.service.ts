import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";

@Injectable()
export class AgentConfigService {
  private readonly logger = new Logger(AgentConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters?: { domain?: string; enabled?: boolean }) {
    const where: Record<string, unknown> = {};
    if (filters?.domain) where.domain = filters.domain;
    if (filters?.enabled !== undefined) where.enabled = filters.enabled;
    return this.prisma.agentConfig.findMany({
      where,
      orderBy: [{ domain: "asc" }, { name: "asc" }],
    });
  }

  async findOne(id: string) {
    const config = await this.prisma.agentConfig.findUnique({ where: { id } });
    if (!config) throw new NotFoundException(`AgentConfig ${id} not found`);
    return config;
  }

  async findByAgentId(agentId: string) {
    return this.prisma.agentConfig.findUnique({ where: { agentId } });
  }

  async create(data: {
    agentId: string;
    name: string;
    description?: string;
    agentType: string;
    domain: string;
    systemPrompt: string;
    tools?: string[];
    skills?: string[];
    modelType?: string;
    taskProfile?: Prisma.InputJsonValue;
    enabled?: boolean;
  }) {
    return this.prisma.agentConfig.create({
      data: {
        agentId: data.agentId,
        name: data.name,
        description: data.description,
        agentType: data.agentType,
        domain: data.domain,
        systemPrompt: data.systemPrompt,
        tools: data.tools ?? [],
        skills: data.skills ?? [],
        modelType: data.modelType,
        taskProfile: data.taskProfile,
        enabled: data.enabled ?? true,
        isBuiltIn: false,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      systemPrompt: string;
      tools: string[];
      skills: string[];
      modelType: string;
      taskProfile: Prisma.InputJsonValue;
      enabled: boolean;
    }>,
  ) {
    await this.findOne(id); // throws if not found
    return this.prisma.agentConfig.update({
      where: { id },
      data: data as Prisma.AgentConfigUpdateInput,
    });
  }

  async delete(id: string) {
    const config = await this.findOne(id);
    if (config.isBuiltIn) {
      throw new BadRequestException(
        "Cannot delete built-in agent configuration",
      );
    }
    return this.prisma.agentConfig.delete({ where: { id } });
  }

  async getEffectiveConfig(agentId: string) {
    const dbConfig = await this.findByAgentId(agentId);
    if (dbConfig) return dbConfig;
    return null; // Caller should fallback to code-registered config
  }

  async seedDefaults(
    agents: Array<{
      agentId: string;
      name: string;
      description?: string;
      agentType: string;
      domain: string;
      systemPrompt: string;
      tools?: string[];
      skills?: string[];
    }>,
  ) {
    let created = 0;
    for (const agent of agents) {
      const existing = await this.findByAgentId(agent.agentId);
      if (!existing) {
        await this.prisma.agentConfig.create({
          data: {
            ...agent,
            tools: agent.tools ?? [],
            skills: agent.skills ?? [],
            isBuiltIn: true,
          },
        });
        created++;
      }
    }
    this.logger.log(`Seeded ${created} default agent configs`);
    return created;
  }
}
