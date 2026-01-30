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

## 补充内容要求

### 1. 执行摘要（Executive Summary）【最重要】
这是决策者最先阅读的部分，必须精炼有力：
- **核心结论**：3-5条一句话结论，每条不超过30字
- **关键数据**：3-5个最重要的数据点（从各维度中提炼）
- **风险提示**：2-3条需要关注的风险
- **行动建议**：2-3条立即可执行的建议
- 总长度控制在400-600字

### 2. 前言（300-500字）
- 研究背景和价值（简洁）
- 研究范围和时间窗口
- 数据来源说明

### 3. 跨维度关联分析【重要】
揭示不同维度之间的因果关系：
- 用"因果链"形式呈现，如：政策变化 → 资本流向 → 技术路线 → 市场格局
- 识别2-3个关键联动点
- 预判联动效应的时间窗口

### 4. 风险评估
用结构化方式呈现风险：

| 风险类型 | 发生概率 | 影响程度 | 时间窗口 | 预警指标 |
|----------|----------|----------|----------|----------|
| 风险A | 高/中/低 | 高/中/低 | 短期/中期/长期 | 具体指标 |

### 5. 战略建议
针对不同角色提供具体建议：

**对企业决策者：**
- 短期（6-12月）：...
- 中期（1-3年）：...

**对投资者：**
- 看好方向：...
- 警惕风险：...

**对政策研究者：**
- 关键观察点：...

### 6. 结束语（200-300字）
- 总结核心判断
- 展望未来

## 写作规范

### 数据引用规范
- 使用 [n] 格式的内联引用
- 当多家机构数据差异超过20%时，需说明口径差异
- 优先使用区间表述

### Markdown格式
- 使用 # ## ### 组织层级
- 使用 > 引用块突出核心观点
- 使用表格呈现结构化数据
- 使用 **粗体** 标注关键词
- **禁止使用HTML标签**

### 严禁事项
- **禁止输出写作指南或模板**：不要输出类似"（建议总字数：400-500字）"、"（150-200字，要点列表+信息图）"等写作提示或模板文字
- **禁止使用占位符**：不要使用 XX%、XX亿 等占位数据
- **必须输出完成品**：所有内容必须是可直接阅读的最终文本，不能包含任何写作说明或格式指引

## 输出格式

以 JSON 格式返回，包含以下字段：
{
  "executiveSummary": {
    "coreConclusions": [
      "核心结论1（一句话）",
      "核心结论2",
      "核心结论3"
    ],
    "keyMetrics": [
      { "metric": "指标名", "value": "数值", "source": "来源" }
    ],
    "riskAlerts": [
      "风险提示1",
      "风险提示2"
    ],
    "actionItems": [
      "行动建议1",
      "行动建议2"
    ],
    "fullText": "执行摘要完整文本（Markdown格式，400-600字）"
  },
  "preface": "前言内容（Markdown格式，300-500字）",
  "tableOfContents": "目录内容（Markdown格式，基于维度列表生成）",
  "crossDimensionAnalysis": {
    "title": "跨维度关联分析",
    "causalChains": [
      {
        "chain": "因素A → 因素B → 因素C → 结果",
        "explanation": "因果链说明",
        "timeframe": "影响时间窗口"
      }
    ],
    "keyLinkages": [
      {
        "dimensions": ["维度1", "维度2"],
        "relationship": "关联关系说明",
        "impact": "影响程度"
      }
    ],
    "fullText": "跨维度分析完整内容（Markdown格式，500-800字）"
  },
  "riskAssessment": {
    "title": "风险评估",
    "riskMatrix": [
      {
        "riskType": "风险类型",
        "probability": "高|中|低",
        "impact": "高|中|低",
        "timeframe": "短期|中期|长期",
        "indicators": "预警指标",
        "mitigation": "应对建议"
      }
    ],
    "fullText": "风险评估完整内容（Markdown格式，400-600字）"
  },
  "strategicRecommendations": {
    "title": "战略建议",
    "forEnterprise": {
      "shortTerm": ["短期建议1", "短期建议2"],
      "midTerm": ["中期建议1", "中期建议2"]
    },
    "forInvestors": {
      "opportunities": ["机会1", "机会2"],
      "risks": ["风险1", "风险2"]
    },
    "forPolicymakers": {
      "keyObservations": ["观察点1", "观察点2"]
    },
    "fullText": "战略建议完整内容（Markdown格式，400-600字）"
  },
  "conclusion": "结束语（Markdown格式，200-300字）",
  "appendices": [
    {
      "title": "附录标题",
      "content": "附录内容（Markdown格式）"
    }
  ],
  "dataSourceNotes": "数据来源说明"
}`;

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
- 必须包含3-5条核心结论（每条一句话，不超过30字）
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

**5. 风险评估**
- 用风险矩阵呈现：风险类型、概率、影响、时间窗口、预警指标

**6. 战略建议**
- 分别为企业决策者、投资者、政策研究者提供具体建议

**7. 结束语**
- 总结核心判断
- 展望未来

### 格式要求
- 使用 Markdown 格式
- 使用 > 引用框突出核心观点
- 用表格呈现结构化数据
- 使用 **粗体** 标注关键词

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

**Agent 职责**: 负责研究 "${da.dimensionName}" 维度
**维度描述**: ${da.dimensionDescription || "无"}
**使用证据数**: ${da.sourcesUsed}

### 核心摘要
${da.summary}

### 关键发现 (${da.keyFindings.length}项)
${
  da.keyFindings
    .map(
      (f, j) => `
${j + 1}. **[${(f.significance || "medium").toUpperCase()}]** ${f.finding}
   - 证据支撑: ${f.evidenceIds.length > 0 ? f.evidenceIds.map((id) => `[${id}]`).join(", ") : "无"}`,
    )
    .join("\n") || "暂无关键发现"
}

### 趋势分析 (${da.trends.length}项)
${
  da.trends
    .map(
      (t, j) => `
${j + 1}. **${t.trend}**
   - 方向: ${t.direction}
   - 时间范围: ${t.timeframe}
   - 证据: ${t.evidenceIds.length > 0 ? t.evidenceIds.map((id) => `[${id}]`).join(", ") : "无"}`,
    )
    .join("\n") || "暂无趋势分析"
}

### 挑战分析 (${da.challenges.length}项)
${
  da.challenges
    .map(
      (c, j) => `
${j + 1}. **${c.challenge}**
   - 影响: ${c.impact}
   - 证据: ${c.evidenceIds.length > 0 ? c.evidenceIds.map((id) => `[${id}]`).join(", ") : "无"}`,
    )
    .join("\n") || "暂无挑战分析"
}

### 机会分析 (${da.opportunities.length}项)
${
  da.opportunities
    .map(
      (o, j) => `
${j + 1}. **${o.opportunity}**
   - 潜力: ${o.potential}
   - 证据: ${o.evidenceIds.length > 0 ? o.evidenceIds.map((id) => `[${id}]`).join(", ") : "无"}`,
    )
    .join("\n") || "暂无机会分析"
}

### 详细分析内容
${da.detailedContent || "详细内容请见各子章节"}
`,
    )
    .join("\n\n");
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

  return evidences
    .map(
      (e) => `
[${e.citationIndex}] **${e.title}**
    - 来源: ${e.domain || "未知"} (${e.sourceType || "未知类型"})
    - 可信度: ${e.credibilityScore !== null ? `${e.credibilityScore}/100` : "未评分"}
    - 日期: ${e.publishedAt ? e.publishedAt.toISOString().split("T")[0] : "未知"}
    - URL: ${e.url}`,
    )
    .join("\n");
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
