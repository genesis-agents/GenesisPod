'use client';

/**
 * Create Topic Dialog Component
 *
 * 创建研究专题的对话框
 */

import { useState, useEffect, useMemo } from 'react';
import type {
  ResearchTopic,
  CreateTopicDto,
  ResearchTemplate,
  TopicVisibility,
} from '@/types/topic-research';
import { ResearchTopicType, RefreshFrequency } from '@/types/topic-research';
import { useTopicResearchStore } from '@/stores/topicResearchStore';
import { useTranslation } from '@/lib/i18n';
import { KnowledgeBaseSelector } from '@/components/common/selectors';

interface CreateTopicDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (topic: ResearchTopic) => void;
  defaultType?: ResearchTopicType;
  editTopic?: ResearchTopic | null; // ★ 编辑模式：传入要编辑的专题
}

// Icons
const LoaderIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

// Topic type icons configuration
const topicTypeIcons = {
  [ResearchTopicType.MACRO]: (
    <svg
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  [ResearchTopicType.TECHNOLOGY]: (
    <svg
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
      />
    </svg>
  ),
  [ResearchTopicType.COMPANY]: (
    <svg
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  ),
};

const topicTypeStyles = {
  [ResearchTopicType.MACRO]: {
    gradient: 'from-blue-500 to-cyan-600',
    borderColor: 'border-blue-500',
    bgColor: 'bg-blue-50',
  },
  [ResearchTopicType.TECHNOLOGY]: {
    gradient: 'from-purple-500 to-pink-600',
    borderColor: 'border-purple-500',
    bgColor: 'bg-purple-50',
  },
  [ResearchTopicType.COMPANY]: {
    gradient: 'from-emerald-500 to-teal-600',
    borderColor: 'border-emerald-500',
    bgColor: 'bg-emerald-50',
  },
};

// Time range value type
type TimeRangeValue =
  | 'all'
  | '6months'
  | '1year'
  | '2years'
  | '3years'
  | '5years';

export function CreateTopicDialog({
  isOpen,
  onClose,
  onCreated,
  defaultType = ResearchTopicType.MACRO,
  editTopic = null, // ★ 编辑模式
}: CreateTopicDialogProps) {
  const { t } = useTranslation();
  const {
    createTopic,
    updateTopic, // ★ 更新专题
    fetchTemplates,
    templates: rawTemplates,
    isLoadingTemplates,
  } = useTopicResearchStore();

  // ★ 是否为编辑模式
  const isEditMode = !!editTopic;

  // Ensure templates is always an array
  const templates = Array.isArray(rawTemplates) ? rawTemplates : [];

  const [step, setStep] = useState<'type' | 'details'>('type');
  const [selectedType, setSelectedType] =
    useState<ResearchTopicType>(defaultType);
  const [selectedTemplate, setSelectedTemplate] =
    useState<ResearchTemplate | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [refreshFrequency, setRefreshFrequency] = useState<RefreshFrequency>(
    RefreshFrequency.WEEKLY
  );
  const [searchTimeRange, setSearchTimeRange] =
    useState<TimeRangeValue>('6months');
  const [selectedKnowledgeBases, setSelectedKnowledgeBases] = useState<
    string[]
  >([]);
  const [visibility, setVisibility] = useState<TopicVisibility>('PRIVATE'); // ★ 默认私有
  const [language, setLanguage] = useState<'zh' | 'en'>('zh'); // ★ 报告语言，默认中文
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ★ 可见性选项 (使用 i18n)
  const visibilityOptions = useMemo(
    () => [
      {
        value: 'PRIVATE' as TopicVisibility,
        label: t('topicResearch.sharing.visibility.private'),
        description: t('topicResearch.sharing.visibility.privateDesc'),
        icon: (
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        ),
      },
      {
        value: 'SHARED' as TopicVisibility,
        label: t('topicResearch.sharing.visibility.shared'),
        description: t('topicResearch.sharing.visibility.sharedDesc'),
        icon: (
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        ),
      },
      {
        value: 'PUBLIC' as TopicVisibility,
        label: t('topicResearch.sharing.visibility.public'),
        description: t('topicResearch.sharing.visibility.publicDesc'),
        icon: (
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        ),
      },
    ],
    [t]
  );

  // Build options with i18n
  const topicTypeOptions = useMemo(
    () => [
      {
        type: ResearchTopicType.MACRO,
        label: t('topicResearch.types.macro'),
        description: t('topicResearch.types.macroDesc'),
      },
      {
        type: ResearchTopicType.TECHNOLOGY,
        label: t('topicResearch.types.technology'),
        description: t('topicResearch.types.technologyDesc'),
      },
      {
        type: ResearchTopicType.COMPANY,
        label: t('topicResearch.types.company'),
        description: t('topicResearch.types.companyDesc'),
      },
    ],
    [t]
  );

  const frequencyOptions = useMemo(
    () => [
      {
        value: RefreshFrequency.DAILY,
        label: t('topicResearch.frequency.daily'),
        description: t('topicResearch.frequency.dailyDesc'),
      },
      {
        value: RefreshFrequency.WEEKLY,
        label: t('topicResearch.frequency.weekly'),
        description: t('topicResearch.frequency.weeklyDesc'),
      },
      {
        value: RefreshFrequency.BIWEEKLY,
        label: t('topicResearch.frequency.biweekly'),
        description: t('topicResearch.frequency.biweeklyDesc'),
      },
      {
        value: RefreshFrequency.MONTHLY,
        label: t('topicResearch.frequency.monthly'),
        description: t('topicResearch.frequency.monthlyDesc'),
      },
      {
        value: RefreshFrequency.MANUAL,
        label: t('topicResearch.frequency.manual'),
        description: t('topicResearch.frequency.manualDesc'),
      },
    ],
    [t]
  );

  const timeRangeOptions = useMemo(
    () => [
      {
        value: 'all' as const,
        label: t('topicResearch.timeRange.all'),
        description: t('topicResearch.timeRange.allDesc'),
      },
      {
        value: '6months' as const,
        label: t('topicResearch.timeRange.6months'),
        description: t('topicResearch.timeRange.6monthsDesc'),
      },
      {
        value: '1year' as const,
        label: t('topicResearch.timeRange.1year'),
        description: t('topicResearch.timeRange.1yearDesc'),
      },
      {
        value: '2years' as const,
        label: t('topicResearch.timeRange.2years'),
        description: t('topicResearch.timeRange.2yearsDesc'),
      },
      {
        value: '3years' as const,
        label: t('topicResearch.timeRange.3years'),
        description: t('topicResearch.timeRange.3yearsDesc'),
      },
      {
        value: '5years' as const,
        label: t('topicResearch.timeRange.5years'),
        description: t('topicResearch.timeRange.5yearsDesc'),
      },
    ],
    [t]
  );

  // Load templates when type changes
  useEffect(() => {
    if (isOpen && selectedType) {
      fetchTemplates(selectedType);
    }
  }, [isOpen, selectedType, fetchTemplates]);

  // Reset when dialog opens
  useEffect(() => {
    if (isOpen) {
      if (editTopic) {
        // ★ 编辑模式：使用现有专题数据填充表单
        setStep('details'); // 直接进入详情步骤
        setSelectedType(editTopic.type);
        setSelectedTemplate(null);
        setName(editTopic.name);
        setDescription(editTopic.description || '');
        setRefreshFrequency(
          editTopic.refreshFrequency || RefreshFrequency.WEEKLY
        );
        setSearchTimeRange(
          (editTopic.topicConfig as { searchTimeRange?: TimeRangeValue })
            ?.searchTimeRange || '6months'
        );
        setSelectedKnowledgeBases(
          (editTopic.topicConfig as { knowledgeBaseIds?: string[] })
            ?.knowledgeBaseIds || []
        );
        setVisibility((editTopic.visibility as TopicVisibility) || 'PRIVATE');
        setLanguage((editTopic.language as 'zh' | 'en') || 'zh');
        setError(null);
      } else {
        // ★ 创建模式：重置表单
        setStep('type');
        setSelectedType(defaultType);
        setSelectedTemplate(null);
        setName('');
        setDescription('');
        setRefreshFrequency(RefreshFrequency.WEEKLY);
        setSearchTimeRange('6months');
        setSelectedKnowledgeBases([]);
        setVisibility('PRIVATE');
        setLanguage('zh');
        setError(null);
      }
    }
  }, [isOpen, defaultType, editTopic]);

  const handleTypeSelect = (type: ResearchTopicType) => {
    setSelectedType(type);
    setSelectedTemplate(null);
    setStep('details');
  };

  const handleTemplateSelect = (template: ResearchTemplate) => {
    setSelectedTemplate(template);
    setName(template.name);
    setDescription(template.description);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Build topicConfig with searchTimeRange and knowledgeBaseIds
      const topicConfig: Record<string, unknown> = {};
      if (searchTimeRange !== 'all') {
        topicConfig.searchTimeRange = searchTimeRange;
      }
      if (selectedKnowledgeBases.length > 0) {
        topicConfig.knowledgeBaseIds = selectedKnowledgeBases;
      }

      if (isEditMode && editTopic) {
        // ★ 编辑模式：更新专题
        const updateDto = {
          name: name.trim(),
          description: description.trim() || undefined,
          refreshFrequency,
          visibility,
          language,
          topicConfig:
            Object.keys(topicConfig).length > 0 ? topicConfig : undefined,
        };

        console.log('★ [CreateTopicDialog] Updating topic:', {
          id: editTopic.id,
          ...updateDto,
        });

        const topic = await updateTopic(editTopic.id, updateDto);
        console.log('★ [CreateTopicDialog] Updated topic:', topic);
        onCreated(topic);
        onClose();
      } else {
        // ★ 创建模式：创建新专题
        const dto: CreateTopicDto = {
          name: name.trim(),
          description: description.trim() || undefined,
          type: selectedType,
          refreshFrequency,
          visibility,
          language,
          dimensions: selectedTemplate?.dimensions,
          topicConfig:
            Object.keys(topicConfig).length > 0 ? topicConfig : undefined,
        };

        console.log('★ [CreateTopicDialog] Creating topic:', dto);

        const topic = await createTopic(dto);
        console.log('★ [CreateTopicDialog] Created topic:', topic);
        onCreated(topic);
        onClose();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEditMode
            ? '更新失败，请重试'
            : t('topicResearch.createDialog.createFailed')
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditMode
              ? '编辑专题'
              : step === 'type'
                ? t('topicResearch.createDialog.selectType')
                : t('topicResearch.createDialog.configTopic')}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {isEditMode
              ? '修改专题的基本信息和设置'
              : step === 'type'
                ? t('topicResearch.createDialog.selectTypeHint')
                : t('topicResearch.createDialog.configHint')}
          </p>
        </div>

        {/* Content */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
          {step === 'type' ? (
            // Step 1: Select Type
            <div className="grid grid-cols-3 gap-4">
              {topicTypeOptions.map((option) => {
                const styles = topicTypeStyles[option.type];
                return (
                  <button
                    key={option.type}
                    onClick={() => handleTypeSelect(option.type)}
                    className={`flex flex-col items-center rounded-xl border-2 p-6 transition-all ${
                      selectedType === option.type
                        ? `${styles.borderColor} ${styles.bgColor}`
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div
                      className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${styles.gradient} text-white shadow-md`}
                    >
                      {topicTypeIcons[option.type]}
                    </div>
                    <span className="font-medium text-gray-900">
                      {option.label}
                    </span>
                    <span className="mt-1 text-center text-xs text-gray-500">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            // Step 2: Details Form
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* AI Planning Notice - v8.0: 维度由 AI 自动规划 */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                    <svg
                      className="h-4 w-4 text-blue-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-blue-900">
                      {t('topicResearch.createDialog.aiPlanningTitle')}
                    </h4>
                    <p className="mt-1 text-xs text-blue-700">
                      {t('topicResearch.createDialog.aiPlanningDesc')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t('topicResearch.createDialog.topicName')}{' '}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t(
                    'topicResearch.createDialog.topicNamePlaceholder'
                  )}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  {t('topicResearch.createDialog.topicDesc')}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t(
                    'topicResearch.createDialog.topicDescPlaceholder'
                  )}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Refresh Frequency */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {t('topicResearch.createDialog.refreshFrequency')}
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {frequencyOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRefreshFrequency(option.value)}
                      className={`rounded-lg border px-3 py-2 text-center transition-all ${
                        refreshFrequency === option.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="block text-sm font-medium">
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Range */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {t('topicResearch.createDialog.searchTimeRange')}
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {t('topicResearch.createDialog.searchTimeRangeHint')}
                  </span>
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {timeRangeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSearchTimeRange(option.value)}
                      className={`rounded-lg border px-3 py-2 text-center transition-all ${
                        searchTimeRange === option.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                      title={option.description}
                    >
                      <span className="block text-sm font-medium">
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ★ Visibility Selector */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {t('topicResearch.sharing.visibility.title')}
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {t('topicResearch.visibilityDesc')}
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {visibilityOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setVisibility(option.value)}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 transition-all ${
                        visibility === option.value
                          ? option.value === 'PRIVATE'
                            ? 'border-gray-500 bg-gray-50 text-gray-700'
                            : option.value === 'SHARED'
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-green-500 bg-green-50 text-green-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                      title={option.description}
                    >
                      {option.icon}
                      <span className="text-sm font-medium">
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ★ Language Selector */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {t('topicResearch.language')}
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {t('topicResearch.languageDesc')}
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLanguage('zh')}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 transition-all ${
                      language === 'zh'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-sm font-medium">
                      {t('topicResearch.languageOptions.zh')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage('en')}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 transition-all ${
                      language === 'en'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-sm font-medium">
                      {t('topicResearch.languageOptions.en')}
                    </span>
                  </button>
                </div>
              </div>

              {/* Knowledge Base Selector */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {t('topicResearch.createDialog.knowledgeBase')}
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {t('topicResearch.createDialog.knowledgeBaseHint')}
                  </span>
                </label>
                <KnowledgeBaseSelector
                  selectedIds={selectedKnowledgeBases}
                  onSelectionChange={setSelectedKnowledgeBases}
                  multiple={true}
                  maxSelections={5}
                  placeholder={t(
                    'topicResearch.createDialog.knowledgeBasePlaceholder'
                  )}
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {typeof error === 'string' ? error : '操作失败，请重试'}
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
          <div>
            {/* ★ 编辑模式不显示返回按钮 */}
            {step === 'details' && !isEditMode && (
              <button
                type="button"
                onClick={() => setStep('type')}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                {t('topicResearch.createDialog.backToType')}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              {t('common.cancel')}
            </button>
            {step === 'details' && (
              <button
                onClick={handleSubmit}
                disabled={!name.trim() || loading}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading && <LoaderIcon className="h-4 w-4 animate-spin" />}
                {isEditMode ? '保存修改' : t('topicResearch.createTopic')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
