# 状态管理架构

## 概述

DeepDive 采用双轨状态管理策略：

- **TanStack Query (React Query)**: 管理服务端状态
- **Zustand**: 管理客户端状态

## TanStack Query 核心原理

### 1. 服务端状态 vs 客户端状态

```
┌─────────────────────────────────────────────────────────┐
│                      应用状态                           │
├─────────────────────────┬───────────────────────────────┤
│     服务端状态           │        客户端状态             │
│  (TanStack Query)       │        (Zustand)             │
├─────────────────────────┼───────────────────────────────┤
│ • API 响应数据           │ • UI 状态 (模态框、侧边栏)    │
│ • 用户信息              │ • 表单临时数据                │
│ • 资源列表              │ • 本地偏好设置                │
│ • 缓存数据              │ • Toast 通知                  │
└─────────────────────────┴───────────────────────────────┘
```

### 2. 查询 (Queries)

基础查询模式：

```tsx
import { useQuery } from "@tanstack/react-query";

function ResourceList() {
  const {
    data, // 查询数据
    isLoading, // 首次加载
    isFetching, // 任何获取中
    isError, // 错误状态
    error, // 错误对象
    refetch, // 手动重新获取
  } = useQuery({
    queryKey: ["resources"], // 缓存键
    queryFn: () => api.getResources(), // 获取函数
    staleTime: 5 * 60 * 1000, // 5分钟内数据新鲜
    gcTime: 30 * 60 * 1000, // 30分钟后垃圾回收
  });

  if (isLoading) return <Skeleton />;
  if (isError) return <Error message={error.message} />;

  return <List items={data} />;
}
```

### 3. 查询键 (Query Keys)

查询键是缓存的唯一标识：

```tsx
// 简单键
queryKey: ["resources"];

// 带参数的键
queryKey: ["resources", { type: "article" }];

// 层级键
queryKey: ["resources", resourceId, "comments"];

// 查询键自动失效
queryClient.invalidateQueries({ queryKey: ["resources"] });
// 这会使所有以 ['resources'] 开头的查询失效
```

### 4. 缓存策略

```tsx
// 永不过期 (静态数据)
useQuery({
  queryKey: ["categories"],
  queryFn: fetchCategories,
  staleTime: Infinity,
});

// 实时数据 (总是刷新)
useQuery({
  queryKey: ["notifications"],
  queryFn: fetchNotifications,
  staleTime: 0,
  refetchInterval: 30000, // 每30秒刷新
});

// 智能缓存
useQuery({
  queryKey: ["resource", id],
  queryFn: () => fetchResource(id),
  staleTime: 5 * 60 * 1000,
  // 窗口聚焦时刷新
  refetchOnWindowFocus: true,
  // 网络恢复时刷新
  refetchOnReconnect: true,
});
```

### 5. 变更 (Mutations)

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";

function CreateResource() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (newResource) => api.createResource(newResource),

    // 乐观更新
    onMutate: async (newResource) => {
      // 取消正在进行的查询
      await queryClient.cancelQueries({ queryKey: ["resources"] });

      // 保存之前的值
      const previousResources = queryClient.getQueryData(["resources"]);

      // 乐观更新
      queryClient.setQueryData(["resources"], (old) => [...old, newResource]);

      return { previousResources };
    },

    // 错误回滚
    onError: (err, newResource, context) => {
      queryClient.setQueryData(["resources"], context.previousResources);
    },

    // 成功后刷新
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
  });

  return (
    <button
      onClick={() => mutation.mutate({ title: "New Resource" })}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? "Creating..." : "Create"}
    </button>
  );
}
```

### 6. 无限查询 (Infinite Queries)

```tsx
import { useInfiniteQuery } from "@tanstack/react-query";

function InfiniteList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["resources", "infinite"],
      queryFn: ({ pageParam }) => api.getResources({ page: pageParam }),
      initialPageParam: 1,
      getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    });

  return (
    <>
      {data?.pages.map((page) =>
        page.items.map((item) => <Item key={item.id} data={item} />),
      )}

      {hasNextPage && (
        <button onClick={() => fetchNextPage()}>
          {isFetchingNextPage ? "Loading..." : "Load More"}
        </button>
      )}
    </>
  );
}
```

## Zustand 核心原理

### 1. 基础 Store

```tsx
import { create } from "zustand";

interface UIStore {
  // 状态
  sidebarOpen: boolean;
  theme: "light" | "dark";

  // 操作
  toggleSidebar: () => void;
  setTheme: (theme: "light" | "dark") => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  theme: "light",

  toggleSidebar: () =>
    set((state) => ({
      sidebarOpen: !state.sidebarOpen,
    })),

  setTheme: (theme) => set({ theme }),
}));

// 使用
function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUIStore();

  return (
    <aside className={sidebarOpen ? "w-64" : "w-0"}>
      <button onClick={toggleSidebar}>Toggle</button>
    </aside>
  );
}
```

### 2. 选择器 (Selectors)

避免不必要的重渲染：

```tsx
// ❌ 不好：组件会在任何状态变化时重渲染
const { sidebarOpen, theme } = useUIStore();

// ✅ 好：只在 sidebarOpen 变化时重渲染
const sidebarOpen = useUIStore((state) => state.sidebarOpen);

// ✅ 浅比较多个值
import { shallow } from "zustand/shallow";

const { sidebarOpen, theme } = useUIStore(
  (state) => ({ sidebarOpen: state.sidebarOpen, theme: state.theme }),
  shallow,
);
```

### 3. 持久化中间件

```tsx
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      language: "zh-CN",
      notifications: true,

      setLanguage: (language) => set({ language }),
      toggleNotifications: () =>
        set((state) => ({
          notifications: !state.notifications,
        })),
    }),
    {
      name: "settings-storage", // localStorage key
      partialize: (state) => ({
        language: state.language,
        // notifications 不持久化
      }),
    },
  ),
);
```

### 4. DevTools 中间件

```tsx
import { devtools } from "zustand/middleware";

export const useStore = create<Store>()(
  devtools(
    (set) => ({
      // ...
    }),
    { name: "MyStore" },
  ),
);
```

### 5. Toast 通知 Store 示例

```tsx
// stores/useToastStore.ts
import { create } from "zustand";

interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning";
  message: string;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));

    // 自动移除
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, toast.duration ?? 5000);
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

// 使用
const { addToast } = useToastStore();
addToast({ type: "success", message: "操作成功！" });
```

## Provider 配置

```tsx
// app/providers.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1分钟
            gcTime: 5 * 60 * 1000, // 5分钟
            retry: 3, // 重试3次
            refetchOnWindowFocus: false, // 禁用窗口聚焦刷新
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

## 最佳实践

### 1. 何时使用 Query vs Store

| 场景                     | 推荐方案                   |
| ------------------------ | -------------------------- |
| API 数据                 | TanStack Query             |
| 用户信息                 | TanStack Query             |
| UI 状态 (模态框、侧边栏) | Zustand                    |
| 表单临时数据             | useState / React Hook Form |
| 全局通知                 | Zustand                    |
| 本地偏好设置             | Zustand + persist          |

### 2. 避免重复状态

```tsx
// ❌ 不好：在 Zustand 中复制 Query 数据
const useStore = create((set) => ({
  resources: [], // 与 Query 重复
  setResources: (resources) => set({ resources }),
}));

// ✅ 好：让 Query 管理服务端状态
function Component() {
  const { data: resources } = useQuery({...});
  const selectedId = useUIStore((s) => s.selectedId);

  const selectedResource = resources?.find((r) => r.id === selectedId);
}
```

### 3. 组合 Hooks

```tsx
// hooks/useResourceWithSelection.ts
export function useResourceWithSelection(id: string) {
  const { data: resource, isLoading } = useQuery({
    queryKey: ["resource", id],
    queryFn: () => api.getResource(id),
  });

  const isSelected = useUIStore((s) => s.selectedId === id);
  const select = useUIStore((s) => s.setSelectedId);

  return {
    resource,
    isLoading,
    isSelected,
    select: () => select(id),
  };
}
```

## 参考资源

- [TanStack Query 官方文档](https://tanstack.com/query/latest)
- [Zustand 官方文档](https://zustand-demo.pmnd.rs/)
- [React Query vs Redux](https://tanstack.com/query/latest/docs/react/comparison)
