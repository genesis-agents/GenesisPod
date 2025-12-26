'use client';

import { useState } from 'react';
import {
  Database,
  Plus,
  FileText,
  RefreshCw,
  ExternalLink,
  Loader2,
  User,
  Search,
  ChevronRight,
  Trash2,
  Pencil,
  FolderSync,
  FileSearch,
} from 'lucide-react';
import {
  useKnowledgeBase,
  useKnowledgeBaseDetail,
  type KnowledgeBase,
  type KnowledgeBaseSourceType,
} from '@/hooks/domain/useKnowledgeBase';
import CreateKnowledgeBaseDialog from './CreateKnowledgeBaseDialog';
import EditKnowledgeBaseDialog from './EditKnowledgeBaseDialog';

/**
 * 个人知识库 TAB
 * 显示用户的个人知识库列表，支持内联显示知识库详情
 */
export default function PersonalKnowledgeBaseTab() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);

  const {
    knowledgeBases,
    loading,
    error,
    creating,
    createKnowledgeBase,
    deleteKnowledgeBase,
    refreshList,
  } = useKnowledgeBase();

  // 获取选中知识库的详情
  const {
    knowledgeBase: selectedKB,
    stats: kbStats,
    loading: detailLoading,
    updating,
    syncing,
    processing,
    syncGoogleDrive,
    processDocuments,
    updateKnowledgeBase,
    refresh: refreshDetail,
  } = useKnowledgeBaseDetail(selectedKbId);

  // Filter personal knowledge bases (type = PERSONAL or type is not set)
  const personalKBs = knowledgeBases.filter(
    (kb: any) => !kb.type || kb.type === 'PERSONAL'
  );

  const handleCreate = async (dto: any) => {
    await createKnowledgeBase({ ...dto, type: 'PERSONAL' });
    setShowCreateDialog(false);
  };

  const handleDelete = async (id: string) => {
    if (
      !window.confirm('确定要删除这个知识库吗？所有文档和向量数据都将被删除。')
    ) {
      return;
    }
    await deleteKnowledgeBase(id);
    if (selectedKbId === id) {
      setSelectedKbId(null);
    }
  };

  const handleUpdate = async (data: {
    name?: string;
    description?: string;
    sourceTypes?: KnowledgeBaseSourceType[];
    googleDriveFolderIds?: string[];
  }) => {
    await updateKnowledgeBase(data);
    await refreshList(); // Also refresh the list to update any displayed info
  };

  const handleBackToList = () => {
    setSelectedKbId(null);
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

  // 如果选中了知识库，显示详情视图
  if (selectedKbId && selectedKB) {
    return (
      <div className="space-y-6">
        {/* 面包屑导航 */}
        <nav className="flex items-center gap-2 text-sm">
          <button
            onClick={handleBackToList}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
          >
            <User className="h-4 w-4" />
            个人知识库
          </button>
          <ChevronRight className="h-4 w-4 text-gray-400" />
          <span className="font-medium text-gray-900">{selectedKB.name}</span>
        </nav>

        {/* 知识库详情头部 */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 text-2xl">
                {getSourceTypeIcon(selectedKB.sourceType)}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedKB.name}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                  {getStatusBadge(selectedKB.status)}
                  <span className="flex flex-wrap items-center gap-1">
                    来源:{' '}
                    {(selectedKB.sourceTypes?.length
                      ? selectedKB.sourceTypes
                      : [selectedKB.sourceType]
                    ).map((type, idx, arr) => (
                      <span key={type}>
                        {getSourceTypeLabel(type)}
                        {idx < arr.length - 1 && ', '}
                      </span>
                    ))}
                  </span>
                  {selectedKB.lastSyncedAt && (
                    <span>
                      上次同步:{' '}
                      {new Date(selectedKB.lastSyncedAt).toLocaleString(
                        'zh-CN'
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(selectedKB.sourceType === 'GOOGLE_DRIVE' ||
                selectedKB.sourceTypes?.includes('GOOGLE_DRIVE')) && (
                <button
                  onClick={() => syncGoogleDrive()}
                  disabled={syncing}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  <FolderSync
                    className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`}
                  />
                  {syncing ? '同步中...' : '同步 Drive'}
                </button>
              )}
              <button
                onClick={() => processDocuments()}
                disabled={processing}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                <FileSearch
                  className={`h-4 w-4 ${processing ? 'animate-spin' : ''}`}
                />
                {processing ? '处理中...' : '处理文档'}
              </button>
              <button
                onClick={() => setShowEditDialog(true)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <Pencil className="h-4 w-4" />
                编辑
              </button>
              <button
                onClick={() => handleDelete(selectedKB.id)}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                删除
              </button>
            </div>
          </div>

          {selectedKB.description && (
            <p className="mt-4 text-sm text-gray-600">
              {selectedKB.description}
            </p>
          )}

          {/* 处理错误提示 */}
          {selectedKB.status === 'ERROR' && selectedKB.lastError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {selectedKB.lastError}
            </div>
          )}
        </div>

        {/* 统计信息 */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-2xl font-bold text-gray-900">
              {kbStats?.documentCount ?? selectedKB._count?.documents ?? 0}
            </div>
            <div className="text-sm text-gray-500">文档数</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-2xl font-bold text-gray-900">
              {kbStats?.parentChunkCount ?? 0}
            </div>
            <div className="text-sm text-gray-500">父分块</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-2xl font-bold text-gray-900">
              {kbStats?.childChunkCount ?? 0}
            </div>
            <div className="text-sm text-gray-500">子分块（向量）</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-2xl font-bold text-gray-900">
              {((kbStats?.totalTokens ?? 0) / 1000).toFixed(1)}k
            </div>
            <div className="text-sm text-gray-500">总 Token 数</div>
          </div>
        </div>

        {/* RAG 工作台入口 */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Search className="h-5 w-5 text-gray-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  使用 RAG 智能问答
                </p>
                <p className="text-xs text-gray-500">
                  基于此知识库进行 AI 检索和问答
                </p>
              </div>
            </div>
            <a
              href={`/rag?kb=${selectedKB.id}`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              打开 RAG 工作台
            </a>
          </div>
        </div>

        {/* Edit Dialog */}
        {showEditDialog && (
          <EditKnowledgeBaseDialog
            knowledgeBase={selectedKB}
            onClose={() => setShowEditDialog(false)}
            onUpdate={handleUpdate}
            updating={updating}
          />
        )}
      </div>
    );
  }

  // 默认显示知识库列表
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

      {/* Knowledge Base Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {personalKBs.map((kb) => (
          <button
            key={kb.id}
            onClick={() => setSelectedKbId(kb.id)}
            className="group rounded-xl border border-gray-200 bg-white p-5 text-left transition-all hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 text-lg">
                  {getSourceTypeIcon(kb.sourceType)}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 group-hover:text-blue-600">
                    {kb.name}
                  </h3>
                  <p className="truncate text-xs text-gray-500">
                    {(kb.sourceTypes?.length ? kb.sourceTypes : [kb.sourceType])
                      .map((t) => getSourceTypeLabel(t))
                      .join(', ')}
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
          </button>
        ))}
      </div>

      {/* Quick Access */}
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
          <a
            href="/rag"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            打开 RAG 工作台
          </a>
        </div>
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
    </div>
  );
}
