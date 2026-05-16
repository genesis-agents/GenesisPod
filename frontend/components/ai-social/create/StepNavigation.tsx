'use client';

import { useTranslation } from '@/lib/i18n';
import { useSocialCreateStore, CreateStep } from '@/stores';
import {
  FileText,
  Smartphone,
  User,
  Edit3,
  Check,
  Loader2,
  Save,
  Send,
} from 'lucide-react';

interface StepNavigationProps {
  onSaveDraft: () => void;
  onPublish: () => void;
}

/**
 * 2026-05-16 重构：从左侧 w-72 sidebar 改为顶部 horizontal stepper，对齐
 * agent-playground 的 Mission pipeline 视觉形态（顶部 stepper + 下方全宽主体）。
 *
 * Props interface 保持不变（onSaveDraft / onPublish），page 层无需大改。
 */
export function StepNavigation({
  onSaveDraft,
  onPublish,
}: StepNavigationProps) {
  const { t } = useTranslation();
  const {
    currentStep,
    setStep,
    sourceType,
    sourceTitle,
    platform,
    connectionName,
    skipAccount,
    title,
    content,
    isSaving,
    isPublishing,
    isProcessing,
    isSeriesMode,
    seriesParts,
    canGoToStep,
  } = useSocialCreateStore();

  const steps: {
    step: CreateStep;
    icon: typeof FileText;
    label: string;
    getValue: () => string | null;
  }[] = [
    {
      step: 1,
      icon: FileText,
      label: t('aiSocial.steps.source'),
      getValue: () => {
        if (!sourceType) return null;
        if (sourceType === 'MANUAL') return t('aiSocial.sources.manual');
        if (sourceType === 'EXTERNAL_URL')
          return t('aiSocial.sources.external_url');
        return sourceTitle || t(`aiSocial.sources.${sourceType.toLowerCase()}`);
      },
    },
    {
      step: 2,
      icon: Smartphone,
      label: t('aiSocial.steps.platform'),
      getValue: () => {
        if (!platform) return null;
        return t(`aiSocial.contentTypes.${platform.toLowerCase()}`);
      },
    },
    {
      step: 3,
      icon: User,
      label: t('aiSocial.steps.account') || 'Select Account',
      getValue: () => {
        if (skipAccount) return t('aiSocial.create.skipped') || 'Skipped';
        return connectionName;
      },
    },
    {
      step: 4,
      icon: Edit3,
      label: isSeriesMode
        ? t('aiSocial.steps.series') || 'Series'
        : t('aiSocial.steps.edit'),
      getValue: () => {
        if (isSeriesMode && seriesParts.length > 0) {
          return `${seriesParts.length} ${t('aiSocial.series.articles') || 'articles'}`;
        }
        if (title && content) return t('aiSocial.create.ready') || 'Ready';
        return null;
      },
    },
  ];

  const isStepCompleted = (step: CreateStep) => currentStep > step;
  const isStepActive = (step: CreateStep) => currentStep === step;
  const isStepAccessible = (step: CreateStep) => canGoToStep(step);
  const isLoading = isSaving || isPublishing || isProcessing;
  const canPublishOrSave = isSeriesMode
    ? seriesParts.length > 0
    : !!title && !!content;

  return (
    <div className="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-4">
        {/* Top row: title + action buttons */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {t('aiSocial.create.title')}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {t('aiSocial.create.stepsHint') || 'Complete the steps below'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onSaveDraft}
              disabled={isLoading || !canPublishOrSave}
              className="flex items-center gap-2 rounded-lg border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {isSeriesMode
                ? t('aiSocial.series.saveAll') || 'Save all'
                : t('aiSocial.create.saveDraft')}
            </button>
            <button
              onClick={onPublish}
              disabled={isLoading || !canPublishOrSave}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 px-4 py-2 text-sm font-medium text-white transition-all hover:from-rose-600 hover:to-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPublishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isSeriesMode
                ? t('aiSocial.series.saveAndPublish') || 'Save & list'
                : t('aiSocial.create.publish')}
            </button>
          </div>
        </div>

        {/* Horizontal stepper row */}
        <div className="flex items-center">
          {steps.map((item, index) => {
            const Icon = item.icon;
            const isCompleted = isStepCompleted(item.step);
            const isActive = isStepActive(item.step);
            const isAccessible = isStepAccessible(item.step);
            const value = item.getValue();
            const isLast = index === steps.length - 1;

            return (
              <div
                key={item.step}
                className="flex flex-1 items-center last:flex-initial"
              >
                {/* Step node */}
                <button
                  onClick={() => isAccessible && setStep(item.step)}
                  disabled={!isAccessible || isLoading}
                  className={`group flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left transition-all ${
                    isActive
                      ? 'bg-rose-50/60'
                      : isAccessible
                        ? 'hover:bg-gray-50'
                        : 'cursor-not-allowed opacity-50'
                  }`}
                >
                  {/* Circle */}
                  <div
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ring-2 ${
                      isActive
                        ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white ring-rose-200'
                        : isCompleted
                          ? 'bg-emerald-500 text-white ring-emerald-200'
                          : 'bg-white text-gray-400 ring-gray-200'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>

                  {/* Label + value */}
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-[11px] font-medium uppercase tracking-wide ${
                        isActive
                          ? 'text-rose-600'
                          : isCompleted
                            ? 'text-emerald-600'
                            : 'text-gray-400'
                      }`}
                    >
                      {t('aiSocial.create.step') || 'Step'} {item.step}
                    </div>
                    <div
                      className={`mt-0.5 truncate text-sm font-medium ${
                        isActive ? 'text-gray-900' : 'text-gray-700'
                      }`}
                    >
                      {item.label}
                    </div>
                    {value && (
                      <div className="mt-0.5 truncate text-xs text-gray-500">
                        {value}
                      </div>
                    )}
                  </div>
                </button>

                {/* Connector line between steps */}
                {!isLast && (
                  <div
                    className={`mx-1 h-0.5 w-8 flex-shrink-0 ${
                      isCompleted ? 'bg-emerald-300' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
