# DeepDive Engine 组件复用改进方案

> 架构设计文档 | 版本 1.0 | 2025-12-28

---

## 〇、命名约定速查

> **核心原则**: 统一使用 `common` 表示共享代码，不使用 `shared`

| 层级         | 命名               | 用途                   | 示例                                     |
| ------------ | ------------------ | ---------------------- | ---------------------------------------- |
| **项目级**   | `src/common/`      | 全项目共享的公共代码   | `common/errors/`, `common/streaming/`    |
| **模块级**   | `{domain}-core/`   | 领域内共享的核心代码   | `ai-core/`, `data-core/`, `export-core/` |
| **子模块级** | `{module}-common/` | 模块内部多个子模块共享 | `office-common/`（AI Office 内部）       |

**为什么不用 `shared`?**

1. `common` 是 NestJS 惯例
2. 避免"这是 shared 还是 common？"的困惑
3. `*-core` 模式更清晰地表达"核心/基础"含义

---

## 一、改进目标

| 目标          | 当前状态          | 目标状态 | 预期收益          |
| ------------- | ----------------- | -------- | ----------------- |
| Dialog 复用率 | 3% (26个独立实现) | 90%+     | 减少 ~2000 行代码 |
| Hooks 复用率  | 60%               | 95%+     | 减少 ~500 行代码  |
| 基础组件覆盖  | 65%               | 95%+     | 开发效率提升 30%  |
| 命名一致性    | 70%               | 100%     | 维护成本降低 40%  |
| 后端服务复用  | 50%               | 90%+     | 减少 ~3000 行代码 |

---

## 二、前端架构改进

### 2.1 目录结构重构

```
frontend/
├── components/
│   ├── ui/                          # 基础 UI 组件（原子级）
│   │   ├── primitives/              # 最底层原语组件
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Textarea.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Checkbox.tsx
│   │   │   ├── Radio.tsx
│   │   │   ├── Switch.tsx
│   │   │   └── index.ts
│   │   ├── feedback/                # 反馈类组件
│   │   │   ├── Modal.tsx
│   │   │   ├── Dialog.tsx           # 新增：通用 Dialog 基类
│   │   │   ├── Toast.tsx
│   │   │   ├── Alert.tsx
│   │   │   ├── Tooltip.tsx
│   │   │   ├── Popover.tsx
│   │   │   └── index.ts
│   │   ├── data-display/            # 数据展示类组件
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Avatar.tsx
│   │   │   ├── Tag.tsx
│   │   │   ├── Progress.tsx
│   │   │   └── index.ts
│   │   ├── data-entry/              # 数据录入类组件
│   │   │   ├── FormField.tsx        # 新增
│   │   │   ├── SearchInput.tsx      # 新增
│   │   │   ├── DatePicker.tsx
│   │   │   ├── FileUpload.tsx
│   │   │   └── index.ts
│   │   ├── navigation/              # 导航类组件
│   │   │   ├── Tabs.tsx             # 新增
│   │   │   ├── Pagination.tsx       # 新增
│   │   │   ├── Breadcrumb.tsx
│   │   │   ├── Menu.tsx
│   │   │   └── index.ts
│   │   ├── layout/                  # 布局类组件
│   │   │   ├── Stack.tsx
│   │   │   ├── Grid.tsx
│   │   │   ├── Divider.tsx
│   │   │   └── index.ts
│   │   ├── states/                  # 状态类组件
│   │   │   ├── LoadingState.tsx
│   │   │   ├── LoadingSkeleton.tsx
│   │   │   ├── ErrorState.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   └── index.ts
│   │   └── index.ts                 # 统一导出
│   │
│   ├── composed/                    # 组合组件（分子级）
│   │   ├── dialogs/                 # 通用对话框
│   │   │   ├── BaseDialog.tsx       # 对话框基类
│   │   │   ├── ConfirmDialog.tsx    # 确认对话框
│   │   │   ├── FormDialog.tsx       # 表单对话框
│   │   │   ├── AlertDialog.tsx      # 警告对话框
│   │   │   └── index.ts
│   │   ├── cards/                   # 通用卡片
│   │   │   ├── BaseCard.tsx         # 卡片基类
│   │   │   ├── ResourceCard.tsx     # 统一的资源卡片
│   │   │   ├── ActionCard.tsx       # 操作卡片
│   │   │   └── index.ts
│   │   ├── forms/                   # 通用表单
│   │   │   ├── BaseForm.tsx         # 表单基类
│   │   │   ├── SearchForm.tsx       # 搜索表单
│   │   │   ├── FilterForm.tsx       # 筛选表单
│   │   │   └── index.ts
│   │   ├── lists/                   # 通用列表
│   │   │   ├── BaseList.tsx         # 列表基类
│   │   │   ├── VirtualList.tsx      # 虚拟滚动列表
│   │   │   ├── SelectableList.tsx   # 可选择列表
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── business/                    # 业务组件（有机体级）
│   │   ├── resource/                # 资源相关
│   │   │   ├── ResourceGrid.tsx
│   │   │   ├── ResourceDetail.tsx
│   │   │   ├── ResourceSelector.tsx
│   │   │   └── index.ts
│   │   ├── ai-chat/                 # AI 聊天相关
│   │   │   ├── ChatContainer.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── AITypingIndicator.tsx
│   │   │   └── index.ts
│   │   ├── knowledge-base/          # 知识库相关
│   │   │   ├── KnowledgeBaseCard.tsx
│   │   │   ├── KnowledgeBaseForm.tsx
│   │   │   ├── DocumentList.tsx
│   │   │   └── index.ts
│   │   ├── import-export/           # 导入导出相关
│   │   │   ├── ImportDialog.tsx     # 统一导入对话框
│   │   │   ├── ExportDialog.tsx     # 统一导出对话框
│   │   │   ├── FileUploader.tsx
│   │   │   ├── ProgressTracker.tsx
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── features/                    # 功能模块组件（页面级）
│   │   ├── ai-studio/               # AI Studio 专用
│   │   ├── ai-teams/                # AI Teams 专用
│   │   ├── ai-office/               # AI Office 专用
│   │   ├── library/                 # Library 专用
│   │   └── admin/                   # Admin 专用
│   │
│   └── layout/                      # 全局布局
│       ├── AppShell.tsx
│       ├── Sidebar.tsx
│       ├── Header.tsx
│       └── index.ts
│
├── hooks/
│   ├── core/                        # 核心 hooks（不依赖业务）
│   │   ├── useApi.ts                # API 请求基础
│   │   ├── useStream.ts             # 流式响应
│   │   ├── useAsync.ts              # 异步操作
│   │   ├── useLocalStorage.ts       # 本地存储
│   │   └── index.ts
│   │
│   ├── utils/                       # 工具 hooks
│   │   ├── useModal.ts              # 新增：模态框状态
│   │   ├── useForm.ts               # 新增：表单状态
│   │   ├── usePagination.ts         # 新增：分页状态
│   │   ├── useSearch.ts             # 新增：搜索状态
│   │   ├── useFilter.ts             # 新增：筛选状态
│   │   ├── useMultiSelect.ts        # 多选状态
│   │   ├── useDebounce.ts           # 防抖
│   │   ├── useThrottle.ts           # 节流
│   │   └── index.ts
│   │
│   ├── domain/                      # 业务领域 hooks
│   │   ├── resources/               # 资源相关
│   │   │   ├── useResources.ts
│   │   │   ├── useResourceDetail.ts
│   │   │   ├── useResourceMutation.ts
│   │   │   └── index.ts
│   │   ├── knowledge-base/          # 知识库相关
│   │   │   ├── useKnowledgeBases.ts
│   │   │   ├── useKnowledgeBaseDetail.ts
│   │   │   ├── useKnowledgeBaseMutation.ts
│   │   │   └── index.ts
│   │   ├── google-drive/            # Google Drive（统一）
│   │   │   ├── useGoogleDrive.ts
│   │   │   ├── useGoogleDriveFiles.ts
│   │   │   ├── useGoogleDriveImport.ts
│   │   │   ├── useGoogleDriveExport.ts
│   │   │   └── index.ts
│   │   ├── admin/                   # 管理后台
│   │   │   ├── useAdminCRUD.ts      # 新增：通用 CRUD
│   │   │   ├── useAdminUsers.ts
│   │   │   ├── useAdminModels.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   └── index.ts                     # 统一导出
│
├── types/                           # 类型定义
│   ├── components/                  # 组件类型
│   │   ├── dialog.types.ts          # Dialog 统一类型
│   │   ├── form.types.ts            # Form 统一类型
│   │   ├── card.types.ts            # Card 统一类型
│   │   └── index.ts
│   ├── domain/                      # 业务类型
│   │   ├── resource.types.ts
│   │   ├── knowledge-base.types.ts
│   │   └── index.ts
│   └── index.ts
│
└── lib/                             # 工具库
    ├── api/                         # API 客户端
    ├── utils/                       # 通用工具
    └── constants/                   # 常量定义
```

### 2.2 命名规范

#### 2.2.1 文件命名规范

| 类型       | 规范                        | 示例                         |
| ---------- | --------------------------- | ---------------------------- |
| React 组件 | PascalCase.tsx              | `ResourceCard.tsx`           |
| Hook 文件  | camelCase.ts + use 前缀     | `useResources.ts`            |
| 类型文件   | kebab-case.types.ts         | `resource.types.ts`          |
| 常量文件   | kebab-case.constants.ts     | `api-endpoints.constants.ts` |
| 工具文件   | kebab-case.utils.ts         | `date-format.utils.ts`       |
| 索引文件   | index.ts                    | `index.ts`                   |
| 测试文件   | _.test.ts(x) / _.spec.ts(x) | `ResourceCard.test.tsx`      |

#### 2.2.2 组件命名规范

```typescript
// 基础组件：功能名
(Button, Input, Modal, Card);

// 组合组件：Base + 功能名 或 功能名 + 用途
(BaseDialog, FormDialog, ConfirmDialog);
(BaseCard, ResourceCard, ActionCard);

// 业务组件：领域 + 功能名
(ResourceGrid, ResourceDetail);
(KnowledgeBaseForm, KnowledgeBaseCard);
(AITypingIndicator, AIChatMessage);

// 页面组件：页面名 + Page
(LibraryPage, AIStudioPage, SettingsPage);
```

#### 2.2.3 Props 命名规范（统一标准）

```typescript
// Dialog/Modal 统一使用
interface DialogProps {
  open: boolean; // ✅ 统一用 open，不用 isOpen
  onClose: () => void; // ✅ 统一用 onClose
  onSuccess?: () => void; // ✅ 成功回调
  onError?: (error: Error) => void; // ✅ 错误回调
  title: string;
  loading?: boolean;
}

// 表单组件统一使用
interface FormProps<T> {
  defaultValues?: Partial<T>;
  onSubmit: (data: T) => void | Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
  disabled?: boolean;
}

// 列表组件统一使用
interface ListProps<T> {
  items: T[];
  loading?: boolean;
  error?: Error | null;
  onRefresh?: () => void;
  onItemClick?: (item: T) => void;
  onItemSelect?: (item: T, selected: boolean) => void;
  selectedItems?: T[];
  emptyMessage?: string;
}

// 卡片组件统一使用
interface CardProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
}
```

#### 2.2.4 Hook 命名规范

```typescript
// 数据获取：use + 资源名(复数)
useResources(); // 获取资源列表
useKnowledgeBases(); // 获取知识库列表

// 单个数据：use + 资源名 + Detail
useResourceDetail(id);
useKnowledgeBaseDetail(id);

// 数据变更：use + 资源名 + Mutation
useResourceMutation(); // { create, update, delete }
useKnowledgeBaseMutation();

// 工具 hooks：use + 动作/状态
useModal(); // 模态框状态管理
useForm(); // 表单状态管理
usePagination(); // 分页状态管理
useSearch(); // 搜索状态管理
useFilter(); // 筛选状态管理
useMultiSelect(); // 多选状态管理

// 特定功能：use + 功能名
useGoogleDriveImport();
useDeepResearch();
useExport();
```

### 2.3 核心组件设计

#### 2.3.1 BaseDialog 设计

```typescript
// components/composed/dialogs/BaseDialog.tsx

import { Modal } from '@/components/ui/feedback';
import { Button } from '@/components/ui/primitives';
import { LoadingState, ErrorState } from '@/components/ui/states';

export interface BaseDialogProps {
  // 状态控制
  open: boolean;
  onClose: () => void;

  // 内容
  title: string;
  description?: string;
  children: React.ReactNode;

  // 尺寸
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';

  // 状态
  loading?: boolean;
  error?: string | null;

  // 底部操作
  footer?: React.ReactNode;
  showFooter?: boolean;

  // 确认/取消按钮（简化模式）
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
  confirmDisabled?: boolean;
  confirmLoading?: boolean;

  // 样式
  className?: string;
  contentClassName?: string;
}

export function BaseDialog({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  loading = false,
  error = null,
  footer,
  showFooter = true,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  confirmDisabled = false,
  confirmLoading = false,
  className,
  contentClassName,
}: BaseDialogProps) {
  const handleConfirm = async () => {
    if (onConfirm) {
      await onConfirm();
    }
  };

  const defaultFooter = onConfirm ? (
    <div className="flex justify-end gap-3">
      <Button variant="outline" onClick={onClose} disabled={confirmLoading}>
        {cancelText}
      </Button>
      <Button
        onClick={handleConfirm}
        disabled={confirmDisabled}
        loading={confirmLoading}
      >
        {confirmText}
      </Button>
    </div>
  ) : null;

  return (
    <Modal open={open} onClose={onClose} size={size} className={className}>
      {/* Header */}
      <Modal.Header>
        <Modal.Title>{title}</Modal.Title>
        {description && <Modal.Description>{description}</Modal.Description>}
      </Modal.Header>

      {/* Content */}
      <Modal.Content className={contentClassName}>
        {loading ? (
          <LoadingState message="加载中..." />
        ) : error ? (
          <ErrorState message={error} />
        ) : (
          children
        )}
      </Modal.Content>

      {/* Footer */}
      {showFooter && (
        <Modal.Footer>
          {footer ?? defaultFooter}
        </Modal.Footer>
      )}
    </Modal>
  );
}
```

#### 2.3.2 FormDialog 设计

```typescript
// components/composed/dialogs/FormDialog.tsx

import { BaseDialog, BaseDialogProps } from './BaseDialog';
import { useForm, UseFormReturn, FieldValues, DefaultValues } from 'react-hook-form';

export interface FormDialogProps<T extends FieldValues>
  extends Omit<BaseDialogProps, 'children' | 'onConfirm'> {
  defaultValues?: DefaultValues<T>;
  onSubmit: (data: T) => void | Promise<void>;
  children: (form: UseFormReturn<T>) => React.ReactNode;
  validate?: (data: T) => Record<string, string> | null;
}

export function FormDialog<T extends FieldValues>({
  defaultValues,
  onSubmit,
  children,
  validate,
  open,
  onClose,
  ...props
}: FormDialogProps<T>) {
  const form = useForm<T>({ defaultValues });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = form.handleSubmit(async (data) => {
    // 自定义验证
    if (validate) {
      const errors = validate(data);
      if (errors) {
        Object.entries(errors).forEach(([field, message]) => {
          form.setError(field as any, { message });
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      await onSubmit(data);
      onClose();
      form.reset();
    } catch (error) {
      // 错误处理由调用方负责
    } finally {
      setSubmitting(false);
    }
  });

  // 关闭时重置表单
  useEffect(() => {
    if (!open) {
      form.reset(defaultValues);
    }
  }, [open, defaultValues]);

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      onConfirm={handleSubmit}
      confirmLoading={submitting}
      {...props}
    >
      <form onSubmit={handleSubmit}>
        {children(form)}
      </form>
    </BaseDialog>
  );
}
```

#### 2.3.3 统一的 ImportDialog 设计

```typescript
// components/business/import-export/ImportDialog.tsx

import { FormDialog } from '@/components/composed/dialogs';
import { Tabs } from '@/components/ui/navigation';
import { FileUpload, Input } from '@/components/ui/primitives';

export type ImportSource = 'file' | 'url' | 'google-drive' | 'clipboard';

export interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (data: ImportData) => Promise<void>;
  title?: string;
  allowedSources?: ImportSource[];
  acceptedFileTypes?: string[];
  maxFileSize?: number;
  multiple?: boolean;
}

export interface ImportData {
  source: ImportSource;
  files?: File[];
  url?: string;
  googleDriveFileIds?: string[];
  clipboardContent?: string;
}

export function ImportDialog({
  open,
  onClose,
  onImport,
  title = '导入',
  allowedSources = ['file', 'url'],
  acceptedFileTypes,
  maxFileSize,
  multiple = false,
}: ImportDialogProps) {
  const [activeSource, setActiveSource] = useState<ImportSource>(allowedSources[0]);
  const [importData, setImportData] = useState<ImportData>({ source: activeSource });
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    setLoading(true);
    try {
      await onImport({ ...importData, source: activeSource });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <BaseDialog
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      onConfirm={handleImport}
      confirmText="导入"
      confirmLoading={loading}
    >
      <Tabs value={activeSource} onValueChange={(v) => setActiveSource(v as ImportSource)}>
        {allowedSources.includes('file') && (
          <Tabs.Tab value="file" label="本地文件">
            <FileUpload
              accept={acceptedFileTypes}
              maxSize={maxFileSize}
              multiple={multiple}
              onUpload={(files) => setImportData({ ...importData, files })}
            />
          </Tabs.Tab>
        )}
        {allowedSources.includes('url') && (
          <Tabs.Tab value="url" label="URL">
            <Input
              placeholder="请输入 URL"
              value={importData.url || ''}
              onChange={(e) => setImportData({ ...importData, url: e.target.value })}
            />
          </Tabs.Tab>
        )}
        {/* ... 其他来源 */}
      </Tabs>
    </BaseDialog>
  );
}
```

#### 2.3.4 useModal Hook 设计

```typescript
// hooks/utils/useModal.ts

export interface UseModalOptions {
  defaultOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface UseModalReturn {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggle: () => void;
  modalProps: {
    open: boolean;
    onClose: () => void;
  };
}

export function useModal(options: UseModalOptions = {}): UseModalReturn {
  const { defaultOpen = false, onOpen, onClose } = options;
  const [open, setOpen] = useState(defaultOpen);

  const handleOpen = useCallback(() => {
    setOpen(true);
    onOpen?.();
  }, [onOpen]);

  const handleClose = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  const handleToggle = useCallback(() => {
    if (open) {
      handleClose();
    } else {
      handleOpen();
    }
  }, [open, handleOpen, handleClose]);

  return {
    open,
    onOpen: handleOpen,
    onClose: handleClose,
    onToggle: handleToggle,
    modalProps: {
      open,
      onClose: handleClose,
    },
  };
}

// 使用示例
function MyComponent() {
  const createModal = useModal();
  const editModal = useModal();

  return (
    <>
      <Button onClick={createModal.onOpen}>新建</Button>
      <CreateDialog {...createModal.modalProps} />

      <Button onClick={editModal.onOpen}>编辑</Button>
      <EditDialog {...editModal.modalProps} />
    </>
  );
}
```

#### 2.3.5 useAdminCRUD Hook 设计

```typescript
// hooks/domain/admin/useAdminCRUD.ts

export interface UseAdminCRUDOptions<T, CreateDto, UpdateDto> {
  endpoint: string;
  queryKey: string;
  transform?: {
    list?: (data: unknown) => T[];
    item?: (data: unknown) => T;
  };
}

export interface UseAdminCRUDReturn<T, CreateDto, UpdateDto> {
  // 数据
  items: T[];
  loading: boolean;
  error: Error | null;

  // 操作
  create: (data: CreateDto) => Promise<T>;
  update: (id: string, data: UpdateDto) => Promise<T>;
  remove: (id: string) => Promise<void>;
  refresh: () => void;

  // 状态
  creating: boolean;
  updating: boolean;
  removing: boolean;
}

export function useAdminCRUD<
  T extends { id: string },
  CreateDto = Partial<T>,
  UpdateDto = Partial<T>,
>(
  options: UseAdminCRUDOptions<T, CreateDto, UpdateDto>,
): UseAdminCRUDReturn<T, CreateDto, UpdateDto> {
  const { endpoint, queryKey, transform } = options;

  // 列表数据
  const {
    data: items = [],
    loading,
    error,
    mutate,
  } = useApiGet<T[]>(endpoint, {
    transform: transform?.list,
  });

  // 创建
  const { execute: createApi, loading: creating } = useApiPost<T>(endpoint);
  const create = async (data: CreateDto): Promise<T> => {
    const result = await createApi(data);
    mutate(); // 刷新列表
    return result;
  };

  // 更新
  const { execute: updateApi, loading: updating } = useApiPut<T>();
  const update = async (id: string, data: UpdateDto): Promise<T> => {
    const result = await updateApi(`${endpoint}/${id}`, data);
    mutate();
    return result;
  };

  // 删除
  const { execute: removeApi, loading: removing } = useApiDelete();
  const remove = async (id: string): Promise<void> => {
    await removeApi(`${endpoint}/${id}`);
    mutate();
  };

  return {
    items,
    loading,
    error,
    create,
    update,
    remove,
    refresh: mutate,
    creating,
    updating,
    removing,
  };
}

// 使用示例
function useAdminUsers() {
  return useAdminCRUD<User, CreateUserDto, UpdateUserDto>({
    endpoint: "/api/admin/users",
    queryKey: "admin-users",
  });
}

function useAdminModels() {
  return useAdminCRUD<AIModel, CreateModelDto, UpdateModelDto>({
    endpoint: "/api/admin/ai-models",
    queryKey: "admin-models",
  });
}
```

---

## 三、后端架构改进

### 3.1 目录结构重构

> **命名约定**: 统一使用 `common` 表示共享代码。项目级共享放在 `src/common/`，模块内共享代码放入该领域的 `*-core` 模块（如 `ai-core/`）而非创建 `shared/` 目录。

```
backend/src/
├── common/                          # 🔑 项目级公共模块（全局共享）
│   ├── ai-orchestration/            # AI 编排（统一入口）
│   │   ├── ai-orchestration.module.ts
│   │   ├── ai-orchestration.service.ts
│   │   ├── providers/               # 模型提供商
│   │   │   ├── openai.provider.ts
│   │   │   ├── anthropic.provider.ts
│   │   │   ├── grok.provider.ts
│   │   │   └── index.ts
│   │   ├── adapters/                # 适配器
│   │   │   ├── model.adapter.ts
│   │   │   └── prompt.adapter.ts
│   │   └── index.ts
│   │
│   ├── streaming/                   # 流式响应（统一处理）
│   │   ├── streaming.module.ts
│   │   ├── streaming.service.ts
│   │   ├── stream-response.handler.ts  # 新增：SSE 响应处理
│   │   ├── stream.types.ts
│   │   └── index.ts
│   │
│   ├── errors/                      # 统一错误处理
│   │   ├── errors.module.ts
│   │   ├── error.types.ts           # 错误类型定义
│   │   ├── error.factory.ts         # 错误工厂
│   │   ├── error.filter.ts          # 全局异常过滤器
│   │   ├── error.interceptor.ts     # 错误拦截器
│   │   └── index.ts
│   │
│   ├── dtos/                        # 公共 DTO
│   │   ├── base/                    # 基础 DTO
│   │   │   ├── pagination.dto.ts
│   │   │   ├── response.dto.ts
│   │   │   ├── query.dto.ts
│   │   │   └── index.ts
│   │   ├── ai/                      # AI 相关 DTO
│   │   │   ├── chat.dto.ts
│   │   │   ├── completion.dto.ts
│   │   │   ├── stream.dto.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── interfaces/                  # 公共接口
│   │   ├── ai-service.interface.ts
│   │   ├── crud.interface.ts
│   │   ├── pagination.interface.ts
│   │   └── index.ts
│   │
│   ├── decorators/                  # 公共装饰器
│   │   ├── api-response.decorator.ts
│   │   ├── user.decorator.ts
│   │   └── index.ts
│   │
│   ├── utils/                       # 工具函数
│   │   ├── logger.utils.ts
│   │   ├── crypto.utils.ts
│   │   ├── date.utils.ts
│   │   └── index.ts
│   │
│   └── index.ts
│
├── modules/
│   ├── ai/                          # AI 模块
│   │   ├── ai-core/                 # 🔑 AI 核心（模块级共享放这里）
│   │   │   ├── ai-core.module.ts
│   │   │   ├── services/
│   │   │   │   ├── base-ai-chat.service.ts     # 聊天基类
│   │   │   │   ├── base-ai-stream.service.ts   # 流式基类
│   │   │   │   ├── base-ai-agent.service.ts    # Agent 基类
│   │   │   │   └── index.ts
│   │   │   ├── controllers/
│   │   │   │   └── base-stream.controller.ts
│   │   │   ├── prompts/             # 提示词库
│   │   │   │   ├── system/
│   │   │   │   ├── tasks/
│   │   │   │   └── index.ts
│   │   │   ├── agents/              # Agent 框架
│   │   │   │   ├── base-agent.ts
│   │   │   │   ├── agent-registry.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── ai-ask/                  # AI 问答
│   │   ├── ai-studio/               # AI 工作室
│   │   ├── ai-teams/                # AI 团队
│   │   ├── ai-office/               # AI 办公
│   │   ├── ai-coding/               # AI 编程
│   │   └── ai-simulation/           # AI 模拟
│   │
│   ├── content/                     # 内容模块
│   │   ├── resources/               # 资源管理
│   │   └── knowledge-bases/         # 知识库
│   │
│   ├── data-services/               # 数据服务
│   │   ├── data-core/               # 🔑 数据服务核心（模块级共享）
│   │   │   ├── data-core.module.ts
│   │   │   ├── deduplication/       # 统一去重服务
│   │   │   │   ├── deduplication.service.ts
│   │   │   │   ├── strategies/      # 去重策略
│   │   │   │   │   ├── url-hash.strategy.ts
│   │   │   │   │   ├── content-simhash.strategy.ts
│   │   │   │   │   ├── title-similarity.strategy.ts
│   │   │   │   │   └── index.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── crawler/                 # 爬虫服务
│   │   ├── data-collection/         # 数据采集
│   │   └── data-management/         # 数据管理
│   │
│   ├── export/                      # 导出模块
│   │   ├── export-core/             # 🔑 导出核心
│   │   │   ├── export-core.module.ts
│   │   │   ├── base-export.service.ts
│   │   │   └── index.ts
│   │   ├── services/
│   │   └── controllers/
│   │
│   └── core/                        # 核心模块
│       ├── auth/                    # 认证
│       └── admin/                   # 管理
│
└── main.ts
```

### 3.2 统一的 StreamResponseHandler

```typescript
// common/streaming/stream-response.handler.ts

import { Response } from "express";
import { Observable, Subject } from "rxjs";
import { Logger } from "@nestjs/common";

export interface StreamEvent<T = unknown> {
  type: "data" | "error" | "done" | "progress";
  data?: T;
  error?: string;
  progress?: number;
}

export interface StreamOptions {
  timeout?: number; // 超时时间（毫秒）
  heartbeatInterval?: number; // 心跳间隔（毫秒）
  onClientDisconnect?: () => void;
}

@Injectable()
export class StreamResponseHandler {
  private readonly logger = new Logger(StreamResponseHandler.name);

  /**
   * 发送 SSE 流式响应
   */
  async sendStream<T>(
    res: Response,
    source: Observable<StreamEvent<T>> | AsyncIterable<StreamEvent<T>>,
    options: StreamOptions = {},
  ): Promise<void> {
    const {
      timeout = 300000,
      heartbeatInterval = 30000,
      onClientDisconnect,
    } = options;

    // 设置 SSE 响应头
    this.setSSEHeaders(res);

    // 心跳定时器
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(`: heartbeat\n\n`);
      }
    }, heartbeatInterval);

    // 超时定时器
    const timeoutTimer = setTimeout(() => {
      this.sendEvent(res, { type: "error", error: "Request timeout" });
      this.cleanup(res, heartbeat, timeoutTimer);
    }, timeout);

    // 客户端断开处理
    res.on("close", () => {
      this.logger.debug("Client disconnected");
      onClientDisconnect?.();
      this.cleanup(res, heartbeat, timeoutTimer);
    });

    try {
      if (this.isObservable(source)) {
        await this.handleObservable(res, source, heartbeat, timeoutTimer);
      } else {
        await this.handleAsyncIterable(res, source, heartbeat, timeoutTimer);
      }
    } catch (error) {
      this.logger.error("Stream error:", error);
      this.sendEvent(res, { type: "error", error: error.message });
    } finally {
      this.cleanup(res, heartbeat, timeoutTimer);
    }
  }

  /**
   * 设置 SSE 响应头
   */
  private setSSEHeaders(res: Response): void {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
  }

  /**
   * 发送单个事件
   */
  private sendEvent<T>(res: Response, event: StreamEvent<T>): void {
    if (res.writableEnded) return;

    const data = JSON.stringify(event);
    res.write(`data: ${data}\n\n`);
  }

  /**
   * 处理 Observable
   */
  private handleObservable<T>(
    res: Response,
    source: Observable<StreamEvent<T>>,
    heartbeat: NodeJS.Timeout,
    timeoutTimer: NodeJS.Timeout,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const subscription = source.subscribe({
        next: (event) => this.sendEvent(res, event),
        error: (error) => {
          this.sendEvent(res, { type: "error", error: error.message });
          reject(error);
        },
        complete: () => {
          this.sendEvent(res, { type: "done" });
          resolve();
        },
      });

      res.on("close", () => subscription.unsubscribe());
    });
  }

  /**
   * 处理 AsyncIterable
   */
  private async handleAsyncIterable<T>(
    res: Response,
    source: AsyncIterable<StreamEvent<T>>,
    heartbeat: NodeJS.Timeout,
    timeoutTimer: NodeJS.Timeout,
  ): Promise<void> {
    for await (const event of source) {
      if (res.writableEnded) break;
      this.sendEvent(res, event);
    }
    this.sendEvent(res, { type: "done" });
  }

  /**
   * 清理资源
   */
  private cleanup(
    res: Response,
    heartbeat: NodeJS.Timeout,
    timeoutTimer: NodeJS.Timeout,
  ): void {
    clearInterval(heartbeat);
    clearTimeout(timeoutTimer);
    if (!res.writableEnded) {
      res.end();
    }
  }

  private isObservable<T>(source: unknown): source is Observable<T> {
    return (
      source instanceof Observable || (source as any)?.subscribe !== undefined
    );
  }
}
```

### 3.3 统一错误处理

```typescript
// common/errors/error.types.ts

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
  AI_MODEL_NOT_FOUND = 2004,
  AI_INSUFFICIENT_CREDITS = 2005,

  // 数据错误 (3xxx)
  DATA_DUPLICATE = 3000,
  DATA_INTEGRITY = 3001,
  DATA_IMPORT_FAILED = 3002,

  // 外部服务错误 (4xxx)
  EXTERNAL_SERVICE = 4000,
  GOOGLE_DRIVE_ERROR = 4001,
  DATABASE_ERROR = 4002,
}

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  cause?: Error;
}

// common/errors/error.factory.ts

export class ErrorFactory {
  static create(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ): AppError {
    return { code, message, details };
  }

  static aiServiceUnavailable(provider: string, cause?: Error): AppError {
    return {
      code: ErrorCode.AI_SERVICE_UNAVAILABLE,
      message: `AI service ${provider} is unavailable`,
      details: { provider },
      cause,
    };
  }

  static aiRateLimit(provider: string, retryAfter?: number): AppError {
    return {
      code: ErrorCode.AI_RATE_LIMIT,
      message: `Rate limit exceeded for ${provider}`,
      details: { provider, retryAfter },
    };
  }

  static notFound(entity: string, id: string): AppError {
    return {
      code: ErrorCode.NOT_FOUND,
      message: `${entity} with id ${id} not found`,
      details: { entity, id },
    };
  }

  static validation(field: string, message: string): AppError {
    return {
      code: ErrorCode.VALIDATION,
      message: `Validation error: ${message}`,
      details: { field },
    };
  }
}
```

### 3.4 公共 DTO 设计

```typescript
// common/dtos/base/pagination.dto.ts

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
  @IsEnum(["asc", "desc"])
  sortOrder?: "asc" | "desc" = "desc";
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

  static create<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResponseDto<T> {
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }
}

// common/dtos/ai/chat.dto.ts

export class ChatMessageDto {
  @IsEnum(["system", "user", "assistant"])
  role: "system" | "user" | "assistant";

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class ChatRequestDto {
  @IsOptional()
  @IsString()
  model?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(32000)
  maxTokens?: number;

  @IsOptional()
  @IsBoolean()
  stream?: boolean;
}

export class ChatResponseDto {
  @IsString()
  content: string;

  @IsString()
  model: string;

  @IsObject()
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  @IsString()
  finishReason: "stop" | "length" | "tool_calls";
}
```

---

## 四、AI 模块架构改进

### 4.1 当前问题分析

| 问题                                            | 严重程度 | 影响范围            |
| ----------------------------------------------- | -------- | ------------------- |
| LLM 调用分散，未统一使用 AIOrchestrationService | 🔴 严重  | 100+ 服务           |
| 各模块独立实现聊天逻辑                          | 🔴 严重  | 7 个 AI 子模块      |
| SSE 流式响应 9 处独立实现                       | 🟠 中等  | 9 个控制器          |
| 提示词散落在各处                                | 🟠 中等  | 全部 AI 模块        |
| Agent 实现不统一                                | 🟡 轻微  | AI Teams, AI Studio |

### 4.2 AI 模块目录结构重构

> **命名约定**: 模块级共享代码放入 `ai-core/`（领域核心模块），不使用 `shared/` 目录。

```
backend/src/modules/ai/
├── ai-core/                             # 🔑 AI 核心模块（模块级共享放这里）
│   ├── ai-core.module.ts
│   │
│   ├── services/                        # 基础服务
│   │   ├── base-ai-chat.service.ts      # 聊天基类
│   │   ├── base-ai-stream.service.ts    # 流式基类
│   │   ├── ai-context.service.ts        # 上下文管理
│   │   ├── ai-memory.service.ts         # 记忆管理
│   │   ├── ai-chat.service.ts           # 改造：调用 AIOrchestrationService
│   │   ├── ai-model.service.ts          # 模型管理
│   │   ├── ai-config.service.ts         # 配置管理
│   │   └── index.ts
│   │
│   ├── controllers/
│   │   ├── base-stream.controller.ts    # 流式控制器基类
│   │   └── ai-core.controller.ts
│   │
│   ├── prompts/                         # 统一提示词库
│   │   ├── system/
│   │   │   ├── base.prompt.ts           # 基础系统提示词
│   │   │   ├── researcher.prompt.ts     # 研究员 Agent
│   │   │   ├── analyst.prompt.ts        # 分析师 Agent
│   │   │   ├── writer.prompt.ts         # 写作 Agent
│   │   │   ├── critic.prompt.ts         # 评审 Agent
│   │   │   └── index.ts
│   │   ├── tasks/
│   │   │   ├── summarization.prompt.ts  # 摘要任务
│   │   │   ├── extraction.prompt.ts     # 信息提取
│   │   │   ├── classification.prompt.ts # 分类任务
│   │   │   ├── generation.prompt.ts     # 生成任务
│   │   │   └── index.ts
│   │   ├── templates/
│   │   │   ├── prompt.template.ts       # 提示词模板类
│   │   │   ├── prompt.builder.ts        # 提示词构建器
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── agents/                          # 统一 Agent 框架
│   │   ├── base-agent.ts                # Agent 基类
│   │   ├── agent-registry.ts            # Agent 注册表
│   │   ├── agent-orchestrator.ts        # Agent 编排器
│   │   ├── tools/                       # Agent 工具
│   │   │   ├── web-search.tool.ts
│   │   │   ├── document-read.tool.ts
│   │   │   ├── code-execute.tool.ts
│   │   │   └── index.ts
│   │   └── index.ts
│   │
│   ├── types/
│   │   ├── chat.types.ts                # 聊天类型
│   │   ├── stream.types.ts              # 流式类型
│   │   ├── agent.types.ts               # Agent 类型
│   │   ├── prompt.types.ts              # 提示词类型
│   │   └── index.ts
│   │
│   └── index.ts
│
├── ai-ask/                              # AI 问答
│   ├── ai-ask.module.ts
│   ├── services/
│   │   ├── ai-ask.service.ts            # 继承 BaseAIChatService
│   │   └── ai-ask-stream.service.ts     # 继承 BaseAIStreamService
│   ├── controllers/
│   │   └── ai-ask.controller.ts         # 继承 BaseStreamController
│   └── index.ts
│
├── ai-studio/                           # AI 工作室
│   ├── ai-studio.module.ts
│   ├── deep-research/                   # 深度研究
│   │   ├── services/
│   │   │   ├── deep-research.service.ts
│   │   │   ├── research-planner.service.ts
│   │   │   └── research-executor.service.ts
│   │   ├── agents/                      # 使用 ai-core Agent 框架
│   │   │   ├── research-agent.ts        # 继承 BaseAgent
│   │   │   ├── outline-agent.ts
│   │   │   └── writing-agent.ts
│   │   └── controllers/
│   │       └── deep-research.controller.ts
│   └── index.ts
│
├── ai-teams/                            # AI 团队
│   ├── ai-teams.module.ts
│   ├── services/
│   │   ├── ai-teams.service.ts
│   │   ├── mission-orchestrator.service.ts
│   │   └── team-collaboration.service.ts
│   ├── agents/                          # 使用 ai-core Agent 框架
│   │   ├── team-member-agent.ts         # 继承 BaseAgent
│   │   ├── moderator-agent.ts
│   │   └── consensus-agent.ts
│   └── index.ts
│
├── ai-office/                           # AI 办公
│   ├── ai-office.module.ts
│   ├── office-common/                   # 🔑 AI Office 内部公共（用 common 命名）
│   │   ├── content-generator.service.ts
│   │   ├── template-manager.service.ts
│   │   └── index.ts
│   ├── docs/                            # 文档生成
│   │   ├── services/
│   │   │   └── docs-generator.service.ts
│   │   └── agents/
│   │       └── docs-agent.ts            # 继承 BaseAgent
│   ├── ppt/                             # PPT 生成
│   │   ├── services/
│   │   │   └── ppt-generator.service.ts
│   │   └── agents/
│   │       └── ppt-agent.ts
│   ├── dialogue/                        # 对话生成
│   └── index.ts
│
├── ai-coding/                           # AI 编程
│   ├── ai-coding.module.ts
│   ├── services/
│   │   ├── ai-coding.service.ts
│   │   └── code-analyzer.service.ts
│   ├── agents/
│   │   ├── coder-agent.ts               # 继承 BaseAgent
│   │   └── reviewer-agent.ts
│   └── index.ts
│
└── ai-simulation/                       # AI 模拟
    ├── ai-simulation.module.ts
    ├── services/
    │   └── simulation.service.ts
    ├── agents/
    │   ├── red-team-agent.ts            # 继承 BaseAgent
    │   └── blue-team-agent.ts
    └── index.ts
```

### 4.3 核心类设计

#### 4.3.1 BaseAIChatService（聊天服务基类）

```typescript
// modules/ai/ai-core/services/base-ai-chat.service.ts

import { AIOrchestrationService } from "@/common/ai-orchestration";
import { ChatRequestDto, ChatResponseDto } from "@/common/dtos/ai";
import { PromptTemplate, PromptBuilder } from "../prompts";

export interface AIChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string | PromptTemplate;
  context?: Record<string, unknown>;
}

export abstract class BaseAIChatService {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(
    protected readonly aiOrchestration: AIOrchestrationService,
    protected readonly promptBuilder: PromptBuilder,
  ) {}

  /**
   * 获取默认系统提示词（子类可覆盖）
   */
  protected abstract getDefaultSystemPrompt(): string | PromptTemplate;

  /**
   * 获取默认模型（子类可覆盖）
   */
  protected getDefaultModel(): string {
    return "gpt-4o";
  }

  /**
   * 发送聊天请求
   */
  async chat(
    messages: ChatMessageDto[],
    options: AIChatOptions = {},
  ): Promise<ChatResponseDto> {
    const {
      model = this.getDefaultModel(),
      temperature = 0.7,
      maxTokens = 4096,
      systemPrompt = this.getDefaultSystemPrompt(),
      context = {},
    } = options;

    // 构建系统提示词
    const resolvedSystemPrompt =
      typeof systemPrompt === "string"
        ? systemPrompt
        : this.promptBuilder.build(systemPrompt, context);

    // 统一通过 AIOrchestrationService 调用
    const response = await this.aiOrchestration.chat({
      model,
      messages: [
        { role: "system", content: resolvedSystemPrompt },
        ...messages,
      ],
      temperature,
      maxTokens,
    });

    return response;
  }

  /**
   * 简化的单轮对话
   */
  async ask(question: string, options: AIChatOptions = {}): Promise<string> {
    const response = await this.chat(
      [{ role: "user", content: question }],
      options,
    );
    return response.content;
  }
}
```

#### 4.3.2 BaseAIStreamService（流式服务基类）

```typescript
// modules/ai/ai-core/services/base-ai-stream.service.ts

import { AIOrchestrationService } from "@/common/ai-orchestration";
import { StreamEvent } from "@/common/streaming";
import { Observable, Subject } from "rxjs";

export interface AIStreamOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  onToken?: (token: string) => void;
  onProgress?: (progress: number) => void;
}

export abstract class BaseAIStreamService {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly aiOrchestration: AIOrchestrationService) {}

  /**
   * 获取默认系统提示词
   */
  protected abstract getDefaultSystemPrompt(): string;

  /**
   * 创建流式聊天
   */
  streamChat(
    messages: ChatMessageDto[],
    options: AIStreamOptions = {},
  ): Observable<StreamEvent<string>> {
    const subject = new Subject<StreamEvent<string>>();

    this.executeStream(messages, options, subject).catch((error) => {
      subject.next({ type: "error", error: error.message });
      subject.complete();
    });

    return subject.asObservable();
  }

  private async executeStream(
    messages: ChatMessageDto[],
    options: AIStreamOptions,
    subject: Subject<StreamEvent<string>>,
  ): Promise<void> {
    const {
      model = "gpt-4o",
      temperature = 0.7,
      maxTokens = 4096,
      systemPrompt = this.getDefaultSystemPrompt(),
      onToken,
      onProgress,
    } = options;

    let fullContent = "";
    let tokenCount = 0;

    // 统一通过 AIOrchestrationService 调用
    const stream = await this.aiOrchestration.streamChat({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature,
      maxTokens,
    });

    for await (const chunk of stream) {
      const token = chunk.content;
      fullContent += token;
      tokenCount++;

      // 发送数据事件
      subject.next({ type: "data", data: token });

      // 回调
      onToken?.(token);
      if (onProgress) {
        const progress = Math.min(tokenCount / (maxTokens / 10), 0.99);
        onProgress(progress);
        subject.next({ type: "progress", progress });
      }
    }

    // 完成
    subject.next({ type: "done", data: fullContent });
    subject.complete();
  }
}
```

#### 4.3.3 BaseAgent（Agent 基类）

```typescript
// modules/ai/ai-core/agents/base-agent.ts

import { AIOrchestrationService } from "@/common/ai-orchestration";
import { PromptTemplate } from "../prompts";

export interface AgentInput {
  task: string;
  context?: Record<string, unknown>;
  history?: AgentMessage[];
}

export interface AgentOutput {
  result: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
  metadata?: Record<string, unknown>;
}

export interface AgentMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

export interface AgentConfig {
  name: string;
  description: string;
  model?: string;
  temperature?: number;
  maxIterations?: number;
  tools?: AgentTool[];
}

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export abstract class BaseAgent {
  protected readonly logger = new Logger(this.constructor.name);
  protected readonly config: AgentConfig;

  constructor(
    protected readonly aiOrchestration: AIOrchestrationService,
    config: Partial<AgentConfig>,
  ) {
    this.config = {
      name: this.constructor.name,
      description: "",
      model: "gpt-4o",
      temperature: 0.7,
      maxIterations: 10,
      tools: [],
      ...config,
    };
  }

  /**
   * 获取系统提示词（子类必须实现）
   */
  protected abstract getSystemPrompt(): string | PromptTemplate;

  /**
   * 执行 Agent 任务
   */
  async execute(input: AgentInput): Promise<AgentOutput> {
    this.logger.log(`Agent ${this.config.name} executing: ${input.task}`);

    const systemPrompt = this.resolvePrompt(
      this.getSystemPrompt(),
      input.context,
    );
    const messages: AgentMessage[] = input.history || [];
    messages.push({ role: "user", content: input.task });

    let iterations = 0;
    let finalResult: AgentOutput | null = null;

    while (iterations < this.config.maxIterations!) {
      iterations++;

      const response = await this.aiOrchestration.chat({
        model: this.config.model!,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        temperature: this.config.temperature,
        tools: this.config.tools?.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
      });

      // 检查是否有工具调用
      if (response.toolCalls && response.toolCalls.length > 0) {
        const toolResults = await this.executeTools(response.toolCalls);

        // 添加工具结果到历史
        for (const result of toolResults) {
          messages.push({
            role: "tool",
            content: JSON.stringify(result.result),
            toolCallId: result.id,
          });
        }

        continue; // 继续循环处理
      }

      // 无工具调用，返回结果
      finalResult = {
        result: response.content,
        reasoning: this.extractReasoning(response.content),
        metadata: {
          model: response.model,
          iterations,
          tokensUsed: response.usage?.totalTokens,
        },
      };
      break;
    }

    if (!finalResult) {
      throw new Error(`Agent ${this.config.name} exceeded max iterations`);
    }

    return finalResult;
  }

  /**
   * 执行工具调用
   */
  private async executeTools(toolCalls: ToolCall[]): Promise<ToolCall[]> {
    const results: ToolCall[] = [];

    for (const call of toolCalls) {
      const tool = this.config.tools?.find((t) => t.name === call.name);
      if (!tool) {
        this.logger.warn(`Tool ${call.name} not found`);
        continue;
      }

      try {
        const result = await tool.execute(call.arguments);
        results.push({ ...call, result });
      } catch (error) {
        this.logger.error(`Tool ${call.name} failed:`, error);
        results.push({ ...call, result: { error: error.message } });
      }
    }

    return results;
  }

  private resolvePrompt(
    prompt: string | PromptTemplate,
    context?: Record<string, unknown>,
  ): string {
    if (typeof prompt === "string") return prompt;
    // 使用 PromptBuilder 解析模板
    return prompt.render(context || {});
  }

  private extractReasoning(content: string): string | undefined {
    // 提取思考过程（如果有的话）
    const match = content.match(/<thinking>([\s\S]*?)<\/thinking>/);
    return match?.[1]?.trim();
  }
}
```

#### 4.3.4 PromptTemplate（提示词模板）

```typescript
// modules/ai/ai-core/prompts/templates/prompt.template.ts

export interface PromptTemplateConfig {
  id: string;
  version: string;
  name: string;
  description?: string;
  template: string;
  variables: string[];
  examples?: PromptExample[];
  modelAdaptations?: Record<string, ModelAdaptation>;
}

export interface PromptExample {
  input: Record<string, unknown>;
  output: string;
}

export interface ModelAdaptation {
  systemSuffix?: string;
  temperature?: number;
  maxTokens?: number;
}

export class PromptTemplate {
  constructor(private readonly config: PromptTemplateConfig) {}

  get id(): string {
    return this.config.id;
  }

  get version(): string {
    return this.config.version;
  }

  /**
   * 渲染模板
   */
  render(variables: Record<string, unknown>): string {
    let result = this.config.template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      result = result.replaceAll(placeholder, String(value));
    }

    // 检查未替换的变量
    const unreplaced = result.match(/\{\{(\w+)\}\}/g);
    if (unreplaced) {
      throw new Error(`Missing variables: ${unreplaced.join(", ")}`);
    }

    return result;
  }

  /**
   * 获取模型适配
   */
  getAdaptation(model: string): ModelAdaptation | undefined {
    return this.config.modelAdaptations?.[model];
  }

  /**
   * 验证变量
   */
  validate(variables: Record<string, unknown>): boolean {
    for (const required of this.config.variables) {
      if (!(required in variables)) {
        return false;
      }
    }
    return true;
  }
}

// 使用示例
export const researcherPrompt = new PromptTemplate({
  id: "researcher-v2",
  version: "2.0.0",
  name: "深度研究 Agent",
  template: `你是一个专业的深度研究助手。

## 研究主题
{{topic}}

## 研究深度
{{depth}}

## 背景信息
{{context}}

## 输出要求
请使用 {{language}} 语言，生成结构化的研究报告。`,
  variables: ["topic", "depth", "context", "language"],
  modelAdaptations: {
    "claude-3-opus": {
      systemSuffix: "\n\n请在回答时展示你的思考过程。",
      temperature: 0.5,
    },
  },
});
```

#### 4.3.5 AgentOrchestrator（Agent 编排器）

```typescript
// modules/ai/ai-core/agents/agent-orchestrator.ts

import { BaseAgent, AgentInput, AgentOutput } from "./base-agent";
import { StreamEvent } from "@/common/streaming";
import { Observable, Subject } from "rxjs";

export interface OrchestrationStep {
  agentId: string;
  input: AgentInput;
  dependsOn?: string[];
}

export interface OrchestrationPlan {
  steps: OrchestrationStep[];
  parallel?: boolean;
}

export interface OrchestrationResult {
  stepId: string;
  agentId: string;
  output: AgentOutput;
  duration: number;
}

@Injectable()
export class AgentOrchestrator {
  private readonly logger = new Logger(AgentOrchestrator.name);
  private readonly agents = new Map<string, BaseAgent>();

  /**
   * 注册 Agent
   */
  register(id: string, agent: BaseAgent): void {
    this.agents.set(id, agent);
  }

  /**
   * 执行编排计划
   */
  async execute(plan: OrchestrationPlan): Promise<OrchestrationResult[]> {
    const results: OrchestrationResult[] = [];
    const completed = new Map<string, AgentOutput>();

    if (plan.parallel) {
      // 并行执行
      const promises = plan.steps.map((step) =>
        this.executeStep(step, completed),
      );
      const stepResults = await Promise.all(promises);
      results.push(...stepResults);
    } else {
      // 顺序执行
      for (const step of plan.steps) {
        const result = await this.executeStep(step, completed);
        completed.set(step.agentId, result.output);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * 流式执行编排
   */
  streamExecute(
    plan: OrchestrationPlan,
  ): Observable<StreamEvent<OrchestrationResult>> {
    const subject = new Subject<StreamEvent<OrchestrationResult>>();

    this.executeWithStream(plan, subject).catch((error) => {
      subject.next({ type: "error", error: error.message });
      subject.complete();
    });

    return subject.asObservable();
  }

  private async executeStep(
    step: OrchestrationStep,
    completed: Map<string, AgentOutput>,
  ): Promise<OrchestrationResult> {
    const agent = this.agents.get(step.agentId);
    if (!agent) {
      throw new Error(`Agent ${step.agentId} not found`);
    }

    // 注入依赖结果到上下文
    const context = { ...step.input.context };
    if (step.dependsOn) {
      for (const depId of step.dependsOn) {
        const depOutput = completed.get(depId);
        if (depOutput) {
          context[`${depId}_result`] = depOutput.result;
        }
      }
    }

    const startTime = Date.now();
    const output = await agent.execute({
      ...step.input,
      context,
    });
    const duration = Date.now() - startTime;

    return {
      stepId: `${step.agentId}-${Date.now()}`,
      agentId: step.agentId,
      output,
      duration,
    };
  }

  private async executeWithStream(
    plan: OrchestrationPlan,
    subject: Subject<StreamEvent<OrchestrationResult>>,
  ): Promise<void> {
    const completed = new Map<string, AgentOutput>();
    let progress = 0;
    const totalSteps = plan.steps.length;

    for (const step of plan.steps) {
      subject.next({ type: "progress", progress: progress / totalSteps });

      const result = await this.executeStep(step, completed);
      completed.set(step.agentId, result.output);

      subject.next({ type: "data", data: result });
      progress++;
    }

    subject.next({ type: "done" });
    subject.complete();
  }
}
```

### 4.4 具体模块改造示例

#### AI Ask 模块改造

```typescript
// modules/ai/ai-ask/services/ai-ask.service.ts

import { BaseAIChatService } from "../ai-core/services";
import { askPrompt } from "../ai-core/prompts/system";

@Injectable()
export class AiAskService extends BaseAIChatService {
  // 直接继承基类，只需实现抽象方法

  protected getDefaultSystemPrompt(): PromptTemplate {
    return askPrompt;
  }

  protected getDefaultModel(): string {
    return "gpt-4o";
  }

  // 业务特定方法
  async askWithRAG(
    question: string,
    knowledgeBaseId: string,
    options: AIChatOptions = {},
  ): Promise<ChatResponseDto> {
    // 获取 RAG 上下文
    const ragContext = await this.ragService.retrieve(
      question,
      knowledgeBaseId,
    );

    // 调用基类方法
    return this.chat([{ role: "user", content: question }], {
      ...options,
      context: { ragContext: ragContext.text },
    });
  }
}

// modules/ai/ai-ask/controllers/ai-ask.controller.ts

import { BaseStreamController } from "../ai-core/controllers";

@Controller("ai-ask")
export class AiAskController extends BaseStreamController {
  constructor(
    private readonly aiAskService: AiAskService,
    streamHandler: StreamResponseHandler,
  ) {
    super(streamHandler);
  }

  @Post("chat")
  async chat(@Body() dto: ChatRequestDto): Promise<ChatResponseDto> {
    return this.aiAskService.chat(dto.messages, {
      model: dto.model,
      temperature: dto.temperature,
    });
  }

  @Post("stream")
  async stream(
    @Res() res: Response,
    @Body() dto: ChatRequestDto,
  ): Promise<void> {
    const stream = this.aiAskService.streamChat(dto.messages, {
      model: dto.model,
    });

    // 使用基类方法处理流
    await this.sendStream(res, stream);
  }
}
```

### 4.5 提示词库设计

```typescript
// modules/ai/ai-core/prompts/system/index.ts

// 基础研究员
export const researcherPrompt = new PromptTemplate({
  id: "researcher-v2",
  version: "2.0.0",
  name: "深度研究员",
  template: `你是一个专业的深度研究助手，专注于提供高质量、准确、有深度的研究分析。

## 核心能力
- 多源信息检索与整合
- 批判性分析与事实验证
- 结构化报告生成
- 引用与来源追踪

## 当前任务
{{task}}

## 上下文信息
{{context}}

## 输出要求
1. 使用 {{language}} 语言
2. 引用来源需明确标注
3. 保持客观中立`,
  variables: ["task", "context", "language"],
});

// AI Ask 系统提示词
export const askPrompt = new PromptTemplate({
  id: "ask-v1",
  version: "1.0.0",
  name: "AI 问答助手",
  template: `你是 DeepDive 的 AI 问答助手，帮助用户解答问题。

## 知识库上下文
{{ragContext}}

## 回答原则
1. 基于上下文回答，不编造信息
2. 如果不确定，诚实说明
3. 保持简洁、准确
4. 适当引用来源`,
  variables: ["ragContext"],
});

// 文档写作 Agent
export const writerPrompt = new PromptTemplate({
  id: "writer-v1",
  version: "1.0.0",
  name: "文档写作 Agent",
  template: `你是一个专业的文档写作助手。

## 写作任务
{{task}}

## 参考资料
{{references}}

## 输出格式
{{format}}

## 写作风格
- 专业但易懂
- 结构清晰
- 适当使用标题和列表`,
  variables: ["task", "references", "format"],
});

// PPT 生成 Agent
export const pptPrompt = new PromptTemplate({
  id: "ppt-v1",
  version: "1.0.0",
  name: "PPT 生成 Agent",
  template: `你是一个专业的演示文稿设计师。

## 演示主题
{{topic}}

## 目标受众
{{audience}}

## 演示时长
{{duration}} 分钟

## 输出格式
请生成 JSON 格式的幻灯片结构。`,
  variables: ["topic", "audience", "duration"],
});

// 代码审查 Agent
export const codeReviewerPrompt = new PromptTemplate({
  id: "code-reviewer-v1",
  version: "1.0.0",
  name: "代码审查 Agent",
  template: `你是一个资深代码审查员。

## 审查代码
\`\`\`{{language}}
{{code}}
\`\`\`

## 审查维度
1. 安全性
2. 性能
3. 可维护性
4. 最佳实践

## 输出格式
按严重程度分类列出问题。`,
  variables: ["language", "code"],
});

// 红蓝对抗 - 红队 Agent
export const redTeamPrompt = new PromptTemplate({
  id: "red-team-v1",
  version: "1.0.0",
  name: "红队 Agent",
  template: `你是红队成员，负责挑战和质疑观点。

## 辩论主题
{{topic}}

## 你的立场
{{position}}

## 对方论点
{{opposingArgs}}

## 你的任务
提出有力的反驳论点。`,
  variables: ["topic", "position", "opposingArgs"],
});

// 红蓝对抗 - 蓝队 Agent
export const blueTeamPrompt = new PromptTemplate({
  id: "blue-team-v1",
  version: "1.0.0",
  name: "蓝队 Agent",
  template: `你是蓝队成员，负责防守和论证观点。

## 辩论主题
{{topic}}

## 你的立场
{{position}}

## 对方攻击
{{attacks}}

## 你的任务
有效地防守并强化你的论点。`,
  variables: ["topic", "position", "attacks"],
});
```

### 4.6 AI 模块命名规范

| 类型        | 命名规范                     | 示例                           |
| ----------- | ---------------------------- | ------------------------------ |
| Agent 类    | `{Role}Agent`                | `ResearchAgent`, `WriterAgent` |
| Agent 文件  | `{role}-agent.ts`            | `research-agent.ts`            |
| Prompt 类   | `{role}Prompt`               | `researcherPrompt`             |
| Prompt 文件 | `{role}.prompt.ts`           | `researcher.prompt.ts`         |
| Chat 服务   | `{module}-chat.service.ts`   | `ai-ask-chat.service.ts`       |
| Stream 服务 | `{module}-stream.service.ts` | `ai-ask-stream.service.ts`     |
| 基类        | `Base{Type}Service`          | `BaseAIChatService`            |
| 工具        | `{name}.tool.ts`             | `web-search.tool.ts`           |

---

## 五、迁移计划

### 4.1 阶段一：基础设施 (Week 1-2)

| 任务                               | 优先级 | 工作量 |
| ---------------------------------- | ------ | ------ |
| 创建 `common/dtos/` 公共 DTO       | P0     | 1天    |
| 创建 `common/errors/` 统一错误处理 | P0     | 1天    |
| 创建 `StreamResponseHandler`       | P0     | 1天    |
| 创建 `components/ui/` 基础组件补全 | P0     | 2天    |
| 创建 `hooks/utils/` 工具 hooks     | P0     | 1天    |

### 4.2 阶段二：组合组件 (Week 3-4)

| 任务                              | 优先级 | 工作量 |
| --------------------------------- | ------ | ------ |
| 创建 `BaseDialog` 和 `FormDialog` | P0     | 1天    |
| 创建统一 `ImportDialog`           | P0     | 1天    |
| 创建统一 `ResourceCard`           | P0     | 1天    |
| 迁移现有 Dialog 使用新基类        | P1     | 3天    |
| 合并 Google Drive Hooks           | P0     | 1天    |

### 4.3 阶段三：后端统一 (Week 5-6)

| 任务                                    | 优先级 | 工作量 |
| --------------------------------------- | ------ | ------ |
| 统一 AI 调用到 `AIOrchestrationService` | P0     | 2天    |
| 迁移控制器使用 `StreamResponseHandler`  | P0     | 2天    |
| 合并去重服务                            | P1     | 1天    |
| 迁移 DTO 到公共目录                     | P1     | 2天    |

### 4.4 阶段四：清理和优化 (Week 7-8)

| 任务         | 优先级 | 工作量 |
| ------------ | ------ | ------ |
| 删除废弃代码 | P1     | 1天    |
| 更新导入路径 | P1     | 1天    |
| 补充单元测试 | P2     | 2天    |
| 更新文档     | P2     | 1天    |

---

## 五、文件命名速查表

### 前端

| 类型      | 命名规范                    | 示例                                        |
| --------- | --------------------------- | ------------------------------------------- |
| 页面组件  | `{PageName}Page.tsx`        | `LibraryPage.tsx`                           |
| 基础组件  | `{ComponentName}.tsx`       | `Button.tsx`                                |
| 组合组件  | `{Base/Form/...}{Type}.tsx` | `BaseDialog.tsx`, `FormDialog.tsx`          |
| 业务组件  | `{Domain}{Function}.tsx`    | `ResourceCard.tsx`, `KnowledgeBaseForm.tsx` |
| Hook 文件 | `use{Name}.ts`              | `useModal.ts`, `useResources.ts`            |
| 类型文件  | `{name}.types.ts`           | `dialog.types.ts`                           |
| 常量文件  | `{name}.constants.ts`       | `api.constants.ts`                          |
| 工具文件  | `{name}.utils.ts`           | `date.utils.ts`                             |
| 索引文件  | `index.ts`                  | `index.ts`                                  |
| 测试文件  | `{name}.test.tsx`           | `Button.test.tsx`                           |

### 后端

| 类型   | 命名规范                   | 示例                      |
| ------ | -------------------------- | ------------------------- |
| 模块   | `{name}.module.ts`         | `ai-ask.module.ts`        |
| 服务   | `{name}.service.ts`        | `ai-ask.service.ts`       |
| 控制器 | `{name}.controller.ts`     | `ai-ask.controller.ts`    |
| DTO    | `{action}-{entity}.dto.ts` | `create-resource.dto.ts`  |
| 接口   | `{name}.interface.ts`      | `ai-service.interface.ts` |
| 类型   | `{name}.types.ts`          | `stream.types.ts`         |
| 策略   | `{name}.strategy.ts`       | `url-hash.strategy.ts`    |
| 工厂   | `{name}.factory.ts`        | `error.factory.ts`        |
| 过滤器 | `{name}.filter.ts`         | `error.filter.ts`         |
| 拦截器 | `{name}.interceptor.ts`    | `logging.interceptor.ts`  |
| 守卫   | `{name}.guard.ts`          | `auth.guard.ts`           |
| 装饰器 | `{name}.decorator.ts`      | `user.decorator.ts`       |

---

## 六、验收标准

### 代码质量

- [ ] 所有组件遵循命名规范
- [ ] 组件复用率 > 90%
- [ ] 无重复代码块 > 10 行
- [ ] TypeScript 严格模式通过
- [ ] ESLint 零错误

### 测试覆盖

- [ ] 公共组件测试覆盖率 > 80%
- [ ] Hooks 测试覆盖率 > 80%
- [ ] 关键业务逻辑测试覆盖率 > 70%

### 文档完整

- [ ] 组件 API 文档完整
- [ ] 使用示例完整
- [ ] 迁移指南完整

---

**文档版本**: 1.0
**创建日期**: 2025-12-28
**作者**: Claude Code (Architect Mode)
