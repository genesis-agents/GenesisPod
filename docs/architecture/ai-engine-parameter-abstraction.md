# AI Engine 参数抽象架构设计文档

> **状态**: 待评审
> **创建日期**: 2026-01-10
> **作者**: Claude Code

---

## 1. 问题诊断

### 1.1 核心问题

AI App 层直接传递模型特定参数（temperature, maxTokens），导致以下问题：

1. **参数名称不统一**：不同模型使用不同参数名
   - OpenAI: `max_tokens` / `max_completion_tokens`
   - Google: `maxOutputTokens`
   - 有些模型不支持 `temperature`

2. **参数范围不同**：
   - 推理模型（o1, o3, gpt-5）需要更多 tokens 用于内部推理
   - 某些模型 temperature 范围不同

3. **硬编码散落**：
   - 50+ 处 temperature 硬编码（0.1-0.9）
   - 50+ 处 maxTokens 硬编码（500-16000）
   - 1 处模型名称硬编码 "gpt-4o-mini"

### 1.2 现有统计

基于代码库扫描的硬编码分布：

| 参数值               | 出现次数 | 典型场景              |
| -------------------- | -------- | --------------------- |
| temperature: 0.1-0.3 | ~25      | JSON 提取、分类、分析 |
| temperature: 0.5     | ~10      | 反思、评估            |
| temperature: 0.7     | ~35      | 通用对话、研究        |
| temperature: 0.8-0.9 | ~16      | 创意写作              |
| maxTokens: 500-1500  | ~15      | 短响应、提取          |
| maxTokens: 2000-4000 | ~30      | 中等响应、分析        |
| maxTokens: 6000-8000 | ~25      | 长内容、章节          |
| maxTokens: 16000+    | ~8       | 推理模型、超长内容    |

### 1.3 已有但未使用的基础设施

| 组件                      | 位置                         | 状态                                |
| ------------------------- | ---------------------------- | ----------------------------------- |
| `TaskProfile` 接口        | `ai-chat.service.ts:37-56`   | 已定义，从未使用                    |
| `AIModelType` 枚举        | `schema.prisma:2342-2357`    | 已使用（CHAT, CHAT_FAST 等）        |
| `getDefaultModelByType()` | `ai-chat.service.ts:297-360` | 已实现                              |
| 数据库模型配置            | AIModel 表                   | maxTokens, temperature, isReasoning |

---

## 2. 解决方案设计

### 2.1 架构原则

```
┌────────────────────────────────────────────────────────────┐
│  AI App 层                                                  │
│  职责：描述任务需求（WHAT）                                  │
│  - 使用 TaskProfile 描述任务特征                            │
│  - 指定 modelType 而非具体模型名                            │
│  - 不了解模型参数细节                                       │
└───────────────────────┬────────────────────────────────────┘
                        │ taskProfile + modelType
                        ↓
┌────────────────────────────────────────────────────────────┐
│  AI Engine 层                                               │
│  职责：处理模型细节（HOW）                                  │
│  - 根据 TaskProfile 映射到具体参数                          │
│  - 根据 modelType 从数据库选择模型                          │
│  - 处理不同模型的参数差异（名称、类型、范围）               │
│  - 推理模型特殊处理                                         │
└────────────────────────────────────────────────────────────┘
```

### 2.2 TaskProfile 接口设计

```typescript
// backend/src/modules/ai-engine/llm/types/task-profile.ts

export type CreativityLevel =
  | "deterministic" // 分类、提取、JSON → temp ~0.1
  | "low" // 分析、总结 → temp ~0.3
  | "medium" // 对话、研究 → temp ~0.7
  | "high"; // 创意写作 → temp ~0.9

export type OutputLengthLevel =
  | "minimal" // ~500 tokens: 是/否判断、分类
  | "short" // ~1500 tokens: 摘要、简短回复
  | "medium" // ~4000 tokens: 详细分析、对话
  | "long" // ~8000 tokens: 报告、章节
  | "extended"; // ~16000+ tokens: 超长内容、推理模型

export type TaskType =
  | "extraction" // 实体提取、解析
  | "analysis" // 深度分析、评估
  | "conversation" // 对话、问答
  | "writing" // 内容创作
  | "reflection"; // 自我评估、元认知

export type OutputFormat =
  | "json" // 结构化 JSON
  | "markdown" // 格式化 Markdown
  | "plaintext"; // 纯文本

export interface TaskProfile {
  creativity?: CreativityLevel;
  outputLength?: OutputLengthLevel;
  taskType?: TaskType;
  outputFormat?: OutputFormat;
}
```

### 2.3 参数映射规则

#### 2.3.1 创意度 → temperature 映射

| CreativityLevel | temperature | 适用场景              |
| --------------- | ----------- | --------------------- |
| `deterministic` | 0.1         | 分类、提取、JSON 解析 |
| `low`           | 0.3         | 分析、总结、评估      |
| `medium`        | 0.7         | 对话、研究、规划      |
| `high`          | 0.9         | 创意写作、头脑风暴    |

#### 2.3.2 输出长度 → maxTokens 映射

| OutputLengthLevel | maxTokens | 适用场景             |
| ----------------- | --------- | -------------------- |
| `minimal`         | 500       | 是/否判断、分类标签  |
| `short`           | 1500      | 摘要、简短回复       |
| `medium`          | 4000      | 详细分析、标准对话   |
| `long`            | 8000      | 报告、章节、全面分析 |
| `extended`        | 16000     | 超长内容、推理模型   |

#### 2.3.3 特殊调整规则

1. **推理模型**（isReasoning=true）：
   - 强制 `maxTokens >= 8000`
   - `extended` 输出自动提升到 16000

2. **JSON 输出格式**：
   - 强制 `temperature <= 0.3`（确保结构稳定）

3. **不支持 temperature 的模型**：
   - 跳过 temperature 参数

### 2.4 TaskProfileMapper 服务

```typescript
// backend/src/modules/ai-engine/llm/services/task-profile-mapper.service.ts

@Injectable()
export class TaskProfileMapperService {
  private readonly logger = new Logger(TaskProfileMapperService.name);

  /**
   * 将 TaskProfile 映射为具体模型参数
   * 这是唯一了解模型参数细节的地方
   */
  mapToParameters(
    profile: TaskProfile,
    modelConfig: AIModelConfig | null,
  ): { temperature: number; maxTokens: number } {
    // 1. 基础映射
    const baseTemperature = this.mapCreativityToTemperature(profile.creativity);
    const baseMaxTokens = this.mapOutputLengthToTokens(profile.outputLength);

    // 2. 推理模型调整
    const isReasoning = modelConfig?.isReasoning ?? false;
    let effectiveMaxTokens = baseMaxTokens;
    if (isReasoning) {
      effectiveMaxTokens = Math.max(baseMaxTokens, 8000);
      if (profile.outputLength === "extended") {
        effectiveMaxTokens = Math.max(effectiveMaxTokens, 16000);
      }
    }

    // 3. 不超过模型配置的最大值
    const modelMaxTokens = modelConfig?.maxTokens ?? 4096;
    effectiveMaxTokens = Math.min(effectiveMaxTokens, modelMaxTokens);

    // 4. JSON 格式需要更低 temperature
    let effectiveTemperature = baseTemperature;
    if (profile.outputFormat === "json") {
      effectiveTemperature = Math.min(effectiveTemperature, 0.3);
    }

    this.logger.debug(
      `[mapToParameters] Profile: ${JSON.stringify(profile)} → ` +
        `temp=${effectiveTemperature}, maxTokens=${effectiveMaxTokens}`,
    );

    return {
      temperature: effectiveTemperature,
      maxTokens: effectiveMaxTokens,
    };
  }

  private mapCreativityToTemperature(level?: CreativityLevel): number {
    switch (level) {
      case "deterministic":
        return 0.1;
      case "low":
        return 0.3;
      case "medium":
        return 0.7;
      case "high":
        return 0.9;
      default:
        return 0.7;
    }
  }

  private mapOutputLengthToTokens(level?: OutputLengthLevel): number {
    switch (level) {
      case "minimal":
        return 500;
      case "short":
        return 1500;
      case "medium":
        return 4000;
      case "long":
        return 8000;
      case "extended":
        return 16000;
      default:
        return 4000;
    }
  }
}
```

### 2.5 chat() 方法更新

```typescript
// ai-chat.service.ts - 更新后的 chat() 方法签名

async chat(options: {
  messages: ChatMessage[];
  systemPrompt?: string;

  // ★ 推荐：语义化任务描述
  /** Task profile - AI Engine 映射为具体参数 */
  taskProfile?: TaskProfile;
  /** 模型类型 - AI Engine 从数据库选择具体模型 */
  modelType?: AIModelType;

  // 兼容：直接参数（优先级最高，用于特殊场景）
  /** @deprecated 推荐使用 taskProfile.outputLength */
  maxTokens?: number;
  /** @deprecated 推荐使用 taskProfile.creativity */
  temperature?: number;
  /** 直接指定模型 ID（高级用法） */
  model?: string;

  /** 严格模式：API 失败时抛出异常 */
  strictMode?: boolean;
}): Promise<ChatResponse>
```

### 2.6 参数解析优先级

```
1. 直接参数（maxTokens, temperature）    ← 最高优先级，向后兼容
     ↓ 如果未指定
2. TaskProfile 映射                      ← 推荐方式
     ↓ 如果未指定
3. 数据库模型配置                        ← 模型默认值
     ↓ 如果未配置
4. 硬编码默认值（4096, 0.7）            ← 最后兜底
```

---

## 3. 使用示例

### 3.1 AI App 层调用示例

```typescript
// ✓ 推荐：使用 TaskProfile
const response = await this.aiChatService.chat({
  messages: [{ role: "user", content: userInput }],
  systemPrompt: ANALYSIS_PROMPT,
  modelType: AIModelType.CHAT,
  taskProfile: {
    creativity: "low",           // 分析任务需要低创意
    outputLength: "medium",      // 中等长度输出
    taskType: "analysis",
    outputFormat: "json",        // 输出 JSON
  },
});

// ✓ 兼容：直接参数（特殊场景）
const response = await this.aiChatService.chat({
  messages: [...],
  model: "gpt-4o",
  maxTokens: 6000,              // 直接指定
  temperature: 0.85,            // 直接指定
});
```

### 3.2 迁移前后对比

**迁移前（硬编码）：**

```typescript
// writing-mission.service.ts
const response = await this.aiChatService.chat({
  messages,
  model: writerModel,
  temperature: 0.8, // 硬编码
  maxTokens: 6000, // 硬编码
});
```

**迁移后（TaskProfile）：**

```typescript
const response = await this.aiChatService.chat({
  messages,
  modelType: AIModelType.CHAT,
  taskProfile: {
    creativity: "high", // 创意写作
    outputLength: "long", // 长篇章节
    taskType: "writing",
  },
});
```

---

## 4. 实现计划

### Phase 1: 基础设施（本次实现）

| 任务                  | 文件                                          | 操作 |
| --------------------- | --------------------------------------------- | ---- |
| 创建 TaskProfile 类型 | `llm/types/task-profile.ts`                   | 新建 |
| 创建导出桶文件        | `llm/types/index.ts`                          | 新建 |
| 创建参数映射服务      | `llm/services/task-profile-mapper.service.ts` | 新建 |
| 更新 chat() 方法      | `llm/services/ai-chat.service.ts`             | 修改 |
| 注册新服务            | `llm/llm.module.ts`                           | 修改 |

### Phase 2: 试点迁移（后续）

选择代表性服务验证模式：

- `self-reflection.service.ts` - 低创意、短输出
- `research-planner.service.ts` - 中等创意、中等输出
- `writer.agent.ts` - 高创意、长输出
- `content-analysis.service.ts` - JSON 输出

### Phase 3: 批量迁移（后续）

按任务类型分组迁移 86 个服务文件

### Phase 4: 清理（后续）

- 标记旧参数为 `@deprecated`
- 移除模型名称硬编码
- 添加 ESLint 规则警告直接参数使用

---

## 5. 向后兼容性保证

1. **直接参数仍然有效**：优先级最高
2. **现有代码无需修改**：可以继续使用直接参数
3. **渐进式迁移**：AI App 可以逐步切换到 TaskProfile
4. **无破坏性改动**：新旧代码可以共存

---

## 6. 风险评估

| 风险           | 可能性 | 影响 | 缓解措施                           |
| -------------- | ------ | ---- | ---------------------------------- |
| 映射规则不准确 | 中     | 中   | 基于 134 个硬编码分析得出，可调整  |
| 破坏现有功能   | 低     | 高   | 直接参数优先级最高，完全向后兼容   |
| 迁移工作量大   | 高     | 低   | Phase 1 只做基础设施，后续分批迁移 |
| 性能影响       | 低     | 低   | 映射逻辑简单，无数据库查询         |

---

## 7. 待评审问题

1. **映射规则是否合理？**
   - temperature 和 maxTokens 的映射值是否需要调整？

2. **TaskProfile 字段是否完整？**
   - 是否需要添加其他任务特征？

3. **迁移策略是否可行？**
   - Phase 分期是否合理？

4. **是否需要更细粒度的控制？**
   - 某些场景是否需要同时使用 TaskProfile 和直接参数？

---

## 附录

### A. 相关文件路径

- AI Engine 核心：`backend/src/modules/ai-engine/llm/services/ai-chat.service.ts`
- 数据库 Schema：`backend/prisma/schema.prisma:2342-2401`
- AI App Writing：`backend/src/modules/ai-app/writing/services/mission/writing-mission.service.ts`
- AI App Teams：`backend/src/modules/ai-app/teams/services/collaboration/mission/team-mission.service.ts`

### B. AIModelType 枚举值

```prisma
enum AIModelType {
  CHAT              // 标准聊天（GPT-4, Claude, Gemini Pro）
  CHAT_FAST         // 快速低成本（GPT-4o-mini, Claude Haiku）
  IMAGE_GENERATION  // 图片生成（DALL-E 3, Imagen 4）
  IMAGE_EDITING     // 图片编辑
  MULTIMODAL        // 多模态（Gemini 2.0 Flash）
  EMBEDDING         // 向量嵌入
  RERANK            // 重排序
}
```
