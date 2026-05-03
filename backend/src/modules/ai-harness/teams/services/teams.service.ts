/**
 * AI Engine - Teams Service
 * å›¢é˜ŸæœåŠ¡ - ä¸šåŠ¡é€»è¾‘å±‚
 *
 * æä¾›å›¢é˜Ÿä»»åŠ¡æ‰§è¡Œçš„å®Œæ•´ APIï¼š
 * - åˆ›å»ºå’Œç®¡ç†å›¢é˜Ÿå®žä¾‹
 * - æ‰§è¡Œä»»åŠ¡ï¼ˆMissionï¼‰
 * - ç›‘æŽ§æ‰§è¡ŒçŠ¶æ€
 * - èŽ·å–æ‰§è¡Œç»“æžœ
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { TeamFactory } from "../factory/team-factory";
import { TeamRegistry } from "../registry/team-registry";
import { RoleRegistry } from "../registry/role-registry";
import { TeamsMissionOrchestrator as MissionOrchestrator } from "../orchestrator/teams-mission-orchestrator";
import {
  MissionEvent,
  MissionResult,
  MissionInput,
} from "../../agents/abstractions/mission.types";
import { ConstraintEngine } from "@/modules/ai-harness/guardrails/constraints/constraint-engine";
import { ITeam, TeamConfig, TeamId } from "../abstractions/team.interface";
import { ConstraintProfile } from "../constraints/constraint-profile";
import { LruMap } from "@/common/utils/lru-map";

// ==================== DTOs ====================

/**
 * åˆ›å»ºä»»åŠ¡è¯·æ±‚
 */
export interface CreateMissionDto {
  /** å›¢é˜Ÿ ID */
  teamId: TeamId;

  /** ä»»åŠ¡ç›®æ ‡ */
  goal: string;

  /** ä¸Šä¸‹æ–‡ä¿¡æ¯ */
  context?: string;

  /** çº¦æŸè¦†ç›–ï¼ˆå¯é€‰ï¼‰ */
  constraints?: Partial<ConstraintProfile>;

  /** ç”¨æˆ· IDï¼ˆå¯é€‰ï¼‰ */
  userId?: string;

  /** ä¼šè¯ IDï¼ˆå¯é€‰ï¼‰ */
  sessionId?: string;

  /** å…ƒæ•°æ®ï¼ˆå¯é€‰ï¼‰ */
  metadata?: Record<string, unknown>;
}

/**
 * ä»»åŠ¡æ‰§è¡ŒçŠ¶æ€
 */
export interface MissionStatus {
  /** ä»»åŠ¡ ID */
  missionId: string;

  /** å›¢é˜Ÿ ID */
  teamId: TeamId;

  /** çŠ¶æ€ */
  status: "pending" | "running" | "completed" | "failed" | "cancelled";

  /** è¿›åº¦ï¼ˆ0-100ï¼‰ */
  progress: number;

  /** å½“å‰é˜¶æ®µ */
  currentPhase?: string;

  /** å¼€å§‹æ—¶é—´ */
  startTime: Date;

  /** ç»“æŸæ—¶é—´ */
  endTime?: Date;

  /** é”™è¯¯ä¿¡æ¯ */
  error?: string;
}

/**
 * å›¢é˜Ÿä¿¡æ¯
 */
export interface TeamInfo {
  id: TeamId;
  name: string;
  description: string;
  type: "predefined" | "custom";
  icon?: string;
  color?: string;
  leaderRole: string;
  memberRoles: string[];
  capabilities: string[];
}

// ==================== Service ====================

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  /** æ­£åœ¨æ‰§è¡Œçš„ä»»åŠ¡ */
  private readonly runningMissions = new LruMap<
    string,
    {
      status: MissionStatus;
      abortController: AbortController;
      resultPromise: Promise<MissionResult>;
    }
  >(500);

  /** å·²å®Œæˆçš„ä»»åŠ¡ç»“æžœç¼“å­˜ */
  private readonly completedMissions = new LruMap<string, MissionResult>(1000);

  constructor(
    private readonly teamFactory: TeamFactory,
    private readonly teamRegistry: TeamRegistry,
    private readonly roleRegistry: RoleRegistry,
    private readonly missionOrchestrator: MissionOrchestrator,
    private readonly constraintEngine: ConstraintEngine,
  ) {}

  // ==================== å›¢é˜Ÿç®¡ç† ====================

  /**
   * èŽ·å–æ‰€æœ‰å¯ç”¨å›¢é˜Ÿ
   */
  listTeams(): TeamInfo[] {
    const configs = this.teamRegistry.getAllConfigs();
    return configs.map((config) => this.configToInfo(config));
  }

  /**
   * èŽ·å–å›¢é˜Ÿè¯¦æƒ…
   */
  getTeam(teamId: TeamId): TeamInfo {
    const config = this.teamRegistry.getConfig(teamId);
    if (!config) {
      throw new NotFoundException(`Team ${teamId} not found`);
    }
    return this.configToInfo(config);
  }

  /**
   * èŽ·å–å›¢é˜Ÿå®žä¾‹ï¼ˆå¦‚éœ€è¦å¯å®žä¾‹åŒ–ï¼‰
   */
  getTeamInstance(teamId: TeamId): ITeam {
    return this.teamFactory.createFromId(teamId);
  }

  // ==================== ä»»åŠ¡æ‰§è¡Œ ====================

  /**
   * åˆ›å»ºå¹¶æ‰§è¡Œä»»åŠ¡
   */
  async executeMission(dto: CreateMissionDto): Promise<string> {
    // 1. éªŒè¯å›¢é˜Ÿå­˜åœ¨
    if (!this.teamRegistry.has(dto.teamId)) {
      throw new NotFoundException(`Team ${dto.teamId} not found`);
    }

    // 2. ç”Ÿæˆä»»åŠ¡ ID
    const missionId = uuidv4();
    this.logger.log(`Creating mission ${missionId} for team ${dto.teamId}`);

    // 3. å®žä¾‹åŒ–å›¢é˜Ÿ
    const team = this.teamFactory.createFromId(dto.teamId);

    // 4. åˆå¹¶çº¦æŸ
    const constraints = this.mergeConstraints(
      team.constraintProfile,
      dto.constraints,
    );

    // 5. éªŒè¯çº¦æŸ
    const validation = this.constraintEngine.validate(constraints);
    if (!validation.valid) {
      throw new BadRequestException(
        `Invalid constraints: ${validation.violations.map((v) => v.message).join(", ")}`,
      );
    }

    // 6. åˆ›å»º AbortController
    const abortController = new AbortController();

    // 7. åˆå§‹åŒ–çŠ¶æ€
    const status: MissionStatus = {
      missionId,
      teamId: dto.teamId,
      status: "pending",
      progress: 0,
      startTime: new Date(),
    };

    // 8. å¯åŠ¨æ‰§è¡Œï¼ˆå¼‚æ­¥ï¼‰
    const resultPromise = this.runMission(
      missionId,
      team,
      dto,
      constraints,
      abortController.signal,
    );

    // 9. å­˜å‚¨è¿è¡ŒçŠ¶æ€
    this.runningMissions.set(missionId, {
      status,
      abortController,
      resultPromise,
    });

    return missionId;
  }

  /**
   * æ‰§è¡Œä»»åŠ¡å¹¶æµå¼è¿”å›žäº‹ä»¶
   */
  async *executeMissionStream(
    dto: CreateMissionDto,
  ): AsyncGenerator<MissionEvent> {
    // 1. éªŒè¯å›¢é˜Ÿå­˜åœ¨
    if (!this.teamRegistry.has(dto.teamId)) {
      throw new NotFoundException(`Team ${dto.teamId} not found`);
    }

    // 2. å®žä¾‹åŒ–å›¢é˜Ÿ
    const team = this.teamFactory.createFromId(dto.teamId);
    this.logger.log(`Creating streaming mission for team ${dto.teamId}`);

    // 3. æž„å»º MissionInput
    const missionInput: MissionInput = {
      prompt: dto.goal,
      metadata: {
        ...dto.metadata,
        context: dto.context || "",
        teamId: dto.teamId,
        userId: dto.userId,
        sessionId: dto.sessionId,
      },
      constraints: dto.constraints,
    };

    // 4. æ‰§è¡Œå¹¶æµå¼è¿”å›ž
    const generator = this.missionOrchestrator.execute(
      missionInput,
      team,
      dto.constraints,
    );

    for await (const event of generator) {
      yield event;
    }
  }

  /**
   * èŽ·å–ä»»åŠ¡çŠ¶æ€
   */
  getMissionStatus(missionId: string): MissionStatus {
    const running = this.runningMissions.get(missionId);
    if (running) {
      return { ...running.status };
    }

    const completed = this.completedMissions.get(missionId);
    if (completed) {
      return {
        missionId,
        teamId: (completed.metadata?.teamId as TeamId) || ("unknown" as TeamId),
        status: completed.success ? "completed" : "failed",
        progress: 100,
        startTime: (completed.metadata?.startTime as Date) || new Date(),
        endTime: completed.metadata?.endTime as Date,
        error: completed.error?.message,
      };
    }

    throw new NotFoundException(`Mission ${missionId} not found`);
  }

  /**
   * èŽ·å–ä»»åŠ¡ç»“æžœ
   */
  async getMissionResult(missionId: string): Promise<MissionResult> {
    // æ£€æŸ¥å·²å®Œæˆ
    const completed = this.completedMissions.get(missionId);
    if (completed) {
      return completed;
    }

    // æ£€æŸ¥æ­£åœ¨è¿è¡Œ
    const running = this.runningMissions.get(missionId);
    if (running) {
      // ç­‰å¾…å®Œæˆ
      return running.resultPromise;
    }

    throw new NotFoundException(`Mission ${missionId} not found`);
  }

  /**
   * å–æ¶ˆä»»åŠ¡
   */
  cancelMission(missionId: string): boolean {
    const running = this.runningMissions.get(missionId);
    if (!running) {
      throw new NotFoundException(`Running mission ${missionId} not found`);
    }

    running.abortController.abort();
    running.status.status = "cancelled";
    running.status.endTime = new Date();

    this.logger.log(`Mission ${missionId} cancelled`);
    return true;
  }

  // ==================== ç§æœ‰æ–¹æ³• ====================

  /**
   * è¿è¡Œä»»åŠ¡
   */
  private async runMission(
    _missionId: string,
    team: ITeam,
    dto: CreateMissionDto,
    _constraints: ConstraintProfile,
    _signal: AbortSignal,
  ): Promise<MissionResult> {
    const running = this.runningMissions.get(_missionId);
    if (!running) {
      throw new InternalServerErrorException(
        `Mission ${_missionId} not initialized`,
      );
    }

    try {
      // æ›´æ–°çŠ¶æ€ä¸ºè¿è¡Œä¸­
      running.status.status = "running";

      // æž„å»º MissionInput
      const missionInput: MissionInput = {
        prompt: dto.goal,
        metadata: {
          ...dto.metadata,
          context: dto.context || "",
          teamId: dto.teamId,
          userId: dto.userId,
          sessionId: dto.sessionId,
        },
        constraints: dto.constraints,
      };

      // æ‰§è¡Œä»»åŠ¡
      let result: MissionResult | undefined;
      const generator = this.missionOrchestrator.execute(
        missionInput,
        team,
        dto.constraints,
      );

      for await (const event of generator) {
        // æ›´æ–°è¿›åº¦ - ä½¿ç”¨ step_started ä½œä¸ºé˜¶æ®µæŒ‡ç¤º
        if (event.type === "step_started") {
          running.status.currentPhase = event.data?.stepId as string;
        }
        // ä½¿ç”¨ step_progress æ›´æ–°è¿›åº¦
        if (event.type === "step_progress") {
          running.status.progress = (event.data?.progress as number) || 0;
        }
        if (event.type === "mission_completed") {
          result = event.data?.result as MissionResult;
        }
        if (event.type === "mission_failed") {
          const errorData = event.data?.error as { message?: string } | string;
          const errorMessage =
            typeof errorData === "string"
              ? errorData
              : errorData?.message || "Mission failed";
          throw new InternalServerErrorException(errorMessage);
        }
      }

      if (!result) {
        throw new InternalServerErrorException(
          "Mission completed without result",
        );
      }

      // æ›´æ–°çŠ¶æ€ä¸ºå®Œæˆ
      running.status.status = "completed";
      running.status.progress = 100;
      running.status.endTime = new Date();

      // ç¼“å­˜ç»“æžœ
      this.completedMissions.set(_missionId, result);

      // æ¸…ç†è¿è¡ŒçŠ¶æ€
      this.runningMissions.delete(_missionId);

      return result;
    } catch (error) {
      // æ›´æ–°çŠ¶æ€ä¸ºå¤±è´¥
      running.status.status = "failed";
      running.status.endTime = new Date();
      running.status.error =
        error instanceof Error ? error.message : String(error);

      // ç¼“å­˜å¤±è´¥ç»“æžœ
      const failedResult: MissionResult = {
        missionId: _missionId,
        success: false,
        summary: "Mission failed",
        tokensUsed: 0,
        costUsed: 0,
        duration: Date.now() - running.status.startTime.getTime(),
        error: {
          code: "MISSION_FAILED",
          message: running.status.error,
          retryable: false,
        },
        deliverables: [],
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
        metadata: {
          teamId: dto.teamId,
          startTime: running.status.startTime,
          endTime: running.status.endTime,
        },
      };
      this.completedMissions.set(_missionId, failedResult);

      // æ¸…ç†è¿è¡ŒçŠ¶æ€
      this.runningMissions.delete(_missionId);

      throw error;
    }
  }

  /**
   * åˆå¹¶çº¦æŸé…ç½®
   */
  private mergeConstraints(
    base: ConstraintProfile,
    overrides?: Partial<ConstraintProfile>,
  ): ConstraintProfile {
    if (!overrides) {
      return base;
    }

    return {
      ...base,
      ...overrides,
      cost: { ...base.cost, ...overrides.cost },
      quality: { ...base.quality, ...overrides.quality },
      efficiency: { ...base.efficiency, ...overrides.efficiency },
    };
  }

  /**
   * å°†é…ç½®è½¬æ¢ä¸ºå›¢é˜Ÿä¿¡æ¯
   */
  private configToInfo(config: TeamConfig): TeamInfo {
    const leaderRole = this.roleRegistry.tryGet(config.leaderRoleId);
    const memberRoles = config.memberRoles
      .map((mr) => this.roleRegistry.tryGet(mr.roleId)?.name)
      .filter((name): name is string => !!name);

    return {
      id: config.id,
      name: config.name,
      description: config.description,
      type: config.type,
      icon: config.icon,
      color: config.color,
      leaderRole: leaderRole?.name || config.leaderRoleId,
      memberRoles,
      capabilities: config.deliverableTypes,
    };
  }
}
