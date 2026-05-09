'use client';

import { BookOpen, FileSearch, GitMerge, Sparkles } from 'lucide-react';

/**
 * Wiki Tab placeholder — v1.5.3 P3a first wave.
 *
 * Renders the Wiki tab landing surface with a brand-aligned hero plus a
 * three-card preview of the imminent Wiki product surface (sub-header / KB
 * selector, Diff review, Lint findings). Backend services for these
 * capabilities are already shipped (page CRUD + ingest + diff apply +
 * query inline + lint 5 types); the full UI lands in P3a follow-up
 * iterations (Wiki sub-header, three-pane layout, Diff review modal,
 * Lint drawer, Log drawer, Query panel, Export integration) and P3b
 * (empty-state funnel, KB selector 5-step resolution, URL state
 * machine, legacy-default toggle, LibraryHeader search isolation).
 *
 * Visual style follows existing Library design tokens: neutral gray base,
 * violet-500 indicator, lucide-react icons, no new component library.
 */
export default function WikiTabPlaceholder() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="rounded-2xl border border-gray-200 bg-white p-10 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 text-white">
            <BookOpen className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Wiki</h1>
            <p className="mt-1 text-sm text-gray-500">
              基于 Karpathy LLM Wiki 模式的持续编译知识库 · Library 主形态
            </p>
          </div>
        </div>

        <p className="mt-6 max-w-3xl text-sm leading-6 text-gray-600">
          Wiki 把上传的原始文档持续编译为 markdown 形式的实体页 / 概念页 /
          总结页，跨页通过{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-violet-700">
            [[slug]]
          </code>{' '}
          引用相互连接。LLM 提议变更，用户逐项审阅 / 应用 / 撤销，所有改动留
          revision 快照可回滚；STALE / 矛盾 / 数据缺口由后台 lint 持续巡检。
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <FeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Ingest 与 Diff 审阅"
            description="LLM 从原始文档编译 wiki 提议；用户逐项 apply / dismiss，所有写入走 Serializable 事务 + revision 快照。"
            statusLabel="后端已实现"
          />
          <FeatureCard
            icon={<GitMerge className="h-5 w-5" />}
            title="Page Lint 5 类"
            description="ORPHAN / MISSING_XREF 纯 SQL 即时；STALE / CONTRADICTION / DATA_GAP 调 ai-engine 一致性原语，按 KB 日预算限速。"
            statusLabel="后端已实现"
          />
          <FeatureCard
            icon={<FileSearch className="h-5 w-5" />}
            title="Query 双分支"
            description="≤ 200 页直接长 context 喂；超阈值切 RAG 选页（ONELINER embedding 检索后选中页全文喂）。"
            statusLabel="后端已实现"
          />
        </div>

        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm leading-6 text-amber-800">
            <strong>P3a 实施进行中</strong>：完整 Wiki UI（KB selector 子
            header、三栏阅读 / 编辑视图、Diff 审阅页、Lint Drawer、Log
            Drawer、Query 浮动面板、Export 集成、空态 onboarding 与 5 级 KB
            解析）将在后续 P3a / P3b 迭代上线。后端 16 个 endpoint 已可
            直连测试（详见 <code>backend/src/modules/ai-app/library/wiki</code>
            ）。
          </p>
        </div>
      </div>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  statusLabel: string;
}

function FeatureCard({
  icon,
  title,
  description,
  statusLabel,
}: FeatureCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="flex items-center gap-2 text-violet-600">
        {icon}
        <span className="text-sm font-semibold text-gray-900">{title}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-gray-600">{description}</p>
      <div className="mt-4 inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
        {statusLabel}
      </div>
    </div>
  );
}
