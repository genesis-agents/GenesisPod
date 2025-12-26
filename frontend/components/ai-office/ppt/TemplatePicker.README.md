# TemplatePicker 组件

PPT 模板选择器组件，用于选择和应用专业的幻灯片模板。

## 功能特性

✅ **12 种专业模板** - 涵盖封面、目录、内容、对比、时间线等多种场景
✅ **智能推荐** - 根据当前页面内容自动推荐最合适的模板
✅ **可视化预览** - 每个模板都有精心设计的缩略图预览
✅ **匹配度评分** - 显示每个推荐模板的匹配分数和原因
✅ **响应式布局** - 自适应不同屏幕尺寸，支持移动端
✅ **Mantine UI** - 使用 Mantine 组件库，风格统一

## 安装依赖

```bash
npm install @mantine/core @mantine/hooks lucide-react
```

## 基础使用

```tsx
import { TemplatePicker } from '@/components/ai-office/ppt';

function MyComponent() {
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  return (
    <TemplatePicker
      onApplyTemplate={(template) => {
        setSelectedTemplate(template);
        console.log('应用模板:', template);
      }}
      selectedTemplateKey={selectedTemplate?.key}
    />
  );
}
```

## Props

| 属性                  | 类型                                | 必填 | 默认值  | 说明                              |
| --------------------- | ----------------------------------- | ---- | ------- | --------------------------------- |
| `pptId`               | `string`                            | ❌   | -       | PPT 文档 ID（启用智能推荐时必填） |
| `slideIndex`          | `number`                            | ❌   | -       | 幻灯片索引（启用智能推荐时必填）  |
| `selectedTemplateKey` | `string`                            | ❌   | -       | 当前选中的模板 key                |
| `onApplyTemplate`     | `(template: SlideTemplate) => void` | ✅   | -       | 模板应用回调函数                  |
| `enableSmartMatch`    | `boolean`                           | ❌   | `false` | 是否启用智能推荐模式              |
| `className`           | `string`                            | ❌   | `''`    | 自定义 CSS 类名                   |

## 模板数据结构

```typescript
interface SlideTemplate {
  key: string; // 模板唯一标识
  name: string; // 英文名称
  nameZh: string; // 中文名称
  purpose: string[]; // 适用场景
  contentTypes: string[]; // 内容类型
  layout: {
    type: string; // 布局类型
    showBrand?: boolean; // 是否显示品牌
    showPageRefs?: boolean; // 是否显示页码
  };
  defaultStyle: {
    backgroundType?: string; // 背景类型
    emphasisLevel?: string; // 强调级别
  };
  description?: string; // 模板描述
}
```

## 使用场景

### 1. 基础模板选择

仅显示所有可用模板，让用户手动选择。

```tsx
<TemplatePicker
  onApplyTemplate={(template) => {
    applyTemplate(template);
  }}
/>
```

### 2. 智能推荐模式

根据当前页面内容推荐最合适的模板，并显示匹配分数。

```tsx
<TemplatePicker
  pptId="ppt-123"
  slideIndex={2}
  enableSmartMatch={true}
  onApplyTemplate={(template) => {
    applyTemplateToSlide(pptId, slideIndex, template);
  }}
/>
```

### 3. 在模态框中使用

```tsx
function TemplatePickerModal({ isOpen, onClose, pptId, slideIndex }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-xl bg-white p-6">
        <h2 className="mb-4 text-xl font-bold">选择模板</h2>
        <TemplatePicker
          pptId={pptId}
          slideIndex={slideIndex}
          enableSmartMatch={true}
          onApplyTemplate={(template) => {
            applyTemplate(template);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
```

### 4. 在侧边栏中使用

```tsx
<div className="flex h-screen">
  {/* 主编辑区 */}
  <div className="flex-1">
    <SlideEditor />
  </div>

  {/* 右侧模板选择器 */}
  <div className="w-96 overflow-y-auto border-l p-4">
    <TemplatePicker
      pptId={pptId}
      slideIndex={currentSlideIndex}
      enableSmartMatch={true}
      onApplyTemplate={handleApplyTemplate}
      className="h-full"
    />
  </div>
</div>
```

## API 端点

组件内部调用以下 API：

### 获取所有模板

```
GET /api/ai-office/ppt/templates/all
```

返回所有 12 种可用模板的列表。

### 为单页推荐模板

```
POST /api/ai-office/ppt/{pptId}/slides/{slideIndex}/suggest-templates
```

返回推荐模板列表（按匹配度从高到低排序）：

```json
{
  "success": true,
  "suggestions": [
    {
      "template": { ... },
      "score": 95,
      "reason": "目的匹配（title），内容类型匹配（text_only）"
    }
  ]
}
```

## 模板类型

组件支持 12 种专业模板：

| 模板 Key              | 中文名称      | 适用场景     | 布局类型   |
| --------------------- | ------------- | ------------ | ---------- |
| `cover_hero`          | 封面·商务简约 | 演示文稿封面 | 居中       |
| `agenda_simple`       | 目录·简洁列表 | 目录页       | 单栏       |
| `section_divider`     | 章节扉页      | 章节分隔     | 居中       |
| `exec_summary`        | 执行摘要      | 核心要点总结 | 卡片网格   |
| `two_column_compare`  | 两列对比      | 对比分析     | 双栏       |
| `three_pillars`       | 三支柱框架    | 三要素展示   | 三栏       |
| `framework_5`         | 五要素框架    | 五要素展示   | 五边形     |
| `case_cards`          | 案例卡片      | 案例展示     | 卡片       |
| `kpi_highlights`      | 关键数据      | 数据展示     | 指标卡片   |
| `timeline_horizontal` | 时间轴        | 时间线       | 水平时间线 |
| `roadmap`             | 路线图        | 发展规划     | 阶段展示   |
| `conclusion_actions`  | 结论与建议    | 总结建议     | 双区块     |

## 智能推荐算法

推荐算法基于以下因素：

1. **目的匹配** (50 分) - 模板目的与页面目的是否一致
2. **内容类型匹配** (40 分) - 模板支持的内容类型与页面内容是否匹配
3. **相似度评分** (10-20 分) - 部分匹配的加分

**匹配分数说明：**

- 90-100 分：完美匹配，强烈推荐
- 70-89 分：较好匹配，推荐使用
- 50-69 分：基本匹配，可以使用
- < 50 分：不太匹配，不显示

## 样式定制

组件使用 Tailwind CSS 和 Mantine UI，可以通过 `className` 属性自定义样式：

```tsx
<TemplatePicker
  className="rounded-xl p-6 shadow-lg"
  onApplyTemplate={handleApply}
/>
```

## 注意事项

1. **智能推荐需要后端支持** - 确保后端已实现推荐接口
2. **API 响应格式** - 后端返回的模板数据必须符合 `SlideTemplate` 接口
3. **错误处理** - 推荐失败不会阻塞主流程，会降级为显示所有模板
4. **性能优化** - 使用 `useCallback` 和 `useMemo` 避免不必要的重渲染

## 测试

运行单元测试：

```bash
npm test TemplatePicker.test.tsx
```

测试覆盖：

- ✅ 加载状态渲染
- ✅ 模板列表渲染
- ✅ 错误状态处理
- ✅ 用户交互
- ✅ 智能推荐功能
- ✅ API 调用

## 相关文件

- `TemplatePicker.tsx` - 主组件
- `TemplatePicker.example.tsx` - 使用示例
- `TemplatePicker.test.tsx` - 单元测试
- `TemplatePicker.README.md` - 本文档

## 后续优化

- [ ] 添加模板预览的动画效果
- [ ] 支持模板分类筛选
- [ ] 支持模板搜索功能
- [ ] 支持自定义模板
- [ ] 添加模板收藏功能

## 许可证

MIT
