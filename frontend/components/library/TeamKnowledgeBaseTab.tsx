'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Database,
  Plus,
  FileText,
  RefreshCw,
  ExternalLink,
  Loader2,
  Users,
  Search,
  Lock,
} from 'lucide-react';
import {
  useKnowledgeBase,
  type KnowledgeBase,
} from '@/hooks/domain/useKnowledgeBase';
import CreateKnowledgeBaseDialog from './CreateKnowledgeBaseDialog';

/**
 * 团队知识库 TAB
 * 显示用户可访问的团队知识库列表
 */
export default function TeamKnowledgeBaseTab() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const {
    knowledgeBases,
    loading,
    error,
    creating,
    createKnowledgeBase,
    refreshList,
  } = useKnowledgeBase();

  // Filter team knowledge bases (type = TEAM)
  const teamKBs = knowledgeBases.filter((kb: any) => kb.type === 'TEAM');

  const handleCreate = async (dto: any) => {
    await createKnowledgeBase({ ...dto, type: 'TEAM' });
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

  const getSourceTypeIcon = (type: KnowledgeBase['sourceType']) => {
    const icons: Record<string, string> = {
      GOOGLE_DRIVE: '📁',
      MANUAL: '📄',
      URL: '🔗',
      NOTION: '📝',
      BOOKMARK: '🔖',
      NOTE: '✍️',
    };
    return icons[type] || '📚';
  };

  const getSourceTypeLabel = (type: KnowledgeBase['sourceType']) => {
    const labels: Record<string, string> = {
      GOOGLE_DRIVE: 'Google Drive',
      MANUAL: '手动上传',
      URL: 'URL 抓取',
      NOTION: 'Notion',
      BOOKMARK: '书签',
      NOTE: '笔记',
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
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

  // Empty state
  if (teamKBs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-purple-50">
          <Users className="h-10 w-10 text-purple-600" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          创建团队知识库
        </h3>
        <p className="mt-2 max-w-md text-center text-gray-500">
          团队知识库可以与团队成员共享，让团队 AI 助手拥有专业知识。
        </p>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="mt-6 flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-white transition-colors hover:bg-purple-700"
        >
          <Plus className="h-5 w-5" />
          创建团队知识库
        </button>

        {/* Feature hint */}
        <div className="mt-8 max-w-sm rounded-lg border border-purple-100 bg-purple-50 p-4">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 text-purple-600" />
            <div>
              <p className="text-sm font-medium text-purple-900">
                团队知识库功能
              </p>
              <p className="mt-1 text-xs text-purple-700">
                团队知识库支持权限控制、协作编辑和知识共享。成员可以在 AI
                对话中引用团队知识。
              </p>
            </div>
          </div>
        </div>

        {showCreateDialog && (
          <CreateKnowledgeBaseDialog
            onClose={() => setShowCreateDialog(false)}
            onCreate={handleCreate}
            creating={creating}
            kbType="TEAM"
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-purple-600" />
          <span className="text-sm font-medium text-gray-700">
            {teamKBs.length} 个团队知识库
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
            className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
          >
            <Plus className="h-4 w-4" />
            创建团队知识库
          </button>
        </div>
      </div>

      {/* Knowledge Base Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {teamKBs.map((kb) => (
          <Link
            key={kb.id}
            href={`/rag?kb=${kb.id}`}
            className="group rounded-xl border border-gray-200 bg-white p-5 transition-all hover:border-purple-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 text-lg">
                  {getSourceTypeIcon(kb.sourceType)}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-purple-600">
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
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  团队
                </span>
              </div>
              <ExternalLink className="h-4 w-4 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Access */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-gray-500" />
            <div>
              <p className="text-sm font-medium text-gray-900">团队知识问答</p>
              <p className="text-xs text-gray-500">
                基于团队知识库进行 AI 检索和问答
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

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateKnowledgeBaseDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreate}
          creating={creating}
          kbType="TEAM"
        />
      )}
    </div>
  );
}
