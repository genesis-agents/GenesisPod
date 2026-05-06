/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): 用户自定义 Agent CRUD service
 *
 * publish 走 validateCustomAgentCompleteness 全 5 步校验。
 * options() 给前端拉真实可选项（skills / models / tools / primitives / 枚举）。
 * PR-E3 集成到 agent-playground.runMission 启动路径。
 */
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "@/common/prisma/prisma.service";
import { Prisma } from "@prisma/client";
import {
  SkillRegistry,
  ToolRegistry,
  ModelRecommendationsService,
  type ISkill,
} from "@/modules/ai-engine/facade";
import { MissionOwnershipRegistry } from "@/modules/ai-harness/facade";
import { PlaygroundPipelineDispatcher } from "@/modules/ai-app/agent-playground/services/mission/workflow/playground-pipeline-dispatcher.service";
import {
  MissionStore,
  type MissionListItem,
} from "@/modules/ai-app/agent-playground/services/mission/lifecycle/mission-store.service";
import { RunMissionInputSchema } from "@/modules/ai-app/agent-playground/dto/run-mission.dto";
import {
  CUSTOM_AGENT_PRIMITIVES,
  validateCustomAgentCompleteness,
  type CreateCustomAgentDto,
  type CustomAgentConfig,
  type UpdateCustomAgentDto,
} from "./dto/custom-agent.dto";
import { CustomAgentLaunchesService } from "./custom-agent-launches.service";

export interface CustomAgentOptionsResponse {
  primitives: ReadonlyArray<{
    id: string;
    label: string;
    description: string;
  }>;
  skills: Array<{
    id: string;
    name: string;
    domain: string;
    layer: string;
    description: string;
  }>;
  tools: Array<{
    id: string;
    name: string;
    category: string;
    description: string;
  }>;
  models: Array<{
    provider: string;
    modelType: string;
    patterns: string[];
    source: string;
  }>;
  enums: {
    languages: ReadonlyArray<string>;
    audiences: ReadonlyArray<string>;
    depths: ReadonlyArray<string>;
    lengthProfiles: ReadonlyArray<string>;
    budgetProfiles: ReadonlyArray<string>;
    styleProfiles: ReadonlyArray<string>;
  };
}

@Injectable()
export class CustomAgentsService {
  private readonly log = new Logger(CustomAgentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly skillRegistry: SkillRegistry,
    private readonly toolRegistry: ToolRegistry,
    private readonly modelRecommendations: ModelRecommendationsService,
    // R-CA: launch + missions endpoint 依赖
    private readonly launches: CustomAgentLaunchesService,
    private readonly pipelineDispatcher: PlaygroundPipelineDispatcher,
    private readonly missionStore: MissionStore,
    private readonly ownership: MissionOwnershipRegistry,
  ) {}

  async list(userId: string) {
    return this.prisma.customAgentDefinition.findMany({
      where: { userId, isEnabled: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getById(userId: string, id: string) {
    const found = await this.prisma.customAgentDefinition.findFirst({
      where: { id, userId },
    });
    if (!found) {
      throw new NotFoundException(
        "Custom agent not found or not owned by current user",
      );
    }
    return found;
  }

  async create(userId: string, dto: CreateCustomAgentDto) {
    return this.prisma.customAgentDefinition.create({
      data: {
        userId,
        workspaceId: dto.workspaceId,
        slug: dto.slug,
        displayName: dto.displayName,
        description: dto.description,
        config: dto.config as unknown as Prisma.InputJsonValue,
        status: "DRAFT",
        version: 1,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateCustomAgentDto) {
    const existing = await this.getById(userId, id);
    return this.prisma.customAgentDefinition.update({
      where: { id: existing.id },
      data: {
        displayName: dto.displayName ?? existing.displayName,
        description: dto.description ?? existing.description,
        config:
          dto.config === undefined
            ? undefined
            : ({
                ...((existing.config as Record<string, unknown>) ?? {}),
                ...(dto.config as Record<string, unknown>),
              } as unknown as Prisma.InputJsonValue),
        status: dto.status ?? existing.status,
        isEnabled: dto.isEnabled ?? existing.isEnabled,
      },
    });
  }

  async remove(userId: string, id: string) {
    const existing = await this.getById(userId, id);
    await this.prisma.customAgentDefinition.delete({
      where: { id: existing.id },
    });
    return { success: true };
  }

  /**
   * Publish: DRAFT → PUBLISHED + version++
   *
   * 走 validateCustomAgentCompleteness 全 5 步必填校验。
   * 校验失败抛 BadRequest，前端逐项展示。
   */
  async publish(userId: string, id: string) {
    const existing = await this.getById(userId, id);
    const config = existing.config as CustomAgentConfig | null;
    const issues = validateCustomAgentCompleteness(config);
    if (issues.length > 0) {
      throw new BadRequestException({
        message: "Custom agent 配置不完整，无法 publish",
        issues,
      });
    }
    return this.prisma.customAgentDefinition.update({
      where: { id: existing.id },
      data: { status: "PUBLISHED", version: existing.version + 1 },
    });
  }

  /**
   * POST /user/custom-agents/:id/translate
   *
   * E R4 Phase 2 PR-E3 (2026-05-05): 把 CustomAgentConfig 翻译成
   * agent-playground RunMissionInput。前端拿到后调 /agent-playground/team/run
   * 启动 mission。
   *
   * 翻译规则：
   *   basicInfo.language          → language (zh → zh-CN, en → en-US)
   *   basicInfo.audience          → audienceProfile + styleProfile
   *   topicSchema.goalTemplate    → topic 后缀（"{topic}（聚焦：{goalTemplate}）"）
   *   integration.defaultDepth    → depth
   *   integration.defaultLength   → lengthProfile
   *   integration.defaultBudget   → budgetProfile
   *
   * 当前 mission 14-stage pipeline 不消费 skills / pipeline.steps /
   * integration.allowedTools/Models —— 这些字段在 metadata 里随 mission 走，
   * 后续 dispatcher 支持 ACL 时再启用。
   */
  async translate(
    userId: string,
    id: string,
    body: { topic: string; overrides?: Record<string, unknown> },
  ): Promise<{
    input: Record<string, unknown>;
    metadata: {
      customAgentId: string;
      customAgentSlug: string;
      version: number;
    };
  }> {
    if (!body?.topic || body.topic.trim().length < 2) {
      throw new BadRequestException("topic required (min 2 chars)");
    }
    const existing = await this.getById(userId, id);
    if (existing.status !== "PUBLISHED") {
      throw new BadRequestException(
        "Custom agent must be PUBLISHED before launching mission",
      );
    }
    const config = (existing.config as CustomAgentConfig | null) ?? {};

    // language: zh → zh-CN, en → en-US（默认 zh-CN）
    const lang = config.basicInfo?.language;
    const language: "zh-CN" | "en-US" = lang === "en" ? "en-US" : "zh-CN";

    // audience → audienceProfile + styleProfile
    let audienceProfile: "executive" | "domain-expert" | "general-public" =
      "domain-expert";
    let styleProfile: "academic" | "executive" | "journalistic" | "technical" =
      "executive";
    switch (config.basicInfo?.audience) {
      case "general":
        audienceProfile = "general-public";
        styleProfile = "journalistic";
        break;
      case "executive":
        audienceProfile = "executive";
        styleProfile = "executive";
        break;
      case "technical":
        audienceProfile = "domain-expert";
        styleProfile = "technical";
        break;
      case "academic":
        audienceProfile = "domain-expert";
        styleProfile = "academic";
        break;
    }

    const topic = config.topicSchema?.goalTemplate
      ? `${body.topic.trim()}（聚焦：${config.topicSchema.goalTemplate}）`
      : body.topic.trim();

    const input: Record<string, unknown> = {
      topic,
      language,
      audienceProfile,
      styleProfile,
      depth: config.integration?.defaultDepth ?? "deep",
      lengthProfile: config.integration?.defaultLength ?? "standard",
      budgetProfile: config.integration?.defaultBudget ?? "medium",
      withFigures: true,
      auditLayers: "default",
      concurrency: 3,
      viewMode: "continuous",
      ...(body.overrides ?? {}),
    };

    return {
      input,
      metadata: {
        customAgentId: existing.id,
        customAgentSlug: existing.slug,
        version: existing.version,
      },
    };
  }

  /**
   * POST /user/custom-agents/:id/launch  (R-CA 2026-05-05)
   *
   * 一站式启动：translate → 调 dispatcher 启动 mission → 写 launch 行 → 返 missionId。
   * 让前端 "启动" 按钮一次调用即可。playground 不感知 custom agent 存在；
   * "我用这个 agent 跑过哪些 mission" 由本模块的 launches 表自己跟踪。
   */
  async launch(
    userId: string,
    id: string,
    body: { topic: string; overrides?: Record<string, unknown> },
  ): Promise<{ missionId: string; streamNamespace: string }> {
    const translated = await this.translate(userId, id, body);
    const parsed = RunMissionInputSchema.safeParse(translated.input);
    if (!parsed.success) {
      throw new BadRequestException(
        `Translated input invalid: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}:${i.message}`)
          .join("; ")}`,
      );
    }
    const missionId = randomUUID();
    this.ownership.assign(missionId, userId);

    // ★ R-CA 时序保证（清零风险 #3 + 健壮性 bug #1/#2）：
    //   等 dispatcher 跑完 Phase A（store.create + session 装配）+ 同步触发
    //   afterRowCreated 写 launches；rowReadyResolve 解锁本 endpoint return。
    //   长耗时 Phase B（orchestrator stages）继续 fire-and-forget。
    //
    //   健壮性：
    //   - afterRowCreated 内用 try-finally：launches.record 万一抛错也保证 resolve，
    //     不让 endpoint hang（bug #1 防御）
    //   - rowReadySettled flag：rowReady 已 settled 后 dispatcher 后续阶段抛错走
    //     普通 log，不再 reject（避免 endpoint return 后的 unhandled promise rejection，
    //     bug #2 防御）
    let rowReadySettled = false;
    let rowReadyResolveInner!: () => void;
    let rowReadyRejectInner!: (err: unknown) => void;
    const rowReady = new Promise<void>((resolve, reject) => {
      rowReadyResolveInner = resolve;
      rowReadyRejectInner = reject;
    });
    const settle = (kind: "ok" | "err", err?: unknown) => {
      if (rowReadySettled) return;
      rowReadySettled = true;
      if (kind === "ok") rowReadyResolveInner();
      else rowReadyRejectInner(err);
    };
    const customAgentId = translated.metadata.customAgentId;
    void this.pipelineDispatcher
      .runMission(missionId, parsed.data, userId, undefined, async () => {
        // 此时 mission row 已 INSERT、session 已 register；写 launches 后解锁 endpoint
        try {
          await this.launches.record({
            userId,
            customAgentId,
            missionId,
            topic: parsed.data.topic,
          });
        } finally {
          // 即便 launches.record 抛错也 resolve —— mission 已成功创建，不能让 endpoint hang
          settle("ok");
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (rowReadySettled) {
          // endpoint 早已 return；这是 mission 后期 stage 失败，普通 log 不要 unhandled
          this.log.error(
            `[launch ${customAgentId}→${missionId}] mission failed after start: ${msg}`,
          );
        } else {
          // afterRowCreated 之前抛错（罕见，DB create 失败）→ 让 endpoint 也失败
          this.log.error(
            `[launch ${customAgentId}→${missionId}] failed before row created: ${msg}`,
          );
          settle("err", err);
        }
      });
    await rowReady;
    return { missionId, streamNamespace: "agent-playground" };
  }

  /**
   * POST /user/custom-agents/:id/missions/attach  (R-CA 2026-05-05 风险#1 清零)
   *
   * 把一个已有的 playground mission 关联到该 custom agent（写一条 launch 行）。
   * 用途：用户在 agent 主页点 mission 卡片"重跑"，前端拿到 rerun 出的新 missionId
   * 后立即调本接口，让新 mission 也归属到该 agent，主页 mission 网格里能看到。
   *
   * 防越权 + 防垃圾数据：
   *   - 校验 agent 归属当前用户
   *   - 校验 mission 归属当前用户
   *   - 重复 attach 同 missionId 仅写一行（PostgreSQL upsert 用 missionId 索引去重）
   */
  async attachMissionToAgent(
    userId: string,
    id: string,
    body: { missionId: string; topic?: string },
  ): Promise<{ ok: true }> {
    if (!body?.missionId || typeof body.missionId !== "string") {
      throw new BadRequestException("missionId required");
    }
    const agent = await this.prisma.customAgentDefinition
      .findUnique({ where: { id }, select: { userId: true } })
      .catch(() => null);
    if (!agent) throw new NotFoundException("Custom agent not found");
    if (agent.userId !== userId) {
      throw new ForbiddenException("Not owner of this custom agent");
    }
    // 校验 mission 归当前用户（防越权挂接别人的 mission 到自己 agent）
    const mission = await this.prisma.agentPlaygroundMission
      .findUnique({
        where: { id: body.missionId },
        select: { userId: true, topic: true },
      })
      .catch(() => null);
    if (!mission) throw new NotFoundException("Mission not found");
    if (mission.userId !== userId) {
      throw new ForbiddenException("Not owner of this mission");
    }
    // 已存在则不重复写（idempotent）
    const existing = await this.prisma.customAgentLaunch
      .findFirst({
        where: { userId, customAgentId: id, missionId: body.missionId },
        select: { id: true },
      })
      .catch(() => null);
    if (existing) return { ok: true };
    await this.launches.record({
      userId,
      customAgentId: id,
      missionId: body.missionId,
      topic: body.topic ?? mission.topic,
    });
    return { ok: true };
  }

  /**
   * GET /user/custom-agents/:id/missions  (R-CA 2026-05-05)
   *
   * 拿该用户用此 custom agent 启动过的所有 mission（cards 数据）。
   * 内部：先从 launches 表拉该 agent 的 missionId 列表，再 join playground
   * mission 表拿状态/topic/score 等渲染字段。已删除的 mission 自动跳过。
   */
  async listMissionsByAgent(
    userId: string,
    id: string,
  ): Promise<{ items: MissionListItem[] }> {
    const agent = await this.prisma.customAgentDefinition
      .findUnique({ where: { id }, select: { userId: true } })
      .catch(() => null);
    if (!agent) throw new NotFoundException("Custom agent not found");
    if (agent.userId !== userId) {
      throw new ForbiddenException("Not owner of this custom agent");
    }
    const missionIds = await this.launches.listMissionIdsForAgent(userId, id);
    const items = await this.missionStore.listByMissionIds(userId, missionIds);
    return { items };
  }

  /**
   * GET /user/custom-agents/options —— 前端 5 步向导拉选项。
   *
   * skills / tools 从 in-memory registry 读（boot 时 SkillLoader / ToolLoader
   * 已加载）；models 从 ModelRecommendationsService（DB + 默认推荐合并）。
   */
  async options(): Promise<CustomAgentOptionsResponse> {
    const skills: ISkill[] = this.skillRegistry.getAll();
    const tools = this.toolRegistry.getEnabled();
    const recommendations = await this.modelRecommendations.listAll();

    return {
      primitives: CUSTOM_AGENT_PRIMITIVES,
      skills: skills.map((s) => ({
        id: s.id,
        name: s.name,
        domain: s.domain,
        layer: String(s.layer),
        description: s.description,
      })),
      tools: tools.map((t) => ({
        id: t.id,
        name: t.name,
        category: String(t.category),
        description: t.description ?? "",
      })),
      models: recommendations.map((r) => ({
        provider: r.provider,
        modelType: String(r.modelType),
        patterns: r.patterns,
        source: r.source,
      })),
      enums: {
        languages: ["zh", "en"] as const,
        audiences: ["general", "executive", "technical", "academic"] as const,
        depths: ["quick", "standard", "deep"] as const,
        lengthProfiles: [
          "brief",
          "standard",
          "deep",
          "extended",
          "epic",
          "mega",
        ] as const,
        budgetProfiles: ["low", "medium", "high", "unlimited"] as const,
        styleProfiles: [
          "academic",
          "executive",
          "journalistic",
          "technical",
        ] as const,
      },
    };
  }
}
