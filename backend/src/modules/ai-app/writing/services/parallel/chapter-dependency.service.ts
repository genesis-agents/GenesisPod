import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

@Injectable()
export class ChapterDependencyService {
  private readonly logger = new Logger(ChapterDependencyService.name);

  constructor(private readonly prisma: PrismaService) {
    void this.logger;
  }

  async analyze(chapters: any[]): Promise<Map<string, string[]>> {
    const dependencyGraph = new Map<string, string[]>();

    for (const chapter of chapters) {
      // Use explicit dependencies if set, otherwise infer from chapter number
      const dependencies =
        chapter.dependsOn?.length > 0
          ? chapter.dependsOn
          : this.inferDependencies(chapter, chapters);

      dependencyGraph.set(chapter.id, dependencies);
    }

    // Validate no circular dependencies
    this.validateNoCycles(dependencyGraph);

    return dependencyGraph;
  }

  private inferDependencies(chapter: any, allChapters: any[]): string[] {
    // Simple heuristic: each chapter depends on the previous one
    const previousChapter = allChapters.find(
      (c) => c.chapterNumber === chapter.chapterNumber - 1,
    );
    return previousChapter ? [previousChapter.id] : [];
  }

  private validateNoCycles(graph: Map<string, string[]>) {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (node: string): boolean => {
      if (recursionStack.has(node)) {
        return true;
      }
      if (visited.has(node)) {
        return false;
      }

      visited.add(node);
      recursionStack.add(node);

      const dependencies = graph.get(node) || [];
      for (const dep of dependencies) {
        if (hasCycle(dep)) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const node of graph.keys()) {
      if (hasCycle(node)) {
        throw new Error(
          `Circular dependency detected involving chapter ${node}`,
        );
      }
    }
  }

  async updateDependencies(chapterId: string, dependencies: string[]) {
    return this.prisma.writingChapter.update({
      where: { id: chapterId },
      data: { dependsOn: dependencies },
    });
  }

  async getIndependentChapters(volumeId: string): Promise<string[]> {
    const chapters = await this.prisma.writingChapter.findMany({
      where: { volumeId },
      select: { id: true, dependsOn: true },
    });

    return chapters
      .filter((ch) => !ch.dependsOn || ch.dependsOn.length === 0)
      .map((ch) => ch.id);
  }
}
