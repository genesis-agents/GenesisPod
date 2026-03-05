/**
 * Topic Research - Report Synthesis Prompts
 *
 * 综合报告生成的 AI Prompt 模板
 * v3.0 - 精简版：章节内容已由维度研究生成，此处只生成补充内容
 *
 * 架构说明：
 * - 各维度章节内容（detailedContent）在维度研究阶段已生成，包含图表
 * - 报告合成阶段只生成：执行摘要、前言、跨维度分析、风险评估、战略建议、结束语
 * - 最终报告通过拼接维度内容 + 补充内容生成，保证内容完整性
 */

import { SYNTHESIS_FORMATTING } from "./report-writing-standards";

/**
 * 报告合成系统提示词
 *
 * 生成报告的补充内容（执行摘要、前言、跨维度分析等）
 * 注意：各维度章节内容已在维度研究阶段生成，此处不需要重写
 */
export const REPORT_SYNTHESIS_SYSTEM_PROMPT = `你是一位资深的战略研究顾问和报告撰写专家。你的任务是为已完成的多维度研究生成报告的**补充内容**。

## 重要说明

⚠️ **各维度章节内容已由研究 Agent 生成**，你不需要重写章节内容。

你只需要生成以下补充内容：
1. 执行摘要（Executive Summary）
2. 前言（Preface）
3. 跨维度关联分析（Cross-Dimension Analysis）
4. 风险评估（Risk Assessment）
5. 战略建议（Strategic Recommendations）
6. 结束语（Conclusion）

## 输出格式

以 JSON 格式返回。**关键要求：每个 section 的 fullText 是必填字段，即使无法生成结构化子字段也必须生成 fullText 文本。**

{
  "executiveSummary": {
    "fullText": "【必填】执行摘要完整文本（Markdown格式，400-600字）",
    "thesisStatement": "一句话概括本报告最重要的发现/判断（核心论断）",
    "coreConclusions": ["支撑核心论断的关键发现1", "关键发现2", "关键发现3"],
    "keyMetrics": [{ "metric": "指标名", "value": "数值", "source": "来源" }],
    "riskAlerts": ["风险提示1", "风险提示2"],
    "actionItems": ["行动建议1", "行动建议2"]
  },
  "preface": "前言内容（Markdown格式，300-500字）",
  "tableOfContents": "目录内容（Markdown格式）",
  "crossDimensionAnalysis": {
    "fullText": "【必填】跨维度分析完整内容（Markdown格式，500-800字）",
    "causalChains": [{ "chain": "因素A → 因素B → 结果", "explanation": "说明", "timeframe": "时间窗口" }],
    "keyLinkages": [{ "dimensions": ["维度1", "维度2"], "relationship": "关联", "impact": "影响" }],
    "feedbackLoops": ["自我强化或自我抑制的循环效应描述"],
    "systemicEffects": ["多维度联动可能触发的涌现效应描述"]
  },
  "riskAssessment": {
    "fullText": "【必填】风险评估完整内容（Markdown格式，含风险矩阵表格，400-600字）",
    "riskMatrix": [{ "riskType": "类型", "probability": "高|中|低", "impact": "高|中|低", "timeframe": "短期|中期|长期", "indicators": "预警指标", "mitigation": "应对建议" }]
  },
  "strategicRecommendations": {
    "fullText": "【必填】战略建议完整内容（Markdown格式，分角色建议，400-600字）",
    "forEnterprise": { "shortTerm": ["建议1"], "midTerm": ["建议1"] },
    "forInvestors": { "opportunities": ["机会1"], "risks": ["风险1"] },
    "forPolicymakers": { "keyObservations": ["观察点1"] }
  },
  "conclusion": "结束语（Markdown格式，300-500字，纯段落文本，不使用子标题。总结全文核心判断，展望研究主题的未来走向。禁止包含情景展望（已在 scenarioOutlook 中）和行动建议（已在 strategicRecommendations 中）。禁止与其他字段内容重复。）",
  "scenarioOutlook": {
    "baseline": "基准情景描述（含概率评估和触发条件）",
    "optimistic": "乐观情景描述（含概率评估和触发条件）",
    "pessimistic": "悲观情景描述（含概率评估和触发条件）"
  },
  "appendices": [{ "title": "附录标题", "content": "附录内容" }]
}

⚠️ **最重要的提醒**：crossDimensionAnalysis.fullText、riskAssessment.fullText、strategicRecommendations.fullText 三个字段必须包含完整的 Markdown 文本内容。不要只返回结构化子字段而遗漏 fullText。

## 格式规范
- **编号格式统一**：全文统一使用阿拉伯数字编号（1. 2. 3.），禁止混用中文数字（一、二、三）和阿拉伯数字（1、2、3）
- 有序列表统一使用 \`1. 2. 3.\` 格式，无序列表统一使用 \`- \` 格式
- 标题使用 Markdown 层级（##, ###），不要在标题中使用编号

{{languageInstruction}}`;

/**
 * 报告合成用户提示词模板
 * v3.0 - 精简版：只生成补充内容
 */
export const REPORT_SYNTHESIS_USER_PROMPT_TEMPLATE = `请为以下研究专题生成报告的**补充内容**。

## 重要说明

⚠️ **各维度章节内容已由研究 Agent 生成**，你不需要重写章节内容。
你只需要基于各维度的研究成果，生成补充内容（执行摘要、前言、跨维度分析、风险评估、战略建议、结束语）。

## 专题信息
- **名称**: {{topicName}}
- **类型**: {{topicType}}
- **描述**: {{topicDescription}}
- **研究时间**: {{researchDate}}

## 研究维度概览

本次研究涵盖 {{totalDimensions}} 个维度，共收集 {{totalSources}} 条证据来源。

{{dimensionOverview}}

## 各维度研究摘要

以下是各研究维度的核心发现摘要（用于生成执行摘要和跨维度分析）：

{{dimensionDetails}}

## 证据清单

以下是本次研究收集的所有证据来源，用于报告引用：

{{evidenceList}}

---

## 任务要求

请基于以上研究成果，生成报告的**补充内容**。

### 需要生成的内容

**1. 执行摘要【最重要】**
- 必须包含1条核心论断（Thesis Statement）：一句话概括本报告最重要的发现/判断
- 必须包含3-5条核心结论（支撑核心论断的关键发现，每条一句话，不超过30字）
- 必须列出3-5个关键数据点（从各维度中提炼）
- 必须提示2-3条风险
- 必须给出2-3条行动建议

**2. 前言**
- 研究背景和价值
- 研究范围和时间窗口

**3. 目录**
- 基于维度列表生成目录结构

**4. 跨维度关联分析【重要】**
- 揭示 {{totalDimensions}} 个维度之间的因果关系
- 用"因果链"形式呈现
- 识别关键联动点
- 识别反馈回路：自我强化或自我抑制的循环效应
- 分析系统性风险/机遇：多维度联动可能触发的涌现效应

**5. 风险评估**
- 用风险矩阵呈现：风险类型、概率、影响、时间窗口、预警指标

**6. 战略建议**
- 分别为企业决策者、投资者、政策研究者提供具体建议

**7. 结束语（300-500字）**
- 纯段落文本，不使用子标题
- 总结全文核心判断（不是复述执行摘要，要有新的综合视角）
- 展望研究主题的未来走向（1-2句，不展开情景分析）
- 禁止包含情景展望（已由 scenarioOutlook 字段覆盖）
- 禁止包含行动建议（已由 strategicRecommendations 字段覆盖）

${SYNTHESIS_FORMATTING}

请严格按照系统提示词中的JSON格式输出。`;

/**
 * 维度研究摘要模板（用于报告合成）
 */
export function formatDimensionOverview(
  dimensions: Array<{
    name: string;
    description: string | null;
    keyFindingsCount: number;
    sourcesUsed: number;
  }>,
): string {
  return dimensions
    .map(
      (d, i) => `
### ${i + 1}. ${d.name}
- 描述: ${d.description || "无"}
- 关键发现: ${d.keyFindingsCount} 项
- 使用来源: ${d.sourcesUsed} 条`,
    )
    .join("\n");
}

/**
 * 维度详细分析模板（用于报告合成）
 */
export function formatDimensionDetails(
  dimensionAnalyses: Array<{
    dimensionName: string;
    dimensionDescription: string | null;
    summary: string;
    keyFindings: Array<{
      finding: string;
      significance: string;
      evidenceIds: string[];
    }>;
    trends: Array<{
      trend: string;
      direction: string;
      timeframe: string;
      evidenceIds: string[];
    }>;
    challenges: Array<{
      challenge: string;
      impact: string;
      evidenceIds: string[];
    }>;
    opportunities: Array<{
      opportunity: string;
      potential: string;
      evidenceIds: string[];
    }>;
    detailedContent: string;
    sourcesUsed: number;
  }>,
): string {
  return dimensionAnalyses
    .map(
      (da, i) => `
---
## 研究成果 ${i + 1}: ${da.dimensionName}

**维度描述**: ${da.dimensionDescription || "无"}

### 核心摘要
${da.summary}

### 关键发现 (Top 3)
${
  da.keyFindings
    .slice(0, 3)
    .map(
      (f, j) =>
        `${j + 1}. **[${(f.significance || "medium").toUpperCase()}]** ${f.finding}`,
    )
    .join("\n") || "暂无关键发现"
}

### 趋势分析 (Top 2)
${
  da.trends
    .slice(0, 2)
    .map((t, j) => `${j + 1}. **${t.trend}** (${t.direction}, ${t.timeframe})`)
    .join("\n") || "暂无趋势分析"
}

### 挑战 (Top 2)
${
  da.challenges
    .slice(0, 2)
    .map((c, j) => `${j + 1}. ${c.challenge}`)
    .join("\n") || "暂无"
}

### 机会 (Top 2)
${
  da.opportunities
    .slice(0, 2)
    .map((o, j) => `${j + 1}. ${o.opportunity}`)
    .join("\n") || "暂无"
}

### 详细分析内容摘要
${
  da.detailedContent
    ? da.detailedContent.substring(0, 400) +
      (da.detailedContent.length > 400
        ? "...(已截断，完整内容已由研究 Agent 生成)"
        : "")
    : "详细内容请见各子章节"
}
`,
    )
    .join("\n\n");
}

/**
 * 极简版维度摘要（用于 fallback 重试）
 * 仅保留 summary + top 2 findings，无 evidence / detailedContent
 */
export function formatReducedDimensionSummaries(
  dimensionAnalyses: Array<{
    dimensionName: string;
    summary: string;
    keyFindings: Array<{
      finding: string;
      significance: string;
    }>;
  }>,
): string {
  return dimensionAnalyses
    .map(
      (da, i) => `
### ${i + 1}. ${da.dimensionName}
${da.summary}
${
  da.keyFindings
    .slice(0, 2)
    .map((f, j) => `${j + 1}. ${f.finding}`)
    .join("\n") || ""
}`,
    )
    .join("\n");
}

/**
 * 证据列表模板（用于报告合成）
 */
export function formatEvidenceList(
  evidences: Array<{
    citationIndex: number;
    title: string;
    url: string;
    domain: string | null;
    sourceType: string | null;
    publishedAt: Date | null;
    credibilityScore: number | null;
  }>,
): string {
  if (evidences.length === 0) {
    return "暂无证据";
  }

  // ★ 限制证据数量，避免 token 溢出
  // 报告合成只需要知道有哪些证据可引用，不需要完整详情
  const MAX_EVIDENCES_IN_PROMPT = 30;
  const truncated = evidences.length > MAX_EVIDENCES_IN_PROMPT;
  const displayedEvidences = evidences.slice(0, MAX_EVIDENCES_IN_PROMPT);

  const list = displayedEvidences
    .map((e) => `[${e.citationIndex}] ${e.title} (${e.domain || "未知"})`)
    .join("\n");

  return truncated
    ? `${list}\n\n... 还有 ${evidences.length - MAX_EVIDENCES_IN_PROMPT} 条证据（完整列表见报告附录）`
    : list;
}

/**
 * 渲染报告合成用户提示词
 */
export function renderReportSynthesisPrompt(
  topicName: string,
  topicType: string,
  topicDescription: string | null,
  researchDate: string,
  totalDimensions: number,
  totalSources: number,
  dimensionOverview: string,
  dimensionDetails: string,
  evidenceList: string,
): string {
  let result = REPORT_SYNTHESIS_USER_PROMPT_TEMPLATE;

  const variables: Record<string, string> = {
    topicName,
    topicType,
    topicDescription: topicDescription || "无",
    researchDate,
    totalDimensions: totalDimensions.toString(),
    totalSources: totalSources.toString(),
    dimensionOverview,
    dimensionDetails,
    evidenceList,
  };

  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }

  return result;
}
