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
  type ReportScale,
  type RunMissionInput,
  type StyleProfile,
} from '@/services/agent-playground/api';
import { ChevronDown, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { KnowledgeBaseSelector } from '@/components/common/selectors';
import { ScalePresetCardGrid } from '@/components/agent-playground/overhaul/ScalePresetCardGrid';

export function DemoLauncher() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  // ★ Phase P0-8 默认档位：深度 + 图文 + 中等其他（mission-pipeline-user-profiles.md §3）
  const initTopic = searchParams?.get('topic') ?? '';
  const initDepth = (searchParams?.get('depth') ??
    'deep') as RunMissionInput['depth'];
  const initLang = (searchParams?.get('language') ??
    'zh-CN') as RunMissionInput['language'];

  const [topic, setTopic] = useState(initTopic);
  const [depth, setDepth] = useState<RunMissionInput['depth']>(() => {
    // 优先级：URL 参数 > localStorage > 默认 deep
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
  // P95-1: 用户档位 localStorage 持久化
  const loadPref = <T extends string>(key: string, fallback: T): T => {
    if (typeof window === 'undefined') return fallback;
    return (localStorage.getItem(`playground:${key}`) as T | null) ?? fallback;
  };
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
  // ★ 2026-04-30: 本地知识库选择 — researcher 走 rag-search 时限定召回范围
  // 持久化策略：localStorage 存上次选择的 ids，进页面自动恢复
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

  // 写回 localStorage
  const persist = (key: string, value: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`playground:${key}`, value);
    }
  };
  // P94-1: advanced 折叠状态持久化
  const [advanced, setAdvanced] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('playground:advanced-open') === '1';
    }
    return false;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // PR-8 v1.6 D1: 单轴 reportScale（默认开启，老用户可切回 legacy 3-axis）
  const [useScalePreset, setUseScalePreset] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('playground:useScalePreset') !== '0';
  });
  const [reportScale, setReportScale] = useState<ReportScale>(() => {
    if (typeof window === 'undefined') return 'standard';
    const stored = localStorage.getItem('playground:reportScale');
    if (
      stored &&
      ['quick', 'standard', 'deep', 'professional'].includes(stored)
    ) {
      return stored as ReportScale;
    }
    return 'standard';
  });

  // Phase P5-11: 预算估算（粗估）
  function estimateTokens(): number {
    const base = 400; // K base for deep+medium+withFigures
    const depthMul = depth === 'quick' ? 0.4 : depth === 'standard' ? 0.7 : 1;
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
    // 粗估：1K tokens ≈ $0.002（混合模型）
    return (estimateTokens() * 0.002).toFixed(2);
  }
  function estimateMinutes(): string {
    const tokens = estimateTokens();
    const minutes = Math.min(60, Math.max(2, Math.round(tokens / 60)));
    return `${minutes}-${Math.min(60, minutes + 3)}`;
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
      // ★ 2026-05-06 (P0-K): backend 删除 BUDGET_PROFILE_CREDITS / BUDGET_PROFILE_MULTIPLIER
      //   内部硬编码映射；用户侧（前端）必须显式传 maxCredits + budgetMultiplierOverride。
      //   前端按用户选档 (budgetProfile + depth + lengthProfile) 计算推荐值（基于
      //   estimateTokens 的同一模型），用户感知预算且 backend 无内部默认值。
      const estimatedTokens = estimateTokens(); // 单位 K tokens
      // maxCredits = 估算 tokens 的 1.5 倍 buffer（让 mission 不易撞墙）
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
        topic: topic.trim(),
        depth,
        language,
        budgetProfile,
        styleProfile,
        lengthProfile,
        audienceProfile,
        withFigures,
        auditLayers,
        maxCredits,
        budgetMultiplierOverride,
        knowledgeBaseIds:
          selectedKnowledgeBaseIds.length > 0
            ? selectedKnowledgeBaseIds
            : undefined,
        // PR-8 v1.6 D1: 用户走单轴 reportScale 时一并传，backend dual-write 期 14d 内
        // 仍读 depth/lengthProfile（不丢弃 legacy 字段）
        ...(useScalePreset ? { reportScale } : {}),
        // P98-2: concurrency 由 backend 默认 3
      });
      if (!missionId || missionId === 'undefined') {
        throw new Error('Server did not return a missionId');
      }
      // P42-2: 跳转后清 topic 字段（避免回退页面看到旧值困惑）
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
      className="space-y-5"
    >
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-900">
          {t('playground.researchTeam.topicLabel') || '研究 Topic'}
        </label>
        <div className="relative">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={
              t('playground.researchTeam.topicPlaceholder') ||
              '例如：AI agents market 2026 Q2'
            }
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-16 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
            maxLength={200}
            required
          />
          {topic.length > 0 && (
            <span
              className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] ${topic.length > 180 ? 'text-amber-600' : 'text-gray-400'}`}
            >
              {topic.length}/200
            </span>
          )}
        </div>
        {/* Phase P16-2: 示例 topic 一键填充 */}
        {!topic && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[
              'GPT-5 vs Claude Opus 5 能力对比',
              '2026 全球碳中和政策进展',
              'AI Agent 框架（LangGraph / AutoGen / CrewAI）对比',
              'Web3 + AI 的早期应用场景',
            ].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setTopic(sample)}
                className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-600 hover:bg-violet-50 hover:text-violet-700"
              >
                {sample}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* PR-8 v1.6 D1: 单轴 reportScale（推荐） + 切回 legacy 3-axis */}
      {useScalePreset ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-900">
              报告档位
              <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                推荐
              </span>
            </label>
            <button
              type="button"
              onClick={() => {
                setUseScalePreset(false);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('playground:useScalePreset', '0');
                }
              }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              切换到自定义档位 →
            </button>
          </div>
          <ScalePresetCardGrid
            value={reportScale}
            onChange={(v) => {
              setReportScale(v);
              if (typeof window !== 'undefined') {
                localStorage.setItem('playground:reportScale', v);
              }
              // 同步 legacy 字段（dual-write 14d 期，backend 兼容）
              // 简易映射：scale → legacy depth + lengthProfile（backend 也会自己 deriveScaleFromLegacy 反向推导）
              const SCALE_TO_LEGACY: Record<
                ReportScale,
                {
                  depth: RunMissionInput['depth'];
                  lengthProfile: LengthProfile;
                }
              > = {
                quick: { depth: 'quick', lengthProfile: 'brief' },
                standard: { depth: 'standard', lengthProfile: 'standard' },
                deep: { depth: 'deep', lengthProfile: 'deep' },
                professional: { depth: 'deep', lengthProfile: 'extended' },
                publication: { depth: 'deep', lengthProfile: 'epic' },
                encyclopedia: { depth: 'deep', lengthProfile: 'mega' },
              };
              const legacy = SCALE_TO_LEGACY[v];
              if (legacy) {
                setDepth(legacy.depth);
                persist('depth', legacy.depth);
                setLengthProfile(legacy.lengthProfile);
                persist('lengthProfile', legacy.lengthProfile);
              }
            }}
            userTier="free"
          />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            自定义档位（旧版 3 轴：深度 + 长度 + 预算）
          </span>
          <button
            type="button"
            onClick={() => {
              setUseScalePreset(true);
              if (typeof window !== 'undefined') {
                localStorage.setItem('playground:useScalePreset', '1');
              }
            }}
            className="text-xs text-violet-600 hover:text-violet-700"
          >
            ← 回到推荐档位
          </button>
        </div>
      )}

      {/* 基础三档（默认就是深度 + 中文 + 中等预算）— useScalePreset 模式下 depth/budget 由档位驱动，仅用作显示 */}
      {!useScalePreset && (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-900">
              研究深度
            </label>
            <select
              value={depth}
              onChange={(e) => {
                const v = e.target.value as RunMissionInput['depth'];
                setDepth(v);
                persist('depth', v);
              }}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
            >
              <option value="quick">快速（2-3 维度）</option>
              <option value="standard">标准（3-5 维度）</option>
              <option value="deep">深度（5-7 维度，默认）</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-900">
              输出语言
            </label>
            <select
              value={language}
              onChange={(e) =>
                setLanguage(e.target.value as RunMissionInput['language'])
              }
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
            >
              <option value="zh-CN">中文</option>
              <option value="en-US">English</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-900">
              预算档位
            </label>
            <select
              value={budgetProfile}
              onChange={(e) => {
                const v = e.target.value as BudgetProfile;
                setBudgetProfile(v);
                persist('budgetProfile', v);
              }}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
            >
              <option value="low">低（约 $0.1）</option>
              <option value="medium">中（约 $0.5，默认）</option>
              <option value="high">高（约 $2）</option>
              <option value="unlimited">不限（仅 BYOK）</option>
            </select>
          </div>
        </div>
      )}

      {/* 图文 + 审核层级 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
          <input
            type="checkbox"
            id="withFigures"
            checked={withFigures}
            onChange={(e) => {
              setWithFigures(e.target.checked);
              persist('withFigures', e.target.checked ? '1' : '0');
            }}
            className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
          />
          <label
            htmlFor="withFigures"
            className="flex-1 text-sm font-medium text-gray-900"
          >
            图文并茂（默认开）
            <span className="block text-xs font-normal text-gray-500">
              图必须来自参考文献，非 AI 创作
            </span>
          </label>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-900">
            审核层级
          </label>
          <select
            value={auditLayers}
            onChange={(e) => {
              const v = e.target.value as AuditLayers;
              setAuditLayers(v);
              persist('auditLayers', v);
            }}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
          >
            <option value="minimal">最简（仅 L0 schema 校验）</option>
            <option value="default">标准（L0+L3，默认）</option>
            <option value="thorough">完整（L0+L1+L3+L4）</option>
            <option value="thorough+">极致（全开 L0~L4）</option>
          </select>
        </div>
      </div>

      {/* 本地知识库（可选） */}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
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
        <p className="mt-2 text-xs text-gray-500">
          选了知识库后，研究员先在本地 KB 做语义召回再补 web-search。不选 → 纯
          web-search。
        </p>
      </div>

      {/* 高级选项 */}
      <div>
        <div className="flex items-center gap-2">
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
            className="flex flex-1 items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            <span>高级选项</span>
            {advanced ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {(depth !== 'deep' ||
            budgetProfile !== 'medium' ||
            styleProfile !== 'executive' ||
            lengthProfile !== 'standard' ||
            audienceProfile !== 'domain-expert' ||
            !withFigures ||
            auditLayers !== 'default') && (
            <button
              type="button"
              onClick={() => {
                setDepth('deep');
                setBudgetProfile('medium');
                setStyleProfile('executive');
                setLengthProfile('standard');
                setAudienceProfile('domain-expert');
                setWithFigures(true);
                setAuditLayers('default');
                // P96-1: 清 localStorage 偏好
                if (typeof window !== 'undefined') {
                  [
                    'budgetProfile',
                    'styleProfile',
                    'lengthProfile',
                    'audienceProfile',
                    'withFigures',
                    'auditLayers',
                  ].forEach((k) => localStorage.removeItem(`playground:${k}`));
                }
              }}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
              title="恢复默认档位（深度+图文+中等）"
            >
              重置默认
            </button>
          )}
        </div>
        {advanced && (
          <div className="mt-3 grid grid-cols-3 gap-4 rounded-xl border border-gray-100 bg-gray-50/30 p-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                文风
              </label>
              <select
                value={styleProfile}
                onChange={(e) => {
                  const v = e.target.value as StyleProfile;
                  setStyleProfile(v);
                  persist('styleProfile', v);
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500"
              >
                <option value="academic">学术</option>
                <option value="executive">高管简报（默认）</option>
                <option value="journalistic">新闻</option>
                <option value="technical">技术</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                长度
              </label>
              <select
                value={lengthProfile}
                onChange={(e) => {
                  const v = e.target.value as LengthProfile;
                  setLengthProfile(v);
                  persist('lengthProfile', v);
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500"
              >
                <option value="brief">简（~3K 字）</option>
                <option value="standard">标准（~8K 字，默认）</option>
                <option value="deep">深（~15K 字）</option>
                <option value="extended">扩展（~25K 字）</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-700">
                受众
              </label>
              <select
                value={audienceProfile}
                onChange={(e) => {
                  const v = e.target.value as AudienceProfile;
                  setAudienceProfile(v);
                  persist('audienceProfile', v);
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500"
              >
                <option value="executive">高管</option>
                <option value="domain-expert">领域专家（默认）</option>
                <option value="general-public">大众</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Phase P5-11 / P9-1: 预算 + 配置摘要 */}
      <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-2.5 text-xs text-violet-700">
        <div>
          预计 ~{estimateTokens()}K tokens · 约 ${estimateCost()} ·{' '}
          {estimateMinutes()} 分钟
        </div>
        {audienceProfile === 'executive' && (
          <div className="mt-0.5 text-[10px] text-violet-600">
            高管受众自动启 L4 独立复审 · 总 cost ×1.3
          </div>
        )}
        {auditLayers === 'thorough' && (
          <div className="mt-0.5 text-[10px] text-violet-600">
            thorough 启 L0+L1+L3+L4 → Leader/Analyst/Writer 走 reflexion
          </div>
        )}
        {auditLayers === 'thorough+' && (
          <div className="mt-0.5 text-[10px] text-violet-600">
            paranoid 全开 L0~L4 + 同侪比对（贵 ~3×）
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !topic.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-3 text-sm font-medium text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:shadow-violet-500/30 disabled:cursor-not-allowed disabled:opacity-50"
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
          </>
        )}
      </button>
    </form>
  );
}
