# 模型能力驱动运行时 —— 零 provider 名硬编码彻底整改方案

> **状态**:设计稿(2026-05-24,等执行)
> **作者**:Claude(沿用本仓库 CLAUDE.md "禁止 provider-specific 硬编码"红线)
> **替代**:`includes("deepseek"|"gpt"|"claude"|"gemini"|"grok"|...)` 散点反模式
> **触发事件**:线上 mission 撞 `deepseek-v4-pro: response_format type is unavailable` 一上来死;追溯发现 `ai-api-caller.service.ts:371` 形如 `modelLower.includes("deepseek-reasoner")` 的 substring 判能力散布整个 engine。
> **范围**:`modules/ai-engine/llm/**` + `modules/ai-harness/runner/**` + `modules/ai-harness/agents/**`。
> **不在范围**:UI 图标映射、admin tier 优先级表(有意的能力分级)、测试 fixture。

---

## 1 · 问题陈述

### 1.1 反模式实例

代码靠 `modelId.includes("某关键词")` 推断模型能力,而非读 model config 上的能力字段:

```ts
// ai-api-caller.service.ts:371 —— 触发本轮事件的精确反模式
const isDeepseekReasoner = modelLower.includes("deepseek-reasoner");
if (...!isDeepseekReasoner) {
  requestBody["response_format"] = { type: "json_schema", ... };  // ← 任何"也不支持 json_schema 的非 reasoner"全挂
}

// ai-chat.service.ts:509-520
if (modelLower.includes("grok")) ... else if (modelLower.includes("claude")) ...

// function-calling-llm.adapter.ts:555-582
if (lower.includes("xai") || lower.includes("grok")) ...
if (lower.includes("openai") || lower.includes("gpt")) ...

// model.utils.ts:22-34
const isReasoning =
  modelLower.includes("gpt-5") ||
  modelLower.includes("deepseek-r1") ||
  modelLower.includes("claude-4") || ...
```

### 1.2 危害矩阵

| #   | 危害                                        | 实证                                                                                 |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | **能力假设错配 → 一上来就 INVALID_REQUEST** | 2026-05-24 实跑:deepseek-v4-pro(非 reasoner)发 json_schema 被拒,leader S2 一上来判废 |
| 2   | **新模型/新版本静默漏判**                   | 注释自承:"硬编码漏 o4 系列问题";新 gemini-3 / claude-5 等加入时同一处又要补          |
| 3   | **改一个能力要 grep 全仓**                  | "deepseek 不支持 X" 这事得改 N 处 includes                                           |
| 4   | **能力定义没有单一权威**                    | router 维护一张表、api-caller 维护另一张、tier types 维护第三张,各自漂移             |
| 5   | **看护机制缺失**                            | 谁都能在新代码里写 `includes("xai")`,无 lint/test 拦                                 |

### 1.3 全量审计(范围内)

按危害分级,排除测试 / UI / 适配器路由:

| 等级                                | 数量  | 代表位置                                                                                                                                     |               必改               |
| ----------------------------------- | :---: | -------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------: |
| 🔴 P0 业务主流程靠 substring 判能力 | 6 处  | `ai-api-caller:371`、`ai-chat:509-520`、`function-calling-adapter:555-582`、`ai-direct-key:677/778`、`ai-connection-test:338`、`ai-chat:573` |                ✅                |
| 🟡 P1 启发式名表(有兜底意义)        | 2 处  | `model.utils.ts:22-34 inferIsReasoning`、`user-models-auto-configure:428-538`                                                                | ✅(降级为 fallback,不在主流程读) |
| 🟢 P2 合理(保留 + 加注释)           | ~6 处 | UI 图标、tier 正则、adapter 路由 fallback、selection priority                                                                                |                ❌                |

---

### 1.4 案例研究:`deepseek-v4-pro` —— 三条能力正交的活样本

2026-05-24 用户实跑 `deepseek-v4-pro` 一上来死。事后查证 DeepSeek 官方信息:

| 模型                                  | `isReasoning`(吃 reasoning tokens) | `thinkingMode` |                   `responseFormatSupport`                   |
| ------------------------------------- | :--------------------------------: | :------------: | :---------------------------------------------------------: |
| `deepseek-chat` (= V4-Flash 非思考)   |                 ❌                 |      none      |                        `json_object`                        |
| `deepseek-reasoner` (= V4-Flash 思考) |                 ✅                 |     always     |       **none**(thinking mode 不接受 response_format)        |
| `deepseek-v4-pro`                     |                 ✅                 |    optional    | **json_object**(API 现状不支持 json_schema,即使非 thinking) |
| `deepseek-v4-flash`                   |               视模式               |    optional    |                        `json_object`                        |

**对老代码的否定**:

```ts
const isDeepseekReasoner = modelLower.includes("deepseek-reasoner");
// ↑ 三重错误:
//   1. `v4-pro` 不含 "reasoner",老逻辑判 false → 发 json_schema → 撞拒
//   2. `v4-pro` 实际上**是推理模型**(isReasoning=true),老逻辑漏判 reasoning_tokens 预算
//   3. `v4-pro` 即使非 thinking 模式也不支持 json_schema(deepseek API 整体未支持)
```

**这三条结论里没有任何一条能从模型名"猜"出来**。证明:

- 能力是**模型 + provider API 现状**的复合属性,只有模型方/admin 能定义
- 三条能力(`isReasoning` / `thinkingMode` / `responseFormatSupport`)**完全正交**,不能用一个布尔 substring 判
- 每加一种 capability(thinking mode、tool_use parallel、cache control...),靠名字 grep 都会再炸一次

**方案对应**:

- 三条能力分别独立成 `AIModelConfig` 字段(§3.1)
- Catalog 数据明确分开列举(§3.2)
- 自愈兜底网在用户实际配错/catalog 漏配时自动学习(§3.4)

---

## 2 · 目标 / 非目标

### 2.1 目标

1. **零 provider 名硬编码**:`ai-engine/llm/services/**`、`ai-engine/llm/adapters/**`、`ai-harness/runner/**` 主流程禁止 `modelId.includes("X")` / `provider === "X"` 之类。所有能力判定走 `AIModelConfig` 字段。
2. **能力是数据,不是代码**:每条能力是 DB 上的字段;新 provider 加进来只需填字段,**零代码变更**。
3. **自愈兜底**:即使字段没填,运行时撞到 provider 拒绝 → 自动降级 + 把降级结果**写回 DB**,下次自动用对的路径。
4. **看护拦截**:ESLint 自定义 + jest 契约测试,任何回潮的 substring-on-modelId 反模式 CI 红。
5. **不破坏现有调用**:迁移期 fallback 链保留;每片单独可回滚。

### 2.2 非目标

- 不重构 admin tier 系统(model-tier.types / model-fallback 的正则表是有意的运维能力分级,与运行时能力是两件事)。
- 不动 UI 图标/显示名映射(纯装饰)。
- 不要求一次性完成;按 6 阶段切片,每阶段单独 PR 单独可验证。

---

## 3 · 系统设计

### 3.1 数据模型:`ModelCapabilities`

挂在 `AIModelConfig` 上的能力字段集合(DB schema 同步加列;UserModelConfig 同步):

| 字段                     | 类型   | 取值                                                                | 决定                                                                                                                                              |
| ------------------------ | ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `responseFormatSupport`  | enum   | `none` / `json_object` / `json_schema_loose` / `json_schema_strict` | API caller 用哪一档 response_format                                                                                                               |
| `nativeStructuredOutput` | enum   | `none` / `json_schema` / `tool_use` / `gbnf`                        | structured-output router 选 strategy 链头                                                                                                         |
| `toolUseSupport`         | enum   | `none` / `single` / `parallel`                                      | function calling 模式                                                                                                                             |
| `cacheControlSupport`    | bool   | —                                                                   | anthropic prompt cache 等                                                                                                                         |
| `thinkingMode`           | enum   | `none` / `optional` / `always`                                      | 是否支持/强制 thinking 模式(deepseek-v4 系列 / claude extended thinking / gemini-2.5 等)。`optional` 时由 request hint 切换                       |
| `isReasoning`            | bool   | —                                                                   | **已存在**,保留。**与 thinkingMode 正交**:推理模型可能本质上吃 reasoning_tokens(影响 maxTokens 预算),但是否进入 thinking 输出由 thinkingMode 决定 |
| `supportsTemperature`    | bool   | —                                                                   | **已存在**,保留                                                                                                                                   |
| `tokenParamName`         | string | `max_tokens` / `max_completion_tokens`                              | **已存在**,保留                                                                                                                                   |
| `apiFormat`              | enum   | `openai` / `anthropic` / `google` / `xai`                           | **已存在**,作为 adapter 路由                                                                                                                      |
| `provider`               | string | —                                                                   | **已存在**,作为目录归属(允许在 UI/icons 显示;**禁止在主流程做能力判断**)                                                                          |

> **关键设计原则**:`provider` 字段是**目录归属**(影响 key 怎么解析、API endpoint),**不是能力描述**。能力一律走上面的能力字段。

### 3.2 解析层:`ModelCapabilityRegistry`

新建 `modules/ai-engine/llm/capability/model-capability-registry.service.ts`,**单一权威解析**:

```ts
@Injectable()
export class ModelCapabilityRegistry {
  // 三级优先级解析,前面有就返回
  resolve(config: AIModelConfig): ModelCapabilities {
    // 1) DB 字段(admin/user 显式配)
    const fromConfig = this.fromConfig(config);
    if (this.isComplete(fromConfig)) return fromConfig;

    // 2) Catalog 模板(curated 数据文件,按 provider+family 命中)
    const fromCatalog = this.catalog.lookup(config.modelId, config.provider);

    // 3) 保守默认(unknown provider 也能跑)
    return merge(fromConfig, fromCatalog, SAFE_DEFAULTS);
  }
}
```

**Catalog 模板**:新建 `modules/ai-engine/llm/capability/model-capability-catalog.ts`——**纯数据文件**,集中维护已知 provider+model 家族的能力默认值:

```ts
// 仅作 model discovery / 首次 BYOK 加模型时的 default 填充,运行时不查询。
// 新 provider 加进来只在这里加一条数据,零业务代码改动。
//
// match 命中顺序:更具体的 modelPattern 优先(deepseek-reasoner 比 deepseek* 先匹配)。
// 任何条目的字段不全没关系——SAFE_DEFAULTS 兜底,自愈网在线学习。
export const CAPABILITY_CATALOG: ReadonlyArray<CapabilityCatalogEntry> = [
  // DeepSeek 系列(参 §1.4 案例研究)
  {
    match: { provider: "deepseek", modelPattern: /reasoner|thinking/i },
    capabilities: {
      isReasoning: true,
      thinkingMode: "always",
      responseFormatSupport: "none", // thinking 模式拒 response_format
      nativeStructuredOutput: "none",
    },
  },
  {
    match: { provider: "deepseek", modelPattern: /v4-pro/i },
    capabilities: {
      isReasoning: true, // 推理模型,吃 reasoning tokens
      thinkingMode: "optional", // 可由 request hint 切换
      responseFormatSupport: "json_object", // 现 API 不支持 json_schema
      nativeStructuredOutput: "none",
    },
  },
  {
    match: { provider: "deepseek" }, // chat / v4-flash 等
    capabilities: {
      isReasoning: false,
      thinkingMode: "none",
      responseFormatSupport: "json_object",
      nativeStructuredOutput: "none",
    },
  },
  // OpenAI / Anthropic / Google / xAI / Qwen / Moonshot / ... 按已知行为分别列
];
```

> **这是设计上唯一允许的 "provider 名字符串"出现地**——因为它**就是数据**(catalog),不在业务路径,等同 `cities.json`。读它的代码全程零 `if (provider === "X")`。

**保守默认**(catalog 没命中的未知 provider):

```ts
const SAFE_DEFAULTS: ModelCapabilities = {
  responseFormatSupport: "json_object", // 几乎所有 OpenAI-compatible 都支持
  nativeStructuredOutput: "none", // 退化到 prompt 注入
  toolUseSupport: "none",
  cacheControlSupport: false,
  isReasoning: false,
  supportsTemperature: true,
};
```

### 3.3 主流程改造:caller 只读 capabilities

**`ai-api-caller.service.ts`(核心改造)**:

```ts
// 删 isDeepseekReasoner 这种 substring 判断,改成:
const caps = this.capabilityRegistry.resolve(config);

switch (caps.responseFormatSupport) {
  case "json_schema_strict":
    requestBody.response_format = { type: "json_schema", json_schema: { ..., strict: true } };
    break;
  case "json_schema_loose":
    requestBody.response_format = { type: "json_schema", json_schema: { ..., strict: false } };
    break;
  case "json_object":
    requestBody.response_format = { type: "json_object" };
    // schema 注入 system prompt 做软约束
    injectJsonHintToSystemPrompt(messages, outputJsonSchema);
    break;
  case "none":
    // 不发 response_format,纯 system-prompt 约束
    injectJsonHintToSystemPrompt(messages, outputJsonSchema);
    break;
}
```

**`structured-output-router.service.ts`**:把 `match: (p) => /deepseek/.test(p)` 这种条目去掉,改成读 `caps.nativeStructuredOutput`,把 strategy 链生成逻辑搬到 `CAPABILITY_CATALOG`(数据)。

**`ai-chat.service.ts:509-520` / `function-calling-llm.adapter.ts:555-582`** 推 provider 的 substring 判断 → 直接用 `config.apiFormat` 路由(字段已存在,零新增)。

### 3.4 自愈兜底:运行时学习

即使 catalog 漏配/admin 没填,撞到 provider 拒绝时**自动降级 + 持久化**:

```ts
// ai-api-caller.service.ts 包装层
async callWithCapabilityHealing(config, request, caps) {
  try {
    return await this.callRaw(config, request);
  } catch (err) {
    const downgrade = detectCapabilityDowngrade(err, caps);
    // 例:err.message 含 "response_format ... unavailable/unsupported"
    //   → downgrade = { responseFormatSupport: "none" }
    if (!downgrade) throw err;

    this.logger.warn(`[capability-self-heal] ${config.modelId} ${JSON.stringify(downgrade)}`);
    // 1) 同请求按降级后能力重试(同模型,不换)
    const newCaps = { ...caps, ...downgrade };
    const result = await this.callRaw(config, this.rebuild(request, newCaps));
    // 2) 持久化:把降级写回 DB,下次自动用对的
    await this.modelConfigService.updateCapabilities(config.modelId, downgrade);
    return result;
  }
}
```

**误差信号 → 降级映射**(完全数据驱动,在 capability/error-signals.ts):

```ts
// 通用正则,匹配多家 provider 的错误措辞,不写任何 provider 名
const ERROR_DOWNGRADE_RULES: Array<{
  match: RegExp;
  downgrade: Partial<ModelCapabilities>;
  rationale: string;
}> = [
  {
    match:
      /response_format.*(?:unavailable|unsupported|not\s+supported|invalid)/i,
    downgrade: { responseFormatSupport: "none" },
    rationale: "Provider rejected response_format → drop it, use prompt hint",
  },
  {
    match: /json_schema.*(?:unsupported|not\s+supported|invalid_type)/i,
    downgrade: { responseFormatSupport: "json_object" },
    rationale: "Provider supports json_object but not json_schema",
  },
  {
    match: /tool_use.*unsupported|tools.*not\s+supported/i,
    downgrade: { toolUseSupport: "none" },
    rationale: "Provider rejected tool_use → fallback to prompt",
  },
  // ... 仍然不写 deepseek / openai 等 provider 名
];
```

**意义**:

1. **完全数据驱动**——上面整条链零 provider 名硬编码
2. **自我增强**——线上新 provider 没填 catalog 也能跑,且自动学
3. **可观测**——self-heal log + DB capability 更新审计

### 3.5 看护机制(防回潮)

**ESLint 自定义规则** `eslint-rules/no-model-name-string-match.js`:

```js
// 禁止在指定路径下用 modelId/provider 名做 substring/正则
{
  meta: { schema: [{ properties: { allowedPaths: { ... } } }] },
  create(context) {
    return {
      CallExpression(node) {
        // 1. xxx.includes("deepseek"|"gpt"|"claude"|"gemini"|"grok"|"xai"|...)
        // 2. /deepseek|gpt|claude|.../.test(xxx)
        // 3. xxx === "deepseek" | "openai" | ...
        if (matchesForbiddenPattern(node)) {
          context.report({
            node,
            message:
              "禁止用 modelId/provider 名做 substring/正则判定。" +
              "改用 ModelCapabilities 字段(参 model-capability-driven-runtime.md)。",
          });
        }
      },
    };
  },
}
```

**白名单路径**(在 `.eslintrc.js`):

- `modules/ai-engine/llm/capability/model-capability-catalog.ts`(catalog 数据文件,允许)
- `**/icons/**` / display name 路径(UI 装饰,允许)
- `__tests__/**`(测试 fixture,允许)
- adapter 路由 fallback(`config.apiFormat` 缺失时的兜底,带 `// eslint-disable-next-line ... reason: fallback-only` 标记)

**Jest 契约测试** `__tests__/architecture/no-model-name-hardcode.contract.spec.ts`:

```ts
// 静态扫描禁区文件,确保没有 provider 名 substring
const FORBIDDEN_PATHS = [
  "src/modules/ai-engine/llm/services/**/*.ts",
  "src/modules/ai-engine/llm/adapters/**/*.ts",
  "src/modules/ai-harness/runner/**/*.ts",
];
const FORBIDDEN_NAMES = [
  "deepseek", "openai", "gpt-", "claude", "anthropic",
  "gemini", "grok", "xai", "qwen", "kimi", "moonshot", ...
];

it("禁区文件不得包含 provider 名 substring(白名单除外)", () => {
  for (const file of glob(FORBIDDEN_PATHS)) {
    if (isWhitelisted(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const name of FORBIDDEN_NAMES) {
      const hits = findStringLiteralOccurrences(src, name);
      expect(hits).toEqual([]);
    }
  }
});
```

---

## 4 · 6 阶段迁移计划

每片 = 独立 PR + 独立 verify + 单独可回滚。

### 阶段 A:**自愈兜底网 + capability 最小集** ⏱ 即时止血

**问题**:你今天的 mission 一上来就死。

**改动**:

1. 加 `ModelCapabilities` 类型(`capability/model-capabilities.types.ts`)
2. 加 `ModelCapabilityRegistry` + `CAPABILITY_CATALOG` 最小集(只填 `responseFormatSupport`)
3. `ai-api-caller.service.ts` 把 `isDeepseekReasoner` 删掉,改读 `caps.responseFormatSupport`
4. 包 `callWithCapabilityHealing`:`response_format unavailable/unsupported` → 同模型降级重试 + log(暂不写回 DB,下一阶段加)
5. Catalog 数据:`provider:"deepseek"` 默认 `responseFormatSupport: "json_object"`;`deepseek-reasoner` `"none"`;其它 provider 按照已知行为填

**Verify**:

- 单测:capability resolve 三级优先级 + catalog 命中
- 集成:mock 一次 `INVALID_REQUEST: response_format unavailable` → 自愈降级 → 第二次成功
- 删除 `isDeepseekReasoner` 后,deepseek-v4-pro mock 走 json_object 路径,不报错

**风险**:中(改 API caller 核心),自愈兜底让风险可控。

**预估**:~6 小时(含测试)。

### 阶段 B:**capability 持久化 + DB schema**

**改动**:

1. Prisma 迁移:`AIModel` + `UserModelConfig` 加 `responseFormatSupport` 等列(nullable,迁移 default null)
2. `AiModelConfigService` 读 DB 字段填充 `AIModelConfig`
3. `ModelCapabilityRegistry.resolve()` 优先级生效:DB → Catalog → Default
4. 自愈降级**写回 DB**(`updateCapabilities`),下次自动用对的

**Verify**:迁移可逆;无字段时退化到 catalog;写回后下次读 DB 值生效

**风险**:低(纯附加列)

**预估**:~4 小时

### 阶段 C:**全 P0 反模式清扫**

**改动**:

1. `ai-chat.service.ts:509-520` `includes("grok"/"claude"/"gemini")` → `config.apiFormat` 路由
2. `function-calling-llm.adapter.ts:555-582` → 同上,用 `config.apiFormat` / `config.provider`
3. `ai-direct-key.service.ts:677/778` gemini 硬判 → `config.apiFormat === "google"`
4. `ai-connection-test.service.ts:338` gemini-2.0-flash-exp 硬判 → 通过 capability 字段
5. `ai-chat.service.ts:573` 推理模型 maxTokens 注释相关 → 读 `caps.isReasoning`

**Verify**:对应集成测试(连接测试、function calling、direct key)无回归

**风险**:中(改路由),`config.apiFormat` 已是既有字段降低风险

**预估**:~6 小时

### 阶段 D:**P1 启发式降为 fallback + 注释强化**

**改动**:

1. `model.utils.ts:inferIsReasoning` 改名 `inferIsReasoningFromName`,顶部大注释:**仅作 DB 字段为空时的本地启发,主流程必读 `config.isReasoning`**
2. `user-models-auto-configure.service.ts` 启发式字段:仅用于**首次创建模型时填默认值**,运行时不再调用。注释强标。

**Verify**:`inferIsReasoningFromName` 在主流程的调用全部走 `config.isReasoning ?? inferIsReasoningFromName(...)` 的兜底链

**风险**:极低

**预估**:~2 小时

### 阶段 E:**`nativeStructuredOutput` + router 配置化**(可选,看情况)

把 `structured-output-router.service.ts` 里 `match: (p) => /deepseek/.test(p)` 这种条目从 router 代码搬到 catalog,router 只读 `caps.nativeStructuredOutput`。

**预估**:~4 小时

### 阶段 F:**看护机制**

1. ESLint 自定义规则 + `.eslintrc.js` 接入 + 白名单
2. Jest 契约测试静态扫描
3. CI 集成

**Verify**:故意在禁区写 `modelLower.includes("deepseek")` → ESLint 红 + 测试红 + CI 红

**风险**:极低(纯护栏)

**预估**:~3 小时

### 总工作量

约 **25 小时**净开发(不算 review/部署),核心(A+B+C+F)≈ **19 小时**。

---

## 5 · 验收标准

| #   | 标准                                                                                                    | 验证方式              |
| --- | ------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | `ai-engine/llm/services/**` 和 `ai-harness/runner/**` 0 处 `includes("deepseek"\|"gpt"\|"claude"\|...)` | 契约测试              |
| 2   | 新 provider 加进来,**仅需在 catalog 加一行数据**,业务代码 0 改动                                        | 加 mock provider 走通 |
| 3   | provider 报 `response_format unavailable` → 自动降级 + 重试 + DB 写回 + 下次直走对的路径                | 集成测试 + log 审计   |
| 4   | 删 `isDeepseekReasoner` 后,deepseek-v4-pro / deepseek-reasoner 全跑通                                   | 集成测试覆盖两种      |
| 5   | ESLint 红 + Jest 红 + CI 红 在故意写 `modelLower.includes("deepseek")` 时全部生效                       | 故意失败用例          |
| 6   | 无回归:`ai-chat` 全量测试、failover 全量测试、架构边界 132 测试全绿                                     | 现有套件              |

---

## 6 · 风险与回滚

| 风险                                               | 缓解                                                                                                                        |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| capability 字段填错(误标 strict→provider 返回 4xx) | 自愈降级网兜底 + 写回 DB 自动纠错                                                                                           |
| catalog 数据缺失新 provider                        | 保守 default(`json_object` + `none` strategy) + 自愈学习                                                                    |
| 阶段 C 改路由有回归                                | `config.apiFormat` 已是既有字段;迁移期保留 modelLower 作 fallback(`config.apiFormat ?? inferApiFormatFromName(modelLower)`) |
| 迁移期 DB 字段为 null 的旧行                       | resolve() fallback 链:DB → catalog → safe default,null 字段不影响行为                                                       |

**回滚**:每阶段单独 commit + 独立可 revert;capability 字段为 nullable,字段为 null 时退化到 pre-A 行为。

---

## 7 · 与已有规范的对照

- ✅ 完全符合 `CLAUDE.md` "**禁止 provider-specific 硬编码**"红线
- ✅ 完全符合 "**走 TaskProfile,不硬编码模型/温度**"原则
- ✅ 与 `model-failover.classifier.ts`(BYOK code 驱动)同思想:**机制驱动,不字面匹配**
- ✅ 与 `runChatWithModelFailover` 一致:**抽离独立 util,god-class 不膨胀**

---

## 8 · 不动的部分(明确边界)

- `ai-engine/llm/types/model-tier.types.ts` 正则表 → admin 运维能力**分级**,与运行时能力**正交**,保留
- `selection/model-fallback.service.ts` 优先级正则 → admin 选模型时用,**非运行时调用路径**,保留
- `services/ai-model-config.service.ts:1343+` 图标路径 → 纯 UI 装饰,保留
- `services/ai-model-discovery.service.ts` display name → 列表显示,保留

这些位置统一加注释:`// 非运行时能力判断;运维/装饰用途。运行时能力判断必须走 ModelCapabilityRegistry。`

---

## 9 · 决策记录(ADR)

| 决策                | 选项                               | 选             | 理由                                                             |
| ------------------- | ---------------------------------- | -------------- | ---------------------------------------------------------------- |
| 能力数据放哪        | a) DB 字段 b) 配置文件 c) 代码常量 | **a + b 互补** | DB 让 admin/user 可覆盖;catalog 配置文件让新 provider 加入零代码 |
| 自愈写回 DB         | a) 写 b) 只 log                    | **a**          | 自学闭环,运营成本最低                                            |
| 看护机制            | a) ESLint b) 测试 c) 都做          | **c**          | ESLint IDE 实时阻断 + 测试 CI 强拦,双层防漏                      |
| `provider` 字段定位 | a) 能力 b) 目录                    | **b**          | 能力一律走能力字段;provider 仅作 key 解析/UI 标签                |

---

## 10 · 落地后状态(目标态)

打开任意 `ai-engine/llm/services/*.ts`、搜 `includes("deepseek"|"gpt"|"claude"|"gemini"|"grok"|"xai")`,**返回 0 结果**(除 catalog 数据文件)。新 provider 加入步骤:

1. `model-capability-catalog.ts` 加一条数据
2. (可选)admin 在 `/admin/ai/models` UI 微调
3. 完工

无需改 `ai-chat.service`、无需改 `ai-api-caller`、无需改 router、无需改 adapter。
