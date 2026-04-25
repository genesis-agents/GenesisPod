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

import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import { AgentFactory } from "../core/agent-factory";
import { AgentIdentity } from "../core/agent-identity";
import type {
  IAgent,
  IAgentEvent,
  IAgentIdentity,
  IAgentSpec,
} from "../abstractions";
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

@Injectable()
export class AgentRunner {
  constructor(private readonly factory: AgentFactory) {}

  /**
   * 一次性执行：drain 事件流并返回最后输出（强类型）。
   */
  async run<T extends new () => AgentSpec<z.ZodType, z.ZodType>>(
    Spec: T,
    input: z.input<NonNullable<DefineAgentOptions["inputSchema"]>>,
  ): Promise<RunResult<unknown>> {
    const startMs = Date.now();
    const { agent, meta, instance, parsedInput } = this.materialize(
      Spec,
      input,
    );

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
    }

    // outputSchema 校验（DX 层兜底；LlmExecutor 已在内部 self-heal —— 这里是最终断言）
    if (meta.outputSchema) {
      const parsed = meta.outputSchema.safeParse(lastOutput);
      if (!parsed.success) {
        // Don't throw — preserve partial output for diagnosis; mark failed
        state = "failed";
      } else {
        lastOutput = parsed.data;
      }
    }

    return {
      output: lastOutput,
      state,
      events,
      iterations,
      wallTimeMs: Date.now() - startMs,
      agent,
    };
  }

  /**
   * 流模式：直接 yield agent 事件。
   * 业务 Controller 直接 SSE/WebSocket 转发。
   */
  async *stream<T extends new () => AgentSpec<z.ZodType, z.ZodType>>(
    Spec: T,
    input: z.input<NonNullable<DefineAgentOptions["inputSchema"]>>,
  ): AsyncIterable<IAgentEvent> {
    const { agent, instance, parsedInput } = this.materialize(Spec, input);
    yield* agent.execute({
      goal:
        instance.buildUserPrompt?.({
          input: parsedInput,
          identity: agent.identity,
        }) ??
        (typeof parsedInput === "string"
          ? parsedInput
          : JSON.stringify(parsedInput)),
      input: parsedInput as Record<string, unknown> | string,
    });
  }

  // ─── private ────────────────────────────────────────────

  private materialize<T extends new () => AgentSpec<z.ZodType, z.ZodType>>(
    Spec: T,
    input: unknown,
  ): {
    agent: IAgent;
    meta: DefineAgentOptions;
    instance: AgentSpec<z.ZodType, z.ZodType>;
    parsedInput: unknown;
  } {
    const meta = readDefineAgentMeta(Spec);
    if (!meta) throw new DefineAgentMissingError(Spec.name);

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

    // 2. Build identity
    const identity = this.buildIdentity(meta);

    // 3. Compose IAgentSpec for factory
    // 自动把 outputSchema 形状注入 systemPrompt —— 让 LLM 在 finalize 时
    // 知道精确字段名，避免"猜字段"导致 Zod 校验失败 → state=failed
    const schemaBlock = describeOutputSchemaForLlm(meta.outputSchema);
    const appendSchema = (base: string | undefined): string | undefined => {
      const b = (base ?? "").trim();
      if (!schemaBlock) return base;
      return b ? `${b}\n\n${schemaBlock}` : schemaBlock;
    };
    const buildSystemPromptFn = instance.buildSystemPrompt
      ? (ctx: { input: unknown; identity: IAgentIdentity }) =>
          appendSchema(
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
      systemPrompt: appendSchema(
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
    };

    const agent = this.factory.create(agentSpec);
    return { agent, meta, instance, parsedInput };
  }

  private buildIdentity(meta: DefineAgentOptions): IAgentIdentity {
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
          maxTokens: meta.budget?.maxTokens ?? full.constraints?.maxTokens,
          maxIterations:
            meta.budget?.maxIterations ?? full.constraints?.maxIterations,
          maxWallTimeMs:
            meta.budget?.maxWallTimeMs ?? full.constraints?.maxWallTimeMs,
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
        maxTokens: meta.budget?.maxTokens,
        maxIterations: meta.budget?.maxIterations,
        maxWallTimeMs: meta.budget?.maxWallTimeMs,
      },
    });
  }
}
