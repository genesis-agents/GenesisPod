import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { DimensionStatus } from "@prisma/client";
import { ResearchEventEmitterService } from "../core/research/research-event-emitter.service";

export interface MissionProgress {
  stage:
    | "planning"
    | "writing"
    | "reviewing"
    | "integrating"
    | "completed"
    | "failed";
  sectionsTotal: number;
  sectionsCompleted: number;
  currentSection?: string;
  message: string;
}

@Injectable()
export class DimensionProgressService {
  private readonly logger = new Logger(DimensionProgressService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: ResearchEventEmitterService,
  ) {}

  async updateDimensionStatus(
    dimensionId: string,
    status: DimensionStatus,
    options?: { lastResearchedAt?: Date },
  ): Promise<void> {
    await this.prisma.topicDimension.update({
      where: { id: dimensionId },
      data: { status, ...options },
    });
  }

  async emitProgress(
    topicId: string,
    dimensionName: string,
    progress: MissionProgress,
    missionId?: string,
    stageProgress?: number,
    taskId?: string,
  ): Promise<void> {
    let calculatedProgress: number;
    if (stageProgress !== undefined) {
      calculatedProgress = stageProgress;
    } else if (progress.sectionsTotal > 0) {
      const sectionRatio = progress.sectionsCompleted / progress.sectionsTotal;
      calculatedProgress = Math.round(30 + sectionRatio * 50);
    } else {
      calculatedProgress = 10;
    }

    void this.eventEmitter.emitDimensionResearchProgress(
      topicId,
      dimensionName,
      calculatedProgress,
      progress.message,
      missionId,
      taskId,
    );

    if (missionId) {
      try {
        await this.prisma.researchMission.update({
          where: { id: missionId },
          data: { updatedAt: new Date() },
        });
      } catch (error) {
        this.logger.debug(
          `[emitProgress] Non-fatal: Failed to update mission heartbeat: ${error}`,
        );
      }
    }
  }
}
