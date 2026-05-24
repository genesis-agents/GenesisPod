# Agent Playground 架构基线文档

> **位置**：`docs/architecture/ai-apps/agent-playground/`
> **基线日期**：2026-04-26
> **状态**：Q1~Q17 全部锁定，子文档 v0.1 完整

---

## 文档地图

### 主文档

| 文档                                                                                                                                               | 内容                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [mission-pipeline-baseline.md](./mission-pipeline-baseline.md)                                                                                     | **主基线**：边界契约 + 8 节点主干 + Q1~Q17 锁定 + 用户档位 + 决策清单 + 路线图               |
| [mission-pipeline-sota-audit-2026-04-29.md](./mission-pipeline-sota-audit-2026-04-29.md)                                                           | **SOTA 系统对标**：12 stage 全量审计 + 整体架构 vs 业界 SOTA + 综合评分 7.6/10 + P0 改动清单 |
| [agent-playground-target-boundary-and-directory-blueprint-2026-05-24.md](./agent-playground-target-boundary-and-directory-blueprint-2026-05-24.md) | **目标边界与目录蓝图**：明确哪些留在 app、哪些继续下沉到 harness、以及未来新 team 的推荐目录 |

### 子文档（按 P0 / P1 优先级）

| 优先级 | 文档                                                                                   | 主题                                                                                       |
| ------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| P0     | [mission-pipeline-tool-recall.md](./mission-pipeline-tool-recall.md)                   | Tool Recall（D1, D5）：spec 写 toolCategories / Leader 出 hint / Harness 召回 / Agent 自决 |
| P0     | [mission-pipeline-exit-policy.md](./mission-pipeline-exit-policy.md)                   | Exit Policy（Q3）：10 种 ExitReason 枚举 / 优先级 / partialOutput 兜底                     |
| P0     | [mission-pipeline-runresult-schema.md](./mission-pipeline-runresult-schema.md)         | RunResult 三段式（Q4）：output / partialOutput / 元信息 / 工具快照                         |
| P0     | [mission-pipeline-reconciler.md](./mission-pipeline-reconciler.md)                     | [3.5] Reconciler 节点：事实表 / 冲突 / 重叠 / 空白 / figureCandidates                      |
| P0     | [mission-pipeline-writer-artifact.md](./mission-pipeline-writer-artifact.md)           | Writer 输出契约（Q7）：ReportArtifact / 三视图 / 角标溯源 / 图文并茂红线                   |
| P0     | [mission-pipeline-audit-layers.md](./mission-pipeline-audit-layers.md)                 | 审核 L0~L4（Q5）：用户档位映射 / 各层接口                                                  |
| P0     | [mission-pipeline-finalize-gate.md](./mission-pipeline-finalize-gate.md)               | finalize 校验闸（D2 / D8）：reject 上限 + 累积式 reminder                                  |
| P0     | [mission-pipeline-failure-learning.md](./mission-pipeline-failure-learning.md)         | 跨 mission 失败学习（D6）：count >= 2 触发预禁用                                           |
| P0     | [mission-pipeline-tool-failure-circuit.md](./mission-pipeline-tool-failure-circuit.md) | 工具失败熔断（D7）：连续 3 次同 toolId 失败                                                |
| P0     | [mission-pipeline-user-profiles.md](./mission-pipeline-user-profiles.md)               | 用户档位（§11 / D20）：默认深度+图文+其他中等                                              |
| P1     | [mission-pipeline-replay-api.md](./mission-pipeline-replay-api.md)                     | Replay API（D12）：dev only 三种模式（fixture/stub/live）                                  |
| P1     | [mission-pipeline-tool-acl.md](./mission-pipeline-tool-acl.md)                         | Tool ACL（D13）：entitlements + workspace scope + rate limit                               |

---

## 阅读顺序建议

1. **理解整体**：先读 [mission-pipeline-baseline.md](./mission-pipeline-baseline.md)（主基线，含完整决策表）
2. **写作输出形态**：再读 [writer-artifact](./mission-pipeline-writer-artifact.md)（用户重点关切）
3. **工具决策**：[tool-recall](./mission-pipeline-tool-recall.md)（核心架构变化）
4. **质量与审核**：[reconciler](./mission-pipeline-reconciler.md) + [audit-layers](./mission-pipeline-audit-layers.md)
5. **运行时契约**：[runresult-schema](./mission-pipeline-runresult-schema.md) + [exit-policy](./mission-pipeline-exit-policy.md)
6. **细节兜底**：[finalize-gate](./mission-pipeline-finalize-gate.md) + [failure-learning](./mission-pipeline-failure-learning.md) + [tool-failure-circuit](./mission-pipeline-tool-failure-circuit.md)
7. **用户配置**：[user-profiles](./mission-pipeline-user-profiles.md)
8. **进阶**：[replay-api](./mission-pipeline-replay-api.md) / [tool-acl](./mission-pipeline-tool-acl.md)

---

## 核心架构决策摘要

| 决策                                              | 来源      | 状态                                                                           |
| ------------------------------------------------- | --------- | ------------------------------------------------------------------------------ |
| 工具集合 from ToolRegistry（spec 写 category）    | Q1        | ✅                                                                             |
| Leader 出 toolHint，Researcher 在子集内自决       | Q2        | ✅ 业界主流 retrieval+self-decide                                              |
| 多重出口 + ExitReason 标准枚举                    | Q3        | ✅ 10 种                                                                       |
| RunResult 三段式 + 元信息直挂                     | Q4        | ✅                                                                             |
| 审核 L0~L4 完整实现，用户档位控制                 | Q5        | ✅ 默认 L0+L3                                                                  |
| Reconciliation Pattern + 局部回写                 | Q6        | ✅ 新增 [3.5] 节点                                                             |
| Writer 输出 ReportArtifact（结构化非裸 markdown） | Q7        | ✅ sections / citations(occurrences) / figures / quickView / factTable         |
| 三视图共享数据源                                  | Q7        | ✅ 连续 / 章节 / 快速                                                          |
| 角标溯源 + occurrences[] 反向定位                 | Q7        | ✅ 超越 TI                                                                     |
| 图文并茂 + 图来源红线                             | Q7        | ✅ 仅 reference / extracted_chart 两类，必挂 evidenceCitationIndex + sourceUrl |
| MissionState + Summarize-on-Handoff               | Q8        | ✅ 超 50K 自动 summarize                                                       |
| 三级重试 + Checkpoint resume                      | Q9        | ✅                                                                             |
| Soft 80% / Hard 100% 预算闸                       | Q10       | ✅                                                                             |
| AbortSignal 透传，不做暂停                        | Q11       | ✅                                                                             |
| OTel + EventStore + Replay (dev)                  | Q12       | ✅                                                                             |
| ToolACL（entitlements + workspace scope）         | Q13       | ✅ p1                                                                          |
| Tool sideEffect 元数据                            | Q14       | ✅                                                                             |
| Spec version + checkpoint 强校验                  | Q15       | ✅                                                                             |
| Stub + VCR + cheap model e2e                      | Q17       | ✅                                                                             |
| 默认用户档位 = 深度 + 图文 + 中等其他             | §11 / D20 | ✅                                                                             |

---

## 后续动作

文档基线锁定后，下一步按 §13 P0 路线图分批实现：

1. ToolRegistry 扩展（category / sideEffect / requiredEntitlements 元数据 + listByCategory）
2. AgentRunner 加 toolRecallHint + Tool Recall 五步
3. RunResult 三段式 + ExitReason 枚举
4. LeaderAgent / ResearcherAgent 改 toolCategories
5. [3.5] Reconciler 节点完整实现
6. Writer W1~W5 子流程 + ReportArtifact 输出契约
7. 三视图前端组件
8. 用户档位前端配置 + 默认值
9. 10 维质量硬指标 + 局部回写
10. 图来源强校验链路（端到端）
