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

  return (
    <div className="flex h-full w-72 flex-col border-r border-gray-200 bg-white">
      {/* Header */}
      <div className="border-b border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          {t('aiSocial.create.title')}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {t('aiSocial.create.stepsHint') || 'Complete the steps below'}
        </p>
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-2">
          {steps.map((item, index) => {
            const Icon = item.icon;
            const isCompleted = isStepCompleted(item.step);
            const isActive = isStepActive(item.step);
            const isAccessible = isStepAccessible(item.step);
            const value = item.getValue();

            return (
              <button
                key={item.step}
                onClick={() => isAccessible && setStep(item.step)}
                disabled={!isAccessible || isLoading}
                className={`group relative w-full rounded-xl p-4 text-left transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-rose-50 to-pink-50 ring-2 ring-rose-500'
                    : isCompleted
                      ? 'bg-emerald-50 hover:bg-emerald-100'
                      : isAccessible
                        ? 'bg-gray-50 hover:bg-gray-100'
                        : 'cursor-not-allowed bg-gray-50 opacity-50'
                }`}
              >
                {/* Step number indicator */}
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
                      isActive
                        ? 'bg-gradient-to-br from-rose-500 to-pink-600 text-white'
                        : isCompleted
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-medium ${
                          isActive
                            ? 'text-rose-600'
                            : isCompleted
                              ? 'text-emerald-600'
                              : 'text-gray-400'
                        }`}
                      >
                        {t('aiSocial.create.step') || 'Step'} {item.step}
                      </span>
                    </div>
                    <div
                      className={`mt-0.5 font-medium ${
                        isActive ? 'text-gray-900' : 'text-gray-700'
                      }`}
                    >
                      {item.label}
                    </div>
                    {value && (
                      <div className="mt-1 truncate text-sm text-gray-500">
                        {value}
                      </div>
                    )}
                  </div>
                </div>

                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div
                    className={`absolute bottom-0 left-9 top-16 w-0.5 ${
                      isCompleted ? 'bg-emerald-300' : 'bg-gray-200'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="border-t border-gray-100 p-4">
        <div className="flex flex-col gap-2">
          <button
            onClick={onSaveDraft}
            disabled={
              isLoading ||
              (isSeriesMode ? seriesParts.length === 0 : !title || !content)
            }
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
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
            disabled={
              isLoading ||
              (isSeriesMode ? seriesParts.length === 0 : !title || !content)
            }
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:from-rose-600 hover:to-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPublishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isSeriesMode
              ? t('aiSocial.series.saveAndPublish') || 'Save & go to list'
              : t('aiSocial.create.publish')}
          </button>
        </div>
      </div>
    </div>
  );
}
