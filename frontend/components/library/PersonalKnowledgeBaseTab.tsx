'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  FileText,
  RefreshCw,
  ExternalLink,
  Loader2,
  User,
  Pencil,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import {
  useKnowledgeBase,
  useKnowledgeBaseDetail,
  type KnowledgeBase,
} from '@/hooks/domain/useKnowledgeBase';
import CreateKnowledgeBaseDialog from './CreateKnowledgeBaseDialog';
import EditKnowledgeBaseDialog from './EditKnowledgeBaseDialog';

/**
 * 个人知识库 TAB
 * 显示用户的个人知识库列表，点击直接进入 RAG 工作台
 */
export default function PersonalKnowledgeBaseTab() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingKbId, setEditingKbId] = useState<string | null>(null);
  const [deletingKbId, setDeletingKbId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const {
    knowledgeBases,
    loading,
    error,
    creating,
    createKnowledgeBase,
    deleteKnowledgeBase,
    refreshList,
  } = useKnowledgeBase();

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    const personalKBs = knowledgeBases.filter(
      (kb: any) => !kb.type || kb.type === 'PERSONAL'
    );
    if (selectedIds.size === personalKBs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(personalKBs.map((kb) => kb.id)));
    }
  };

  const handleBatchDelete = async () => {
    for (const id of selectedIds) {
      try {
        await deleteKnowledgeBase(id);
      } catch (err) {
        console.error('Failed to delete:', id, err);
      }
    }
    setSelectedIds(new Set());
    setDeletingKbId(null);
    refreshList();
  };

  // Get detail hook for editing
  const editingKbDetail = useKnowledgeBaseDetail(editingKbId || '');

  const handleDelete = async (kbId: string) => {
    try {
      await deleteKnowledgeBase(kbId);
      setDeletingKbId(null);
      refreshList();
    } catch (err) {
      console.error('Failed to delete knowledge base:', err);
    }
  };

  // Filter personal knowledge bases (type = PERSONAL or type is not set)
  const personalKBs = knowledgeBases.filter(
    (kb: any) => !kb.type || kb.type === 'PERSONAL'
  );

  const handleCreate = async (dto: any) => {
    await createKnowledgeBase({ ...dto, type: 'PERSONAL' });
    setShowCreateDialog(false);
  };

  const getStatusBadge = (kb: KnowledgeBase) => {
    const status = kb.status;
    const colors = {
      PENDING: 'bg-gray-100 text-gray-700',
      PROCESSING: 'bg-blue-100 text-blue-700',
      READY: 'bg-green-100 text-green-700',
      UPDATING: 'bg-yellow-100 text-yellow-700',
      ERROR: 'bg-red-100 text-red-700',
    };
    const labels = {
      PENDING: '待向量化',
      PROCESSING: '向量化中',
      READY: '已就绪',
      UPDATING: '更新中',
      ERROR: '处理失败',
    };
    const icons = {
      PENDING: '⏳',
      PROCESSING: '⚙️',
      READY: '✅',
      UPDATING: '🔄',
      ERROR: '❌',
    };
    return (
      <div className="flex flex-col items-end gap-1">
        <span
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}
        >
          <span>{icons[status]}</span>
          {labels[status]}
        </span>
        {status === 'PROCESSING' && (
          <span className="text-[10px] text-blue-500">正在生成向量...</span>
        )}
      </div>
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

  const getSourceTypeLabel = (type: KnowledgeBase['sourceType'] | string) => {
    const labels: Record<string, string> = {
      GOOGLE_DRIVE: 'Google Drive',
      MANUAL: '手动上传',
      URL: 'URL 抓取',
      NOTION: 'Notion',
      BOOKMARK: '书签',
      NOTE: '笔记',
      IMAGE: '图片',
    };
    return labels[type] || type;
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

  // Empty state
  if (personalKBs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-50">
          <User className="h-10 w-10 text-blue-600" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          创建你的第一个个人知识库
        </h3>
        <p className="mt-2 max-w-md text-center text-gray-500">
          个人知识库用于存储你的私人文档、笔记和资料，支持 AI 智能检索和问答。
        </p>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="mt-6 flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-white transition-colors hover:bg-blue-700"
        >
          <Plus className="h-5 w-5" />
          新建个人知识库
        </button>

        {showCreateDialog && (
          <CreateKnowledgeBaseDialog
            onClose={() => setShowCreateDialog(false)}
            onCreate={handleCreate}
            creating={creating}
            kbType="PERSONAL"
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
          <User className="h-5 w-5 text-blue-600" />
          <span className="text-sm font-medium text-gray-700">
            {personalKBs.length} 个个人知识库
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

      {/* Batch Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3">
          <span className="text-sm text-blue-700">
            已选择 {selectedIds.size} 个知识库
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            >
              取消选择
            </button>
            <button
              onClick={() => setDeletingKbId('batch')}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" />
              批量删除
            </button>
          </div>
        </div>
      )}

      {/* Knowledge Base Grid - Links directly to RAG */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {personalKBs.map((kb) => (
          <div
            key={kb.id}
            className={`group relative rounded-xl bg-white p-5 transition-all hover:bg-gray-50 ${
              selectedIds.has(kb.id) ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            {/* Selection Checkbox */}
            <div className="absolute left-3 top-3 z-10">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleSelect(kb.id);
                }}
                className={`flex h-5 w-5 items-center justify-center rounded border transition-all ${
                  selectedIds.has(kb.id)
                    ? 'border-blue-500 bg-blue-500 text-white'
                    : 'border-gray-300 bg-white opacity-0 group-hover:opacity-100'
                }`}
              >
                {selectedIds.has(kb.id) && (
                  <svg
                    className="h-3 w-3"
                    fill="currentColor"
                    viewBox="0 0 12 12"
                  >
                    <path d="M10.28 2.28L4.5 8.06 1.72 5.28a.75.75 0 00-1.06 1.06l3.5 3.5a.75.75 0 001.06 0l6.5-6.5a.75.75 0 00-1.06-1.06z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Action Menu */}
            <div className="absolute right-3 top-3 z-10">
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveMenuId(activeMenuId === kb.id ? null : kb.id);
                  }}
                  className="rounded-lg p-1.5 text-gray-400 opacity-0 transition-all hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {activeMenuId === kb.id && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingKbId(kb.id);
                        setActiveMenuId(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Pencil className="h-4 w-4" />
                      编辑
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeletingKbId(kb.id);
                        setActiveMenuId(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      删除
                    </button>
                  </div>
                )}
              </div>
            </div>

            <Link href={`/rag?kb=${kb.id}`} className="block">
              <div className="flex items-start justify-between pr-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 text-lg">
                    {getSourceTypeIcon(kb.sourceType)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-blue-600">
                      {kb.name}
                    </h3>
                    <p className="truncate text-xs text-gray-500">
                      {(kb.sourceTypes?.length
                        ? kb.sourceTypes
                        : [kb.sourceType]
                      )
                        .map((t) => getSourceTypeLabel(t))
                        .join(', ')}
                    </p>
                  </div>
                </div>
                {getStatusBadge(kb)}
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
          </div>
        ))}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateKnowledgeBaseDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreate}
          creating={creating}
          kbType="PERSONAL"
        />
      )}

      {/* Edit Dialog */}
      {editingKbId && editingKbDetail.knowledgeBase && (
        <EditKnowledgeBaseDialog
          knowledgeBase={editingKbDetail.knowledgeBase}
          onClose={() => setEditingKbId(null)}
          onUpdate={async (data) => {
            await editingKbDetail.updateKnowledgeBase(data);
            setEditingKbId(null);
            refreshList();
          }}
          updating={editingKbDetail.updating}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deletingKbId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">确认删除</h3>
            <p className="mt-2 text-gray-600">
              {deletingKbId === 'batch'
                ? `确定要删除选中的 ${selectedIds.size} 个知识库吗？此操作不可撤销，所有相关的文档和向量数据都将被删除。`
                : '确定要删除这个知识库吗？此操作不可撤销，所有相关的文档和向量数据都将被删除。'}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeletingKbId(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={() =>
                  deletingKbId === 'batch'
                    ? handleBatchDelete()
                    : handleDelete(deletingKbId)
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close menu */}
      {activeMenuId && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setActiveMenuId(null)}
        />
      )}
    </div>
  );
}
