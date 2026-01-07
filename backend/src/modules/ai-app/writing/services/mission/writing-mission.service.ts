/**
 * Writing Mission Service
 *
 * 将 AI Teams 的 Mission 机制与 Writing Agents 集成，
 * 提供完整的章节写作任务编排能力。
 *
 * 核心流程：
 * 1. 创建写作任务 → 注入 Story Bible 上下文
 * 2. Story Architect (Leader) 规划执行计划
 * 3. 委派给 Writer/Checker/Editor Agents
 * 4. Bible Keeper 验证一致性
 * 5. 收集结果并更新 Story Bible
 */

import { Injectable, Logger } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

// AI Engine 核心依赖
import { MissionOrchestrator } from "../../../../ai-engine/teams/orchestrator/mission-orchestrator";
import { TeamFactory } from "../../../../ai-engine/teams/factory/team-factory";
import { TeamRegistry } from "../../../../ai-engine/teams/registry/team-registry";
import { RoleRegistry } from "../../../../ai-engine/teams/registry/role-registry";
import { ITeam } from "../../../../ai-engine/teams/abstractions/team.interface";
import {
  MissionInput,
  MissionEvent,
  MissionResult,
} from "../../../../ai-engine/teams/abstractions/mission.interface";
import { ConstraintProfile } from "../../../../ai-engine/teams/constraints";

// AI Engine Long Content - 长篇内容处理能力
import {
  LongContentEngineService,
  LongContentProjectConfig,
  TaskExecutionContext,
} from "../../../../ai-engine/long-content";
import { GranularityLevel } from "../../../../ai-engine/long-content/interfaces";

// Writing Agents
import {
  StoryArchitectAgent,
  BibleKeeperAgent,
  WriterAgent,
  ConsistencyCheckerAgent,
  EditorAgent,
} from "../../agents";

// Writing Context
import {
  WritingContextPackage,
  createWritingContextPackage,
} from "../../interfaces/writing-context.interface";

// Services
import { ContextBuilderService } from "../writing/context-builder.service";
import { StoryBibleService } from "../bible/story-bible.service";

/**
 * 写作任务类型
 */
export type WritingMissionType =
  | "outline" // 大纲创作
  | "chapter" // 章节写作
  | "revision" // 修订
  | "consistency" // 一致性检查
  | "full_story"; // 完整故事创作

/**
 * 写作任务输入
 */
export interface WritingMissionInput {
  /** 项目ID */
  projectId: string;
  /** 任务类型 */
  missionType: WritingMissionType;
  /** 目标章节ID（可选） */
  chapterId?: string;
  /** 目标卷ID（可选） */
  volumeId?: string;
  /** 用户指令 */
  userPrompt: string;
  /** 目标字数 */
  targetWordCount?: number;
  /** 额外指令 */
  additionalInstructions?: string;
  /** 并行写作数量 */
  parallelWriters?: number;
}

/**
 * 写作任务结果
 */
export interface WritingMissionResult extends MissionResult {
  /** 生成的内容 */
  content?: string;
  /** 字数 */
  wordCount?: number;
  /** 质量指标（来自 LongContentEngine） */
  qualityMetrics?: {
    overall: number;
    wordCount: number;
    coherence: number;
    completeness: number;
    consistency: number;
  };
  /** 一致性检查结果 */
  consistencyReport?: {
    status: "PASSED" | "ISSUES_FOUND";
    issues: Array<{
      type: string;
      severity: string;
      description: string;
    }>;
  };
  /** Story Bible 更新建议 */
  bibleUpdates?: Array<{
    type: "character_state" | "timeline_event" | "new_fact";
    data: Record<string, unknown>;
  }>;
}

/**
 * Writing Mission Service
 */
@Injectable()
export class WritingMissionService {
  private readonly logger = new Logger(WritingMissionService.name);

  // Writing Team 配置
  private writingTeam: ITeam | null = null;
  private readonly WRITING_TEAM_ID = "ai-writing-team";

  constructor(
    private readonly prisma: PrismaService,
    private readonly missionOrchestrator: MissionOrchestrator,
    private readonly teamFactory: TeamFactory,
    private readonly teamRegistry: TeamRegistry,
    private readonly roleRegistry: RoleRegistry,
    private readonly contextBuilder: ContextBuilderService,
    private readonly storyBibleService: StoryBibleService,
    // AI Engine Long Content - 长篇内容处理
    private readonly longContentEngine: LongContentEngineService,
    // Writing Agents (injected from module)
    private readonly storyArchitect: StoryArchitectAgent,
    private readonly bibleKeeper: BibleKeeperAgent,
    private readonly writer: WriterAgent,
    private readonly consistencyChecker: ConsistencyCheckerAgent,
    private readonly editor: EditorAgent,
  ) {
    // 初始化时创建 Writing Team
    this.initializeWritingTeam();
    void this.contextBuilder;
    void this.storyBibleService;
  }

  /**
   * 初始化 Writing Team
   */
  private async initializeWritingTeam(): Promise<void> {
    try {
      // 注册 Writing 角色
      this.registerWritingRoles();

      // 注册 Writing Team 配置
      this.registerWritingTeamConfig();

      // 创建 Team 实例
      this.writingTeam = this.teamFactory.createFromId(this.WRITING_TEAM_ID);

      this.logger.log("Writing Team initialized successfully");
    } catch (error) {
      this.logger.error(
        `Failed to initialize Writing Team: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 注册 Writing 角色
   */
  private registerWritingRoles(): void {
    // Story Architect (Leader)
    this.roleRegistry.register({
      id: "story-architect",
      name: "Story Architect",
      description: "故事架构师，负责整体规划和协调",
      type: "leader",
      coreSkills: ["story-planning", "outline-generation"],
      optionalSkills: [],
      coreTools: ["text-generation"],
      optionalTools: ["task-delegation"],
      responsibilities: ["整体规划", "任务分配", "质量审核"],
      limitations: [],
      defaultWorkStyle: {
        thinkingDepth: "deep",
        outputStyle: "detailed",
        collaborationStyle: "directive",
        riskTolerance: "conservative",
      },
      systemPromptTemplate: this.storyArchitect.description,
    });

    // Bible Keeper
    this.roleRegistry.register({
      id: "bible-keeper",
      name: "Bible Keeper",
      description: "Story Bible 守护者，维护设定一致性",
      type: "member",
      coreSkills: ["setting-validation", "fact-extraction"],
      optionalSkills: [],
      coreTools: ["rag-search"],
      optionalTools: ["knowledge-graph"],
      responsibilities: ["设定查询", "一致性验证", "事实提取"],
      limitations: [],
      defaultWorkStyle: {
        thinkingDepth: "standard",
        outputStyle: "balanced",
        collaborationStyle: "cooperative",
        riskTolerance: "moderate",
      },
      systemPromptTemplate: this.bibleKeeper.description,
    });

    // Writer
    this.roleRegistry.register({
      id: "writer",
      name: "Writer",
      description: "专业写作 Agent，执行章节创作",
      type: "member",
      coreSkills: ["creative-writing", "dialogue-writing"],
      optionalSkills: [],
      coreTools: ["text-generation"],
      optionalTools: [],
      responsibilities: ["章节写作", "对话创作", "场景描写"],
      limitations: [],
      defaultWorkStyle: {
        thinkingDepth: "standard",
        outputStyle: "detailed",
        collaborationStyle: "cooperative",
        riskTolerance: "moderate",
      },
      systemPromptTemplate: this.writer.description,
    });

    // Consistency Checker
    this.roleRegistry.register({
      id: "consistency-checker",
      name: "Consistency Checker",
      description: "一致性检查专家，确保内容与 Story Bible 一致",
      type: "member",
      coreSkills: ["consistency-check", "fact-verification"],
      optionalSkills: [],
      coreTools: ["data-analysis"],
      optionalTools: [],
      responsibilities: ["一致性检查", "事实验证", "问题报告"],
      limitations: [],
      defaultWorkStyle: {
        thinkingDepth: "deep",
        outputStyle: "balanced",
        collaborationStyle: "cooperative",
        riskTolerance: "conservative",
      },
      systemPromptTemplate: this.consistencyChecker.description,
    });

    // Editor
    this.roleRegistry.register({
      id: "editor",
      name: "Editor",
      description: "专业编辑，负责修订和润色",
      type: "member",
      coreSkills: ["editing", "polishing"],
      optionalSkills: ["style-unification"],
      coreTools: ["text-generation"],
      optionalTools: [],
      responsibilities: ["文字润色", "问题修复", "风格统一"],
      limitations: [],
      defaultWorkStyle: {
        thinkingDepth: "standard",
        outputStyle: "detailed",
        collaborationStyle: "cooperative",
        riskTolerance: "moderate",
      },
      systemPromptTemplate: this.editor.description,
    });

    this.logger.log("Registered 5 Writing roles");
  }

  /**
   * 注册 Writing Team 配置
   */
  private registerWritingTeamConfig(): void {
    this.teamRegistry.registerConfig({
      id: this.WRITING_TEAM_ID,
      name: "AI Writing Team",
      description: "专业的 AI 写作团队，由 5 个专职 Agent 组成",
      type: "predefined",
      leaderRoleId: "story-architect",
      memberRoles: [
        { roleId: "bible-keeper", minCount: 1, maxCount: 1, required: true },
        { roleId: "writer", minCount: 1, maxCount: 3, required: true }, // 支持并行
        {
          roleId: "consistency-checker",
          minCount: 1,
          maxCount: 2,
          required: true,
        },
        { roleId: "editor", minCount: 1, maxCount: 1, required: true },
      ],
      workflow: {
        id: "writing-workflow",
        name: "写作工作流",
        type: "sequential",
        steps: [
          {
            id: "plan",
            name: "规划",
            description: "分析任务，生成执行计划",
            type: "task",
            executorRoles: ["story-architect"],
            dependsOn: [],
          },
          {
            id: "context-injection",
            name: "上下文注入",
            description: "从 Story Bible 获取相关设定",
            type: "task",
            executorRoles: ["bible-keeper"],
            dependsOn: ["plan"],
          },
          {
            id: "write",
            name: "写作",
            description: "执行章节写作",
            type: "task",
            executorRoles: ["writer"],
            dependsOn: ["context-injection"],
          },
          {
            id: "check",
            name: "一致性检查",
            description: "检查内容与 Story Bible 的一致性",
            type: "task",
            executorRoles: ["consistency-checker"],
            dependsOn: ["write"],
          },
          {
            id: "edit",
            name: "编辑",
            description: "修复问题并润色",
            type: "task",
            executorRoles: ["editor"],
            dependsOn: ["check"],
          },
          {
            id: "review",
            name: "最终审核",
            description: "Leader 审核最终输出",
            type: "review",
            executorRoles: ["story-architect"],
            dependsOn: ["edit"],
          },
        ],
      },
      availableSkills: ["creative-writing", "consistency-check"],
      availableTools: ["text-generation", "rag-search"],
      constraintProfile: {
        cost: {
          budget: 1000,
          modelPreference: "balanced",
          allowOverBudget: false,
          warningThreshold: 0.8,
        },
        quality: {
          depth: "comprehensive",
          accuracy: "prefer_evidence",
          reviewRequired: true,
          minReviewScore: 7,
          maxReworks: 2,
        },
        efficiency: {
          maxDuration: 3600000, // 1 hour
          priority: "normal",
          allowParallel: true,
          maxParallelism: 3,
        },
      },
      deliverableTypes: ["markdown", "chapter-content"],
      metadata: {
        tags: ["writing", "creative", "fiction"],
        category: "content-creation",
      },
    });

    this.logger.log("Registered Writing Team configuration");
  }

  /**
   * 执行写作任务
   */
  async *execute(
    input: WritingMissionInput,
    userId: string,
  ): AsyncGenerator<MissionEvent, WritingMissionResult> {
    const missionId = uuidv4();
    this.logger.log(
      `Starting writing mission ${missionId} for project ${input.projectId}`,
    );

    // 1. 验证项目访问权限
    await this.verifyProjectAccess(input.projectId, userId);

    // 2. 构建写作上下文
    const contextPackage = await this.buildWritingContext(input);

    // 3. 初始化 LongContentEngine 项目（用于长篇写作）
    await this.initializeLongContentProject(missionId, input);

    // 4. 创建数据库记录
    const dbMission = await this.createMissionRecord(missionId, input, userId);

    // 5. 转换为 MissionInput（注入 LongContentEngine 上下文）
    const missionInput = await this.convertToMissionInput(
      input,
      contextPackage,
      missionId,
    );

    // 6. 获取或创建 Writing Team
    const team =
      this.writingTeam || this.teamFactory.createFromId(this.WRITING_TEAM_ID);

    // 7. 配置约束
    const constraints = this.buildConstraints(input);

    // 8. 执行任务
    try {
      const result = yield* this.missionOrchestrator.execute(
        missionInput,
        team,
        constraints,
      );

      // 9. 处理结果（使用 LongContentEngine 处理完成）
      const writingResult = await this.processResult(
        result,
        input,
        contextPackage,
        missionId,
      );

      // 10. 更新数据库
      await this.updateMissionRecord(dbMission.id, writingResult);

      // 11. 更新 Story Bible（如果有新事实）
      if (writingResult.bibleUpdates && writingResult.bibleUpdates.length > 0) {
        await this.applyBibleUpdates(
          input.projectId,
          writingResult.bibleUpdates,
        );
      }

      // 12. 清理 LongContentEngine 项目
      this.longContentEngine.clearProject(missionId);

      return writingResult;
    } catch (error) {
      // 清理 LongContentEngine 项目
      this.longContentEngine.clearProject(missionId);

      await this.updateMissionRecord(dbMission.id, {
        missionId,
        success: false,
        deliverables: [],
        summary: `写作任务失败: ${(error as Error).message}`,
        tokensUsed: 0,
        costUsed: 0,
        duration: 0,
        error: {
          code: "WRITING_ERROR",
          message: (error as Error).message,
          retryable: true,
        },
        statistics: {
          totalSteps: 0,
          completedSteps: 0,
          failedSteps: 1,
          skippedSteps: 0,
          reworkCount: 0,
          membersInvolved: 0,
          toolCalls: 0,
          skillCalls: 0,
          reviewCount: 0,
          reviewPassRate: 0,
        },
      });

      throw error;
    }
  }

  /**
   * 初始化 LongContentEngine 项目
   */
  private async initializeLongContentProject(
    missionId: string,
    input: WritingMissionInput,
  ): Promise<void> {
    // 估算任务数量（章节写作一般 1 章 = 1 任务）
    let totalTasks = 1;
    let granularityLevel: GranularityLevel = "chapter";
    let expectedWordsPerTask = input.targetWordCount || 3000;

    // 根据任务类型调整
    switch (input.missionType) {
      case "full_story":
        // 完整故事：多章节
        totalTasks = Math.ceil((input.targetWordCount || 30000) / 3000);
        granularityLevel = "chapter";
        expectedWordsPerTask = 3000;
        break;
      case "outline":
        // 大纲：单任务，较少字数
        totalTasks = 1;
        granularityLevel = "section"; // 使用 section 代替 scene
        expectedWordsPerTask = 1000;
        break;
      case "revision":
        // 修订：单任务
        totalTasks = 1;
        granularityLevel = "section"; // 使用 section 代替 scene
        expectedWordsPerTask = input.targetWordCount || 3000;
        break;
      default:
        // 章节写作
        totalTasks = 1;
        granularityLevel = "chapter";
        expectedWordsPerTask = input.targetWordCount || 3000;
    }

    const config: LongContentProjectConfig = {
      projectId: missionId,
      projectTitle: `写作任务 ${missionId.slice(0, 8)}`,
      projectDescription: input.userPrompt,
      totalTasks,
      granularityLevel,
      expectedWordsPerTask,
      // 使用正确的 SlidingWindowConfig 属性
      slidingWindowConfig: {
        maxTotalTokens: 8000,
        maxGlobalSummaryTokens: 500,
        maxRecentSummaryTokens: 1500,
        maxCurrentTaskTokens: 4000,
        maxRelevantHistoryTokens: 1500,
        reservedBufferTokens: 500,
        recentTaskCount: 3, // 保持最近 3 章的上下文
        relevantChunkCount: 3,
        globalSummaryUpdateInterval: 5,
        relevanceThreshold: 0.6,
      },
      // 简化质量配置
      qualityConfig: {
        thresholds: {
          warningScore: 6,
          errorScore: 4,
          minWordRatio: 0.8,
          declineCountForLevel1: 2,
          declineCountForLevel2: 3,
          lowScoreCountForLevel3: 2,
          degradingCountForLevel4: 5,
        },
        trendParams: {
          windowSize: 10,
          significanceThreshold: 0.15,
        },
        autoIntervention: {
          enabled: true,
          autoApplyLevel1: true,
          autoApplyLevel2: true,
        },
        aiEvaluation: {
          enabled: false,
          evaluationInterval: 5,
          evaluationModel: "gpt-4o-mini",
        },
      },
      // 简化续写配置
      continuationConfig: {
        maxContinuations: 3, // 最多续写 3 次
        minCompletionRatioForContinuation: 0.3,
        contextWindowSize: 500,
        autoDetectCompletion: true,
        customCompletionMarkers: ["【完】", "（全文完）", "——END——"], // 完成标记
      },
    };

    await this.longContentEngine.initProject(config);
    this.logger.log(`LongContentEngine project initialized: ${missionId}`);
  }

  /**
   * 构建写作上下文
   */
  private async buildWritingContext(
    input: WritingMissionInput,
  ): Promise<WritingContextPackage> {
    // 获取 Story Bible
    const project = await this.prisma.writingProject.findUnique({
      where: { id: input.projectId },
      include: {
        storyBible: {
          include: {
            characters: true,
            worldSettings: true,
            terminologies: true,
            timelineEvents: true,
            factions: true,
          },
        },
      },
    });

    if (!project?.storyBible) {
      // 创建空的 Story Bible 扩展
      const emptyStoryBible = {
        bibleId: "",
        bibleVersion: 1,
        snapshotAt: new Date().toISOString(),
        characters: [],
        worldSettings: [],
        terminologies: [],
        timelineEvents: [],
        factions: [],
      };
      return createWritingContextPackage(
        "story-architect", // leaderId
        project?.name || "未命名项目", // projectName
        emptyStoryBible,
      );
    }

    const bible = project.storyBible;

    // 构建 Story Bible 扩展数据
    const storyBibleExtensions = {
      bibleId: bible.id,
      bibleVersion: bible.version,
      snapshotAt: new Date().toISOString(),
      premise: bible.premise || undefined,
      theme: bible.theme || undefined,
      tone: bible.tone || undefined,
      worldType: bible.worldType || undefined,
      characters: bible.characters.map((c) => ({
        name: c.name,
        type: "character" as const,
        definition: c.background || `${c.name} - ${c.role}`,
        role: c.role as "protagonist" | "antagonist" | "supporting" | "minor",
        aliases: c.aliases || undefined,
        appearance:
          (c.appearance as {
            gender?: string;
            age?: string;
            height?: string;
            build?: string;
            hair?: string;
            eyes?: string;
            distinguishingFeatures?: string[];
            clothing?: string;
          }) || undefined,
        personality:
          (c.personality as {
            traits?: string[];
            strengths?: string[];
            weaknesses?: string[];
            fears?: string[];
            desires?: string[];
            speechPattern?: string;
          }) || undefined,
        background: c.background || undefined,
        abilities: c.abilities || undefined,
        currentState:
          (c.currentState as {
            storyTime: string;
            sourceChapterId?: string;
            state: Record<string, unknown>;
          }) || undefined,
        stateTimeline:
          (c.stateTimeline as Array<{
            storyTime: string;
            sourceChapterId?: string;
            state: Record<string, unknown>;
          }>) || undefined,
      })),
      worldSettings: bible.worldSettings.map((w) => ({
        category: w.category,
        name: w.name,
        description: w.description,
        rules: w.rules || undefined,
        references:
          (w.references as {
            relatedSettings?: string[];
            relatedCharacters?: string[];
          }) || undefined,
      })),
      terminologies: bible.terminologies.map((t) => ({
        term: t.term,
        definition: t.definition,
        category: t.category,
        variants: t.variants || undefined,
        usage: t.usage || undefined,
      })),
      timelineEvents: bible.timelineEvents.map((e) => ({
        eventName: e.eventName,
        description: e.description,
        storyTime: e.storyTime,
        importance: e.importance,
        involvedCharacterIds: e.involvedCharacterIds || undefined,
        relatedChapterId: e.relatedChapterId || undefined,
      })),
      factions: bible.factions.map((f) => ({
        name: f.name,
        type: f.type,
        description: f.description || undefined,
        hierarchy:
          (f.hierarchy as {
            levels: Array<{ name: string; description?: string }>;
          }) || undefined,
        territory: f.territory || undefined,
        memberIds: undefined,
      })),
      writingStyle: {
        pov: "third-person-limited" as const,
        tense: "past" as const,
        vocabulary: "intermediate" as const,
        dialogueStyle: "natural",
        descriptionStyle: "vivid",
      },
    };

    // 构建上下文包
    const contextPackage = createWritingContextPackage(
      "story-architect", // leaderId
      project.name, // projectName
      storyBibleExtensions,
    );

    // 如果有章节ID，添加章节上下文
    if (input.chapterId) {
      const chapter = await this.prisma.writingChapter.findUnique({
        where: { id: input.chapterId },
        include: {
          volume: true,
          scenes: true,
        },
      });

      if (chapter) {
        contextPackage.extensions.chapterContext = {
          chapter: {
            id: chapter.id,
            chapterNumber: chapter.chapterNumber,
            title: chapter.title,
            outline: chapter.outline || undefined,
            volumeId: chapter.volumeId,
            volumeTitle: chapter.volume?.title,
          },
          previousContext: [],
          involvedCharacters: [],
          relevantWorldSettings: [],
          relevantTerminology: [],
          timelineContext: [],
        };
      }
    }

    return contextPackage;
  }

  /**
   * 转换为 MissionInput（包含 LongContentEngine 上下文）
   */
  private async convertToMissionInput(
    input: WritingMissionInput,
    contextPackage: WritingContextPackage,
    missionId: string,
  ): Promise<MissionInput> {
    // 使用 LongContentEngine 构建任务执行上下文
    let longContentContext: TaskExecutionContext | null = null;
    try {
      longContentContext =
        await this.longContentEngine.buildTaskExecutionContext(
          missionId,
          input.chapterId || "main",
          input.userPrompt,
          { relevantQuery: input.userPrompt },
        );
    } catch (error) {
      this.logger.warn(
        `Failed to build long content context: ${(error as Error).message}`,
      );
    }

    // 构建增强的 prompt
    let enhancedPrompt = input.userPrompt;

    // 注入粒度约束
    if (longContentContext?.granularityPrompt) {
      enhancedPrompt = `${longContentContext.granularityPrompt}\n\n${enhancedPrompt}`;
    }

    // 注入质量提醒
    if (longContentContext?.qualityReminder) {
      enhancedPrompt = `${enhancedPrompt}\n\n${longContentContext.qualityReminder}`;
    }

    // 注入工作记忆上下文
    if (longContentContext?.workingMemory) {
      const workingMemory = longContentContext.workingMemory;
      // 使用正确的属性名 recentTaskSummaries
      if (
        workingMemory.recentTaskSummaries &&
        workingMemory.recentTaskSummaries.length > 0
      ) {
        const summaryText = workingMemory.recentTaskSummaries
          .map((s) => `### ${s.title}\n${s.summary}`)
          .join("\n\n");
        enhancedPrompt = `## 前文摘要\n${summaryText}\n\n${enhancedPrompt}`;
      }
    }

    return {
      prompt: enhancedPrompt,
      requirements: input.additionalInstructions
        ? [input.additionalInstructions]
        : [],
      metadata: {
        projectId: input.projectId,
        missionType: input.missionType,
        chapterId: input.chapterId,
        volumeId: input.volumeId,
        targetWordCount: input.targetWordCount,
        parallelWriters: input.parallelWriters || 1,
        longContentMissionId: missionId,
        // 将整个上下文包作为 context
        context: JSON.stringify(contextPackage),
        // 包含工作记忆
        workingMemory: longContentContext?.workingMemory
          ? JSON.stringify(longContentContext.workingMemory)
          : undefined,
      },
    };
  }

  /**
   * 构建约束配置
   */
  private buildConstraints(
    input: WritingMissionInput,
  ): Partial<ConstraintProfile> {
    return {
      cost: {
        budget: 500, // 写作任务预算
        modelPreference: "balanced",
        allowOverBudget: false,
        warningThreshold: 0.8,
      },
      quality: {
        depth:
          input.missionType === "full_story" ? "comprehensive" : "standard",
        accuracy: "prefer_evidence",
        reviewRequired: true,
        minReviewScore: 7,
        maxReworks: 2,
      },
      efficiency: {
        maxDuration: input.missionType === "full_story" ? 3600000 : 600000,
        priority: "normal",
        allowParallel: true,
        maxParallelism: 3,
      },
    };
  }

  /**
   * 处理执行结果（使用 LongContentEngine）
   */
  private async processResult(
    result: MissionResult,
    input: WritingMissionInput,
    _contextPackage: WritingContextPackage,
    missionId: string,
  ): Promise<WritingMissionResult> {
    const writingResult: WritingMissionResult = {
      ...result,
    };

    // 提取生成的内容
    let extractedContent: string | undefined;
    if (result.deliverables && result.deliverables.length > 0) {
      const mainDeliverable = result.deliverables.find(
        (d) => d.type === "report" && d.mimeType === "application/json",
      );

      if (mainDeliverable?.content) {
        const content = mainDeliverable.content as { outputs?: unknown[] };
        if (content.outputs && content.outputs.length > 0) {
          // 找到写作步骤的输出
          const writeOutput = content.outputs.find(
            (o) =>
              typeof o === "object" &&
              o !== null &&
              "stepId" in o &&
              (o as { stepId: string }).stepId === "write",
          );

          if (
            writeOutput &&
            typeof writeOutput === "object" &&
            "output" in writeOutput
          ) {
            extractedContent = String(
              (writeOutput as { output: unknown }).output,
            );
          }
        }
      }
    }

    // 使用 LongContentEngine 处理任务完成
    if (extractedContent) {
      try {
        const taskTitle = input.chapterId
          ? `章节 ${input.chapterId}`
          : `写作任务 ${missionId.slice(0, 8)}`;

        const completionResult =
          await this.longContentEngine.processTaskCompletion(
            missionId,
            input.chapterId || "main",
            taskTitle,
            extractedContent,
            {
              minWords: input.targetWordCount
                ? Math.floor(input.targetWordCount * 0.8)
                : 2400, // 默认 3000 字的 80%
              requireStructuredEnd: false,
            },
          );

        // 处理续写（如果需要）
        if (completionResult.needsContinuation) {
          this.logger.log(
            `Task needs continuation: ${completionResult.continuationState?.continuationCount} times`,
          );
          // 注意：续写逻辑应该在 Mission 执行流程中处理
          // 这里只记录状态，实际续写需要重新执行写作步骤
          writingResult.content = extractedContent;
          writingResult.wordCount = this.countWords(extractedContent);
        } else {
          // 使用最终内容
          writingResult.content =
            completionResult.finalContent || extractedContent;
          writingResult.wordCount = this.countWords(writingResult.content);
        }

        // 添加质量信息到结果
        writingResult.qualityMetrics = {
          overall: completionResult.qualityMetrics.overallScore,
          wordCount: completionResult.qualityMetrics.wordCount,
          coherence: completionResult.qualityMetrics.coherenceScore ?? 0,
          completeness: completionResult.qualityMetrics.completionRatio * 10,
          consistency: completionResult.qualityMetrics.styleConsistency ?? 0,
        };

        // 如果有质量趋势警告
        if (completionResult.qualityTrend?.trend === "degrading") {
          this.logger.warn(
            `Quality declining for mission ${missionId}: ` +
              `consecutiveDeclines=${completionResult.qualityTrend.consecutiveDeclines}`,
          );
        }

        // 如果有干预建议
        if (completionResult.intervention) {
          this.logger.log(
            `Quality intervention recommended: ${completionResult.intervention.action}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to process task completion: ${(error as Error).message}`,
        );
        // 回退到基本处理
        writingResult.content = extractedContent;
        writingResult.wordCount = this.countWords(extractedContent);
      }
    }

    // 提取一致性检查结果
    // TODO: 从 result 中提取 consistency checker 的输出

    return writingResult;
  }

  /**
   * 创建任务记录
   */
  private async createMissionRecord(
    missionId: string,
    input: WritingMissionInput,
    _userId: string,
  ) {
    return this.prisma.writingMission.create({
      data: {
        id: missionId,
        projectId: input.projectId,
        missionType: input.missionType.toUpperCase() as
          | "OUTLINE"
          | "CHAPTER"
          | "REVISION"
          | "CONSISTENCY",
        targetId: input.chapterId || input.volumeId || input.projectId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        contextPackage: {
          userPrompt: input.userPrompt,
          targetWordCount: input.targetWordCount,
          additionalInstructions: input.additionalInstructions,
        },
      },
    });
  }

  /**
   * 更新任务记录
   */
  private async updateMissionRecord(
    missionId: string,
    result: WritingMissionResult,
  ) {
    return this.prisma.writingMission.update({
      where: { id: missionId },
      data: {
        status: result.success ? "COMPLETED" : "FAILED",
        completedAt: new Date(),
        result: {
          success: result.success,
          content: result.content,
          wordCount: result.wordCount,
          tokensUsed: result.tokensUsed,
          costUsed: result.costUsed,
          duration: result.duration,
          error: result.error
            ? {
                code: result.error.code,
                message: result.error.message,
                retryable: result.error.retryable,
              }
            : null,
        },
      },
    });
  }

  /**
   * 应用 Bible 更新
   */
  private async applyBibleUpdates(
    _projectId: string,
    updates: WritingMissionResult["bibleUpdates"],
  ) {
    if (!updates) return;

    for (const update of updates) {
      try {
        switch (update.type) {
          case "character_state":
            // TODO: 更新角色状态
            break;
          case "timeline_event":
            // TODO: 添加时间线事件
            break;
          case "new_fact":
            // TODO: 添加新事实
            break;
        }
      } catch (error) {
        this.logger.warn(
          `Failed to apply Bible update: ${(error as Error).message}`,
        );
      }
    }
  }

  /**
   * 验证项目访问权限
   */
  private async verifyProjectAccess(projectId: string, userId: string) {
    const project = await this.prisma.writingProject.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    if (project.ownerId !== userId) {
      throw new Error("Access denied");
    }
  }

  /**
   * 计算字数
   */
  private countWords(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = text
      .replace(/[\u4e00-\u9fa5]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    return chineseChars + englishWords;
  }

  /**
   * 获取任务状态
   */
  async getMissionStatus(missionId: string, userId: string) {
    const mission = await this.prisma.writingMission.findUnique({
      where: { id: missionId },
      include: {
        project: { select: { ownerId: true } },
      },
    });

    if (!mission) {
      throw new Error("Mission not found");
    }

    if (mission.project.ownerId !== userId) {
      throw new Error("Access denied");
    }

    // 获取 orchestrator 状态
    const orchestratorState = this.missionOrchestrator.getState(missionId);

    return {
      id: mission.id,
      status: mission.status,
      missionType: mission.missionType,
      startedAt: mission.startedAt,
      completedAt: mission.completedAt,
      result: mission.result,
      // 实时状态
      orchestratorState: orchestratorState
        ? {
            phase: orchestratorState.phase,
            completedSteps: orchestratorState.completedSteps,
            currentSteps: orchestratorState.currentSteps,
            progress: orchestratorState.resourceUsage.progress,
            tokensUsed: orchestratorState.resourceUsage.tokensUsed,
            costUsed: orchestratorState.resourceUsage.costUsed,
          }
        : null,
    };
  }

  /**
   * 取消任务
   */
  async cancelMission(missionId: string, userId: string) {
    const mission = await this.prisma.writingMission.findUnique({
      where: { id: missionId },
      include: {
        project: { select: { ownerId: true } },
      },
    });

    if (!mission) {
      throw new Error("Mission not found");
    }

    if (mission.project.ownerId !== userId) {
      throw new Error("Access denied");
    }

    // 取消 orchestrator 执行
    await this.missionOrchestrator.cancel(missionId);

    // 更新数据库状态
    await this.prisma.writingMission.update({
      where: { id: missionId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        result: {
          success: false,
          error: "Cancelled by user",
        },
      },
    });

    return { success: true, message: "Mission cancelled" };
  }
}
