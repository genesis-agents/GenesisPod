/**
 * ChapterWriterAgent —— 撰写单个章节（参照 TI SECTION_WRITING_SYSTEM_PROMPT）
 *
 * 严格写作规范：内联加粗、禁止套话、引用编号、列表/段落规则。
 */

import { z } from "zod";
import {
  AgentSpec,
  DefineAgent,
  CHAPTER_WRITER_INTERNAL_MAX_ITERATIONS,
} from "@/modules/ai-harness/facade";
// ★ 沉淀接入: 外部 evidence 进 prompt 前用 XML 隔离 + sanitize（防 OWASP LLM01）
//   + TI report-writing-standards.constants（与 TI dimension-research.prompt.ts 同源）
import {
  wrapExternalContent,
  HEADING_HIERARCHY,
  NARRATIVE_STRUCTURE,
  PROFESSIONAL_TONE,
  FORMATTING_LIMITS,
  CITATION_STANDARDS,
  ANALYSIS_DEPTH,
  CHART_STANDARDS,
  TABLE_STANDARDS,
  QUALITY_CHECKLIST,
} from "@/modules/ai-harness/facade";

const Input = z.object({
  topic: z.string(),
  dimension: z.string(),
  language: z.enum(["zh-CN", "en-US"]),
  chapter: z.object({
    index: z.number().int(),
    heading: z.string(),
    thesis: z.string(),
    keyPoints: z.array(z.string()),
  }),
  sources: z.array(
    z.object({
      claim: z.string(),
      evidence: z.string(),
      source: z.string(),
    }),
  ),
  // ★ P0-R4-5 (round 4): 25000 与 budget.maxTokens=22000 矛盾导致 epic 死循环；
  // 降到 12000 让 LLM 单次输出可达 ≥85% 字数门槛；epic 200K → 17 章 × 12K 拼接
  targetWords: z.number().int().min(200).max(12000),
  /** lengthProfile 档位（可选，用于 prompt 中展示 per-profile 字数范围） */
  lengthProfile: z
    .enum(["brief", "standard", "deep", "extended", "epic", "mega"])
    .optional(),
  /** 之前已写完的章节标题列表（用于去重，不要重复前文） */
  previousChapterHeadings: z.array(z.string()).optional(),
  previousCritique: z.string().optional(),
  previousDraft: z.string().optional(),
  /**
   * ★ PR-13 v1.6 § 13.3 sub-section 拼接路径（deep / professional scale 启用）
   * 提供时：prompt 切到"只写这一个 sub-section"模式；targetWords 用 sub-section.targetWordCount
   * 不提供时：保留原有"写整个章节"行为（quick / standard scale）
   */
  subSection: z
    .object({
      index: z.number().int().min(1),
      heading: z.string(),
      thesis: z.string(),
      targetWordCount: z.number().int().min(500).max(20_000),
      positionInChapter: z.enum(["opening", "middle", "closing"]),
      /** 上一 sub-section 末尾内容（已 sanitizeLlmOutput 处理；首 sub-section 为 null） */
      previousContext: z.string().nullable(),
    })
    .optional(),
});

const Output = z.object({
  index: z.number().int(),
  heading: z.string(),
  body: z.string(),
  /**
   * @deprecated PR-2' v1.6 D2 派生真值（2026-05-07 overhaul）
   * LLM 输出值不可信任（c195035f mission 全章节假报 1428 占位）。
   * 真值由 per-dim-pipeline.util.ts 调用 countCJKWords(body) 后端重算覆盖。
   * 保留字段是为了兼容 reflexion loop 内部参照、不破坏 LLM prompt 模板。
   * 任何下游消费（DB 写入 / UI 显示 / D4 硬合约）必须用 backend 重算值，禁止用此字段。
   */
  wordCount: z.number().int(),
  citationsUsed: z.array(z.string()),
});

@DefineAgent({
  id: "playground.chapter-writer",
  identity: {
    role: "chapter-writer",
    description:
      "Writes one chapter of a dimension report, TI-style strict format",
  },
  loop: "reflexion",
  // ★ Round 3 真问题修复 (2026-04-29):
  //   原 outputLength="long" → 8000 maxTokens，等于 targetWords 上限 (8000 字)。
  //   中文 1:1 token，意味着 LLM 单次输出永远会被 maxTokens 截断到约 80% 实际产出。
  //   这是用户实测"extended (25K) 实际只 5K (20%)"的真因之一。
  //   切到 "extended" → 16000 maxTokens，给 8000 字 chapter 留出 2× 缓冲。
  taskProfile: { creativity: "medium", outputLength: "extended" },
  inputSchema: Input,
  outputSchema: Output,
  // ★ 2026-05-01 (PR-G iter9): maxIterations 走集中常量。原 4 内嵌 reflexion ×
  //   外部 4 attempt = 16 calls/章节产生指数爆炸。1 = 内部不再 self-critique，
  //   外部 chapter-reviewer 评分是唯一权威 gate。
  budget: {
    maxTokens: 22_000,
    maxIterations: CHAPTER_WRITER_INTERNAL_MAX_ITERATIONS,
  },
})
export class ChapterWriterAgent extends AgentSpec<typeof Input, typeof Output> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    // ★ PR-13 v1.6 § 13.3 sub-section 模式：subSection 字段存在 → 切单 sub-section prompt
    if (input.subSection) {
      return this.buildSubSectionPrompt(input);
    }
    // ★ lengthProfile-aware 字数范围表（E 档位约束，与 per-dim-pipeline 计算对齐）
    const PROFILE_WORD_RANGES: Record<
      NonNullable<z.infer<typeof Input>["lengthProfile"]>,
      [number, number]
    > = {
      brief: [600, 1000],
      standard: [1200, 1800],
      deep: [2000, 2800],
      extended: [2800, 3500],
      epic: [3500, 4500],
      mega: [4500, 6000],
    };
    const profileRange = input.lengthProfile
      ? PROFILE_WORD_RANGES[input.lengthProfile]
      : null;

    // ★ 沉淀接入: 外部 evidence 文本用 wrapExternalContent 包装，防注入
    const sourceList = input.sources
      .map((s, i) => {
        const wrappedEvidence = wrapExternalContent(s.evidence, {
          source: "research-evidence",
          maxLength: 240,
        });
        return `  [${i + 1}] claim=${s.claim} | source=${s.source}\n${wrappedEvidence}`;
      })
      .join("\n");
    const lang =
      input.language === "zh-CN"
        ? "用简体中文撰写。"
        : "Write in formal English.";
    return [
      `你是一位专业的研究分析师，负责撰写研究报告的第 ${input.chapter.index} 章。`,
      lang,
      ``,
      `## 章节规格`,
      `- 维度: ${input.dimension}（topic: ${input.topic}）`,
      `- 章节标题: ${input.chapter.heading}`,
      `- 章节核心论点 (thesis): ${input.chapter.thesis}`,
      `- keyPoints: ${input.chapter.keyPoints.map((p, i) => `${i + 1}) ${p}`).join("；")}`,
      `- **目标字数: ${input.targetWords} 字（必须 ≥ ${Math.round(input.targetWords * 0.85)} 字才算合格；< 70% 必被打回重写）**${profileRange ? `\n- **lengthProfile=${input.lengthProfile} 档位字数范围: ${profileRange[0]}-${profileRange[1]} 字（本章字数应落在此范围内）**` : ""}`,
      input.targetWords >= 3000
        ? `- **章节深度: ${input.targetWords} 字相当于 ${Math.round(input.targetWords / 600)} 个论述段落（每段 ~600 字），不要少**`
        : "",
      ``,
      `## 核心要求`,
      `1. **聚焦性**: 只写本章节，不要越界其他章节内容`,
      `2. **深度**: 即使字数有限，也要有洞察力，不是信息堆砌`,
      `3. **证据支撑**: 关键论点必须有引用，使用 \`[N]\` 格式（N 对应下方"可用资料"编号，从 1 开始）`,
      `4. **连贯性**: 与前置章节保持逻辑连贯，避免重复前文论点`,
      ``,
      // ★ 2026-04-30 (PR-F): 全量复用 TI report-writing-standards.constants（与
      //   topic-insights/prompts/dimension-research.prompt.ts 同源）。
      //   原 inline "写作风格规范" 6 行下线 — TI 标准更全面（McKinsey Pyramid +
      //   BCG So-What + 量化表达 + 因果区分 + 反箭头链 + 反教科书）。
      HEADING_HIERARCHY,
      ``,
      NARRATIVE_STRUCTURE,
      ``,
      PROFESSIONAL_TONE,
      ``,
      FORMATTING_LIMITS,
      ``,
      CITATION_STANDARDS,
      ``,
      ANALYSIS_DEPTH,
      ``,
      CHART_STANDARDS,
      ``,
      TABLE_STANDARDS,
      ``,
      QUALITY_CHECKLIST,
      ``,
      `## 章节结构（柔性，论点驱动而非固定模板）`,
      `1. **首段**：直接以独立判断开头（不必加 \`> **核心判断**：\` blockquote 模板；该模板每章重复就形成八股，禁止）`,
      input.targetWords >= 5000
        ? `2. **主体 ${Math.max(5, Math.round(input.targetWords / 800))} 段**：每段围绕 1 个分析维度展开（数据 / 案例 / 因果 / 对比 / 推演），含具体数字 / 时间 / 实体 + \`[N]\` 引用。每段必须 400-800 字`
        : `2. **主体 3-5 段**：每段一个独立 thesis claim + 具体数字 / 时间 / 实体 / 案例 + \`[N]\` 引用`,
      `3. **末段**：直接给可操作启示句（不必加 \`**Implications**：\` 前缀；该模板每章重复就成八股，禁止）`,
      ``,
      `## 段落必须有独立观点（核心要求 — 与 TI dimension-research 对齐）`,
      `每段必须有独立、具体、可被证伪的 thesis claim，不是模板套话。`,
      ``,
      `✅ 段首直接给独立判断 + 具体证据 + 因果解释：`,
      `「Anthropic 在 2026-04 的 API Overview 把 Managed Agents 与 Claude models`,
      `并列为程序化访问对象，这意味着**官方已把 Managed Agents 提升到 API 一级`,
      `对象** [1]。」`,
      ``,
      `❌ 套话 / 模板感 / 无独立判断：`,
      `- "随着 X 的发展 / 在当今 / 众所周知 / 综上所述"`,
      `- "本章核心判断是 ..." 仅复述章节标题（不构成独立观点）`,
      ``,
      `**每章至少 1~2 个独立分析判断**，不能仅复述 finding。措辞示例：`,
      `- "这意味着 ..." / "核心原因在于 ..." / "值得警惕的是 ..."`,
      `- "更准确的表述应是 ..." / "不能据此推出 ... 的强结论"`,
      `- "审慎地说 ..." / "但加强的是 ... 不是 ..."`,
      ``,
      `## 去模板化（绝对禁止八股）`,
      `- ❌ 每章首段都用 \`> **核心判断**：xxx\` 这种 blockquote 模板`,
      `- ❌ 每章末段都用 \`**Implications**：xxx\` 这种固定前缀`,
      `- ❌ 同一报告里所有章节用同一句式开头`,
      `- ✓ 每章可有自己的开头节奏，但不允许同一模板复用`,
      input.previousChapterHeadings && input.previousChapterHeadings.length > 0
        ? `\n### 已写过的前置章节（避免重复）\n${input.previousChapterHeadings.map((h, i) => `  - ${i + 1}. ${h}`).join("\n")}\n`
        : "",
      ``,
      `## 严禁格式（违反将被 reviewer 打回）`,
      `- ❌ 加粗独占一行（如 "**关键瓶颈**" 后换行写正文）`,
      `- ❌ 加粗段落开头导语句（"**综合现有证据，可以得出**：..."）`,
      `- ❌ 加粗序数词 / 过渡词（"**其一**"、"**其二**"）`,
      `- ❌ 本章要点块（任何 "**本章要点**" 标题）`,
      `- ❌ 无 marker 短句独行`,
      `- ❌ 字数统计 / 编辑备注（如 "(约 850 字)"）`,
      `- ❌ HTML 标签 / HTML 实体`,
      // ★ 2026-04-30: H2 滥用治理 —— LLM 经常把 keyPoint "1./2./3." 写成 ## H2，
      //   导致 reportAssembler buildSectionTree 把每个 keyPoint 切成独立章节 → 章节
      //   视图碎成 50+ 张卡片。强制 chapter body 内只能有 0 或 1 个 ## H2（即 chapter
      //   标题本身），keyPoint 子小节必须用 ### H3 或正文段落。
      `- ❌ chapter 正文中再写 \`## \` H2 标题（一个 chapter 只允许一个顶层 H2 = 章标题）`,
      `- ❌ 用 \`## 1. xxx\` / \`## （一）xxx\` / \`## 其一：xxx\` 这类编号 H2 切分论点 ——`,
      `      keyPoint 论点必须用 ### H3 或直接段落论述展开，不能升级为同级章节`,
      ``,
      // ★ Phase 1 TI prompt 移植: 反电报式写作硬约束（dimension-research.prompt 验证有效）
      `## 禁止电报式写作（最严格的反 AI 痕迹规则）`,
      `每个段落必须由完整的分析性论述组成，每段 100-300 字。`,
      `严格禁止：`,
      `  - 条目式罗列（"指标名：数值"形式）`,
      `  - 短句独行（多个极短的独立段落，每段 1-2 句、10-50 字、各自成段）`,
      `  - 用换行代替分析（一个论点写完应该展开论证，不是另起一段写下一个）`,
      ``,
      `❌ 错误示例（禁止）：`,
      `多数主流架构仍依赖中心调度。`,
      ``,
      `代理增多后协调成本呈指数上升。`,
      ``,
      `缺乏统一协议放大异构集成摩擦。`,
      ``,
      `✅ 正确示例：`,
      `当前架构面临三重结构性挑战：**多数主流方案仍依赖中心调度机制**，随着代理`,
      `数量增加，协调成本呈指数级上升 [3]；缺乏统一通信协议进一步放大了异构`,
      `集成摩擦。这意味着... [核心分析判断]`,
      ``,
      // ★ Phase 1 TI prompt 移植: [N] 引用严格性
      `## 引用编号严格对应（防 LLM 编号混淆）`,
      `- 写 [3] 时必须确认讨论的内容确实来自"可用资料 [3]"，不要凭印象`,
      `- 不确定数据来自哪条资料时**不要加引用**，宁可不引也不能错引`,
      `- 只用 [N] 数字格式，不用 (Author, Year) / (1) / [作者 2024] 等其他格式`,
      ``,
      input.previousCritique
        ? `## 上一轮 Reviewer critique（必须针对性修复）\n${input.previousCritique}\n`
        : "",
      input.previousDraft
        ? `\n## 上一轮草稿（仅供参考，不要原样重发，针对 critique 重构）\n${input.previousDraft.slice(0, 2500)}\n`
        : "",
      ``,
      `## 可用资料（[N] 引用编号 = 下方编号）`,
      sourceList,
      ``,
      `## 输出 JSON envelope（★ 严格格式，框架 ReActLoop / ReflexionLoop 解析必需）`,
      ``,
      `必须包装在 finalize action 里返回，否则会被 parseDecision 报 InvalidActionError`,
      `（虽有 finalize-raw 兜底但会污染 log）。**正确格式**：`,
      `{`,
      `  "thinking": "<一句话说明本章关键判断（≤60 字）>",`,
      `  "action": {`,
      `    "kind": "finalize",`,
      `    "output": {`,
      `      "index": ${input.chapter.index},`,
      `      "heading": "${input.chapter.heading}",`,
      `      "body": "<完整 markdown 正文，含 [N] 引用编号>",`,
      `      "wordCount": <实际字数>,`,
      `      "citationsUsed": ["<source url 1>", "<source url 2>"]`,
      `    }`,
      `  }`,
      `}`,
      ``,
      `❌ 错误（直接发 output 顶层）：{ "index": ..., "heading": ..., "body": ... }`,
      `✅ 正确（包装在 action.output 里）：{ "thinking": "...", "action": { "kind": "finalize", "output": {...} } }`,
    ].join("\n");
  }

  /**
   * ★ PR-13 v1.6 § 13.3 sub-section 模式 prompt builder
   *
   * 调用条件：input.subSection 字段存在（per-dim-pipeline 检测 scale.subSectionsPerCh ≥ 2 后注入）
   *
   * 关键差异 vs 整章模式：
   *   1. 字数 target 用 subSection.targetWordCount（不是 input.targetWords）
   *   2. 不复述完整 keyPoints；focus 在 sub-section.thesis
   *   3. positionInChapter 决定开场 / 衔接 / 收束的 prompt 提示语
   *   4. previousContext 提供前一 sub-section 末尾以便衔接
   *   5. output schema 同（heading 字段填 sub-section.heading；body 是该 sub-section 的内容）
   *
   * 防御:
   *   - 上层（per-dim-pipeline）已在 previousContext 调 sanitizeLlmOutput
   *   - 章节 heading / thesis 已在 SubSectionPlannerAgent 经 sanitizeUserDerivedField
   *   - 本 prompt 内不再二次 sanitize（避免双层处理破坏内容）
   */
  private buildSubSectionPrompt(input: z.infer<typeof Input>): string {
    const ss = input.subSection!;
    const lang =
      input.language === "zh-CN"
        ? "用简体中文撰写。"
        : "Write in formal English.";

    const positionGuidance: Record<typeof ss.positionInChapter, string> = {
      opening:
        "本节是章节开场：从问题背景出发，引出后续 sub-section 的论证脉络。不要在末尾做总结性陈述（留给最后一节）。",
      middle:
        "本节是章节中段：开头 1 句承接上一 sub-section 的结论；结尾 1 句铺垫下一 sub-section。深入论证 thesis，避免走题。",
      closing:
        "本节是章节收束：必须在末尾包含总结性表述（如「综上」「因此」「总而言之」）；呼应章核心命题；不开新论点。",
    };

    const sourceList = input.sources
      .map((s, i) => {
        const wrappedEvidence = wrapExternalContent(s.evidence, {
          source: "research-evidence",
          maxLength: 200,
        });
        return `  [${i + 1}] ${s.claim} | source=${s.source}\n${wrappedEvidence}`;
      })
      .join("\n");

    const previousBlock =
      ss.previousContext && ss.previousContext.length > 0
        ? `\n## 上一 sub-section 末尾（用于衔接）\n${ss.previousContext}\n`
        : "";

    return [
      `你是研究报告章节撰写助手，本次只写第 ${input.chapter.index} 章中的第 ${ss.index} 个 sub-section。`,
      lang,
      ``,
      `## 章节规格`,
      `- 维度: ${input.dimension}（topic: ${input.topic}）`,
      `- 章节标题: ${input.chapter.heading}`,
      `- 章节核心命题: ${input.chapter.thesis}`,
      ``,
      `## 本 sub-section 规格`,
      `- 顺序: 第 ${ss.index} 个（位置 = ${ss.positionInChapter}）`,
      `- sub-section 标题: ${ss.heading}`,
      `- sub-section 论点: ${ss.thesis}`,
      `- **目标字数: ${ss.targetWordCount} 字（合格区间 ${Math.round(ss.targetWordCount * 0.85)} - ${Math.round(ss.targetWordCount * 1.2)} 字）**`,
      ``,
      `## 位置策略`,
      positionGuidance[ss.positionInChapter],
      previousBlock,
      `## 可引用资料 (claim → source)`,
      sourceList,
      ``,
      `## 严禁`,
      `- 不要复述章节标题或重复整章核心命题作为开篇（这是 sub-section 不是章节）`,
      `- 不要列其他 sub-section 的内容（每个 sub-section 互不重叠）`,
      `- 不要凑字数（垃圾段落 / 空话 / 套话）`,
      `- 仅产出 sub-section 正文，不要附 sub-section 大纲、不要附章节总结`,
      ``,
      `## 必含`,
      `- 引用编号 [N]（与上面 sources 列表对齐）`,
      `- 衔接性短语（按 positionInChapter 提示）`,
      ``,
      `## 输出包装格式（reflexion loop 强制）`,
      `必须包装在 thinking + action.output 内：`,
      `{`,
      `  "thinking": "...",`,
      `  "action": {`,
      `    "kind": "finalize",`,
      `    "output": {`,
      `      "index": ${input.chapter.index},`,
      `      "heading": "${ss.heading.replace(/"/g, '\\"')}",`,
      `      "body": "<sub-section 正文 markdown>",`,
      `      "wordCount": <真实字数>,`,
      `      "citationsUsed": ["<source url 1>", "<source url 2>"]`,
      `    }`,
      `  }`,
      `}`,
    ].join("\n");
  }
}
