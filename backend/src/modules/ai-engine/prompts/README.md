# Prompts Module

AI Prompt 模板版本管理模块

## 功能概述

提供 AI 任务 Prompt 模板的数据库化管理：

- **版本管理**：创建、激活、回滚不同版本的 Prompt 模板
- **灰度发布**：支持逐步激活新版本模板
- **变量渲染**：支持模板变量替换
- **缓存优化**：活跃模板自动缓存，提升查询性能

## 核心组件

### PromptTemplateService

Prompt 模板管理服务，提供以下核心功能：

#### 1. 获取模板

```typescript
// 获取活跃版本（默认）
const template = await promptTemplateService.getPrompt('PRD');

// 获取指定版本
const v2Template = await promptTemplateService.getPrompt('PRD', 2);
```

#### 2. 创建新版本

```typescript
const newTemplate = await promptTemplateService.createVersion(
  {
    taskType: 'PRD',
    name: 'PRD 生成模板',
    template: '请根据以下需求生成 PRD：\n\n{{userInput}}',
    variables: ['userInput'],
    description: '用于生成产品需求文档',
    createdBy: 'admin',
  },
  '优化了输出格式', // 可选的变更说明
);
```

#### 3. 激活版本

```typescript
// 激活指定版本（同时停用其他版本）
const activated = await promptTemplateService.activateVersion('PRD', 2);
```

#### 4. 回滚版本

```typescript
// 回滚到之前的版本
const rollback = await promptTemplateService.rollback('PRD', 1);
```

#### 5. 模板渲染

```typescript
const rendered = promptTemplateService.renderTemplate(
  '你好，{{name}}！今天是{{date}}。',
  { name: '用户', date: '2025-01-24' },
);
// 输出: "你好，用户！今天是2025-01-24。"
```

支持两种变量格式：
- `{{variableName}}` - 双花括号
- `${variableName}` - 美元符号

#### 6. 辅助方法

```typescript
// 获取所有版本
const versions = await promptTemplateService.getAllVersions('PRD');

// 获取所有任务类型
const taskTypes = await promptTemplateService.getAllTaskTypes();

// 删除版本（不允许删除活跃版本）
await promptTemplateService.deleteVersion('PRD', 2);

// 获取统计信息
const stats = await promptTemplateService.getActiveTemplateStats();
// { totalTemplates: 10, activeTemplates: 5, taskTypes: 5 }
```

## 数据库 Schema

```prisma
model PromptTemplate {
  id          String   @id @default(cuid())
  taskType    String   // 任务类型，如 "PRD", "CODE_REVIEW"
  name        String   // 模板名称
  version     Int      @default(1) // 版本号
  template    String   @db.Text // 模板内容
  variables   Json?    // 支持的变量列表
  isActive    Boolean  @default(false) // 是否为活跃版本
  description String?  @db.Text // 描述信息
  createdBy   String?  // 创建者
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([taskType, version]) // 同一任务类型的版本号唯一
  @@index([taskType, isActive]) // 快速查询活跃模板
  @@map("prompt_templates")
}
```

## 使用示例

### 在其他模块中使用

```typescript
import { PromptTemplateService } from '@/modules/ai-engine/prompts';

@Injectable()
export class MyService {
  constructor(
    private readonly promptTemplateService: PromptTemplateService,
  ) {}

  async generatePRD(userInput: string) {
    // 1. 获取活跃的 PRD 模板
    const template = await this.promptTemplateService.getPrompt('PRD');

    if (!template) {
      throw new Error('PRD template not found');
    }

    // 2. 渲染模板
    const prompt = this.promptTemplateService.renderTemplate(
      template.template,
      { userInput },
    );

    // 3. 调用 AI 生成
    const result = await this.aiChatService.chat({
      messages: [{ role: 'user', content: prompt }],
      modelType: AIModelType.CHAT,
    });

    return result;
  }
}
```

### 模板版本管理工作流

```typescript
// 1. 创建初始版本
const v1 = await promptTemplateService.createVersion({
  taskType: 'CODE_REVIEW',
  name: '代码审查模板',
  template: '请审查以下代码：\n\n{{code}}',
  variables: ['code'],
});

// 2. 激活版本 1
await promptTemplateService.activateVersion('CODE_REVIEW', 1);

// 3. 创建改进版本
const v2 = await promptTemplateService.createVersion(
  {
    taskType: 'CODE_REVIEW',
    name: '代码审查模板 v2',
    template: '请审查以下{{language}}代码，关注点：{{focus}}\n\n{{code}}',
    variables: ['language', 'focus', 'code'],
  },
  '增加了语言和关注点参数',
);

// 4. 激活新版本（灰度发布）
await promptTemplateService.activateVersion('CODE_REVIEW', 2);

// 5. 如果发现问题，回滚到旧版本
await promptTemplateService.rollback('CODE_REVIEW', 1);
```

## 缓存机制

- **活跃模板缓存**：5 分钟 TTL
- **自动刷新**：超时后自动从数据库重新加载
- **激活时刷新**：激活新版本时立即刷新缓存

## 设计原则

1. **版本隔离**：每个版本独立存储，互不影响
2. **单一活跃版本**：每个任务类型同时只有一个活跃版本
3. **安全删除**：不允许删除活跃版本，防止误操作
4. **灰度发布**：支持逐步切换版本，降低风险
5. **变更追踪**：记录创建者和变更说明，便于审计

## 最佳实践

### 1. 任务类型命名

建议使用清晰的大写命名：

- `PRD` - 产品需求文档生成
- `CODE_REVIEW` - 代码审查
- `SUMMARY` - 内容摘要
- `RESEARCH_PLAN` - 研究规划
- `TRANSLATION` - 翻译

### 2. 变量命名

使用 camelCase，语义清晰：

```typescript
variables: ['userInput', 'targetLanguage', 'outputFormat']
```

### 3. 版本说明

创建新版本时提供清晰的变更说明：

```typescript
await promptTemplateService.createVersion(
  dto,
  '修复：输出格式不统一 | 新增：支持多语言输出',
);
```

### 4. 测试新版本

在激活新版本前，先用 `getPrompt(taskType, version)` 测试：

```typescript
// 测试新版本
const v2 = await promptTemplateService.getPrompt('PRD', 2);
const testResult = await testPrompt(v2.template);

// 确认无误后激活
if (testResult.success) {
  await promptTemplateService.activateVersion('PRD', 2);
}
```

## 迁移指南

### 从硬编码 Prompt 迁移

**Before:**

```typescript
const prompt = `请根据以下需求生成 PRD：\n\n${userInput}`;
```

**After:**

```typescript
// 1. 创建模板（一次性）
await promptTemplateService.createVersion({
  taskType: 'PRD',
  name: 'PRD 生成模板',
  template: '请根据以下需求生成 PRD：\n\n{{userInput}}',
  variables: ['userInput'],
});
await promptTemplateService.activateVersion('PRD', 1);

// 2. 使用模板
const template = await promptTemplateService.getPrompt('PRD');
const prompt = promptTemplateService.renderTemplate(
  template.template,
  { userInput },
);
```

## 相关文件

- `prompt-template.service.ts` - 核心服务实现
- `prompts.module.ts` - NestJS 模块定义
- `index.ts` - 导出文件
- `README.md` - 本文档

## 待扩展功能

- [ ] A/B 测试支持（同时激活多个版本）
- [ ] 模板性能监控（响应时间、成功率）
- [ ] 模板使用统计
- [ ] 模板克隆功能
- [ ] 模板导入/导出
- [ ] 模板审批流程

---

**最后更新**: 2025-01-24
**维护者**: AI Engine Team
