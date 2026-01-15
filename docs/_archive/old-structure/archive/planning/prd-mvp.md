# DeepDive Engine - MVP实施计划

> **版本**: MVP v1.0-2.0
> **参考设计**: AlphaXiv (https://www.alphaxiv.org/)
> **目标**: 2周内完成可用的AI驱动知识发现平台
> **创建日期**: 2025-11-09

---

## 产品定位（聚焦版）

**DeepDive Engine** = AlphaXiv + Grok AI + 个性化推荐

**核心价值**:

- 📄 聚合Papers/Projects/News
- 🤖 Grok AI智能问答和摘要
- 🎯 个性化收藏和推荐
- 🔍 智能搜索和筛选

---

## MVP-1.0：基础可用（Week 1-2）

### 功能清单

#### 1. 左侧导航（完整实现）

**已有**:

- ✓ Explore（主页）
- ✓ My Library
- ✓ Notifications
- ✓ Profile
- ✓ Labs
- ✓ Feedback
- ✓ Dark mode
- ✓ 侧边栏折叠

**需补充**:

- ❌ 各页面的实际功能实现
- ❌ Notifications的消息提醒
- ❌ Profile的用户设置

#### 2. 智能搜索框（参考AlphaXiv）

**功能要求**:

```
┌─────────────────────────────────────────┐
│ ∞ agent ▼  │ AI                        │
│             └─────────────────────────  │
│                                    🔄📎⬆│
└─────────────────────────────────────────┘
     ↓ 用户输入时动态显示
┌─────────────────────────────────────────┐
│ Papers                                   │
│ • Constitutional AI: Harmlessness...    │
│ • Towards an AI-Augmented Textbook      │
│ • Kosmos: An AI Scientist for Auto...   │
│                                          │
│ Loading suggestions...                  │
└─────────────────────────────────────────┘
```

**技术实现**:

- Agent模式切换（agent/search）
- 实时搜索建议（debounce 300ms）
- 向量搜索匹配（top 5）
- 历史记录（localStorage）

#### 3. 论文卡片（带缩略图）

**卡片布局**:

```
┌─────────────────────────────────────────────┐
│ 📊 1,470 ⬆   04 Nov 2025                    │
│                                              │
│ [PDF缩略图]     Kosmos: An AI Scientist     │
│   预览图        for Autonomous Discovery    │
│  (左侧)                                      │
│               Abstract: Edison Scientific   │
│               Inc. developed Kosmos...       │
│                                              │
│               🏷️ agentic-frameworks agents  │
│               💾 Bookmark ▼  🔄 2  👍 71    │
└─────────────────────────────────────────────┘
```

**数据展示**:

- PDF缩略图（第一页截图）
- 阅读数/引用数
- 发布日期
- 标签（自动提取）
- 互动按钮（Bookmark, Fork, Like）

#### 4. 右侧AI面板（Grok默认）

**功能**:

- Tab切换：Assistant | Notes | Comments | Similar
- Assistant默认显示Grok
- 快速操作：Summary, Insights, Q&A
- 模型切换：Grok | GPT-4

**交互流程**:

```
用户选择论文 →
  自动加载到AI面板 →
    显示"Ask Grok anything about this paper" →
      用户提问 →
        Grok回答（流式输出）
```

---

## MVP-2.0：智能推荐（Week 3-4）

### 功能清单

#### 1. My Library（收藏管理）

**功能**:

- 查看所有收藏的资源
- 智能分类（AI自动打标签）
- 按标签/类型/时间筛选
- 导出功能（Markdown/BibTeX）

#### 2. 个性化推荐

**推荐策略**:

```python
def recommend(user_id):
    # 1. 基于收藏的标签
    tags = get_user_bookmarked_tags(user_id)

    # 2. 向量相似度匹配
    embeddings = get_user_interests_embedding(user_id)
    similar = vector_search(embeddings, top_k=20)

    # 3. 热度衰减
    scored = []
    for item in similar:
        score = (
            0.4 * similarity_score +
            0.3 * quality_score +
            0.2 * recency_score +
            0.1 * diversity_score
        )
        scored.append((item, score))

    return sorted(scored, key=lambda x: x[1], reverse=True)[:10]
```

#### 3. 筛选和排序

**筛选维度**:

- 类型：Papers | Projects | News
- 时间：Today | Week | Month | Year
- 标签：AI/ML, Web Dev, Cloud等
- 难度：Beginner | Intermediate | Advanced

**排序方式**:

- Hot（综合评分）
- Latest（最新）
- Most Viewed（最多阅读）
- Most Bookmarked（最多收藏）

---

## MVP-2.5：多素材综合报告（Week 5-6）

### 功能概述

**核心价值**: 让用户能够选择多份素材，AI自动生成结构化的综合分析报告

**适用场景**:

- 技术选型：对比3-5个类似技术/框架
- 趋势分析：分析10篇最新论文，总结研究趋势
- 学习路径：选择由浅入深的资源，生成学习计划

### 1. 多选交互UI

**功能要求**:

```
┌───────────────────────────────────────────────┐
│ ☑ 已选择 3 项  [取消选择] [生成报告 →]        │
├───────────────────────────────────────────────┤
│ ☑ □ Paper: Attention Is All You Need          │
│     Vaswani et al. • 2017 • 📊 NLP            │
│                                                │
│ ☑ □ Paper: BERT: Pre-training of Deep...      │
│     Devlin et al. • 2018 • 📊 NLP             │
│                                                │
│ ☑ □ Paper: GPT-3: Language Models are...      │
│     Brown et al. • 2020 • 📊 LLM              │
└───────────────────────────────────────────────┘
```

**交互规则**:

- 最少选择2项，最多选择10项
- 顶部显示已选数量和操作按钮
- 点击"生成报告"弹出模板选择对话框
- 支持快捷键：`Ctrl+A` 全选，`Esc` 取消

**技术实现**:

```typescript
// frontend/lib/use-multi-select.ts
export function useMultiSelect(maxItems = 10) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else if (newSet.size < maxItems) {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAll = (ids: string[]) => {
    setSelectedIds(new Set(ids.slice(0, maxItems)));
  };

  const clearAll = () => {
    setSelectedIds(new Set());
  };

  return {
    selectedIds: Array.from(selectedIds),
    toggleSelect,
    selectAll,
    clearAll,
    isSelected: (id: string) => selectedIds.has(id),
    count: selectedIds.size,
    canSelectMore: selectedIds.size < maxItems,
  };
}
```

### 2. 报告模板选择

**模板配置**:

```typescript
// frontend/lib/report-templates.ts
export const REPORT_TEMPLATES = [
  {
    id: "comparison",
    name: "对比分析",
    description: "多维度对比各素材的特点、优劣势和适用场景",
    icon: "📊",
    minItems: 2,
    maxItems: 5,
    sections: ["概述", "详细对比表", "关键洞察", "选型建议"],
    estimatedTime: "60秒",
    model: "gpt-4", // 需要复杂推理
  },
  {
    id: "trend",
    name: "趋势报告",
    description: "分析技术演进轨迹和未来发展方向",
    icon: "📈",
    minItems: 3,
    maxItems: 10,
    sections: ["时间轴", "关键突破", "趋势预测", "机会分析"],
    estimatedTime: "45秒",
    model: "grok",
  },
  {
    id: "learning-path",
    name: "学习路径",
    description: "生成由浅入深的学习计划和实践建议",
    icon: "🗺️",
    minItems: 3,
    maxItems: 8,
    sections: ["前置知识", "学习顺序", "难度分析", "实践建议"],
    estimatedTime: "50秒",
    model: "grok",
  },
  {
    id: "literature-review",
    name: "文献综述",
    description: "学术风格的文献综述报告",
    icon: "📝",
    minItems: 5,
    maxItems: 10,
    sections: ["研究背景", "方法演进", "结果对比", "未来方向"],
    estimatedTime: "90秒",
    model: "gpt-4",
  },
] as const;
```

**模板选择对话框**:

```typescript
// frontend/components/ReportTemplateDialog.tsx
<Dialog>
  <DialogTitle>选择报告模板</DialogTitle>
  <DialogContent>
    <div className="grid grid-cols-2 gap-4">
      {REPORT_TEMPLATES.map(template => (
        <Card
          key={template.id}
          className={cn(
            'cursor-pointer hover:border-red-600',
            selectedTemplate === template.id && 'border-red-600'
          )}
          onClick={() => setSelectedTemplate(template.id)}
        >
          <div className="text-4xl mb-2">{template.icon}</div>
          <h3 className="font-semibold mb-1">{template.name}</h3>
          <p className="text-sm text-gray-600 mb-2">{template.description}</p>
          <div className="text-xs text-gray-500">
            <div>📄 {template.minItems}-{template.maxItems} 项素材</div>
            <div>⏱️ 预计 {template.estimatedTime}</div>
          </div>
        </Card>
      ))}
    </div>
  </DialogContent>
  <DialogActions>
    <Button onClick={onCancel}>取消</Button>
    <Button onClick={handleGenerate} disabled={!selectedTemplate}>
      开始生成
    </Button>
  </DialogActions>
</Dialog>
```

### 3. AI报告生成服务

**后端API设计**:

```typescript
// backend/src/reports/reports.controller.ts

@Controller("reports")
export class ReportsController {
  @Post("generate")
  async generateReport(@Body() dto: GenerateReportDto) {
    // 1. 验证资源数量
    if (dto.resourceIds.length < 2 || dto.resourceIds.length > 10) {
      throw new BadRequestException("Please select 2-10 resources");
    }

    // 2. 获取资源详情
    const resources = await this.resourcesService.findMany(dto.resourceIds);

    // 3. 调用AI服务生成报告
    const report = await this.aiService.generateReport({
      resources,
      template: dto.template,
      model: dto.model || "grok",
    });

    // 4. 保存报告
    const savedReport = await this.reportsService.create({
      userId: dto.userId,
      ...report,
      resourceIds: dto.resourceIds,
    });

    return savedReport;
  }

  @Get(":id")
  async getReport(@Param("id") id: string) {
    return this.reportsService.findOne(id);
  }

  @Get()
  async getUserReports(@Query("userId") userId: string) {
    return this.reportsService.findByUser(userId);
  }
}
```

**AI Service实现**:

```python
# ai-service/routers/report.py

@router.post("/api/v1/ai/generate-report")
async def generate_report(request: ReportRequest):
    """
    生成多素材综合报告
    """
    # 1. 准备资源信息
    resources_info = prepare_resources_info(request.resources)

    # 2. 选择prompt模板
    prompt_template = REPORT_PROMPTS[request.template]

    # 3. 构建完整prompt
    prompt = prompt_template.format(
        count=len(request.resources),
        resources_info=resources_info
    )

    # 4. 调用AI生成
    if request.model == 'gpt-4':
        response = await openai_client.chat(prompt)
    else:
        response = await grok_client.chat(prompt)

    # 5. 解析并结构化
    report = parse_report_response(response, request.template)

    return report


# Prompt模板
REPORT_PROMPTS = {
    'comparison': """
You are a technical analyst. Analyze and compare the following {count} resources.

Resources:
{resources_info}

Generate a comprehensive comparison report with these sections:

1. **Executive Summary** (200-300 words)
   - Overview of all resources
   - Main themes and connections
   - Key takeaways

2. **Detailed Comparison**
   Create a comparison table with these aspects:
   - Approach/Method
   - Key Innovation
   - Performance/Results
   - Limitations
   - Use Cases

3. **Key Insights** (5-7 bullet points)
   - Common patterns across resources
   - Key differences and trade-offs
   - Evolution and improvements
   - Complementary aspects

4. **Recommendations**
   - Which to choose for different scenarios
   - Learning order suggestions
   - Further reading

Output in JSON format:
{{
  "title": "Comparison of [Topic]",
  "summary": "Executive summary text...",
  "sections": [
    {{"title": "Detailed Comparison", "content": "markdown table and text"}},
    {{"title": "Key Insights", "content": "markdown list"}},
    {{"title": "Recommendations", "content": "markdown text"}}
  ],
  "metadata": {{
    "resourceCount": {count},
    "template": "comparison"
  }}
}}
""",

    'trend': """
You are a technology trend analyst. Analyze the following {count} resources to identify trends.

Resources:
{resources_info}

Generate a trend analysis report with these sections:

1. **Overview** (150-200 words)
   - Time span covered
   - Main themes
   - Overall direction

2. **Technology Timeline**
   Create a chronological timeline showing:
   - Year/Date
   - Key milestone
   - Innovation introduced
   - Impact level (High/Medium/Low)

3. **Key Breakthroughs** (4-6 items)
   For each breakthrough:
   - What changed
   - Why it matters
   - Follow-up work

4. **Trend Predictions**
   - Emerging patterns
   - Likely next developments (3-6 months)
   - Opportunities and challenges

Output in JSON format with markdown content.
""",

    'learning-path': """
You are a learning path designer. Create a structured learning plan from these {count} resources.

Resources:
{resources_info}

Generate a learning path report with these sections:

1. **Learning Objectives** (150 words)
   - What you'll learn
   - Target audience
   - Prerequisites

2. **Recommended Learning Sequence**
   For each resource (in order):
   - Title and type
   - Difficulty level (Beginner/Intermediate/Advanced)
   - Time investment
   - Key concepts covered
   - Why this order

3. **Difficulty Analysis**
   - Concept progression
   - Knowledge dependencies
   - Potential challenges

4. **Practice Recommendations**
   - Hands-on projects
   - Additional resources
   - Learning tips

Output in JSON format with markdown content.
""",
}


def prepare_resources_info(resources: List[Resource]) -> str:
    """准备资源信息文本"""
    info_parts = []
    for i, resource in enumerate(resources, 1):
        info = f"""
Resource {i}:
- Title: {resource.title}
- Type: {resource.type}
- Date: {resource.published_date}
- Abstract: {resource.abstract[:500]}...
- Authors: {', '.join(resource.authors) if resource.authors else 'N/A'}
- Tags: {', '.join(resource.tags) if resource.tags else 'N/A'}
"""
        info_parts.append(info)

    return '\n'.join(info_parts)
```

### 4. 报告展示页面

**页面路由**: `/report/[id]`

**布局设计**:

```typescript
// frontend/app/report/[id]/page.tsx

export default function ReportPage({ params }: { params: { id: string } }) {
  const { report, loading, error } = useReport(params.id);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <span>{report.templateIcon}</span>
              <span>{report.templateName}</span>
              <span>•</span>
              <span>📄 {report.resourceCount} 篇素材</span>
              <span>•</span>
              <span>🕐 {formatDate(report.createdAt)}</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">
              {report.title}
            </h1>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportMarkdown}>
              <FileText className="w-4 h-4 mr-2" />
              导出 MD
            </Button>
            <Button variant="outline" onClick={handleExportPDF}>
              <Download className="w-4 h-4 mr-2" />
              导出 PDF
            </Button>
            <Button onClick={handleRegenerate}>
              <RefreshCw className="w-4 h-4 mr-2" />
              重新生成
            </Button>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            📝 核心摘要
          </h2>
          <p className="text-gray-700 leading-relaxed">{report.summary}</p>
        </div>
      </header>

      {/* Sections */}
      <div className="space-y-8 mb-12">
        {report.sections.map((section, idx) => (
          <section key={idx} className="bg-white border rounded-lg p-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              {section.title}
            </h2>
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  table: ({ node, ...props }) => (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-300" {...props} />
                    </div>
                  ),
                }}
              >
                {section.content}
              </ReactMarkdown>
            </div>
          </section>
        ))}
      </div>

      {/* Referenced Resources */}
      <div className="border-t pt-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          📚 参考素材 ({report.resources.length})
        </h2>
        <div className="grid gap-4">
          {report.resources.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              compact
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 5. 数据模型

```prisma
// backend/prisma/schema.prisma

model Report {
  id            String   @id @default(auto()) @map("_id") @db.ObjectId
  userId        String   @db.ObjectId

  title         String
  template      String   // comparison, trend, learning-path, literature-review
  templateName  String   // 对比分析, 趋势报告, etc.
  templateIcon  String   // 📊, 📈, etc.

  summary       String   // 核心摘要
  sections      Json[]   // [{ title: string, content: string }]

  resourceIds   String[] @db.ObjectId
  resources     Resource[] @relation(fields: [resourceIds], references: [id])
  resourceCount Int

  metadata      Json?    // { model, tokensUsed, generationTime, ... }

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([createdAt])
  @@index([template])
}
```

### 关键指标

| 指标           | Week 5目标 | Week 6目标 |
| -------------- | ---------- | ---------- |
| 报告生成成功率 | 85%        | 95%        |
| 平均生成时间   | <60s       | <45s       |
| 模板覆盖率     | 2个模板    | 4个模板    |
| 用户使用率     | 20%        | 35%        |

---

## 界面设计规范

### 配色方案（参考AlphaXiv）

```css
/* 主题色 */
--primary: #991b1b; /* 深红色 */
--primary-light: #fee2e2;
--primary-dark: #7f1d1d;

/* 中性色 */
--gray-50: #f9fafb;
--gray-100: #f3f4f6;
--gray-500: #6b7280;
--gray-900: #111827;

/* 语义色 */
--success: #10b981;
--warning: #f59e0b;
--error: #ef4444;
```

### 组件规范

**卡片阴影**:

```css
box-shadow: 0 1px 3px rgba(0,0,0,0.1);
hover: box-shadow: 0 4px 6px rgba(0,0,0,0.1);
```

**圆角**:

- 小组件：4px
- 卡片：8px
- 模态框：12px

**间距**:

- 卡片间距：16px
- 内边距：12px (小) | 16px (中) | 24px (大)

---

## 技术实现要点

### 1. PDF缩略图生成

**方案**:

```typescript
// 使用pdf.js生成缩略图
async function generateThumbnail(pdfUrl: string) {
  const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale: 0.5 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: context, viewport }).promise;

  return canvas.toDataURL("image/jpeg", 0.8);
}
```

**存储**:

- 生成后存储到MongoDB（Base64或URL）
- CDN加速（可选）

### 2. 智能搜索建议

**后端API**:

```typescript
// GET /api/search/suggestions?q=AI&limit=5
async searchSuggestions(query: string, limit = 5) {
  // 1. 向量搜索
  const embedding = await this.embeddingService.embed(query);
  const vectorResults = await this.qdrant.search(embedding, limit * 2);

  // 2. 全文搜索
  const textResults = await this.prisma.resource.findMany({
    where: {
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { abstract: { contains: query, mode: 'insensitive' } }
      ]
    },
    take: limit * 2
  });

  // 3. 合并去重
  const merged = this.mergeAndRank(vectorResults, textResults);
  return merged.slice(0, limit);
}
```

**前端实现**:

```typescript
const [suggestions, setSuggestions] = useState([]);
const debouncedSearch = useMemo(
  () =>
    debounce(async (q) => {
      if (q.length < 2) return;
      const res = await fetch(`/api/search/suggestions?q=${q}`);
      const data = await res.json();
      setSuggestions(data);
    }, 300),
  [],
);
```

### 3. Grok集成

**配置**:

```typescript
// ai-service/services/grok_client.py
class GrokClient:
    def __init__(self):
        self.api_key = get_secret("GROK_API_KEY")
        self.base_url = "https://api.x.ai/v1"
        self.model = "grok-beta"

    async def chat(self, messages, stream=True):
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            stream=stream,
            temperature=0.7,
            max_tokens=2000
        )
        return response
```

**前端使用**:

```typescript
async function askGrok(question: string, context: Resource) {
  const messages = [
    {
      role: "system",
      content: "You are a helpful AI assistant analyzing academic papers.",
    },
    {
      role: "user",
      content: `Based on this paper:\n\nTitle: ${context.title}\nAbstract: ${context.abstract}\n\nQuestion: ${question}`,
    },
  ];

  const response = await fetch("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ messages, model: "grok" }),
  });

  return response.body; // Stream
}
```

---

## 数据修复任务

### 问题1: raw_data缺少resourceId

**脚本已有**: `backend/src/scripts/link-raw-data.ts`

**执行**:

```bash
cd backend
npx ts-node src/scripts/link-raw-data.ts
```

### 问题2: GitHub数据缺少title

**修复方案**:

```typescript
// 使用fullName或name作为title
await prisma.resource.updateMany({
  where: {
    type: "project",
    title: null,
  },
  data: {
    // 从rawData中提取
  },
});
```

### 问题3: 重复数据清理

**去重逻辑**:

- arXiv: 基于externalId（arXiv ID）
- GitHub: 基于fullName
- HackerNews: 基于id

---

## 关键指标

| 指标            | MVP-1.0目标 | MVP-2.0目标 |
| --------------- | ----------- | ----------- |
| 功能完成度      | 80%         | 100%        |
| 页面响应时间    | <2s         | <1s         |
| AI回复速度      | <5s         | <3s         |
| 搜索建议延迟    | <500ms      | <300ms      |
| PDF缩略图覆盖率 | 50%         | 80%         |

---

**下一步**: 查看TODO任务清单（TODO.md）
