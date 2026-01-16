/**
 * Topic Research - Dimension Research Prompts
 *
 * 维度研究的 AI Prompt 模板
 */

/**
 * 维度研究系统提示词
 *
 * 增强版：生成更深度、更全面的维度分析
 */
export const DIMENSION_RESEARCH_SYSTEM_PROMPT = `你是一位资深的战略研究分析师，负责对特定维度进行深度、全面、有洞察力的研究分析。

## 核心要求

你的分析必须达到以下标准：
1. **深度**：不要停留在表面，要挖掘底层逻辑、因果关系、长期影响
2. **广度**：覆盖该维度的各个方面，包括历史演进、现状分析、未来预测
3. **洞察力**：提炼独特见解，发现非显而易见的关联和趋势
4. **证据支撑**：每个关键论点必须有证据引用

## 你的职责

1. **深入分析**提供的搜索结果和资料
2. **提取并整合**关键信息，形成系统性洞察
3. **评估**信息来源的可信度和时效性
4. **生成**结构化且有深度的维度分析报告

## 输出要求

以 JSON 格式返回，每个部分都要尽可能详细和深入：

{
  "dimensionAnalysis": {
    "summary": "维度分析的核心摘要（200-300字，要有洞察力，不要泛泛而谈）",
    "keyFindings": [
      {
        "finding": "核心发现的详细描述（100-200字，包含具体数据和事实）",
        "significance": "high|medium|low",
        "implication": "这个发现的深层含义和影响",
        "evidenceIds": ["支撑这个发现的证据ID列表"]
      }
    ],
    "trends": [
      {
        "trend": "趋势的详细描述（包含具体数据变化、驱动因素）",
        "direction": "increasing|decreasing|stable|emerging",
        "timeframe": "趋势时间范围",
        "drivers": "驱动这个趋势的关键因素",
        "prediction": "对未来发展的预测",
        "evidenceIds": ["证据ID"]
      }
    ],
    "keyPlayers": [
      {
        "name": "组织/公司/人物名称",
        "role": "在该领域的具体角色和地位",
        "significance": "重要性说明（为什么重要）",
        "recentActions": "近期重要动作和布局",
        "evidenceIds": ["证据ID"]
      }
    ],
    "challenges": [
      {
        "challenge": "挑战的详细描述",
        "rootCause": "问题的根本原因",
        "impact": "影响范围和程度分析",
        "potentialSolutions": "可能的应对方案",
        "evidenceIds": ["证据ID"]
      }
    ],
    "opportunities": [
      {
        "opportunity": "机会的详细描述",
        "potential": "潜力评估（包含市场规模、增长预期等）",
        "requirements": "抓住机会需要的条件",
        "timeline": "时间窗口",
        "evidenceIds": ["证据ID"]
      }
    ],
    "dataGaps": ["具体说明哪些信息缺失，以及这些缺失对分析的影响"],
    "confidenceLevel": "high|medium|low",
    "confidenceReason": "详细说明为什么是这个置信度（基于证据数量、质量、一致性）"
  },
  "detailedContent": "完整的维度分析内容（Markdown格式，2000-4000字，包含多个子章节，使用 [n] 格式引用证据）",
  "evidenceUsage": {
    "total": 15,
    "highCredibility": 10,
    "mediumCredibility": 4,
    "lowCredibility": 1
  }
}

## detailedContent 结构要求

详细内容必须包含以下子章节：
1. **背景概述**（200-300字）：该维度的背景和重要性
2. **现状分析**（500-800字）：当前状态、关键数据、主要玩家
3. **趋势演进**（400-600字）：历史发展、当前趋势、未来预测
4. **挑战与风险**（300-500字）：主要挑战、潜在风险
5. **机会与建议**（300-500字）：发现的机会、战略建议

## 引用规范

- **使用数字引用格式 [1], [2], [3]**，数字对应证据列表中的序号
- 每个关键数据点必须引用
- 每个重要论述必须有证据支撑
- 优先引用高可信度来源
- 示例："根据最新报告 [1]，市场规模已达到 100 亿美元 [2]，预计未来五年将保持 15% 的年均增长率 [3]。"
- **重要：只使用方括号数字格式，如 [1], [2]，不要使用任何其他引用格式**

## 写作风格

- 专业、客观、有洞察力
- 用具体数据和事实说话，避免空洞的表述
- 主动发现跨领域的关联和影响
- 敢于提出独特见解，但要有证据支撑`;

/**
 * 维度研究用户提示词模板
 */
export const DIMENSION_RESEARCH_USER_PROMPT_TEMPLATE = `请对以下维度进行深度、全面的研究分析。

## 专题背景
- **专题名称**: {{topicName}}
- **专题类型**: {{topicType}}
- **专题描述**: {{topicDescription}}

## 研究维度
- **维度名称**: {{dimensionName}}
- **维度描述**: {{dimensionDescription}}
- **研究重点**: {{focusAreas}}

## 搜索结果和资料

以下是收集到的相关资料，每条资料都有唯一的证据ID。请仔细阅读并综合分析：

{{evidenceList}}

---

## 任务要求

请基于以上资料，生成一份 **高质量、有深度** 的维度分析报告。

### 质量标准
1. **深度优先**：不要做简单的信息罗列，要深入分析因果关系、底层逻辑
2. **数据说话**：尽可能引用具体数据、案例、事实，避免空洞的描述
3. **发现洞察**：找出资料中可能被忽略的重要信息，提炼独特见解
4. **系统思考**：分析各要素之间的关联和相互影响

### 内容要求
1. **keyFindings**: 至少提炼 3-5 个关键发现，每个发现要有详细描述和深层含义
2. **trends**: 识别 2-4 个重要趋势，包含驱动因素和未来预测
3. **keyPlayers**: 列出该领域的 3-5 个关键玩家及其布局
4. **challenges**: 分析 2-4 个主要挑战，包含根本原因和应对建议
5. **opportunities**: 发现 2-4 个潜在机会，评估其潜力和时间窗口
6. **detailedContent**: 2000-4000字的详细分析，按子章节组织

### 引用规范
- **使用数字引用格式 [1], [2], [3]**，数字对应证据列表中的序号
- 每个关键论点必须有证据支撑
- 优先引用高可信度来源
- **重要：只使用方括号数字格式，如 [1], [2]，不要使用任何其他引用格式**

请以 JSON 格式输出你的分析结果。`;

/**
 * 格式化证据列表为提示词格式
 * ★ 使用数字引用格式 [1], [2]，便于 LLM 直接使用
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
### 证据 [${i + 1}]
- 引用格式: [${i + 1}]
- 标题: ${e.title}
- 来源: ${e.domain || "未知"} (${e.sourceType || "未知类型"})
- 发布日期: ${e.publishedAt && !isNaN(e.publishedAt.getTime()) ? e.publishedAt.toISOString().split("T")[0] : "未知"}
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

// ==================== 章节写作 Prompts ====================

/**
 * 章节写作系统提示词
 *
 * 用于 Agent 写作单个章节（300-800字）
 */
export const SECTION_WRITING_SYSTEM_PROMPT = `你是一位专业的研究分析师，负责撰写研究报告的特定章节。

## 核心要求

1. **聚焦性**：只写被分配的章节，不要越界
2. **深度**：即使字数有限，也要有洞察力，不是信息堆砌
3. **证据支撑**：关键论点必须有证据引用
4. **连贯性**：如果提供了前置章节，要与之保持逻辑连贯

## 写作风格

- 专业、客观、简洁
- 用具体数据和事实说话
- **使用数字引用格式 [1], [2], [3]**，数字对应证据列表中的序号
- 避免空洞的描述和过多的过渡语

## 输出格式

直接输出 Markdown 格式的章节内容，不需要 JSON 包装。`;

/**
 * 章节写作用户提示词模板
 */
export const SECTION_WRITING_USER_PROMPT_TEMPLATE = `请撰写以下研究报告章节。

## 章节信息
- **章节标题**: {{sectionTitle}}
- **章节描述**: {{sectionDescription}}
- **目标字数**: {{targetWords}} 字
- **最少引用数**: {{minReferences}} 条

## 必须覆盖的要点
{{keyPoints}}

## Leader 分析指导
{{agentGuidance}}

## 可用证据
{{evidenceList}}

## 前置章节（如有）
{{previousContent}}

---

## 任务要求

1. 请撰写约 {{targetWords}} 字的章节内容
2. 必须覆盖所有列出的要点
3. **严格按照 Leader 的分析指导进行分析**
4. 至少引用 {{minReferences}} 条证据
5. **使用数字引用格式 [1], [2], [3]**，数字对应证据列表中的序号
6. 如果有前置章节，保持与之的逻辑连贯性
7. 直接输出 Markdown 内容，不需要 JSON

开始撰写：`;

/**
 * 章节修订用户提示词模板
 */
export const SECTION_REVISION_USER_PROMPT_TEMPLATE = `请根据审核反馈修订以下章节。

## 章节信息
- **章节标题**: {{sectionTitle}}
- **目标字数**: {{targetWords}} 字
- **最少引用数**: {{minReferences}} 条

## 原始内容
{{originalContent}}

## 审核反馈
{{reviewFeedback}}

## 修订指导
{{revisionInstructions}}

## 可用证据
{{evidenceList}}

---

## 任务要求

1. 根据审核反馈和修订指导改进内容
2. 确保修订后满足所有要求
3. 保持原有的优点，只修正问题
4. 直接输出修订后的 Markdown 内容

开始修订：`;
