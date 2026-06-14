# GenesisPod 全栈架构诊断报告

> 出具人：首席架构师 · 日期：2026-06-14 · 基线 commit：835930b23
> 方法：8 维度独立审计 + 对所有 high/critical 发现的对抗性复核（verification）。**凡复核结论与原始严重度冲突，一律以复核结论为准。**
> 工作量：26 个子 agent · 8 维度 · 57 条发现 · 17 条 high/critical 经对抗复核（16 确认/部分确认，1 完全证伪）。
>
> **复核刷新：HEAD 推进至 `28ffadfce`（基线后 +19 commit）。** 下方"零、整改进度"为最新现状，正文各维度表格保留原始诊断作为历史记录（已修项在本节统一标注，不逐条改表）。

---

## 零、整改进度（复核于 HEAD `28ffadfce`）

基线 `835930b23` 之后有 19 个 commit，**P0 安全/工程项已基本闭环**，数据层与治理类 P2 项基本未动，并出现 1 处迁移规范回归。

### ✅ 已修复（勿再追）

| 原发现                                                             | 修复 commit | 当前证据                                                                                                                                          |
| ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Top#1 `/proxy/*` SSRF（DNS rebinding）                             | `ea49c0c46` | 新增 `proxy/safe-proxy-fetch.ts`，所有出站经 facade `assertUrlSafe`（DNS 解析后校验）+ 逐跳重校验；配 `safe-proxy-fetch.spec` / `ssrf-guard.spec` |
| Top#2 refresh 双令牌坍塌                                           | `e72dcd80c` | 新增 `platform/auth/strategies/jwt-refresh.strategy.ts`（读 REFRESH_TOKEN_SECRET）+ `jwt-refresh.strategy.spec`，refresh 端点改专用 guard         |
| Top#4 `test:quick` 静默跳测                                        | `ce9dd6d34` | CI 改跑 `npm run test:ci`（全量，ci.yml:105）+ 独立 `test:ci --coverage` job（:138），安全 spec 现真跑                                            |
| 后端覆盖率门槛 CI 不执行（工程 P1）                                | `ce9dd6d34` | coverage job 已入 CI（:138）                                                                                                                      |
| Top#5 enum 补偿靠手维护清单                                        | `f694c3006` | 改为从 Prisma DMMF 自动派生 backfill，新增 enum 不再漏补                                                                                          |
| `/metrics` 未授权（安全 medium）                                   | `e7283de83` | 加 `METRICS_TOKEN` guard                                                                                                                          |
| SSR 净化用 regex（安全 medium）                                    | `3d7b972c5` | 改用 `isomorphic-dompurify`                                                                                                                       |
| FunctionCallingExecutor 不强制 tokenBudgetLimit（AI运行时 medium） | `f24451457` | loop 内已接入预算上限                                                                                                                             |
| facade 重复 text/token helper（架构 medium 相关）                  | `bd7457f75` | 抽到 shared util                                                                                                                                  |

### ✅ 误报澄清 + 已加机器看护（本次复核 + 自驱修复）

> 复核中一度把 `20260616_foresight_topics` 标为"回归"，**经读源码证伪**：该文件的 `DO $$ … EXCEPTION` 只用于 `ADD CONSTRAINT … FOREIGN KEY`（`EXCEPTION WHEN duplicate_object` 幂等），**不是**红线禁止的 `ALTER TYPE ADD VALUE` 子事务。红线只针对后者（子事务内不能 ADD VALUE）。基线后无新增真违规。

- **真实历史违规精确为 18 个文件**（最新 `20260513`，全部在基线前），原诊断"约 18"准确。一次精确扫描曾漏掉 `20260103_add_mission_export_source`（其外层用 `END\n$$` 换行，旧正则未覆盖）。
- **honor-only → 机器看护已落地**：新增 `backend/src/__tests__/architecture/migration-hygiene/no-alter-type-in-exception.spec.ts`，扫描 `prisma/migrations/**`，精确识别"`ALTER TYPE ADD VALUE` 被 `DO $$ … EXCEPTION` 包裹"（不误伤 FK 幂等 EXCEPTION）。18 个历史违规冻结为 baseline allowlist，**新增迁移零违规**，否则 jest / pre-push / CI（`verify:arch`）拦截。第三个断言防 allowlist 腐化（违规被修掉就必须从名单删）。

### ⏳ 仍未处理（构成"下一批"，见第十节）

未在 19 个 commit 中观察到改动，原诊断结论维持：迁移 squash baseline 重建、部署脚本静默 auto-resolve FAILED、god-file（team-mission 6333 / admin 3518 / TopicContentPanel 6216 行实测未变）、PR-E0 facade 桶导入（concurrency-planner / mission-state.manager 仍从 facade 桶导入）、L1 `inferIsReasoning` 仍从 ai-engine import、content-extractor/data-fetching 直连 provider、CBC v1 re-encryption、docs `layered-architecture.md` 仍写"10 聚合"（应 12）、token 审计棘轮、Python ai-service 零测试、30 FK 索引 / costUsd Decimal、forwardRef 解环、`/health` 端点。

---

## 一、执行摘要

### 总体健康判定

GenesisPod 是一个**工程纪律明显高于同体量项目**的系统：5 层架构有 ESLint + jest arch spec 双重看护（27/27 通过）、CI 是 9 job 合并门、前端有 hard-zero UI-discipline 门禁、运行时层已正确落地 Claude Code "反向洞察"护栏。**架构骨架是健康的，真正的风险集中在三个'门禁盲区'**：

1. **安全**：3 个真实可利用漏洞（未授权 SSRF 代理、refresh token 双令牌模型坍塌、CBC 密钥熵减半），其中前两个对抗复核维持 high。
2. **数据**：迁移链已不是 schema 真相源（靠 `db push` + 部署脚本静默补偿），是最深的系统性债务。
3. **工程**：CI 实际跑的 `test:quick` 静默跳过约 53 个 spec（含 jwt/guardrails/mcp 安全测试），覆盖率门槛形同虚设。

**对抗复核的关键纠偏**：原始审计里有 1 个 high 发现被**完全证伪**（"150 个 controller 零测试"实为方法论错误，真实约 51% 有 spec），多个 high 被降级为 low/medium。请勿追逐这些误报。

### 各维度健康分

| 维度                    | 健康分 | 判定                     | 复核后真实风险点                                 |
| ----------------------- | ------ | ------------------------ | ------------------------------------------------ |
| 架构 architecture       | 71     | 良好骨架，盲区在运维维度 | L1→L2 越界（已降 low）、PR-E0 facade 桶导入      |
| 工程 engineering        | 76     | 成熟 CI，但有静默跳测    | test:quick 跳过约 53 spec（**维持 high**）       |
| 实现 implementation     | 82     | 红线纪律强               | 直连 provider 绕过 AiChatService（降 medium）    |
| 数据 data               | 62     | **最弱维度**             | 迁移链断裂 + 部署脚本静默补偿（**维持 high**）   |
| 前端 frontend           | 62     | 治理骨架好，god 组件多   | token 审计 warn-only 漂移（降 medium）           |
| 文档 documentation      | 78     | 异常自律                 | canonical 架构文档与代码漂移（降 medium）        |
| 安全 security           | 62     | 基础好，3 个真漏洞       | 未授权 SSRF 代理 + refresh 漏洞（**维持 high**） |
| AI 运行时 ai-compliance | 78     | 运行时层成熟             | 截图分析器绕过引擎（降 medium）                  |

### Top 5 最该修的问题（按复核后真实优先级）

| #   | 问题                                                                                            | 维度 | 复核严重度       | 为什么排在前面                                          |
| --- | ----------------------------------------------------------------------------------------------- | ---- | ---------------- | ------------------------------------------------------- |
| 1   | `/proxy/*` 全部 `@Public()` 且用自研弱 SSRF 检查，可被未授权 DNS rebinding 打到 169.254.169.254 | 安全 | **high（确认）** | 唯一可被未授权远程利用、读取云元数据/内网的真漏洞       |
| 2   | refresh 端点用 access-token 密钥校验，双令牌模型坍塌，access token 可无限续命                   | 安全 | **high（确认）** | 短时令牌泄露 → 永久会话，修复仅 S                       |
| 3   | 迁移链无法从空库重建 schema，靠 `db push --accept-data-loss` + 部署脚本静默 resolve/补偿        | 数据 | **high（确认）** | 迁移历史已非真相源，新增 enum 漏补即运行时报错          |
| 4   | CI 的 `test:quick` 静默跳过约 53 个 spec（jwt/guardrails/mcp 等安全测试）                       | 工程 | **high（确认）** | 最高价值安全测试在 PR/main 上从不运行                   |
| 5   | 约 18 个历史迁移用 `DO $$ … EXCEPTION` 包裹 `ALTER TYPE ADD VALUE`（违反自己的红线）            | 数据 | **high（确认）** | 非 baseline 库上 `migrate deploy` 必失败，enum 静默缺失 |

---

## 二、架构维度（健康分 71）

骨架健康：L1→L2→L2.5→L3→L4 单向依赖，Facade 边界在 service 层干净，27/27 arch spec 通过。弱点全在此前未度量的运维维度。

| 严重度                           | 发现                                                           | 证据                                                                                                                   | 影响                                                                                                                                                                                                                          | 建议                                                                | 工作量 |
| -------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------ |
| ~~high~~ → **low（确认但降级）** | Platform(L1) 直接 import ai-engine(L2) 内部 `inferIsReasoning` | `platform/credentials/user-owned/user-model-configs/user-model-configs.service.ts:9`，用于 :119                        | 真实越界，但**复核发现 arch spec 因 importLayer 只认含 `modules/` 的路径而未捕获**，且有 contract spec `infer-is-reasoning-callers.contract.spec.ts:65-68` 把该文件列为合法 baseline——耦合是**被官方认可**的，且仅 1 个纯函数 | 内联为本地纯函数即可，无需经 facade                                 | S      |
| ~~high~~ → **证伪（none）**      | ~~150 个 controller 零 spec~~                                  | 原 shell 用同目录兄弟文件名找 spec，**项目约定 spec 放 `__tests__/`**                                                  | **完全误报**：`*.controller.spec.ts` 实有 95 个，76/150 controller 有直接对应 spec（约 51%），含 2545 个 it/test。**不要追这个**                                                                                              | 无需处理                                                            | —      |
| ~~high~~ → **low（确认但降级）** | encryption.service 硬编码 PBKDF2 salt                          | `platform/credentials/storage/encryption/encryption.service.ts:93` `'deepdive-secrets-salt-v1'`                        | 确认存在；但**生产用高熵 SETTINGS_ENCRYPTION_KEY，静态 salt 对 256-bit 密钥无法预计算**；新凭据已走 envelope(GCM)。dev 弱密钥路径仅限非生产                                                                                   | 迁移到 `SETTINGS_ENCRYPTION_SALT` 环境变量；长期走 KMS              | M      |
| medium                           | 4 个 harness-internal 文件经 facade 桶导入（PR-E0 违规）       | `concurrency-planner.service.ts:15`、`mission-state.manager.ts:14`（runtime 值导入有循环加载风险）+ 2 个 `import type` | 桶导入可致 DI token 捕获 undefined                                                                                                                                                                                            | 改为从具体源文件直接导入                                            | S      |
| medium                           | 376+ 文件 >500 行，多个 2000-6333 行巨文件                     | `team-mission.service.ts` 6333 行等                                                                                    | 难测难审，易冲突                                                                                                                                                                                                              | 拆 `team-mission`、`admin.service` 为子服务                         | L      |
| medium                           | ConfigService 采用率仅 44%，129 处直读 process.env             | gateway CORS 在模块作用域读 env（无法注入）                                                                            | 绕过校验/类型安全                                                                                                                                                                                                             | gateway 抽 `WsCorsConfigService`                                    | M      |
| medium                           | 静默错误处理：4 个空 catch + 多个 `.catch(()=>null)` 无日志    | `metadata-extractor.service.ts:424,470,492,734`                                                                        | 吞掉可观测信号                                                                                                                                                                                                                | 至少 `logger.warn`；service 内 `throw new Error()` 换 HttpException | M      |
| low                              | 跨 app 经 harness 内部路径 import module                       | `ai-ask.module.ts:24,26` 等（ESLint 豁免的装配文件）                                                                   | 耦合内部路径                                                                                                                                                                                                                  | 建 `AiHarnessPublicModule` re-export                                | M      |
| low                              | 无 `@nestjs/terminus` 健康检查端点                             | 仅业务域 health monitor，无 HTTP `/health`                                                                             | 负载均衡器无法判活                                                                                                                                                                                                            | 加 `/health` 检查 DB/Redis/内存                                     | S      |
| low                              | 49 处 service 级 forwardRef，暗示结构性循环依赖                | `mission-execution.service.ts:85` 等                                                                                   | 隐藏循环，bootstrap 可能拿到 undefined                                                                                                                                                                                        | 抽第三方服务或事件总线解环                                          | L      |

---

## 三、工程维度（健康分 76）

CI 异常成熟（9 job 合并门 + 多层 arch 看护）。两个真问题都在"测试实际跑了什么"上。

| 严重度                              | 发现                                                              | 证据                                                                                                                                                                                                                                         | 影响                                                               | 建议                                                               | 工作量 |
| ----------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------ |
| ~~high~~ → **medium（确认但降级）** | 后端覆盖率门槛定义了但 CI 不执行                                  | `jest.config.js:61-101` 定义 85% 门槛；CI 跑 `test:quick`（`package.json:22`）无 `--coverage`；codecov 上传 `fail_ci_if_error:false` 静默 no-op                                                                                              | 核心模块覆盖率可静默回退无信号                                     | 加专门 coverage job 跑 `test:coverage` 入 ci-status                | M      |
| **high（确认，且影响被低估）**      | `test:quick` 在 CI 静默跳过约 **53** 个 spec（非 17），含安全测试 | `package.json:22` testPathIgnorePatterns；CI `ci.yml:103` 是唯一后端测试调用。被跳：guardrails=26、mcp-server=4、jwt-auth.guard、jwt.strategy 等真实存在于盘上。**3 个死 pattern**（python-executor/mcp-adapter/openai.provider）匹配 0 文件 | jwt/guardrails/MCP 安全测试在 PR/main 上**从不运行**，回归绿灯通过 | 跑全量 jest 或拆 fast+full 必跑车道；先解禁安全 spec，删死 pattern | M      |
| medium                              | Python ai-service 零测试零 CI                                     | `ai-service/` 24 个 .py，无 test\_\*.py，workflow 无 pytest/ruff                                                                                                                                                                             | 已部署 FastAPI 无任何质量门                                        | 加 ruff+mypy+import-smoke CI job                                   | M      |
| medium                              | 前端测试密度 ~13% vs 后端 ~67%                                    | 前端 175 测试 / 1314 源；Phase2/3 承诺未兑现                                                                                                                                                                                                 | 大量组件/hook 未测                                                 | 阈值棘轮 +5%/sprint                                                | L      |
| low                                 | 根 vitest.config 是空跑（防误触）                                 | 根 `vitest.config.ts` 排除所有真实目录                                                                                                                                                                                                       | 根目录 `vitest` 绿色 no-op 误导                                    | 删除或换守护脚本报错                                               | S      |
| low                                 | 前端/根重复依赖                                                   | `dompurify`+`isomorphic-dompurify`、`html2canvas`+`html-to-image`、两套 canvas                                                                                                                                                               | 包体增大、canonical 不明                                           | 每类保留一个                                                       | M      |
| low                                 | 多 lockfile，e2e 漂移                                             | `frontend/package-lock.json` 冗余、`e2e/` 非 workspace 未缓存                                                                                                                                                                                | 安装漂移                                                           | 删前端 lock，e2e 入 workspace 或独立 CI                            | S      |
| low                                 | ESLint 多条类型安全规则降为 warn，CI 不 fail                      | `.eslintrc.js:49-70` no-unsafe-\* / no-misused-promises                                                                                                                                                                                      | 类型不安全代码以 warn 累积                                         | 加 `--max-warnings` 棘轮                                           | M      |

---

## 四、实现维度（健康分 82）

红线纪律强：前端源码几乎零 `any`、零 `console.log`（原 grep 47/19 是 `.next/` 噪声）。问题在 escape hatch 和 god-file。

| 严重度                              | 发现                                                             | 证据                                                                                                                                                                      | 影响                                                                                                     | 建议                                                       | 工作量 |
| ----------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------ |
| ~~high~~ → **medium（确认但降级）** | 直连 provider HTTP 绕过 AiChatService + 硬编码 model/temperature | `common/content-processing/content-extractor.service.ts:159,182`（gemini-1.5-flash, temp 0.3）；`data-fetching.service.ts:470,484`（sonar-small, temp 0.1）——注释自认绕过 | 跳过 pricing/tracing/BYOK；model ID 会随弃用腐化。**但位于 common/ 非 ai-app，属红线违规非 ESLint 越界** | 经 AiChatService.chat + TaskProfile，或加 provider adapter | M      |
| ~~high~~ → **medium（确认但降级）** | God-file：2500-6333 行单服务                                     | 9 个文件行数全部核对一致，`team-mission.service.ts` 6333 行为后端最大非测试源文件                                                                                         | 纯可维护性/altitude，无正确性/安全影响                                                                   | 拆子服务                                                   | XL     |
| medium                              | ~95 个 `eslint-disable no-explicit-any` 逃逸                     | 后端 73 + 前端 22；热点 `prisma.service.ts:481-557`                                                                                                                       | 每个 disable 是未检类型洞，CI 绿灯隐藏                                                                   | 给 Prisma 扩展加泛型类型                                   | M      |
| medium                              | ~57 前端组件用 emoji 当 UI 图标                                  | `ai-image/components/StreamingProgress.tsx:23/28/33/72/81`                                                                                                                | 违反 lucide-only 红线                                                                                    | 换 lucide 图标 + lint 规则                                 | M      |
| low                                 | 静默吞错 `.catch(()=>{})` / 空 catch                             | 后端 86 + 前端 18；风险点 `metadata-extractor.service.ts:424/470/492/734`                                                                                                 | 部分是合理 teardown，但 metadata 空 catch 掩盖解析失败                                                   | 给 metadata catch 加 `logger.debug`                        | S      |
| low                                 | seed 目录硬编码 test-model ID                                    | `seed/data/ai-provider-catalog.ts:47/64/74/91`                                                                                                                            | 仅探活配置，非运行时选择，不违反红线                                                                     | 可保留，定期刷新                                           | S      |

---

## 五、数据维度（健康分 62 — 最弱）

数据层规模大（304 model / 171 enum / 671 索引），但迁移管线债务严重，是全报告**最系统性的风险**。

| 严重度                            | 发现                                                                           | 证据                                                                                                                                                                                      | 影响                                                                                                                   | 建议                                                                       | 工作量 |
| --------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------ |
| **high（确认，数量纠正为约 18）** | 历史迁移用 `DO $$ … EXCEPTION` 包裹 `ALTER TYPE ADD VALUE`，部署脚本硬编码补偿 | `20251126_add_all_ai_mention_type`、`20260213_add_export_source_types`（4×）、`20260221_…`、`20260101_…`；`deploy-migrations.ts:300-436` 仅补偿 5 个 enum 类型。严格扫描为 ~18 文件/25 块 | 非 baseline 库 `migrate deploy` 必失败；MentionType.ALL_AI 等只经此 pattern 添加、未进补偿块 → **运行时 invalid enum** | 停用 EXCEPTION 包裹（用 `20260611_…` 为模板）；enum 确认入库后退役补偿块   | L      |
| **high（确认）**                  | 部署脚本静默把 FAILED 迁移标记为 applied 且不执行 SQL                          | `deploy-migrations.ts:225-251`，日志 "migration SQL was NOT executed"，每次 deploy 跑                                                                                                     | 真失败的迁移永久标记 applied，schema 变更永不落地，仅 console warn                                                     | 移除全量 auto-resolve，遇意外失败 loudly fail；已知坏迁移按名 allowlist    | M      |
| **high（确认）**                  | 迁移链无法重建 schema，新库靠 `db push --accept-data-loss`                     | `deploy-migrations.ts:116-155` `bootstrapFreshDatabase()`；注释自述链只建 ~255/279 表（缺 47 含 knowledge_bases/child_chunks）。churn 迁移 33；schema 已长到 304 model                    | 迁移历史非真相源；新旧环境两条路径会发散                                                                               | 从 schema.prisma 生成单一 squash baseline，重置历史，统一走 migrate deploy | XL     |
| medium                            | 30 个 model 的 FK 列无索引前缀覆盖                                             | junction 表只索引复合 unique 首列：`AskSessionKnowledgeBase.knowledgeBaseId` 等；`UserFavorite.topicId` 无索引                                                                            | 删 KB/User 触发子表顺序扫描；反向 join 全扫                                                                            | 给 trailing FK 列加 `@@index`，单迁移覆盖全部                              | M      |
| medium                            | costUsd 同时建模为 Decimal 和 Float                                            | `models.prisma:9021/9975/11107` Float vs :7515/7558 Decimal                                                                                                                               | Float 累加 USD 成本有舍入漂移，预算阈值比较不可靠                                                                      | 全部统一 Decimal(12,6)，ALTER TABLE 迁移                                   | M      |
| low                               | 372 个 Json 字段，多个 model 8-9 个                                            | Resource(9)、AgentPlaygroundMission(9)；GIN 索引仅覆盖子集                                                                                                                                | 无 DB 级 schema 约束，非 GIN 路径全扫                                                                                  | 高频过滤字段提升为真列；查询字段补 GIN                                     | L      |
| low                               | 286 model + 163 enum 挤在 11473 行单文件                                       | `models.prisma`（vs ontology.prisma 6 model 已拆分）                                                                                                                                      | 难审、易冲突、所有权不清                                                                                               | 按域拆 research/teams/office 等，无需 SQL 迁移                             | L      |
| low（正面）                       | **Ontology 未提交改动干净且幂等**                                              | `ontology.prisma:100-110` + `20260613_ontology_topic_settings/migration.sql` 手写幂等                                                                                                     | 是迁移纪律的正面范例                                                                                                   | 无需改动，可直接提交                                                       | S      |

---

## 六、前端维度（健康分 62）

治理骨架好：UI-discipline 16 条 hard-zero 入 pre-push + CI 且 0 违规；类型安全强（仅 26 any / 9 console）。两个系统性问题拖累。

| 严重度                              | 发现                                                           | 证据                                                                                                                                           | 影响                                      | 建议                                                             | 工作量 |
| ----------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- | ------ |
| ~~high~~ → **medium（确认但降级）** | God 组件：54 文件 >1000 行，`TopicContentPanel.tsx` 6216 行    | 每项数字核对一致：12 个内联 SVG 图标(226-404)、4 个 TabContent 子组件、32 useState；`app/page.tsx` 4034 行/48 useState；lucide 已在 560 文件用 | 纯可维护性/治理，无正确性/安全缺陷        | 拆子组件到 co-located 文件夹；内联 SVG 换 lucide；加文件大小预算 | XL     |
| ~~high~~ → **medium（确认但降级）** | 设计 token 审计 warn-only 且向上漂移                           | `audit-ui-tokens.ts` exit 0；T3 +3/T4 +8/T5 +6；`ci.yml:266` 注释"不入门控"。纠正：T1/T6 实际下降（T6 hard-gated），6 类中 3 类漂移上行        | CLAUDE.md 标准 22 禁止增长但机制部分无牙  | 改棘轮入 pre-push+CI（current>baseline 即 fail）；先啃 T4/T3     | M      |
| medium                              | 27 文件手搓内联 SVG 图标                                       | `TopicContentPanel.tsx:226-404` 12 个图标；lucide 已在 548 文件用                                                                              | 图标尺寸/描边不一致，违反 canonical       | 换 lucide 等价物 + audit 规则                                    | M      |
| medium                              | 单体 Zustand store：`topicInsightsStore.ts` 1403 行/151 setter | vs ai-teams store 已正确分 slice                                                                                                               | 广播式重渲染，难测                        | 按域拆 slice（仿 ai-teams）                                      | L      |
| low                                 | UI-discipline 审计范围有缺口                                   | `audit-ui-discipline.ts:80-97` 跳过 ui/common；61 个内联 `fixed inset-0 z-50` modal                                                            | 给人"内联 modal 已清零"假象，焦点陷阱风险 | 抽查 61 处迁移到 canonical Dialog                                | M      |
| low（正面）                         | 基线卫生值得保留                                               | 26 any / 9 console；hooks 分层清晰；336 aria                                                                                                   | 基础好                                    | 保持 hard-zero 门禁                                              | S      |

---

## 七、文档维度（健康分 78）

异常自律：729 md 文件清晰分 360 active + 361 archived；97% active 文档近 2 月内维护。问题是局部陈旧/矛盾。

| 严重度                              | 发现                                                      | 证据                                                                                                                                                                                          | 影响                                                             | 建议                                                                | 工作量 |
| ----------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- | ------ |
| ~~high~~ → **medium（确认但降级）** | canonical `layered-architecture.md` 与代码/CLAUDE.md 矛盾 | 文档 line 28/30 称 ai-engine "10 聚合"且含 credentials；实际 `ls` 为 **12 聚合**（缺 routing/reliability/evaluation），无 credentials/（已移 L1）。文档 line 214 又把 credentials 重复列在 L1 | 纯文档漂移；**层规则仍由 ESLint+jest spec 强制，CLAUDE.md 正确** | 更新文档列全 12 聚合，credentials 移 L1；加 spec 断言目录与文档一致 | S      |
| medium                              | 冻结的 redesign/ 仍把已删 L5 Intent Gateway 当现状        | `redesign/15-end-to-end-flow.md:12` 显示 L5；6 文件引用已删 `ai-engine/runtime/`；目录不在 \_archive 且无 superseded 横幅                                                                     | 读者误把 50-70 天前提案当现状                                    | 移入 `_archive/2026-q2/` 或加 SUPERSEDED 横幅                       | S      |
| low                                 | standards/ 有重复编号 10 + 缺号                           | 两个 `10-*.md`；缺 01/25/26                                                                                                                                                                   | 交叉引用"standard 10"歧义                                        | 重编号 + 00-overview 注明缺号                                       | S      |
| low                                 | 本地 ~12800 个 worktree md 副本 + 6 个孤儿 worktree       | `.claude/worktrees/` 已 gitignore，不污染仓库                                                                                                                                                 | 拖慢本地 Grep/Glob，违反自己的 worktree 清理规则                 | `git worktree prune` + 确认后清理                                   | S      |
| low                                 | 近重复目录 demo/demos + v2/v3 文件                        | `teams-mode-review-v2.md`+`v3.md` 共存                                                                                                                                                        | 违反"更新而非新建 v2"规则                                        | 合并或归档旧版                                                      | M      |

---

## 八、安全维度（健康分 62 — 含全报告最严重的真漏洞）

基础好（JWT 快失败、bcrypt、SSRF guard、AES-256-GCM envelope）。但 3 个 high 经对抗复核**全部确认**。

| 严重度                                   | 发现                                              | 证据                                                                                                                                                                                                                                                                | 影响                                                                                                                 | 建议                                                                                                           | 工作量 |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------ |
| **high（确认）**                         | `/proxy/*` 未授权 + 自研弱 SSRF，可 DNS rebinding | `proxy/proxy.controller.ts:30` 类级 `@Public()`（覆盖全部 5 端点）；`isBlockedAddress` 只查字面 hostname 不做 DNS 解析；漏 CGNAT 100.64/10、multicast、broadcast；`maxRedirects:5` 不逐跳重校验。项目权威 `ssrf-guard.ts` 的 `assertUrlSafe/safeFetch` **未被使用** | 未授权攻击者经 `/api/v1/proxy/pdf?url=` 用 rebinding 域或重定向链打到 169.254.169.254 / 内网，响应被流式回传         | 1) 换用 facade 的 `assertUrlSafe`/`safeFetch`；2) 加 `JwtAuthGuard`；3) 逐跳校验重定向                         | S      |
| **high（确认）**                         | refresh 端点用 access-token 密钥校验，双令牌坍塌  | `auth.controller.ts:144` `@UseGuards(AuthGuard('jwt'))` 用 JwtStrategy(JWT_SECRET)；REFRESH_TOKEN_SECRET 只签名从不验签；无 jwt-refresh strategy。前端 `auth.ts:273-279` 确实拿 accessToken 去 refresh                                                              | 偷到的短时 access token 可反复换新 access+30d refresh 对，**短时泄露 → 永久会话**；REFRESH_TOKEN_SECRET 隔离形同虚设 | 建 `JwtRefreshStrategy` 读 REFRESH_TOKEN_SECRET，注册 `AuthGuard('jwt-refresh')`，拒绝 access-token 签名的 JWT | S      |
| ~~high~~ → **low（部分确认，影响纠正）** | AES-256-CBC 主密钥被截断为 16 字节有效熵          | `encryption.service.ts:99` `.toString('hex').substring(0,32)` → 128 bit 熵（代码自述）。复核：v1 路径仅 1 个生产调用方 `settings.service.ts:181`，非"所有凭据"；新写入全走 GCM envelope（全熵）                                                                     | 仅影响 legacy v1 密文 + 加密系统设置；且攻击者需先拿到 PBKDF2 输出（即已拿主密钥）                                   | 新数据走 v2 envelope；v1 数据做 re-encryption 迁移退役 CBC                                                     | M      |
| medium                                   | Prometheus `/metrics` 未授权                      | `metrics.controller.ts:12-14` `@Public()`，暴露模型用量/调用数/延迟/错误率                                                                                                                                                                                          | 未授权方枚举模型名/请求量/基础设施                                                                                   | IP allowlist 或 `METRICS_TOKEN` guard                                                                          | S      |
| medium                                   | SSR 端 HTML 净化用 regex 兜底而非库               | `frontend/lib/utils/sanitize.ts:15-20` SSR 用 `.replace(/<script/)`，可被 `oNlOaD` 混合大小写绕过；多个 `dangerouslySetInnerHTML` 消费                                                                                                                              | SSR 渲染用户/LLM 生成 HTML 可注入脚本                                                                                | `import DOMPurify from 'isomorphic-dompurify'`（依赖已存在）                                                   | S      |
| medium                                   | jsonpath 字符串拼接（潜在注入）                   | `common/graph/graph.service.ts:299-302/376-379` 把 authorUsername 拼进 jsonpath；当前无 controller 暴露                                                                                                                                                             | 现不可利用；未来加端点未净化则可跨界泄露                                                                             | 改用 jsonpath `vars` 参数化                                                                                    | S      |
| low                                      | 静态 PBKDF2 salt 硬编码                           | `encryption.service.ts:93`、`env-kek-provider.ts:49/111`                                                                                                                                                                                                            | 强随机主密钥下影响边际                                                                                               | 每部署随机 salt，至少文档化要求强随机密钥                                                                      | M      |
| low                                      | Redis 不可用时 JWT 黑名单 fail-open               | `jwt.strategy.ts:78-89` 异常时 isBlocked=null 放行                                                                                                                                                                                                                  | Redis 宕机期被封用户恢复访问                                                                                         | 文档化 + 告警 + 可选 `BLOCKLIST_FAIL_CLOSED`                                                                   | S      |

---

## 九、AI 运行时维度（健康分 78）

运行时层异常成熟：主 agent loop（`react-loop.ts`）正确落地"反向洞察"护栏（断路器引用洞察#5、follow-up-detector 处理#1、retry-via-continue 不触发 Stop hook #4）。引擎内无直接 SDK 实例化。

| 严重度                              | 发现                                                                        | 证据                                                                                                                                                   | 影响                                                                                                                                                            | 建议                                                                              | 工作量 |
| ----------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| ~~high~~ → **medium（确认但降级）** | 截图分析器 raw fetch 绕过 AiChatService + 硬编码参数                        | `feedback/analyzer/screenshot-analyzer.service.ts:262`(OpenAI)/:327(Claude)/:192(Gemini)；`VISION_TEMPERATURE=0.3`(:30)、`VISION_MAX_TOKENS=1000`(:31) | 跳过 BYOK failover/retry/PII 红字/reasoning 参数归一化（reasoning 模型会 400）。**但文件有诚实的 in-code 已知限制声明，且为内部反馈三角化功能非核心 chat 路径** | 经 AiChatService 或 AiChatFailoverCallerService；换 TaskProfile                   | M      |
| medium                              | FunctionCallingExecutor 声明 tokenBudgetLimit 但从不强制                    | `function-calling-executor.ts:69` 定义，loop 只看 iteration/toolCall（:199-202）；预算 guard 仅在 react-loop 有                                        | 经此执行器的任务可烧满 maxIter×maxToolCall 无 token 上限，**契约静默违反**（同类 react-runaway 风险）                                                           | 把 tokenBudgetLimit 接入主 loop 或注入 BudgetAccountant；若被取代则标 @deprecated | S      |
| medium                              | 三个执行器重复 retry/断路器逻辑                                             | AgentExecutorService 用裸字符串匹配 `isRetryableError`（:486-497）而非 AIErrorClassifier                                                               | 同一 provider 错误在不同执行器分类不一致；护栏修复需多处重复                                                                                                    | 统一用 AIErrorClassifier，旧执行器委托给 AiChatRetryService                       | L      |
| low                                 | QueryLoop 截断检测靠硬编码 token 边界                                       | `query-loop.service.ts:286` `[4096,8192,16384,32768]`                                                                                                  | 非列表内 maxTokens 会误判                                                                                                                                       | 改用调用方实际 maxTokens 驱动                                                     | S      |
| low                                 | QueryLoop 续传不保留 tool-call 配对                                         | `query-loop.service.ts:237-240` 丢 tool_call_id（关联洞察#9/#10）                                                                                      | 当前 latent（仅 toolCalls.length===0 时进入）                                                                                                                   | 加断言或贯通 tool_call_id                                                         | S      |
| low                                 | 反向洞察#6/#8（thinking signature strip / sub-agent 缓存隔离）仅 honor-only | 无 microcompact 隔离、无 signature strip；缓解因素：JSON 信封协议结构性规避了 thinking block                                                           | 现风险低，但未来回传 thinking block 会静默重现#6/#8                                                                                                             | 加薄 spec 守护两个高爆炸半径项                                                    | M      |

---

## 十、下一批整改清单（HEAD `28ffadfce` 重新梳理）

> 原 P0 已基本闭环（见第零节）。下表是**当前真实待办**，已剔除已修项、并入回归项，按"修复价值 / 工作量"重排。
> 优先级：**B0** = 应立即处理（含护栏回归 + 唯一残留高危纵深）；**B1** = 本 Sprint；**B2** = Backlog 系统性重构。

### B0 — 立即（小工作量 / 高杠杆，本周）

| #   | 类别      | 任务                                                                                                                                                                                                                          | 验证标准                                                                         | 工作量 | 状态                                                                    |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| 1   | 数据/护栏 | 禁 `ALTER TYPE ADD VALUE` 包进 `DO $$ … EXCEPTION` 子事务，从 honor-only 升为机器看护                                                                                                                                         | spec 扫 `prisma/migrations/**`，18 历史违规冻结、新增 0 命中；`verify:arch` 拦截 | S      | ✅ **已完成**（`migration-hygiene/no-alter-type-in-exception.spec.ts`） |
| 2   | 安全      | `/proxy/*` `@Public()` 决议：经查 `/proxy/image` 被 `<img src>`、`/proxy/pdf` 被 `<iframe>` 消费，浏览器无法附带 Bearer 头 → 加 guard 会断图/断 PDF。结论**有意公开**，已在 controller 写明依据 + SSRF 经 safeProxyGet 的保证 | controller 文档化决策，复核无歧义                                                | S      | ✅ **已完成**（proxy.controller.ts 类级注释）                           |
| 3   | 数据      | 部署脚本 `deploy-migrations.ts` Step 2 改为：仅 `KNOWN_AUTO_RESOLVABLE_MIGRATIONS`（18 个补偿型 enum 迁移）可 auto-resolve，**未知失败 throw + 非 0 退出**并打印操作指引                                                      | 已知集照常 resolve；未知失败迁移 → 抛错中止而非静默标 applied                    | M      | ✅ **已完成**                                                           |

### B1 — 本 Sprint（高价值、中等工作量）

| #   | 类别 | 任务                                                                                                                                              | 验证标准                                                                  | 工作量 | 状态                                                                                                                                                                                                                                                                                                                                                         |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 4   | 数据 | 给 30 个 junction/child 表 trailing FK 列加 `@@index`（单迁移）；`costUsd` Float→Decimal(12,6) 统一                                               | 迁移 deploy 通过；FK 反向 join EXPLAIN 走索引；schema 内 costUsd 无 Float | M      | ⏳                                                                                                                                                                                                                                                                                                                                                           |
| 5   | 安全 | legacy v1 CBC 密文 re-encryption 迁移到 v2 GCM envelope，退役 CBC；静态 PBKDF2 salt 外置为 `SETTINGS_ENCRYPTION_SALT` env                         | 旧密文可解密并回写 v2；代码内无 `aes-256-cbc` 写路径                      | M      | ⏳                                                                                                                                                                                                                                                                                                                                                           |
| 6   | 前端 | token 审计改棘轮入 pre-push+CI（`current>baseline` 即 fail），先啃 T4/T3                                                                          | CI 故意加一个超标 token → job fail                                        | M      | ⏳                                                                                                                                                                                                                                                                                                                                                           |
| 7   | 架构 | PR-E0：harness 内部服务从自身 facade 改为直接注入 source；L1 `inferIsReasoning` 内联为本地纯函数                                                  | `verify:arch` 通过；无 internal→facade 反向依赖                           | S      | 🟡 **部分** — `mission-state.manager` 改注入 `ProcessSupervisorService`（@Global 同一单例，行为等价，31 测试 + 475 arch 全绿，已同步 spec/module 注释）。**`concurrency-planner` 决议 = Option A 保持现状**（导入的是具体 facade 文件非 barrel，无循环崩溃风险；换 source 会绕过 modelResolver 改变 BYOK 下并发度，得不偿失）。`inferIsReasoning` 内联仍待办 |
| 8   | 实现 | `content-extractor.service.ts`（gemini-1.5-flash）/`data-fetching.service.ts`（sonar-small）直连 provider 改走 `AiChatService.chat` + TaskProfile | 无硬编码 model/temperature；走统一 pricing/tracing                        | M      | ⏳                                                                                                                                                                                                                                                                                                                                                           |
| 9   | 文档 | `docs/architecture/layered-architecture.md` 更新为 ai-engine **12 聚合** + credentials 归 L1；redesign/ 加 SUPERSEDED 横幅                        | 文档与 `ls modules/ai-engine` 一致                                        | S      | ✅ **已完成**（mermaid+表 12 聚合、credentials 归 L1 注明、redesign/00-overview 加 SUPERSEDED 横幅）；"目录数==文档数" spec 因 md 解析脆弱暂缓                                                                                                                                                                                                               |

### B2 — Backlog（系统性重构 + 长期治理）

| #   | 类别           | 任务                                                                                                                                                               | 工作量 |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 10  | 数据           | 从 schema.prisma 生成单一 squash baseline，重置迁移历史，统一 fresh+existing 走 `migrate deploy`，移除 `db push` 分支与补偿块（这是数据维度根因，B0#3 是其前置）   | XL     |
| 11  | 架构/实现/前端 | 拆 god-file：`team-mission.service.ts`(6333)、`admin.service.ts`(3518)、`TopicContentPanel.tsx`(6216) 按职责拆子单元；内联 SVG/emoji 换 lucide；建文件大小预算指标 | XL     |
| 12  | 前端           | `topicInsightsStore`(1403 行/151 setter) 按域拆 slice（仿 ai-teams）                                                                                               | L      |
| 13  | 工程           | Python ai-service 加 ruff+mypy+import-smoke CI；ESLint warn 规则加 `--max-warnings` 棘轮逐条升 error                                                               | M      |
| 14  | 架构           | 逐个消除 49 处 service 级 forwardRef 的结构性循环；加 `@nestjs/terminus` `/health`                                                                                 | L      |
| 15  | 数据           | `models.prisma`(11473 行) 按域拆多文件；高 Json model 提升高频过滤字段为真列 + 补 GIN                                                                              | L      |
| 16  | AI 运行时      | 三执行器 retry 逻辑统一到 `AIErrorClassifier`；为反向洞察#6/#8 加 spec 守护                                                                                        | L/M    |
| 17  | 文档           | worktree 清理、standards 重编号、demo/demos 合并                                                                                                                   | S      |

**建议起点**：B0 三项一天内可清（含把"禁 EXCEPTION 迁移"升级为机器拦截，根治回归来源）；随后 B1 优先 #7/#9（S，巩固架构与文档真相源）+ #5（安全收尾）。

---

## 附：对抗复核结论速查（防止追误报）

- **完全证伪（勿追）**：架构"150 controller 零测试"——实为 spec 放 `__tests__/` 的方法论错误，真实约 51% 有 spec。
- **已修复（勿追，详见第零节）**：proxy SSRF、refresh 双令牌、test:quick 跳测、覆盖率 CI、enum 补偿手维护、/metrics 未授权、SSR 净化、tokenBudgetLimit。
- **确认但大幅降级**：L1→L2 越界（high→low，官方认可的单纯函数）、PBKDF2 salt（high→low，生产高熵密钥）、CBC 密钥熵减半（high→low，仅 1 个 v1 生产调用方）。
- **确认但降为 medium**：直连 provider、god-file、token 审计漂移、文档漂移、截图分析器绕过——均为质量/治理债，无正确性或可利用安全影响。
- **新增回归**：`20260616_foresight_topics` 重引入 EXCEPTION 迁移——印证该红线 honor-only 无拦截（B0#1）。
- **维持待修（务必修）**：迁移链断裂（squash baseline）、部署脚本静默 resolve FAILED、god-file、CBC v1 re-encryption。
