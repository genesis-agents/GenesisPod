import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { PreWriteInjectionService } from "./pre-write-injection.service";
import { PostWriteValidationService } from "./post-write-validation.service";
import { ConflictResolutionService } from "./conflict-resolution.service";
import { StoryBibleService } from "../bible/story-bible.service";
import { ContextBuilderService } from "../writing/context-builder.service";

@Injectable()
export class ConsistencyEngineService {
  private readonly logger = new Logger(ConsistencyEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly preWriteInjection: PreWriteInjectionService,
    private readonly postWriteValidation: PostWriteValidationService,
    private readonly conflictResolution: ConflictResolutionService,
    private readonly storyBibleService: StoryBibleService,
    private readonly contextBuilder: ContextBuilderService,
  ) {
    // Services available for future use
    void this.logger;
    void this.preWriteInjection;
    void this.storyBibleService;
  }

  async buildWritingContext(chapterId: string, bibleSnapshot?: any) {
    return this.contextBuilder.buildWritingContext(chapterId, bibleSnapshot);
  }

  async validateChapter(chapterId: string, userId: string) {
    const chapter = await this.prisma.writingChapter.findUnique({
      where: { id: chapterId },
      include: {
        volume: {
          include: {
            project: { select: { ownerId: true } },
          },
        },
      },
    });

    if (!chapter || chapter.volume.project.ownerId !== userId) {
      throw new Error("Chapter not found or access denied");
    }

    if (!chapter.content) {
      return { status: "SKIPPED", reason: "No content to validate" };
    }

    const report = await this.postWriteValidation.validate(
      chapterId,
      chapter.content,
    );

    // Save check result
    await this.prisma.consistencyCheck.create({
      data: {
        chapterId,
        checkType: "CHARACTER",
        status: report.issues.length > 0 ? "ISSUES_FOUND" : "PASSED",
        issues: report.issues as object[],
        suggestions: report.suggestions as unknown as object[],
      },
    });

    return report;
  }

  async getProjectReport(projectId: string, userId: string) {
    const project = await this.prisma.writingProject.findFirst({
      where: { id: projectId, ownerId: userId },
    });

    if (!project) {
      throw new Error("Project not found");
    }

    const checks = await this.prisma.consistencyCheck.findMany({
      where: {
        chapter: {
          volume: { projectId },
        },
      },
      include: {
        chapter: {
          select: { id: true, title: true, chapterNumber: true },
        },
      },
      orderBy: { checkedAt: "desc" },
    });

    const summary = {
      total: checks.length,
      passed: checks.filter((c) => c.status === "PASSED").length,
      issuesFound: checks.filter((c) => c.status === "ISSUES_FOUND").length,
      pending: checks.filter((c) => c.status === "PENDING").length,
      resolved: checks.filter((c) => c.status === "RESOLVED").length,
    };

    return {
      projectId,
      summary,
      recentChecks: checks.slice(0, 20),
    };
  }

  async resolveConflicts(chapterId: string, issues: any[]) {
    return this.conflictResolution.resolve(chapterId, issues);
  }
}
