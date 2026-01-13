# Topic Research 报告编辑功能实现总结

## 实现状态

### ✅ 已完成

1. **数据库模型** - 已存在于 Prisma Schema
   - `ReportChange` - 报告变更记录
   - `ReportAnnotation` - 报告批注
   - `ReportRevision` - 报告修订历史(已有)
   - 枚举: `ChangeType`, `AnnotationType`, `AnnotationStatus`

2. **DTO 定义**
   - `backend/src/modules/ai-app/research/topic-research/dto/report-editing.dto.ts`
   - 包含所有批注和变更相关的 DTO

3. **服务层实现**
   - `ReportChangeService` - 变更检测和管理
   - `ReportAnnotationService` - 批注 CRUD
   - `TopicResearchEditingService` - 集成服务(待连接)

4. **Controller 端点**
   - 已在 `topic-research.controller.ts` 中定义(已注释)
   - 暂时在 `TopicResearchService` 中返回空实现

### 🔧 待实现

1. **连接服务层**
   - 在 `TopicResearchModule` 中注册 `ReportChangeService` 和 `ReportAnnotationService`
   - 将 `TopicResearchService` 中的空实现替换为实际调用

2. **数据库迁移**
   - 如果模型尚未迁移,运行: `npx prisma migrate dev`

3. **取消 Controller 注释**
   - 在服务层实现完成后,取消 controller 中的注释

## 文件清单

### 新增文件

```
backend/src/modules/ai-app/research/topic-research/
├── dto/
│   └── report-editing.dto.ts              # DTO 定义
├── services/
│   ├── report-change.service.ts           # 变更检测服务
│   └── report-annotation.service.ts       # 批注管理服务
└── topic-research-editing.service.ts      # 集成服务
```

### 修改文件

```
backend/src/modules/ai-app/research/topic-research/
├── topic-research.controller.ts           # 添加了 API 端点(已注释)
└── topic-research.service.ts              # 添加了空实现方法
```

### 数据库迁移

```
backend/prisma/migrations/20260113_add_report_changes_annotations/
└── migration.sql
```

## API 端点列表

### 变更管理

| 方法 | 路径                                                           | 描述             |
| ---- | -------------------------------------------------------------- | ---------------- |
| GET  | `/topics/:topicId/reports/:reportId/changes`                   | 获取变更列表     |
| POST | `/topics/:topicId/reports/:reportId/changes/:changeId/checkin` | Checkin 单条变更 |
| POST | `/topics/:topicId/reports/:reportId/changes/checkin`           | 批量 Checkin     |

### 批注管理

| 方法   | 路径                                                         | 描述         |
| ------ | ------------------------------------------------------------ | ------------ |
| GET    | `/topics/:topicId/reports/:reportId/annotations`             | 获取批注列表 |
| POST   | `/topics/:topicId/reports/:reportId/annotations`             | 创建批注     |
| PATCH  | `/topics/:topicId/reports/:reportId/annotations/:id`         | 更新批注     |
| DELETE | `/topics/:topicId/reports/:reportId/annotations/:id`         | 删除批注     |
| POST   | `/topics/:topicId/reports/:reportId/annotations/:id/resolve` | 解决批注     |
| POST   | `/topics/:topicId/reports/:reportId/annotations/resolve-all` | 批量解决     |

## 下一步操作

### 1. 更新 Module 注册

编辑 `backend/src/modules/ai-app/research/topic-research/topic-research.module.ts`:

```typescript
import { ReportChangeService } from "./services/report-change.service";
import { ReportAnnotationService } from "./services/report-annotation.service";

@Module({
  providers: [
    // ... 现有 providers
    ReportChangeService,
    ReportAnnotationService,
  ],
  // ...
})
export class TopicResearchModule {}
```

### 2. 连接服务实现

在 `TopicResearchService` 中:

```typescript
constructor(
  // ... 现有注入
  private readonly reportChangeService: ReportChangeService,
  private readonly reportAnnotationService: ReportAnnotationService,
) {}

// 替换空实现为实际调用
async getReportChanges(userId: string, topicId: string, reportId: string) {
  await this.verifyTopicOwnership(userId, topicId);
  return this.reportChangeService.getChanges(reportId);
}
```

### 3. 取消 Controller 注释

在 `topic-research.controller.ts` 中取消注释已定义的端点。

### 4. 运行测试

```bash
# 类型检查
npm run type-check

# 单元测试
npm run test

# 启动开发服务器
npm run start:dev
```

## 核心功能说明

### 变更检测算法

`ReportChangeService.detectChanges()` 使用简单的段落级别 diff:

1. 按 `\n\n` 分割段落
2. 逐段落比较前后版本
3. 标记为 ADDED / MODIFIED / DELETED
4. 计算单词数差异

### 批注系统

- 支持 4 种类型: COMMENT, SUGGESTION, ISSUE, REFERENCE
- 3 种状态: OPEN, RESOLVED, DISMISSED
- 与报告内容通过偏移量(startOffset/endOffset)关联

### 数据模型关系

```
TopicReport (1) ───< (N) ReportChange
             └───< (N) ReportAnnotation
             └───< (N) ReportRevision

User ──< ReportChange (checkedInBy)
     └─< ReportAnnotation (createdBy, resolvedBy)
```

## 注意事项

1. **权限验证**: 所有操作都需要验证用户对专题的所有权
2. **级联删除**: 报告删除时会自动删除关联的变更和批注
3. **偏移量计算**: 批注位置基于字符偏移量,编辑报告后需重新计算
4. **性能优化**: 大报告的变更检测可能较慢,考虑使用后台任务

## 参考文档

- PRD: `docs/prd/topic-research-report-editing.md`
- Prisma Schema: `backend/prisma/schema.prisma` (line 7183-7253)
- AI 调用规范: `docs/guides/ai-calling-standards.md`
