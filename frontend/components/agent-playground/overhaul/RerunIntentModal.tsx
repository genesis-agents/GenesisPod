// PR-8 v1.6 D5 rerun 8 意图 modal
//
// 用法（mission 详情页"开始/更新"按钮 → 弹本 modal 选意图）：
//   <RerunIntentModal
//     missionId={missionId}
//     open={open}
//     onClose={() => setOpen(false)}
//     onPicked={(result) => {
//       if (result.runMissionId !== missionId) router.push(`.../${result.runMissionId}`);
//     }}
//     chapterIndices={[1, 2, 3]}  // revise-chapter 用
//   />
//
// 见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 2.D5

'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { rerunMissionWithIntent } from '@/services/agent-playground/api';
import { RerunIntentCardGrid } from './RerunIntentCardGrid';
import {
  RERUN_INTENT_CARDS,
  type RerunIntent,
} from '@/lib/agent-playground/rerun-intents';

export interface RerunIntentModalProps {
  missionId: string;
  open: boolean;
  onClose: () => void;
  /** 触发成功后回调；fresh-research 时 runMissionId !== missionId，调方应跳新页 */
  onPicked: (result: { runMissionId: string; intent: RerunIntent }) => void;
  /** revise-chapter 章节选择源（默认空数组 → revise-chapter 不可选） */
  chapterIndices?: number[];
  /** mission 当前语言（change-language 表单默认值） */
  currentLanguage?: 'zh-CN' | 'en-US' | string;
}

type Step = 'pick' | 'configure' | 'submitting';

export function RerunIntentModal({
  missionId,
  open,
  onClose,
  onPicked,
  chapterIndices = [],
  currentLanguage,
}: RerunIntentModalProps): React.ReactElement | null {
  const [step, setStep] = React.useState<Step>('pick');
  const [picked, setPicked] = React.useState<RerunIntent | null>(null);
  const [chapterIndex, setChapterIndex] = React.useState<number | null>(
    chapterIndices[0] ?? null
  );
  const [paramValue, setParamValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setStep('pick');
      setPicked(null);
      setError(null);
      setParamValue('');
      // ★ P0 fix: chapterIndex 也必须重置，否则关闭再开 chapterIndices prop 变了仍是旧 index
      setChapterIndex(chapterIndices[0] ?? null);
    }
  }, [open, chapterIndices]);

  if (!open) return null;

  const card = picked
    ? RERUN_INTENT_CARDS.find((c) => c.intent === picked)
    : null;

  const handlePick = (intent: RerunIntent) => {
    setPicked(intent);
    const targetCard = RERUN_INTENT_CARDS.find((c) => c.intent === intent);
    const needsConfigure = !!(
      targetCard?.requiresChapterSelector || targetCard?.requiresParamForm
    );
    if (needsConfigure) {
      setStep('configure');
    } else {
      // ★ P0 fix: submit 显式接收 needsConfigure，不依赖闭包 card（避免 picked 还没 flush）
      void submit(intent, {}, false);
    }
  };

  const buildPayload = (intent: RerunIntent): Record<string, unknown> => {
    if (intent === 'revise-chapter') {
      return chapterIndex != null ? { chapterIndex } : {};
    }
    if (intent === 'change-style') return { style: paramValue };
    if (intent === 'change-language') return { language: paramValue };
    if (intent === 'change-audience') return { audience: paramValue };
    return {};
  };

  const submit = async (
    intent: RerunIntent,
    payload: Record<string, unknown>,
    needsConfigure: boolean
  ) => {
    setStep('submitting');
    setError(null);
    try {
      const result = await rerunMissionWithIntent(missionId, intent, payload);
      onPicked(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // ★ P0 fix: 用参数 needsConfigure 而非闭包 card（消除"picked 还没 flush 时 card=null"陷阱）
      setStep(needsConfigure ? 'configure' : 'pick');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && step !== 'submitting') onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {step === 'pick' && '选择重跑意图'}
              {step === 'configure' && card && `${card.label} — 填参数`}
              {step === 'submitting' && '提交中…'}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {step === 'pick' &&
                '选最贴近你想做的事，pipeline 只跑必要的 stage（不重新走全流程）'}
              {step === 'configure' &&
                card?.requiresChapterSelector &&
                '选要修订的章节'}
              {step === 'configure' &&
                card?.requiresParamForm &&
                '填新值（提交后会重写报告）'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={step === 'submitting'}
            aria-label="关闭"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {step === 'pick' && (
          <>
            <RerunIntentCardGrid onPick={handlePick} />
            {/* P0 fix: 无需 configure 的意图失败回退到 pick 时也要让用户看到错误 */}
            {error && (
              <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </>
        )}

        {step === 'configure' && card && (
          <div className="space-y-4">
            {card.requiresChapterSelector && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">
                  章节
                </label>
                {chapterIndices.length === 0 ? (
                  <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">
                    当前 mission 没有章节可选，回去等 mission 完成再用此意图
                  </div>
                ) : (
                  <select
                    value={chapterIndex ?? ''}
                    onChange={(e) => setChapterIndex(Number(e.target.value))}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-sm"
                  >
                    {chapterIndices.map((i) => (
                      <option key={i} value={i}>
                        第 {i} 章
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {card.requiresParamForm && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-900">
                  {picked === 'change-style' && '新文风（学术 / 通俗 / 商业）'}
                  {picked === 'change-language' &&
                    `新语言（当前：${currentLanguage ?? '未知'}）`}
                  {picked === 'change-audience' &&
                    '新受众（C-level / 工程师 / 大众）'}
                </label>
                {picked === 'change-style' && (
                  <select
                    value={paramValue}
                    onChange={(e) => setParamValue(e.target.value)}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="">— 请选择 —</option>
                    <option value="academic">学术</option>
                    <option value="executive">高管简报</option>
                    <option value="journalistic">新闻</option>
                    <option value="technical">技术</option>
                  </select>
                )}
                {picked === 'change-language' && (
                  <select
                    value={paramValue}
                    onChange={(e) => setParamValue(e.target.value)}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="">— 请选择 —</option>
                    <option value="zh-CN">中文</option>
                    <option value="en-US">English</option>
                  </select>
                )}
                {picked === 'change-audience' && (
                  <select
                    value={paramValue}
                    onChange={(e) => setParamValue(e.target.value)}
                    className="w-full rounded border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="">— 请选择 —</option>
                    <option value="executive">高管</option>
                    <option value="domain-expert">领域专家</option>
                    <option value="general-public">大众</option>
                  </select>
                )}
              </div>
            )}

            {error && (
              <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep('pick')}
                className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                返回
              </button>
              <button
                type="button"
                disabled={
                  (card.requiresChapterSelector && chapterIndex == null) ||
                  (card.requiresParamForm && !paramValue)
                }
                onClick={() =>
                  picked && void submit(picked, buildPayload(picked), true)
                }
                className="rounded bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                提交
              </button>
            </div>
          </div>
        )}

        {step === 'submitting' && (
          <div className="flex items-center justify-center gap-3 py-8 text-sm text-gray-500">
            <span className="h-3 w-3 animate-pulse rounded-full bg-violet-500" />
            正在提交…
          </div>
        )}
      </div>
    </div>
  );
}
