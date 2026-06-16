'use client';

/**
 * ByokOnboardingBanner — 新手三步引导横幅（进度 + 下一步 CTA）
 *
 * 跟 ByokOnboardingGuard（强制跳 /me/api-keys）互补：Guard 拦新用户；本 Banner 是
 * 全站温和引导，展示「① 配 Key → ② 生成模型 → ③ 就绪」三步进度，并对当前未完成
 * 的那一步给出明确的下一步按钮。
 *
 * ★ 2026-06-16：此前 banner 只覆盖「没配 Key」，配完 key 就消失 —— 但用户此时往往
 * 还没有可用模型（auto-configure 探测失败等），App 仍跑不起来却无人引导。现在覆盖
 * 「配了 Key 但没模型」这一步，CTA 引导去「我的模型」一键配置。
 *
 * 行为：
 * - needs_key   → "去配置 Key" → /me/api-keys
 * - needs_model → "一键配置模型" → /me/models
 * - ready       → 不显示
 * - 可关闭（localStorage 记 dismiss，30 天内不再弹）；配好后自动消失
 */

import { AlertCircle, ArrowRight, Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useByokStatus, type ByokStage } from '@/hooks/features';

const STEPS: { key: Exclude<ByokStage, 'ready'> | 'ready'; label: string }[] = [
  { key: 'needs_key', label: '配置 Key' },
  { key: 'needs_model', label: '生成模型' },
  { key: 'ready', label: '就绪' },
];

/** 当前 stage 对应的“已完成步数”（needs_key=0 / needs_model=1 / ready=3） */
function completedCount(stage: ByokStage): number {
  if (stage === 'needs_key') return 0;
  if (stage === 'needs_model') return 1;
  return 3;
}

export function ByokOnboardingBanner() {
  const router = useRouter();
  const { shouldShowBanner, stage, dismissBanner } = useByokStatus();

  if (!shouldShowBanner || !stage || stage === 'ready') return null;

  const done = completedCount(stage);
  const cta =
    stage === 'needs_key'
      ? { text: '去配置 Key', href: '/me/api-keys' }
      : { text: '一键配置模型', href: '/me/models' };
  const title =
    stage === 'needs_key' ? '尚未配置 AI API Key' : '还没有可用的 AI 模型';
  const desc =
    stage === 'needs_key'
      ? '所有 AI 功能（研究 / 写作 / 问答等）暂时无法使用。粘贴一次 Key 即可解锁。'
      : '已配置 Key，但还没有可用模型 —— 去「我的模型」一键生成即可开始使用。';

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
      <div className="flex items-start gap-3 md:items-center">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400 md:mt-0" />
        <div className="flex-1 text-sm text-amber-900 dark:text-amber-200">
          <span className="font-medium">{title}</span>
          <span className="ml-1 text-amber-700 dark:text-amber-300/80">
            — {desc}
          </span>
        </div>
        <button
          onClick={() => router.push(cta.href)}
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
        >
          {cta.text}
          <ArrowRight className="h-3 w-3" />
        </button>
        <button
          onClick={dismissBanner}
          aria-label="关闭提示（30 天内不再显示）"
          className="flex-shrink-0 rounded p-1 text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/30"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 三步进度指示 */}
      <ol className="mt-2 flex items-center gap-2 pl-8 text-xs">
        {STEPS.map((step, i) => {
          const isDone = i < done;
          const isCurrent = i === done;
          return (
            <li key={step.key} className="flex items-center gap-2">
              <span
                className={[
                  'inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold',
                  isDone
                    ? 'bg-amber-600 text-white'
                    : isCurrent
                      ? 'border border-amber-600 text-amber-700 dark:text-amber-300'
                      : 'border border-amber-300 text-amber-400',
                ].join(' ')}
              >
                {isDone ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span
                className={
                  isCurrent
                    ? 'font-medium text-amber-900 dark:text-amber-200'
                    : 'text-amber-600 dark:text-amber-400/70'
                }
              >
                {step.label}
              </span>
              {i < STEPS.length - 1 && (
                <span className="text-amber-300">→</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
