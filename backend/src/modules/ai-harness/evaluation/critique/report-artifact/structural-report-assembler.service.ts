/**
 * StructuralReportAssembler —— v1.4 报告装配重构核心
 *
 * 上游：docs/architecture/ai-harness/evaluation/report-assembly-invariant-redesign.md v1.4
 *
 * 设计要点（与文档严格一致）：
 *   - 把"文档结构决定权"从 LLM 收回到 backend
 *   - 输入：ReportSegments（plan + bodies + citations 等）
 *   - 输出：ReportArtifact（fullMarkdown + sections[] 一次性产出）
 *   - 不调 LLM，纯字符串拼装
 *   - 拼装时记录 offset，不"回头解析"
 *   - sections.length === expectedSectionCount(template, segments)
 *
 * stateless 强约束（v1.2 B6）：
 *   - 禁止任何实例字段
 *   - assemble() 内所有中间变量局部于方法栈
 *   - return 必为新对象（不持有 caller 传入对象的引用）
 *   - spec 锁 Promise.all 互不污染（structural-report-assembler.spec.ts）
 *
 * v1.4 类型严格化：
 *   - ReportTemplate.slot.bodySource 用 discriminated union
 *   - 编译期严格区分 fromBodies / fromBuilder
 *   - 不再有 `as never` cast
 */

import { Injectable } from "@nestjs/common";
import { sanitizeMarkdownBody } from "../../../../ai-engine/content/markdown/markdown-sanitizer.util";
import type { SanitizeOptions } from "../../../../ai-engine/content/markdown/markdown-sanitizer.types";
import {
  MULTI_DIMENSION_REPORT_TEMPLATE,
  expectedSectionCount,
  type ReportSegments,
  type ReportTemplateSlot,
  type SlotBodySource,
} from "./report-segments.dto";
import type { ReportArtifact, ArtifactSection } from "./report-artifact.dto";

/** 拼装中间产物：一段 = 标题 + body + offset 区间 */
interface AssembledChunk {
  title: string;
  type: ArtifactSection["type"];
  level: 2 | 3;
  body: string;
  startOffset: number;
  endOffset: number;
  sourceDimensionId?: string;
}

@Injectable()
export class StructuralReportAssembler {
  /**
   * 主入口 — 拼装 ReportArtifact
   * stateless：所有中间变量局部，无实例字段
   */
  assemble(segments: ReportSegments): ReportArtifact {
    const tpl = segments.template ?? MULTI_DIMENSION_REPORT_TEMPLATE;

    // 局部 accumulator 收集 sanitizerVersion（v1.6: stateless 严守 — 不放实例字段）
    const sanitizerAcc: { sanitizerVersion?: string } = {};

    // 1. dim.name 入装前防御（B9）
    const safePlan = this.sanitizePlan(segments.plan);
    const safeSegments: ReportSegments = { ...segments, plan: safePlan };

    // 2. 按 slot 顺序拼装，记录 offset
    const chunks: AssembledChunk[] = [];
    let cursor = 0;
    for (const slot of tpl.slots) {
      if (slot.kind === "loop" && slot.key === "perDimension") {
        for (const dim of safePlan.dimensions) {
          const item = safeSegments.bodies.perDimension.find(
            (p) => p.dimensionId === dim.id,
          );
          const bodyRaw = item?.body ?? null;
          const body =
            bodyRaw === null
              ? "*（本维度内容缺失）*"
              : this.runSanitizer(
                  bodyRaw,
                  safePlan.dimensions.map((d) => d.name),
                  sanitizerAcc,
                );
          const chunk = this.makeChunk(
            cursor,
            dim.name,
            "dimension",
            2,
            body,
            dim.id,
          );
          chunks.push(chunk);
          cursor = chunk.endOffset;
        }
        continue;
      }

      if (slot.kind === "fixed" || slot.kind === "optional") {
        const body = this.resolveSlotBody(slot, safeSegments, sanitizerAcc);
        if (slot.kind === "optional" && !body.trim()) continue;
        const type = this.slotTypeFor(slot.key);
        const chunk = this.makeChunk(cursor, slot.title, type, 2, body);
        chunks.push(chunk);
        cursor = chunk.endOffset;
      }
    }

    // 3. fullMarkdown
    const fullMarkdown = chunks
      .map((c) => `## ${c.title}\n\n${c.body}`)
      .join("\n\n");

    // 4. sections[] 由 chunks 派生（offset 一一对齐）
    const sections: ArtifactSection[] = chunks.map((c, i) => ({
      id: `sec-${i + 1}`,
      type: c.type,
      level: c.level,
      title: c.title,
      anchor: this.slugify(c.title),
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      wordCount: this.countWords(c.body),
      readingTimeMinutes: Math.max(1, Math.ceil(this.countWords(c.body) / 250)),
      citations: [],
      figureIds: [],
      factIds: [],
      sourceDimensionId: c.sourceDimensionId,
    }));

    // 5. 不变量自检（v1.5 收尾：从 noop 改为真实写 metadata）
    const expected = expectedSectionCount(tpl, safeSegments);
    const sectionCountMismatch =
      sections.length !== expected
        ? { expected, actual: sections.length }
        : undefined;

    return {
      content: {
        fullMarkdown,
        fullReportSize: Buffer.byteLength(fullMarkdown, "utf-8"),
      },
      sections,
      citations: segments.citations,
      figures: segments.figures,
      factTable: segments.factTable,
      quickView: this.buildQuickView(safeSegments, sections),
      metadata: {
        ...segments.metadata,
        templateId: tpl.id,
        sanitizerVersion: sanitizerAcc.sanitizerVersion,
        sectionCountMismatch,
      },
      quality: this.buildQualityVerdicts(segments.qualityInputs, sections),
    };
  }

  /**
   * dim.name 多重防御：strip newline + trim + slice(0, 200)
   * v1.6 (代码评审反馈): 加 null/non-string guard，避免 sanitizePlan
   * 因 LLM/上游意外返回 null/undefined/number 而抛 TypeError（spec 测试
   * 应通过显式 mock 触发降级，而非靠 .replace(null) 这种实现细节脆弱性）。
   */
  private sanitizePlan(plan: ReportSegments["plan"]): ReportSegments["plan"] {
    return {
      themeSummary: plan.themeSummary,
      dimensions: plan.dimensions.map((d) => ({
        id: d.id,
        name: String(d.name ?? "")
          .replace(/[\r\n]/g, " ")
          .trim()
          .slice(0, 200),
        rationale: d.rationale,
      })),
    };
  }

  private resolveSlotBody(
    slot: Extract<ReportTemplateSlot, { kind: "fixed" | "optional" }>,
    segments: ReportSegments,
    sanitizerAcc: { sanitizerVersion?: string },
  ): string {
    const src: SlotBodySource = slot.bodySource;
    if (src.kind === "fromBodies") {
      const raw = segments.bodies[src.field];
      const text = typeof raw === "string" ? raw : "";
      return text.trim()
        ? this.runSanitizer(
            text,
            segments.plan.dimensions.map((d) => d.name),
            sanitizerAcc,
          )
        : "";
    }
    // fromBuilder
    return this.runBuilder(src.builder, segments);
  }

  private runBuilder(
    builder: Extract<SlotBodySource, { kind: "fromBuilder" }>["builder"],
    segments: ReportSegments,
  ): string {
    switch (builder) {
      case "toc":
        return this.buildToc(segments);
      case "references":
        return this.buildReferences(segments);
      case "foreword-preface":
        return segments.bodies.preface ?? "";
      case "foreword-conclusion":
        return segments.bodies.conclusion ?? "";
      case "foreword-recommendations":
        return segments.bodies.recommendations ?? "";
    }
  }

  /** 自动目录 — 用 plan.dimensions 构造（fallback：从 sections 派生） */
  private buildToc(segments: ReportSegments): string {
    const lines = segments.plan.dimensions.map(
      (d, i) => `${i + 1}. [${d.name}](#${this.slugify(d.name)})`,
    );
    return lines.length === 0 ? "*（本报告无章节）*" : lines.join("\n");
  }

  /** 自动参考文献 — 从 citations 派生 */
  private buildReferences(segments: ReportSegments): string {
    if (!segments.citations || segments.citations.length === 0) {
      return "*（本报告无参考文献）*";
    }
    return segments.citations
      .map((c) => `${c.index}. [${c.title}](${c.url}) — ${c.domain}`)
      .join("\n");
  }

  /**
   * 单段 sanitize：注入 knownDimNames 让 sanitizer 精确剥首行 H2
   *
   * v1.6 (架构师二轮 hard miss B 修): 通过局部 accumulator 收集 sanitizerVersion
   * 让 assemble() 写入 metadata.sanitizerVersion，同时**严守 stateless**
   * （B6 约束：不允许实例字段）—— accumulator 是 caller 局部对象的引用。
   */
  private runSanitizer(
    raw: string,
    knownDimNames: string[],
    acc: { sanitizerVersion?: string },
  ): string {
    const opts: SanitizeOptions = { knownDimNames };
    const result = sanitizeMarkdownBody(raw, opts);
    acc.sanitizerVersion = result.sanitizerVersion;
    return result.body;
  }

  /**
   * 拼装时计算 offset
   * 每段 = "## {title}\n\n{body}"，段间用 "\n\n" 连接
   */
  private makeChunk(
    cursor: number,
    title: string,
    type: ArtifactSection["type"],
    level: 2 | 3,
    body: string,
    sourceDimensionId?: string,
  ): AssembledChunk {
    const headerLine = `## ${title}\n\n`;
    const sep = cursor === 0 ? "" : "\n\n";
    const startOffset = cursor + sep.length;
    const text = sep + headerLine + body;
    const endOffset = cursor + text.length;
    return {
      title,
      type,
      level,
      body,
      startOffset,
      endOffset,
      sourceDimensionId,
    };
  }

  private slotTypeFor(key: string): ArtifactSection["type"] {
    switch (key) {
      case "execSummary":
        return "executive_summary";
      case "preface":
      case "toc":
        return "preface";
      case "crossDim":
        return "cross_dimension";
      case "risk":
        return "risk_assessment";
      case "recommendations":
        return "recommendations";
      case "conclusion":
        return "conclusion";
      case "references":
        return "appendix";
      default:
        return "appendix";
    }
  }

  private buildQuickView(
    segments: ReportSegments,
    sections: ArtifactSection[],
  ): ReportArtifact["quickView"] {
    const exec = sections.find((s) => s.type === "executive_summary");
    return {
      executiveSummary: {
        markdown: segments.bodies.executiveSummary ?? "",
        wordCount: exec?.wordCount ?? 0,
      },
      topHighlights: [],
      topTrends: [],
      keyRisks: [],
      topRecommendations: [],
      keyCitations: segments.citations.slice(0, 5).map((c) => c.index),
      keyFigures: segments.figures.slice(0, 3).map((f) => f.id),
      estimatedReadingTime: sections.reduce(
        (sum, s) => sum + s.readingTimeMinutes,
        0,
      ),
      whatYouWillLearn: [],
    };
  }

  private buildQualityVerdicts(
    qualityInputs: ReportSegments["qualityInputs"],
    sections: ArtifactSection[],
  ): ReportArtifact["quality"] {
    const verifierAvg =
      Object.values(qualityInputs.verifierScores).length === 0
        ? 70
        : Math.round(
            Object.values(qualityInputs.verifierScores).reduce(
              (a, b) => a + b,
              0,
            ) / Object.values(qualityInputs.verifierScores).length,
          );
    const wordCounts = sections.map((s) => s.wordCount);
    const total = wordCounts.reduce((a, b) => a + b, 0);
    const avg = wordCounts.length > 0 ? total / wordCounts.length : 0;
    const max = Math.max(...(wordCounts.length ? wordCounts : [0]));
    const balance =
      avg > 0 ? Math.max(0, 100 - Math.round((max / avg - 1) * 30)) : 0;

    return {
      overall: verifierAvg,
      dimensions: {
        traceability: verifierAvg,
        factualConsistency: verifierAvg,
        novelty: 70,
        coverage: 70,
        redundancy: 80,
        formatCorrectness: 90,
        citationDensity: 70,
        styleConformance: 80,
        lengthAccuracy: 80,
        chapterBalance: balance,
      },
      hardGateViolations: [],
      warnings: qualityInputs.warnings.map((w) => ({
        dimension: w.scopeKey,
        message: w.message,
      })),
      qualityTrace: [],
      finalVerdict:
        verifierAvg >= 85
          ? "excellent"
          : verifierAvg >= 70
            ? "good"
            : verifierAvg >= 50
              ? "acceptable"
              : "poor",
    };
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^\w一-鿿\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 64);
  }

  private countWords(s: string): number {
    if (!s) return 0;
    const cn = (s.match(/[一-鿿]/g) ?? []).length;
    const en = (s.match(/\b[a-zA-Z][a-zA-Z0-9'-]*\b/g) ?? []).length;
    return cn + en;
  }
}

/** Default singleton instance — 方便测试 + non-DI 调用 */
export const defaultStructuralReportAssembler = new StructuralReportAssembler();

/**
 * Pure-function variant: assemble() 不需要 NestJS DI 时直接调
 */
export function assembleStructuralReport(
  segments: ReportSegments,
): ReportArtifact {
  return defaultStructuralReportAssembler.assemble(segments);
}
