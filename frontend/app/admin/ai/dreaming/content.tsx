'use client';

/**
 * Dreaming Dashboard — PR-I 骨架 2026-05-15
 *
 * 持续反思的成果可视化（用户明确要求）。功能区：
 *   - Overview stat 卡：rules 总数 / 活跃 rules / 近 7d runs / 总 token 消耗 / 平均成功率
 *   - Tabs：History（runs 时间线）/ Rules（规则详情）/ Config（调度配置）
 *   - History tab：每条 run 卡片含 trigger / sample / 产出 / token，点击进入 run 详情 drawer
 *   - Rules tab：列表按 effectiveConfidence 排序，点击进入 rule 详情 drawer（pattern /
 *     mitigation / 来源 missions / 应用统计 / 启用-禁用 / 衰减曲线）
 *   - Config tab：cron / sampleSize / tokenBudget / enabled toggle，admin 可编辑
 *
 * 后端：/api/v1/admin/dreaming/{overview,runs,rules,config,runs/trigger}
 * 位置：/admin/ai/dreaming（与 eval/skills/knowledge 并列，AI 元学习资产）
 *
 * 实施状态：UI 骨架，数据 mock；PR-I.2-I.4 接通真实 backend：
 *   - PR-I.2：listRuns + getRunDetail 接真 DreamingRun 表
 *   - PR-I.3：listRules + getRuleDetail + disable/enable 接真 DreamingRule 表
 *   - PR-I.4：Config 编辑 + manual trigger + 衰减曲线可视化
 */

import { useState } from 'react';
import {
  Brain,
  History as HistoryIcon,
  ListChecks,
  Settings as SettingsIcon,
  Play,
  Power,
  TrendingUp,
  Clock,
  Zap,
} from 'lucide-react';
import { AdminPageLayout } from '@/components/admin/layout';

type TabKey = 'history' | 'rules' | 'config';

interface RunListItem {
  id: string;
  triggeredAt: string;
  triggerKind: 'cron' | 'failure_threshold' | 'manual';
  sampleSize: number;
  newRulesCount: number;
  rejectedCandidates: number;
  tokensUsed: number;
  durationMs: number;
  status: 'success' | 'failed';
}

interface RuleListItem {
  id: string;
  pattern: string;
  mitigation: string;
  failureCodes: string[];
  confidence: number;
  applicationCount: number;
  successCount: number;
  disabled: boolean;
  createdAt: string;
}

interface DreamingOverview {
  totalRules: number;
  activeRules: number;
  recentRunsCount: number;
  totalTokensSpent: number;
  averageSuccessRate: number;
  lastRunAt: string | null;
}

const OVERVIEW_PLACEHOLDER: DreamingOverview = {
  totalRules: 0,
  activeRules: 0,
  recentRunsCount: 0,
  totalTokensSpent: 0,
  averageSuccessRate: 0,
  lastRunAt: null,
};

export default function DreamingDashboardContent() {
  const [activeTab, setActiveTab] = useState<TabKey>('history');
  const [overview] = useState<DreamingOverview>(OVERVIEW_PLACEHOLDER);
  const [runs] = useState<RunListItem[]>([]);
  const [rules] = useState<RuleListItem[]>([]);

  return (
    <AdminPageLayout
      title="Dreaming · 持续反思"
      description="跨 mission 周期反思失败规律，归纳通用规则注入下轮 mission。Anthropic Managed Agent 同款元学习机制（骨架阶段，PR-I.2-I.4 实施中）。"
      icon={Brain}
    >
      {/* Overview stat 卡 */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          icon={ListChecks}
          label="规则总数"
          value={overview.totalRules}
          hint={`活跃 ${overview.activeRules}`}
        />
        <StatCard
          icon={HistoryIcon}
          label="近 7 天 runs"
          value={overview.recentRunsCount}
          hint={
            overview.lastRunAt
              ? `最近 ${formatRelative(overview.lastRunAt)}`
              : '暂无'
          }
        />
        <StatCard
          icon={Zap}
          label="总 token 消耗"
          value={formatTokens(overview.totalTokensSpent)}
        />
        <StatCard
          icon={TrendingUp}
          label="平均成功率"
          value={`${Math.round(overview.averageSuccessRate * 100)}%`}
          hint="规则应用后 mission 改善比例"
        />
        <button
          type="button"
          className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 p-3 text-sm text-gray-600 transition hover:border-blue-400 hover:text-blue-600"
          onClick={() => {
            // PR-I.4 接通 manual trigger
          }}
        >
          <Play className="mb-1 h-5 w-5" />
          手动触发反思
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        <TabButton
          active={activeTab === 'history'}
          onClick={() => setActiveTab('history')}
        >
          <HistoryIcon className="h-4 w-4" /> 历史
        </TabButton>
        <TabButton
          active={activeTab === 'rules'}
          onClick={() => setActiveTab('rules')}
        >
          <ListChecks className="h-4 w-4" /> 规则
        </TabButton>
        <TabButton
          active={activeTab === 'config'}
          onClick={() => setActiveTab('config')}
        >
          <SettingsIcon className="h-4 w-4" /> 配置
        </TabButton>
      </div>

      {/* Tab content */}
      {activeTab === 'history' && <HistoryTab runs={runs} />}
      {activeTab === 'rules' && <RulesTab rules={rules} />}
      {activeTab === 'config' && <ConfigTab />}
    </AdminPageLayout>
  );
}

// ─── Tab: History（持续反思时间线）────────────────────────────────────────

function HistoryTab({ runs }: { runs: RunListItem[] }) {
  if (runs.length === 0) {
    return (
      <EmptyState
        title="暂无反思历史"
        description="PR-I.2 落地 cron 调度后，每 6h 一轮反思 mission 将在此呈现。当前可手动触发。"
      />
    );
  }
  return (
    <ul className="space-y-2">
      {runs.map((run) => (
        <li
          key={run.id}
          className="cursor-pointer rounded-lg border border-gray-200 p-3 transition hover:border-blue-300 hover:bg-blue-50/30"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900">
              {formatTime(run.triggeredAt)} · {triggerLabel(run.triggerKind)}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                run.status === 'success'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {run.status === 'success' ? '成功' : '失败'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs text-gray-500">
            <span>抽样 {run.sampleSize} 个 mission</span>
            <span>
              新规则 {run.newRulesCount} / 拒 {run.rejectedCandidates}
            </span>
            <span>{formatTokens(run.tokensUsed)} token</span>
            <span>{Math.round(run.durationMs / 1000)}s</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Tab: Rules（规则详情）────────────────────────────────────────────────

function RulesTab({ rules }: { rules: RuleListItem[] }) {
  if (rules.length === 0) {
    return (
      <EmptyState
        title="暂无规则"
        description="PR-I.2 抽样 + critique-agent 归纳后生成的规则将在此列出。每条规则含 pattern / mitigation / 来源 mission / 应用统计与衰减曲线。"
      />
    );
  }
  return (
    <ul className="space-y-2">
      {rules.map((rule) => (
        <li
          key={rule.id}
          className={`cursor-pointer rounded-lg border p-3 transition hover:border-blue-300 ${
            rule.disabled
              ? 'border-gray-200 bg-gray-50 opacity-60'
              : 'border-gray-200 bg-white'
          }`}
        >
          <div className="mb-2 flex items-start justify-between">
            <div className="flex-1">
              <p className="mb-1 text-sm font-medium text-gray-900">
                {rule.pattern}
              </p>
              <p className="text-xs text-gray-600">{rule.mitigation}</p>
            </div>
            <button
              type="button"
              className={`ml-2 rounded border px-2 py-1 text-xs ${
                rule.disabled
                  ? 'border-green-300 text-green-700 hover:bg-green-50'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                // PR-I.3 接通 disable/enable
              }}
            >
              <Power className="mr-1 inline h-3 w-3" />
              {rule.disabled ? '启用' : '禁用'}
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatRelative(rule.createdAt)}
            </span>
            <span>
              应用 {rule.applicationCount} 次 · 成功 {rule.successCount} 次
              {rule.applicationCount > 0 && (
                <span className="ml-1">
                  （
                  {Math.round(
                    (rule.successCount / rule.applicationCount) * 100
                  )}
                  %）
                </span>
              )}
            </span>
            <span>置信度 {Math.round(rule.confidence * 100)}%</span>
            {rule.failureCodes.length > 0 && (
              <span className="flex flex-wrap gap-1">
                {rule.failureCodes.slice(0, 3).map((code) => (
                  <span
                    key={code}
                    className="rounded bg-gray-100 px-1.5 py-0.5"
                  >
                    {code}
                  </span>
                ))}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Tab: Config ──────────────────────────────────────────────────────────

function ConfigTab() {
  return (
    <div className="max-w-2xl rounded-lg border border-gray-200 bg-white p-4">
      <p className="mb-4 text-sm text-gray-600">
        Dreaming 调度配置。PR-I.4 接通后可在线编辑。
      </p>
      <dl className="space-y-3 text-sm">
        <ConfigRow label="Cron 表达式" value="0 */6 * * *" hint="每 6 小时" />
        <ConfigRow label="抽样窗口" value="24 小时" />
        <ConfigRow label="抽样上限" value="20 mission/轮" />
        <ConfigRow label="单轮 token 预算" value="50,000" />
        <ConfigRow label="状态" value="启用" hint="enabled=true" />
      </dl>
    </div>
  );
}

// ─── Reusable bits ─────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Brain;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition ${
        active
          ? 'border-blue-600 font-medium text-blue-600'
          : 'border-transparent text-gray-600 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center">
      <Brain className="mx-auto mb-2 h-10 w-10 text-gray-300" />
      <p className="mb-1 text-sm font-medium text-gray-700">{title}</p>
      <p className="mx-auto max-w-md text-xs text-gray-500">{description}</p>
    </div>
  );
}

function ConfigRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-gray-100 pb-2">
      <dt className="min-w-[140px] text-gray-600">{label}</dt>
      <dd className="text-right font-medium text-gray-900">
        {value}
        {hint && <span className="ml-2 text-xs text-gray-400">{hint}</span>}
      </dd>
    </div>
  );
}

// ─── Formatters ────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return '刚刚';
  if (hours < 24) return `${hours}h 前`;
  return `${Math.floor(hours / 24)}d 前`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function triggerLabel(kind: 'cron' | 'failure_threshold' | 'manual'): string {
  if (kind === 'cron') return '定时';
  if (kind === 'failure_threshold') return '失败触发';
  return '手动';
}
