'use client';

import {
  BookOpen,
  Bookmark,
  Cloud,
  Database,
  FileText,
  Globe,
  ImageIcon,
  Layers,
  Lock,
  MoreVertical,
  NotebookPen,
  Pencil,
  Trash2,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApiGet } from '@/hooks/core';
import type {
  KnowledgeBase,
  KnowledgeBaseStats,
} from '@/hooks/domain/useKnowledgeBase';
import {
  KB_STATUS_TOKENS,
  pickGradient,
  type KnowledgeBaseStatus,
} from '../_design/tokens';

type SourceType = KnowledgeBase['sourceType'];

interface KnowledgeBaseCardProps {
  kb: KnowledgeBase;
  /** 'personal' | 'team' — 决定可见性徽章 + 菜单项 */
  variant: 'personal' | 'team';
  /**
   * 是否拉取 RAG 嵌入进度（默认 true）。
   * 父组件如已批量加载好可设 false 后通过 statsOverride 直接传入。
   */
  loadStats?: boolean;
  /** 父组件提供的预加载统计；优先于自动拉取 */
  statsOverride?: KnowledgeBaseStats;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onManageMembers?: () => void;
}

const SOURCE_ICON: Record<string, LucideIcon> = {
  GOOGLE_DRIVE: Cloud,
  MANUAL: BookOpen,
  URL: Globe,
  NOTION: Layers,
  BOOKMARK: Bookmark,
  NOTE: NotebookPen,
  IMAGE: ImageIcon,
};

const SOURCE_LABEL: Record<string, string> = {
  GOOGLE_DRIVE: 'Google Drive',
  MANUAL: '手动上传',
  URL: 'URL 抓取',
  NOTION: 'Notion',
  BOOKMARK: '书签',
  NOTE: '笔记',
  IMAGE: '图片',
};

function getSourceTypes(kb: KnowledgeBase): SourceType[] {
  return kb.sourceTypes?.length ? kb.sourceTypes : [kb.sourceType];
}

/**
 * 统一的知识库卡片
 * - 渐变 banner（哈希驱动选色，跟 AI Research 项目卡同款）
 * - 可见性徽章（个人 / 团队）
 * - 关键指标 2~3 列（资源、文档、关联）
 * - RAG 嵌入进度条（可选）
 * - 协作者头像 + 更新时间
 */
export default function KnowledgeBaseCard({
  kb,
  variant,
  loadStats = true,
  statsOverride,
  onOpen,
  onEdit,
  onDelete,
  onManageMembers,
}: KnowledgeBaseCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // RAG 统计 — 仅当文档数 > 0 且未提供 override 时才拉取，避免空 KB 触发请求
  const docCount = kb._count?.documents ?? 0;
  const shouldFetchStats = loadStats && !statsOverride && docCount > 0;

  const { data: fetchedStats } = useApiGet<KnowledgeBaseStats>(
    shouldFetchStats ? `/rag/knowledge-bases/${kb.id}/stats` : '',
    { immediate: shouldFetchStats, deps: [kb.id, shouldFetchStats] }
  );

  const stats = statsOverride ?? fetchedStats ?? undefined;

  const gradient = pickGradient(kb.id);
  // 状态兜底：未知状态值不再崩溃
  const status =
    KB_STATUS_TOKENS[kb.status as KnowledgeBaseStatus] ??
    KB_STATUS_TOKENS.PENDING;
  const sourceTypes = getSourceTypes(kb);
  const PrimaryIcon = SOURCE_ICON[sourceTypes[0]] || Database;
  const memberCount = kb.members?.length ?? 0;
  const sourceLabel = sourceTypes.map((t) => SOURCE_LABEL[t] || t).join(' · ');

  // RAG 嵌入进度：embeddingCount / childChunkCount
  // child chunk 是嵌入的最小单位，每个 child chunk 应有 1 个 embedding
  const embeddingTotal = stats?.childChunkCount ?? 0;
  const embeddingReady = stats?.embeddingCount ?? 0;
  const embeddingPct =
    embeddingTotal > 0
      ? Math.min(100, Math.round((embeddingReady / embeddingTotal) * 100))
      : null;

  // 相对时间用 client-only 渲染，避免 SSR/CSR 水合错位
  const updatedLabel = useRelativeTime(kb.updatedAt);

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-300 ${
        menuOpen
          ? 'border-gray-200'
          : 'border-gray-100 hover:-translate-y-1 hover:border-gray-200 hover:shadow-lg'
      }`}
    >
      {/* Banner：渐变背景 + 大 icon + 可见性徽章 */}
      <button
        onClick={onOpen}
        className={`relative h-24 w-full overflow-hidden bg-gradient-to-br ${gradient.gradient}`}
        aria-label={`Open ${kb.name}`}
      >
        {/* 装饰性大图标 */}
        <div className="pointer-events-none absolute -bottom-2 -right-2 opacity-20 transition-transform duration-300 group-hover:scale-110">
          <PrimaryIcon className="h-24 w-24 text-white" strokeWidth={1.5} />
        </div>

        {/* 可见性徽章 */}
        <div className="absolute left-4 top-4">
          {variant === 'team' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              <Users className="h-3 w-3" />
              团队
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              <Lock className="h-3 w-3" />
              私有
            </span>
          )}
        </div>

        {/* 状态徽章（已就绪 / 处理中 / 错误） */}
        <div className="absolute right-12 top-4">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2 py-0.5 text-xs font-medium ${status.text} backdrop-blur-sm`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>
      </button>

      {/* 操作菜单（绝对定位在右上） */}
      <div ref={menuRef} className="absolute right-3 top-3 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="rounded-lg bg-white/90 p-1.5 text-gray-600 shadow-sm backdrop-blur-sm transition-colors hover:bg-white hover:text-gray-900"
          aria-label="More actions"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
            <button
              onClick={() => {
                setMenuOpen(false);
                onEdit();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              <Pencil className="h-4 w-4" />
              编辑
            </button>
            {variant === 'team' && onManageMembers && (
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onManageMembers();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <UserPlus className="h-4 w-4" />
                成员管理
              </button>
            )}
            <button
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              删除
            </button>
          </div>
        )}
      </div>

      {/* 内容区 */}
      <button
        onClick={onOpen}
        className="flex flex-1 flex-col px-5 pb-4 pt-4 text-left"
      >
        <h3 className="line-clamp-1 text-base font-semibold text-gray-900 group-hover:text-violet-600">
          {kb.name}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
          {sourceLabel}
        </p>

        {kb.description ? (
          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-600">
            {kb.description}
          </p>
        ) : (
          <p className="mt-3 line-clamp-2 text-sm italic text-gray-400">
            暂无描述
          </p>
        )}

        {/* 指标网格 */}
        <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-gray-50/70 px-3 py-2.5">
          <Metric icon={FileText} label="文档" value={docCount} />
          <Metric icon={Layers} label="数据源" value={sourceTypes.length} />
          {variant === 'team' ? (
            <Metric icon={Users} label="成员" value={memberCount} />
          ) : (
            <Metric
              icon={Database}
              label="状态"
              valueText={status.label}
              valueColor={status.text}
            />
          )}
        </div>

        {/* RAG 嵌入进度条（接入真实 child_chunk / embedding 统计） */}
        {embeddingPct !== null && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>RAG 嵌入</span>
              <span className="font-medium text-gray-700">
                {embeddingReady} / {embeddingTotal} · {embeddingPct}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full bg-gradient-to-r ${gradient.gradient} transition-all`}
                style={{ width: `${embeddingPct}%` }}
              />
            </div>
          </div>
        )}
      </button>

      {/* Footer：协作者 + 更新时间 */}
      <div className="flex items-center justify-between border-t border-gray-100 bg-white px-5 py-2.5">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {variant === 'team' && memberCount > 0 ? (
            <>
              <AvatarStack count={memberCount} />
              <span>{memberCount} 协作者</span>
            </>
          ) : (
            <>
              <Lock className="h-3 w-3 text-gray-400" />
              <span>仅自己可见</span>
            </>
          )}
        </div>
        {updatedLabel && (
          <span className="text-xs text-gray-400">{updatedLabel}</span>
        )}
      </div>
    </div>
  );
}

interface MetricProps {
  icon: LucideIcon;
  label: string;
  value?: number;
  valueText?: string;
  valueColor?: string;
}

function Metric({
  icon: Icon,
  label,
  value,
  valueText,
  valueColor,
}: MetricProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <Icon className="h-3.5 w-3.5 text-gray-400" />
      <span
        className={`mt-0.5 text-sm font-semibold ${valueColor || 'text-gray-900'}`}
      >
        {valueText !== undefined ? valueText : (value ?? 0)}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-gray-400">
        {label}
      </span>
    </div>
  );
}

function AvatarStack({ count }: { count: number }) {
  const display = Math.min(count, 3);
  return (
    <div className="flex -space-x-1.5">
      {Array.from({ length: display }).map((_, i) => (
        <div
          key={i}
          className="h-5 w-5 rounded-full border-2 border-white bg-gradient-to-br from-violet-400 to-purple-500"
        />
      ))}
    </div>
  );
}

/**
 * 客户端渲染的相对时间，避免 SSR/CSR 水合错位。
 * 服务端 / 首次渲染返回 null，effect 后再算出文案。
 */
function useRelativeTime(iso: string | undefined): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!iso) {
      setLabel(null);
      return;
    }
    const date = new Date(iso);
    const compute = () => {
      const diffMs = Date.now() - date.getTime();
      const mins = Math.floor(diffMs / 60000);
      const hours = Math.floor(mins / 60);
      const days = Math.floor(hours / 24);
      if (mins < 1) return '刚刚更新';
      if (mins < 60) return `${mins} 分钟前`;
      if (hours < 24) return `${hours} 小时前`;
      if (days < 30) return `${days} 天前`;
      return `${date.getMonth() + 1}/${date.getDate()}`;
    };
    setLabel(compute());
    // 1 分钟刷新一次，让"刚刚更新 → 1 分钟前"等过渡自然
    const timer = window.setInterval(() => setLabel(compute()), 60000);
    return () => window.clearInterval(timer);
  }, [iso]);
  return label;
}
