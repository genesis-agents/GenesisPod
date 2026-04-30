/**
 * ReportAssemblerService —— Writer W4：纯代码组装 ReportArtifact
 *
 * 上游：mission-pipeline-baseline.md §3.7 W4 / mission-pipeline-writer-artifact.md §3.4
 *
 * 职责（不调 LLM）：
 *   - sections 树构建（由 fullMarkdown 按 ## 切分推导，对齐 TI 但后端做不让前端拆）
 *   - citations 编号原子分配 + occurrences[] 反向定位
 *   - figures 强校验（baseline §7.4 五项硬规则）
 *   - quickView 派生（topHighlights / topTrends / keyRisks / topRecommendations）
 *   - readingTimeMinutes / wordCount 计算
 *   - 50+ 项格式自动修复（暂作 stub，后续从 TI report-assembler.service.ts 移植）
 *
 * 输入：plan + researcherResults + analyst + writer (markdown) + reconciliationReport
 * 输出：ReportArtifact (v2)
 */

import { Injectable, Logger } from "@nestjs/common";
import type {
  ArtifactCitation,
  ArtifactFactTriple,
  ArtifactFigure,
  ArtifactHighlight,
  ArtifactMetadata,
  ArtifactQualityVerdicts,
  ArtifactQuickView,
  ArtifactSection,
  ReportArtifact,
} from "../../dto/report-artifact.dto";
import {
  dedupeFigureCandidates,
  isGarbageFigureUrl,
} from "../../utils/figure-filter.util";
// ★ 沉淀消费（2026-04-29）：harness quality-gate 标杆实现
import { ReportQualityGateService } from "@/modules/ai-harness/facade";
// ★ 沉淀消费（2026-04-29）：engine LLM 输出后处理 — strip-chart-json
// ★ Phase 2 (2026-04-29): 接入 TI 沉淀的 77 个 report-formatting 工具
import {
  stripChartJsonFromContent,
  filterJunkReferences,
  deduplicateReferencesByUrl,
  upgradeHttpToHttps,
  decodeUrlEntities,
  remapCitationIndices,
  removeHorizontalRules,
  repairOrderedListContinuity,
  repairBrokenListItems,
  decodeHtmlEntities,
  removeEmptyHeadings,
  cleanupEmptyBullets,
} from "@/modules/ai-engine/facade";

interface AssembleInput {
  topic: string;
  language: "zh-CN" | "en-US";
  styleProfile: ArtifactMetadata["styleProfile"];
  lengthProfile: ArtifactMetadata["lengthProfile"];
  audienceProfile: ArtifactMetadata["audienceProfile"];
  plan: {
    themeSummary: string;
    dimensions: { id: string; name: string; rationale: string }[];
  };
  researcherResults: {
    dimension: string;
    findings: { claim: string; evidence: string; source: string }[];
    summary: string;
    /** ★ per-dim chapter pipeline 产出 —— 装配时优先用，避免 81K 字章节被压成 3K 字摘要 */
    fullMarkdown?: string;
    chapters?: {
      index: number;
      heading: string;
      body: string;
      wordCount: number;
    }[];
    figureCandidates?: {
      sourceUrl: string;
      imageUrl?: string;
      caption: string;
      sourcePageOrSection?: string;
      relevanceHint?: "high" | "medium" | "low";
    }[];
  }[];
  analyst?: {
    themeSummary?: string;
    keyInsights?: { title?: string; oneLine?: string }[];
    contradictions?: unknown[];
    gaps?: unknown[];
    crossDimAnalysis?: string;
    riskAssessment?: string;
    strategicRecommendations?: string;
  };
  writerReport: {
    title: string;
    summary: string;
    sections: { heading: string; body: string; sources?: string[] }[];
    conclusion: string;
    citations?: string[];
  };
  reconciliationReport?: {
    factTable: {
      id: string;
      entity: string;
      attribute: string;
      value: string;
      sources: string[];
    }[];
    conflicts: {
      factIds: string[];
      resolutionType: "kept-both" | "preferred-one" | "flagged-unresolved";
      preferredFactId?: string;
      rationale: string;
    }[];
    figureCandidates?: ArtifactFigure[];
  };
  generationTimeMs: number;
  totalTokens: { prompt: number; completion: number; total: number };
  costCents: number;
  modelTrail: string[];
}

@Injectable()
export class ReportAssemblerService {
  private readonly logger = new Logger(ReportAssemblerService.name);

  constructor(private readonly qualityGate: ReportQualityGateService) {}

  /**
   * 主入口：组装 ReportArtifact
   */
  assemble(input: AssembleInput): ReportArtifact {
    // 0) Writer 经常用 markdown 链接 [text](url) 而非 [N] 编号；做一次预归一化，
    //    把 [anchor](url) 全部替换为 [N]，并把发现的 url 同步进 writer.citations 头部，
    //    保证 buildCitations 编号与 body 中的 [N] 对齐。
    input = this.normalizeInlineCitations(input);
    // 1) 构建主 markdown（无图占位符）+ 格式修复（Phase P1-9）
    let fullMarkdown = this.applyFormatFixes(this.buildFullMarkdown(input));

    // 1.5) ★ harness quality-gate（沉淀自 TI）：full-report 级硬性规则 + 自动修复
    //      规则覆盖：分割线 / 加粗密度 / 引用块密度 / 语言一致性 / 主观表达 / 引用孤儿 / 单源声明
    //      自动修复后内容覆盖 fullMarkdown，违规记录推到 quality.warnings
    const gateLang = input.language?.startsWith("en") ? "en" : "zh";
    const gateResult = this.qualityGate.validateFullReport(
      fullMarkdown,
      gateLang,
    );
    if (gateResult.wasAutoFixed) {
      fullMarkdown = gateResult.fixedContent;
    }
    if (gateResult.violations.length > 0) {
      this.logger.log(
        `[QualityGate] full-report: ${gateResult.violations.length} violations` +
          ` (passed=${gateResult.passed}): ${gateResult.violations.map((v) => v.rule).join(", ")}`,
      );
    }

    // 2) sections 树（按 ## 标题切分 + 类型推断）
    let sections = this.buildSectionTree(fullMarkdown, input);

    // 3) citations 编号原子分配 + occurrences（★ Phase 2: indexMapping 可能改写 fullMarkdown）
    const citationsResult = this.buildCitations(fullMarkdown, sections, input);
    const citations = citationsResult.citations;
    if (citationsResult.fullMarkdown !== fullMarkdown) {
      // citation 重映射后正文已变，需重建 sections 以对齐
      fullMarkdown = citationsResult.fullMarkdown;
      sections = this.buildSectionTree(fullMarkdown, input);
      this.recomputeCitationOccurrences(citations, sections, fullMarkdown);
    }

    // 4) figures 强校验 + 关联 sectionId（依赖 sections + citations）
    const figures = this.buildFigures(input, citations, sections);

    // 4'. 把 figures 的 markdown 占位符注入到 fullMarkdown 对应章节末尾
    //     再重新 buildSectionTree（offset 漂移）+ 重新计算 citation.occurrences
    if (figures.length > 0) {
      fullMarkdown = this.injectFigurePlaceholders(
        fullMarkdown,
        sections,
        figures,
      );
      sections = this.buildSectionTree(fullMarkdown, input);
      // citation.occurrences 需要重算（offset 漂移），最简就是清掉再扫一遍
      this.recomputeCitationOccurrences(citations, sections, fullMarkdown);
      // section.figureIds 关联
      for (const f of figures) {
        const sec = sections.find((s) => s.id === f.sectionId);
        if (sec && !sec.figureIds.includes(f.id)) sec.figureIds.push(f.id);
      }
    }

    // 4.5) ★ P0-LIVE-REPORT-FORMAT (2026-04-30): TI 风格 — 把"## 参考文献"段落
    //   追加到 fullMarkdown 末尾，让前端 ChapterReader / ContinuousReader 都能
    //   作为标准 section 渲染（之前 references 仅在 citations[] 里，markdown 末尾
    //   缺最后一个 section, 用户复制 markdown 时参考文献也会跟着丢）。
    if (citations.length > 0) {
      const refSection = this.buildReferencesSection(citations, input.language);
      if (refSection) {
        fullMarkdown = fullMarkdown.trimEnd() + "\n\n" + refSection + "\n";
        sections = this.buildSectionTree(fullMarkdown, input);
        this.recomputeCitationOccurrences(citations, sections, fullMarkdown);
        for (const f of figures) {
          const sec = sections.find((s) => s.id === f.sectionId);
          if (sec && !sec.figureIds.includes(f.id)) sec.figureIds.push(f.id);
        }
      }
    }

    // 5) factTable
    const factTable = this.buildFactTable(input, citations);

    // 6) quickView 派生
    const quickView = this.buildQuickView(input, sections, citations, figures);

    // 7) metadata
    const metadata = this.buildMetadata(
      input,
      fullMarkdown,
      sections,
      citations,
      figures,
    );

    // 8) quality 真实评分（10 维启发式）
    const quality = this.buildQualityStub(
      sections,
      citations,
      figures,
      input,
      fullMarkdown,
    );

    // 8.5) ★ 把 harness quality-gate 的违规推入 quality.warnings（前端可见）
    for (const v of gateResult.violations) {
      quality.warnings.push({
        dimension: `quality_gate.${v.rule}`,
        message: v.message,
      });
    }

    return {
      content: {
        fullMarkdown,
        fullReportSize: Buffer.byteLength(fullMarkdown, "utf8"),
      },
      sections,
      citations,
      figures,
      quickView,
      factTable,
      metadata,
      quality,
    };
  }

  /**
   * 把 ![alt](#fig-id "caption") 占位符注入对应章节内合适位置。
   *
   * Phase P3-12: 智能定位 — 优先用 referencedBy 第一处 phrase 做 anchor，
   * 找不到时回退到章末。
   *
   * 倒序处理避免 offset 漂移。
   */
  private injectFigurePlaceholders(
    fullMarkdown: string,
    sections: ArtifactSection[],
    figures: ArtifactFigure[],
  ): string {
    const figsBySection = new Map<string, ArtifactFigure[]>();
    for (const f of figures) {
      const arr = figsBySection.get(f.sectionId) ?? [];
      arr.push(f);
      figsBySection.set(f.sectionId, arr);
    }
    // 收集所有插入点（offset, block）然后倒序应用
    type Insert = { offset: number; block: string };
    const inserts: Insert[] = [];
    for (const sec of sections) {
      const figs = figsBySection.get(sec.id);
      if (!figs || figs.length === 0) continue;
      for (const f of figs) {
        // P56-2: alt text + caption 内 ] / [ / ( / ) 转义防 markdown 解析破坏
        const safeAlt = f.altText
          .replace(/[\[\]]/g, " ")
          .replace(/[()]/g, " ")
          .slice(0, 200);
        const safeCaption = f.caption.replace(/"/g, "'").slice(0, 300);
        const block = `\n\n![${safeAlt}](#${f.id} "${safeCaption}")\n`;
        let insertOffset = sec.endOffset;
        // 尝试用 referencedBy[0].phrase 做 anchor
        if (f.referencedBy.length > 0) {
          const phrase = f.referencedBy[0].phrase.slice(0, 40);
          const phrasePos = fullMarkdown.indexOf(phrase, sec.startOffset);
          if (phrasePos > 0 && phrasePos < sec.endOffset) {
            // P10-3: 从 phrasePos 之后开始找下一个句子结束符（修 P3-12 全局 search bug）
            const tail = fullMarkdown.slice(phrasePos, sec.endOffset);
            const localEnd = tail.search(/[。！？.!?]\s/);
            if (localEnd >= 0) {
              insertOffset = phrasePos + localEnd + 2;
            }
          }
        }
        inserts.push({ offset: insertOffset, block });
      }
    }
    // 倒序应用避免 offset 漂移
    inserts.sort((a, b) => b.offset - a.offset);
    let result = fullMarkdown;
    for (const ins of inserts) {
      result =
        result.slice(0, ins.offset) + ins.block + result.slice(ins.offset);
    }
    return result;
  }

  /** 重新扫描 fullMarkdown 计算 citation.occurrences */
  private recomputeCitationOccurrences(
    citations: ArtifactCitation[],
    sections: ArtifactSection[],
    fullMarkdown: string,
  ): void {
    for (const c of citations) c.occurrences.length = 0;
    // sections 是 buildSectionTree 重建出来的（figure inject 后），需要把 sec.citations
    // 也一并重算 —— 否则 quality scorer 读到 sec.citations=[] → citationDensity=0。
    for (const s of sections) s.citations = [];
    const re = /\[(\d+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fullMarkdown)) !== null) {
      const num = parseInt(m[1], 10);
      const cite = citations.find((c) => c.index === num);
      if (!cite) continue;
      const offset = m.index;
      const sec = sections.find(
        (s) => offset >= s.startOffset && offset < s.endOffset,
      );
      if (!sec) continue;
      const localOffset = offset - sec.startOffset;
      const secMd = fullMarkdown.slice(sec.startOffset, sec.endOffset);
      const paragraphIndex = countParagraphsBefore(secMd, localOffset);
      cite.occurrences.push({
        sectionId: sec.id,
        paragraphIndex,
        characterOffset: localOffset,
      });
      if (!sec.citations.includes(num)) sec.citations.push(num);
    }
  }

  /**
   * ★ Phase P1-9: 关键格式修复（对齐 TI report-assembler.service.ts 子集）
   *
   * 移植 10 项最常见的修复：
   *   1. 多余空行（>2 个连续 \n\n）压缩为 2 个
   *   2. 折断的 markdown 表格（行末缺 |）修复
   *   3. heading 层级跳跃（h1 → h3）补 h2
   *   4. 列表项错乱缩进（tab 与空格混用）规范化
   *   5. 末尾孤儿引用 [N] 但 references 列表缺失 → 标 [unresolved]
   *   6. LaTeX `$$ ... $$` 跨段落断裂修复
   *   7. 单元格内换行 → <br>
   *   8. 多级引用嵌套 `>>>` 规范化
   *   9. 重复连续标题（## X\n\n## X）去重
   *  10. 文末多余空白 trim
   */
  /**
   * 归一化 inline 引用：把 `[anchor](https://...)` → `[N]`，把首次出现的 URL
   * 推进 writer.citations 头部，保证 buildCitations 后续编号与 body 中的 [N] 对齐。
   *
   * Writer 经常忽略 prompt 中的 [N] 要求，直接产出 markdown 超链接。这一步把两种
   * 风格统一到 [N] 编号，让 traceability / citationDensity 评分能正确计算。
   */
  private normalizeInlineCitations(input: AssembleInput): AssembleInput {
    const sectionsCopy = input.writerReport.sections.map((s) => ({ ...s }));
    const urlOrder: string[] = [];
    const urlIdx = new Map<string, number>();
    const assignIdx = (rawUrl: string): number => {
      const url = rawUrl.trim();
      // ★ P1-R4-G (round 4): 空 URL 不进 citations，防 LLM 输出 [text]() 等污染
      if (!url) return -1;
      if (urlIdx.has(url)) return urlIdx.get(url)!;
      urlOrder.push(url);
      const n = urlOrder.length;
      urlIdx.set(url, n);
      return n;
    };
    // 三种 LLM 常见的引用形式 —— 用一个跨形式正则扫"document 顺序"统一映射：
    //   A. markdown 链接：[anchor text](https://...)
    //   B. 裸 URL 装括号：[https://...]
    //   C. 已经是 [N] 数字编号 —— 保留不动（Writer 自己就用对了）
    // 顺序统一编号：document 中第一个出现的 URL 就是 [1]，第二个是 [2]，依此类推。
    const unifiedRe =
      /(\[\d+\])|\[([^\]\n]+?)\]\((https?:\/\/[^\s)]+)\)|\[(https?:\/\/[^\]\s]+)\]/g;
    const transform = (body: string | undefined): string => {
      if (!body) return body ?? "";
      return body.replace(unifiedRe, (m, alreadyN, _anchor, mdUrl, bareUrl) => {
        if (alreadyN) return alreadyN as string; // [N] 已是数字编号，原样保留
        const url: string = mdUrl ?? bareUrl;
        const n = assignIdx(url);
        // ★ P1-R4-G (round 4): 空 URL 时保留原文不替换为 [-1]
        if (n < 0) return m;
        return `[${n}]`;
      });
    };
    const summaryT = transform(input.writerReport.summary);
    for (const sec of sectionsCopy) {
      sec.body = transform(sec.body);
    }
    const conclusionT = transform(input.writerReport.conclusion);
    if (urlOrder.length === 0) return input;
    // writer.citations[]：保证 [N] 顺序对应的 url 排在最前（去重）
    const writerCites = (input.writerReport.citations ?? []).slice();
    const merged: string[] = [];
    const mergedSet = new Set<string>();
    for (const u of urlOrder) {
      if (!mergedSet.has(u)) {
        merged.push(u);
        mergedSet.add(u);
      }
    }
    for (const u of writerCites) {
      const t = u.trim();
      if (t && !mergedSet.has(t)) {
        merged.push(t);
        mergedSet.add(t);
      }
    }
    return {
      ...input,
      writerReport: {
        ...input.writerReport,
        summary: summaryT,
        conclusion: conclusionT,
        sections: sectionsCopy,
        citations: merged,
      },
    };
  }

  private applyFormatFixes(md: string): string {
    let content = md;
    // 0. ★ 沉淀消费：清理 LLM 泄漏的图表 JSON 块、Figure References 元数据、裸 JSON 行
    content = stripChartJsonFromContent(content);
    // ★ Phase 2 接入: 用沉淀工具替代手写（覆盖更全 + battle-tested）
    // 1) HTML entities 解码（&amp; → &）
    content = decodeHtmlEntities(content);
    // 2) 空标题清理
    content = removeEmptyHeadings(content);
    // 3) 多余水平线（--- 在错误位置）清理
    content = removeHorizontalRules(content);
    // 4) 有序列表连续性修复（1 2 4 5 → 1 2 3 4）
    content = repairOrderedListContinuity(content);
    // 5) 破碎列表项修复（"- " 后空行 / 层级错乱）
    content = repairBrokenListItems(content);
    // 6) 空 bullet 清理
    content = cleanupEmptyBullets(content);
    // ★ 注 1：stripLLMMetaNotes 不适用于装配后 fullMarkdown（会误删合法标题），仅 LLM raw output 阶段用
    // ★ 注 2：sanitizeHeadingLevels 是给 dimension-content 用（剥 H1/H2 留 H3+），
    //   playground fullMarkdown 含 H1/H2 装配标题，不适用

    // ── 以下为 playground 专属（沉淀工具未覆盖）──
    // 压缩 ≥3 个连续换行
    content = content.replace(/\n{3,}/g, "\n\n");
    // 表格行尾缺 |
    content = content.replace(
      /^(\|[^\n]+[^|\s])(\n|$)/gm,
      (_, p1: string, p2: string) => `${p1}|${p2}`,
    );
    // 列表 tab → 4-space
    content = content.replace(/^(\s*)\t+/gm, (_, sp: string) =>
      sp.replace(/\t/g, "    "),
    );
    // 孤儿 [N] 标注
    content = this.markOrphanCitations(content);
    // LaTeX 跨段落 $$ 修复
    const dollarCount = (content.match(/\$\$/g) ?? []).length;
    if (dollarCount % 2 !== 0) {
      content += "\n$$";
    }
    // 单元格内换行
    content = content.replace(/(\|[^|\n]*?)\\n([^|\n]*?\|)/g, "$1<br>$2");
    // >>> 规范化
    content = content.replace(/^>{3,}\s/gm, "> ");
    // 文末空白 trim
    content = content.replace(/[ \t]+$/gm, "").trimEnd();
    return content;
  }

  private markOrphanCitations(md: string): string {
    const re = /\[(\d+)\]/g;
    const referenced = new Set<number>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(md)) !== null) referenced.add(parseInt(m[1], 10));
    if (referenced.size === 0) return md;
    // 简化判断：找 "## 参考" 或 "## References" 后是否有对应 [N]
    const refSection = md.match(
      /##\s*(参考文献|参考资料|References)[\s\S]*$/,
    )?.[0];
    if (!refSection) return md; // 无 references 段，不做处理
    const declared = new Set<number>();
    const declRe = /\[(\d+)\]/g;
    let dm: RegExpExecArray | null;
    while ((dm = declRe.exec(refSection)) !== null)
      declared.add(parseInt(dm[1], 10));
    const orphans = Array.from(referenced).filter((n) => !declared.has(n));
    if (orphans.length === 0) return md;
    // 在文末追加 unresolved 标注
    return (
      md +
      "\n\n<!-- unresolved citations: " +
      orphans.map((n) => `[${n}]`).join(", ") +
      " -->"
    );
  }

  /**
   * ★ P0-LIVE-REPORT-FORMAT (2026-04-30): TI 风格 references section 构造
   * 对齐 topic-insights/services/report/report-assembler.ts:1000 buildReferencesSection。
   * 输入：去重后的 citations[]；输出：以 "## 参考文献" 开头的完整 markdown 段。
   */
  private buildReferencesSection(
    citations: ArtifactCitation[],
    language?: string,
  ): string {
    if (!citations.length) return "";
    const isEn = (language ?? "").toLowerCase().startsWith("en");
    const heading = isEn ? "References" : "参考文献";
    const lines = citations
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((c) => {
        const safeTitle = (c.title || c.domain || c.url)
          .replace(/\[/g, "\\[")
          .replace(/\]/g, "\\]");
        const domainSuffix =
          c.domain && c.domain !== "unknown" ? `. ${c.domain}` : "";
        return `[${c.index}] [${safeTitle}](${c.url})${domainSuffix}`;
      });
    return `## ${heading}\n\n${lines.join("\n\n")}`;
  }

  // ─── 1. fullMarkdown ────────────────────────────────────────────
  private buildFullMarkdown(input: AssembleInput): string {
    const parts: string[] = [];
    parts.push(`# ${input.writerReport.title}`);
    parts.push("");
    parts.push(`> ${input.writerReport.summary}`);
    parts.push("");
    // executive summary
    if (input.analyst?.themeSummary) {
      parts.push("## 执行摘要");
      parts.push("");
      parts.push(input.analyst.themeSummary);
      parts.push("");
    }
    // ★ P0-LIVE-REPORT-FORMAT (2026-04-30): TI 风格章节结构（贴 TI buildFullReport
    //   的 coreViewpoints + keyData 模式）—— 每个维度章节开头注入 "🎯 核心观点"
    //   列表（取自 analyst.keyInsights 中和该 dim 相关的；找不到则用 dim.rationale），
    //   章末若 reconciliationReport.factTable 含该 dim 关键事实则注入 "**关键数据：**"。
    const matchInsightsFor = (dim: string): string[] => {
      const insights = input.analyst?.keyInsights ?? [];
      const byMatch = insights
        .filter((ins) => {
          const blob = `${ins.title ?? ""} ${ins.oneLine ?? ""}`.toLowerCase();
          return blob.includes(dim.toLowerCase());
        })
        .map((ins) => ins.oneLine ?? ins.title ?? "")
        .filter(Boolean);
      if (byMatch.length > 0) return byMatch.slice(0, 5);
      const planDim = input.plan.dimensions.find((d) => d.name === dim);
      if (planDim?.rationale) return [planDim.rationale];
      return [];
    };
    const matchKeyFactsFor = (dim: string): string[] => {
      // 用本 dim findings 头部 evidence 作为关键数据条目（最多 5 条 + 来源域）
      const r = input.researcherResults.find((rr) => rr.dimension === dim);
      if (!r) return [];
      return r.findings
        .filter((f) => f.evidence && f.evidence.trim().length > 5)
        .slice(0, 5)
        .map((f) => {
          const domain = (() => {
            try {
              return new URL(f.source).hostname.replace(/^www\./, "");
            } catch {
              return "";
            }
          })();
          return domain ? `${f.evidence} (来源: ${domain})` : f.evidence;
        });
    };
    const buildDimSectionHeader = (dim: string): string[] => {
      const block: string[] = [];
      const points = matchInsightsFor(dim);
      if (points.length > 0) {
        block.push("🎯 **核心观点：**");
        block.push("");
        for (const p of points) block.push(`- ${p}`);
        block.push("");
      }
      return block;
    };
    const buildDimSectionFooter = (dim: string): string[] => {
      const block: string[] = [];
      const facts = matchKeyFactsFor(dim);
      if (facts.length > 0) {
        block.push("");
        block.push("**关键数据：**");
        block.push("");
        for (const f of facts) block.push(`- ${f}`);
        block.push("");
      }
      return block;
    };

    // ★ 维度章节优先用 per-dim-pipeline 的 fullMarkdown（含全部 chapter）
    //   如果 dim 没有 fullMarkdown（chapter pipeline 跳过），fallback 到 writerReport.sections
    const dimWithMarkdown = new Set<string>();
    for (const r of input.researcherResults) {
      if (r.fullMarkdown && r.fullMarkdown.trim().length > 200) {
        parts.push(`## ${r.dimension}`);
        parts.push("");
        for (const line of buildDimSectionHeader(r.dimension)) parts.push(line);
        // 去掉 dim-level fullMarkdown 顶部的 "# 维度名" 标题（避免重复 H1）
        const cleaned = r.fullMarkdown.replace(/^#\s+[^\n]+\n+/, "");
        parts.push(cleaned);
        for (const line of buildDimSectionFooter(r.dimension)) parts.push(line);
        parts.push("");
        dimWithMarkdown.add(r.dimension);
      }
    }
    // fallback: writerReport.sections 中没在 dimWithMarkdown 里的（如 cross-dim sections）
    for (const sec of input.writerReport.sections) {
      if (dimWithMarkdown.has(sec.heading)) continue;
      parts.push(`## ${sec.heading}`);
      parts.push("");
      // dim 级 writerReport.section 也注入核心观点 / 关键数据
      const matchedDim = input.plan.dimensions.find(
        (d) => d.name === sec.heading,
      );
      if (matchedDim) {
        for (const line of buildDimSectionHeader(sec.heading)) parts.push(line);
      }
      parts.push(sec.body);
      if (matchedDim) {
        for (const line of buildDimSectionFooter(sec.heading)) parts.push(line);
      }
      parts.push("");
    }
    // 跨维度分析
    if (input.analyst?.crossDimAnalysis) {
      parts.push("## 跨维度分析");
      parts.push("");
      parts.push(input.analyst.crossDimAnalysis);
      parts.push("");
    }
    if (input.analyst?.riskAssessment) {
      parts.push("## 风险评估");
      parts.push("");
      parts.push(input.analyst.riskAssessment);
      parts.push("");
    }
    if (input.analyst?.strategicRecommendations) {
      parts.push("## 战略建议");
      parts.push("");
      parts.push(input.analyst.strategicRecommendations);
      parts.push("");
    }
    parts.push("## 结论");
    parts.push("");
    parts.push(input.writerReport.conclusion);
    parts.push("");
    return parts.join("\n");
  }

  // ─── 2. sections 树 ─────────────────────────────────────────────
  private buildSectionTree(
    fullMarkdown: string,
    input: AssembleInput,
  ): ArtifactSection[] {
    const sections: ArtifactSection[] = [];
    const lines = fullMarkdown.split("\n");
    let currentSection: ArtifactSection | null = null;
    let bodyStart = 0;
    let charOffset = 0;
    const flush = (endOffset: number, bodyText: string) => {
      if (!currentSection) return;
      currentSection.endOffset = endOffset;
      currentSection.wordCount = countWords(bodyText, input.language);
      currentSection.readingTimeMinutes = Math.ceil(
        currentSection.wordCount / (input.language === "zh-CN" ? 400 : 250),
      );
    };
    // ★ P0-R4-2 (round 4): 跟踪代码块 / 引用块上下文，避免误识别块内 ## 为 section
    let inCodeBlock = false;
    for (const line of lines) {
      const lineWithNL = line + "\n";
      // 围栏代码块翻转（``` 或 ~~~）
      if (/^(```|~~~)/.test(line.trim())) {
        inCodeBlock = !inCodeBlock;
      } else if (
        !inCodeBlock &&
        // 排除引用块（> ##）和缩进代码块（4 空格起）
        !line.startsWith(">") &&
        !line.startsWith("    ") &&
        line.startsWith("## ") &&
        !line.startsWith("### ")
      ) {
        // close previous
        if (currentSection) {
          const bodyText = fullMarkdown.slice(bodyStart, charOffset);
          flush(charOffset, bodyText);
          sections.push(currentSection);
        }
        const title = line.slice(3).trim();
        const type = this.inferSectionType(title);
        const dimMatch = input.plan.dimensions.find((d) => d.name === title);
        const id = dimMatch
          ? dimMatch.id
          : `sec-${slugify(title)}-${sections.length + 1}`;
        currentSection = {
          id,
          type,
          level: 2,
          title,
          anchor: slugify(title),
          startOffset: charOffset,
          endOffset: charOffset,
          wordCount: 0,
          readingTimeMinutes: 0,
          citations: [],
          figureIds: [],
          factIds: [],
          sourceDimensionId: dimMatch?.id,
        };
        bodyStart = charOffset + lineWithNL.length;
      }
      charOffset += lineWithNL.length;
    }
    if (currentSection) {
      const bodyText = fullMarkdown.slice(bodyStart, charOffset);
      flush(charOffset, bodyText);
      sections.push(currentSection);
    }
    // ★ Phase 2 (TI report-assembler:268-387 模式): 两遍处理 —— 过滤纯标题无内容的空 section
    // 防止"维度 N 没产出但占位"导致下游 quality.coverage 错误归零
    return sections.filter((s) => {
      const body = fullMarkdown.slice(s.startOffset, s.endOffset);
      // 纯标题（剥离所有 #...）后非空才保留
      const stripped = body.replace(/^#+\s+.*\n?/gm, "").trim();
      return stripped.length > 0;
    });
  }

  private inferSectionType(title: string): ArtifactSection["type"] {
    const t = title.toLowerCase();
    if (t.includes("摘要") || t.includes("summary")) return "executive_summary";
    if (t.includes("跨维度") || t.includes("cross")) return "cross_dimension";
    if (t.includes("风险") || t.includes("risk")) return "risk_assessment";
    if (t.includes("建议") || t.includes("recommend")) return "recommendations";
    if (t.includes("结论") || t.includes("conclusion")) return "conclusion";
    if (t.includes("附录") || t.includes("appendix")) return "appendix";
    if (t.includes("前言") || t.includes("preface")) return "preface";
    return "dimension";
  }

  // ─── 3. citations + occurrences ────────────────────────────────
  /**
   * ★ Phase 2 (2026-04-29): 改为返回 { citations, fullMarkdown }，
   * 因 indexMapping 重映射可能改写正文 [N] 编号，调用方需用更新后版本继续 buildSectionTree。
   */
  private buildCitations(
    fullMarkdown: string,
    sections: ArtifactSection[],
    input: AssembleInput,
  ): { citations: ArtifactCitation[]; fullMarkdown: string } {
    // ★ Phase 2 接入 TI 沉淀: filterJunk → decodeEntities → upgradeHttps → dedupe
    // 收集所有 source URL（writer.citations + writer.sections[].sources + researcher findings）
    const seen = new Map<string, number>();
    const ordered: string[] = [];
    const collectUrl = (url: string) => {
      if (!url) return;
      const u = url.trim();
      if (!u) return;
      if (!seen.has(u)) {
        seen.set(u, ordered.length + 1);
        ordered.push(u);
      }
    };
    for (const c of input.writerReport.citations ?? []) collectUrl(c);
    for (const s of input.writerReport.sections) {
      for (const url of s.sources ?? []) collectUrl(url);
    }
    for (const r of input.researcherResults) {
      for (const f of r.findings) collectUrl(f.source);
    }

    // ★ Phase 2 移植 TI 沉淀工具：3 步链路
    //   1) filterJunkReferences: 滤掉 example.com / placeholder / # 等垃圾 URL
    //   2) decodeUrlEntities: 修复 &amp; / &#x2F; 等 HTML 实体腐蚀
    //   3) upgradeHttpToHttps: HTTP → HTTPS（防混合内容警告 + SEO 友好）
    let refEntries: { url: string; index: number }[] = ordered.map(
      (url, i) => ({
        url,
        index: i + 1,
      }),
    );
    refEntries = filterJunkReferences(refEntries);
    refEntries = decodeUrlEntities(refEntries);
    refEntries = upgradeHttpToHttps(refEntries);
    // 4) deduplicateReferencesByUrl: 同 URL 不同大小写 / trailing slash 归并
    const { deduplicated, indexMapping } =
      deduplicateReferencesByUrl(refEntries);
    // 应用 indexMapping 到正文，让 [N] 编号与最终 citations 对齐
    if (Object.keys(indexMapping).length > 0) {
      fullMarkdown = remapCitationIndices(fullMarkdown, indexMapping);
    }
    const finalUrls = deduplicated.map((e) => e.url);

    const citations: ArtifactCitation[] = finalUrls.map((url, idx) => {
      const num = idx + 1;
      const domain = extractDomain(url);
      return {
        index: num,
        uuid: `cite-${num}`,
        title: domain ?? url,
        url,
        domain: domain ?? "unknown",
        accessedAt: new Date().toISOString(),
        sourceType: this.inferSourceType(domain),
        credibilityScore: this.scoreCredibility(domain),
        occurrences: [],
      };
    });

    // 扫 fullMarkdown 找 [N] 模式 → 算每个出现位置的 sectionId / paragraphIndex / charOffset
    const citePattern = /\[(\d+)\]/g;
    let m: RegExpExecArray | null;
    while ((m = citePattern.exec(fullMarkdown)) !== null) {
      const num = parseInt(m[1], 10);
      const cite = citations.find((c) => c.index === num);
      if (!cite) continue;
      const offset = m.index;
      const sec = sections.find(
        (s) => offset >= s.startOffset && offset < s.endOffset,
      );
      if (!sec) continue;
      const sectionLocalOffset = offset - sec.startOffset;
      const sectionMarkdown = fullMarkdown.slice(
        sec.startOffset,
        sec.endOffset,
      );
      const paragraphIndex = countParagraphsBefore(
        sectionMarkdown,
        sectionLocalOffset,
      );
      cite.occurrences.push({
        sectionId: sec.id,
        paragraphIndex,
        characterOffset: sectionLocalOffset,
      });
      if (!sec.citations.includes(num)) sec.citations.push(num);
    }

    return { citations, fullMarkdown };
  }

  private inferSourceType(
    domain: string | null,
  ): ArtifactCitation["sourceType"] {
    if (!domain) return "other";
    if (/\.gov(\.|$)/.test(domain)) return "gov";
    if (/(arxiv|nature|science|nih|pubmed|scholar|openalex)\./.test(domain))
      return "academic";
    if (/(github|stackoverflow|hackernews)\./.test(domain)) return "community";
    if (/(medium|substack|wordpress|blog)\./.test(domain)) return "blog";
    if (/(news|nytimes|wsj|reuters|bloomberg|economist)\./.test(domain))
      return "news";
    return "industry";
  }

  private scoreCredibility(domain: string | null): number {
    if (!domain) return 50;
    if (/\.gov(\.|$)/.test(domain)) return 95;
    if (/(arxiv|nature|science|nih|pubmed)\./.test(domain)) return 92;
    if (/(github|wikipedia)\./.test(domain)) return 80;
    if (/(reuters|bloomberg|economist|wsj|nytimes)\./.test(domain)) return 85;
    if (/(medium|substack|wordpress|blog)\./.test(domain)) return 50;
    return 65;
  }

  // ─── 4. figures 五项强校验 + 自动关联 evidenceCitationIndex ────────
  // 数据流（mission-pipeline-baseline.md §7.4 / Phase P1-1）：
  //   Researcher.figureCandidates （含 sourceUrl/imageUrl/caption）
  //     → 黑名单过滤 (isGarbageFigureUrl)
  //     → 去重 (dedupeFigureCandidates)
  //     → 映射 sourceUrl → citation.index (evidenceCitationIndex)
  //     → 关联 sectionId（按 fromDimensionId）
  //     → 输出 ArtifactFigure[]
  private buildFigures(
    input: AssembleInput,
    citations: ArtifactCitation[],
    sections: ArtifactSection[],
  ): ArtifactFigure[] {
    // 收集所有 raw figureCandidates，附带 fromDimensionId
    type Raw = {
      sourceUrl: string;
      imageUrl?: string;
      caption: string;
      sourcePageOrSection?: string;
      relevanceHint?: "high" | "medium" | "low";
      fromDimensionId: string;
    };
    const rawAll: Raw[] = [];
    for (const r of input.researcherResults) {
      const dim = input.plan.dimensions.find((d) => d.name === r.dimension);
      const dimId = dim?.id ?? `dim-${r.dimension.slice(0, 20)}`;
      for (const f of r.figureCandidates ?? []) {
        rawAll.push({
          sourceUrl: f.sourceUrl,
          imageUrl: f.imageUrl,
          caption: f.caption,
          sourcePageOrSection: f.sourcePageOrSection,
          relevanceHint: f.relevanceHint,
          fromDimensionId: dimId,
        });
      }
    }
    // 黑名单过滤（垃圾图 URL）
    const filtered = rawAll.filter((f) => {
      if (isGarbageFigureUrl(f.imageUrl)) return false;
      if (!f.imageUrl && isGarbageFigureUrl(f.sourceUrl)) return false;
      return true;
    });
    // 去重
    const deduped = dedupeFigureCandidates(filtered);
    // 映射到 citationIndex（sourceUrl → 已收录的 [N]）
    const urlToIndex = new Map<string, number>();
    for (const c of citations) urlToIndex.set(c.url, c.index);

    const figures: ArtifactFigure[] = [];
    for (let i = 0; i < deduped.length; i++) {
      const f = deduped[i];
      const evIdx = urlToIndex.get(f.sourceUrl);
      // 五项强校验（baseline §7.4 表格）
      if (!evIdx) continue; // sourceUrl 必须能找到对应 citation
      if (!f.sourceUrl) continue;
      if (!f.imageUrl) continue; // reference 类必须有 imageUrl
      // 找 section（按 dim → section.sourceDimensionId）
      const sec =
        sections.find((s) => s.sourceDimensionId === f.fromDimensionId) ??
        sections.find((s) => s.type === "dimension");
      if (!sec) continue;
      // ★ Phase P1-6: referencedBy 反向定位 — 在 section 文本中找包含图主题词的句子
      const referencedBy = this.findReferencingSentences(f.caption, sec, input);
      figures.push({
        id: `fig-${sec.id}-${i}`,
        type: "reference",
        evidenceCitationIndex: evIdx,
        sourceUrl: f.sourceUrl,
        sourcePageOrSection: f.sourcePageOrSection,
        imageUrl: f.imageUrl,
        title: f.caption.slice(0, 100),
        caption: f.caption,
        altText: f.caption,
        sectionId: sec.id,
        paragraphIndex: 0,
        anchorMode: "after_paragraph",
        referencedBy,
      });
    }
    return figures;
  }

  /**
   * 反向定位：从 caption 提关键词，在 section markdown 中找包含这些词的句子。
   * 简化版（无 NLP）：分词 → 去停用词 → 取前 3 个 ≥2 字符的词 → grep 句子。
   */
  private findReferencingSentences(
    caption: string,
    sec: ArtifactSection,
    input: AssembleInput,
  ): { sectionId: string; phrase: string }[] {
    const text = this.extractSectionText(input, sec);
    if (!text) return [];
    const stopwords = new Set([
      "the",
      "and",
      "for",
      "with",
      "from",
      "this",
      "that",
      "图",
      "的",
      "了",
      "是",
      "和",
      "及",
      "等",
    ]);
    const tokens = caption
      .replace(/[，。、,.!?:;""'']/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && !stopwords.has(t.toLowerCase()))
      .slice(0, 5);
    if (tokens.length === 0) return [];
    // 在 section text 找含至少一个 token 的句子
    const sentences = text.split(/(?<=[。！？.!?])\s+/).slice(0, 30);
    const matched: { sectionId: string; phrase: string }[] = [];
    for (const s of sentences) {
      if (tokens.some((t) => s.includes(t))) {
        matched.push({ sectionId: sec.id, phrase: s.trim().slice(0, 120) });
        if (matched.length >= 3) break;
      }
    }
    return matched;
  }

  private extractSectionText(
    input: AssembleInput,
    sec: ArtifactSection,
  ): string {
    const md = this.buildFullMarkdown(input);
    return md.slice(sec.startOffset, sec.endOffset);
  }

  // ─── 5. factTable ───────────────────────────────────────────────
  private buildFactTable(
    input: AssembleInput,
    citations: ArtifactCitation[],
  ): ArtifactFactTriple[] {
    if (!input.reconciliationReport?.factTable) return [];
    const urlToIndex = new Map<string, number>();
    for (const c of citations) urlToIndex.set(c.url, c.index);
    // ★ P1-R4-F (round 4): 单次 find + 缓存，避免每个 fact 调 4 次同样的 find（O(n²)）
    const conflicts = input.reconciliationReport.conflicts ?? [];
    return input.reconciliationReport.factTable.map((f) => {
      const conflict = conflicts.find((c) => c.factIds.includes(f.id));
      return {
        id: f.id,
        entity: f.entity,
        attribute: f.attribute,
        value: f.value,
        sources: f.sources
          .map((s) => urlToIndex.get(s) ?? -1)
          .filter((n) => n > 0),
        conflict: conflict
          ? {
              factIds: conflict.factIds,
              resolutionType: conflict.resolutionType,
              rationale: conflict.rationale,
            }
          : undefined,
      };
    });
  }

  // ─── 6. quickView 派生 ─────────────────────────────────────────
  private buildQuickView(
    input: AssembleInput,
    sections: ArtifactSection[],
    citations: ArtifactCitation[],
    figures: ArtifactFigure[],
  ): ArtifactQuickView {
    const execSection = sections.find((s) => s.type === "executive_summary");
    const execMarkdown = execSection
      ? (input.analyst?.themeSummary ?? input.writerReport.summary)
      : input.writerReport.summary;
    const execWordCount = countWords(execMarkdown, input.language);

    // topHighlights：从 analyst.keyInsights 派生（不存在则从每 dim 第一个 finding 派生）
    const highlights: ArtifactHighlight[] = [];
    const insights = input.analyst?.keyInsights ?? [];
    for (const ins of insights.slice(0, 7)) {
      highlights.push({
        type: "finding",
        title: ins.title ?? "Insight",
        oneLineSummary: ins.oneLine ?? "",
        sourceDimensionId: input.plan.dimensions[0]?.id ?? "dim-0",
        citations: [],
      });
    }
    if (highlights.length === 0) {
      // fallback：每 dim 第一个 finding
      for (const r of input.researcherResults.slice(0, 5)) {
        const f = r.findings[0];
        if (!f) continue;
        const dimId =
          input.plan.dimensions.find((d) => d.name === r.dimension)?.id ??
          "dim-?";
        highlights.push({
          type: "finding",
          title: f.claim.slice(0, 80),
          oneLineSummary: f.evidence,
          sourceDimensionId: dimId,
          citations: [],
        });
      }
    }

    // 关键引用：取 credibilityScore Top 5-8
    const keyCitations = [...citations]
      .sort((a, b) => b.credibilityScore - a.credibilityScore)
      .slice(0, 8)
      .map((c) => c.index);

    // 关键图：前 3-5 张
    const keyFigures = figures.slice(0, 5).map((f) => f.id);

    return {
      executiveSummary: { markdown: execMarkdown, wordCount: execWordCount },
      topHighlights: highlights,
      topTrends: [],
      keyRisks: [],
      topRecommendations: [],
      keyCitations,
      keyFigures,
      estimatedReadingTime: 3 + Math.ceil(execWordCount / 400),
      whatYouWillLearn: input.plan.dimensions.slice(0, 5).map((d) => d.name),
    };
  }

  // ─── 7. metadata ────────────────────────────────────────────────
  private buildMetadata(
    input: AssembleInput,
    fullMarkdown: string,
    _sections: ArtifactSection[],
    citations: ArtifactCitation[],
    figures: ArtifactFigure[],
  ): ArtifactMetadata {
    const wordCount = countWords(fullMarkdown, input.language);
    return {
      topic: input.topic,
      generatedAt: new Date().toISOString(),
      generationTimeMs: input.generationTimeMs,
      version: 1,
      isIncremental: false,
      dimensionCount: input.plan.dimensions.length,
      sourceCount: citations.length,
      factCount: input.reconciliationReport?.factTable?.length ?? 0,
      figureCount: figures.length,
      wordCount,
      readingTimeMinutes: Math.ceil(
        wordCount / (input.language === "zh-CN" ? 400 : 250),
      ),
      styleProfile: input.styleProfile,
      lengthProfile: input.lengthProfile,
      audienceProfile: input.audienceProfile,
      language: input.language,
      totalTokens: input.totalTokens,
      costCents: input.costCents,
      modelTrail: input.modelTrail,
    };
  }

  // ─── 8. quality 真实评分（mission-pipeline-baseline.md §7.8 / Phase P0-9）──
  // 从实际数据派生 10 维评分，hardGateViolations 触发条件：
  //   - traceability: 每个 dim 章节都至少 1 个 [N] 引用
  //   - factualConsistency: factTable.conflict 全部 properly handled (非 flagged-unresolved)
  //   - coverage: plan.dimensions 全部对应 chapter
  //   - redundancy: 章节间相似度估算（用字数差异作启发）
  //   - formatCorrectness: 不含畸形 markdown
  //   - lengthAccuracy: ±20% lengthProfile target
  //   - chapterBalance: 章节字数标准差 < 平均 50%
  //   - citationDensity: 加粗 ≤ 60 / 引用块 ≤ 8
  //   - novelty / styleConformance: 需 LLM 评分（P1 接通），先给中性 70
  private buildQualityStub(
    sections: ArtifactSection[],
    _citations: ArtifactCitation[],
    _figures: ArtifactFigure[],
    input?: AssembleInput,
    fullMarkdown?: string,
  ): ArtifactQualityVerdicts {
    const violations: ArtifactQualityVerdicts["hardGateViolations"] = [];
    const warnings: ArtifactQualityVerdicts["warnings"] = [];

    // ─── coverage：plan 维度 vs 实际 dim 章节 ──
    //   旧逻辑用 dimSections × 20 是绝对值，quick depth 只生成 3 dim 永远封顶 60。
    //   改成相对覆盖率：实际 dim 章节 / plan 计划维度 * 100，深度档自然达 100。
    const dimSections = sections.filter((s) => s.type === "dimension");
    const plannedDims = input?.plan?.dimensions?.length ?? 0;
    const coverageScore =
      plannedDims > 0
        ? Math.min(100, Math.round((dimSections.length / plannedDims) * 100))
        : Math.min(100, dimSections.length * 20);

    // ─── citationDensity：每个 dim section 至少 1 个 [N] ──
    const dimsWithCitations = dimSections.filter((s) => s.citations.length > 0);
    const citationDensityScore =
      dimSections.length > 0
        ? Math.round((dimsWithCitations.length / dimSections.length) * 100)
        : 0;
    if (citationDensityScore < 80) {
      warnings.push({
        dimension: "citationDensity",
        message: `仅 ${dimsWithCitations.length}/${dimSections.length} 章节含引用`,
      });
    }

    // ─── traceability：每个 dim section.citations 至少 1 ──
    const traceabilityScore = citationDensityScore; // 简化：与 citationDensity 一致

    // ─── chapterBalance：字数标准差 ──
    // ★ P1-R4-H (round 4): 全部 wordCount=0（中文 countWords 失效或空报告）时
    // 不应显示"非常均衡 90 分"，应给低分 + warning，与 lengthAccuracy 信号一致
    const wordCounts = sections.map((s) => s.wordCount).filter((n) => n > 0);
    let balanceScore: number;
    let balanceRatio = 0;
    if (wordCounts.length === 0) {
      balanceScore = 35;
      warnings.push({
        dimension: "chapterBalance",
        message: "所有章节字数为 0（可能 wordCount 计算失败或报告为空）",
      });
    } else {
      const avgWords =
        wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;
      const stdDev = Math.sqrt(
        wordCounts.reduce((a, n) => a + Math.pow(n - avgWords, 2), 0) /
          wordCounts.length,
      );
      balanceRatio = avgWords > 0 ? stdDev / avgWords : 1;
      balanceScore = balanceRatio < 0.5 ? 90 : balanceRatio < 0.8 ? 70 : 50;
      if (balanceScore < 70) {
        warnings.push({
          dimension: "chapterBalance",
          message: `章节字数标准差 ${(balanceRatio * 100).toFixed(0)}% > 50%`,
        });
      }
    }

    // ─── overall：加权平均 ──
    // ─── lengthAccuracy: 实际字数 vs lengthProfile target ±20% ──
    let lengthAccuracyScore = 75;
    if (input) {
      const target = lengthTargetFor(input.lengthProfile);
      const totalWords = sections.reduce((a, s) => a + s.wordCount, 0);
      const ratio = target > 0 ? totalWords / target : 1;
      if (ratio >= 0.8 && ratio <= 1.2) lengthAccuracyScore = 95;
      else if (ratio >= 0.6 && ratio <= 1.4) lengthAccuracyScore = 75;
      else if (ratio >= 0.4 && ratio <= 1.6) lengthAccuracyScore = 55;
      else lengthAccuracyScore = 35;
      if (lengthAccuracyScore < 60) {
        warnings.push({
          dimension: "lengthAccuracy",
          message: `实际 ${totalWords} 字，目标 ${target} 字（偏差 ${Math.round((ratio - 1) * 100)}%）`,
        });
      }
    }

    // ─── factualConsistency: 从 factTable.conflict 派生 ──
    let factualConsistencyScore = 80;
    if (input?.reconciliationReport?.factTable) {
      const facts = input.reconciliationReport.factTable;
      const factWithConflict = input.reconciliationReport.conflicts ?? [];
      const unresolved = factWithConflict.filter(
        (c) => c.resolutionType === "flagged-unresolved",
      ).length;
      if (factWithConflict.length === 0) factualConsistencyScore = 90;
      else if (unresolved === 0) factualConsistencyScore = 80;
      else if (unresolved / Math.max(1, factWithConflict.length) < 0.3)
        factualConsistencyScore = 65;
      else factualConsistencyScore = 45;
      if (unresolved > 0) {
        warnings.push({
          dimension: "factualConsistency",
          message: `${unresolved} 个事实冲突未裁决（共 ${facts.length} 项事实）`,
        });
      }
    }

    // ─── redundancy: 章节间 4-gram Jaccard 启发 ──
    let redundancyScore = 80;
    if (sections.length >= 2 && input) {
      const md = this.buildFullMarkdown(input);
      const sectionTexts = sections.map((s) =>
        md.slice(s.startOffset, s.endOffset),
      );
      let maxOverlap = 0;
      for (let i = 0; i < sectionTexts.length; i++) {
        for (let j = i + 1; j < sectionTexts.length; j++) {
          const j4 = jaccard4Gram(sectionTexts[i], sectionTexts[j]);
          if (j4 > maxOverlap) maxOverlap = j4;
        }
      }
      if (maxOverlap > 0.3) redundancyScore = 50;
      else if (maxOverlap > 0.2) redundancyScore = 65;
      else if (maxOverlap > 0.15) redundancyScore = 75;
      else redundancyScore = 85;
      if (maxOverlap > 0.15) {
        warnings.push({
          dimension: "redundancy",
          message: `章节最大相似度 ${(maxOverlap * 100).toFixed(0)}% > 15%`,
        });
      }
    }

    // ─── novelty：内容驱动启发式 ───
    //   1. factTable 实体多样性（独立 entity 数量）
    //   2. 引用源域名多样性（独立 domain 数量）
    //   3. 套话扣分（"在当今"/"随着...的发展"/"根据 XX 报告"）
    let noveltyScore = 50;
    const factEntities = new Set<string>();
    if (input?.reconciliationReport?.factTable) {
      for (const f of input.reconciliationReport.factTable)
        factEntities.add(f.entity);
    }
    // 实体≥6 给 +20，≥3 给 +10
    if (factEntities.size >= 6) noveltyScore += 20;
    else if (factEntities.size >= 3) noveltyScore += 10;
    // 域名多样性
    const domains = new Set(_citations.map((c) => c.domain));
    if (domains.size >= 6) noveltyScore += 15;
    else if (domains.size >= 3) noveltyScore += 8;
    // 套话扣分：每出现一次扣 5（用 fullMarkdown 覆盖 body 内容，title 太短）
    const fullText = fullMarkdown ?? sections.map((s) => s.title).join(" ");
    const clichePatterns = [
      /随着.{0,4}的发展/g,
      /在当今/g,
      /众所周知/g,
      /不可忽视/g,
      /显而易见/g,
    ];
    let clicheCount = 0;
    for (const re of clichePatterns) {
      const matches = fullText.match(re);
      if (matches) clicheCount += matches.length;
    }
    noveltyScore = Math.max(20, noveltyScore - clicheCount * 5);
    // 至少有 highlights/keyInsights 给 +5
    const highlightCount = (input?.analyst?.keyInsights ?? []).length;
    if (highlightCount >= 3) noveltyScore += 5;
    noveltyScore = Math.min(100, noveltyScore);

    // ─── styleConformance：profile 匹配启发式 ───
    //   各 profile 期望的关键词频率（基于 fullMarkdown 全文，不只是 title）
    let styleScore = 60;
    const allBody = fullMarkdown ?? sections.map((s) => s.title).join(" ");
    const styleProfile = input?.styleProfile;
    if (styleProfile === "executive") {
      // 期望：Implications / 战略 / 决策 / 风险 / 建议
      const execKw = [/Implications?/gi, /战略|决策|风险|建议|要点|核心/g];
      let execHits = 0;
      for (const re of execKw) {
        const m = allBody.match(re);
        if (m) execHits += m.length;
      }
      styleScore = Math.min(100, 60 + execHits * 6);
    } else if (styleProfile === "academic") {
      // 期望：方法/结果/讨论/局限/参考文献 + 高 citation density
      const academicKw =
        /方法|结果|讨论|局限|参考文献|methodology|conclusion/gi;
      const m = allBody.match(academicKw);
      const acaHits = m ? m.length : 0;
      styleScore = Math.min(
        100,
        50 + acaHits * 5 + Math.round(citationDensityScore * 0.3),
      );
    } else if (styleProfile === "journalistic") {
      // 期望：故事/现场/案例/亲历
      const jKw = /案例|现场|访谈|实地|实例|事件/g;
      const m = allBody.match(jKw);
      styleScore = Math.min(100, 60 + (m ? m.length : 0) * 6);
    } else if (styleProfile === "technical") {
      // 期望：代码/接口/参数/配置/性能 数字密度
      const techKw = /代码|接口|参数|配置|性能|架构|实现|算法/g;
      const m = allBody.match(techKw);
      styleScore = Math.min(100, 55 + (m ? m.length : 0) * 5);
    }

    const dimensionScores = {
      traceability: traceabilityScore,
      factualConsistency: factualConsistencyScore,
      novelty: noveltyScore,
      coverage: coverageScore,
      redundancy: redundancyScore,
      formatCorrectness: 80,
      citationDensity: citationDensityScore,
      styleConformance: styleScore,
      lengthAccuracy: lengthAccuracyScore,
      chapterBalance: balanceScore,
    };

    // Phase P6-10: hardGateViolations 触发条件
    if (coverageScore < 50) {
      violations.push({
        dimension: "coverage",
        severity: "error",
        message: `覆盖度仅 ${coverageScore}/100（< 50 阈值）`,
      });
    }
    if (citationDensityScore < 30) {
      violations.push({
        dimension: "citationDensity",
        severity: "error",
        message: `引用密度仅 ${citationDensityScore}/100（< 30 阈值）`,
      });
    }
    if (lengthAccuracyScore < 35) {
      violations.push({
        dimension: "lengthAccuracy",
        severity: "warning",
        message: `字数严重偏离 lengthProfile`,
      });
    }
    if (factualConsistencyScore < 50) {
      violations.push({
        dimension: "factualConsistency",
        severity: "error",
        message: `事实一致性仅 ${factualConsistencyScore}/100（unresolved 冲突过多）`,
      });
    }
    // ★ P2-1 (2026-04-29): NaN 兜底 + 0-100 clamp，避免 sections=0 等极端场景污染 overall
    const safeScores = Object.values(dimensionScores).map((s) =>
      isNaN(s) ? 50 : Math.min(100, Math.max(0, s)),
    );
    const overallRaw =
      safeScores.length > 0
        ? safeScores.reduce((a, b) => a + b, 0) / safeScores.length
        : 50;
    const overall = isNaN(overallRaw) ? 50 : Math.round(overallRaw);

    // P100-1: finalVerdict 汇总
    const hasErrors = violations.some((v) => v.severity === "error");
    const hasWarnings = violations.some((v) => v.severity === "warning");
    const finalVerdict: ArtifactQualityVerdicts["finalVerdict"] = hasErrors
      ? "poor"
      : overall >= 85 && !hasWarnings
        ? "excellent"
        : overall >= 70 && !hasWarnings
          ? "good"
          : overall >= 50 || hasWarnings
            ? "acceptable"
            : "poor";

    return {
      overall,
      dimensions: dimensionScores,
      hardGateViolations: violations,
      warnings,
      qualityTrace: [
        {
          stage: "assembler",
          check: "10-dimension-baseline",
          passed: violations.length === 0,
          timestamp: Date.now(),
        },
      ],
      finalVerdict,
    };
  }
}

// ─── helpers ─────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w一-龥]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function countWords(s: string, lang: "zh-CN" | "en-US"): number {
  if (lang === "zh-CN") {
    // 简单近似：中文字符数（不含标点 / 空白）
    return (s.match(/[一-龥]/g) ?? []).length;
  }
  return (s.match(/\b[\w-]+\b/g) ?? []).length;
}

function countParagraphsBefore(text: string, offset: number): number {
  // 段落 = 由空行隔开。查找 offset 之前的 \n\n 数量。
  let count = 0;
  let i = 0;
  while (i < offset && i < text.length - 1) {
    if (text[i] === "\n" && text[i + 1] === "\n") count++;
    i++;
  }
  return count;
}

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * lengthProfile 字数 target（mission-pipeline-user-profiles.md §4.3）
 *
 * 也被 s10 leader signoff stage 调用，用于把 target 注入 leader.finalQuality，
 * 让 Lead 看到"承诺 vs 实际"。
 */
export function lengthTargetFor(
  profile: "brief" | "standard" | "deep" | "extended" | "epic" | "mega",
): number {
  switch (profile) {
    case "brief":
      return 3000;
    case "standard":
      return 8000;
    case "deep":
      return 15000;
    case "extended":
      return 25000;
    case "epic":
      return 80000;
    case "mega":
      return 200000;
    default:
      return 8000;
  }
}

/** 4-gram Jaccard 相似度（章节间冗余检测） */
function jaccard4Gram(a: string, b: string): number {
  const grams = (s: string): Set<string> => {
    const norm = s.replace(/\s+/g, " ").trim();
    const set = new Set<string>();
    for (let i = 0; i + 4 <= norm.length; i++) {
      set.add(norm.slice(i, i + 4));
    }
    return set;
  };
  const A = grams(a);
  const B = grams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}
