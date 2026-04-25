import { z } from "zod";

export const RunMissionInputSchema = z.object({
  topic: z.string().min(2).max(200),
  depth: z.enum(["quick", "standard", "deep"]).default("standard"),
  language: z.enum(["zh-CN", "en-US"]).default("zh-CN"),
  /** 上限预算（积分）—— 缺省 300 */
  maxCredits: z.number().int().positive().max(10_000).default(300),
});

export type RunMissionInput = z.infer<typeof RunMissionInputSchema>;

export const ResearchReportSchema = z.object({
  title: z.string().min(2),
  summary: z.string().min(20),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        body: z.string(),
        sources: z.array(z.string().url()).optional(),
      }),
    )
    .min(1),
  conclusion: z.string().min(20),
  citations: z.array(z.string().url()).optional(),
});
export type ResearchReport = z.infer<typeof ResearchReportSchema>;
