'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Database,
  Plus,
  FileText,
  RefreshCw,
  Search,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import {
  useKnowledgeBase,
  type KnowledgeBase,
  type CreateKnowledgeBaseDto,
} from '@/hooks/domain/useKnowledgeBase';

/**
 * Library 页面的知识库 TAB 内容
 * 显示用户的知识库列表，支持创建和快速查看
 */
export default function KnowledgeBaseTabContent() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const {
    knowledgeBases,
    loading,
    error,
    creating,
    createKnowledgeBase,
    refreshList,
  } = useKnowledgeBase();

  const handleCreate = async (dto: CreateKnowledgeBaseDto) => {
    await createKnowledgeBase(dto);
    setShowCreateDialog(false);
  };

  const getStatusBadge = (status: KnowledgeBase['status']) => {
    const colors = {
      PENDING: 'bg-gray-100 text-gray-700',
      PROCESSING: 'bg-blue-100 text-blue-700',
      READY: 'bg-green-100 text-green-700',
      UPDATING: 'bg-yellow-100 text-yellow-700',
      ERROR: 'bg-red-100 text-red-700',
    };
    const labels = {
      PENDING: '待处理',
      PROCESSING: '处理中',
      READY: '就绪',
      UPDATING: '更新中',
      ERROR: '错误',
    };
    return (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}
      >
        {labels[status]}
      </span>
    );
  };

  const getSourceTypeLabel = (type: KnowledgeBase['sourceType']) => {
    const labels = {
      GOOGLE_DRIVE: 'Google Drive',
      MANUAL: '手动上传',
      URL: 'URL 抓取',
    };
    return labels[type];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-600">加载知识库失败: {error.message}</p>
        <button
          onClick={() => refreshList()}
          className="mt-3 text-sm font-medium text-red-700 hover:underline"
        >
          重试
        </button>
      </div>
    );
  }

  // 空状态
  if (knowledgeBases.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16">
        <Database className="h-16 w-16 text-gray-400" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          创建你的第一个知识库
        </h3>
        <p className="mt-2 max-w-md text-center text-gray-500">
          知识库可以存储你的文档、笔记和资料，支持 AI 智能检索和问答。
        </p>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="mt-6 flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-5 w-5" />
          创建知识库
        </button>

        {showCreateDialog && (
          <CreateKnowledgeBaseDialog
            onClose={() => setShowCreateDialog(false)}
            onCreate={handleCreate}
            creating={creating}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 头部操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-gray-600" />
          <span className="text-sm text-gray-600">
            {knowledgeBases.length} 个知识库
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refreshList()}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            新建知识库
          </button>
        </div>
      </div>

      {/* 知识库列表 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {knowledgeBases.map((kb) => (
          <Link
            key={kb.id}
            href={`/rag?kb=${kb.id}`}
            className="group rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-blue-600">
                    {kb.name}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {getSourceTypeLabel(kb.sourceType)}
                  </p>
                </div>
              </div>
              {getStatusBadge(kb.status)}
            </div>

            {kb.description && (
              <p className="mt-3 line-clamp-2 text-sm text-gray-600">
                {kb.description}
              </p>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" />
                  {kb._count?.documents ?? 0} 文档
                </span>
              </div>
              <ExternalLink className="h-4 w-4 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </Link>
        ))}
      </div>

      {/* 快捷入口 */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                使用 RAG 智能问答
              </p>
              <p className="text-xs text-gray-500">
                基于你的知识库进行 AI 检索和问答
              </p>
            </div>
          </div>
          <Link
            href="/rag"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            打开 RAG 工作台
          </Link>
        </div>
      </div>

      {/* 创建对话框 */}
      {showCreateDialog && (
        <CreateKnowledgeBaseDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreate}
          creating={creating}
        />
      )}
    </div>
  );
}

/**
 * 创建知识库对话框
 */
function CreateKnowledgeBaseDialog({
  onClose,
  onCreate,
  creating,
}: {
  onClose: () => void;
  onCreate: (dto: CreateKnowledgeBaseDto) => void;
  creating: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState<
    'MANUAL' | 'GOOGLE_DRIVE' | 'URL'
  >('MANUAL');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      name,
      description: description || undefined,
      sourceType,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">创建知识库</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="输入知识库名称"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              描述 (可选)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="描述这个知识库的用途"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              数据来源
            </label>
            <select
              value={sourceType}
              onChange={(e) =>
                setSourceType(e.target.value as typeof sourceType)
              }
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="MANUAL">手动上传文档</option>
              <option value="GOOGLE_DRIVE">同步 Google Drive</option>
              <option value="URL">URL 抓取</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
