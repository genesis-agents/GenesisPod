/**
 * Google Drive Integration Components
 *
 * 提供 Google Drive 集成相关的 UI 组件
 */

// 连接管理组件 (用于用户设置页面)
export { GoogleDriveConnectionCard } from './GoogleDriveConnectionCard';

// 文件浏览组件
export { GoogleDriveFileCard } from './GoogleDriveFileCard';
export { GoogleDriveFileBrowser } from './GoogleDriveFileBrowser';
export { default as GoogleDriveTabContent } from './GoogleDriveTabContent';

// 对话框组件
export { GoogleDriveImportDialog } from './GoogleDriveImportDialog';
export { GoogleDriveExportDialog } from './GoogleDriveExportDialog';
export { GoogleDriveFolderPicker } from './GoogleDriveFolderPicker';

// Re-export types from API (source of truth)
export type {
  GoogleDriveConnection,
  GoogleDriveFile,
  SyncConfig,
  ListFilesParams,
  ListFilesResponse,
  FolderPathItem,
  ImportFilesParams,
  ImportResult,
  ImportProgress,
  ExportParams,
  ExportResult,
  ExportProgress,
  SyncStatus,
  SyncHistory,
} from '@/lib/api/google-drive';
