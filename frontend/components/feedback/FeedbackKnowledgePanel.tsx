'use client';

import { useState } from 'react';
import ClientDate from '@/components/common/ClientDate';
import {
  type ResearchFeedbackKnowledge,
  type ImprovementType,
  type CreateKnowledgeDto,
} from '@/hooks/domain/useResearchFeedback';
import {
  useKnowledgeItems,
  useCreateKnowledge,
  useApplyImprovement,
  useEvaluateEffect,
  useExtractKnowledge,
} from '@/hooks/domain/useResearchFeedback';
import {
  FileText,
  Settings,
  Shield,
  BookOpen,
  CheckCircle,
  Clock,
  Star,
  Loader2,
  Plus,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

const improvementTypeConfig: Record<
  ImprovementType,
  { label: string; icon: React.ReactNode; color: string }
> = {
  PROMPT_UPDATE: {
    label: 'Prompt 更新',
    icon: <FileText className="h-4 w-4" />,
    color: 'bg-blue-100 text-blue-700',
  },
  STRATEGY_CHANGE: {
    label: '策略调整',
    icon: <Settings className="h-4 w-4" />,
    color: 'bg-purple-100 text-purple-700',
  },
  QUALITY_RULE: {
    label: '质量规则',
    icon: <Shield className="h-4 w-4" />,
    color: 'bg-green-100 text-green-700',
  },
  DOCUMENTATION: {
    label: '文档更新',
    icon: <BookOpen className="h-4 w-4" />,
    color: 'bg-orange-100 text-orange-700',
  },
};

interface KnowledgeItemRowProps {
  item: ResearchFeedbackKnowledge;
  onApply: (id: string) => void;
  onEvaluate: (id: string, score: number) => void;
  applying?: boolean;
}

function KnowledgeItemRow({
  item,
  onApply,
  onEvaluate,
  applying,
}: KnowledgeItemRowProps) {
  const [showEvaluate, setShowEvaluate] = useState(false);
  const typeConfig = improvementTypeConfig[item.improvementType];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs ${typeConfig.color}`}>
              <span className="flex items-center gap-1">
                {typeConfig.icon}
                {typeConfig.label}
              </span>
            </span>
            {item.appliedAt ? (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="h-3 w-3" />
                已应用
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                待应用
              </span>
            )}
          </div>
          <h4 className="mt-2 font-medium text-gray-900">{item.title}</h4>
          <p className="mt-1 line-clamp-2 text-sm text-gray-600">
            {item.content}
          </p>
          {item.tags && item.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Effect score */}
        {item.effectScore !== null && item.effectScore !== undefined && (
          <div className="ml-4 flex flex-col items-center">
            <div className="flex items-center gap-1 text-amber-500">
              <Star className="h-4 w-4 fill-current" />
              <span className="font-medium">{item.effectScore.toFixed(1)}</span>
            </div>
            <span className="text-xs text-gray-400">效果</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2 border-t pt-3">
        {!item.appliedAt && (
          <button
            onClick={() => onApply(item.id)}
            disabled={applying}
            className="flex items-center gap-1 rounded bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-200 disabled:opacity-50"
          >
            {applying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle className="h-3 w-3" />
            )}
            应用改进
          </button>
        )}

        {item.appliedAt && item.effectScore === null && (
          <>
            {!showEvaluate ? (
              <button
                onClick={() => setShowEvaluate(true)}
                className="flex items-center gap-1 rounded bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-200"
              >
                <Star className="h-3 w-3" />
                评估效果
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">评分:</span>
                {[1, 2, 3, 4, 5].map((score) => (
                  <button
                    key={score}
                    onClick={() => {
                      onEvaluate(item.id, score);
                      setShowEvaluate(false);
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded border border-amber-300 text-xs text-amber-600 hover:bg-amber-100"
                  >
                    {score}
                  </button>
                ))}
                <button
                  onClick={() => setShowEvaluate(false)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  取消
                </button>
              </div>
            )}
          </>
        )}

        <ClientDate
          date={item.createdAt}
          format="date"
          className="ml-auto text-xs text-gray-400"
        />
      </div>
    </div>
  );
}

interface CreateKnowledgeModalProps {
  feedbackId: string;
  suggestion?: CreateKnowledgeDto | null;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateKnowledgeModal({
  feedbackId,
  suggestion,
  onClose,
  onSuccess,
}: CreateKnowledgeModalProps) {
  const [formData, setFormData] = useState<CreateKnowledgeDto>(
    suggestion || {
      title: '',
      content: '',
      tags: [],
      improvementType: 'PROMPT_UPDATE',
    }
  );
  const [tagInput, setTagInput] = useState('');
  const { execute: createKnowledge, loading } = useCreateKnowledge();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createKnowledge(feedbackId, formData);
    onSuccess();
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags?.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...(formData.tags || []), tagInput.trim()],
      });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags?.filter((t) => t !== tag),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold">沉淀为知识</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              标题
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              内容
            </label>
            <textarea
              value={formData.content}
              onChange={(e) =>
                setFormData({ ...formData, content: e.target.value })
              }
              rows={4}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              改进类型
            </label>
            <select
              value={formData.improvementType}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  improvementType: e.target.value as ImprovementType,
                })
              }
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {Object.entries(improvementTypeConfig).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              标签
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) =>
                  e.key === 'Enter' && (e.preventDefault(), addTag())
                }
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="输入标签后回车"
              />
              <button
                type="button"
                onClick={addTag}
                className="rounded bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200"
              >
                添加
              </button>
            </div>
            {formData.tags && formData.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              创建知识
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface FeedbackKnowledgePanelProps {
  feedbackIdForCreate?: string;
  onCloseCreateModal?: () => void;
}

export function FeedbackKnowledgePanel({
  feedbackIdForCreate,
  onCloseCreateModal,
}: FeedbackKnowledgePanelProps) {
  const { data, loading, refresh } = useKnowledgeItems({ limit: 20 });
  const { execute: applyImprovement, loading: applying } =
    useApplyImprovement();
  const { execute: evaluateEffect } = useEvaluateEffect();
  const { execute: extractKnowledge, loading: extracting } =
    useExtractKnowledge();
  const [suggestion, setSuggestion] = useState<CreateKnowledgeDto | null>(null);

  const handleApply = async (id: string) => {
    await applyImprovement(id);
    refresh();
  };

  const handleEvaluate = async (id: string, score: number) => {
    await evaluateEffect(id, score);
    refresh();
  };

  const handleExtractKnowledge = async () => {
    if (!feedbackIdForCreate) return;
    const result = await extractKnowledge(feedbackIdForCreate);
    if (result?.shouldExtract && result.suggestion) {
      setSuggestion(result.suggestion);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">知识库</h3>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>共 {data?.total || 0} 条</span>
        </div>
      </div>

      {/* List */}
      {data?.items && data.items.length > 0 ? (
        <div className="space-y-3">
          {data.items.map((item) => (
            <KnowledgeItemRow
              key={item.id}
              item={item}
              onApply={handleApply}
              onEvaluate={handleEvaluate}
              applying={applying}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-gray-500">
          <BookOpen className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2">暂无知识条目</p>
          <p className="text-xs">从反馈中沉淀知识后将显示在这里</p>
        </div>
      )}

      {/* Create Modal */}
      {feedbackIdForCreate && (
        <CreateKnowledgeModal
          feedbackId={feedbackIdForCreate}
          suggestion={suggestion}
          onClose={() => {
            setSuggestion(null);
            onCloseCreateModal?.();
          }}
          onSuccess={() => {
            setSuggestion(null);
            onCloseCreateModal?.();
            refresh();
          }}
        />
      )}
    </div>
  );
}
