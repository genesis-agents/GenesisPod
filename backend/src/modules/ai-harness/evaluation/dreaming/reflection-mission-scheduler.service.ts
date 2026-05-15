/**
 * ReflectionMissionScheduler — PR-I 骨架 2026-05-15
 *
 * Dreaming 调度器：周期性触发反思 mission，从近期失败 mission 抽样归纳通用规则。
 *
 * 设计目标（对齐 Anthropic Managed Agent Dreaming）：
 *   - 不阻塞用户 mission（独立 cron schedule）
 *   - 跨多 mission 归纳（不只是单 mission postmortem）
 *   - 产出可注入的 RuleBase 条目
 *   - 应用效用追踪（applicationCount / successCount）+ 衰减机制
 *
 * 实现现状（骨架）：
 *   - [x] 配置 + 接口定义（dreaming.types.ts）
 *   - [ ] cron 调度 wiring（@Schedule + NestJS Schedule module）
 *   - [ ] 抽样策略实现（stratified by failure_code）
 *   - [ ] critique-agent 调用 → 生成 candidate rules
 *   - [ ] RuleBase Prisma model + 持久化
 *   - [ ] RuleInjector hook 到业务 leader plan（业务 ai-app 侧实现）
 *   - [ ] Admin UI（RuleBase CRUD + 效用统计 dashboard）
 *   - [ ] spec 覆盖（端到端 + 单元）
 *
 * 落地路径：12 天工程，分 4 个子 PR：
 *   - PR-I.1（2 天）：Prisma DreamingRule model + 骨架 service + types（**本 PR 完成**）
 *   - PR-I.2（3 天）：cron 调度 + 抽样策略 + critique-agent 调用 → 生成 rules
 *   - PR-I.3（3 天）：RuleInjector + leader plan hook + 效用追踪
 *   - PR-I.4（4 天）：Admin UI + 端到端 spec + 生产验证
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  DEFAULT_DREAMING_CONFIG,
  DreamingRule,
  DreamingRunResult,
  DreamingSchedulerConfig,
  DreamingTrigger,
  InjectedRuleSet,
} from "./dreaming.types";

@Injectable()
export class ReflectionMissionScheduler {
  private readonly logger = new Logger(ReflectionMissionScheduler.name);
  private config: DreamingSchedulerConfig = DEFAULT_DREAMING_CONFIG;

  constructor() {
    // PR-I.2 将注入 PrismaService / AiChatService / 抽样 service
  }

  /**
   * 手动触发反思（admin endpoint 或测试）。
   * PR-I.2 将接 cron `@Cron(this.config.cronExpression)`。
   */
  async runOnce(trigger: DreamingTrigger): Promise<DreamingRunResult> {
    this.logger.log(
      `[Dreaming] runOnce triggered by ${trigger.kind} (placeholder stub)`,
    );
    // PR-I.2 实现：
    //   1. 抽样 N 个近期失败 mission（按 sampleWindowHours / sampleSize）
    //   2. 喂给 reflection-agent（critique-agent 同款 skill，专门 prompt 归纳跨 mission pattern）
    //   3. LLM 输出 candidate rules → 去重 + 置信度过滤 → 写 RuleBase
    //   4. 返回 DreamingRunResult
    return {
      trigger,
      sample: {
        windowStart: new Date(),
        windowEnd: new Date(),
        missionIds: [],
        strategy: "stratified",
      },
      newRules: [],
      rejectedCandidates: 0,
      tokensUsed: 0,
      durationMs: 0,
    };
  }

  /**
   * 取适用于本次 mission 的 top-K rules（按 failureCodes 匹配 + confidence 排序）。
   * PR-I.3 leader plan 启动时调用此方法注入 prompt。
   */
  async getRulesForMission(_failureCodes: string[]): Promise<InjectedRuleSet> {
    // PR-I.3 实现：查 RuleBase WHERE failureCodes overlap AND disabled=false
    //   ORDER BY (successCount/applicationCount + confidence) DESC LIMIT K
    return {
      rules: [],
      promptSnippet: "",
    };
  }

  /**
   * 反馈规则应用结果（mission 完成后 callback）。PR-I.3 用于效用追踪 + 衰减。
   */
  async recordRuleApplication(
    _ruleId: string,
    _success: boolean,
  ): Promise<void> {
    // PR-I.3 实现：UPDATE DreamingRule SET applicationCount++, successCount += success?1:0
  }

  /**
   * Admin 用：禁用某条规则。
   */
  async disableRule(_ruleId: string): Promise<void> {
    // PR-I.4 实现
  }

  getConfig(): DreamingSchedulerConfig {
    return { ...this.config };
  }

  setConfig(updates: Partial<DreamingSchedulerConfig>): void {
    this.config = { ...this.config, ...updates };
    this.logger.log(`[Dreaming] config updated: ${JSON.stringify(updates)}`);
  }

  /**
   * PR-I.2 实现后此方法判断 mission 候选是否符合规则注入条件
   * （e.g. mission.depth=deep 才注入，shallow mission 不打扰）。
   */
  static shouldInjectRules(
    missionContext: { depth?: string; isRerun?: boolean } | undefined,
  ): boolean {
    if (!missionContext) return false;
    // 浅 mission 或 rerun 不注入规则（rerun 已有原 mission 上下文）
    return missionContext.depth === "deep" && !missionContext.isRerun;
  }

  /**
   * 用于 spec：暂存的 rules（PR-I.2 会替换为 DB 查询）。
   */
  protected getStubRules(): readonly DreamingRule[] {
    return [];
  }
}
