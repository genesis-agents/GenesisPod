/**
 * AI Slides V5.0 - AI Edit Service
 *
 * Service for AI-powered editing capabilities:
 * - Fix Layout: Automatically fix layout issues (overflow, overlap, alignment)
 * - Polish Content: Polish content to match overall style
 * - Fact Check: Verify factual accuracy of content
 */

import {
  Injectable,
  Logger,
  Optional,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import {
  LayoutFixerSkill,
  LayoutFixerInput,
} from "../skills/layout-fixer.skill";
import {
  ContentPolisherSkill,
  ContentPolisherInput,
  StyleGuide,
} from "../skills/content-polisher.skill";
import {
  FactCheckerSkill,
  FactCheckerInput,
} from "../skills/fact-checker.skill";
import { SkillContext } from "@/modules/ai-engine/skills/abstractions/skill.interface";

// ============================================
// Types
// ============================================

/**
 * Polish content options
 */
export interface PolishOptions {
  /** Style guide to follow */
  styleGuide?: StyleGuide;
  /** Target tone */
  targetTone?: "formal" | "casual" | "technical" | "friendly";
  /** Language */
  language?: "zh" | "en";
}

/**
 * Fix layout result
 */
export interface FixLayoutResult {
  success: boolean;
  originalHtml: string;
  fixedHtml: string;
  issuesFound: number;
  issuesFixed: number;
  criticalIssues: number;
}

/**
 * Polish content result
 */
export interface PolishContentResult {
  success: boolean;
  pagesPolished: number;
  totalChanges: number;
  pages: Array<{
    index: number;
    title: string;
    content: string;
  }>;
}

/**
 * Fact check result
 */
export interface FactCheckResult {
  success: boolean;
  totalClaims: number;
  verifiedCount: number;
  disputedCount: number;
  needsCitationCount: number;
  overallCredibility: number;
  pageResults: Array<{
    pageIndex: number;
    overallScore: number;
    credibilityLevel: string;
    claimsCount: number;
  }>;
}

/**
 * Page data from mission
 */
interface MissionPage {
  index: number;
  title?: string;
  html?: string;
  content?: string;
  [key: string]: unknown;
}

// ============================================
// Service
// ============================================

@Injectable()
export class AIEditService {
  private readonly logger = new Logger(AIEditService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly layoutFixerSkill: LayoutFixerSkill,
    @Optional() private readonly contentPolisherSkill: ContentPolisherSkill,
    @Optional() private readonly factCheckerSkill: FactCheckerSkill,
  ) {}

  // ============================================
  // Fix Layout
  // ============================================

  /**
   * Fix layout issues on a specific page
   * @param missionId - Mission ID
   * @param pageIndex - Page index (0-based)
   * @returns Fix result with original and fixed HTML
   */
  async fixLayout(
    missionId: string,
    pageIndex: number,
    userId: string,
  ): Promise<FixLayoutResult> {
    this.logger.log(`[fixLayout] Mission: ${missionId}, Page: ${pageIndex}`);

    if (!this.layoutFixerSkill) {
      throw new InternalServerErrorException(
        "Layout fixer skill is not available. Please check skill registration.",
      );
    }

    // Validate input
    if (pageIndex < 0) {
      throw new BadRequestException("Page index must be a non-negative number");
    }

    // Get the page HTML from the mission
    const page = await this.getPageHtml(missionId, pageIndex, userId);

    const context = this.createSkillContext(
      "layout-fixer",
      "fix-layout",
      missionId,
    );
    const input: LayoutFixerInput = {
      html: page.html,
      pageIndex,
    };

    const result = await this.layoutFixerSkill.execute(input, context);

    if (!result.success || !result.data) {
      this.logger.warn(`[fixLayout] Failed: ${result.error?.message}`);
      return {
        success: false,
        originalHtml: page.html,
        fixedHtml: page.html,
        issuesFound: 0,
        issuesFixed: 0,
        criticalIssues: 0,
      };
    }

    // Update the mission pages with fixed HTML
    if (result.data.fixedHtml !== page.html) {
      await this.updatePageHtml(
        missionId,
        pageIndex,
        result.data.fixedHtml,
        userId,
      );
    }

    return {
      success: true,
      originalHtml: result.data.originalHtml,
      fixedHtml: result.data.fixedHtml,
      issuesFound: result.data.stats.totalIssues,
      issuesFixed: result.data.stats.fixedIssues,
      criticalIssues: result.data.stats.criticalIssues,
    };
  }

  // ============================================
  // Polish Content
  // ============================================

  /**
   * Polish content for all pages in a mission
   * @param missionId - Mission ID
   * @param options - Polish options (style guide, tone, etc.)
   * @returns Polish result with updated pages
   */
  async polishContent(
    missionId: string,
    options: PolishOptions,
    userId: string,
  ): Promise<PolishContentResult> {
    this.logger.log(`[polishContent] Mission: ${missionId}`);

    if (!this.contentPolisherSkill) {
      throw new InternalServerErrorException(
        "Content polisher skill is not available. Please check skill registration.",
      );
    }

    // Get all pages from the mission
    const pages = await this.getPages(missionId, userId);

    const context = this.createSkillContext(
      "content-polisher",
      "polish-content",
      missionId,
    );
    const input: ContentPolisherInput = {
      pages: pages.map((p) => ({
        index: p.index,
        title: p.title,
        content: p.content,
      })),
      styleGuide: options.styleGuide,
      targetTone: options.targetTone,
      language: options.language,
    };

    const result = await this.contentPolisherSkill.execute(input, context);

    if (!result.success || !result.data) {
      this.logger.warn(`[polishContent] Failed: ${result.error?.message}`);
      return {
        success: false,
        pagesPolished: 0,
        totalChanges: 0,
        pages: pages.map((p) => ({
          index: p.index,
          title: p.title,
          content: p.content,
        })),
      };
    }

    // Update pages with polished content
    for (const polishedPage of result.data.pages) {
      await this.updatePageContent(
        missionId,
        polishedPage.index,
        polishedPage.content,
        userId,
      );
    }

    return {
      success: true,
      pagesPolished: result.data.stats.pagesPolished,
      totalChanges: result.data.stats.totalChanges,
      pages: result.data.pages.map((p) => ({
        index: p.index,
        title: p.title,
        content: p.content,
      })),
    };
  }

  // ============================================
  // Fact Check
  // ============================================

  /**
   * Perform fact check on all pages in a mission
   * @param missionId - Mission ID
   * @param strictMode - Whether to use strict verification
   * @returns Fact check results
   */
  async factCheck(
    missionId: string,
    strictMode: boolean,
    userId: string,
  ): Promise<FactCheckResult> {
    this.logger.log(`[factCheck] Mission: ${missionId}, Strict: ${strictMode}`);

    if (!this.factCheckerSkill) {
      throw new InternalServerErrorException(
        "Fact checker skill is not available. Please check skill registration.",
      );
    }

    // Get all pages from the mission
    const pages = await this.getPages(missionId, userId);

    const context = this.createSkillContext(
      "fact-checker",
      "fact-check",
      missionId,
    );
    const input: FactCheckerInput = {
      pages: pages.map((p) => ({
        index: p.index,
        title: p.title,
        content: p.content,
      })),
      strictMode,
    };

    const result = await this.factCheckerSkill.execute(input, context);

    if (!result.success || !result.data) {
      this.logger.warn(`[factCheck] Failed: ${result.error?.message}`);
      return {
        success: false,
        totalClaims: 0,
        verifiedCount: 0,
        disputedCount: 0,
        needsCitationCount: 0,
        overallCredibility: 0,
        pageResults: [],
      };
    }

    return {
      success: true,
      totalClaims: result.data.summary.totalClaims,
      verifiedCount: result.data.summary.verifiedCount,
      disputedCount: result.data.summary.disputedCount,
      needsCitationCount: result.data.summary.needsCitationCount,
      overallCredibility: result.data.summary.overallCredibility,
      pageResults: result.data.results.map((r) => ({
        pageIndex: r.pageIndex,
        overallScore: r.overallScore,
        credibilityLevel: r.credibilityLevel,
        claimsCount: r.claims.length,
      })),
    };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Get page HTML from mission
   */
  private async getPageHtml(
    missionId: string,
    pageIndex: number,
    userId: string,
  ): Promise<{ html: string; title: string }> {
    const mission = await this.prisma.slidesMission.findFirst({
      where: {
        id: missionId,
        userId,
      },
    });

    if (!mission) {
      throw new NotFoundException(`Mission not found: ${missionId}`);
    }

    const pages = (mission.pages as MissionPage[]) || [];
    const page = pages.find((p) => p.index === pageIndex);

    if (!page) {
      throw new NotFoundException(
        `Page ${pageIndex} not found in mission ${missionId}`,
      );
    }

    return {
      html: page.html || page.content || "",
      title: page.title || `Page ${pageIndex + 1}`,
    };
  }

  /**
   * Get all pages from mission
   */
  private async getPages(
    missionId: string,
    userId: string,
  ): Promise<Array<{ index: number; title: string; content: string }>> {
    const mission = await this.prisma.slidesMission.findFirst({
      where: {
        id: missionId,
        userId,
      },
    });

    if (!mission) {
      throw new NotFoundException(`Mission not found: ${missionId}`);
    }

    const pages = (mission.pages as MissionPage[]) || [];

    return pages.map((p) => ({
      index: p.index,
      title: p.title || `Page ${p.index + 1}`,
      content: p.html || p.content || "",
    }));
  }

  /**
   * Update page HTML in mission
   */
  private async updatePageHtml(
    missionId: string,
    pageIndex: number,
    newHtml: string,
    userId: string,
  ): Promise<void> {
    const mission = await this.prisma.slidesMission.findFirst({
      where: {
        id: missionId,
        userId,
      },
    });

    if (!mission) {
      this.logger.warn(`[updatePageHtml] Mission not found: ${missionId}`);
      return;
    }

    const pages = (mission.pages as MissionPage[]) || [];
    const pageIdx = pages.findIndex((p) => p.index === pageIndex);

    if (pageIdx === -1) {
      this.logger.warn(
        `[updatePageHtml] Page ${pageIndex} not found in mission ${missionId}`,
      );
      return;
    }

    pages[pageIdx].html = newHtml;

    await this.prisma.slidesMission.update({
      where: { id: missionId },
      data: { pages: pages as unknown as object },
    });

    this.logger.debug(
      `[updatePageHtml] Updated page ${pageIndex} in mission ${missionId}`,
    );
  }

  /**
   * Update page content in mission
   */
  private async updatePageContent(
    missionId: string,
    pageIndex: number,
    newContent: string,
    userId: string,
  ): Promise<void> {
    await this.updatePageHtml(missionId, pageIndex, newContent, userId);
  }

  /**
   * Create skill context
   */
  private createSkillContext(
    skillId: string,
    operation: string,
    missionId: string,
  ): SkillContext {
    return {
      executionId: `${operation}-${missionId}-${Date.now()}`,
      skillId,
      domain: "slides",
      sessionId: missionId,
      createdAt: new Date(),
      metadata: {
        operation,
        missionId,
      },
    };
  }
}
