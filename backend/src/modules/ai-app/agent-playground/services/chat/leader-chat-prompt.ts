/**
 * leader-chat-prompt —— LeaderChat system prompt 拼装（纯函数）
 *
 * 拆自 leader-chat.service.ts（2026-05-04 单文件超 500 行违反 standards/16 §六，
 * 提取为独立模块）。playground 业务专属，不下沉。
 *
 * 输入：mission row（含 topic / dimensions / reportFull / themeSummary 等）
 * 输出：LLM system prompt（CN/EN 双语，含 JSON 决策 schema 约束 + 决策规则）
 *
 * 后续 PR-8 接 SkillRegistry 时，本模块整体迁到 SKILL.md frontmatter + body。
 */

import type { MissionStore } from "../mission/lifecycle/mission-store.service";

type MissionDetail = Awaited<ReturnType<MissionStore["getById"]>>;

/**
 * 构建 LeaderChat system prompt。
 *
 * 依赖：
 *   - mission.language (zh-CN / en-US) → 决定 prompt 语言
 *   - mission.topic / depth / status / finalScore / themeSummary → mission 概况
 *   - mission.dimensions[] → 已有维度（防新 dim 重叠）
 *   - mission.reportFull → 已产出报告片段（让 Leader 引用具体结论）
 */
export function buildLeaderChatPrompt(mission: MissionDetail): string {
  if (!mission) {
    return [
      "You are the Research Leader of an agent-playground research mission.",
      "The mission record was not found. Politely tell the user there is no context.",
    ].join("\n");
  }

  const lang = mission.language;
  const dims = (mission.dimensions ?? []) as {
    name?: string;
    rationale?: string;
  }[];
  const dimsText = dims.length
    ? dims
        .map(
          (d, i) =>
            `${i + 1}. ${d.name ?? "(unnamed)"}` +
            (d.rationale ? ` — ${d.rationale}` : ""),
        )
        .join("\n")
    : "(no dimensions yet)";

  const reportFull = mission.reportFull as
    | {
        title?: string;
        summary?: string;
        conclusion?: string;
        sections?: { heading: string }[];
      }
    | null
    | undefined;

  const reportSnippet = reportFull
    ? [
        `Report title: ${reportFull.title ?? "(untitled)"}`,
        `Summary: ${reportFull.summary ?? ""}`,
        reportFull.sections?.length
          ? `Sections: ${reportFull.sections.map((s) => s.heading).join(" / ")}`
          : "",
        reportFull.conclusion ? `Conclusion: ${reportFull.conclusion}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "(report not yet produced)";

  const intro =
    lang === "zh-CN"
      ? "你是这个 agent-playground 研究 mission 的 Research Leader。基于以下完整上下文，与用户讨论 mission 并必要时追加研究维度。"
      : "You are the Research Leader for this agent-playground research mission. Discuss with the user and append research dimensions when needed.";

  const decisionGuide =
    lang === "zh-CN" ? DECISION_GUIDE_CN : DECISION_GUIDE_EN;

  return [
    intro,
    "",
    `## Mission`,
    `- Topic: ${mission.topic}`,
    `- Depth: ${mission.depth}`,
    `- Status: ${mission.status}`,
    mission.finalScore != null
      ? `- Final consensus score: ${mission.finalScore} / 100`
      : "",
    mission.themeSummary ? `- Theme summary: ${mission.themeSummary}` : "",
    "",
    `## Dimensions plan`,
    dimsText,
    "",
    `## Report snapshot`,
    reportSnippet,
    decisionGuide,
  ]
    .filter(Boolean)
    .join("\n");
}

const DECISION_GUIDE_CN = [
  ``,
  `## 关键：你必须返回 JSON 决策（用 \`\`\`json fence 包裹），格式严格如下：`,
  `\`\`\`json`,
  `{`,
  `  "decisionType": "DIRECT_ANSWER" | "CREATE_TODO" | "CLARIFY" | "ACKNOWLEDGE",`,
  `  "response": "<对话气泡显示的 markdown 文本（必填）>",`,
  `  "understanding": "<一句话理解：我理解你想要 X（强烈建议）>",`,
  `  "todo": [ { "name": "<新维度名>", "rationale": "<为什么要研究>" }, ... ],   // 仅 CREATE_TODO 必填`,
  `  "clarifyOptions": ["<选项1>", "<选项2>", ...]                              // 仅 CLARIFY 必填`,
  `}`,
  `\`\`\``,
  ``,
  `## 决策规则：`,
  `- 用户 *提了新研究方向 / 任务 / 角度* → CREATE_TODO（todo 数组里给出 1-3 个新维度，与已有维度互斥）`,
  `- 用户 *问 mission 现状 / 解释报告 / 讨论结论* → DIRECT_ANSWER`,
  `- 用户表述模糊 / 你需要 user 在几个方向之间选 → CLARIFY（提供 2-4 个 clarifyOptions）`,
  `- 用户 *仅闲聊 / 致谢 / 确认* → ACKNOWLEDGE`,
  ``,
  `## CREATE_TODO 注意事项：`,
  `- 仅当 mission 状态 = running 时建议追加 dimension（其它状态会被前端拒绝）`,
  `- 新 dimension 必须与 ## Dimensions plan 中已有的不重叠`,
  `- name 简短（≤ 12 字），rationale 1-2 句解释为何重要`,
  ``,
  `## 风格：精炼、专业、有据可依；引用上述上下文中的具体内容；response 字段用中文。`,
].join("\n");

const DECISION_GUIDE_EN = [
  ``,
  `## CRITICAL: Return JSON decision wrapped in \`\`\`json fence:`,
  `\`\`\`json`,
  `{`,
  `  "decisionType": "DIRECT_ANSWER" | "CREATE_TODO" | "CLARIFY" | "ACKNOWLEDGE",`,
  `  "response": "<markdown shown in chat bubble (required)>",`,
  `  "understanding": "<one-line understanding (strongly recommended)>",`,
  `  "todo": [ { "name": "<new dim>", "rationale": "<why>" } ],  // CREATE_TODO only`,
  `  "clarifyOptions": ["<opt1>", "<opt2>"]                       // CLARIFY only`,
  `}`,
  `\`\`\``,
  ``,
  `## Decision rules:`,
  `- User proposes a new research angle/task → CREATE_TODO (1-3 new dimensions, no overlap)`,
  `- User asks about current mission / report → DIRECT_ANSWER`,
  `- User intent is ambiguous → CLARIFY (2-4 clarifyOptions)`,
  `- User just acknowledges / thanks → ACKNOWLEDGE`,
  ``,
  `## CREATE_TODO notes:`,
  `- Only suggest when mission status = running (other states will be rejected by frontend)`,
  `- New dim must NOT overlap with existing ## Dimensions plan`,
  `- name short (≤ 8 words), rationale 1-2 sentences`,
  ``,
  `## Style: concise, professional, evidence-based; cite specifics; response in English.`,
].join("\n");
