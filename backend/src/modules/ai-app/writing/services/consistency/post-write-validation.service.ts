import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";

export interface ConsistencyIssue {
  type: "CHARACTER" | "TIMELINE" | "WORLD" | "TERMINOLOGY" | "PLOT";
  severity: "CRITICAL" | "WARNING" | "INFO";
  location: string;
  description: string;
  expected?: string;
  found?: string;
  suggestion?: string;
}

export interface ConsistencyReport {
  status: "PASSED" | "ISSUES_FOUND";
  issues: ConsistencyIssue[];
  suggestions: string[];
}

@Injectable()
export class PostWriteValidationService {
  private readonly logger = new Logger(PostWriteValidationService.name);

  constructor(private readonly prisma: PrismaService) {
    void this.logger;
  }

  async validate(
    chapterId: string,
    content: string,
  ): Promise<ConsistencyReport> {
    const chapter = await this.prisma.writingChapter.findUnique({
      where: { id: chapterId },
      include: {
        volume: {
          include: {
            project: {
              include: {
                storyBible: {
                  include: {
                    characters: true,
                    worldSettings: true,
                    terminologies: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!chapter?.volume.project.storyBible) {
      return { status: "PASSED", issues: [], suggestions: [] };
    }

    const bible = chapter.volume.project.storyBible;
    const issues: ConsistencyIssue[] = [];

    // Check character consistency
    const characterIssues = this.checkCharacterConsistency(
      content,
      bible.characters,
    );
    issues.push(...characterIssues);

    // Check terminology consistency
    const termIssues = this.checkTerminologyConsistency(
      content,
      bible.terminologies,
    );
    issues.push(...termIssues);

    // Check world setting consistency
    const worldIssues = this.checkWorldConsistency(
      content,
      bible.worldSettings,
    );
    issues.push(...worldIssues);

    return {
      status: issues.length > 0 ? "ISSUES_FOUND" : "PASSED",
      issues,
      suggestions: issues.map((i) => i.suggestion).filter(Boolean) as string[],
    };
  }

  private checkCharacterConsistency(
    content: string,
    characters: any[],
  ): ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];

    for (const character of characters) {
      // Check if character name is mentioned
      if (content.includes(character.name)) {
        // Check appearance descriptions
        const appearance = character.appearance;
        if (appearance) {
          // Check for conflicting descriptions
          // This is a simplified check - could be enhanced with NLP
          for (const [_key, value] of Object.entries(appearance)) {
            if (typeof value === "string" && value.length > 0) {
              // Look for contradicting descriptions
              // Placeholder logic - would need NLP in production
            }
          }
        }
      }
    }

    return issues;
  }

  private checkTerminologyConsistency(
    content: string,
    terminologies: any[],
  ): ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];

    for (const term of terminologies) {
      // Check if term variants are used inconsistently
      if (term.variants?.length > 0) {
        const usedVariants = term.variants.filter((v: string) =>
          content.includes(v),
        );
        if (usedVariants.length > 1) {
          issues.push({
            type: "TERMINOLOGY",
            severity: "WARNING",
            location: "Multiple locations",
            description: `术语 "${term.term}" 使用了多个变体`,
            expected: term.term,
            found: usedVariants.join(", "),
            suggestion: `统一使用 "${term.term}"`,
          });
        }
      }
    }

    return issues;
  }

  private checkWorldConsistency(
    _content: string,
    worldSettings: any[],
  ): ConsistencyIssue[] {
    const issues: ConsistencyIssue[] = [];

    for (const setting of worldSettings) {
      // Check if setting rules are violated
      if (setting.rules?.length > 0) {
        // Placeholder for rule checking logic
        // Would need NLP/LLM to properly check rule violations
      }
    }

    return issues;
  }
}
