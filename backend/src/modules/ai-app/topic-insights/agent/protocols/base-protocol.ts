/**
 * Topic Insights Protocols · base utilities
 *
 * 归属：L3 ai-app/topic-insights/agent/protocols/
 *
 * 所有 topic-insights protocol 共用的 action parser + result summary helper。
 */

import type {
  AgentAction,
  AgentTask,
  Message,
} from "@/modules/ai-engine/harness/runtime";
import type { ResearchTaskMetadata } from "../adapters/research-task-metadata";

/**
 * 从 LLM 输出解析 action。
 * 优先 toolCalls[0] → think_more（含 [DONE] 标记则 done）
 */
export function parseActionFromLLM(llmOut: {
  content: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    id: string;
  }>;
}): AgentAction {
  if (llmOut.toolCalls && llmOut.toolCalls.length > 0) {
    const first = llmOut.toolCalls[0];
    return {
      kind: "tool_call",
      tool: first.name,
      args: first.args,
      toolCallId: first.id,
    };
  }
  const content = llmOut.content.trim();
  if (/\[DONE\]|<\/done>|<\/finalize>/i.test(content)) {
    return { kind: "done", rationale: content.slice(0, 200) };
  }
  if (/\[NEED_HUMAN\]|<need_human>/i.test(content)) {
    return { kind: "need_human", question: content.slice(0, 500) };
  }
  return { kind: "think_more", thought: content };
}

/**
 * 构造标准化的初始 user message（所有 protocol 通用格式）
 */
export function buildStandardInitialMessage(
  task: AgentTask<ResearchTaskMetadata>,
  systemPrompt: string,
): Message[] {
  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: [
        `任务 ID: ${task.id}`,
        `类型: ${task.type}`,
        `标题: ${task.title}`,
        `描述: ${task.description}`,
        task.metadata.dimensionName
          ? `维度: ${task.metadata.dimensionName}`
          : "",
        task.metadata.skills && task.metadata.skills.length > 0
          ? `可用技能: ${task.metadata.skills.join(", ")}`
          : "",
        task.metadata.tools && task.metadata.tools.length > 0
          ? `可用工具: ${task.metadata.tools.join(", ")}`
          : "",
        "",
        `请用 ReAct 循环完成此任务。每轮思考后，选择调用一个工具（tool_call）`,
        `或输出 [DONE] 结束。严格按工具 function-calling schema 提供参数。`,
        `全部工作完成且充分收集了足够信息后，输出 [DONE]。`,
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}
