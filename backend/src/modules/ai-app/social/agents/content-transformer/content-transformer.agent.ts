/**
 * ContentTransformerAgent — 跨平台内容适配员
 *
 * S3 transform-for-platform: 标题压缩 / digest 生成 / 字段格式调整。
 * 各平台独立 LLM 调用，role service 层并发。
 */

import { z } from "zod";
import { AgentSpec, DefineAgent } from "@/modules/ai-harness/facade";
import { buildPromptFromDuty } from "../../utils/duty-loader";

const Input = z.object({
  platform: z.string(),
  rawContent: z.object({
    title: z.string(),
    body: z.string(),
    digest: z.string().nullable(),
    coverImageUrl: z.string().nullable(),
  }),
  probeResult: z.object({
    requiredFields: z.array(z.string()),
    schemaVersion: z.string(),
  }),
  qualityBar: z.enum(["quick", "standard", "deep"]),
});

const Output = z.object({
  platform: z.string(),
  title: z.string(),
  digest: z.string().nullable(),
  body: z.string(),
  lengthMetrics: z.object({
    titleChars: z.number().int(),
    digestChars: z.number().int().optional(),
    bodyChars: z.number().int(),
  }),
  transformNotes: z.array(z.string()).default([]),
});

export type ContentTransformerInput = z.infer<typeof Input>;
export type ContentTransformerOutput = z.infer<typeof Output>;

@DefineAgent({
  id: "social.content-transformer",
  version: "1.0.0",
  identity: {
    role: "content-transformer",
    description: "跨平台内容适配 —— 标题压缩 / digest / 字段格式",
  },
  loop: "react",
  toolCategories: [],
  taskProfile: { creativity: "medium", outputLength: "medium" },
  inputSchema: Input,
  outputSchema: Output,
  budget: { maxTokens: 6_000, maxIterations: 2 },
})
export class ContentTransformerAgent extends AgentSpec<
  typeof Input,
  typeof Output
> {
  buildSystemPrompt({ input }: { input: z.infer<typeof Input> }): string {
    return buildPromptFromDuty(
      "content-transformer",
      "transform-for-platform",
      input as unknown as Record<string, unknown>,
    );
  }
}
