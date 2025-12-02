# IMAGE 生成工作流程技术文档

> 最后更新: 2024-12-02
>
> 本文档详细描述 DeepDive ENGINE 的 IMAGE 模块（AI 图片/信息图生成）的完整工作流程。

## 目录

- [整体架构](#整体架构)
- [工作流程详解](#工作流程详解)
  - [步骤 0: 输入验证](#步骤-0-输入验证)
  - [步骤 1: 内容提取](#步骤-1-内容提取-content-extraction)
  - [步骤 1.5: 信息获取 (TODO)](#步骤-15-信息获取-data-fetching---todo)
  - [步骤 2: AI Prompt 增强](#步骤-2-ai-prompt-增强-prompt-enhancement)
  - [步骤 3: 图片生成](#步骤-3-图片生成-image-generation)
- [三种渲染模式](#三种渲染模式)
- [模板布局类型](#模板布局类型)
- [关键文件清单](#关键文件清单)
- [已知问题与改进计划](#已知问题与改进计划)
- [实施计划](#实施计划)
  - [Phase 1: 智能数据获取](#phase-1-智能数据获取功能-priority-high)
  - [Phase 2: 模板智能选择](#phase-2-模板智能选择优化-priority-medium)
  - [Phase 3: 视觉质量提升](#phase-3-视觉质量提升-priority-medium)
  - [Phase 4: 错误处理与监控](#phase-4-错误处理与监控-priority-low)
- [验收检查清单](#验收检查清单)

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    用户输入 (GenerateImageOptions)                    │
├─────────────────────────────────────────────────────────────────────┤
│  • prompt (文字提示词)                                                │
│  • urls (YouTube/Bilibili/网页链接)                                   │
│  • content (粘贴的文本)                                               │
│  • files (上传的文件: PDF/Word/图片等)                                 │
│  • imageBase64 (参考图片，用于 image-to-image)                         │
│  • templateLayout (用户指定的模板布局，可选)                            │
│  • aspectRatio (宽高比: 1:1, 16:9, 9:16, 4:3)                        │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│               步骤 1: 内容提取 (Content Extraction)                   │
│               ContentExtractorService                                │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│         步骤 1.5: 信息获取 (Data Fetching) - TODO 待实现              │
│         检测是否需要联网搜索获取真实数据                                │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│              步骤 2: AI Prompt 增强 (Prompt Enhancement)             │
│              调用 LLM + PROMPT_ENHANCEMENT_SYSTEM                    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                步骤 3: 图片生成 (Image Generation)                   │
│                根据 renderingMode 分支执行                           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        保存到数据库并返回                            │
│                        GeneratedImage 记录                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 工作流程详解

### 步骤 0: 输入验证

**位置**: `ai-image.service.ts:1668-1681`

验证用户至少提供了以下输入之一：

- `prompt` - 文字提示词
- `urls` - URL 链接数组
- `content` - 直接粘贴的文本
- `files` - 上传的文件
- `imageBase64` - 参考图片

如果没有任何输入，抛出 `BadRequestException`。

---

### 步骤 1: 内容提取 (Content Extraction)

**位置**: `ai-image.service.ts:1683-1912`

**职责**: 将各种输入源转换为统一的文本内容。

#### 1.1 处理直接 Prompt

```typescript
if (prompt) {
  contentParts.push(`User prompt: ${prompt}`);
}
```

#### 1.2 处理 URLs

支持多种 URL 类型：

- **YouTube**: 提取字幕/转录文本
- **Bilibili**: 提取字幕/内容
- **普通网页**: 提取正文内容

```typescript
const urlContent = await this.contentExtractor.extractFromUrl(trimmedUrl);
```

**特性**: 支持 "URL + 描述" 格式，例如：

```
https://youtube.com/watch?v=xxx 请生成关于这个视频的信息图
```

#### 1.3 处理粘贴文本

直接作为内容添加。

#### 1.4 处理上传文件

调用 `ContentExtractorService.extractFromFile()` 处理：

- PDF 文件
- Word 文档 (.docx)
- Excel 表格 (.xlsx)
- 纯文本文件

#### 1.5 处理参考图片

参考图片不会被解析为内容，而是直接传递给后续的 image-to-image 生成。

**输出**: `inputContent` - 合并后的全部内容文本

---

### 步骤 1.5: 信息获取 (Data Fetching) - TODO

> ⚠️ **当前缺失功能**: 此步骤尚未实现

**问题**: 当用户请求需要真实数据的信息图时（如 "北美TOP 10科技企业财务数据对比"），系统无法主动获取数据，导致 AI 生成占位符内容（X%, Y%, Z%）。

**预期流程**:

```
用户输入: "获取北美TOP 10科技企业财务数据，完成增长率横评"
                    │
                    ▼
         ┌──────────────────────┐
         │ 检测是否需要数据获取   │
         │ • 关键词: "获取", "查询", "搜索"
         │ • 数据指标: 财务数据、增长率、排名
         └──────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ 调用外部数据源         │
         │ • 搜索 API (Perplexity/Serper)
         │ • 金融数据 API
         │ • 新闻/资讯 API
         └──────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ 整理为结构化数据       │
         │ { company: "Apple", revenue: 394B, growth: 8% }
         └──────────────────────┘
                    │
                    ▼
              继续步骤 2...
```

**实现建议**:

1. 在 `ai-image.service.ts` 中添加 `detectDataFetchingNeed()` 方法
2. 集成搜索 API（如 Perplexity, Serper, Tavily）
3. 添加数据清洗和结构化逻辑
4. 将获取的数据合并到 `inputContent` 中

---

### 步骤 2: AI Prompt 增强 (Prompt Enhancement)

**位置**: `ai-image.service.ts:1914-2132`

**职责**: 调用 LLM 分析内容，生成结构化的设计决策。

#### 系统提示词核心逻辑

**STEP 0: 视觉场景 vs 信息图判断**

```
短提示词 (< 30 字) + 描述视觉场景 → rendering_mode: "ai_image"
  例: "猫嗅毛线", "日落风景", "孩子放风筝"

长内容/结构化数据 → rendering_mode: "hybrid"
  例: "AI技术发展趋势分析", "产品功能对比"

纯数据表格 → rendering_mode: "html_render"
  例: 财务报表, 规格表
```

**代码级强制检测** (lines 550-564):

```typescript
const promptLength = fallbackPrompt.length;
const wordCount = fallbackPrompt
  .split(/[\s，。、！？；：""''【】《》（）]+/)
  .filter((w) => w.length > 0).length;
const hasStructuredContent =
  /\d+%|\d+\.\d+|第[一二三四五六七八九十]+|步骤|流程|对比|分析|报告|数据|统计|方案|计划/.test(
    fallbackPrompt,
  );
const isShortVisualPrompt =
  (promptLength < 30 || wordCount < 10) && !hasStructuredContent;

if (isShortVisualPrompt && insights.renderingMode !== "ai_image") {
  insights.renderingMode = "ai_image"; // 强制使用纯 AI 图片模式
}
```

#### 输出结构 (PromptEngineeringInsights)

```typescript
interface PromptEngineeringInsights {
  imagePrompt: string; // 最终图片生成提示词
  fallbackPrompt?: string; // 备用提示词
  backgroundPrompt?: string; // 背景生成提示词 (hybrid 模式)
  renderingMode: RenderingMode; // "ai_image" | "hybrid" | "html_render"
  templateLayout: TemplateLayoutType; // 模板布局类型
  contentAnalysis?: ContentAnalysis; // 内容分析结果
  designJournal: PromptDesignJournalEntry[]; // 设计决策日志
  informationArchitecture: PromptInformationArchitecture; // 信息架构
  visualLanguage: PromptVisualLanguage; // 视觉语言
  layoutPlan: string[]; // 布局规划
  qualityChecks: string[]; // 质量检查项
  negativeKeywords: string[]; // 负面关键词
  styleShiftReasoning: string[]; // 风格转换推理
  inspiration: string[]; // 参考灵感
}
```

---

### 步骤 3: 图片生成 (Image Generation)

**位置**: `ai-image.service.ts:2134-2370`

根据 `renderingMode` 分三个分支执行：

#### 分支 A: ai_image 模式

```
纯 AI 图片生成
     │
     ▼
callImageGenerationAPI(final_prompt)
     │
     └─ 或 callImageToImageAPI() (如有参考图片)
     │
     ▼
输出: 纯 AI 生成的图片 (无文字叠加)
```

**适用场景**: 短视觉场景描述，如 "猫嗅毛线"、"日落风景"

#### 分支 B: hybrid 模式

```
混合模式 (AI 背景 + HTML 文字)
     │
     ├─ 1. callImageGenerationAPI(background_prompt)
     │      生成装饰性背景 (无文字)
     │
     ├─ 2. convertToInfographicContent(promptInsights)
     │      转换为结构化信息图内容
     │
     └─ 3. InfographicTemplateService.generateInfographic()
            渲染 HTML 模板 + 背景叠加
     │
     ▼
输出: AI 背景 + HTML 文字精确渲染的信息图
```

**适用场景**: 需要精确文字渲染的信息图

#### 分支 C: html_render 模式

```
纯 HTML 渲染
     │
     ├─ 1. convertToInfographicContent(promptInsights)
     │
     └─ 2. InfographicTemplateService.generateInfographic()
            渲染纯 HTML 模板 (纯色/渐变背景)
     │
     ▼
输出: 纯 HTML 渲染的信息图 (无 AI 背景)
```

**适用场景**: 纯数据表格、简洁设计

---

## 三种渲染模式

| 模式          | 适用场景        | 输出              | 优点                | 缺点           |
| ------------- | --------------- | ----------------- | ------------------- | -------------- |
| `ai_image`    | 短视觉场景描述  | 纯 AI 生成图片    | 视觉效果好          | 文字可能乱码   |
| `hybrid`      | 信息图/报告     | AI背景 + HTML文字 | 文字精确 + 背景美观 | 复杂度高       |
| `html_render` | 纯数据/简洁设计 | 纯 HTML 渲染      | 文字完全精确        | 视觉效果较朴素 |

---

## 模板布局类型

| 模板            | 适用场景                | 示例                   |
| --------------- | ----------------------- | ---------------------- |
| `cards`         | 3+ 个并列话题           | 产品特性列表、新闻摘要 |
| `center_visual` | 一个核心概念 + 周围要点 | 品牌定位、核心价值     |
| `timeline`      | 时间序列/流程步骤       | 项目计划、历史发展     |
| `comparison`    | 仅 2 个选项对比         | A vs B、优缺点         |
| `pyramid`       | 层级结构                | 组织架构、优先级       |
| `radial`        | 中心辐射关系            | 生态系统、关系网络     |
| `statistics`    | 数据/指标密集           | KPI 仪表盘、调查结果   |
| `checklist`     | 清单/要点列表           | 最佳实践、注意事项     |
| `funnel`        | 漏斗/转化流程           | 销售漏斗、用户转化     |
| `matrix`        | 2x2 矩阵分析            | 优先级矩阵、BCG 矩阵   |

---

## 关键文件清单

| 文件                                                           | 职责                                     | 行数  |
| -------------------------------------------------------------- | ---------------------------------------- | ----- |
| `backend/src/modules/ai-image/ai-image.service.ts`             | 主服务：流程控制、LLM 调用、渲染模式决策 | ~3000 |
| `backend/src/modules/ai-image/content-extractor.service.ts`    | 内容提取：YouTube字幕、网页、PDF等       | ~500  |
| `backend/src/modules/ai-image/infographic-template.service.ts` | HTML 模板渲染：各种布局模板              | ~2000 |
| `frontend/components/ai-image/ImageGenerator.tsx`              | 前端 UI 组件                             | ~2000 |

---

## 已知问题与改进计划

### 问题 1: 缺少数据获取步骤

**现状**: 当用户请求包含数据查询的信息图时，系统无法主动获取数据。

**示例**:

```
输入: "北美TOP 10科技企业财务增长率对比"
输出: 占位符数据 (X%, Y%, Z%)
```

**改进方案**: 添加步骤 1.5 - 智能数据获取

- 检测是否需要联网搜索
- 集成搜索 API
- 数据清洗和结构化

### 问题 2: 短视觉提示词误判

**现状**: 短提示词有时被误判为信息图，导致生成带乱码文字的图片。

**已修复**: 添加代码级强制检测 (lines 550-564)

- 检测 prompt 长度和词数
- 排除含结构化内容特征的提示词
- 强制使用 `ai_image` 模式

### 问题 3: 10+ 卡片布局拥挤

**现状**: comparison 模板被误用于 3+ 个选项的场景。

**改进建议**:

- 限制 comparison 仅用于 2 选项对比
- 3+ 选项自动切换为 cards 或 statistics 模板
- 超过 6 个卡片时建议分页

---

## 实施计划

### Phase 1: 智能数据获取功能 (Priority: HIGH)

**目标**: 实现步骤 1.5 - 自动检测并获取用户请求的真实数据

**任务清单**:

| 任务                          | 负责人 | 状态    | 说明                     |
| ----------------------------- | ------ | ------- | ------------------------ |
| 1.1 设计数据获取检测算法      | TBD    | PENDING | 识别需要联网查询的请求   |
| 1.2 集成搜索 API              | TBD    | PENDING | Perplexity/Serper/Tavily |
| 1.3 实现 DataFetchingService  | TBD    | PENDING | 封装数据获取逻辑         |
| 1.4 数据清洗与结构化          | TBD    | PENDING | 将搜索结果转为结构化数据 |
| 1.5 集成到 generateImage 流程 | TBD    | PENDING | 步骤 1 和步骤 2 之间插入 |
| 1.6 单元测试                  | TBD    | PENDING | 覆盖各种数据请求场景     |

**技术方案**:

```typescript
// backend/src/modules/ai-image/data-fetching.service.ts

interface DataFetchingResult {
  needsFetching: boolean;
  queries: string[];
  fetchedData: StructuredData[];
  enrichedContent: string;
}

@Injectable()
export class DataFetchingService {
  /**
   * 检测是否需要数据获取
   */
  detectDataFetchingNeed(content: string): boolean {
    const indicators = [
      /获取|查询|搜索|查找|找出/,
      /最新|实时|当前|今日/,
      /TOP\s*\d+|排名|排行/,
      /数据|统计|指标|增长率/,
      /对比|比较|横评/,
    ];
    return indicators.some((pattern) => pattern.test(content));
  }

  /**
   * 从外部 API 获取数据
   */
  async fetchData(queries: string[]): Promise<StructuredData[]> {
    // 调用 Perplexity/Serper API
  }

  /**
   * 将数据整合到内容中
   */
  enrichContent(original: string, data: StructuredData[]): string {
    // 将获取的数据格式化并附加到原始内容
  }
}
```

**验收标准**:

- [ ] "北美 TOP 10 科技企业财务数据" 能返回真实数据而非占位符
- [ ] 搜索结果正确格式化为结构化数据
- [ ] 不需要数据获取的请求不受影响
- [ ] 响应时间增加不超过 3 秒

---

### Phase 2: 模板智能选择优化 (Priority: MEDIUM)

**目标**: 优化模板选择逻辑，避免 comparison 模板滥用

**任务清单**:

| 任务                          | 负责人 | 状态    | 说明                |
| ----------------------------- | ------ | ------- | ------------------- |
| 2.1 限制 comparison 仅 2 选项 | TBD    | PENDING | 3+ 选项自动切换模板 |
| 2.2 添加 statistics 模板      | TBD    | PENDING | 适合数据密集型内容  |
| 2.3 分页机制                  | TBD    | PENDING | 超过 6 个卡片时分页 |
| 2.4 模板预览功能              | TBD    | PENDING | 用户可选择模板      |

---

### Phase 3: 视觉质量提升 (Priority: MEDIUM)

**目标**: 提升信息图视觉效果，对标 Genspark 质量

**任务清单**:

| 任务               | 负责人 | 状态      | 说明                        |
| ------------------ | ------ | --------- | --------------------------- |
| 3.1 玻璃态效果优化 | TBD    | COMPLETED | Glassmorphism CSS           |
| 3.2 渐变配色系统   | TBD    | COMPLETED | genspark/tech_gradient 预设 |
| 3.3 SVG 连接线     | TBD    | PENDING   | center_visual/radial 模板   |
| 3.4 动态图标库     | TBD    | PENDING   | 更丰富的图标选择            |

---

### Phase 4: 错误处理与监控 (Priority: LOW)

**目标**: 提升系统稳定性和可观测性

**任务清单**:

| 任务                  | 负责人 | 状态    | 说明                    |
| --------------------- | ------ | ------- | ----------------------- |
| 4.1 JSON 解析错误恢复 | TBD    | PENDING | AI 输出格式错误时的回退 |
| 4.2 生成质量评分      | TBD    | PENDING | 自动评估输出质量        |
| 4.3 Prometheus 指标   | TBD    | PENDING | 监控生成成功率/延迟     |
| 4.4 用户反馈收集      | TBD    | PENDING | 收集用户满意度数据      |

---

## 验收检查清单

### 功能验收

- [ ] 短视觉提示词正确使用 ai_image 模式
- [ ] 信息图请求正确使用 hybrid 模式
- [ ] 数据请求能获取真实数据
- [ ] 模板选择符合内容结构
- [ ] 文字渲染清晰无乱码

### 性能验收

- [ ] 简单请求响应时间 < 10s
- [ ] 复杂请求（含数据获取）< 20s
- [ ] 内存占用合理
- [ ] 并发支持 > 5 个请求

### 质量验收

- [ ] 信息图视觉效果对标 Genspark
- [ ] 配色方案专业统一
- [ ] 布局清晰易读
- [ ] 无明显设计缺陷

---

## 附录：数据流示意图

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              完整数据流                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  用户输入                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ { prompt, urls, content, files, imageBase64, templateLayout, ... }      │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│                                      ▼                                       │
│  步骤 1: 内容提取                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ ContentExtractorService                                                 │ │
│  │   ├─ extractFromUrl(youtube/bilibili/web)                               │ │
│  │   ├─ extractFromFile(pdf/docx/xlsx)                                     │ │
│  │   └─ 合并为 inputContent: string                                         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│                                      ▼                                       │
│  步骤 1.5: 数据获取 (TODO)                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ DataFetchingService (待实现)                                             │ │
│  │   ├─ detectDataFetchingNeed(inputContent)                               │ │
│  │   ├─ callSearchAPI(query)                                               │ │
│  │   └─ 合并真实数据到 inputContent                                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│                                      ▼                                       │
│  步骤 2: Prompt 增强                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ LLM (Gemini/OpenAI) + PROMPT_ENHANCEMENT_SYSTEM                         │ │
│  │   ├─ 分析内容结构                                                        │ │
│  │   ├─ 选择 renderingMode: ai_image | hybrid | html_render                │ │
│  │   ├─ 选择 templateLayout: cards | timeline | ...                        │ │
│  │   ├─ 生成 informationArchitecture (sections, metrics, bullets)          │ │
│  │   ├─ 生成 visualLanguage (colors, typography, style)                    │ │
│  │   └─ 输出 PromptEngineeringInsights                                      │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│                            ┌─────────┼─────────┐                             │
│                            │         │         │                             │
│                            ▼         ▼         ▼                             │
│  步骤 3: 图片生成                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                         │
│  │ ai_image    │   │ hybrid      │   │ html_render │                         │
│  │             │   │             │   │             │                         │
│  │ 纯 AI 图片   │   │ AI 背景 +   │   │ 纯 HTML     │                         │
│  │ 生成        │   │ HTML 文字   │   │ 渲染        │                         │
│  │             │   │             │   │             │                         │
│  │ Imagen/     │   │ Imagen +    │   │ Puppeteer   │                         │
│  │ DALL-E/Flux │   │ Puppeteer   │   │             │                         │
│  └─────────────┘   └─────────────┘   └─────────────┘                         │
│                            │         │         │                             │
│                            └─────────┼─────────┘                             │
│                                      │                                       │
│                                      ▼                                       │
│  输出                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ GeneratedImageResult {                                                  │ │
│  │   id, imageUrl, prompt, enhancedPrompt,                                 │ │
│  │   promptInsights, negativePrompt,                                       │ │
│  │   width, height, createdAt, processingSteps,                            │ │
│  │   textModelUsed, imageModelUsed                                         │ │
│  │ }                                                                       │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```
