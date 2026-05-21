'use client';

/**
 * PlaygroundMissionDialog
 *
 * Playground 创建 Mission 的精简对话框（替代旧的全页 DemoLauncher）。
 * 视觉上对齐 Topic Insight CreateTopicDialog —— 走 MissionDialogShell 共用壳子，
 * 必填只保留：话题 / 深度 / 语言 / 预算；其余进 advanced 折叠。
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
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
import { KnowledgeBaseSelector } from '@/components/common/selectors';
import { MissionDialogShell } from '@/components/common/dialogs/MissionDialogShell';
import {
  BudgetAndTimeLimitPanel,
  MAX_CREDITS_LIMIT,
  MULTIPLIER_LIMIT,
  WALL_TIME_LIMIT_MINUTES,
} from '@/components/agent-playground/panels/BudgetAndTimeLimitPanel';

interface PlaygroundMissionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** 创建成功后回调，参数是新 mission id */
  onCreated?: (missionId: string) => void;
}

const DEPTH_OPTIONS: Array<{
  value: RunMissionInput['depth'];
  label: string;
  hint: string;
}> = [
  { value: 'quick', label: '快速', hint: '3-5 维度' },
  { value: 'standard', label: '标准', hint: '5-8 维度' },
  { value: 'deep', label: '深度', hint: '10-12 维度' },
];

const BUDGET_OPTIONS: Array<{
  value: BudgetProfile;
  label: string;
}> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'unlimited', label: '不限' },
];

const TIME_RANGE_OPTIONS: Array<{
  value: SearchTimeRange;
  label: string;
}> = [
  { value: '30d', label: '1 月' },
  { value: '90d', label: '3 月' },
  { value: '180d', label: '6 月' },
  { value: '365d', label: '12 月' },
  { value: '730d', label: '24 月' },
  { value: 'all', label: '不限' },
];

const AUDIT_OPTIONS: Array<{
  value: AuditLayers;
  label: string;
}> = [
  { value: 'minimal', label: '最简' },
  { value: 'default', label: '标准' },
  { value: 'thorough', label: '完整' },
  { value: 'thorough+', label: '全审' },
];

const SAMPLE_TOPICS = [
  '2026 Q2 AI Agent 市场格局与竞争力变化',
  '全球存储芯片供需拐点与主要厂商策略',
  '生成式 AI 在金融风控场景的最新成熟度评估',
];

function loadPref<T extends string>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  return (localStorage.getItem(`playground:${key}`) as T | null) ?? fallback;
}

function loadPrefNum(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = localStorage.getItem(`playground:${key}`);
  if (raw == null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function persistPref(key: string, value: string | number) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`playground:${key}`, String(value));
  }
}

/**
 * budgetProfile 档位 → 3 个硬上限的"推荐默认值"。
 * 用户切换档位时自动填，但仍可在「预算与时限」面板里手动覆盖。
 */
function budgetPresetFor(profile: BudgetProfile): {
  maxCredits: number;
  budgetMultiplierOverride: number;
  wallTimeMinutes: number;
} {
  switch (profile) {
    case 'low':
      return {
        maxCredits: 500,
        budgetMultiplierOverride: 0.6,
        wallTimeMinutes: 15,
      };
    case 'medium':
      return {
        maxCredits: 2000,
        budgetMultiplierOverride: 1.0,
        wallTimeMinutes: 30,
      };
    case 'high':
      return {
        maxCredits: 8000,
        budgetMultiplierOverride: 2.0,
        wallTimeMinutes: 60,
      };
    case 'unlimited':
    default:
      return {
        maxCredits: 30000,
        budgetMultiplierOverride: 4.0,
        wallTimeMinutes: 180,
      };
  }
}

export function PlaygroundMissionDialog({
  isOpen,
  onClose,
  onCreated,
}: PlaygroundMissionDialogProps) {
  const router = useRouter();

  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [depth, setDepth] = useState<RunMissionInput['depth']>(() =>
    loadPref('depth', 'deep' as RunMissionInput['depth'])
  );
  const [language, setLanguage] =
    useState<RunMissionInput['language']>('zh-CN');
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
  const [knowledgeBaseIds, setKnowledgeBaseIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('playground:knowledgeBaseIds');
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === 'string')
        : [];
    } catch {
      return [];
    }
  });
  // 预算与时限：默认值来自 budgetProfile 档位映射（用户切档位自动重填，也可手动覆盖）
  const initialPreset = budgetPresetFor(
    loadPref('budgetProfile', 'medium' as BudgetProfile)
  );
  const [maxCredits, setMaxCredits] = useState<number>(() =>
    loadPrefNum('maxCredits', initialPreset.maxCredits)
  );
  const [budgetMultiplierOverride, setBudgetMultiplierOverride] =
    useState<number>(() =>
      loadPrefNum(
        'budgetMultiplierOverride',
        initialPreset.budgetMultiplierOverride
      )
    );
  const [wallTimeMinutes, setWallTimeMinutes] = useState<number>(() =>
    loadPrefNum('wallTimeMinutes', initialPreset.wallTimeMinutes)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyBudgetProfile(profile: BudgetProfile) {
    setBudgetProfile(profile);
    persistPref('budgetProfile', profile);
    const preset = budgetPresetFor(profile);
    setMaxCredits(preset.maxCredits);
    setBudgetMultiplierOverride(preset.budgetMultiplierOverride);
    setWallTimeMinutes(preset.wallTimeMinutes);
    persistPref('maxCredits', preset.maxCredits);
    persistPref('budgetMultiplierOverride', preset.budgetMultiplierOverride);
    persistPref('wallTimeMinutes', preset.wallTimeMinutes);
  }

  const isCustomProfile = useMemo(
    () =>
      depth !== 'deep' ||
      budgetProfile !== 'medium' ||
      styleProfile !== 'executive' ||
      lengthProfile !== 'standard' ||
      audienceProfile !== 'domain-expert' ||
      !withFigures ||
      auditLayers !== 'default' ||
      searchTimeRange !== '365d',
    [
      depth,
      budgetProfile,
      styleProfile,
      lengthProfile,
      audienceProfile,
      withFigures,
      auditLayers,
      searchTimeRange,
    ]
  );

  function resetDefaults() {
    setDepth('deep');
    setBudgetProfile('medium');
    setStyleProfile('executive');
    setLengthProfile('standard');
    setAudienceProfile('domain-expert');
    setWithFigures(true);
    setAuditLayers('default');
    setSearchTimeRange('365d');
    const preset = budgetPresetFor('medium');
    setMaxCredits(preset.maxCredits);
    setBudgetMultiplierOverride(preset.budgetMultiplierOverride);
    setWallTimeMinutes(preset.wallTimeMinutes);
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
        'maxCredits',
        'budgetMultiplierOverride',
        'wallTimeMinutes',
      ].forEach((k) => localStorage.removeItem(`playground:${k}`));
    }
  }

  async function handleSubmit() {
    const trimmed = topic.trim();
    if (!trimmed) return;
    if (trimmed.length < 4) {
      setError('Topic 至少 4 个字符');
      return;
    }
    if (
      maxCredits < MAX_CREDITS_LIMIT.min ||
      maxCredits > MAX_CREDITS_LIMIT.max
    ) {
      setError(
        `Credits 上限必须在 ${MAX_CREDITS_LIMIT.min} - ${MAX_CREDITS_LIMIT.max} 之间`
      );
      return;
    }
    if (
      budgetMultiplierOverride < MULTIPLIER_LIMIT.min ||
      budgetMultiplierOverride > MULTIPLIER_LIMIT.max
    ) {
      setError(
        `Agent 倍率必须在 ${MULTIPLIER_LIMIT.min} - ${MULTIPLIER_LIMIT.max} 之间`
      );
      return;
    }
    if (
      wallTimeMinutes < WALL_TIME_LIMIT_MINUTES.min ||
      wallTimeMinutes > WALL_TIME_LIMIT_MINUTES.max
    ) {
      setError(
        `时长上限必须在 ${WALL_TIME_LIMIT_MINUTES.min} - ${WALL_TIME_LIMIT_MINUTES.max} 分钟之间`
      );
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const trimmedDescription = description.trim();
      const { missionId } = await runTeam({
        topic: trimmed,
        description:
          trimmedDescription.length > 0 ? trimmedDescription : undefined,
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
        wallTimeMs: wallTimeMinutes * 60_000,
        knowledgeBaseIds:
          knowledgeBaseIds.length > 0 ? knowledgeBaseIds : undefined,
      });
      if (!missionId || missionId === 'undefined') {
        throw new Error('Server did not return a missionId');
      }
      setTopic('');
      setDescription('');
      onClose();
      if (onCreated) onCreated(missionId);
      else router.push(`/agent-playground/team/${missionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MissionDialogShell
      isOpen={isOpen}
      onClose={onClose}
      title="新建研究 Mission"
      subtitle="基于 Harness runtime 启动多 Agent 研究任务"
      submitLabel={submitting ? '启动中…' : '启动 Mission'}
      submitting={submitting}
      submitDisabled={!topic.trim()}
      onSubmit={() => {
        void handleSubmit();
      }}
      defaultAdvancedOpen={isCustomProfile}
      error={error}
      footerLeftSlot={
        isCustomProfile ? (
          <button
            type="button"
            onClick={resetDefaults}
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            恢复默认配置
          </button>
        ) : null
      }
      primary={
        <>
          <Field
            label="研究话题"
            required
            hint={topic.length > 0 ? `${topic.length}/200` : undefined}
          >
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例如：2026 Q2 AI Agent 市场格局与主要厂商竞争力变化"
              rows={3}
              maxLength={200}
              className="w-full resize-y rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
              required
            />
            {!topic && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SAMPLE_TOPICS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTopic(s)}
                    className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field
            label="研究描述"
            hintInline="选填——给 Leader 更完整的背景 / 关注角度 / 约束，明显提升维度拆分质量"
            hint={
              description.length > 0 ? `${description.length}/2000` : undefined
            }
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：聚焦头部 5 家厂商（OpenAI / Anthropic / Google / Meta / xAI），不分析中国厂商；重点对比 agent / coding / multimodal 三条产品线的能力差异 + 商业化打法；时间窗口 2026 Q1-Q2。"
              rows={5}
              maxLength={2000}
              className="w-full resize-y rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </Field>

          <Field label="研究深度">
            <div className="grid grid-cols-3 gap-2">
              {DEPTH_OPTIONS.map((opt) => (
                <SelectableTile
                  key={opt.value}
                  active={depth === opt.value}
                  label={opt.label}
                  hint={opt.hint}
                  onClick={() => {
                    setDepth(opt.value);
                    persistPref('depth', opt.value);
                  }}
                />
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="输出语言">
              <select
                value={language}
                onChange={(e) =>
                  setLanguage(e.target.value as RunMissionInput['language'])
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="zh-CN">中文</option>
                <option value="en-US">English</option>
              </select>
            </Field>
            <Field label="预算档位（点击切换会重填下方 3 个上限）">
              <div className="grid grid-cols-4 gap-1.5">
                {BUDGET_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => applyBudgetProfile(opt.value)}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium transition-all ${
                      budgetProfile === opt.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </>
      }
      advanced={
        <>
          <BudgetAndTimeLimitPanel
            maxCredits={maxCredits}
            setMaxCredits={(n) => {
              setMaxCredits(n);
              persistPref('maxCredits', n);
            }}
            budgetMultiplierOverride={budgetMultiplierOverride}
            setBudgetMultiplierOverride={(n) => {
              setBudgetMultiplierOverride(n);
              persistPref('budgetMultiplierOverride', n);
            }}
            wallTimeMinutes={wallTimeMinutes}
            setWallTimeMinutes={(n) => {
              setWallTimeMinutes(n);
              persistPref('wallTimeMinutes', n);
            }}
          />
          <Field label="搜索时效">
            <div className="grid grid-cols-6 gap-1.5">
              {TIME_RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setSearchTimeRange(opt.value);
                    persistPref('searchTimeRange', opt.value);
                  }}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                    searchTimeRange === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="审核层级">
            <div className="grid grid-cols-4 gap-1.5">
              {AUDIT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setAuditLayers(opt.value);
                    persistPref('auditLayers', opt.value);
                  }}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                    auditLayers === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="文风">
              <select
                value={styleProfile}
                onChange={(e) => {
                  const v = e.target.value as StyleProfile;
                  setStyleProfile(v);
                  persistPref('styleProfile', v);
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="executive">管理层简报</option>
                <option value="academic">学术论证</option>
                <option value="journalistic">新闻型</option>
                <option value="technical">技术型</option>
              </select>
            </Field>
            <Field label="长度档位">
              <select
                value={lengthProfile}
                onChange={(e) => {
                  const v = e.target.value as LengthProfile;
                  setLengthProfile(v);
                  persistPref('lengthProfile', v);
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                  const v = e.target.value as AudienceProfile;
                  setAudienceProfile(v);
                  persistPref('audienceProfile', v);
                }}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="domain-expert">领域专家</option>
                <option value="executive">管理层</option>
                <option value="general-public">大众</option>
              </select>
            </Field>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-700">
                图文并茂
              </span>
              <p className="text-xs text-gray-400">
                仅引用真实图片，不使用 AI 生成图
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !withFigures;
                setWithFigures(next);
                persistPref('withFigures', next ? '1' : '0');
              }}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                withFigures ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  withFigures ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <Field
            label="知识源"
            hintInline="不选则纯 web-search；选了则先 KB 召回再补 web"
          >
            <KnowledgeBaseSelector
              selectedIds={knowledgeBaseIds}
              onSelectionChange={(ids) => {
                setKnowledgeBaseIds(ids);
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
          </Field>
        </>
      }
    />
  );
}

function Field({
  label,
  required,
  hint,
  hintInline,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  hintInline?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
          {hintInline && (
            <span className="ml-2 text-xs font-normal text-gray-400">
              {hintInline}
            </span>
          )}
        </label>
        {hint && <span className="text-xs text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function SelectableTile({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-start rounded-lg border-2 px-3 py-2.5 text-left transition-all ${
        active
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {active && (
        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-white">
          <Check className="h-2.5 w-2.5" />
        </span>
      )}
      <span
        className={`text-sm font-semibold ${active ? 'text-blue-700' : 'text-gray-800'}`}
      >
        {label}
      </span>
      {hint && (
        <span
          className={`mt-0.5 text-[11px] ${active ? 'text-blue-600' : 'text-gray-500'}`}
        >
          {hint}
        </span>
      )}
    </button>
  );
}
