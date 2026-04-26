/**
 * AgentRunner — DX 层的统一运行入口
 *
 * 业务方写：
 *   const result = await this.runner.run(MyAgent, input);
 *   for await (const ev of this.runner.stream(MyAgent, input)) { ... }
 *
 * 内部：
 *   1. readDefineAgentMeta(ctor) → 取 spec 元数据
 *   2. instantiate ctor → 拿 buildSystemPrompt / validateBusinessRules / stubFn
 *   3. 组装 IAgentSpec → factory.create → agent.execute
 *   4. 流模式：直接 yield agent 事件
 *      Run 模式：drain 事件流，提取最后 output；用 outputSchema parse
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import type { z } from "zod";
import { AgentFactory } from "../core/agent-factory";
import { AgentIdentity } from "../core/agent-identity";
import type {
  IAgent,
  IAgentEvent,
  IAgentIdentity,
  IAgentSpec,
  IRuntimeEnvironment,
} from "../abstractions";
import { ToolRegistry } from "../../tools/registry/tool-registry";
import { SkillRegistry } from "../skills";
import { BillingContext } from "../../../ai-infra/credits/billing-context";
import {
  readDefineAgentMeta,
  AgentSpec,
  type DefineAgentOptions,
} from "./agent-spec.base";
import { describeOutputSchemaForLlm } from "./zod-schema-prompt";

export interface RunResult<TOutput> {
  readonly output: TOutput;
  readonly state: "completed" | "failed" | "cancelled";
  readonly events: readonly IAgentEvent[];
  readonly iterations: number;
  readonly wallTimeMs: number;
  readonly agent: IAgent;
}

/**
 * Harness 自闭包运行选项 —— Agent 不感知环境/账单/能力发现，全由 Runner 负责。
 *
 *  - userId         → 自动包 BillingContext.run({userId, ...})，下游 LLM 调用走该用户 BYOK
 *  - workspaceId    → 同上，BillingContext metadata
 *  - environment    → 自动调 getByokStatus / getCreditState / listAvailableModels
 *                     拼成 <environment> block 注入 systemPrompt
 *  - exposeCatalog  → 默认 true：把 @DefineAgent({tools, skills}) 声明的能力 + 描述
 *                     拼成 <available_tools> / <available_skills> block 注入 systemPrompt
 *  - onMissingByok  → 'fail' = BYOK 缺失立刻 throw；'warn' = 记录但继续；'allow'(默认) = 走平台 key
 *  - onEvent        → per-iteration 事件回调（实时 relay 用）
 *  - billingMeta    → BillingContext 元数据（moduleType / operationType / referenceId）
 */
export interface RunOptions {
  readonly userId?: string;
  readonly workspaceId?: string;
  readonly environment?: IRuntimeEnvironment;
  readonly exposeCatalog?: boolean;
  readonly onMissingByok?: "fail" | "warn" | "allow";
  readonly onEvent?: (ev: IAgentEvent) => void | Promise<void>;
  readonly billingMeta?: {
    moduleType?: string;
    operationType?: string;
    referenceId?: string;
  };
  /**
   * 缩放 @DefineAgent.budget.maxTokens / maxIterations 的倍率（默认 1.0）。
   * 业务方传入即可让 mission 级 "low/medium/high/unlimited" 档位生效，
   * 不需要改 spec class。Harness 在 buildIdentity 时套用倍率。
   */
  readonly budgetMultiplier?: number;
}

export class DefineAgentMissingError extends Error {
  constructor(name: string) {
    super(
      `[${name}] @DefineAgent metadata not found — class must be decorated with @DefineAgent({...})`,
    );
    this.name = "DefineAgentMissingError";
  }
}

export class InputValidationError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly issues: string,
  ) {
    super(`[${agentId}] input failed schema validation: ${issues}`);
    this.name = "InputValidationError";
  }
}

export class ByokRequiredError extends Error {
  readonly code = "BYOK_REQUIRED";
  constructor(
    public readonly userId: string,
    public readonly agentId: string,
  ) {
    super(
      `[${agentId}] BYOK key required for user ${userId} — set onMissingByok:'allow' to use platform key, or have user configure a personal key.`,
    );
    this.name = "ByokRequiredError";
  }
}

@Injectable()
export class AgentRunner {
  private readonly logger = new Logger(AgentRunner.name);

  constructor(
    private readonly factory: AgentFactory,
    @Optional() private readonly toolRegistry?: ToolRegistry,
    @Optional() private readonly skillRegistry?: SkillRegistry,
  ) {}

  /**
   * 一次性执行：drain 事件流并返回最后输出（强类型）。
   *
   * 第三参数支持两种形态（向后兼容）：
   *   - function: 视为 onEvent 回调（旧调用方式）
   *   - RunOptions 对象: 完整环境感知（推荐 — 自动 BYOK 预检 + env block + BillingContext）
   */
  async run<T extends new () => AgentSpec<z.ZodType, z.ZodType>>(
    Spec: T,
    input: z.input<NonNullable<DefineAgentOptions["inputSchema"]>>,
    optsOrOnEvent?: RunOptions | ((ev: IAgentEvent) => void | Promise<void>),
  ): Promise<RunResult<unknown>> {
    const opts: RunOptions =
      typeof optsOrOnEvent === "function"
        ? { onEvent: optsOrOnEvent }
        : (optsOrOnEvent ?? {});

    const startMs = Date.now();
    const meta = readDefineAgentMeta(Spec);
    if (!meta) throw new DefineAgentMissingError(Spec.name);

    // ── BYOK 预检（fail-fast，免得跑到第一次 chat 才 503）──
    await this.precheckByok(opts, meta.id);

    // ── 装配增强 systemPrompt blocks（环境 + 能力目录）──
    const augmentBlocks = await this.collectAugmentBlocks(meta, opts);

    const { agent, instance, parsedInput } = this.materialize(
      Spec,
      input,
      meta,
      augmentBlocks,
      opts.budgetMultiplier,
      opts.userId,
      opts.workspaceId,
      opts.environment,
    );

    // ── 自动包 BillingContext（如果 userId 已知）──
    const work = async () =>
      this.drainEvents(agent, instance, parsedInput, meta, opts.onEvent);

    // BillingContext 嵌套规则：
    //   - 外层（业务方 controller / interceptor / orchestrator）已包了 → 不动，沿用
    //   - 没有外层 → 用 RunOptions 给的 billingMeta 自行包一层
    // 否则内层会覆盖外层的 moduleType/operationType, credits.consumeCredits()
    // 找不到对应 CreditRule，导致计费走 ADJUSTMENT fallback。
    const existingBilling = BillingContext.get();
    const billingMeta = opts.billingMeta ?? {};
    const needsWrap = opts.userId && !existingBilling;
    const { events, state, lastOutput, iterations } = needsWrap
      ? await BillingContext.run(
          {
            userId: opts.userId,
            moduleType: billingMeta.moduleType ?? "harness",
            operationType: billingMeta.operationType ?? meta.id,
            referenceId: billingMeta.referenceId,
          },
          work,
        )
      : await work();

    // outputSchema 校验（DX 层兜底；LlmExecutor 已在内部 self-heal —— 这里是最终断言）
    let finalOutput: unknown = lastOutput;
    let finalState = state;
    if (meta.outputSchema) {
      // ReActLoop.finalize 经常把 LLM 输出原样塞回 output 字段；当 LLM 把
      // 对象 stringify 后传出（{"output": "{\"key\":..."}"}），此处 safeParse
      // 会因为类型是 string 而失败。先尝试 JSON.parse 一次，再做 schema 校验。
      let candidate = finalOutput;
      if (typeof candidate === "string") {
        const trimmed = candidate.trim();
        if (
          (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
          (trimmed.startsWith("[") && trimmed.endsWith("]"))
        ) {
          try {
            candidate = JSON.parse(trimmed);
          } catch {
            // keep original — schema parse will fail and mark state=failed
          }
        }
      }
      const parsed = meta.outputSchema.safeParse(candidate);
      if (!parsed.success) {
        // Don't throw — preserve partial output for diagnosis; mark failed
        finalState = "failed";
        // ★ 关键：检查是否已有更内层的结构化 error event。
        // 内层 ReActLoop / ReflexionLoop 已 emit 真根因（PARSE_* /
        // LOOP_REASONING_COT_EXHAUSTION / LOOP_BUDGET_EXHAUSTED 等），那里才是
        // 真因 —— output 是 null/undefined/"" 是它的**症状**，不是另一个独立故障。
        // 倒序扫到 origin error 就跳过 RUNNER_OUTPUT_SCHEMA_MISMATCH 的 push，
        // 否则 orchestrator.extractAgentFailureDiagnostic 倒序取的是 schema diff
        // 这条**派生错误**，把真因（empty LLM / parse / budget）淹没掉。
        const hasUpstreamFailure = events.some(
          (ev) =>
            ev.type === "error" &&
            !!(ev.payload as { failureCode?: string } | null)?.failureCode,
        );
        // 只有 candidate 是真值（非 null/undefined/空字符串）时，schema mismatch
        // 才是独立失败；null/undefined/"" 一定是上层 loop 没产 output 引起的派生。
        const candidateIsMeaningful =
          candidate != null &&
          !(typeof candidate === "string" && candidate.trim() === "");

        if (hasUpstreamFailure && !candidateIsMeaningful) {
          this.logger.debug(
            `[${meta.id}] suppressing RUNNER_OUTPUT_SCHEMA_MISMATCH ` +
              `(candidate=${candidate === null ? "null" : typeof candidate}, ` +
              `upstream error already emitted)`,
          );
        } else {
          // ★ 全链路诊断：把 zod schema diff 注入 events 流，让 trace 可见
          // outputSchema 期望 vs 实际 output 的差异。
          const schemaError = parsed.error.issues
            .map(
              (iss) =>
                `${iss.path.join(".") || "<root>"}: ${iss.message} (code=${iss.code})`,
            )
            .join("; ");
          const candidateSnippet =
            typeof candidate === "string"
              ? candidate.slice(0, 500)
              : JSON.stringify(candidate).slice(0, 500);
          events.push({
            type: "error",
            agentId: agent.id,
            timestamp: Date.now(),
            payload: {
              message: `Output schema validation failed: ${schemaError}`,
              recoverable: false,
              failureCode: "RUNNER_OUTPUT_SCHEMA_MISMATCH",
              diagnostic: {
                schemaError,
                actualOutputSnippet: candidateSnippet,
                actualOutputType: typeof candidate,
                specId: meta.id,
                hasUpstreamFailure,
              },
            },
          });
        }
      } else {
        finalOutput = parsed.data;
      }
    }

    return {
      output: finalOutput,
      state: finalState,
      events,
      iterations,
      wallTimeMs: Date.now() - startMs,
      agent,
    };
  }

  /**
   * 流模式：直接 yield agent 事件。
   * 业务 Controller 直接 SSE/WebSocket 转发。
   *
   * 与 run() 一致地接受 RunOptions：BYOK 预检 / BillingContext 包装 /
   * environment block 注入 / catalog block 注入 全部生效。
   * onEvent 会在每个事件 yield 之前被调用（保持向后兼容的回调时序）。
   */
  async *stream<T extends new () => AgentSpec<z.ZodType, z.ZodType>>(
    Spec: T,
    input: z.input<NonNullable<DefineAgentOptions["inputSchema"]>>,
    opts: RunOptions = {},
  ): AsyncIterable<IAgentEvent> {
    const meta = readDefineAgentMeta(Spec);
    if (!meta) throw new DefineAgentMissingError(Spec.name);

    // ── BYOK 预检（与 run() 同逻辑）──
    await this.precheckByok(opts, meta.id);

    // ── 装配 systemPrompt 增强 block（环境 + 能力目录）──
    const augmentBlocks = await this.collectAugmentBlocks(meta, opts);

    const { agent, instance, parsedInput } = this.materialize(
      Spec,
      input,
      meta,
      augmentBlocks,
      opts.budgetMultiplier,
      opts.userId,
      opts.workspaceId,
      opts.environment,
    );

    const inputForExec: Record<string, unknown> | string = parsedInput as
      | Record<string, unknown>
      | string;
    const goal =
      instance.buildUserPrompt?.({
        input: parsedInput,
        identity: agent.identity,
      }) ??
      (typeof parsedInput === "string"
        ? parsedInput
        : JSON.stringify(parsedInput));

    // ── BillingContext 包装（嵌套规则同 run()）──
    const existingBilling = BillingContext.get();
    const needsWrap = opts.userId && !existingBilling;

    if (!needsWrap) {
      // 直接 yield —— 外层已经包了 BillingContext 或 不需要
      for await (const ev of agent.execute({ goal, input: inputForExec })) {
        if (opts.onEvent) {
          try {
            await opts.onEvent(ev);
          } catch {
            // swallow — 不能拖死 stream
          }
        }
        yield ev;
      }
      return;
    }

    // 需要包 BillingContext —— 用 generator runner 模式
    // ALS.run 不能直接包 async generator，所以把 ALS 上下文绑到一个内部
    // 中转 Promise + Channel 模式过于复杂；这里采用更直接的方案：
    // 用 BillingContext.run 包一个 collector 把所有事件先 push 到 buffer，
    // 然后 yield。但这就退化成了 run() 行为，失去 streaming。
    //
    // 折中：当业务方用 stream() 且需要包 BillingContext 时，建议用 run()。
    // 这里 fallback 为：runner 不包，让 caller 自己包外层。
    this.logger.warn(
      `[${meta.id}] stream() with userId but no outer BillingContext — caller should wrap BillingContext.run() manually for accurate billing`,
    );
    for await (const ev of agent.execute({ goal, input: inputForExec })) {
      if (opts.onEvent) {
        try {
          await opts.onEvent(ev);
        } catch {
          // swallow
        }
      }
      yield ev;
    }
  }

  // ─── private ────────────────────────────────────────────

  /** 跑 agent 事件循环，per-iteration 触发 onEvent，返回汇总。 */
  private async drainEvents(
    agent: IAgent,
    instance: AgentSpec<z.ZodType, z.ZodType>,
    parsedInput: unknown,
    _meta: DefineAgentOptions,
    onEvent?: (ev: IAgentEvent) => void | Promise<void>,
  ): Promise<{
    events: IAgentEvent[];
    state: RunResult<unknown>["state"];
    lastOutput: unknown;
    iterations: number;
  }> {
    const events: IAgentEvent[] = [];
    let state: RunResult<unknown>["state"] = "completed";
    let lastOutput: unknown = null;
    let iterations = 0;

    for await (const ev of agent.execute({
      goal:
        instance.buildUserPrompt?.({
          input: parsedInput,
          identity: agent.identity,
        }) ??
        (typeof parsedInput === "string"
          ? parsedInput
          : JSON.stringify(parsedInput)),
      input: parsedInput as Record<string, unknown> | string,
    })) {
      events.push(ev);
      if (ev.type === "action_executed") iterations += 1;
      if (ev.type === "output") {
        lastOutput = (ev.payload as { output: unknown }).output;
      }
      if (ev.type === "terminated") {
        const reason = (ev.payload as { reason?: string }).reason;
        if (reason === "error") state = "failed";
        else if (reason === "cancelled") state = "cancelled";
      }
      if (onEvent) {
        try {
          await onEvent(ev);
        } catch {
          // swallow — relay 失败不能拖死主流程
        }
      }
    }

    return { events, state, lastOutput, iterations };
  }

  /** BYOK 预检：onMissingByok 策略下检查并 throw / warn / 放行 */
  private async precheckByok(opts: RunOptions, agentId: string): Promise<void> {
    if (!opts.userId || !opts.environment) return;
    const policy = opts.onMissingByok ?? "allow";
    if (policy === "allow") return;
    try {
      const byok = await opts.environment.getByokStatus();
      if (byok === "platform") {
        if (policy === "fail") {
          throw new ByokRequiredError(opts.userId, agentId);
        }
        this.logger.warn(
          `[${agentId}] BYOK missing for user ${opts.userId}; running with platform key (onMissingByok=warn)`,
        );
      }
    } catch (e) {
      if (e instanceof ByokRequiredError) throw e;
      this.logger.warn(
        `[${agentId}] BYOK precheck failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** 收集要追加到 systemPrompt 的 augment block：environment + tool/skill catalog */
  private async collectAugmentBlocks(
    meta: DefineAgentOptions,
    opts: RunOptions,
  ): Promise<string[]> {
    const blocks: string[] = [];
    if (opts.environment) {
      const envBlock = await this.buildEnvironmentBlock(opts.environment);
      if (envBlock) blocks.push(envBlock);
    }
    if (opts.exposeCatalog !== false) {
      const catalogBlock = this.buildCatalogBlock(meta.tools, meta.skills);
      if (catalogBlock) blocks.push(catalogBlock);
    }
    return blocks;
  }

  /**
   * <environment> block — Harness 自动注入到 systemPrompt。
   * Agent 不需要自己查 BYOK / 余额 / 模型池。
   */
  private async buildEnvironmentBlock(
    env: IRuntimeEnvironment,
  ): Promise<string | null> {
    try {
      const [byok, credit, models] = await Promise.all([
        env.getByokStatus().catch(() => null),
        env.getCreditState().catch(() => null),
        env.listAvailableModels().catch(() => null),
      ]);
      const lines: string[] = ["<environment>"];
      if (byok) {
        lines.push(
          `- byok: ${byok}  (personal=user-key / donated=shared / platform=fallback)`,
        );
      }
      if (credit) {
        lines.push(
          `- credits: balance=${credit.balance} soft=${credit.softLimit ?? "—"} hard=${credit.hardLimit ?? "—"}${credit.currency ? ` ${credit.currency}` : ""}`,
        );
      }
      if (models && models.length > 0) {
        const healthy = models.filter((m) => m.available);
        const sample = healthy
          .slice(0, 8)
          .map((m) => m.modelId)
          .join(", ");
        lines.push(
          `- models: ${healthy.length}/${models.length} available — ${sample}${healthy.length > 8 ? ", …" : ""}`,
        );
      }
      lines.push("</environment>");
      return lines.length > 2 ? lines.join("\n") : null;
    } catch (e) {
      this.logger.warn(
        `buildEnvironmentBlock failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /**
   * <available_tools> + <available_skills> block — 仅列该 Agent
   * @DefineAgent({tools, skills}) 显式声明的能力，附 description。
   * Agent 不需要自己查 ToolRegistry。
   */
  private buildCatalogBlock(
    declaredTools?: readonly string[],
    declaredSkills?: readonly string[],
  ): string | null {
    const blocks: string[] = [];
    if (declaredTools && declaredTools.length > 0 && this.toolRegistry) {
      const lines: string[] = ["<available_tools>"];
      for (const id of declaredTools) {
        const def = this.toolRegistry.tryGet(id);
        const desc = def?.description?.trim();
        lines.push(`- ${id}${desc ? `: ${desc}` : ""}`);
      }
      lines.push("</available_tools>");
      blocks.push(lines.join("\n"));
    }
    if (declaredSkills && declaredSkills.length > 0 && this.skillRegistry) {
      const lines: string[] = ["<available_skills>"];
      for (const id of declaredSkills) {
        const def = this.skillRegistry.get(id);
        const desc = def?.frontmatter?.description?.trim();
        lines.push(`- ${id}${desc ? `: ${desc}` : ""}`);
      }
      lines.push("</available_skills>");
      blocks.push(lines.join("\n"));
    }
    return blocks.length > 0 ? blocks.join("\n\n") : null;
  }

  private materialize<T extends new () => AgentSpec<z.ZodType, z.ZodType>>(
    Spec: T,
    input: unknown,
    meta: DefineAgentOptions,
    augmentBlocks: readonly string[],
    budgetMultiplier?: number,
    /** ★ Critical: 这三个是从 RunOptions 透传到 envelope 的运行时环境信息。
     *  缺失会导致 envelope.memory.userId=undefined（BYOK 解析断链）+
     *  envelope.runtimeEnv=undefined（ReActLoop 的 model 可用性环境感知永远跳过）。 */
    userId?: string,
    workspaceId?: string,
    runtimeEnv?: IRuntimeEnvironment,
  ): {
    agent: IAgent;
    instance: AgentSpec<z.ZodType, z.ZodType>;
    parsedInput: unknown;
  } {
    const instance = new Spec();

    // 1. Validate input
    let parsedInput: unknown = input;
    if (meta.inputSchema) {
      const parsed = meta.inputSchema.safeParse(input);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        throw new InputValidationError(meta.id, issues);
      }
      parsedInput = parsed.data;
    }

    // 2. Build identity（按 budgetMultiplier 缩放 budget.maxTokens / maxIterations）
    const identity = this.buildIdentity(meta, budgetMultiplier);

    // 3. Compose IAgentSpec for factory
    // 自动把 outputSchema 形状 + Harness 自动注入的环境/能力 block 拼到 systemPrompt
    const schemaBlock = describeOutputSchemaForLlm(meta.outputSchema);
    const augmentTail =
      augmentBlocks.length > 0 ? augmentBlocks.join("\n\n") : null;
    const appendBlocks = (base: string | undefined): string | undefined => {
      const b = (base ?? "").trim();
      const parts: string[] = [];
      if (b) parts.push(b);
      if (schemaBlock) parts.push(schemaBlock);
      if (augmentTail) parts.push(augmentTail);
      return parts.length > 0 ? parts.join("\n\n") : base;
    };
    const buildSystemPromptFn = instance.buildSystemPrompt
      ? (ctx: { input: unknown; identity: IAgentIdentity }) =>
          appendBlocks(
            instance.buildSystemPrompt!({
              input: ctx.input as never,
              identity: ctx.identity,
            }),
          ) ?? ""
      : undefined;
    const buildUserPromptFn = instance.buildUserPrompt
      ? (ctx: { input: unknown; identity: IAgentIdentity }) =>
          instance.buildUserPrompt!({
            input: ctx.input as never,
            identity: ctx.identity,
          })
      : undefined;
    const validateFn = instance.validateBusinessRules
      ? (output: unknown, ctx: { input: unknown; identity: IAgentIdentity }) =>
          instance.validateBusinessRules!(output as never, {
            input: ctx.input as never,
            identity: ctx.identity,
          })
      : undefined;
    const stubFn = instance.stubFn
      ? (ctx: { input: unknown; identity: IAgentIdentity }) =>
          instance.stubFn!({
            input: ctx.input as never,
            identity: ctx.identity,
          }) as Promise<unknown>
      : undefined;

    const agentSpec: IAgentSpec = {
      identity,
      loop: meta.loop,
      systemPrompt: appendBlocks(
        meta.systemPrompt ??
          (buildSystemPromptFn
            ? buildSystemPromptFn({ input: parsedInput, identity })
            : undefined),
      ),
      taskProfile: meta.taskProfile,
      outputSchema: meta.outputSchema,
      validateBusinessRules: validateFn,
      stubFn,
      buildSystemPrompt: buildSystemPromptFn,
      buildUserPrompt: buildUserPromptFn,
      // ★ 关键透传 —— factory 用这些 build envelope.memory + envelope.runtimeEnv，
      //   ReActLoop 才能：
      //   (a) chat({ userId }) 命中用户 BYOK 默认模型 / API key
      //   (b) 调 envelope.runtimeEnv.getModelAvailability() 做环境感知 fallback
      //   (c) 调 envelope.runtimeEnv.suggestFallback() 做 budget 耗尽时的降级建议
      userId,
      workspaceId,
      runtimeEnv,
    };

    const agent = this.factory.create(agentSpec);
    return { agent, instance, parsedInput };
  }

  private buildIdentity(
    meta: DefineAgentOptions,
    budgetMultiplier = 1.0,
  ): IAgentIdentity {
    const mult = Math.max(0.1, budgetMultiplier);
    const scale = (n: number | undefined): number | undefined =>
      n == null ? undefined : Math.round(n * mult);
    const id = meta.identity;
    // Detect already-complete IAgentIdentity (has .role.id with name)
    const isFull =
      typeof (id as IAgentIdentity).role === "object" &&
      typeof ((id as IAgentIdentity).role as { id?: string }).id === "string";
    if (isFull) {
      // augment with tools/forbiddenTools/skills from meta
      const full = id as IAgentIdentity;
      return new AgentIdentity({
        ...full,
        tools: meta.tools ?? full.tools,
        forbiddenTools: meta.forbiddenTools ?? full.forbiddenTools,
        skills: meta.skills ?? full.skills,
        constraints: {
          ...full.constraints,
          maxTokens:
            scale(meta.budget?.maxTokens) ?? full.constraints?.maxTokens,
          maxIterations:
            scale(meta.budget?.maxIterations) ??
            full.constraints?.maxIterations,
          maxWallTimeMs:
            scale(meta.budget?.maxWallTimeMs) ??
            full.constraints?.maxWallTimeMs,
        },
      });
    }
    // Shorthand path
    const sh = id as {
      role: string | { id: string; name: string; description?: string };
      persona?: IAgentIdentity["persona"];
      description?: string;
    };
    const role =
      typeof sh.role === "string"
        ? {
            id: sh.role,
            name: sh.role,
            description: sh.description ?? "",
          }
        : { ...sh.role, description: sh.role.description ?? "" };
    return new AgentIdentity({
      role,
      persona: sh.persona,
      tools: meta.tools,
      forbiddenTools: meta.forbiddenTools,
      skills: meta.skills,
      constraints: {
        maxTokens: scale(meta.budget?.maxTokens),
        maxIterations: scale(meta.budget?.maxIterations),
        maxWallTimeMs: scale(meta.budget?.maxWallTimeMs),
      },
    });
  }
}
