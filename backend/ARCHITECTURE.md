# Backend Architecture Standards

## 目录结构规范

### 模块组织原则

每个 AI 模块必须按 **领域驱动设计 (DDD)** 组织，遵循以下结构：

```
ai-{module}/
├── core/                    # 核心：类型、常量、工具函数
│   ├── index.ts            # Barrel export
│   ├── {module}.types.ts   # 类型定义
│   ├── {module}.constants.ts
│   └── {module}.utils.ts
│
├── {domain}/               # 领域子目录（按业务功能划分）
│   ├── index.ts            # Barrel export
│   ├── {domain}.controller.ts
│   ├── {domain}.service.ts
│   └── {domain}.dto.ts     # 如果需要
│
├── __tests__/              # 测试文件
│   ├── {domain}/           # 按领域组织测试
│   └── integration/        # 集成测试
│
├── index.ts                # 根 Barrel export
└── {module}.module.ts      # NestJS 模块定义
```

### 命名规范

| 类型   | 格式                     | 示例                              |
| ------ | ------------------------ | --------------------------------- |
| 目录   | kebab-case               | `brand-kit/`, `image-generation/` |
| 服务   | {domain}.service.ts      | `generation.service.ts`           |
| 控制器 | {domain}.controller.ts   | `generation.controller.ts`        |
| 类型   | {domain}.types.ts        | `generation.types.ts`             |
| DTO    | {domain}.dto.ts          | `generation.dto.ts`               |
| 测试   | {domain}.service.spec.ts | `generation.service.spec.ts`      |

### 禁止事项

1. ❌ **禁止超过 500 行的文件** - 必须拆分
2. ❌ **禁止 .backup / .old / .refactored 文件** - 用 git 管理历史
3. ❌ **禁止根目录超过 10 个文件** - 必须分组到子目录
4. ❌ **禁止重复命名前缀** - 如 `ai-image-xxx.ts` 在 `ai-image/` 目录下

### 模块 exports 规范

每个 NestJS 模块必须：

1. **导出所有公共服务** - 其他模块可能需要使用
2. **使用 forwardRef** - 处理循环依赖
3. **创建 barrel exports** - 通过 index.ts 统一导出

```typescript
// ✅ 正确示例
@Module({
  providers: [ServiceA, ServiceB],
  exports: [ServiceA, ServiceB],  // 导出供其他模块使用
})

// ❌ 错误示例 - 忘记导出
@Module({
  providers: [ServiceA, ServiceB],
  // 没有 exports，其他模块无法使用
})
```

### Barrel Export 规范

每个子目录必须有 `index.ts`：

```typescript
// core/index.ts
export * from "./types";
export * from "./constants";
export * from "./utils";

// generation/index.ts
export { GenerationService } from "./generation.service";
export { GenerationController } from "./generation.controller";
export type { GenerationConfig } from "./generation.types";
```

---

## 标准模块结构示例

### ai-office (重构后)

```
ai-office/
├── core/                    # 核心服务
│   ├── index.ts
│   ├── ai-model.controller.ts
│   ├── ai-model.service.ts
│   └── intent-parser.service.ts
├── documents/               # 文档管理
│   ├── index.ts
│   ├── documents.controller.ts
│   ├── documents.service.ts
│   └── documents.dto.ts
├── generation/              # 文档生成
│   ├── index.ts
│   ├── generation.controller.ts
│   ├── generation.service.ts
│   └── quick-generate.service.ts
├── export/                  # 导出服务
│   ├── index.ts
│   ├── export.controller.ts
│   └── export.service.ts
├── ppt/                     # PPT 专项
│   └── ...
├── __tests__/
├── index.ts
└── ai-office.module.ts
```

### ai-image (目标结构)

```
ai-image/
├── core/                    # 核心类型和工具
│   ├── index.ts
│   ├── image.types.ts
│   ├── image.constants.ts
│   ├── image.utils.ts
│   └── engine.types.ts
├── generation/              # 图像生成
│   ├── index.ts
│   ├── generation.controller.ts
│   ├── generation.service.ts
│   ├── image-generation.service.ts
│   └── prompt-enhancement.service.ts
├── storage/                 # 存储服务
│   ├── index.ts
│   └── storage.service.ts
├── export/                  # 导出服务
│   ├── index.ts
│   ├── export.controller.ts
│   └── export.service.ts
├── brand-kit/               # 品牌套件
│   ├── index.ts
│   ├── brand-kit.controller.ts
│   └── brand-kit.service.ts
├── infographic/             # 信息图
│   ├── index.ts
│   ├── infographic.service.ts
│   ├── infographic.types.ts
│   ├── infographic.constants.ts
│   └── templates/
├── analytics/               # 分析服务
│   ├── index.ts
│   └── analytics.service.ts
├── __tests__/
├── index.ts
└── ai-image.module.ts
```

---

## 代码质量规则

### 文件大小限制

| 文件类型   | 最大行数 | 说明                 |
| ---------- | -------- | -------------------- |
| Service    | 500      | 超过需拆分为多个服务 |
| Controller | 300      | 超过需拆分路由       |
| Types      | 200      | 超过需按领域拆分     |
| Utils      | 200      | 超过需按功能拆分     |

### 依赖注入规则

```typescript
// ✅ 正确 - 使用 forwardRef 处理循环依赖
@Module({
  imports: [forwardRef(() => OtherModule)],
})

// ❌ 错误 - 直接导入导致循环依赖错误
@Module({
  imports: [OtherModule],  // 可能导致 undefined
})
```

---

## 检查清单

新建或修改模块时，检查：

- [ ] 目录结构符合规范
- [ ] 每个子目录有 index.ts
- [ ] 模块导出所有公共服务
- [ ] 无 .backup/.old 文件
- [ ] 无超过 500 行的文件
- [ ] 测试文件按领域组织
- [ ] 使用 forwardRef 处理循环依赖
