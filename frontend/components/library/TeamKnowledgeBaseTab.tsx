'use client';

import { useState } from 'react';
import {
  Plus,
  FileText,
  RefreshCw,
  Loader2,
  Users,
  Lock,
  Pencil,
  Trash2,
  MoreVertical,
  UserPlus,
  Calendar,
  Layers,
  ChevronRight,
  User,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  Clock,
  Zap,
  Database,
  FileType,
} from 'lucide-react';
import {
  useKnowledgeBase,
  useKnowledgeBaseDetail,
  type KnowledgeBase,
} from '@/hooks/domain/useKnowledgeBase';
import CreateKnowledgeBaseDialog from './CreateKnowledgeBaseDialog';
import EditKnowledgeBaseDialog from './EditKnowledgeBaseDialog';
import MemberManagementDialog from './MemberManagementDialog';
import SearchTestDialog from './SearchTestDialog';
import DocumentListDialog from './DocumentListDialog';
import AddDocumentsDialog from './AddDocumentsDialog';
import SignInPrompt, { isAuthError } from '@/components/shared/SignInPrompt';

interface TeamKnowledgeBaseTabProps {
  searchQuery?: string;
}

/**
 * 团队知识库 TAB
 * 显示用户可访问的团队知识库列表
 */
export default function TeamKnowledgeBaseTab({
  searchQuery = '',
}: TeamKnowledgeBaseTabProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingKbId, setEditingKbId] = useState<string | null>(null);
  const [deletingKbId, setDeletingKbId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [managingMembersKbId, setManagingMembersKbId] = useState<string | null>(
    null
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedKbId, setExpandedKbId] = useState<string | null>(null); // 展开的知识库ID
  const [showSearchTest, setShowSearchTest] = useState<string | null>(null); // 搜索测试的知识库ID
  const [showDocList, setShowDocList] = useState<{
    kbId: string;
    kbName: string;
  } | null>(null); // 文档列表弹窗
  const [showAddDocs, setShowAddDocs] = useState<{
    kbId: string;
    kbName: string;
  } | null>(null); // 添加内容弹窗

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

  const {
    knowledgeBases,
    loading,
    error,
    creating,
    createKnowledgeBase,
    deleteKnowledgeBase,
    refreshList,
  } = useKnowledgeBase();

  // Get detail hook for editing
  const editingKbDetail = useKnowledgeBaseDetail(editingKbId || '');

  // 获取展开的知识库详情
  const {
    knowledgeBase: expandedKb,
    stats: expandedStats,
    documents: expandedDocs,
    loading: expandedLoading,
    syncing,
    processing,
    syncGoogleDrive,
    processDocuments,
    refresh: refreshExpanded,
    fetchStats: refreshExpandedStats,
    fetchDocuments: refreshExpandedDocs,
  } = useKnowledgeBaseDetail(expandedKbId);

  const handleDelete = async (kbId: string) => {
    try {
      await deleteKnowledgeBase(kbId);
      setDeletingKbId(null);
      refreshList();
    } catch (err) {
      console.error('Failed to delete knowledge base:', err);
    }
  };

  // Filter team knowledge bases (type = TEAM)
  // Also apply search query filter if provided
  const teamKBs = knowledgeBases.filter((kb: any) => {
    if (kb.type !== 'TEAM') return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      kb.name?.toLowerCase().includes(query) ||
      kb.description?.toLowerCase().includes(query)
    );
  });

  const handleCreate = async (dto: any) => {
    await createKnowledgeBase({ ...dto, type: 'TEAM' });
    setShowCreateDialog(false);
  };

  // 智能状态计算 - 基于实际数据而非仅依赖后端 status
  const getSmartStatus = (
    kb: KnowledgeBase,
    stats?: typeof expandedStats,
    docs?: typeof expandedDocs
  ) => {
    if (kb.status === 'PROCESSING') {
      return { status: 'PROCESSING', label: '处理中', color: 'purple' };
    }

    if (stats) {
      const hasDocuments = stats.documentCount > 0;
      const hasEmbeddings = (stats.embeddingCount ?? 0) > 0;

      if (!hasDocuments) {
        return { status: 'EMPTY', label: '空', color: 'gray' };
      }
      if (hasEmbeddings) {
        return { status: 'READY', label: '就绪', color: 'green' };
      }
      return { status: 'PENDING', label: '待向量化', color: 'yellow' };
    }

    if (docs && docs.length > 0) {
      const vectorizedCount = docs.filter((d) => d.isVectorized).length;
      const errorCount = docs.filter((d) => d.status === 'ERROR').length;
      const processingCount = docs.filter(
        (d) => d.status === 'PROCESSING'
      ).length;

      if (processingCount > 0) {
        return { status: 'PROCESSING', label: '处理中', color: 'purple' };
      }
      if (vectorizedCount === docs.length) {
        return { status: 'READY', label: '就绪', color: 'green' };
      }
      if (vectorizedCount > 0) {
        return {
          status: 'PARTIAL',
          label: `${vectorizedCount}/${docs.length} 就绪`,
          color: 'yellow',
        };
      }
      if (errorCount === docs.length) {
        return { status: 'ERROR', label: '错误', color: 'red' };
      }
      return { status: 'PENDING', label: '待处理', color: 'gray' };
    }

    const statusMap: Record<string, { label: string; color: string }> = {
      PENDING: { label: '待处理', color: 'gray' },
      PROCESSING: { label: '处理中', color: 'purple' },
      READY: { label: '就绪', color: 'green' },
      UPDATING: { label: '更新中', color: 'yellow' },
      ERROR: { label: '错误', color: 'red' },
    };
    return {
      status: kb.status,
      ...(statusMap[kb.status] || statusMap.PENDING),
    };
  };

  const getStatusBadge = (
    kb: KnowledgeBase,
    stats?: typeof expandedStats,
    docs?: typeof expandedDocs
  ) => {
    const smartStatus = getSmartStatus(kb, stats, docs);
    const colorClasses: Record<string, { text: string; dot: string }> = {
      gray: { text: 'text-gray-500', dot: 'bg-gray-400' },
      purple: { text: 'text-purple-600', dot: 'bg-purple-500 animate-pulse' },
      green: { text: 'text-green-600', dot: 'bg-green-500' },
      yellow: { text: 'text-amber-600', dot: 'bg-amber-500' },
      red: { text: 'text-red-600', dot: 'bg-red-500' },
    };
    const colors = colorClasses[smartStatus.color] || colorClasses.gray;

    return (
      <span
        className={`flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${colors.text}`}
      >
        <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
        {smartStatus.label}
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
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (error) {
    // 如果是认证错误，显示登录引导
    if (isAuthError(error)) {
      return (
        <SignInPrompt
          title="请先登录"
          description="登录后即可查看和管理团队知识库"
        />
      );
    }

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
            key={`create-team-kb-empty-${Date.now()}`}
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

      {/* Batch Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-purple-50 px-4 py-3">
          <span className="text-sm text-purple-700">
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

      {/* Knowledge Base Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {teamKBs.map((kb) => (
          <div
            key={kb.id}
            className={`group relative rounded-xl bg-white p-5 transition-all hover:bg-gray-50 ${
              selectedIds.has(kb.id) ? 'ring-2 ring-purple-500' : ''
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
                    ? 'border-purple-500 bg-purple-500 text-white'
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
                  <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
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
                        setManagingMembersKbId(kb.id);
                        setActiveMenuId(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <UserPlus className="h-4 w-4" />
                      成员管理
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

            <button
              onClick={() =>
                setExpandedKbId(expandedKbId === kb.id ? null : kb.id)
              }
              className="block w-full text-left"
            >
              <div className="flex items-start justify-between pr-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 text-lg">
                    {getSourceTypeIcon(kb.sourceType)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 group-hover:text-purple-600">
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
                {/* 展开状态用智能状态，否则用基本状态 */}
                {expandedKbId === kb.id
                  ? getStatusBadge(kb, expandedStats, expandedDocs)
                  : getStatusBadge(kb)}
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
                <ChevronRight
                  className={`h-4 w-4 text-gray-400 transition-transform ${expandedKbId === kb.id ? 'rotate-90' : ''}`}
                />
              </div>
            </button>

            {/* 展开的详情面板 */}
            {expandedKbId === kb.id && (
              <div className="mt-4 border-t border-gray-200 pt-4">
                {expandedLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
                  </div>
                ) : expandedKb ? (
                  <div className="space-y-4">
                    {/* 统计信息 */}
                    {expandedStats && (
                      <div className="grid grid-cols-4 gap-2">
                        <div className="rounded-lg bg-purple-50 p-3 text-center">
                          <p className="text-lg font-bold text-purple-700">
                            {expandedStats.documentCount}
                          </p>
                          <p className="text-xs text-purple-600">文档</p>
                        </div>
                        <div className="rounded-lg bg-pink-50 p-3 text-center">
                          <p className="text-lg font-bold text-pink-700">
                            {expandedStats.childChunkCount}
                          </p>
                          <p className="text-xs text-pink-600">分块</p>
                        </div>
                        <div className="rounded-lg bg-indigo-50 p-3 text-center">
                          <p className="text-lg font-bold text-indigo-700">
                            {expandedStats.embeddingCount ?? 0}
                          </p>
                          <p className="text-xs text-indigo-600">向量</p>
                        </div>
                        <div className="rounded-lg bg-fuchsia-50 p-3 text-center">
                          <p className="text-lg font-bold text-fuchsia-700">
                            {expandedStats.totalTokens >= 1000
                              ? `${(expandedStats.totalTokens / 1000).toFixed(1)}k`
                              : expandedStats.totalTokens}
                          </p>
                          <p className="text-xs text-fuchsia-600">Tokens</p>
                        </div>
                      </div>
                    )}

                    {/* 详细信息 */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span>
                          创建:{' '}
                          {new Date(expandedKb.createdAt).toLocaleDateString(
                            'zh-CN'
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span>
                          更新:{' '}
                          {new Date(expandedKb.updatedAt).toLocaleDateString(
                            'zh-CN'
                          )}
                        </span>
                      </div>
                      {expandedKb.lastSyncedAt && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <RefreshCw className="h-4 w-4 text-gray-400" />
                          <span>
                            同步:{' '}
                            {new Date(
                              expandedKb.lastSyncedAt
                            ).toLocaleDateString('zh-CN')}
                          </span>
                        </div>
                      )}
                      {expandedKb.googleDriveConnectionId && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <User className="h-4 w-4 text-gray-400" />
                          <span>Google Drive 已连接</span>
                        </div>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {/* 测试搜索按钮 - 有向量时显示 */}
                      {expandedStats &&
                        (expandedStats.embeddingCount ?? 0) > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowSearchTest(kb.id);
                            }}
                            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:from-purple-700 hover:to-pink-700"
                          >
                            <Search className="h-4 w-4" />
                            测试搜索
                          </button>
                        )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          processDocuments();
                        }}
                        disabled={processing}
                        className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                      >
                        <Layers
                          className={`h-4 w-4 ${processing ? 'animate-spin' : ''}`}
                        />
                        {processing ? '处理中...' : '向量化'}
                      </button>
                      {(expandedKb.sourceType === 'GOOGLE_DRIVE' ||
                        expandedKb.sourceTypes?.includes('GOOGLE_DRIVE')) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            syncGoogleDrive();
                          }}
                          disabled={syncing}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`}
                          />
                          {syncing ? '同步中...' : '同步'}
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setManagingMembersKbId(kb.id);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        <UserPlus className="h-4 w-4" />
                        成员管理
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingKbId(kb.id);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        <Pencil className="h-4 w-4" />
                        编辑
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAddDocs({ kbId: kb.id, kbName: kb.name });
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
                      >
                        <Plus className="h-4 w-4" />
                        添加内容
                      </button>
                    </div>

                    {/* 文档列表 - 专业重设计 */}
                    {expandedDocs && expandedDocs.length > 0 && (
                      <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50/50">
                        {/* 列表头部 */}
                        <div className="flex items-center justify-between border-b border-gray-200 bg-purple-50/80 px-4 py-2.5">
                          <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                            <Database className="h-4 w-4 text-purple-500" />
                            文档列表
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-600">
                              {expandedDocs.length}
                            </span>
                          </h4>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3 text-green-500" />
                              {
                                expandedDocs.filter((d) => d.isVectorized)
                                  .length
                              }{' '}
                              已向量化
                            </span>
                          </div>
                        </div>

                        {/* 文档列表按钮 */}
                        <button
                          onClick={() =>
                            setShowDocList({ kbId: kb.id, kbName: kb.name })
                          }
                          className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left transition-all hover:border-indigo-300 hover:bg-indigo-50/50"
                        >
                          <div className="flex items-center gap-3">
                            <Database className="h-5 w-5 text-indigo-500" />
                            <div>
                              <span className="font-medium text-gray-900">
                                查看文档列表
                              </span>
                              <span className="ml-2 text-sm text-gray-500">
                                {expandedDocs.length} 个文档
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-green-700">
                              <CheckCircle className="h-3 w-3" />
                              {
                                expandedDocs.filter((d) => d.isVectorized)
                                  .length
                              }{' '}
                              已向量化
                            </span>
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateKnowledgeBaseDialog
          key={`create-team-kb-${Date.now()}`}
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreate}
          creating={creating}
          kbType="TEAM"
        />
      )}

      {/* Edit Dialog */}
      {editingKbId && editingKbDetail.knowledgeBase && (
        <EditKnowledgeBaseDialog
          key={`edit-team-kb-${editingKbId}`}
          knowledgeBase={editingKbDetail.knowledgeBase}
          onClose={() => setEditingKbId(null)}
          onUpdate={async (data) => {
            console.log('[TeamKB] Updating KB with data:', data);
            await editingKbDetail.updateKnowledgeBase(data);

            // Check if GOOGLE_DRIVE is in sourceTypes AND has files/folders
            const hasGoogleDriveSource = data.sourceTypes?.includes(
              'GOOGLE_DRIVE' as any
            );
            const hasGoogleDriveData =
              (data.googleDriveFolderIds &&
                data.googleDriveFolderIds.length > 0) ||
              (data.googleDriveFileIds && data.googleDriveFileIds.length > 0);

            if (hasGoogleDriveSource && hasGoogleDriveData) {
              console.log('[TeamKB] Starting Google Drive sync...');
              try {
                const syncResult = await editingKbDetail.syncGoogleDrive();
                console.log('[TeamKB] Sync completed:', syncResult);
              } catch (err) {
                console.error('[TeamKB] Sync failed:', err);
              }
            }

            // Refresh expanded KB if it's the same one being edited
            if (expandedKbId === editingKbId) {
              console.log(
                '[TeamKB] Refreshing expanded KB (detail, stats, docs)...'
              );
              await Promise.all([
                refreshExpanded(),
                refreshExpandedStats(),
                refreshExpandedDocs(),
              ]);
            }
            await refreshList();
            setEditingKbId(null);
          }}
          updating={editingKbDetail.updating || editingKbDetail.syncing}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deletingKbId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">确认删除</h3>
            <p className="mt-2 text-gray-600">
              {deletingKbId === 'batch'
                ? `确定要删除选中的 ${selectedIds.size} 个团队知识库吗？此操作不可撤销，所有相关的文档、向量数据和成员权限都将被删除。`
                : '确定要删除这个团队知识库吗？此操作不可撤销，所有相关的文档、向量数据和成员权限都将被删除。'}
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

      {/* Member Management Dialog */}
      {managingMembersKbId && (
        <MemberManagementDialog
          knowledgeBaseId={managingMembersKbId}
          knowledgeBaseName={
            teamKBs.find((kb: KnowledgeBase) => kb.id === managingMembersKbId)
              ?.name || ''
          }
          onClose={() => setManagingMembersKbId(null)}
        />
      )}

      {/* 向量搜索测试对话框 */}
      {showSearchTest && (
        <SearchTestDialog
          knowledgeBaseId={showSearchTest}
          onClose={() => setShowSearchTest(null)}
        />
      )}

      {/* 文档列表弹窗 */}
      {showDocList && expandedDocs && (
        <DocumentListDialog
          documents={expandedDocs}
          knowledgeBaseName={showDocList.kbName}
          onClose={() => setShowDocList(null)}
        />
      )}

      {/* 添加内容弹窗 */}
      {showAddDocs && (
        <AddDocumentsDialog
          knowledgeBaseId={showAddDocs.kbId}
          knowledgeBaseName={showAddDocs.kbName}
          onClose={() => setShowAddDocs(null)}
          onDocumentsAdded={async () => {
            // Refresh the expanded KB data after adding documents
            if (expandedKbId === showAddDocs.kbId) {
              await Promise.all([
                refreshExpanded(),
                refreshExpandedStats(),
                refreshExpandedDocs(),
              ]);
            }
            await refreshList();
          }}
        />
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
