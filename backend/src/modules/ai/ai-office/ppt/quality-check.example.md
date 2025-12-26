# PPT Quality Check Service - 使用示例

## 概述

`QualityCheckService` 提供 PPT 文档的全面质量检查功能，包括：

- 重复内容检测
- 布局溢出检查
- 内容密度分析
- 样式一致性检查
- 缺失数据检测
- 自动优化建议
- 自动修复功能

## 基本使用

### 1. 执行质量检查

```typescript
import { QualityCheckService } from './quality-check.service';

// 注入服务
constructor(
  private readonly qualityCheck: QualityCheckService,
) {}

// 执行完整检查
async checkPresentation(documentId: string) {
  const report = await this.qualityCheck.checkQuality(documentId);

  console.log(`Quality Score: ${report.score}/100`);
  console.log(`Issues Found: ${report.issues.length}`);
  console.log(`Suggestions: ${report.suggestions.length}`);

  return report;
}
```

### 2. 质量报告结构

```typescript
interface QualityReport {
  documentId: string;
  checkedAt: Date;
  score: number; // 0-100 总分
  issues: QualityIssue[]; // 问题列表
  suggestions: Suggestion[]; // 优化建议
}
```

## 检查类型详解

### 1. 重复内容检测

使用 Jaccard 相似度算法检测重复页面：

```typescript
// 相似度 > 70% 视为重复
// 示例输出：
{
  type: 'duplicate',
  severity: 'warning',
  pages: [2, 5],
  description: 'Slide 3 and 6 have 78.5% similar content',
  details: {
    page1: 2,
    page2: 5,
    similarity: 78.5,
    duplicatedContent: '...'
  }
}
```

### 2. 布局溢出检查

检查内容是否超出安全区域：

```typescript
// 默认安全区（1920x1080, 16:9）
const DEFAULT_SAFE_AREA = {
  top: 80,
  bottom: 80,
  left: 100,
  right: 100,
  maxWidth: 1720,
  maxHeight: 920,
};

// 示例输出：
{
  type: 'layout_overflow',
  severity: 'error',
  pages: [3],
  description: 'Slide 4 content overflows bottom safe area by 120px',
  details: {
    page: 3,
    overflowArea: 'bottom',
    overflowPixels: 120
  }
}
```

### 3. 内容密度分析

检测内容过少或过多：

```typescript
// 阈值
const SPARSE_THRESHOLD = 30;    // 填充率 < 30%
const DENSE_THRESHOLD = 90;     // 填充率 > 90%
const MAX_WORDS_PER_SLIDE = 150;

// 示例输出（稀疏）：
{
  type: 'content_sparse',
  severity: 'info',
  pages: [1],
  description: 'Slide 2 has sparse content (22.3% fill rate, 25 words)',
  details: {
    page: 1,
    fillRate: 22.3,
    wordCount: 25,
    bulletCount: 2
  }
}

// 示例输出（过密）：
{
  type: 'content_dense',
  severity: 'error',
  pages: [4],
  description: 'Slide 5 has too much content (95.2% fill rate, 180 words)',
  details: {
    page: 4,
    fillRate: 95.2,
    wordCount: 180,
    bulletCount: 8
  }
}
```

### 4. 样式一致性检查

检查标题长度、bullet point 数量等一致性：

```typescript
// 示例输出：
{
  type: 'inconsistency',
  severity: 'info',
  pages: [2, 5, 7],
  description: 'Inconsistent title lengths detected across 3 slides',
  details: {
    inconsistencyType: 'style',
    affectedPages: [2, 5, 7],
    expectedValue: '~45 chars',
    actualValues: {
      2: '15 chars',
      5: '80 chars',
      7: '90 chars'
    }
  }
}
```

### 5. 缺失数据检测

检查演讲者备注、图片、统计数据等：

```typescript
// 示例输出：
{
  type: 'missing_data',
  severity: 'warning',
  pages: [1, 2, 3],
  description: '3 slides are missing speaker notes',
  details: {
    missingDataType: 'speaker_notes',
    affectedSlides: [1, 2, 3]
  }
}
```

## 优化建议

每个问题都会生成对应的优化建议：

### 建议类型

```typescript
type SuggestionAction =
  | "merge" // 合并重复页面
  | "split" // 拆分过密内容
  | "adjust_layout" // 调整布局
  | "add_content" // 增加内容
  | "remove_content" // 删减内容
  | "unify_style"; // 统一样式
```

### 示例建议

```typescript
{
  id: 'sugg-001',
  issueId: 'issue-001',
  action: 'merge',
  description: 'Consider merging slides 3 and 6 to remove duplicate content',
  autoFixable: false,
  priority: 'high',
  actionData: {
    targetSlide: 2,
    sourceSlide: 5
  }
}
```

## 自动修复

部分建议支持自动修复：

```typescript
async applyFixes(documentId: string, report: QualityReport) {
  // 筛选可自动修复的建议
  const autoFixable = report.suggestions.filter(s => s.autoFixable);

  for (const suggestion of autoFixable) {
    try {
      const success = await this.qualityCheck.applyAutoFix(
        documentId,
        suggestion.id
      );

      if (success) {
        console.log(`✓ Applied fix: ${suggestion.description}`);
      }
    } catch (error) {
      console.error(`✗ Failed to apply fix: ${error.message}`);
    }
  }
}
```

### 可自动修复的类型

- `adjust_layout`: 调整布局边距
- `unify_style`: 统一样式
- `add_content` (仅限 speaker_notes): 添加演讲稿

## 评分算法

```typescript
// 基础分数：100
let score = 100;

// 扣分规则：
for (const issue of issues) {
  switch (issue.severity) {
    case "error":
      score -= 10;
      break;
    case "warning":
      score -= 5;
      break;
    case "info":
      score -= 2;
      break;
  }
}

// 最低分：0
score = Math.max(0, score);
```

### 评分等级

- 90-100: 优秀 (Excellent)
- 80-89: 良好 (Good)
- 70-79: 中等 (Fair)
- 60-69: 需改进 (Needs Improvement)
- < 60: 较差 (Poor)

## 完整使用流程

```typescript
// 1. 生成 PPT
const ppt = await pptService.generatePPT({
  prompt: "介绍人工智能的发展历程",
  themeId: "professional",
});

// 2. 执行质量检查
const report = await qualityCheck.checkQuality(ppt.id);

// 3. 输出报告摘要
console.log("Quality Report:");
console.log(`- Score: ${report.score}/100`);
console.log(`- Total Issues: ${report.issues.length}`);
console.log(
  `  - Errors: ${report.issues.filter((i) => i.severity === "error").length}`,
);
console.log(
  `  - Warnings: ${report.issues.filter((i) => i.severity === "warning").length}`,
);
console.log(
  `  - Info: ${report.issues.filter((i) => i.severity === "info").length}`,
);

// 4. 应用自动修复
const autoFixable = report.suggestions.filter((s) => s.autoFixable);
for (const suggestion of autoFixable) {
  await qualityCheck.applyAutoFix(ppt.id, suggestion.id);
}

// 5. 重新检查（验证修复效果）
const updatedReport = await qualityCheck.checkQuality(ppt.id);
console.log(
  `Updated Score: ${updatedReport.score}/100 (${updatedReport.score - report.score > 0 ? "+" : ""}${updatedReport.score - report.score})`,
);
```

## API 集成示例

```typescript
// Controller
@Controller("ppt")
export class PPTController {
  constructor(private readonly qualityCheck: QualityCheckService) {}

  @Get(":id/quality")
  async checkQuality(@Param("id") id: string) {
    return this.qualityCheck.checkQuality(id);
  }

  @Post(":id/quality/fix/:suggestionId")
  async applyFix(
    @Param("id") id: string,
    @Param("suggestionId") suggestionId: string,
  ) {
    const success = await this.qualityCheck.applyAutoFix(id, suggestionId);
    return { success };
  }
}
```

## 高级使用

### 自定义安全区

```typescript
// 自定义检查配置（需要修改服务代码）
const customSafeArea: SafeAreaConfig = {
  top: 100,
  bottom: 100,
  left: 120,
  right: 120,
  maxWidth: 1680,
  maxHeight: 880,
};

const layoutIssues = this.checkLayoutOverflow(slides, customSafeArea);
```

### 批量检查

```typescript
async batchCheck(documentIds: string[]) {
  const reports = await Promise.all(
    documentIds.map(id => this.qualityCheck.checkQuality(id))
  );

  // 按分数排序
  reports.sort((a, b) => b.score - a.score);

  return {
    total: reports.length,
    averageScore: reports.reduce((sum, r) => sum + r.score, 0) / reports.length,
    reports,
  };
}
```

## 注意事项

1. **数据库存储**: 质量报告会自动保存到 `OfficeDocument.metadata.qualityReport`
2. **性能考虑**: 大型 PPT（> 50 页）检查可能需要几秒钟
3. **相似度阈值**: 可根据需要调整 `SIMILARITY_THRESHOLD` (默认 70%)
4. **内容密度**: 阈值基于常见 PPT 最佳实践，可根据实际需求调整
5. **自动修复限制**: 仅简单问题可自动修复，复杂问题需要人工或 AI 重新生成

## 未来扩展

- [ ] AI 辅助修复：使用 LLM 自动修复内容问题
- [ ] 可访问性检查：对比度、字体大小等
- [ ] 品牌一致性：检查品牌色、Logo 等
- [ ] 性能优化：图片压缩、文件大小检查
- [ ] 演讲时长估算：基于文本量和幻灯片数量
- [ ] 多语言支持：检测和验证多语言内容
