import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { ChapterDependencyService } from "./chapter-dependency.service";
import { WriterPoolService } from "./writer-pool.service";
import { ParallelConflictDetectorService } from "./parallel-conflict-detector.service";
import { ConsistencyEngineService } from "../consistency/consistency-engine.service";
import { StoryBibleService } from "../bible/story-bible.service";

@Injectable()
export class ParallelOrchestratorService {
  private readonly _logger = new Logger(ParallelOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chapterDependency: ChapterDependencyService,
    private readonly _writerPool: WriterPoolService,
    private readonly _conflictDetector: ParallelConflictDetectorService,
    private readonly _consistencyEngine: ConsistencyEngineService,
    private readonly _storyBible: StoryBibleService,
  ) {}

  async orchestrateParallelWriting(
    volumeId: string,
    userId: string,
    options: { maxParallel?: number },
  ) {
    // Verify access
    const volume = await this.prisma.writingVolume.findUnique({
      where: { id: volumeId },
      include: {
        project: { select: { id: true, ownerId: true, maxParallelWriters: true } },
        chapters: { orderBy: { chapterNumber: "asc" } },
      },
    });

    if (!volume || volume.project.ownerId !== userId) {
      throw new Error("Volume not found or access denied");
    }

    const maxParallel = options.maxParallel || volume.project.maxParallelWriters;

    // Analyze dependencies
    const dependencyGraph = await this.chapterDependency.analyze(volume.chapters);

    // Generate execution plan
    const executionPlan = this.generateExecutionPlan(dependencyGraph, maxParallel);

    // Create parallel group
    const parallelGroupId = `pg_${Date.now()}`;

    // Create missions for each chapter
    const missions = await Promise.all(
      volume.chapters.map((chapter, index) =>
        this.prisma.writingMission.create({
          data: {
            projectId: volume.project.id,
            missionType: "CHAPTER",
            targetId: chapter.id,
            status: "PENDING",
            parallelGroupId,
            writerInstance: (index % maxParallel) + 1,
          },
        })
      )
    );

    return {
      message: "Parallel writing orchestration started",
      volumeId,
      parallelGroupId,
      totalChapters: volume.chapters.length,
      maxParallel,
      executionPlan,
      missions: missions.map((m) => m.id),
    };
  }

  private generateExecutionPlan(
    dependencyGraph: Map<string, string[]>,
    maxParallel: number,
  ) {
    const rounds: { round: number; chapters: string[] }[] = [];
    const completed = new Set<string>();
    let currentRound = 0;

    while (completed.size < dependencyGraph.size) {
      const availableChapters: string[] = [];

      for (const [chapterId, dependencies] of dependencyGraph) {
        if (completed.has(chapterId)) continue;

        // Check if all dependencies are completed
        const allDepsCompleted = dependencies.every((dep) => completed.has(dep));
        if (allDepsCompleted) {
          availableChapters.push(chapterId);
        }
      }

      // Take up to maxParallel chapters for this round
      const roundChapters = availableChapters.slice(0, maxParallel);

      if (roundChapters.length === 0) {
        // No progress possible - circular dependency or error
        this._logger.warn("No chapters available for execution - possible circular dependency");
        break;
      }

      rounds.push({
        round: currentRound++,
        chapters: roundChapters,
      });

      roundChapters.forEach((ch) => completed.add(ch));
    }

    return rounds;
  }
}
