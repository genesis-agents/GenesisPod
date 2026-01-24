'use client';

/**
 * Slides Gallery - 会话画廊组件
 *
 * 显示所有历史会话，支持网格和列表视图
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Loader2,
  FolderOpen,
  Plus,
  Pencil,
  Check,
  MoreVertical,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type { SessionWithCheckpoint } from '@/hooks/features/slides';
import type { SlidesHistoryItem } from '@/stores';
import { formatRelativeTime } from '@/stores';

// ============================================================================
// SessionsGallery 主组件
// ============================================================================

interface SessionsGalleryProps {
  backendSessions: SessionWithCheckpoint[];
  localHistory: SlidesHistoryItem[];
  viewMode: 'grid' | 'list';
  onRestoreSession: (session: SessionWithCheckpoint) => void;
  onRestoreHistory: (item: SlidesHistoryItem) => void;
  onNewClick: () => void;
  loading?: boolean;
  restoring?: boolean;
  onUpdateSession?: (sessionId: string, title: string) => Promise<boolean>;
  onDeleteSession?: (sessionId: string) => Promise<boolean>;
}

export function SessionsGallery({
  backendSessions,
  localHistory,
  viewMode,
  onRestoreSession,
  onRestoreHistory,
  onNewClick,
  loading,
  restoring,
  onUpdateSession,
  onDeleteSession,
}: SessionsGalleryProps) {
  // 优先使用后端会话，如果没有则使用本地历史
  const hasBackendSessions = backendSessions.length > 0;
  const localSessions = localHistory.filter(
    (item) => item.sessionId && item.status === 'success'
  );

  if (loading) {
    return (
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center bg-gray-50 p-8">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-orange-500" />
          <p className="text-sm text-gray-500">加载历史记录...</p>
        </div>
      </main>
    );
  }

  if (!hasBackendSessions && localSessions.length === 0) {
    return (
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center bg-gray-50 p-8">
        <div className="text-center">
          <FolderOpen className="mx-auto mb-4 h-16 w-16 text-gray-300" />
          <h2 className="mb-2 text-lg font-medium text-gray-900">
            还没有演示文稿
          </h2>
          <p className="mb-6 text-sm text-gray-500">
            点击新建按钮创建您的第一个 AI 演示文稿
          </p>
          <button
            onClick={onNewClick}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-medium text-white hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            新建演示文稿
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-gray-50">
      {/* 恢复加载遮罩 */}
      {restoring && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80">
          <div className="text-center">
            <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-orange-500" />
            <p className="text-sm font-medium text-gray-600">
              正在恢复演示文稿...
            </p>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto p-6">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {/* 后端会话 */}
            {backendSessions.map((session) => (
              <BackendSessionCard
                key={session.id}
                session={session}
                onClick={() => onRestoreSession(session)}
                onUpdate={onUpdateSession}
                onDelete={onDeleteSession}
              />
            ))}
            {/* 本地历史（只显示不在后端的） */}
            {!hasBackendSessions &&
              localSessions.map((item) => (
                <SessionGridCard
                  key={item.id}
                  item={item}
                  onClick={() => onRestoreHistory(item)}
                />
              ))}
          </div>
        ) : (
          <div className="space-y-2">
            {/* 后端会话 */}
            {backendSessions.map((session) => (
              <BackendSessionListItem
                key={session.id}
                session={session}
                onClick={() => onRestoreSession(session)}
                onUpdate={onUpdateSession}
                onDelete={onDeleteSession}
              />
            ))}
            {/* 本地历史 */}
            {!hasBackendSessions &&
              localSessions.map((item) => (
                <SessionListItem
                  key={item.id}
                  item={item}
                  onClick={() => onRestoreHistory(item)}
                />
              ))}
          </div>
        )}
      </div>
    </main>
  );
}

// ============================================================================
// 后端会话卡片 (Grid View)
// ============================================================================

interface BackendSessionCardProps {
  session: SessionWithCheckpoint;
  onClick: () => void;
  onUpdate?: (sessionId: string, title: string) => Promise<boolean>;
  onDelete?: (sessionId: string) => Promise<boolean>;
}

function BackendSessionCard({
  session,
  onClick,
  onUpdate,
  onDelete,
}: BackendSessionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSaveEdit = async () => {
    if (onUpdate && editTitle.trim() && editTitle !== session.title) {
      await onUpdate(session.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    setShowMenu(false);
    try {
      await onDelete(session.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCardClick = () => {
    if (!isEditing && !isDeleting) {
      onClick();
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all',
        !isEditing && !isDeleting && 'cursor-pointer hover:shadow-md',
        isDeleting && 'opacity-50'
      )}
    >
      {/* 缩略图 */}
      <div className="aspect-video bg-gradient-to-br from-orange-100 to-orange-200 p-4">
        <div className="text-4xl font-bold text-orange-500/20">
          {session.latestCheckpoint?.pagesCount || 0}
        </div>
      </div>

      {/* 信息区 */}
      <div className="p-3">
        {isEditing ? (
          <div className="mb-2 flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveEdit();
                } else if (e.key === 'Escape') {
                  setEditTitle(session.title);
                  setIsEditing(false);
                }
              }}
              className="flex-1 rounded border border-orange-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSaveEdit();
              }}
              className="rounded p-1 text-green-600 hover:bg-green-50"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditTitle(session.title);
                setIsEditing(false);
              }}
              className="rounded p-1 text-gray-600 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <h3 className="mb-2 truncate text-sm font-medium text-gray-900">
            {session.title || '未命名演示'}
          </h3>
        )}

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{session.latestCheckpoint?.pagesCount || 0} 页</span>
          <span>{formatRelativeTime(new Date(session.createdAt))}</span>
        </div>
      </div>

      {/* 操作菜单 */}
      {!isEditing && (
        <div className="absolute right-2 top-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="rounded-lg bg-white/80 p-1.5 opacity-0 backdrop-blur-sm transition-opacity hover:bg-white group-hover:opacity-100"
          >
            <MoreVertical className="h-4 w-4 text-gray-600" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full z-10 mt-1 w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  setIsEditing(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                重命名
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </div>
          )}
        </div>
      )}

      {isDeleting && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 后端会话列表项 (List View)
// ============================================================================

interface BackendSessionListItemProps {
  session: SessionWithCheckpoint;
  onClick: () => void;
  onUpdate?: (sessionId: string, title: string) => Promise<boolean>;
  onDelete?: (sessionId: string) => Promise<boolean>;
}

function BackendSessionListItem({
  session,
  onClick,
  onUpdate,
  onDelete,
}: BackendSessionListItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSaveEdit = async () => {
    if (onUpdate && editTitle.trim() && editTitle !== session.title) {
      await onUpdate(session.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    setShowMenu(false);
    try {
      await onDelete(session.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      onClick={() => !isEditing && !isDeleting && onClick()}
      className={cn(
        'flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 transition-colors',
        !isEditing && !isDeleting && 'cursor-pointer hover:bg-gray-50',
        isDeleting && 'opacity-50'
      )}
    >
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveEdit();
                } else if (e.key === 'Escape') {
                  setEditTitle(session.title);
                  setIsEditing(false);
                }
              }}
              className="flex-1 rounded border border-orange-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSaveEdit();
              }}
              className="rounded p-1 text-green-600 hover:bg-green-50"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditTitle(session.title);
                setIsEditing(false);
              }}
              className="rounded p-1 text-gray-600 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <h3 className="truncate text-sm font-medium text-gray-900">
              {session.title || '未命名演示'}
            </h3>
            <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
              <span>{session.latestCheckpoint?.pagesCount || 0} 页</span>
              <span>{formatRelativeTime(new Date(session.createdAt))}</span>
            </div>
          </>
        )}
      </div>

      {!isEditing && (
        <div className="relative flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {showMenu && (
            <div className="absolute right-0 top-full z-10 mt-1 w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  setIsEditing(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                重命名
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </div>
          )}
        </div>
      )}

      {isDeleting && (
        <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
      )}
    </div>
  );
}

// ============================================================================
// 本地会话卡片 (Grid View)
// ============================================================================

interface SessionGridCardProps {
  item: SlidesHistoryItem;
  onClick: () => void;
}

function SessionGridCard({ item, onClick }: SessionGridCardProps) {
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md"
    >
      <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 p-4">
        <div className="text-4xl font-bold text-gray-400/20">
          {item.targetPages}
        </div>
      </div>
      <div className="p-3">
        <h3 className="mb-2 truncate text-sm font-medium text-gray-900">
          {item.title}
        </h3>
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{item.targetPages} 页</span>
          <span>{formatRelativeTime(item.timestamp)}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 本地会话列表项 (List View)
// ============================================================================

interface SessionListItemProps {
  item: SlidesHistoryItem;
  onClick: () => void;
}

function SessionListItem({ item, onClick }: SessionListItemProps) {
  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50"
    >
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-gray-900">
          {item.title}
        </h3>
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
          <span>{item.targetPages} 页</span>
          <span>{formatRelativeTime(item.timestamp)}</span>
          {item.status === 'success' ? (
            <CheckCircle2 className="h-3 w-3 text-green-500" />
          ) : item.status === 'error' ? (
            <AlertCircle className="h-3 w-3 text-red-500" />
          ) : (
            <Clock className="h-3 w-3 text-gray-400" />
          )}
        </div>
      </div>
    </div>
  );
}
