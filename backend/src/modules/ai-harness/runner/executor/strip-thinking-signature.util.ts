/**
 * strip-thinking-signature.util — 跨 provider failover 时剥离 provider-specific
 * 的 thinking / signature / redacted_thinking 字段。
 *
 * 背景（Claude Code 反向洞察 #6，query.ts:925-929）：
 *   thinking block 的 `signature` 与具体模型/provider 绑定。把上一轮某个
 *   provider（如 Anthropic）产出的 assistant thinking block 原样回灌给另一个
 *   provider（failover 后切到的新模型），跨模型 / 跨 provider 重发会被对端
 *   确定性拒绝（HTTP 400 invalid_request）。
 *
 * 规则：
 *   - 仅当 fromProvider !== toProvider（真正跨 provider）才剥离；同 provider 保留。
 *   - 剥离的字段：
 *       · 消息顶层的 thinking / signature / reasoning / redacted_thinking
 *       · contentParts / content 数组里 type === "thinking" | "redacted_thinking"
 *         的 block（整块删除）
 *       · 任意 content block 内残留的 signature 字段
 *
 * 纯函数：不修改入参，返回新数组 / 新对象（仅在确有改动的消息上克隆，保 prompt
 * cache 友好——未改动的消息原样透传）。
 */

/** provider-specific 推理字段的字符串字面量集合（用于顶层字段剥离）。 */
const PROVIDER_THINKING_KEYS = [
  "thinking",
  "signature",
  "reasoning",
  "redacted_thinking",
] as const;

/** content block 中代表"推理"的类型（整块剥离）。 */
const THINKING_BLOCK_TYPES = new Set(["thinking", "redacted_thinking"]);

/**
 * 宽松的消息形状：ChatMessage 当前不声明 thinking/signature，但未来 provider
 * 适配可能挂上这些字段。用 index signature 让 util 在不耦合具体类型的前提下处理。
 */
type LooseMessage = Record<string, unknown>;

/** 判断一个值是否是带 type 的 content block 对象。 */
function isBlock(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 剥离单个 content block 内的 signature 字段；type 为 thinking/redacted_thinking
 * 的块返回 null（调用方负责整块删除）。返回 [block, changed]。
 */
function stripBlock(block: unknown): { keep: unknown; changed: boolean } {
  if (!isBlock(block)) return { keep: block, changed: false };
  const type = typeof block.type === "string" ? block.type : undefined;
  if (type && THINKING_BLOCK_TYPES.has(type)) {
    return { keep: null, changed: true };
  }
  if ("signature" in block) {
    const { signature: _signature, ...rest } = block;
    void _signature;
    return { keep: rest, changed: true };
  }
  return { keep: block, changed: false };
}

/**
 * 处理一个 content block 数组：删除 thinking/redacted_thinking 块、剥离块内
 * signature。返回 [newArray, changed]；未改动时返回原数组。
 */
function stripBlockArray(arr: unknown[]): {
  result: unknown[];
  changed: boolean;
} {
  let changed = false;
  const result: unknown[] = [];
  for (const block of arr) {
    const { keep, changed: blockChanged } = stripBlock(block);
    if (blockChanged) changed = true;
    if (keep !== null) result.push(keep);
  }
  return changed ? { result, changed } : { result: arr, changed: false };
}

/** 剥离单条消息的 provider-specific thinking/signature 字段。 */
function stripMessage(message: LooseMessage): LooseMessage {
  let changed = false;
  const next: LooseMessage = { ...message };

  // 1) 顶层 thinking / signature / reasoning / redacted_thinking
  for (const key of PROVIDER_THINKING_KEYS) {
    if (key in next) {
      delete next[key];
      changed = true;
    }
  }

  // 2) content 数组形态（部分 provider 用 content: Block[]）
  if (Array.isArray(next.content)) {
    const { result, changed: c } = stripBlockArray(next.content);
    if (c) {
      next.content = result;
      changed = true;
    }
  }

  // 3) contentParts 数组形态（项目内统一多模态字段）
  if (Array.isArray(next.contentParts)) {
    const { result, changed: c } = stripBlockArray(next.contentParts);
    if (c) {
      next.contentParts = result;
      changed = true;
    }
  }

  return changed ? next : message;
}

/**
 * 跨 provider failover 前剥离 messages 中的 provider-specific thinking/signature。
 *
 * @param messages     待发送的消息数组（任意带 role/content 的对象数组）
 * @param fromProvider 上一轮（产出 thinking 的）模型 provider，如 "anthropic"
 * @param toProvider   failover 切到的新模型 provider，如 "openai"
 * @returns            剥离后的新数组（同 provider 时原样返回）
 */
export function stripThinkingSignature<T extends LooseMessage>(
  messages: ReadonlyArray<T>,
  fromProvider: string | undefined,
  toProvider: string | undefined,
): T[] {
  // 同 provider（或任一未知）→ signature 仍然有效，原样保留。
  const from = (fromProvider ?? "").trim().toLowerCase();
  const to = (toProvider ?? "").trim().toLowerCase();
  if (!from || !to || from === to) {
    return messages.slice();
  }

  return messages.map((m) => stripMessage(m) as T);
}
