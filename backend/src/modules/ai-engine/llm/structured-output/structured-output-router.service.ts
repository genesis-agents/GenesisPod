/**
 * StructuredOutputRouter — 模型 → adapter 路由器
 *
 * 核心承诺：**未在 admin 配置 capability 字段的模型也能跑**，按 provider slug
 * 自动推断默认 strategy + fallback 链。管理员配置 = 覆盖；未配置 = 自动推断。
 *
 * 路由优先级：
 *   1. model.structuredOutputStrategy（admin UI 显式配置）
 *   2. provider 默认推断（PROVIDER_DEFAULT_CHAINS）
 *   3. 最终兜底：['prompt']（任何 provider 都能跑 prompt + post-parse）
 *
 * fallback 行为：
 *   - 由 caller 接管：首选 strategy 失败（schema mismatch / 400 / parse 失败）
 *     按 chain 顺序尝试下一个 strategy，直到成功或链耗尽
 *   - chain 上限保护：最多尝试 4 个 strategy（避免无限循环）
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  AnthropicToolUseAdapter,
  GbnfGrammarAdapter,
  GeminiResponseSchemaAdapter,
  JsonModeAdapter,
  JsonSchemaAdapter,
  JsonSchemaStrictAdapter,
  NoneAdapter,
  PromptOnlyAdapter,
} from "./adapters";
import type { IStructuredOutputAdapter } from "./structured-output-strategy.types";
import {
  isStructuredOutputStrategy,
  STRUCTURED_OUTPUT_STRATEGIES,
  type StructuredOutputStrategy,
} from "./structured-output-strategy.types";

/**
 * 按 provider slug 推断默认 strategy + fallback chain。
 * provider slug 大小写不敏感，覆盖商用 + 本地主流 provider。
 *
 * 选择依据见 sub-agent 调研报告（2026-05-06）：
 *   - OpenAI / Grok / DeepSeek-chat：strict json_schema
 *   - Anthropic：tool_use（无 native json_schema）
 *   - Gemini：responseSchema
 *   - DeepSeek-reasoner：仅 prompt（reasoner 不支持 response_format）
 *   - 本地 / 开源（Ollama / vLLM / Llama.cpp / TGI / LM Studio）：GBNF + prompt
 *   - 其他未知 provider：openai-compatible json_schema → json_mode → prompt
 */
const PROVIDER_DEFAULT_CHAINS: ReadonlyArray<{
  match: (provider: string, modelId: string) => boolean;
  chain: readonly StructuredOutputStrategy[];
}> = [
  // Anthropic
  {
    match: (p) => /anthropic|claude/.test(p),
    chain: ["tool_use", "prompt"],
  },
  // Google Gemini
  {
    match: (p) => /google|gemini/.test(p),
    chain: ["gemini_response_schema", "json_mode", "prompt"],
  },
  // DeepSeek-reasoner（特殊：不支持 response_format）
  {
    match: (p, m) => /deepseek/.test(p) && /reasoner/.test(m),
    chain: ["prompt"],
  },
  // DeepSeek-chat
  {
    match: (p) => /deepseek/.test(p),
    chain: ["json_schema", "json_mode", "prompt"],
  },
  // OpenAI 系（含 GPT-4o / o1 / o3）
  {
    match: (p) => /^openai$/.test(p),
    chain: ["json_schema_strict", "json_schema", "json_mode", "prompt"],
  },
  // xAI Grok
  {
    match: (p) => /^x\.?ai$|^grok$/.test(p),
    chain: ["json_schema_strict", "json_schema", "json_mode", "prompt"],
  },
  // 本地 / 开源
  {
    match: (p) => /ollama|vllm|tgi|llamacpp|llama\.cpp|lmstudio|local/.test(p),
    chain: ["gbnf_grammar", "prompt"],
  },
  // ByteDance Doubao / 火山方舟
  {
    match: (p) => /bytedance|doubao|volc/.test(p),
    chain: ["json_mode", "prompt"],
  },
  // Zhipu GLM
  {
    match: (p) => /zhipu|glm/.test(p),
    chain: ["json_mode", "prompt"],
  },
  // Groq（OpenAI compat hosted Llama / Mixtral）
  {
    match: (p) => /^groq$/.test(p),
    chain: ["json_mode", "prompt"],
  },
  // OpenRouter（聚合，按 modelId 二级判断）
  {
    match: (p, m) => /openrouter/.test(p) && /claude|anthropic/.test(m),
    chain: ["tool_use", "prompt"],
  },
  {
    match: (p, m) => /openrouter/.test(p) && /gemini/.test(m),
    chain: ["gemini_response_schema", "json_mode", "prompt"],
  },
  {
    match: (p) => /openrouter/.test(p),
    chain: ["json_schema", "json_mode", "prompt"],
  },
  // Cohere（generate API 不支持 json_schema，纯 prompt）
  {
    match: (p) => /cohere/.test(p),
    chain: ["prompt"],
  },
];

const FINAL_FALLBACK: readonly StructuredOutputStrategy[] = ["prompt"];

@Injectable()
export class StructuredOutputRouter {
  private readonly logger = new Logger(StructuredOutputRouter.name);
  private readonly adapters: Record<
    StructuredOutputStrategy,
    IStructuredOutputAdapter
  >;

  constructor() {
    const list: IStructuredOutputAdapter[] = [
      new JsonSchemaStrictAdapter(),
      new JsonSchemaAdapter(),
      new AnthropicToolUseAdapter(),
      new JsonModeAdapter(),
      new GeminiResponseSchemaAdapter(),
      new GbnfGrammarAdapter(),
      new PromptOnlyAdapter(),
      new NoneAdapter(),
    ];
    this.adapters = list.reduce(
      (acc, a) => {
        acc[a.strategy] = a;
        return acc;
      },
      {} as Record<StructuredOutputStrategy, IStructuredOutputAdapter>,
    );
  }

  /**
   * 解析模型应使用的 strategy chain。
   *
   * @param model AIModel 行（含可选 structuredOutputStrategy / fallbackStrategies）
   * @returns 按尝试顺序的 strategy 列表（首选 → fallback... → 兜底 prompt）
   */
  resolveChain(model: {
    provider: string;
    modelId: string;
    structuredOutputStrategy?: string | null;
    fallbackStrategies?: string[] | null;
  }): readonly StructuredOutputStrategy[] {
    const out: StructuredOutputStrategy[] = [];
    const seen = new Set<StructuredOutputStrategy>();

    const push = (s: string | null | undefined): void => {
      if (!s || !isStructuredOutputStrategy(s) || seen.has(s)) return;
      out.push(s);
      seen.add(s);
    };

    // 1. admin 配置的首选
    push(model.structuredOutputStrategy);

    // 2. admin 配置的 fallback
    for (const s of model.fallbackStrategies ?? []) push(s);

    // 3. provider 默认推断（如果 admin 未配置，这就是主链路；如果 admin 配置过
    //    但 fallback 不全，这填充剩余）
    if (out.length === 0) {
      const provider = (model.provider ?? "").toLowerCase();
      const modelId = (model.modelId ?? "").toLowerCase();
      const matched = PROVIDER_DEFAULT_CHAINS.find((rule) =>
        rule.match(provider, modelId),
      );
      if (matched) {
        for (const s of matched.chain) push(s);
        this.logger.debug(
          `[resolveChain] model="${model.modelId}" provider="${model.provider}" admin not configured, ` +
            `inferred chain=${matched.chain.join("→")}`,
        );
      } else {
        this.logger.warn(
          `[resolveChain] model="${model.modelId}" provider="${model.provider}" not in PROVIDER_DEFAULT_CHAINS, ` +
            `falling back to ['prompt']. Add this provider to PROVIDER_DEFAULT_CHAINS or configure model in admin UI.`,
        );
      }
    }

    // 4. 最终兜底
    for (const s of FINAL_FALLBACK) push(s);

    return out;
  }

  /** 拿 strategy 对应 adapter 实例 */
  getAdapter(strategy: StructuredOutputStrategy): IStructuredOutputAdapter {
    return this.adapters[strategy];
  }

  /**
   * 返回所有已知 strategy（admin UI 下拉选项用）。
   */
  listStrategies(): readonly StructuredOutputStrategy[] {
    return STRUCTURED_OUTPUT_STRATEGIES;
  }
}
