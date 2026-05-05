'use client';

/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): 5 步向导外壳
 *
 * - 持有 form state（CustomAgentConfig + slug + displayName）
 * - 步骤导航（Stepper）
 * - 每步"保存并下一步"调 PATCH 持久化（create 模式首次保存调 POST）
 * - 第 6 步是 review + publish
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { BasicInfoStep } from './BasicInfoStep';
import { TopicSchemaStep } from './TopicSchemaStep';
import { SkillsStep } from './SkillsStep';
import { PipelineStep } from './PipelineStep';
import { IntegrationStep } from './IntegrationStep';
import { ReviewStep } from './ReviewStep';
import { useCustomAgentOptions } from './useCustomAgentOptions';
import {
  WIZARD_STEPS,
  issuesForStep,
  validateCustomAgentCompleteness,
  type CustomAgentConfig,
  type CustomAgentRecord,
  type WizardStepKey,
} from './types';

interface WizardState {
  slug: string;
  displayName: string;
  description: string;
  config: CustomAgentConfig;
}

export function CustomAgentWizard({
  initial,
  onClose,
}: {
  initial?: CustomAgentRecord;
  /** 完成或取消时回调（嵌入 MyAgentsTab 时返回列表；独立页时跳路由） */
  onClose?: () => void;
}) {
  const router = useRouter();
  const isCreate = !initial;
  const {
    options,
    loading: optionsLoading,
    error: optionsError,
  } = useCustomAgentOptions();

  const [agentId, setAgentId] = useState<string | undefined>(initial?.id);
  const [stepIdx, setStepIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<WizardState>({
    slug: initial?.slug ?? '',
    displayName: initial?.displayName ?? '',
    description: initial?.description ?? '',
    config: initial?.config ?? {},
  });
  const [status, setStatus] = useState<CustomAgentRecord['status']>(
    initial?.status ?? 'DRAFT'
  );

  const currentStep = WIZARD_STEPS[stepIdx];
  const isReview = currentStep.key === 'review';

  const setConfigPatch = (patch: Partial<CustomAgentConfig>) => {
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, ...patch },
    }));
  };

  const persist = async (): Promise<string | null> => {
    setError(null);
    setSaving(true);
    try {
      if (!agentId) {
        if (!/^[a-z0-9-]+$/.test(state.slug)) {
          setError('slug 必须 kebab-case');
          return null;
        }
        if (!state.displayName) {
          setError('显示名必填');
          return null;
        }
        const created = await apiClient.post<{ id: string }>(
          '/user/custom-agents',
          {
            slug: state.slug,
            displayName: state.displayName,
            description: state.description || undefined,
            config: state.config,
          }
        );
        setAgentId(created.id);
        return created.id;
      }
      await apiClient.patch(`/user/custom-agents/${agentId}`, {
        displayName: state.displayName,
        description: state.description || undefined,
        config: state.config,
      });
      return agentId;
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
      return null;
    } finally {
      setSaving(false);
    }
  };

  // 当前步骤的 issues（实时校验当前 config）
  const currentStepIssues = issuesForStep(state.config, currentStep.key);
  // 全部 issues（按 step 分组用，给 Stepper 上色）
  const allIssues = validateCustomAgentCompleteness(state.config);
  const issueCountByStep: Record<WizardStepKey, number> = {
    basicInfo: 0,
    topicSchema: 0,
    skills: 0,
    pipeline: 0,
    integration: 0,
    review: 0,
  };
  for (const i of allIssues) issueCountByStep[i.step]++;

  // ★ 2026-05-05 对齐 Topic Insight CreateTopicDialog：去掉每步 PATCH，
  //   step 切换是纯前端 state（不调 API），只在进入 review 步骤之前一次性
  //   persist —— 创建/更新 record 一次。回退随时可回，不污染 DB。
  // ★ 2026-05-05 P0: 加每步完整性预检，未通过禁 next（避免走完 5 步到 review 才知道哪缺）
  const goNext = async () => {
    const nextIdx = stepIdx + 1;
    if (nextIdx >= WIZARD_STEPS.length) return;
    // 当前步骤未通过校验 → 不让走，让用户在当前页看到红色 issue 提示
    if (currentStepIssues.length > 0) {
      setError(
        `当前步骤未完成（${currentStepIssues.length} 项）：` +
          currentStepIssues.map((i) => i.message).join('; ')
      );
      return;
    }
    const enteringReview = WIZARD_STEPS[nextIdx].key === 'review';
    if (enteringReview) {
      const id = await persist();
      if (!id) return;
    }
    setError(null);
    setStepIdx(nextIdx);
  };

  const goPrev = () => {
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  };

  if (optionsLoading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        加载选项中...
      </div>
    );
  }
  if (optionsError || !options) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        加载选项失败：{optionsError ?? '未知错误'}
      </div>
    );
  }

  return (
    <div>
      {/* Stepper —— ★ 2026-05-05 绿勾按"该步骤实际完整性"上色，
          而非"已经走过"。review 步骤特殊：所有前 5 步 0 issue 才算完成 */}
      <ol className="mb-6 flex items-center gap-2 text-xs">
        {WIZARD_STEPS.map((s, idx) => {
          const active = idx === stepIdx;
          const stepIssues = issueCountByStep[s.key];
          // basicInfo/topicSchema/skills/pipeline/integration → 自身 0 issue 视为完成
          // review → 前 5 步 0 issue 视为完成（review 自身没有独立校验项）
          const stepDone =
            s.key === 'review' ? allIssues.length === 0 : stepIssues === 0;
          const hasIssue = stepIssues > 0;
          return (
            <li key={s.key} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => agentId && setStepIdx(idx)}
                disabled={!agentId && idx > 0}
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
                  active
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : stepDone
                      ? 'border-green-500 bg-green-500 text-white'
                      : hasIssue && idx <= stepIdx
                        ? 'border-amber-500 bg-amber-100 text-amber-700'
                        : 'border-gray-300 bg-white text-gray-500'
                } ${!agentId && idx > 0 ? 'cursor-not-allowed opacity-50' : 'hover:opacity-80'}`}
                title={
                  hasIssue ? `${s.title}（${stepIssues} 项未完成）` : s.title
                }
              >
                {stepDone ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </button>
              <span
                className={`hidden md:inline ${active ? 'font-medium text-gray-900' : 'text-gray-500'}`}
              >
                {s.title}
                {hasIssue && idx <= stepIdx && (
                  <span className="ml-1 text-amber-600">·{stepIssues}</span>
                )}
              </span>
              {idx < WIZARD_STEPS.length - 1 && (
                <ChevronRight className="h-3 w-3 text-gray-400" />
              )}
            </li>
          );
        })}
      </ol>

      {/* Header */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold">
          第 {stepIdx + 1} 步 · {currentStep.title}
        </h2>
        <p className="text-xs text-gray-500">{currentStep.subtitle}</p>
      </div>

      {/* 当前步骤的实时校验 banner —— 让用户在当前页就看到缺啥，
          不必走完 5 步到 review 才发现 */}
      {currentStepIssues.length > 0 && currentStep.key !== 'review' && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="mb-1 font-medium">
            本步骤还有 {currentStepIssues.length} 项未完成：
          </div>
          <ul className="space-y-0.5">
            {currentStepIssues.map((i, idx) => (
              <li key={idx}>
                · <code>{i.field}</code> — {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Body */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        {renderStep(currentStep.key, state, setState, setConfigPatch, options, {
          isCreate,
          agentId,
          status,
          onPublished: () => {
            setStatus('PUBLISHED');
          },
        })}
      </div>

      {/* Footer */}
      {!isReview && (
        <div className="mt-4 flex items-center justify-between">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
              {error}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={stepIdx === 0 || saving}
              className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" /> 上一步
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存并下一步'}{' '}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {isReview && (
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={goPrev}
            className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" /> 上一步
          </button>
          {status === 'PUBLISHED' && (
            <button
              type="button"
              onClick={() => {
                if (onClose) onClose();
                else router.push('/me/ai?tab=agents');
              }}
              className="rounded bg-gray-800 px-4 py-1.5 text-sm text-white hover:bg-gray-900"
            >
              返回列表
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function renderStep(
  key: WizardStepKey,
  state: WizardState,
  setState: React.Dispatch<React.SetStateAction<WizardState>>,
  setConfigPatch: (patch: Partial<CustomAgentConfig>) => void,
  options: NonNullable<ReturnType<typeof useCustomAgentOptions>['options']>,
  ctx: {
    isCreate: boolean;
    agentId?: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    onPublished: () => void;
  }
) {
  switch (key) {
    case 'basicInfo':
      return (
        <BasicInfoStep
          value={state.config.basicInfo ?? {}}
          onChange={(next) => setConfigPatch({ basicInfo: next })}
          slug={state.slug}
          onSlugChange={(slug) => setState((p) => ({ ...p, slug }))}
          displayName={state.displayName}
          onDisplayNameChange={(displayName) =>
            setState((p) => ({ ...p, displayName }))
          }
          isCreate={ctx.isCreate && !ctx.agentId}
        />
      );
    case 'topicSchema':
      return (
        <TopicSchemaStep
          value={state.config.topicSchema ?? {}}
          onChange={(next) => setConfigPatch({ topicSchema: next })}
        />
      );
    case 'skills':
      return (
        <SkillsStep
          value={state.config.skills ?? {}}
          onChange={(next) => setConfigPatch({ skills: next })}
          options={options.skills}
        />
      );
    case 'pipeline':
      return (
        <PipelineStep
          value={state.config.pipeline ?? {}}
          onChange={(next) => setConfigPatch({ pipeline: next })}
          primitives={options.primitives}
        />
      );
    case 'integration':
      return (
        <IntegrationStep
          value={state.config.integration ?? {}}
          onChange={(next) => setConfigPatch({ integration: next })}
          options={options}
        />
      );
    case 'review':
      if (!ctx.agentId) {
        return (
          <p className="text-sm text-gray-500">
            尚未保存。请先完成前面的步骤。
          </p>
        );
      }
      return (
        <ReviewStep
          config={state.config}
          agentId={ctx.agentId}
          status={ctx.status}
          onPublished={ctx.onPublished}
        />
      );
  }
}
