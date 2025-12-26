'use client';

import { useEffect, useState } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronLeft,
  Home,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  useGoogleDriveFolders,
  type GoogleDriveFolder,
} from '@/hooks/domain/useKnowledgeBase';

interface GoogleDriveFolderPickerProps {
  selectedFolderIds: string[];
  onSelectionChange: (folderIds: string[], folderNames: string[]) => void;
  disabled?: boolean;
}

/**
 * Google Drive 文件夹选择器
 * 支持多选文件夹，用于知识库同步
 */
export default function GoogleDriveFolderPicker({
  selectedFolderIds,
  onSelectionChange,
  disabled = false,
}: GoogleDriveFolderPickerProps) {
  const {
    folders,
    loading,
    error,
    parentStack,
    fetchFolders,
    navigateToFolder,
    navigateBack,
    navigateToRoot,
  } = useGoogleDriveFolders();

  // 保存选中文件夹的名称映射
  const [selectedFolderNames, setSelectedFolderNames] = useState<
    Map<string, string>
  >(new Map());

  // 初始加载
  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const toggleFolderSelection = (folder: GoogleDriveFolder) => {
    if (disabled) return;

    const newSelectedIds = [...selectedFolderIds];
    const newNamesMap = new Map(selectedFolderNames);

    const index = newSelectedIds.indexOf(folder.id);
    if (index > -1) {
      // 取消选择
      newSelectedIds.splice(index, 1);
      newNamesMap.delete(folder.id);
    } else {
      // 添加选择
      newSelectedIds.push(folder.id);
      newNamesMap.set(folder.id, folder.name);
    }

    setSelectedFolderNames(newNamesMap);
    onSelectionChange(newSelectedIds, Array.from(newNamesMap.values()));
  };

  const handleFolderDoubleClick = (folder: GoogleDriveFolder) => {
    if (disabled || loading) return;
    navigateToFolder(folder);
  };

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">
            {error.message.includes('No Google Drive connection')
              ? '请先在「资源库 → Google Drive」中连接您的 Google 账号'
              : `加载文件夹失败: ${error.message}`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* 导航栏 */}
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <button
          type="button"
          onClick={navigateToRoot}
          disabled={loading || disabled || parentStack.length === 0}
          className="rounded p-1 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
          title="返回根目录"
        >
          <Home className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={navigateBack}
          disabled={loading || disabled || parentStack.length === 0}
          className="rounded p-1 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
          title="返回上级"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-1 items-center gap-1 overflow-x-auto text-sm text-gray-600">
          <span className="font-medium text-gray-900">我的云端硬盘</span>
          {parentStack.map((item, index) => (
            <span key={item.id} className="flex items-center">
              <ChevronRight className="h-4 w-4 text-gray-400" />
              <span
                className={
                  index === parentStack.length - 1
                    ? 'font-medium text-gray-900'
                    : ''
                }
              >
                {item.name}
              </span>
            </span>
          ))}
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
      </div>

      {/* 文件夹列表 */}
      <div className="max-h-64 min-h-[160px] overflow-y-auto p-2">
        {loading && folders.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : folders.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-gray-500">
            此目录下没有文件夹
          </div>
        ) : (
          <div className="grid gap-1">
            {folders.map((folder) => {
              const isSelected = selectedFolderIds.includes(folder.id);
              return (
                <div
                  key={folder.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-transparent hover:bg-gray-50'
                  } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                  onClick={() => toggleFolderSelection(folder)}
                  onDoubleClick={() => handleFolderDoubleClick(folder)}
                >
                  {/* 选择框 */}
                  <div
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${
                      isSelected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </div>

                  {/* 文件夹图标 */}
                  {isSelected ? (
                    <FolderOpen className="h-5 w-5 flex-shrink-0 text-blue-600" />
                  ) : (
                    <Folder className="h-5 w-5 flex-shrink-0 text-gray-400" />
                  )}

                  {/* 文件夹信息 */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {folder.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {folder.fileCount > 0
                        ? `${folder.fileCount} 个文件`
                        : '空文件夹'}
                    </p>
                  </div>

                  {/* 进入按钮 */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFolderDoubleClick(folder);
                    }}
                    disabled={loading || disabled}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                    title="进入文件夹"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 选中提示 */}
      {selectedFolderIds.length > 0 && (
        <div className="border-t border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-xs text-gray-600">
            已选择 {selectedFolderIds.length} 个文件夹
            {selectedFolderNames.size > 0 && (
              <span className="ml-1 text-gray-500">
                ({Array.from(selectedFolderNames.values()).join(', ')})
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
