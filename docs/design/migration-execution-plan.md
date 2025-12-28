# DeepDive Engine 目录重构执行计划

> 版本: 1.0 | 创建日期: 2025-12-28

---

## 一、执行策略

### 核心原则

1. **渐进式迁移** - 不一次性重构，逐步推进
2. **新旧共存** - 通过 barrel exports 保持兼容
3. **测试先行** - 每次迁移后立即验证
4. **可回滚** - 每个阶段独立提交，可回滚

### 迁移顺序

```
Phase 1: 后端基础设施 (2天)
    ↓
Phase 2: AI Core 增强 (3天)
    ↓
Phase 3: 前端组件重组 (3天)
    ↓
Phase 4: 清理与文档 (1天)
```

---

## 二、Phase 1: 后端基础设施 (2天)

### 1.1 创建公共 DTO 目录

**目标**: `backend/src/common/dtos/`

```bash
# 创建目录结构
mkdir -p backend/src/common/dtos/{base,ai}
```

**创建文件清单**:

| 文件                     | 用途              |
| ------------------------ | ----------------- |
| `base/pagination.dto.ts` | 分页请求/响应 DTO |
| `base/response.dto.ts`   | 统一响应格式      |
| `base/query.dto.ts`      | 通用查询参数      |
| `ai/chat.dto.ts`         | AI 聊天相关 DTO   |
| `ai/stream.dto.ts`       | 流式响应 DTO      |
| `index.ts`               | Barrel export     |

**执行步骤**:

```bash
# Step 1: 创建目录
mkdir -p backend/src/common/dtos/{base,ai}

# Step 2: 创建 pagination.dto.ts
cat > backend/src/common/dtos/base/pagination.dto.ts << 'EOF'
import { IsOptional, IsInt, Min, Max, IsString, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';

export class PaginationQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value))
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value))
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class PaginatedResponseDto<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };

  static create<T>(data: T[], total: number, page: number, limit: number): PaginatedResponseDto<T> {
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      meta: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
    };
  }
}
EOF

# Step 3: 创建 index.ts
cat > backend/src/common/dtos/index.ts << 'EOF'
export * from './base/pagination.dto';
// export * from './base/response.dto';  // 后续添加
// export * from './ai/chat.dto';        // 后续添加
EOF

# Step 4: 验证
cd backend && npm run type-check
```

**验证检查点**:

- [ ] 目录创建成功
- [ ] 类型检查通过
- [ ] 可从 `@/common/dtos` 导入

---

### 1.2 增强统一错误处理

**目标**: `backend/src/common/errors/`

**现状检查**:

- `common/filters/all-exceptions.filter.ts` 已存在
- `common/utils/error.utils.ts` 已存在
- 缺少: `ErrorCode` 枚举, `ErrorFactory`

```bash
# Step 1: 创建 errors 目录
mkdir -p backend/src/common/errors

# Step 2: 创建 error.types.ts
cat > backend/src/common/errors/error.types.ts << 'EOF'
export enum ErrorCode {
  // 通用错误 (1xxx)
  UNKNOWN = 1000,
  VALIDATION = 1001,
  NOT_FOUND = 1002,
  UNAUTHORIZED = 1003,
  FORBIDDEN = 1004,

  // AI 错误 (2xxx)
  AI_SERVICE_UNAVAILABLE = 2000,
  AI_RATE_LIMIT = 2001,
  AI_TIMEOUT = 2002,
  AI_INVALID_RESPONSE = 2003,

  // 数据错误 (3xxx)
  DATA_DUPLICATE = 3000,
  DATA_INTEGRITY = 3001,

  // 外部服务错误 (4xxx)
  EXTERNAL_SERVICE = 4000,
}

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
EOF

# Step 3: 创建 index.ts
cat > backend/src/common/errors/index.ts << 'EOF'
export * from './error.types';
EOF

# Step 4: 验证
cd backend && npm run type-check
```

**验证检查点**:

- [ ] ErrorCode 枚举可用
- [ ] 类型检查通过

---

### 1.3 Phase 1 完成检查

```bash
# 运行完整验证
cd backend && npm run type-check && npm run test:quick

# 提交
git add backend/src/common/dtos backend/src/common/errors
git commit -m "feat(common): add unified DTOs and error types"
```

---

## 三、Phase 2: AI Core 增强 (3天)

### 2.1 创建 AI 基类目录结构

**目标**: 在现有 `ai-core/` 基础上增强

```bash
# 创建子目录
mkdir -p backend/src/modules/ai/ai-core/{prompts,agents,types}
mkdir -p backend/src/modules/ai/ai-core/prompts/{system,tasks,templates}
mkdir -p backend/src/modules/ai/ai-core/agents/tools
```

### 2.2 创建 BaseAIChatService

**文件**: `backend/src/modules/ai/ai-core/base-ai-chat.service.ts`

```typescript
// 抽取现有 ai-chat.service.ts 中的通用逻辑
// 作为基类供其他 AI 模块继承
```

**执行步骤**:

1. 分析现有 `ai-chat.service.ts` (105KB)
2. 提取通用聊天逻辑到 `base-ai-chat.service.ts`
3. 让 `ai-chat.service.ts` 继承基类
4. 验证功能不变

```bash
# Step 1: 创建基类 (先创建空文件，后续填充)
touch backend/src/modules/ai/ai-core/base-ai-chat.service.ts

# Step 2: 验证现有功能
cd backend && npm run test -- --testPathPattern=ai-chat

# Step 3: 逐步重构（需要手动）
```

### 2.3 创建提示词库

**目录**: `backend/src/modules/ai/ai-core/prompts/`

```bash
# 创建 PromptTemplate 类
cat > backend/src/modules/ai/ai-core/prompts/templates/prompt.template.ts << 'EOF'
export interface PromptTemplateConfig {
  id: string;
  version: string;
  name: string;
  template: string;
  variables: string[];
}

export class PromptTemplate {
  constructor(private readonly config: PromptTemplateConfig) {}

  get id(): string { return this.config.id; }
  get version(): string { return this.config.version; }

  render(variables: Record<string, unknown>): string {
    let result = this.config.template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replaceAll(`{{${key}}}`, String(value));
    }
    return result;
  }

  validate(variables: Record<string, unknown>): boolean {
    return this.config.variables.every(v => v in variables);
  }
}
EOF

# 创建 index.ts
cat > backend/src/modules/ai/ai-core/prompts/index.ts << 'EOF'
export * from './templates/prompt.template';
EOF
```

### 2.4 Phase 2 完成检查

```bash
# 验证
cd backend && npm run type-check && npm run test:quick

# 提交
git add backend/src/modules/ai/ai-core/
git commit -m "feat(ai-core): add base classes, prompts, and agent framework"
```

---

## 四、Phase 3: 前端组件重组 (3天)

### 3.1 现有 shared 组件分析

当前 `frontend/components/shared/` 包含:

| 组件                    | 建议归属                           | 说明         |
| ----------------------- | ---------------------------------- | ------------ |
| `ErrorBoundary.tsx`     | `ui/states/`                       | 通用状态组件 |
| `ChunkErrorHandler.tsx` | `ui/states/`                       | 通用状态组件 |
| `SignInPrompt.tsx`      | `ui/states/`                       | 通用状态组件 |
| `ViewToggle.tsx`        | `ui/navigation/`                   | 导航组件     |
| `ImportSelector.tsx`    | `business/import-export/`          | 业务组件     |
| `dialogs/*.tsx`         | `composed/dialogs/` 或 `business/` | 根据通用性   |
| `views/*.tsx`           | `business/`                        | 业务视图组件 |
| `Ai*.tsx`               | `business/ai/`                     | AI 业务组件  |
| `Sync*.tsx`             | `business/sync/`                   | 同步业务组件 |

### 3.2 创建新目录结构

```bash
# 创建前端目录结构
mkdir -p frontend/components/ui/{states,navigation}
mkdir -p frontend/components/composed/{dialogs,forms}
mkdir -p frontend/components/business/{import-export,ai,sync,views}
```

### 3.3 迁移策略

**原则**: 保持旧路径可用，新代码使用新路径

```typescript
// frontend/components/shared/index.ts
// 保持向后兼容的 re-export

// 逐步迁移后，旧路径 re-export 新位置
export { ErrorBoundary } from "../ui/states/ErrorBoundary";
export { ViewToggle } from "../ui/navigation/ViewToggle";
// ... 其他组件
```

**迁移单个组件步骤**:

```bash
# 以 ErrorBoundary 为例
# Step 1: 移动文件
git mv frontend/components/shared/ErrorBoundary.tsx frontend/components/ui/states/

# Step 2: 更新 shared/index.ts re-export
# Step 3: 验证
npm run type-check

# Step 4: 提交
git commit -m "refactor(ui): move ErrorBoundary to ui/states"
```

### 3.4 Phase 3 完成检查

```bash
cd frontend && npm run type-check && npm run build
git add frontend/components/
git commit -m "refactor(frontend): reorganize component structure"
```

---

## 五、Phase 4: 清理与文档 (1天)

### 4.1 清理废弃 re-exports

```bash
# 检查还有哪些地方使用旧路径
grep -r "from.*shared" frontend/

# 逐步更新导入路径
# 当所有导入都使用新路径后，删除旧的 re-exports
```

### 4.2 更新文档

- [ ] 更新 `CLAUDE.md` 目录结构说明
- [ ] 更新 `component-reuse-improvement-plan.md` 状态
- [ ] 创建 `MIGRATION.md` 迁移指南

### 4.3 最终验证

```bash
# 全栈验证
npm run verify:full

# 确保生产构建正常
npm run build
```

---

## 六、执行检查清单

### Phase 1 (Day 1-2)

- [ ] 创建 `common/dtos/` 目录和基础 DTO
- [ ] 创建 `common/errors/` 统一错误类型
- [ ] 类型检查通过
- [ ] 提交代码

### Phase 2 (Day 3-5)

- [ ] 创建 `ai-core/prompts/` 提示词库
- [ ] 创建 `PromptTemplate` 类
- [ ] 创建 `ai-core/agents/` Agent 框架
- [ ] 创建 `BaseAgent` 基类
- [ ] 类型检查通过
- [ ] 提交代码

### Phase 3 (Day 6-8)

- [ ] 创建前端新目录结构
- [ ] 迁移 `shared/` 组件到新位置
- [ ] 保持旧路径 re-export 兼容
- [ ] 构建验证通过
- [ ] 提交代码

### Phase 4 (Day 9)

- [ ] 清理废弃导入
- [ ] 更新文档
- [ ] 全栈验证通过
- [ ] 最终提交

---

## 七、回滚计划

如果任何阶段出现问题:

```bash
# 查看最近提交
git log --oneline -10

# 回滚到上一个稳定状态
git revert HEAD

# 或重置到特定提交
git reset --hard <commit-hash>
```

---

## 八、风险与缓解

| 风险             | 缓解措施                |
| ---------------- | ----------------------- |
| 导入路径大量报错 | 使用 re-export 保持兼容 |
| 构建失败         | 每次迁移后立即验证      |
| 功能回归         | 运行测试套件            |
| 团队冲突         | 小步提交，频繁合并      |

---

**文档版本**: 1.0
**创建日期**: 2025-12-28
**执行负责人**: Claude Code
