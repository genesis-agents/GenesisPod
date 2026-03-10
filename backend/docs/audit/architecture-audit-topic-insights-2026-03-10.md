# 架构审计报告 — topic-insights 模块 (D1-D4)

**审计日期**: 2026-03-10
**审计版本**: 1401ea5c8
**审计员**: Arch Auditor Agent v2.0
**审计范围**: `backend/src/modules/ai-app/topic-insights/` — 维度 1-4 专项审计

**模块规模**:

- 生产 TS 文件: 178 个
- 测试 TS 文件: 102 个（含 fixtures/mocks）
- 子目录: 17 个功能子目录（agents / controllers / services/{core,data,dimension,monitoring,quality,report,search,verification,collaboration} / teams / types / utils / prompts / guards / config / constants）

---

## 执行摘要

| #   | 维度           | 满分 | 得分      | 状态     |
| --- | -------------- | ---- | --------- | -------- |
| 1   | Facade 边界    | 15   | 13/15     | 轻微违规 |
| 2   | 依赖方向       | 8    | 8/8       | 通过     |
| 3   | LLM 调用规范   | 8    | 7/8       | 轻微警告 |
| 4   | 注册与生命周期 | 5    | 3/5       | 需改进   |
|     | **D1-D4 合计** | 36   | **31/36** |          |

---

## D1: Facade 边界 [13/15]

### 检查范围

全量扫描 178 个生产 TS 文件中的 `ai-engine` import 语句，统计通过 facade 和绕过 facade 的数量。

### 合规情况

**合规 import（通过 facade）**: 65 处

所有服务层符号导入均通过以下两个合规路径之一：

- `from "../../ai-engine/facade"` / `from "../../../ai-engine/facade"` / `from "@/modules/ai-engine/facade"` — 主 facade barrel
- `from "../../../ai-engine/facade/base-classes"` — facade 官方子模块，有明确文档注释说明分离原因（避免 index.ts 加载 70+ 模块形成的循环链）

### 违规明细

**违规 1（中等）: `.module.ts` 直接导入 `AiEngineModule`**

```
topic-insights.module.ts:7
  import { AiEngineModule } from "../../ai-engine/ai-engine.module";
```

**性质分析**: 此处导入的是 NestJS **模块类**（用于 `@Module({ imports: [...] }}`），不是业务服务符号。`AiEngineModule` 不在 `facade/index.ts` 中导出（facade 只导出服务/类型，不导出模块类）。这是一个**架构灰区**，而非明确的业务逻辑穿透。

**证据**: 同路径写法在所有其他 ai-app 模块中一致使用（ask、image、office、library 下 6+ 个模块），并有注释说明：`// Import directly from source to avoid circular dependency via barrel export`。

**结论**: 属于平台级约定俗成的 Module DI 注册模式，非新增违规，但理论上仍是对 ai-engine 内部路径的直接引用，按规则记录为 1 处违规。

**违规 2（轻微）: 内联动态 `import()` 类型注释**

```
services/data/data-source-fetcher.service.ts:1035
  ): import("@/modules/ai-engine/facade").ToolContext {
```

**性质分析**: 这是 TypeScript 内联类型引用（inline import type），路径指向 `facade`（不是 ai-engine 内部），因此在语义上是合规的。但形式上不遵循"顶层 `import type` 优先"的最佳实践——`ToolContext` 已在 facade/index.ts 导出，同文件第 19 行也有标准顶层 import，此处是重复引用。

**结论**: 路径指向合规（facade），但写法不规范，计 0.5 处扣分（与一处完整违规有别）。

### 扣分计算

| 违规                                    | 类型 | 数量 | 扣分 |
| --------------------------------------- | ---- | ---- | ---- |
| AiEngineModule 直接路径（模块 DI 约定） | 中等 | 1    | -1.5 |
| 内联 import() 类型注释（路径合规）      | 轻微 | 1    | -0.5 |

**得分: 13/15**

### 改进建议

1. **短期**: 将 `data-source-fetcher.service.ts:1035` 的内联类型改为顶层 `import type { ToolContext } from "@/modules/ai-engine/facade"`（文件内已有该 import，直接复用即可）。
2. **中期**: 讨论是否将 `AiEngineModule` 加入 `ai-engine/facade/index.ts` 的 re-export，或在项目规范中明确"`.module.ts` 中的 Module 类 DI 注册不受 facade 边界约束"。

---

## D2: 依赖方向 [8/8]

### 检查范围

三项检查：(a) ai-engine 反向依赖 topic-insights；(b) topic-insights 跨 App 直接依赖；(c) `.module.ts` imports 合理性。

### (a) 反向依赖检查 [4/4]

扫描 `ai-engine/` 目录下是否有 import 指向 `topic-insights`：

**结果**: 0 处反向依赖。`ai-engine` 对 `topic-insights` 完全无感知，方向纯洁。

### (b) 跨 App 直接依赖检查 [2/2]

扫描 `topic-insights/` 中导入其他 `ai-app/` 子模块（排除 `ai-app/topic-insights` 自身）：

**结果**: 唯一的跨 App 依赖是 `@/modules/ai-app/shared/report-template`（9 处），涉及文件：

- `prompts/dimension-research.prompt.ts`
- `prompts/index.ts`
- `prompts/report-synthesis.prompt.ts`
- `services/dimension/section-writer.service.ts`
- `services/quality/report-quality-gate.service.ts`
- `services/report/report-assembler.service.ts`
- `services/report/report-data.service.ts`
- `services/report/report-generator.service.ts`
- `services/report/report-synthesis.service.ts`

**性质分析**: `ai-app/shared/` 是专用共享库目录（无 `.module.ts`，无控制器，仅导出纯函数/类型），不是独立的 AI App 模块，不构成跨 App 依赖违规。这是正确的横向公共代码复用。

**结论**: 0 处违规。

### (c) 模块依赖图合理性 [2/2]

`topic-insights.module.ts` 的 `imports` 数组：

```
PrismaModule, NotificationModule, AiEngineModule, CreditsModule,
ExportModule, ConfigModule, SecretsModule, StorageModule, JwtModule
```

**分析**:

- 全部为基础设施模块（L1）或 Engine 模块（L2），依赖方向向下，合法。
- `JwtModule.registerAsync` 在本模块注册（而非复用全局 Auth Guard）略显重复，但不构成架构违规。
- 无循环导入（`AiImageModule` 那种 `forwardRef(() => AiEngineModule)` 的情况在本模块不存在）。

**结论**: 依赖图合理，无异常。

**得分: 8/8**

---

## D3: LLM 调用规范 [7/8]

### 检查范围

扫描 178 个生产 TS 文件，检查硬编码模型名、温度、maxTokens，以及 SDK 直调情况。

### 合规情况

**LLM 调用模式**: 全模块统一使用 `ChatFacade`（通过 `facade/index.ts` 导入），无直接使用 `AiChatService` 或 OpenAI/Anthropic SDK 的情况。所有调用通过 `taskProfile`（`creativity` + `outputLength`）配置参数。

**验证文件示例**（`leader-planning.service.ts`）:

```typescript
import { ChatFacade } from "@/modules/ai-engine/facade";
// ...
taskProfile: { creativity: "...", outputLength: "..." }
```

**硬编码 temperature**: 0 处
**硬编码 maxTokens**: 0 处
**直接 SDK 使用 (new OpenAI / new Anthropic)**: 0 处

### 警告明细

**警告 1: 模型名字符串用于 provider 识别逻辑**

```
services/core/leader-planning.service.ts:304-308
  providerLower.includes("deepseek") ||
  modelId.includes("deepseek")
  // 同块还有 "gemini", "grok" 的 .includes() 判断
```

**性质分析**: 这是 provider 识别用的字符串匹配（用于生成用户可见的「模型选择理由」文案），不是向 LLM 传递的 `model` 字段值，不会影响实际调用路径。属于展示层逻辑，而非 LLM 调用规范违规。

**警告 2: metadata 中的数据源标识符字符串**

```
services/data/data-source-fetcher.service.ts:955,985
  fetchedVia: "grok-live-search"
  fetchedVia: "grok-live-search-fallback"

services/data/data-source-router.service.ts:2150,2181
  fetchedVia: "grok-live-search"
  fetchedVia: "grok-live-search-fallback"
```

**性质分析**: 这是结果元数据字段，记录数据通过哪个搜索 API 获取（Grok 的实时搜索功能是数据源，不是 LLM 调用参数）。不影响模型选择，不违反 LLM 调用规范。

**报告注释中的模型提及**:

```
services/report/report-synthesis.service.ts:1200
  // 避免请求 36000+ tokens 后被 reasoning 模型（如 grok-4, 16384 limit）强制截断
```

这是代码注释，不是可执行代码。

**测试文件中的模型名**: 全部在 `__tests__/fixtures/` 和 `__tests__/mocks/` 中，属于测试 mock 数据，符合已知例外规则。

### 扣分计算

所有上述情况均属于展示层逻辑、元数据字段或注释，不是真正的硬编码 LLM 调用参数。

但 `fetchedVia: "grok-live-search"` 字符串跨 2 个文件各重复 2 次（共 4 处），建议提取为常量。这属于代码整洁度问题，轻微扣分。

| 问题                                                      | 类型 | 扣分 |
| --------------------------------------------------------- | ---- | ---- |
| `"grok-live-search"` 字符串字面量未提取为常量，跨文件重复 | 轻微 | -1   |

**得分: 7/8**

### 改进建议

1. 在 `services/data/` 目录下建立 `constants.ts`，将 `"grok-live-search"` 等 provider 标识符提取为命名常量，避免跨文件重复字符串字面量。

---

## D4: 注册与生命周期 [3/5]

### 注册模式 [3/3]

`TopicInsightsModule.onModuleInit()` 实现完整，注册了：

- `AgentRegistry.register(topicInsightsAgent)` — TopicInsightsAgent 注册
- `TeamRegistry.registerConfig(TOPIC_INSIGHTS_TEAM_CONFIG)` — 团队配置注册
- `DataSourceConnectorRegistry` 注册（内部连接器：SemanticScholar / PubMed / Finance / Weather）
- `PromptSkillBridge.registerDomain("research")` — 技能桥接

注册调用加了 `@Optional()` 保护（`agentRegistry`/`teamRegistry` 可选注入），在测试环境下安全。

**无自定义 Tool 类**（BaseTool 子类），因此无需 ToolRegistry 注册，不失分。

**得分: 3/3**

### forwardRef 合理性 [0/2]

**统计**: 9 个独立 `@Inject(forwardRef(...))` 注入点，分布于 7 个文件：

| 文件                                                  | forwardRef 目标           | 说明   |
| ----------------------------------------------------- | ------------------------- | ------ |
| `services/collaboration/research-todo.service.ts:56`  | `ResearchLeaderService`   | 无注释 |
| `services/core/leader-chat.service.ts:46`             | `LeaderToolService`       | 无注释 |
| `services/core/leader-planning.service.ts:36`         | `ResearchMemoryService`   | 无注释 |
| `services/core/mission-execution.service.ts:98`       | `ResearchMemoryService`   | 无注释 |
| `services/core/mission-lifecycle.service.ts:46`       | `ResearchLeaderService`   | 无注释 |
| `services/core/mission-lifecycle.service.ts:51`       | `MissionQueryService`     | 无注释 |
| `services/core/mission-lifecycle.service.ts:53`       | `MissionExecutionService` | 无注释 |
| `services/core/mission-query.service.ts:49`           | `ResearchLeaderService`   | 无注释 |
| `services/core/research-mission.service.ts:138`       | `ResearchLeaderService`   | 无注释 |
| `services/dimension/dimension-mission.service.ts:142` | `ResearchLeaderService`   | 无注释 |
| `services/dimension/dimension-writing.service.ts:70`  | `ResearchLeaderService`   | 无注释 |

**问题 1**: 所有 `forwardRef` 注入点均无注释说明循环依赖的具体原因（谁依赖谁形成了环），违反「forwardRef 必须有注释说明原因」规则（-1 分）。

**问题 2**: `ResearchLeaderService` 被 5 个不同服务通过 `forwardRef` 引用，表明这是一个设计上的核心服务，却形成了显著的循环依赖网络。`MissionLifecycleService` 同时持有 3 个 `forwardRef`，说明它处于一个三角依赖循环中（`MissionLifecycle ↔ ResearchLeader`、`MissionLifecycle ↔ MissionQuery`、`MissionLifecycle ↔ MissionExecution`）。大量 `forwardRef` 的存在通常指向需要进一步分解或引入事件总线模式来解环的架构债务（-1 分）。

**得分: 0/2**

**D4 总分: 3/5**

### 改进建议

1. **紧急（P1）**: 为每个 `forwardRef` 注入点添加注释，说明循环依赖的来源，例如：

   ```typescript
   // forwardRef: MissionLifecycle → ResearchLeader 形成环（Leader 在执行中需要触发 Lifecycle 的状态变更）
   @Inject(forwardRef(() => ResearchLeaderService))
   ```

2. **中期（P2）**: 分析 `ResearchLeaderService` 被 5 个服务循环引用的根本原因。考虑：
   - 将 `ResearchLeaderService` 拆分为「读写分离」的 `ResearchLeaderReader`（无出向依赖）+ `ResearchLeaderOrchestrator`（持有所有依赖），彻底消除 forwardRef；
   - 或引入 `ResearchEventEmitterService`（已存在，见 `research-event-emitter.service.ts:204` 的注释）作为事件总线，将同步方法调用改为事件驱动，从架构上解开循环。

3. `ResearchEventEmitterService` 中已有注释 `// 发射 Mission 恢复执行事件（替代 forwardRef 循环依赖）`，说明团队已意识到这个问题并开始用事件总线解决，应将此模式推广到其他 5 个 `forwardRef(() => ResearchLeaderService)` 的场景。

---

## 架构债务优先级矩阵

| 优先级 | 问题                                                              | 维度 | 影响范围   | 修复成本        | 建议时机 |
| ------ | ----------------------------------------------------------------- | ---- | ---------- | --------------- | -------- |
| P1     | 9 处 forwardRef 均无注释说明循环原因                              | D4   | 可维护性   | 低（纯注释）    | 本迭代   |
| P1     | `data-source-fetcher.service.ts:1035` 内联 import() 类型注释      | D1   | 代码规范   | 极低（1行改动） | 本迭代   |
| P2     | `ResearchLeaderService` 形成 5 处循环依赖，事件总线模式未完全推广 | D4   | 架构       | 高（需重构）    | 下次迭代 |
| P2     | `"grok-live-search"` 字符串字面量跨文件重复                       | D3   | 代码整洁   | 低（提取常量）  | 下次迭代 |
| P3     | `AiEngineModule` 直接路径（平台约定，需文档明确豁免规则）         | D1   | 规范清晰度 | 低（文档）      | 长期     |

---

## 必须处理（本迭代）

- [ ] `data-source-fetcher.service.ts:1035` 将内联 `import("@/modules/ai-engine/facade").ToolContext` 改为顶层 `import type { ToolContext }`（文件中已有导入）
- [ ] 为全部 9 个 `forwardRef` 注入点添加一行注释说明循环来源

## 计划处理（下次迭代）

- [ ] 在 `services/data/constants.ts` 提取 `GROK_LIVE_SEARCH_SOURCE = "grok-live-search"` 等常量，消除 `data-source-fetcher.service.ts` 和 `data-source-router.service.ts` 中的字符串重复
- [ ] 评估将 `forwardRef(() => ResearchLeaderService)` 的 5 处引用改为事件总线调用（参考 `ResearchEventEmitterService` 的现有模式）

## 长期改进

- [ ] 在项目架构规范中明确：`.module.ts` 的 `@Module({ imports })` 中可以直接引用 `XxxModule` 类（不受 facade 边界约束），或将 `AiEngineModule` 加入 facade 导出

---

_评分模型: v2.0 (维度 1-4 专项)_
_下次建议审计: 2026-04-10（全量 12 维度）_
_报告工具: Arch Auditor Agent v2.0_
