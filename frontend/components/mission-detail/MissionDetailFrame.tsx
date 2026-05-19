'use client';

/**
 * MissionDetailFrame — AI Agent Team mission 详情页统一外壳
 *
 * 三个 domain（ai-social / agent-playground / ai-radar）共享相同的信息架构：
 *   Header  : [← back] [品牌 icon] 标题 + meta · [status pill] [actions slot]
 *   Body    :
 *     Left  : 360px 可折叠 panel（TeamRoster / RadarTeam / ... 由调用方注入）
 *     Right : flex-1 tab bar + tab content（由调用方注入）
 *
 * 设计原则：
 *   - Frame 只接管外层布局，不知道任何 domain 业务
 *   - 调用方保留自己的 state、handler、modal、drawer
 *   - children 就是 active tab 当前应该渲染的内容（外部 switch）
 *
 * 关于"Playground 能力不丢失"：本 Frame 仅替换页面顶层 wrap div + header
 * + tab bar + left/right grid 的视觉容器；所有现有 panel、modal、drawer、
 * artifact viewer 都通过 leftPanel / headerActions / children 等 slot 原样
 * 注入，page 自己的逻辑 0 改动。
 */

import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/common';

const ArrowLeftIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 19l-7-7m0 0l7-7m-7 7h18"
    />
  </svg>
);

export interface MissionDetailFrameTab<TKey extends string = string> {
  key: TKey;
  label: string;
  Icon: LucideIcon;
}

export interface MissionDetailFrameProps<TTab extends string = string> {
  // ── Back navigation ──────────────────────────────────────────────
  onBack: () => void;
  backTitle?: string;

  // ── Header brand zone（左侧 icon + title） ───────────────────────
  /** Tailwind gradient classes, e.g. "from-rose-500 to-pink-600" */
  brandGradient: string;
  HeaderIcon: LucideIcon;
  title: React.ReactNode;
  /** 标题下方一行小字（mission id / platforms / topic 等） */
  subtitle?: React.ReactNode;

  // ── Header right zone（status + actions） ────────────────────────
  /** Status pill — 已渲染好的 ReactNode，可包含 icon + label */
  statusPill?: React.ReactNode;
  /** 主操作按钮区（发布到草稿箱 / 重试 / 取消 / 重跑 / ...） */
  headerActions?: React.ReactNode;

  // ── Tab bar ──────────────────────────────────────────────────────
  tabs: MissionDetailFrameTab<TTab>[];
  activeTab: TTab;
  onTabChange: (key: TTab) => void;
  /** 品牌色（active tab 下划线 + 文字色），默认 rose-500 */
  tabActiveColor?: string;

  // ── Left panel（可折叠） ────────────────────────────────────────
  leftPanel: React.ReactNode;
  leftCollapsed: boolean;
  onLeftCollapseToggle: () => void;
  /** 默认 360px，可调（radar 用了 360） */
  leftWidth?: string;
  /** 可选：折叠态自定义视图（playground 装饰性折叠：垂直 "Team" 文字 + 运行指示器） */
  leftCollapsedView?: React.ReactNode;

  // ── Right content（外部按 activeTab 决定渲染什么） ──────────────
  children: React.ReactNode;

  // ── Optional slots（playground 等 domain 独有 UI） ──────────────
  /** 在 tab bar 之上、Right panel 顶部的横幅容器（WS 失联 / 失败警告 banner 等） */
  topBanner?: React.ReactNode;
  /** tab bar 右侧附加内容（CompactMeters 等紧凑指标条） */
  tabBarTrailing?: React.ReactNode;

  // ── 容器自定义 ──────────────────────────────────────────────────
  className?: string;
}

export function MissionDetailFrame<TTab extends string = string>({
  onBack,
  backTitle = '返回',
  brandGradient,
  HeaderIcon,
  title,
  subtitle,
  statusPill,
  headerActions,
  tabs,
  activeTab,
  onTabChange,
  tabActiveColor = 'border-rose-500 text-rose-600',
  leftPanel,
  leftCollapsed,
  onLeftCollapseToggle,
  leftWidth = 'w-[360px]',
  leftCollapsedView,
  children,
  topBanner,
  tabBarTrailing,
  className,
}: MissionDetailFrameProps<TTab>) {
  return (
    <div className={cn('flex min-h-0 flex-1 flex-col bg-gray-50', className)}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            title={backTitle}
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>

          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-md',
                brandGradient
              )}
            >
              <HeaderIcon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="max-w-[320px] truncate text-base font-bold text-gray-900 sm:max-w-[480px]">
                {title}
              </h1>
              {subtitle && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {subtitle}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {statusPill}
          {headerActions}
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — 折叠态/展开态都直接渲染（playground 折叠态用 w-12 装饰性视图） */}
        <aside
          className={cn(
            'flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white transition-all duration-300',
            leftCollapsed
              ? leftCollapsedView
                ? 'w-12'
                : 'w-0 overflow-hidden'
              : leftWidth
          )}
        >
          {leftCollapsed ? leftCollapsedView : leftPanel}
        </aside>

        {/* Collapse toggle — 仅展开态显示（折叠态由 leftCollapsedView 内部自己提供 expand button，标杆 playground 行为） */}
        {!leftCollapsed && (
          <button
            type="button"
            onClick={onLeftCollapseToggle}
            className="relative z-10 flex w-5 shrink-0 items-center justify-center border-r border-gray-200 bg-white hover:bg-gray-50"
            title="收起左侧"
          >
            <ChevronLeft className="h-4 w-4 text-gray-400" />
          </button>
        )}

        {/* Right panel — banners + tabs + content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* topBanner slot — playground 用作 WS 失联 / 失败警告 banner */}
          {topBanner}

          {/* Tab bar + trailing slot */}
          <div className="flex min-w-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
            <div className="scrollbar-thin flex min-w-0 flex-1 overflow-x-auto">
              {tabs.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onTabChange(key)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                    activeTab === key
                      ? tabActiveColor
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            {tabBarTrailing && <div className="shrink-0">{tabBarTrailing}</div>}
          </div>

          {/* Tab content slot */}
          <div className="flex-1 overflow-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}
