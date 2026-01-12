'use client';

/**
 * Create Topic Dialog Component
 *
 * 创建研究专题的对话框
 */

import { useState, useEffect } from 'react';
import type {
  ResearchTopic,
  CreateTopicDto,
  ResearchTemplate,
} from '@/types/topic-research';
import { ResearchTopicType, RefreshFrequency } from '@/types/topic-research';
import { useTopicResearchStore } from '@/stores/topicResearchStore';

interface CreateTopicDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (topic: ResearchTopic) => void;
  defaultType?: ResearchTopicType;
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

// Topic type configurations
const topicTypeOptions = [
  {
    type: ResearchTopicType.MACRO,
    label: '宏观洞察',
    description: '追踪行业趋势、政策变化、市场动态',
    icon: (
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
    gradient: 'from-blue-500 to-cyan-600',
    borderColor: 'border-blue-500',
    bgColor: 'bg-blue-50',
  },
  {
    type: ResearchTopicType.TECHNOLOGY,
    label: '技术趋势',
    description: '跟踪技术发展、学术研究、开源项目',
    icon: (
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
    gradient: 'from-purple-500 to-pink-600',
    borderColor: 'border-purple-500',
    bgColor: 'bg-purple-50',
  },
  {
    type: ResearchTopicType.COMPANY,
    label: '企业追踪',
    description: '监控企业动态、竞争对手、投融资信息',
    icon: (
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
    gradient: 'from-emerald-500 to-teal-600',
    borderColor: 'border-emerald-500',
    bgColor: 'bg-emerald-50',
  },
];

const frequencyOptions = [
  { value: RefreshFrequency.DAILY, label: '每日', description: '每天自动刷新' },
  {
    value: RefreshFrequency.WEEKLY,
    label: '每周',
    description: '每周一自动刷新',
  },
  {
    value: RefreshFrequency.BIWEEKLY,
    label: '双周',
    description: '每两周刷新',
  },
  {
    value: RefreshFrequency.MONTHLY,
    label: '每月',
    description: '每月初自动刷新',
  },
  {
    value: RefreshFrequency.MANUAL,
    label: '手动',
    description: '仅手动触发刷新',
  },
];

export function CreateTopicDialog({
  isOpen,
  onClose,
  onCreated,
  defaultType = ResearchTopicType.MACRO,
}: CreateTopicDialogProps) {
  const { createTopic, fetchTemplates, templates, isLoadingTemplates } =
    useTopicResearchStore();

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load templates when type changes
  useEffect(() => {
    if (isOpen && selectedType) {
      fetchTemplates(selectedType);
    }
  }, [isOpen, selectedType, fetchTemplates]);

  // Reset when dialog opens
  useEffect(() => {
    if (isOpen) {
      setStep('type');
      setSelectedType(defaultType);
      setSelectedTemplate(null);
      setName('');
      setDescription('');
      setRefreshFrequency(RefreshFrequency.WEEKLY);
      setError(null);
    }
  }, [isOpen, defaultType]);

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
      const dto: CreateTopicDto = {
        name: name.trim(),
        description: description.trim() || undefined,
        type: selectedType,
        refreshFrequency,
        dimensions: selectedTemplate?.dimensions,
      };

      const topic = await createTopic(dto);
      onCreated(topic);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建专题失败');
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
            {step === 'type' ? '选择专题类型' : '创建研究专题'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {step === 'type'
              ? '选择一个专题类型开始您的研究'
              : '配置专题信息和刷新频率'}
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {step === 'type' ? (
            // Step 1: Select Type
            <div className="grid grid-cols-3 gap-4">
              {topicTypeOptions.map((option) => (
                <button
                  key={option.type}
                  onClick={() => handleTypeSelect(option.type)}
                  className={`flex flex-col items-center rounded-xl border-2 p-6 transition-all ${
                    selectedType === option.type
                      ? `${option.borderColor} ${option.bgColor}`
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div
                    className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${option.gradient} text-white shadow-md`}
                  >
                    {option.icon}
                  </div>
                  <span className="font-medium text-gray-900">
                    {option.label}
                  </span>
                  <span className="mt-1 text-center text-xs text-gray-500">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            // Step 2: Details Form
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Templates */}
              {templates.length > 0 && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    选择模板 (可选)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {isLoadingTemplates ? (
                      <div className="col-span-2 flex items-center justify-center py-4">
                        <LoaderIcon className="h-5 w-5 animate-spin text-gray-400" />
                      </div>
                    ) : (
                      templates.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => handleTemplateSelect(template)}
                          className={`rounded-lg border p-3 text-left transition-all ${
                            selectedTemplate?.id === template.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span className="block text-sm font-medium text-gray-900">
                            {template.name}
                          </span>
                          <span className="mt-0.5 block text-xs text-gray-500">
                            {template.dimensions.length} 个研究维度
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  专题名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：AI 大模型行业研究"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  专题描述 (可选)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="描述您想要研究的内容和关注点..."
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Refresh Frequency */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  刷新频率
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

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
          <div>
            {step === 'details' && (
              <button
                type="button"
                onClick={() => setStep('type')}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                ← 返回选择类型
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              取消
            </button>
            {step === 'details' && (
              <button
                onClick={handleSubmit}
                disabled={!name.trim() || loading}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading && <LoaderIcon className="h-4 w-4 animate-spin" />}
                创建专题
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
