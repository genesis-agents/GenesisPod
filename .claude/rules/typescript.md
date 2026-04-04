---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# TypeScript 开发规则

## 类型安全

- **禁止 `any` 类型**: 使用 `unknown` 或具体类型
- **启用严格模式**: 所有 strict 编译选项
- **Null 安全**: 使用可选链 `?.` 和空值合并 `??`

## 接口设计

```typescript
// 推荐：接口描述对象形状
interface UserProfile {
  id: string;
  name: string;
  email: string;
}

// 类型别名用于联合类型和工具类型
type Status = "pending" | "active" | "inactive";
type Nullable<T> = T | null;
```

## 导入规范

```typescript
// 1. 外部库
import { useState, useEffect } from "react";
import { Injectable } from "@nestjs/common";

// 2. 内部模块 (@/)
import { useApiGet } from "@/hooks/core";
import { UserService } from "@/modules/user";

// 3. 相对导入
import { formatDate } from "./utils";
import type { Config } from "./types";
```

## 错误处理

```typescript
// 必须使用 try-catch 包裹异步操作
async function fetchData(): Promise<Data> {
  try {
    const response = await api.get("/data");
    return response.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw new ServiceException(error.message, error.code);
    }
    throw error;
  }
}
```
