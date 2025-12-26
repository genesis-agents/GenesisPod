'use client';

import React, { useState } from 'react';
import {
  Folder,
  FolderPlus,
  ChevronRight,
  Home,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useGoogleDriveFiles } from '@/hooks/features/useGoogleDriveFiles';
import { cn } from '@/lib/utils/common';

interface GoogleDriveFolderPickerProps {
  /** 当前选中的文件夹 ID */
  selectedFolderId?: string;
  /** 选择回调 */
  onSelectFolder: (folderId: string | undefined, folderName: string) => void;
  /** 自定义类名 */
  className?: string;
}

/**
 * Google Drive 文件夹选择器
 *
 * 功能：
 * - 展示文件夹树结构
 * - 支持文件夹导航
 * - 支持选择目标文件夹
 * - 支持新建文件夹（TODO: 需要后端 API 支持）
 */
export function GoogleDriveFolderPicker({
  selectedFolderId,
  onSelectFolder,
  className,
}: GoogleDriveFolderPickerProps) {
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const {
    files,
    isLoading,
    error,
    breadcrumbs,
    currentFolderId,
    enterFolder,
    navigateToFolder,
  } = useGoogleDriveFiles({
    pageSize: 50,
  });

  // 过滤出文件夹
  const folders = files.filter(
    (f) => f.isFolder || f.mimeType === 'application/vnd.google-apps.folder'
  );

  const handleSelectFolder = (
    folderId: string | undefined,
    folderName: string
  ) => {
    onSelectFolder(folderId, folderName);
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;

    setIsCreating(true);
    // TODO: 调用后端 API 创建文件夹
    // createFolder({ name: newFolderName, parentId: currentFolderId })
    //   .then(() => {
    //     setShowCreateFolder(false);
    //     setNewFolderName('');
    //     refresh();
    //   })
    //   .catch((err) => {
    //     console.error('Failed to create folder:', err);
    //   })
    //   .finally(() => {
    //     setIsCreating(false);
    //   });

    // 临时：直接关闭
    setTimeout(() => {
      setShowCreateFolder(false);
      setNewFolderName('');
      setIsCreating(false);
    }, 500);
  };

  return (
    <div className={cn('flex flex-col', className)}>
      {/* 面包屑导航 */}
      <div className="mb-3 flex items-center gap-1 overflow-x-auto text-sm">
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.id || 'root'}>
            {index > 0 && <ChevronRight size={14} className="text-gray-400" />}
            <button
              onClick={() => {
                if (index === 0) {
                  navigateToFolder(-1);
                } else {
                  navigateToFolder(index - 1);
                }
              }}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-1 transition-colors',
                index === breadcrumbs.length - 1
                  ? 'bg-blue-50 font-medium text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {index === 0 ? <Home size={14} /> : <Folder size={14} />}
              <span className="max-w-[120px] truncate">{crumb.name}</span>
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* 文件夹列表 */}
      <div className="flex-1 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
        {/* 当前文件夹选项（根目录或当前目录） */}
        <button
          onClick={() => {
            const currentName =
              breadcrumbs[breadcrumbs.length - 1]?.name || 'My Drive';
            handleSelectFolder(currentFolderId, currentName);
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
            selectedFolderId === currentFolderId
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          )}
        >
          <Folder size={16} />
          <span className="flex-1 font-medium">
            {breadcrumbs[breadcrumbs.length - 1]?.name || 'My Drive'}
          </span>
          {selectedFolderId === currentFolderId && (
            <span className="text-xs">(Selected)</span>
          )}
        </button>

        {/* 加载状态 */}
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 size={20} className="animate-spin" />
            <span className="ml-2 text-sm">Loading folders...</span>
          </div>
        )}

        {/* 错误状态 */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-red-700">
            <AlertCircle size={16} />
            <span className="text-sm">
              {error instanceof Error
                ? error.message
                : 'Failed to load folders'}
            </span>
          </div>
        )}

        {/* 子文件夹列表 */}
        {!isLoading && folders.length > 0 && (
          <div className="space-y-1">
            {folders.map((folder) => (
              <div key={folder.id} className="flex items-center gap-1">
                <button
                  onClick={() => {
                    handleSelectFolder(folder.id, folder.name);
                  }}
                  className={cn(
                    'flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    selectedFolderId === folder.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100'
                  )}
                >
                  <Folder size={16} />
                  <span className="flex-1 truncate">{folder.name}</span>
                </button>
                <button
                  onClick={() => enterFolder(folder)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                  title="Open folder"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 空状态 */}
        {!isLoading && !error && folders.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-500">
            <Folder size={32} className="mx-auto mb-2 text-gray-400" />
            <p>No subfolders in this directory</p>
          </div>
        )}
      </div>

      {/* 新建文件夹按钮 */}
      <div className="mt-3">
        {!showCreateFolder ? (
          <button
            onClick={() => setShowCreateFolder(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 transition-colors hover:border-gray-400 hover:bg-gray-50"
          >
            <FolderPlus size={16} />
            <span>Create New Folder</span>
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              disabled={isCreating}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') {
                  setShowCreateFolder(false);
                  setNewFolderName('');
                }
              }}
              autoFocus
            />
            <button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || isCreating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isCreating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                'Create'
              )}
            </button>
            <button
              onClick={() => {
                setShowCreateFolder(false);
                setNewFolderName('');
              }}
              disabled={isCreating}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
