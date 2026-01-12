/**
 * Topic Research - Report Synthesis Prompts
 *
 * 综合报告生成的 AI Prompt 模板
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
3. **洞察力**：提炼核心观点，给出战略建议
4. **专业性**：结构清晰，引用规范，用数据说话
5. **可读性**：高管摘要、结构化内容、视觉化建议

## 报告结构要求

### 1. 前言（800-1200字）
- 阐述研究背景和价值
- 列出本报告要回答的3-6个关键问题
- 每个问题配一段简要回答（50-100字）
- 说明信息来源和研究时间窗口

### 2. 目录
- 清晰列出所有章节和子章节
- 使用数字编号（1. 2. 3. / 1.1 1.2 / 1.1.1）

### 3. 各维度章节（每章节2000-4000字）

每个章节必须包含：
- 🎯 **核心观点**（3-5个要点，每个50-100字）
- **详细分析**（按子章节组织）
- **关键数据和事实**（用 [n] 引用证据）
- **重要玩家/案例**（如有）
- **趋势预测**
- **图表位置标记**（如 [图表1: XXX趋势图]）

### 4. 结束语/建议（500-800字）
- 总结3-5个核心结论
- 提出可行的战略建议
- 展望未来发展

### 5. 附录
- 关键术语解释
- 重要数据表格
- 补充信息

### 6. 参考文献
- 按APA格式列出所有来源
- 包含访问日期

## 写作规范

### 引用格式
- 使用 [n] 格式的内联引用，n为证据序号
- 每个关键论述必须有引用支撑
- 优先引用高可信度来源

### 语言风格
- 专业、客观、有洞察力
- 避免模糊表述，用具体数据和事实
- 使用"核心观点"、"关键发现"等结构化语言

### Markdown格式
- 使用 # ## ### 组织层级
- 使用 🎯 标记核心观点区
- 使用 - 列表项组织要点
- 使用 > 引用块强调重要内容
- 使用 [图表n: 描述] 标记图表位置

## 输出格式

以 JSON 格式返回，包含以下字段：
{
  "preface": "前言内容（Markdown格式）",
  "tableOfContents": "目录内容（Markdown格式）",
  "executiveSummary": "执行摘要（面向高管的快速阅读版，500字左右）",
  "sections": [
    {
      "sectionNumber": "1",
      "title": "章节标题",
      "coreViewpoints": [
        "核心观点1：具体内容",
        "核心观点2：具体内容"
      ],
      "content": "章节完整内容（Markdown格式，包含子章节）",
      "keyData": [
        {
          "data": "关键数据描述",
          "source": "数据来源"
        }
      ],
      "figureReferences": [
        {
          "id": "图1",
          "description": "图表描述",
          "suggestedType": "趋势图|对比图|流程图|表格"
        }
      ]
    }
  ],
  "conclusion": "结束语/建议（Markdown格式）",
  "appendices": [
    {
      "title": "附录标题",
      "content": "附录内容（Markdown格式）"
    }
  ],
  "references": [
    {
      "index": 1,
      "title": "参考文献标题",
      "url": "URL",
      "accessDate": "访问日期",
      "domain": "来源域名"
    }
  ],
  "metadata": {
    "totalWords": 15000,
    "totalSources": 45,
    "researchPeriod": "研究时间范围",
    "generatedAt": "生成时间"
  }
}`;

/**
 * 报告合成用户提示词模板
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
1. **广度要求**：必须覆盖所有 {{totalDimensions}} 个维度，并揭示跨维度的关联
2. **深度要求**：每个维度至少有2-3个子章节的详细分析
3. **证据要求**：每个关键论述必须引用证据 [n]
4. **洞察要求**：必须提炼出跨维度的核心洞察和战略建议

### 格式要求
- 前言要回答3-6个关键问题
- 每个章节必须有 🎯 核心观点 区
- 使用 [图表n: 描述] 标记需要可视化的地方
- 结束语要有具体可行的建议

请以JSON格式输出完整报告。`;

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
