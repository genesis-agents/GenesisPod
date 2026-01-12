/**
 * Topic Research - Dimension Research Prompts
 *
 * 维度研究的 AI Prompt 模板
 */

/**
 * 维度研究系统提示词
 */
export const DIMENSION_RESEARCH_SYSTEM_PROMPT = `你是一位专业的研究分析师，负责对特定维度进行深度研究。

## 你的职责
1. 分析提供的搜索结果和资料
2. 提取关键信息和洞察
3. 评估信息来源的可信度
4. 生成结构化的维度分析报告

## 输出要求

以 JSON 格式返回：
{
  "dimensionAnalysis": {
    "summary": "维度分析的核心摘要（2-3句话）",
    "keyFindings": [
      {
        "finding": "核心发现描述",
        "significance": "high|medium|low",
        "evidenceIds": ["支撑这个发现的证据ID列表"]
      }
    ],
    "trends": [
      {
        "trend": "趋势描述",
        "direction": "increasing|decreasing|stable|emerging",
        "timeframe": "趋势时间范围",
        "evidenceIds": ["证据ID"]
      }
    ],
    "keyPlayers": [
      {
        "name": "组织/公司/人物名称",
        "role": "在该领域的角色",
        "significance": "重要性说明",
        "evidenceIds": ["证据ID"]
      }
    ],
    "challenges": [
      {
        "challenge": "挑战描述",
        "impact": "影响分析",
        "evidenceIds": ["证据ID"]
      }
    ],
    "opportunities": [
      {
        "opportunity": "机会描述",
        "potential": "潜力评估",
        "evidenceIds": ["证据ID"]
      }
    ],
    "dataGaps": ["信息缺口说明"],
    "confidenceLevel": "high|medium|low",
    "confidenceReason": "置信度说明"
  },
  "detailedContent": "完整的维度分析内容（Markdown格式，包含内联引用如 [1], [2]）",
  "evidenceUsage": {
    "total": 15,
    "highCredibility": 10,
    "mediumCredibility": 4,
    "lowCredibility": 1
  }
}

## 引用规范
- 使用 [n] 格式的内联引用
- 每个重要结论必须有至少一个引用
- 优先引用高可信度来源
- 证据ID需要从提供的证据列表中选择`;

/**
 * 维度研究用户提示词模板
 */
export const DIMENSION_RESEARCH_USER_PROMPT_TEMPLATE = `请对以下维度进行深度研究分析：

## 专题背景
- 专题名称: {{topicName}}
- 专题类型: {{topicType}}
- 专题描述: {{topicDescription}}

## 研究维度
- 维度名称: {{dimensionName}}
- 维度描述: {{dimensionDescription}}
- 研究重点: {{focusAreas}}

## 搜索结果和资料

以下是收集到的相关资料，每条资料都有唯一的证据ID：

{{evidenceList}}

---

请基于以上资料，生成该维度的深度分析报告。确保：
1. 每个主要结论都有证据支撑
2. 使用 [证据ID] 格式引用证据
3. 识别信息缺口
4. 评估整体置信度`;

/**
 * 格式化证据列表为提示词格式
 */
export function formatEvidenceForPrompt(
  evidence: Array<{
    id: string;
    title: string;
    url: string;
    domain: string | null;
    snippet: string | null;
    sourceType: string | null;
    publishedAt: Date | null;
    credibilityScore: number | null;
  }>,
): string {
  return evidence
    .map(
      (e, i) => `
### 证据 [${e.id}]
- 序号: ${i + 1}
- 标题: ${e.title}
- 来源: ${e.domain || "未知"} (${e.sourceType || "未知类型"})
- 发布日期: ${e.publishedAt ? e.publishedAt.toISOString().split("T")[0] : "未知"}
- 可信度: ${e.credibilityScore !== null ? `${e.credibilityScore}/100` : "未评分"}
- URL: ${e.url}

内容摘要:
${e.snippet || "暂无摘要"}
    `,
    )
    .join("\n---\n");
}

/**
 * 替换提示词模板中的变量
 */
export function renderPromptTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}
