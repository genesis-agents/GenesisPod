/**
 * 质量阈值集中配置 —— 单一来源
 *
 * 历史：playground / reflexion-loop / s8-writer / per-dim-pipeline 各自硬编码
 * 60/70/75 阈值，相互不一致触发死循环（mission 165c967f 死锁 70+min 真因：
 * per-dim PASS=75 + reviewer 实测 66-68 → 永远 revise）。
 *
 * 现在所有 quality gate 都从此处 import，确保 mission 全链路阈值一致。
 *
 * Tuning 历史：
 * - 2026-04-30 (commit f955b9ae1) reflexion-loop 默认从 75 → 60
 * - 2026-05-01 (PR-G iter8) per-dim-pipeline / s8-writer 也降到 60
 *
 * 当前 LLM 输出质量分布观测：65-75 区间集中。设为 60 让"基本可用"的章节
 * 直接放行，>=70 的"高质量"章节自然也通过；只有 <60 的"明显有问题"章节
 * 触发 revise。
 */

/**
 * Reviewer 通过分数下限。
 * - 评分 >= 此值 → pass，章节进入下一阶段
 * - 评分 < 此值  → revise，进入修订循环
 *
 * 三层联动（避免出现 reflexion pass 但 chapter-pipeline reject 的内部矛盾）：
 * 1. reflexion-loop.passThreshold（agent 内部 self/external/critical verifier）
 * 2. s8-writer-draft-report.passThreshold（mission 级 writer judge consensus）
 * 3. per-dim-pipeline.PASS_THRESHOLD（章节级 chapter-reviewer）
 *
 * 三处全部走此常量，调一处即三处生效。
 */
export const REVIEW_PASS_THRESHOLD = 60;

/**
 * 章节级 writer/reviewer 修订循环最大重试次数。
 * - 1 = 每章最多 2 attempts（1 初稿 + 1 修订）
 *
 * LLM 在收到 critique 后第 2 次往往能改进；第 3、4 次边际收益≈0 但成本翻倍。
 * 极少数仍不达标的章节由 mergeUndersizedSections / postProcessFinalReport
 * 在装配阶段兜底处理，不再靠 review loop 补救。
 */
export const CHAPTER_MAX_REVISION_ATTEMPTS = 1;

/**
 * Mission 级 writer 重写最大次数（s8 顶层）。
 * - 2 = 最多 2 次完整 mission writer attempts
 */
export const MISSION_WRITER_MAX_ATTEMPTS = 2;

/**
 * Reviewer 连续失败容忍次数（per-dim-pipeline 用）。
 * 超过此值 reviewer 视为持续故障，放弃该章节的复审循环，直接 accept 当前 draft。
 */
export const MAX_CONSECUTIVE_REVIEWER_FAILURES = 2;
