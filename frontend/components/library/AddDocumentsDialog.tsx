'use client';

import { useState } from 'react';
import {
  X,
  Link as LinkIcon,
  Bookmark,
  StickyNote,
  Image as ImageIcon,
  Plus,
  Upload,
  HardDrive,
} from 'lucide-react';
import UrlImportPanel from './UrlImportPanel';
import BookmarkSelectPanel from './BookmarkSelectPanel';
import NoteSelectPanel from './NoteSelectPanel';
import OcrUploadPanel from './OcrUploadPanel';
import FileUploadPanel from './FileUploadPanel';
import GoogleDriveImportPanel from './GoogleDriveImportPanel';

type TabType = 'upload' | 'gdrive' | 'url' | 'bookmark' | 'note' | 'ocr';

const TABS = [
  {
    id: 'upload' as TabType,
    label: '手动上传',
    icon: Upload,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  {
    id: 'gdrive' as TabType,
    label: 'Google Drive',
    icon: HardDrive,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  {
    id: 'url' as TabType,
    label: 'URL 抓取',
    icon: LinkIcon,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  {
    id: 'bookmark' as TabType,
    label: '平台书签',
    icon: Bookmark,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  {
    id: 'note' as TabType,
    label: '平台笔记',
    icon: StickyNote,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
  },
  {
    id: 'ocr' as TabType,
    label: '图片 OCR',
    icon: ImageIcon,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
  },
];

interface AddDocumentsDialogProps {
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  onClose: () => void;
  onDocumentsAdded?: () => void;
}

/**
 * Add Documents Dialog
 * Allows users to add content to a knowledge base from various sources
 */
export default function AddDocumentsDialog({
  knowledgeBaseId,
  knowledgeBaseName,
  onClose,
  onDocumentsAdded,
}: AddDocumentsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabType>('upload');
  const [totalImported, setTotalImported] = useState(0);

  const handleImportComplete = (count: number) => {
    setTotalImported((prev) => prev + count);
    onDocumentsAdded?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Plus className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">添加内容</h2>
              <p className="text-xs text-gray-500">
                向「{knowledgeBaseName}」添加文档
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs - Scrollable on mobile */}
        <div className="scrollbar-hide overflow-x-auto border-b border-gray-200 px-6">
          <div className="flex min-w-max">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? `border-blue-500 text-blue-600`
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? tab.color : ''}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'upload' && (
            <FileUploadPanel
              knowledgeBaseId={knowledgeBaseId}
              onImportComplete={handleImportComplete}
            />
          )}
          {activeTab === 'gdrive' && (
            <GoogleDriveImportPanel
              knowledgeBaseId={knowledgeBaseId}
              onImportComplete={handleImportComplete}
            />
          )}
          {activeTab === 'url' && (
            <UrlImportPanel
              knowledgeBaseId={knowledgeBaseId}
              onImportComplete={handleImportComplete}
            />
          )}
          {activeTab === 'bookmark' && (
            <BookmarkSelectPanel
              knowledgeBaseId={knowledgeBaseId}
              onImportComplete={handleImportComplete}
            />
          )}
          {activeTab === 'note' && (
            <NoteSelectPanel
              knowledgeBaseId={knowledgeBaseId}
              onImportComplete={handleImportComplete}
            />
          )}
          {activeTab === 'ocr' && (
            <OcrUploadPanel
              knowledgeBaseId={knowledgeBaseId}
              onImportComplete={handleImportComplete}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
          <div className="text-sm text-gray-500">
            {totalImported > 0 && (
              <span className="text-green-600">
                本次已导入 {totalImported} 个文档
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
