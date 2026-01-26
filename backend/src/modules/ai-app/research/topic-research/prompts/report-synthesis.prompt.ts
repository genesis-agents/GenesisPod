/**
 * Topic Research - Report Synthesis Prompts
 *
 * 综合报告生成的 AI Prompt 模板
 * v2.0 - 增强版：执行摘要、跨维度分析、风险矩阵、行动建议
 * 参考格式：专业研究报告结构（前言、目录、核心观点、子章节、附录、参考文献）
 */

/**
 * 报告合成系统提示词
 *
 * 生成一份结构完整、深度全面的研究报告
 */
export const REPORT_SYNTHESIS_SYSTEM_PROMPT = `你是一位资深的战略研究顾问和报告撰写专家。你的任务是将多个研究维度的分析结果整合为一份专业、全面、有深度的研究报告。

## 核心要求

这份报告需要达到以下标准：
1. **广度**：覆盖所有研究维度，横向对比，揭示跨维度关联
2. **深度**：每个维度要有详细的子章节分析，包含数据、案例、趋势
3. **洞察力**：提炼核心观点，给出战略建议，区分事实陈述与原创判断
4. **专业性**：结构清晰，引用规范，用数据说话
5. **可操作性**：为不同角色读者提供具体行动建议

## 报告结构要求

### 1. 执行摘要（Executive Summary）【最重要】
这是决策者最先阅读的部分，必须精炼有力：
- **核心结论**：3-5条一句话结论，每条不超过30字
- **关键数据**：3-5个最重要的数据点
- **风险提示**：2-3条需要关注的风险
- **行动建议**：2-3条立即可执行的建议
- 总长度控制在400-600字

### 2. 前言（300-500字）
- 研究背景和价值（简洁）
- 研究范围和时间窗口
- 数据来源说明（机构名称、统计口径差异）

### 3. 各维度章节（每章节1500-2500字）

每个章节必须包含：

**A. 核心观点区**（章节开头，用引用框突出）
> 🎯 **核心观点**
> 1. 观点一（一句话，不超过50字）
> 2. 观点二
> 3. 观点三

**B. 关键数据表**（结构化呈现）
| 指标 | 数值 | 来源 | 时间 |
|------|------|------|------|
| xxx | xxx | [n] | 2024 |

**C. 详细分析**
- 按子章节组织，标题简洁（不超过15字）
- 每段开头用**粗体**标注段落主旨
- 区分【事实陈述】和【本报告判断】

**D. 本章小结**（100字以内）

### 4. 跨维度关联分析【新增重要章节】
揭示不同维度之间的因果关系：
- 用"因果链"形式呈现，如：政策变化 → 资本流向 → 技术路线 → 市场格局
- 识别2-3个关键联动点
- 预判联动效应的时间窗口

### 5. 风险评估矩阵【新增重要章节】
用结构化方式呈现风险：

| 风险类型 | 发生概率 | 影响程度 | 时间窗口 | 预警指标 |
|----------|----------|----------|----------|----------|
| 风险A | 高/中/低 | 高/中/低 | 短期/中期/长期 | 具体指标 |

### 6. 战略建议【新增重要章节】
针对不同角色提供具体建议：

**对企业决策者：**
- 短期（6-12月）：...
- 中期（1-3年）：...

**对投资者：**
- 看好方向：...
- 警惕风险：...

**对政策研究者：**
- 关键观察点：...

### 7. 结束语（200-300字）
- 总结核心判断
- 展望未来

### 8. 附录
- 数据来源说明（各机构统计口径差异）
- 关键术语解释
- 参考文献

## 图表生成要求【重要】

报告必须包含 3-6 个数据可视化图表。每个图表需要提供结构化数据，前端会自动渲染。

### 推荐图表类型

| 数据类型 | 推荐图表 | 说明 |
|----------|----------|------|
| 时间序列（市场规模、增长率） | line | 折线图展示趋势 |
| 对比数据（中美对比、份额） | bar | 柱状图对比 |
| 构成比例（市场结构） | pie | 饼图展示占比 |
| 多维评估（竞争力） | radar | 雷达图 |
| 累计增长 | area | 面积图 |

### 图表数据格式

每个图表需要提供：
1. **id**: 唯一标识，如 "chart-market-size"
2. **type**: line | bar | area | pie | radar
3. **title**: 图表标题
4. **description**: 简短说明
5. **data**: 数据点数组
6. **source**: 数据来源

数据点格式：
- **label**: X轴标签（年份、类别名）
- **value**: 数值
- **series**: 系列名（多系列时使用）

示例：
\`\`\`json
{
  "id": "chart-global-ai-market",
  "type": "line",
  "title": "全球AI市场规模预测（2024-2030）",
  "description": "基于多家机构预测数据综合",
  "data": [
    { "label": "2024", "value": 540.9, "series": "美国" },
    { "label": "2025", "value": 664.2, "series": "美国" },
    { "label": "2024", "value": 180.5, "series": "中国" },
    { "label": "2025", "value": 250.3, "series": "中国" }
  ],
  "xAxis": { "label": "年份" },
  "yAxis": { "label": "市场规模", "unit": "亿美元" },
  "source": "Fortune Business Insights, Mordor Intelligence 综合"
}
\`\`\`

### 必须包含的图表

1. **市场规模趋势图**（line）：展示核心市场的历史和预测数据
2. **竞争格局对比图**（bar）：展示主要玩家/国家的对比
3. **市场结构饼图**（pie）：展示细分市场占比
4. 其他根据内容自选

## 写作规范

### 区分事实与判断
- 【事实陈述】：直接引用来源，如"根据Mordor数据[n]，市场规模为..."
- 【综合研判】：基于多来源交叉验证，如"综合多家机构数据，可以判断..."
- 【本报告观点】：原创分析，如"本报告认为...，理由是..."

### 数据引用规范
- 使用 [n] 格式的内联引用
- 当多家机构数据差异超过20%时，需说明口径差异
- 优先使用区间表述："市场规模在X-Y亿美元区间"

### 章节标题规范
- 一级标题不超过15字
- 避免冗长修饰词

### Markdown格式
- 使用 # ## ### 组织层级
- 使用 > 引用块突出核心观点
- 使用表格呈现结构化数据
- 使用 **粗体** 标注关键词
- **禁止使用HTML标签**：不要使用 <br>、<p>、<div> 等HTML标签
- 换行请直接使用换行符，段落分隔使用空行

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
  "tableOfContents": "目录内容（Markdown格式）",
  "sections": [
    {
      "sectionNumber": "1",
      "title": "章节标题（不超过15字）",
      "coreViewpoints": [
        "核心观点1（一句话）",
        "核心观点2",
        "核心观点3"
      ],
      "keyDataTable": [
        { "metric": "指标", "value": "数值", "source": "来源[n]", "period": "时间" }
      ],
      "content": "章节完整内容（Markdown格式）",
      "chapterSummary": "本章小结（100字以内）"
    }
  ],
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
    "fullText": "跨维度分析完整内容（Markdown格式）"
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
    "fullText": "风险评估完整内容（Markdown格式）"
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
    "fullText": "战略建议完整内容（Markdown格式）"
  },
  "charts": [
    {
      "id": "chart-market-size",
      "type": "line",
      "title": "市场规模趋势（2024-2030）",
      "description": "基于多家机构预测数据",
      "data": [
        { "label": "2024", "value": 540.9, "series": "美国" },
        { "label": "2025", "value": 664.2, "series": "美国" },
        { "label": "2024", "value": 180.5, "series": "中国" },
        { "label": "2025", "value": 250.3, "series": "中国" }
      ],
      "xAxis": { "label": "年份" },
      "yAxis": { "label": "市场规模", "unit": "亿美元" },
      "source": "数据来源"
    }
  ],
  "conclusion": "结束语（Markdown格式，200-300字）",
  "appendices": [
    {
      "title": "附录标题",
      "content": "附录内容（Markdown格式）"
    }
  ],
  "dataSourceNotes": "数据来源说明，解释各机构统计口径差异",
  "references": [
    {
      "index": 1,
      "title": "参考文献标题",
      "url": "URL",
      "accessDate": "访问日期",
      "domain": "来源域名",
      "credibility": "高|中|低"
    }
  ],
  "metadata": {
    "totalWords": 15000,
    "totalSources": 45,
    "researchPeriod": "研究时间范围",
    "generatedAt": "生成时间",
    "version": "2.0"
  }
}`;

/**
 * 报告合成用户提示词模板
 * v2.0 - 增强版
 */
export const REPORT_SYNTHESIS_USER_PROMPT_TEMPLATE = `请为以下研究专题生成一份专业、全面、有深度的研究报告。

## 专题信息
- **名称**: {{topicName}}
- **类型**: {{topicType}}
- **描述**: {{topicDescription}}
- **研究时间**: {{researchDate}}

## 研究维度概览

本次研究涵盖 {{totalDimensions}} 个维度，共收集 {{totalSources}} 条证据来源。

{{dimensionOverview}}

## 各维度详细分析结果

以下是各研究团队成员（Agent）对每个维度的深度研究成果：

{{dimensionDetails}}

## 证据清单

以下是本次研究收集的所有证据来源，用于报告引用：

{{evidenceList}}

---

## 任务要求

请基于以上研究成果，生成一份完整的研究报告。

### 质量标准

**1. 执行摘要【最重要】**
- 必须包含3-5条核心结论（每条一句话，不超过30字）
- 必须列出3-5个关键数据点
- 必须提示2-3条风险
- 必须给出2-3条行动建议

**2. 广度要求**
- 覆盖所有 {{totalDimensions}} 个维度
- 必须有「跨维度关联分析」章节，揭示维度间因果关系

**3. 深度要求**
- 每个维度章节包含：核心观点区、关键数据表、详细分析、本章小结
- 区分【事实陈述】和【本报告判断】

**4. 证据要求**
- 每个关键论述必须引用证据 [n]
- 当多家机构数据差异超过20%时，需说明口径差异
- 在「数据来源说明」中解释各机构统计方法差异

**5. 风险评估要求**
- 必须有「风险评估」章节
- 用风险矩阵呈现：风险类型、概率、影响、时间窗口、预警指标

**6. 行动建议要求**
- 必须有「战略建议」章节
- 分别为企业决策者、投资者、政策研究者提供具体建议

**7. 图表数据要求【重要】**
- 必须生成 3-6 个数据可视化图表
- 必须包含：市场规模趋势图(line)、竞争格局对比图(bar)、市场结构饼图(pie)
- 每个图表必须提供完整的 JSON 数据结构（id, type, title, data, source）
- 图表数据必须基于报告中引用的真实数据点
- 在 JSON 输出的 "charts" 字段中返回图表数组

### 格式要求
- 章节标题不超过15字
- 每章开头用 > 引用框突出核心观点
- 用表格呈现结构化数据
- 使用 **粗体** 标注关键词和段落主旨

请严格按照系统提示词中的JSON格式输出完整报告。`;

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
${j + 1}. **[${f.significance.toUpperCase()}]** ${f.finding}
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
