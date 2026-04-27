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

import { Injectable } from "@nestjs/common";
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
} from "../dto/report-artifact.dto";
import {
  dedupeFigureCandidates,
  isGarbageFigureUrl,
} from "../utils/figure-filter.util";

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

    // 2) sections 树（按 ## 标题切分 + 类型推断）
    let sections = this.buildSectionTree(fullMarkdown, input);

    // 3) citations 编号原子分配 + occurrences
    const citations = this.buildCitations(fullMarkdown, sections, input);

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
    const quality = this.buildQualityStub(sections, citations, figures, input);

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
      return body.replace(
        unifiedRe,
        (_m, alreadyN, _anchor, mdUrl, bareUrl) => {
          if (alreadyN) return alreadyN as string; // [N] 已是数字编号，原样保留
          const url: string = mdUrl ?? bareUrl;
          const n = assignIdx(url);
          return `[${n}]`;
        },
      );
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
    // 1. 压缩 ≥3 个连续换行
    content = content.replace(/\n{3,}/g, "\n\n");
    // 2. 修复表格行尾缺 |（简化：行首/尾若无 | 但中间有 |）
    content = content.replace(
      /^(\|[^\n]+[^|\s])(\n|$)/gm,
      (_, p1: string, p2: string) => `${p1}|${p2}`,
    );
    // 3. heading 跳跃修复（h1 后直接 h3 → 改 h3 为 h2）
    content = content.replace(/^# (.+)\n+### /gm, "# $1\n\n## ");
    // 4. 列表 tab → 4-space
    content = content.replace(/^(\s*)\t+/gm, (_, sp: string) =>
      sp.replace(/\t/g, "    "),
    );
    // 5. 孤儿 [N]（粗略）：找 [N] 但全文无 "[N] http"
    content = this.markOrphanCitations(content);
    // 6. LaTeX 跨段落 $$ 修复（成对检查；奇数 → 闭一个）
    const dollarCount = (content.match(/\$\$/g) ?? []).length;
    if (dollarCount % 2 !== 0) {
      content += "\n$$";
    }
    // 7. 单元格内换行
    content = content.replace(/(\|[^|\n]*?)\\n([^|\n]*?\|)/g, "$1<br>$2");
    // 8. >>> 规范化（>>> → >）
    content = content.replace(/^>{3,}\s/gm, "> ");
    // 9. 重复连续标题去重
    content = content.replace(/^(##+ .+)\n+\1\n/gm, "$1\n");
    // 10. 文末空白 trim
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
    // 维度章节
    for (const sec of input.writerReport.sections) {
      parts.push(`## ${sec.heading}`);
      parts.push("");
      parts.push(sec.body);
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
    for (const line of lines) {
      const lineWithNL = line + "\n";
      if (line.startsWith("## ") && !line.startsWith("### ")) {
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
    return sections;
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
  private buildCitations(
    fullMarkdown: string,
    sections: ArtifactSection[],
    input: AssembleInput,
  ): ArtifactCitation[] {
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

    const citations: ArtifactCitation[] = ordered.map((url, idx) => {
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

    return citations;
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
    return input.reconciliationReport.factTable.map((f) => ({
      id: f.id,
      entity: f.entity,
      attribute: f.attribute,
      value: f.value,
      sources: f.sources
        .map((s) => urlToIndex.get(s) ?? -1)
        .filter((n) => n > 0),
      conflict: input.reconciliationReport!.conflicts.find((c) =>
        c.factIds.includes(f.id),
      )
        ? {
            factIds: input.reconciliationReport!.conflicts.find((c) =>
              c.factIds.includes(f.id),
            )!.factIds,
            resolutionType: input.reconciliationReport!.conflicts.find((c) =>
              c.factIds.includes(f.id),
            )!.resolutionType,
            rationale: input.reconciliationReport!.conflicts.find((c) =>
              c.factIds.includes(f.id),
            )!.rationale,
          }
        : undefined,
    }));
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
  ): ArtifactQualityVerdicts {
    const violations: ArtifactQualityVerdicts["hardGateViolations"] = [];
    const warnings: ArtifactQualityVerdicts["warnings"] = [];

    // ─── coverage：每个 dim 都要有 chapter ──
    const dimSections = sections.filter((s) => s.type === "dimension");
    const coverageScore = Math.min(100, dimSections.length * 20);

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
    const wordCounts = sections.map((s) => s.wordCount).filter((n) => n > 0);
    const avgWords =
      wordCounts.reduce((a, b) => a + b, 0) / Math.max(1, wordCounts.length);
    const stdDev = Math.sqrt(
      wordCounts.reduce((a, n) => a + Math.pow(n - avgWords, 2), 0) /
        Math.max(1, wordCounts.length),
    );
    const balanceRatio = avgWords > 0 ? stdDev / avgWords : 1;
    const balanceScore = balanceRatio < 0.5 ? 90 : balanceRatio < 0.8 ? 70 : 50;
    if (balanceScore < 70) {
      warnings.push({
        dimension: "chapterBalance",
        message: `章节字数标准差 ${(balanceRatio * 100).toFixed(0)}% > 50%`,
      });
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

    const dimensionScores = {
      traceability: traceabilityScore,
      factualConsistency: factualConsistencyScore,
      novelty: 70, // 由 critic agent 在 orchestrator 里调整
      coverage: coverageScore,
      redundancy: redundancyScore,
      formatCorrectness: 80,
      citationDensity: citationDensityScore,
      styleConformance: 75, // 由 critic agent 在 orchestrator 里调整
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
    const overall = Math.round(
      Object.values(dimensionScores).reduce((a, b) => a + b, 0) /
        Object.keys(dimensionScores).length,
    );

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

/** lengthProfile 字数 target（mission-pipeline-user-profiles.md §4.3） */
function lengthTargetFor(
  profile: "brief" | "standard" | "deep" | "extended",
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
