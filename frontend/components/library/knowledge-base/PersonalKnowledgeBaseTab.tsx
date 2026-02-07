'use client';

import { useState } from 'react';
import {
  Plus,
  FileText,
  RefreshCw,
  Loader2,
  User,
  Pencil,
  Trash2,
  MoreVertical,
  AlertCircle,
  Eye,
  HardDrive,
  FileUp,
  Globe,
  StickyNote,
  Bookmark,
  PenLine,
  ImageIcon,
  BookOpen,
} from 'lucide-react';
import {
  useKnowledgeBase,
  useKnowledgeBaseDetail,
  type KnowledgeBase,
  type KnowledgeBaseDocument,
  type CreateKnowledgeBaseDto,
} from '@/hooks/domain/useKnowledgeBase';
import CreateKnowledgeBaseDialog from './CreateKnowledgeBaseDialog';
import EditKnowledgeBaseDialog from './EditKnowledgeBaseDialog';
import SearchTestDialog from './SearchTestDialog';
import DocumentListDialog from '../dialogs/DocumentListDialog';
import AddDocumentsDialog from '../resources/AddDocumentsDialog';
import KnowledgeBaseDetailDialog from './KnowledgeBaseDetailDialog';
import SignInPrompt, { isAuthError } from '@/components/common/SignInPrompt';

import { logger } from '@/lib/utils/logger';
interface PersonalKnowledgeBaseTabProps {
  searchQuery?: string;
}

/**
 * 个人知识库 TAB
 * 显示用户的个人知识库列表，点击直接进入 RAG 工作台
 */
export default function PersonalKnowledgeBaseTab({
  searchQuery = '',
}: PersonalKnowledgeBaseTabProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingKbId, setEditingKbId] = useState<string | null>(null);
  const [deletingKbId, setDeletingKbId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDetailKbId, setShowDetailKbId] = useState<string | null>(null); // 弹窗显示详情的知识库ID
  const [showSearchTest, setShowSearchTest] = useState<string | null>(null); // 搜索测试的知识库ID
  const [showDocList, setShowDocList] = useState<{
    kbId: string;
    kbName: string;
    documents: KnowledgeBaseDocument[];
  } | null>(null); // 文档列表弹窗
  const [showAddDocs, setShowAddDocs] = useState<{
    kbId: string;
    kbName: string;
  } | null>(null); // 添加内容弹窗

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
      (kb) => !kb.type || kb.type === 'PERSONAL'
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
        logger.error('Failed to delete:', id, err);
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
      logger.error('Failed to delete knowledge base:', err);
    }
  };

  // Filter personal knowledge bases (type = PERSONAL or type is not set)
  // Also apply search query filter if provided
  const personalKBs = knowledgeBases.filter((kb) => {
    const isPersonal = !kb.type || kb.type === 'PERSONAL';
    if (!isPersonal) return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      kb.name?.toLowerCase().includes(query) ||
      kb.description?.toLowerCase().includes(query)
    );
  });

  const handleCreate = async (dto: CreateKnowledgeBaseDto) => {
    await createKnowledgeBase({ ...dto, type: 'PERSONAL' });
    setShowCreateDialog(false);
  };

  // 状态徽章 - 更醒目的设计
  const getStatusBadge = (kb: KnowledgeBase) => {
    const statusMap: Record<
      string,
      { label: string; bg: string; text: string; dot: string }
    > = {
      PENDING: {
        label: '待处理',
        bg: 'bg-gray-100',
        text: 'text-gray-600',
        dot: 'bg-gray-400',
      },
      PROCESSING: {
        label: '处理中',
        bg: 'bg-blue-50',
        text: 'text-blue-600',
        dot: 'bg-blue-500 animate-pulse',
      },
      READY: {
        label: '就绪',
        bg: 'bg-emerald-50',
        text: 'text-emerald-600',
        dot: 'bg-emerald-500',
      },
      UPDATING: {
        label: '更新中',
        bg: 'bg-amber-50',
        text: 'text-amber-600',
        dot: 'bg-amber-500 animate-pulse',
      },
      ERROR: {
        label: '错误',
        bg: 'bg-red-50',
        text: 'text-red-600',
        dot: 'bg-red-500',
      },
    };
    const status = statusMap[kb.status] || statusMap.PENDING;

    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${status.bg} ${status.text}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
        {status.label}
      </span>
    );
  };

  // 获取图标背景渐变色
  const getIconGradient = (sourceType: string) => {
    const gradients: Record<string, string> = {
      GOOGLE_DRIVE: 'from-green-400 to-emerald-500',
      MANUAL: 'from-blue-400 to-indigo-500',
      URL: 'from-purple-400 to-violet-500',
      NOTION: 'from-gray-600 to-gray-800',
      BOOKMARK: 'from-orange-400 to-amber-500',
      NOTE: 'from-pink-400 to-rose-500',
      IMAGE: 'from-cyan-400 to-teal-500',
    };
    return gradients[sourceType] || 'from-blue-400 to-indigo-500';
  };

  const getSourceTypeIcon = (type: KnowledgeBase['sourceType']) => {
    const iconClass = 'h-6 w-6 text-white';
    const icons: Record<string, React.ReactNode> = {
      GOOGLE_DRIVE: <HardDrive className={iconClass} />,
      MANUAL: <FileUp className={iconClass} />,
      URL: <Globe className={iconClass} />,
      NOTION: <StickyNote className={iconClass} />,
      BOOKMARK: <Bookmark className={iconClass} />,
      NOTE: <PenLine className={iconClass} />,
      IMAGE: <ImageIcon className={iconClass} />,
    };
    return icons[type] || <BookOpen className={iconClass} />;
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
    // 如果是认证错误，显示登录引导
    if (isAuthError(error)) {
      return (
        <SignInPrompt
          title="请先登录"
          description="登录后即可查看和管理你的个人知识库"
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
            key={`create-kb-empty-${Date.now()}`}
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
    <div className="space-y-4">
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

      {/* Knowledge Base Grid - Modern card design */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {personalKBs.map((kb) => (
          <div
            key={kb.id}
            className={`group relative overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-300 ${
              activeMenuId === kb.id
                ? '' // 菜单打开时禁用 hover 动画，防止光标抖动
                : 'hover:-translate-y-1 hover:shadow-lg'
            } ${
              selectedIds.has(kb.id)
                ? 'border-blue-400 ring-2 ring-blue-100'
                : 'border-gray-100 hover:border-gray-200'
            }`}
          >
            {/* Selection Checkbox */}
            <div className="absolute left-4 top-4 z-10">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleSelect(kb.id);
                }}
                className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all ${
                  selectedIds.has(kb.id)
                    ? 'border-blue-500 bg-blue-500 text-white'
                    : 'border-gray-300 bg-white/80 opacity-0 backdrop-blur-sm group-hover:opacity-100'
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
            <div className="absolute right-4 top-4 z-10">
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveMenuId(activeMenuId === kb.id ? null : kb.id);
                  }}
                  className="rounded-lg bg-white/80 p-1.5 text-gray-400 opacity-0 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-gray-600 group-hover:opacity-100"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {activeMenuId === kb.id && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingKbId(kb.id);
                        setActiveMenuId(null);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
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
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      删除
                    </button>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => setShowDetailKbId(kb.id)}
              className="block w-full text-left"
            >
              {/* Card Header with Icon */}
              <div className="p-5 pb-0">
                <div className="flex items-start gap-4">
                  {/* Large Gradient Icon */}
                  <div
                    className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${getIconGradient(kb.sourceType)} shadow-md transition-transform duration-300 group-hover:scale-105`}
                  >
                    {getSourceTypeIcon(kb.sourceType)}
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <h3 className="truncate text-base font-semibold text-gray-900 transition-colors group-hover:text-blue-600">
                      {kb.name}
                    </h3>
                    <p className="mt-0.5 truncate text-sm text-gray-500">
                      {(kb.sourceTypes?.length
                        ? kb.sourceTypes
                        : [kb.sourceType]
                      )
                        .map((t) => getSourceTypeLabel(t))
                        .join(' · ')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="px-5 py-3">
                {kb.description ? (
                  <p className="line-clamp-2 text-sm leading-relaxed text-gray-600">
                    {kb.description}
                  </p>
                ) : (
                  <p className="text-sm italic text-gray-400">暂无描述</p>
                )}
              </div>

              {/* Card Footer */}
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-5 py-3">
                <div className="flex items-center gap-1.5 text-sm text-gray-600">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <span className="font-medium">
                    {kb._count?.documents ?? 0}
                  </span>
                  <span className="text-gray-400">文档</span>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(kb)}
                  <Eye className="h-4 w-4 text-gray-300 transition-colors group-hover:text-blue-500" />
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <CreateKnowledgeBaseDialog
          key={`create-kb-${Date.now()}`}
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreate}
          creating={creating}
          kbType="PERSONAL"
        />
      )}

      {/* Edit Dialog */}
      {editingKbId &&
        (editingKbDetail.loading ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="rounded-xl bg-white p-8 shadow-xl">
              <div className="flex items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                <span className="text-gray-600">加载知识库信息...</span>
              </div>
            </div>
          </div>
        ) : editingKbDetail.knowledgeBase ? (
          <EditKnowledgeBaseDialog
            key={`edit-kb-${editingKbId}`}
            knowledgeBase={editingKbDetail.knowledgeBase}
            onClose={() => setEditingKbId(null)}
            onUpdate={async (data) => {
              await editingKbDetail.updateKnowledgeBase(data);
              await refreshList();
              setEditingKbId(null);
            }}
            updating={editingKbDetail.updating || editingKbDetail.syncing}
          />
        ) : (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="rounded-xl bg-white p-8 shadow-xl">
              <div className="flex flex-col items-center gap-3">
                <AlertCircle className="h-8 w-8 text-red-500" />
                <span className="text-gray-600">无法加载知识库信息</span>
                <button
                  onClick={() => setEditingKbId(null)}
                  className="mt-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        ))}

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

      {/* 向量搜索测试对话框 */}
      {showSearchTest && (
        <SearchTestDialog
          knowledgeBaseId={showSearchTest}
          onClose={() => setShowSearchTest(null)}
        />
      )}

      {/* 文档列表弹窗 */}
      {showDocList && (
        <DocumentListDialog
          documents={showDocList.documents}
          knowledgeBaseName={showDocList.kbName}
          onClose={() => setShowDocList(null)}
          onBack={() => {
            const kbId = showDocList.kbId;
            setShowDocList(null);
            setShowDetailKbId(kbId);
          }}
        />
      )}

      {/* 知识库详情弹窗 */}
      {showDetailKbId && (
        <KnowledgeBaseDetailDialog
          knowledgeBaseId={showDetailKbId}
          onClose={() => setShowDetailKbId(null)}
          onAddDocuments={() => {
            const kb = personalKBs.find((k) => k.id === showDetailKbId);
            if (kb) {
              setShowDetailKbId(null); // 先关闭详情弹窗
              setShowAddDocs({ kbId: kb.id, kbName: kb.name });
            }
          }}
          onSearchTest={() => {
            const kbId = showDetailKbId;
            setShowDetailKbId(null); // 先关闭详情弹窗
            setShowSearchTest(kbId);
          }}
          onViewDocuments={(docs: KnowledgeBaseDocument[]) => {
            const kb = personalKBs.find((k) => k.id === showDetailKbId);
            if (kb) {
              setShowDetailKbId(null); // 先关闭详情弹窗
              setShowDocList({ kbId: kb.id, kbName: kb.name, documents: docs });
            }
          }}
        />
      )}

      {/* 添加内容弹窗 */}
      {showAddDocs && (
        <AddDocumentsDialog
          knowledgeBaseId={showAddDocs.kbId}
          knowledgeBaseName={showAddDocs.kbName}
          onClose={() => setShowAddDocs(null)}
          onDocumentsAdded={async () => {
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
