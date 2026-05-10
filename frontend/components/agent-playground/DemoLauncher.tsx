'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';
import {
  runTeam,
  type AudienceProfile,
  type AuditLayers,
  type BudgetProfile,
  type LengthProfile,
  type RunMissionInput,
  type SearchTimeRange,
  type StyleProfile,
} from '@/services/agent-playground/api';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  Eye,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { KnowledgeBaseSelector } from '@/components/common/selectors';

const DEPTH_OPTIONS: Array<{
  value: RunMissionInput['depth'];
  label: string;
  hint: string;
}> = [
  { value: 'quick', label: '快速', hint: '3-5 维度，适合快速判断' },
  { value: 'standard', label: '标准', hint: '5-8 维度，适合常规策略分析' },
  { value: 'deep', label: '深度', hint: '10-12 维度，适合完整洞察' },
];

const BUDGET_OPTIONS: Array<{
  value: BudgetProfile;
  label: string;
  hint: string;
}> = [
  { value: 'low', label: '低', hint: '适合试跑与快速比对' },
  { value: 'medium', label: '中', hint: '默认配置，性价比最佳' },
  { value: 'high', label: '高', hint: '更充分的工具搜索和反思轮次' },
  { value: 'unlimited', label: '不限', hint: '仅适用于 BYOK 场景' },
];

const SEARCH_TIME_RANGE_OPTIONS: Array<{
  value: SearchTimeRange;
  label: string;
  hint: string;
}> = [
  { value: '30d', label: '1 个月', hint: '适合追踪最新变化' },
  { value: '90d', label: '3 个月', hint: '适合季节性和短周期观察' },
  { value: '180d', label: '6 个月', hint: '适合半年内竞争格局' },
  { value: '365d', label: '12 个月', hint: '默认窗口，兼顾新近与完整' },
  { value: '730d', label: '24 个月', hint: '适合含基础背景的行业分析' },
  { value: 'all', label: '不限', hint: '不过滤时间，但仍优先近期材料' },
];

const SAMPLE_TOPICS = [
  '2026 Q2 AI Agent 市场格局与竞争力变化',
  '全球存储芯片供需拐点与主要厂商策略',
  '开源 AI 框架 LangGraph / AutoGen / CrewAI 的企业落地差异',
  '生成式 AI 在金融风控场景的最新成熟度评估',
];

function loadPref<T extends string>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  return (localStorage.getItem(`playground:${key}`) as T | null) ?? fallback;
}

function persistPref(key: string, value: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`playground:${key}`, value);
  }
}

function estimateDepthMultiplier(depth: RunMissionInput['depth']) {
  return depth === 'quick' ? 0.4 : depth === 'standard' ? 0.7 : 1;
}

function getRangeLabel(value: SearchTimeRange) {
  return SEARCH_TIME_RANGE_OPTIONS.find((option) => option.value === value)
    ?.label;
}

export function DemoLauncher() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initTopic = searchParams?.get('topic') ?? '';
  const initDepth = (searchParams?.get('depth') ??
    'deep') as RunMissionInput['depth'];
  const initLang = (searchParams?.get('language') ??
    'zh-CN') as RunMissionInput['language'];

  const [topic, setTopic] = useState(initTopic);
  const [depth, setDepth] = useState<RunMissionInput['depth']>(() => {
    if (typeof window !== 'undefined') {
      const urlVal = searchParams?.get('depth');
      if (urlVal && ['quick', 'standard', 'deep'].includes(urlVal)) {
        return urlVal as RunMissionInput['depth'];
      }
      const stored = localStorage.getItem('playground:depth');
      if (stored && ['quick', 'standard', 'deep'].includes(stored)) {
        return stored as RunMissionInput['depth'];
      }
    }
    return 'deep';
  });
  const [language, setLanguage] = useState<RunMissionInput['language']>(
    initLang === 'en-US' ? 'en-US' : 'zh-CN'
  );
  const [budgetProfile, setBudgetProfile] = useState<BudgetProfile>(() =>
    loadPref('budgetProfile', 'medium' as BudgetProfile)
  );
  const [styleProfile, setStyleProfile] = useState<StyleProfile>(() =>
    loadPref('styleProfile', 'executive' as StyleProfile)
  );
  const [lengthProfile, setLengthProfile] = useState<LengthProfile>(() =>
    loadPref('lengthProfile', 'standard' as LengthProfile)
  );
  const [audienceProfile, setAudienceProfile] = useState<AudienceProfile>(() =>
    loadPref('audienceProfile', 'domain-expert' as AudienceProfile)
  );
  const [withFigures, setWithFigures] = useState(() =>
    typeof window === 'undefined'
      ? true
      : localStorage.getItem('playground:withFigures') !== '0'
  );
  const [auditLayers, setAuditLayers] = useState<AuditLayers>(() =>
    loadPref('auditLayers', 'default' as AuditLayers)
  );
  const [searchTimeRange, setSearchTimeRange] = useState<SearchTimeRange>(() =>
    loadPref('searchTimeRange', '365d' as SearchTimeRange)
  );
  const [selectedKnowledgeBaseIds, setSelectedKnowledgeBaseIds] = useState<
    string[]
  >(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('playground:knowledgeBaseIds');
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === 'string')
        : [];
    } catch {
      return [];
    }
  });
  const [advanced, setAdvanced] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('playground:advanced-open') === '1';
    }
    return false;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function estimateTokens(): number {
    const base = 400;
    const depthMul = estimateDepthMultiplier(depth);
    const lenMul =
      lengthProfile === 'brief'
        ? 0.5
        : lengthProfile === 'standard'
          ? 1
          : lengthProfile === 'deep'
            ? 1.7
            : 2.5;
    const budgetMul =
      budgetProfile === 'low'
        ? 0.5
        : budgetProfile === 'medium'
          ? 1
          : budgetProfile === 'high'
            ? 2
            : 4;
    const auditMul =
      auditLayers === 'minimal'
        ? 0.7
        : auditLayers === 'thorough'
          ? 1.5
          : auditLayers === 'thorough+'
            ? 2.5
            : 1;
    const figMul = withFigures ? 1.15 : 1;
    return Math.round(base * depthMul * lenMul * budgetMul * auditMul * figMul);
  }

  function estimateCost(): string {
    return (estimateTokens() * 0.002).toFixed(2);
  }

  function estimateMinutes(): string {
    const tokens = estimateTokens();
    const minutes = Math.min(60, Math.max(2, Math.round(tokens / 60)));
    return `${minutes}-${Math.min(60, minutes + 3)}`;
  }

  const isCustomProfile =
    depth !== 'deep' ||
    budgetProfile !== 'medium' ||
    styleProfile !== 'executive' ||
    lengthProfile !== 'standard' ||
    audienceProfile !== 'domain-expert' ||
    !withFigures ||
    auditLayers !== 'default' ||
    searchTimeRange !== '365d';

  function resetDefaults() {
    setDepth('deep');
    setBudgetProfile('medium');
    setStyleProfile('executive');
    setLengthProfile('standard');
    setAudienceProfile('domain-expert');
    setWithFigures(true);
    setAuditLayers('default');
    setSearchTimeRange('365d');
    if (typeof window !== 'undefined') {
      [
        'depth',
        'budgetProfile',
        'styleProfile',
        'lengthProfile',
        'audienceProfile',
        'withFigures',
        'auditLayers',
        'searchTimeRange',
      ].forEach((key) => localStorage.removeItem(`playground:${key}`));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = topic.trim();
    if (!trimmed || submitting) return;
    if (trimmed.length < 4) {
      setError('Topic 至少 4 个字符');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const estimatedTokens = estimateTokens();
      const maxCredits = Math.max(50, Math.round(estimatedTokens * 1.5));
      const budgetMul =
        budgetProfile === 'low'
          ? 0.6
          : budgetProfile === 'medium'
            ? 1.0
            : budgetProfile === 'high'
              ? 2.0
              : 4.0;
      const depthMul =
        depth === 'quick' ? 0.7 : depth === 'standard' ? 1.0 : 1.4;
      const budgetMultiplierOverride = +(budgetMul * depthMul).toFixed(2);

      const { missionId } = await runTeam({
        topic: trimmed,
        depth,
        language,
        budgetProfile,
        styleProfile,
        lengthProfile,
        audienceProfile,
        withFigures,
        auditLayers,
        searchTimeRange,
        maxCredits,
        budgetMultiplierOverride,
        knowledgeBaseIds:
          selectedKnowledgeBaseIds.length > 0
            ? selectedKnowledgeBaseIds
            : undefined,
      });
      if (!missionId || missionId === 'undefined') {
        throw new Error('Server did not return a missionId');
      }
      setTopic('');
      router.push(`/agent-playground/team/${missionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="space-y-6"
    >
      <section className="rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_-40px_rgba(15,23,42,0.35)]">
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700">
            Mission Brief
          </div>
          <div className="mt-4 grid gap-5 lg:grid-cols-[1.6fr_0.9fr]">
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900">
                  研究话题
                </label>
                <div className="relative">
                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder={
                      t('playground.researchTeam.topicPlaceholder') ||
                      '例如：2026 Q2 AI Agent 市场格局与主要厂商竞争力变化'
                    }
                    className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-4 pr-16 text-sm leading-6 text-slate-900 outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    maxLength={200}
                    required
                  />
                  {topic.length > 0 && (
                    <span
                      className={`absolute bottom-4 right-4 text-[11px] ${topic.length > 180 ? 'text-amber-600' : 'text-slate-400'}`}
                    >
                      {topic.length}/200
                    </span>
                  )}
                </div>
              </div>

              {!topic && (
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_TOPICS.map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setTopic(sample)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                配置摘要
              </p>
              <div className="mt-4 space-y-3">
                <SummaryRow
                  Icon={Clock3}
                  label="搜索时效"
                  value={getRangeLabel(searchTimeRange) ?? '12 个月'}
                />
                <SummaryRow
                  Icon={ShieldCheck}
                  label="审核深度"
                  value={
                    auditLayers === 'minimal'
                      ? '最简'
                      : auditLayers === 'default'
                        ? '标准'
                        : auditLayers === 'thorough'
                          ? '完整'
                          : '全审'
                  }
                />
                <SummaryRow
                  Icon={Database}
                  label="知识源"
                  value={
                    selectedKnowledgeBaseIds.length > 0
                      ? `${selectedKnowledgeBaseIds.length} 个知识库 + web`
                      : '纯 web-search'
                  }
                />
                <SummaryRow
                  Icon={Wallet}
                  label="预算预估"
                  value={`~${estimateTokens()}K tokens / $${estimateCost()}`}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <section className="space-y-3">
              <SectionHeader
                title="核心配置"
                description="控制研究深度、输出语言和预算强度。"
              />
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="研究深度">
                  <select
                    value={depth}
                    onChange={(e) => {
                      const value = e.target.value as RunMissionInput['depth'];
                      setDepth(value);
                      persistPref('depth', value);
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  >
                    {DEPTH_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} · {option.hint}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="输出语言">
                  <select
                    value={language}
                    onChange={(e) =>
                      setLanguage(e.target.value as RunMissionInput['language'])
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="zh-CN">中文</option>
                    <option value="en-US">English</option>
                  </select>
                </Field>
                <Field label="预算档位">
                  <select
                    value={budgetProfile}
                    onChange={(e) => {
                      const value = e.target.value as BudgetProfile;
                      setBudgetProfile(value);
                      persistPref('budgetProfile', value);
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  >
                    {BUDGET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} · {option.hint}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </section>

            <section className="space-y-3">
              <SectionHeader
                title="搜索时效"
                description="该参数会结构化传入 mission、prompt 和搜索工具，而不是只拼接 query。"
              />
              <div className="grid gap-3 md:grid-cols-3">
                {SEARCH_TIME_RANGE_OPTIONS.map((option) => {
                  const active = searchTimeRange === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setSearchTimeRange(option.value);
                        persistPref('searchTimeRange', option.value);
                      }}
                      className={`rounded-2xl border px-4 py-4 text-left transition ${
                        active
                          ? 'border-blue-500 bg-blue-50 shadow-[0_12px_30px_-20px_rgba(59,130,246,0.65)]'
                          : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p
                            className={`text-sm font-semibold ${active ? 'text-blue-900' : 'text-slate-900'}`}
                          >
                            {option.label}
                          </p>
                          <p
                            className={`mt-1 text-xs leading-5 ${active ? 'text-blue-700' : 'text-slate-500'}`}
                          >
                            {option.hint}
                          </p>
                        </div>
                        {active && (
                          <span className="rounded-full bg-blue-600 p-1 text-white">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <SectionHeader
                title="知识源"
                description="如选择知识库，研究员会先做 KB 召回，再补 web-search。"
              />
              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <KnowledgeBaseSelector
                  selectedIds={selectedKnowledgeBaseIds}
                  onSelectionChange={(ids) => {
                    setSelectedKnowledgeBaseIds(ids);
                    if (typeof window !== 'undefined') {
                      localStorage.setItem(
                        'playground:knowledgeBaseIds',
                        JSON.stringify(ids)
                      );
                    }
                  }}
                  multiple
                  maxSelections={10}
                  filterType="ALL"
                  onlyReady
                />
                <div className="mt-3 flex items-start gap-2 rounded-2xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
                  <Search className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                  <span>
                    不选知识库时默认全量使用 web-search；选择知识库后，mission 会优先吸收本地材料，再用外部搜索补齐缺口。
                  </span>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              <SectionHeader
                title="输出控制"
                description="控制报告风格、长度、受众和审核强度。"
              />
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="审核层级">
                    <select
                      value={auditLayers}
                      onChange={(e) => {
                        const value = e.target.value as AuditLayers;
                        setAuditLayers(value);
                        persistPref('auditLayers', value);
                      }}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    >
                      <option value="minimal">最简 · 仅基础结构校验</option>
                      <option value="default">标准 · 默认生产配置</option>
                      <option value="thorough">完整 · 增加反思与复核</option>
                      <option value="thorough+">全审 · 成本最高</option>
                    </select>
                  </Field>
                  <Field label="图文并茂">
                    <label className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900">
                      <input
                        type="checkbox"
                        checked={withFigures}
                        onChange={(e) => {
                          setWithFigures(e.target.checked);
                          persistPref(
                            'withFigures',
                            e.target.checked ? '1' : '0'
                          );
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <p className="font-medium">启用</p>
                        <p className="text-xs text-slate-500">
                          图片仅允许来自真实引用，不使用 AI 生成图
                        </p>
                      </div>
                    </label>
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !advanced;
                    setAdvanced(next);
                    if (typeof window !== 'undefined') {
                      localStorage.setItem(
                        'playground:advanced-open',
                        next ? '1' : '0'
                      );
                    }
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50/40"
                >
                  <span>高级输出设置</span>
                  {advanced ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                {advanced && (
                  <div className="grid gap-4">
                    <Field label="文风">
                      <select
                        value={styleProfile}
                        onChange={(e) => {
                          const value = e.target.value as StyleProfile;
                          setStyleProfile(value);
                          persistPref('styleProfile', value);
                        }}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="executive">executive · 管理层简报</option>
                        <option value="academic">academic · 学术论证</option>
                        <option value="journalistic">journalistic · 新闻型</option>
                        <option value="technical">technical · 技术型</option>
                      </select>
                    </Field>
                    <Field label="长度档位">
                      <select
                        value={lengthProfile}
                        onChange={(e) => {
                          const value = e.target.value as LengthProfile;
                          setLengthProfile(value);
                          persistPref('lengthProfile', value);
                        }}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="brief">brief · 3K</option>
                        <option value="standard">standard · 8K</option>
                        <option value="deep">deep · 15K</option>
                        <option value="extended">extended · 25K</option>
                      </select>
                    </Field>
                    <Field label="主要受众">
                      <select
                        value={audienceProfile}
                        onChange={(e) => {
                          const value = e.target.value as AudienceProfile;
                          setAudienceProfile(value);
                          persistPref('audienceProfile', value);
                        }}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="domain-expert">
                          domain-expert · 专家
                        </option>
                        <option value="executive">executive · 管理层</option>
                        <option value="general-public">
                          general-public · 大众
                        </option>
                      </select>
                    </Field>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-blue-100 bg-[linear-gradient(180deg,rgba(239,246,255,0.88),rgba(248,250,252,0.96))] p-4">
              <SectionHeader
                title="运行预估"
                description="基于当前配置推算的工作量、预算和交付节奏。"
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MetricCard label="Tokens" value={`~${estimateTokens()}K`} />
                <MetricCard label="成本" value={`~$${estimateCost()}`} />
                <MetricCard label="时长" value={`${estimateMinutes()} 分钟`} />
                <MetricCard
                  label="模式"
                  value={
                    selectedKnowledgeBaseIds.length > 0 ? 'KB + Web' : 'Web'
                  }
                />
              </div>
              <div className="mt-4 space-y-2 rounded-2xl border border-blue-100 bg-white/80 p-4 text-xs leading-5 text-slate-600">
                <HintRow
                  Icon={Search}
                  text={`搜索阶段将统一携带 ${getRangeLabel(searchTimeRange)} 的时效约束。`}
                />
                <HintRow
                  Icon={Eye}
                  text={
                    audienceProfile === 'executive'
                      ? '高管受众会提升表达压缩度与复审要求。'
                      : '领域专家受众会保留更多证据、术语和比较维度。'
                  }
                />
                <HintRow
                  Icon={ShieldCheck}
                  text={
                    auditLayers === 'thorough+'
                      ? '当前为最高审核档位，最重但最稳。'
                      : '默认档位兼顾清晰度、成本和交付速度。'
                  }
                />
              </div>
            </section>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/70 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200">
              真实 LLM + 真实工具 + 实时 WebSocket 进度
            </span>
            {isCustomProfile && (
              <button
                type="button"
                onClick={resetDefaults}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
              >
                恢复默认配置
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={submitting || !topic.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-22px_rgba(37,99,235,0.7)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                启动中…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                启动研究团队
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </form>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function SummaryRow({
  Icon,
  label,
  value,
}: {
  Icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-3 ring-1 ring-slate-200">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {label}
        </p>
        <p className="truncate text-sm font-medium text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function HintRow({
  Icon,
  text,
}: {
  Icon: typeof Search;
  text: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
      <span>{text}</span>
    </div>
  );
}
