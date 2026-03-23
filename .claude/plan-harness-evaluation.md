# Harness 平台评估改进规划

> 两大方向：通用评估体系 + 工具效果评估

---

## 一、通用评估体系（Eval Framework）

### 现状分析

**已有的：**
- Research 模块：`DemoEvaluatorService` (3 层评估：Auto Metrics → LLM Judge → 组合分数)
- AI Engine：`EvalPipelineService` (3 层：Structural → AI Judge → User Signals)
- AI Kernel：`KernelMetricsService` (LLM 调用指标：延迟、token、成本)
- 数据库：`AIUsageLog` + `AIEngineMetric` 表已就绪
- Skill：`SkillAnalyticsService` (健康度打分、使用统计)

**缺的：**
- 只有 Research 有业务级评估，其他 14 个 AI App 模块没有
- `EvalPipelineService` 存在但未被大多数模块集成
- 没有跨模块的质量 Dashboard
- 没有评估驱动的自动迭代机制（eval 结果影响下一次行为）

### 设计方案

#### 核心思路：不为每个模块写独立的 Evaluator，而是**扩展 EvalPipelineService 为通用框架**，各模块只需注册自己的评估维度

#### 架构层级

```
L4 AI App 各模块
  │ 注册 EvalDimension[]（模块特有的评估维度）
  ↓
L3 AI Engine - EvalPipelineService (通用框架)
  │ Layer 1: Structural Checks（通用 + 模块自定义）
  │ Layer 2: AI Judge（按注册维度打分）
  │ Layer 3: User Signals（收集反馈）
  ↓
L2 AI Kernel - 指标持久化 + 聚合
  ↓
数据库: AIEngineMetric 表
```

#### Step 1: 定义通用评估接口（ai-engine 层）

**文件**: `backend/src/modules/ai-engine/infra/observability/eval-dimension.interface.ts`

```typescript
// 每个模块注册自己关心的评估维度
interface EvalDimension {
  id: string;                    // e.g. "writing.coherence"
  name: string;                  // e.g. "文章连贯性"
  description: string;           // 给 LLM Judge 的评分说明
  scale: [number, number];       // [1, 5] 或 [0, 1]
  weight: number;                // 在总分中的权重
  structuralCheck?: (output: unknown) => number; // 可选的结构化预检
}

interface EvalConfig {
  moduleId: string;              // e.g. "ai-writing"
  dimensions: EvalDimension[];
  samplingRate: number;          // 0.0-1.0，多少比例做 AI Judge
  escalationThreshold: number;   // Layer 1 低于此分 → 100% 触发 Layer 2
}
```

#### Step 2: 评估注册表（ai-engine 层）

**文件**: `backend/src/modules/ai-engine/infra/observability/eval-registry.ts`

```typescript
@Injectable()
class EvalRegistry {
  private configs = new Map<string, EvalConfig>();

  register(config: EvalConfig): void;
  getConfig(moduleId: string): EvalConfig | undefined;
  getAllConfigs(): EvalConfig[];
}
```

各模块在 `onModuleInit()` 中注册（沿用现有 Registry 模式）。

#### Step 3: 扩展 EvalPipelineService

**改动**: `backend/src/modules/ai-engine/infra/observability/eval-pipeline.service.ts`

- 现有逻辑保留（通用结构检查 + 通用 AI Judge）
- 新增：查找 `EvalRegistry` 中模块特定的维度，动态构建 LLM Judge prompt
- 新增：按模块聚合分数，写入 `AIEngineMetric`

#### Step 4: 各模块注册评估维度

**优先级排序**（按业务价值 + 改动量）：

| 优先级 | 模块 | 评估维度 | 理由 |
|--------|------|----------|------|
| P0 | **Teams** | 任务完成度、协作质量、修订轮数 | 核心模块，用户感知强 |
| P0 | **Writing** | 连贯性、信息密度、结构完整度 | 输出质量直接影响用户 |
| P1 | **Ask** | 回答准确性、引用质量、响应速度 | 高频使用 |
| P1 | **Office/Slides** | 结构合理性、视觉质量、内容匹配度 | 已有 benchmark，需接入 |
| P2 | **Social** | 平台适配度、吸引力、CTA 质量 | 较独立 |
| P2 | **Image** | prompt 匹配度、美学评分 | 图像评估较特殊 |
| P3 | **Planning** | 计划可行性、步骤完整度 | 使用频率较低 |
| P3 | **Simulation** | 观点多样性、辩论深度 | 使用频率较低 |

**示例 - Writing 模块注册**：

```typescript
// backend/src/modules/ai-app/writing/writing.module.ts
onModuleInit() {
  this.evalRegistry.register({
    moduleId: 'ai-writing',
    dimensions: [
      {
        id: 'writing.coherence',
        name: '连贯性',
        description: '文章段落之间的逻辑连贯性，过渡是否自然',
        scale: [1, 5],
        weight: 0.3,
      },
      {
        id: 'writing.information_density',
        name: '信息密度',
        description: '内容的信息量与篇幅的比值，避免空洞和重复',
        scale: [1, 5],
        weight: 0.3,
      },
      {
        id: 'writing.structure',
        name: '结构完整度',
        description: '是否有清晰的开头、主体、结尾，标题层级是否合理',
        scale: [1, 5],
        weight: 0.2,
        structuralCheck: (output) => {
          // 检查 Markdown 结构：标题层级、段落数
          const text = String(output);
          const hasH1 = /^# /m.test(text);
          const paragraphs = text.split('\n\n').length;
          return Math.min(1, (hasH1 ? 0.3 : 0) + Math.min(paragraphs / 5, 0.7));
        },
      },
      {
        id: 'writing.instruction_following',
        name: '指令遵循',
        description: '输出是否符合用户给出的写作要求（语气、长度、风格等）',
        scale: [1, 5],
        weight: 0.2,
      },
    ],
    samplingRate: 0.2,          // 20% 做 AI Judge
    escalationThreshold: 50,    // Layer 1 < 50 分则 100% Judge
  });
}
```

#### Step 5: 质量 Dashboard API

**新增 Controller**: `backend/src/modules/ai-engine/api/eval-dashboard.controller.ts`

```
GET /api/ai-engine/eval/overview         → 各模块质量概览
GET /api/ai-engine/eval/:moduleId        → 单模块详细评估数据
GET /api/ai-engine/eval/:moduleId/trend  → 质量趋势（7d/30d）
GET /api/ai-engine/eval/alerts           → 质量下降告警
```

不需要新前端页面（先在 Admin Dashboard 加一个 tab 即可）。

#### 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `ai-engine/infra/observability/eval-dimension.interface.ts` | 评估维度接口 |
| 新增 | `ai-engine/infra/observability/eval-registry.ts` | 评估注册表 |
| 修改 | `ai-engine/infra/observability/eval-pipeline.service.ts` | 扩展支持动态维度 |
| 修改 | `ai-engine/facade/index.ts` | 导出 EvalRegistry |
| 修改 | `ai-app/writing/writing.module.ts` | 注册写作评估维度 (P0) |
| 修改 | `ai-app/teams/teams.module.ts` | 注册协作评估维度 (P0) |
| 新增 | `ai-engine/api/eval-dashboard.controller.ts` | Dashboard API |
| 修改 | `ai-engine/ai-engine.module.ts` | 注册新 providers |

---

## 二、工具效果评估（Tool Effectiveness）

### 现状分析

**已有的：**
- 58 个生产工具，8 大类
- `ToolRegistry` 管理注册/发现
- `FunctionCallingExecutor` 有执行指标（duration、success、retries）
- `ToolResult` 含完整 metadata（时间、错误、重试）
- `AIUsageLog` 表支持 `capabilityType: "tool"` 但**未被工具执行链路写入**
- Middleware 管道（validation、timeout）

**缺的：**
- 工具执行不写 AIUsageLog（指标只存内存，请求结束就丢了）
- 没有工具级别的成功率/延迟/token 统计
- 没有"工具是否对最终结果有帮助"的评估
- 不知道 58 个工具里哪些是高价值的，哪些可以砍

### 设计方案

#### 核心思路：分两步走——先**埋点持久化**（知道工具被用了多少），再**效果评估**（知道工具用得好不好）

#### Phase A: 工具执行埋点（必做，投入小回报大）

##### A1: 在 FunctionCallingExecutor 中持久化工具调用

**改动**: `backend/src/modules/ai-engine/orchestration/executors/function-calling-executor.ts`

在每次 `executeTool()` 完成后，fire-and-forget 写入 `AIUsageLog`：

```typescript
// executeTool() 末尾新增
void this.persistToolUsage({
  capabilityType: 'tool',
  capabilityId: toolId,
  userId: context.userId,
  success: result.success,
  duration: result.metadata.duration,
  tokensUsed: result.metadata.tokensUsed ?? 0,
  errorCode: result.error?.code,
  errorMsg: result.error?.message,
  domain: context.metadata?.domain,
  metadata: {
    executionId: context.executionId,
    retryCount: context.retryCount,
    category: tool.category,
    callerModule: context.metadata?.callerModule,
  },
});
```

**关键设计决策：**
- Fire-and-forget（`void this.xxx()`），不阻塞主流程
- 复用 `AIUsageLog` 表，不建新表
- 加 `callerModule` 字段知道是哪个模块调的

##### A2: 工具分析服务

**新增**: `backend/src/modules/ai-engine/tools/analytics/tool-analytics.service.ts`

复用 `SkillAnalyticsService` 的模式（已验证可行）：

```typescript
@Injectable()
class ToolAnalyticsService {
  // 基础统计
  async getToolStats(toolId: string, range: '24h' | '7d' | '30d'): Promise<ToolStats>;

  // 全局概览：每个工具的调用次数、成功率、平均延迟
  async getOverview(range: string): Promise<ToolOverview[]>;

  // 未使用工具列表
  async getUnusedTools(range: string): Promise<string[]>;

  // 工具健康度评分（同 SkillAnalyticsService 的 health 模式）
  async getToolHealth(): Promise<ToolHealth[]>;

  // 模块维度：每个模块用了哪些工具
  async getUsageByModule(): Promise<ModuleToolUsage[]>;

  // 工具共现分析：哪些工具经常一起被用
  async getCoOccurrence(range: string): Promise<CoOccurrence[]>;
}

interface ToolStats {
  toolId: string;
  category: string;
  totalCalls: number;
  successRate: number;         // 0-1
  avgDuration: number;         // ms
  p95Duration: number;         // ms
  totalTokens: number;
  avgTokensPerCall: number;
  errorBreakdown: Record<string, number>;  // errorCode → count
  callerModules: Record<string, number>;   // moduleId → count
  timeline: { date: string; calls: number; successRate: number }[];
}
```

##### A3: Dashboard API

**新增**: `backend/src/modules/ai-engine/api/tool-dashboard.controller.ts`

```
GET /api/ai-engine/tools/analytics/overview     → 工具使用概览
GET /api/ai-engine/tools/analytics/:toolId      → 单工具详情
GET /api/ai-engine/tools/analytics/unused        → 未使用工具列表
GET /api/ai-engine/tools/analytics/health        → 工具健康度
GET /api/ai-engine/tools/analytics/by-module     → 按模块分组
```

#### Phase B: 工具效果评估（进阶，依赖 Phase A 数据积累）

> Phase A 上线 2-4 周后，有了足够数据再做

##### B1: 工具贡献度评估

**核心问题：这个工具对最终输出有没有帮助？**

方法：在 `EvalPipelineService` 的 Layer 2 (AI Judge) 中，增加一个维度——"工具调用贡献度"：

```typescript
// 在 AI Judge prompt 中增加
const toolContributionPrompt = `
以下是本次任务中调用的工具及其结果：
${toolCallsWithResults.map(t => `- ${t.toolId}: ${t.resultSummary}`).join('\n')}

最终输出：
${finalOutput}

请评估每个工具调用对最终输出的贡献度（0-5）：
- 0: 完全没用到
- 1: 几乎没贡献
- 3: 有一定帮助
- 5: 核心贡献
`;
```

这会告诉我们：
- `web-search` 被调了 10000 次，但贡献度平均只有 1.5 → 可能需要优化 prompt 或减少调用
- `arxiv-search` 被调了 200 次，贡献度平均 4.2 → 高价值工具

##### B2: 工具精简决策报告

基于 Phase A 数据 + B1 贡献度，自动生成月度报告：

```
工具精简建议报告 (2026-04)
===========================

建议移除 (0 次调用 in 30d):
  - container-executor (执行类)
  - sql-executor (执行类)
  - video-generation (生成类)

建议关注 (成功率 < 80%):
  - finance-api: 72% 成功率，主要错误: API_TIMEOUT
  - web-scraper: 68% 成功率，主要错误: BLOCKED_BY_CF

高价值工具 (高频 + 高贡献):
  - web-search: 8500 次/月，贡献度 3.8
  - knowledge-graph: 2100 次/月，贡献度 4.1

低效工具 (高频 + 低贡献):
  - data-fetch: 3200 次/月，贡献度 1.2 ← 重点优化
```

#### 文件变更清单

| 操作 | 文件 | 阶段 | 说明 |
|------|------|------|------|
| 修改 | `ai-engine/orchestration/executors/function-calling-executor.ts` | A | 埋点持久化 |
| 新增 | `ai-engine/tools/analytics/tool-analytics.service.ts` | A | 分析服务 |
| 新增 | `ai-engine/api/tool-dashboard.controller.ts` | A | Dashboard API |
| 修改 | `ai-engine/ai-engine.module.ts` | A | 注册新 providers |
| 修改 | `ai-engine/facade/index.ts` | A | 导出新服务 |
| 修改 | `ai-engine/infra/observability/eval-pipeline.service.ts` | B | 工具贡献度评估 |
| 新增 | `ai-engine/tools/analytics/tool-effectiveness-report.service.ts` | B | 月度报告 |

---

## 三、实施路线

```
Week 1-2: Phase A（工具埋点）
  ├── A1: FunctionCallingExecutor 埋点
  ├── A2: ToolAnalyticsService
  └── A3: Tool Dashboard API

Week 2-3: 评估框架核心
  ├── EvalDimension 接口 + EvalRegistry
  ├── 扩展 EvalPipelineService
  └── Eval Dashboard API

Week 3-4: P0 模块接入
  ├── Teams 评估维度注册
  ├── Writing 评估维度注册
  └── Admin Dashboard UI (tab)

Week 5-6: P1 模块 + Phase B
  ├── Ask、Office 评估维度注册
  ├── B1: 工具贡献度评估
  └── B2: 月度报告生成

Week 7+: P2/P3 模块 + 迭代
  ├── 剩余模块接入
  └── 基于数据调优（精简工具、调整权重）
```

---

## 四、设计原则

1. **复用优先**：复用 `AIUsageLog` 表、`SkillAnalyticsService` 模式、`EvalPipelineService` 框架，不造新轮子
2. **渐进式**：先埋点看数据，再做评估优化，避免过度设计
3. **不阻塞主流程**：所有评估都是 fire-and-forget，绝不影响用户请求延迟
4. **遵守分层**：新增代码严格在 L3 (AI Engine) 层，L4 (AI App) 只做注册
5. **数据驱动决策**：工具精简不靠猜，靠 30 天数据说话

---

## 五、风险与注意事项

| 风险 | 缓解措施 |
|------|----------|
| AI Judge 调用增加 LLM 成本 | 采样率控制（20%），Layer 1 预筛降低无效调用 |
| AIUsageLog 数据量增长 | 工具调用量可控（~5-10 次/请求），定期归档 |
| 评估维度设计不准确 | 先小范围上线 P0 模块，根据数据调整权重和维度 |
| 与现有 Research eval 冲突 | Research 的 DemoEvaluator 保留，通用框架作为补充层 |
