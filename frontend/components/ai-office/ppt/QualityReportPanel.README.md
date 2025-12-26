# QualityReportPanel - PPT 质量检查报告面板

## 概述

`QualityReportPanel` 是一个用于显示 PPT 质量检查报告的 React 组件，提供了直观的质量评分、问题列表和优化建议。

## 功能特性

- ✅ **质量评分可视化**：使用环形进度条显示 0-100 分的质量分数
- ✅ **问题分类显示**：按严重程度（错误/警告/提示）分组展示问题
- ✅ **优化建议**：提供可操作的优化建议列表
- ✅ **一键修复**：支持自动修复可修复的问题
- ✅ **页面跳转**：点击问题可跳转到对应的幻灯片页面
- ✅ **实时刷新**：支持手动刷新质量报告

## 安装依赖

确保已安装以下依赖：

```bash
npm install @mantine/core @mantine/hooks lucide-react
```

## 基础用法

```tsx
import QualityReportPanel from '@/components/ai-office/ppt/QualityReportPanel';

function MyComponent() {
  const handleJumpToPage = (pageIndex: number) => {
    // 跳转到指定页面的逻辑
    console.log('跳转到页面:', pageIndex);
  };

  return (
    <QualityReportPanel
      documentId="ppt-12345"
      onJumpToPage={handleJumpToPage}
      onReportUpdate={(report) => {
        console.log('质量报告:', report);
      }}
    />
  );
}
```

## Props

| 属性             | 类型                              | 必需 | 描述                     |
| ---------------- | --------------------------------- | ---- | ------------------------ |
| `documentId`     | `string`                          | ✅   | PPT 文档的 ID            |
| `onJumpToPage`   | `(page: number) => void`          | ❌   | 点击页面标记时的回调函数 |
| `onReportUpdate` | `(report: QualityReport) => void` | ❌   | 质量报告更新时的回调函数 |

## 数据结构

### QualityReport

```typescript
interface QualityReport {
  documentId: string; // 文档 ID
  checkedAt: Date; // 检查时间
  score: number; // 质量分数 (0-100)
  issues: QualityIssue[]; // 问题列表
  suggestions: Suggestion[]; // 建议列表
}
```

### QualityIssue

```typescript
interface QualityIssue {
  id: string;
  type:
    | 'duplicate'
    | 'layout_overflow'
    | 'content_sparse'
    | 'content_dense'
    | 'inconsistency';
  severity: 'error' | 'warning' | 'info';
  pages: number[]; // 受影响的页面索引
  description: string; // 问题描述
  details?: any; // 详细信息（可选）
}
```

### Suggestion

```typescript
interface Suggestion {
  id: string;
  issueId: string; // 关联的问题 ID
  action:
    | 'merge'
    | 'split'
    | 'adjust_layout'
    | 'add_content'
    | 'remove_content'
    | 'unify_style';
  description: string; // 建议描述
  autoFixable: boolean; // 是否可自动修复
  priority: 'high' | 'medium' | 'low'; // 优先级
}
```

## API 端点

组件会调用以下 API 端点：

### 1. 获取质量报告

```
GET /api/ai-office/ppt/{id}/quality-check
```

**响应示例：**

```json
{
  "documentId": "ppt-12345",
  "checkedAt": "2024-12-25T10:00:00Z",
  "score": 75,
  "issues": [
    {
      "id": "issue-1",
      "type": "duplicate",
      "severity": "warning",
      "pages": [2, 5],
      "description": "第 3 页和第 6 页存在重复内容"
    }
  ],
  "suggestions": [
    {
      "id": "sug-1",
      "issueId": "issue-1",
      "action": "merge",
      "description": "建议合并第 3 页和第 6 页",
      "autoFixable": true,
      "priority": "medium"
    }
  ]
}
```

### 2. 应用单个修复

```
POST /api/ai-office/ppt/{id}/quality-fix
```

**请求体：**

```json
{
  "suggestionId": "sug-1"
}
```

### 3. 应用所有自动修复

```
POST /api/ai-office/ppt/{id}/quality-fix-all
```

## 集成示例

### 示例 1: 在 PPT 编辑器中作为侧边栏

```tsx
import { Tabs } from '@mantine/core';
import QualityReportPanel from '@/components/ai-office/ppt/QualityReportPanel';

function PPTEditor({ documentId }: { documentId: string }) {
  const [selectedPage, setSelectedPage] = useState(0);

  return (
    <div style={{ display: 'flex' }}>
      <div style={{ flex: 1 }}>{/* 幻灯片预览 */}</div>

      <div style={{ width: 360 }}>
        <Tabs defaultValue="quality">
          <Tabs.List>
            <Tabs.Tab value="edit">编辑</Tabs.Tab>
            <Tabs.Tab value="quality">质量检查</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="quality">
            <QualityReportPanel
              documentId={documentId}
              onJumpToPage={setSelectedPage}
            />
          </Tabs.Panel>
        </Tabs>
      </div>
    </div>
  );
}
```

### 示例 2: 在导出前的质量检查

```tsx
function ExportButton({ documentId }: { documentId: string }) {
  const [showQualityCheck, setShowQualityCheck] = useState(false);

  return (
    <>
      <Button onClick={() => setShowQualityCheck(true)}>导出 PPT</Button>

      {showQualityCheck && (
        <Modal opened onClose={() => setShowQualityCheck(false)}>
          <QualityReportPanel documentId={documentId} />
        </Modal>
      )}
    </>
  );
}
```

## 样式定制

组件使用 Mantine UI 的主题系统，可以通过 MantineProvider 进行全局样式定制：

```tsx
import { MantineProvider } from '@mantine/core';

<MantineProvider
  theme={{
    colors: {
      // 自定义颜色
    },
  }}
>
  <QualityReportPanel documentId="..." />
</MantineProvider>;
```

## 问题类型说明

| 类型              | 说明                                       |
| ----------------- | ------------------------------------------ |
| `duplicate`       | 重复内容：多个页面存在相似或重复的内容     |
| `layout_overflow` | 布局溢出：内容超出幻灯片边界               |
| `content_sparse`  | 内容稀疏：页面内容过少，建议合并或添加内容 |
| `content_dense`   | 内容密集：页面内容过多，建议拆分或精简     |
| `inconsistency`   | 样式不一致：字体、颜色、布局等样式不统一   |

## 建议操作说明

| 操作             | 说明                           |
| ---------------- | ------------------------------ |
| `merge`          | 合并页面：将多个页面合并为一个 |
| `split`          | 拆分页面：将一个页面拆分为多个 |
| `adjust_layout`  | 调整布局：优化页面布局         |
| `add_content`    | 添加内容：为稀疏页面添加内容   |
| `remove_content` | 精简内容：删除冗余内容         |
| `unify_style`    | 统一样式：统一字体、颜色等样式 |

## 注意事项

1. **依赖 Mantine UI**：确保项目中已安装并配置 Mantine UI
2. **API 端点**：需要后端实现对应的 API 端点
3. **页面索引**：页面索引从 0 开始（第 1 页的索引是 0）
4. **自动修复**：只有标记为 `autoFixable: true` 的建议才会显示自动修复按钮

## 最佳实践

1. **在导出前检查**：建议在导出 PPT 前进行质量检查
2. **定期检查**：在编辑过程中定期运行质量检查
3. **处理高优先级问题**：优先处理标记为 "high" 优先级的建议
4. **分数阈值**：建议分数低于 60 分时提示用户优化

## 更新日志

### v1.0.0 (2024-12-25)

- ✅ 初始版本发布
- ✅ 支持质量评分显示
- ✅ 支持问题列表展示
- ✅ 支持优化建议
- ✅ 支持一键自动修复

## 许可证

MIT
