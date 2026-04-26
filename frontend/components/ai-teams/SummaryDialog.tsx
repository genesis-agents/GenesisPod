'use client';

import { useState, useEffect } from 'react';
import { Topic, TopicSummary, GenerateSummaryDto } from '@/types/ai-teams';
import type { WebResource } from '@/types/ai-office';
import { useAIModels } from '@/hooks';
import * as api from '@/services/ai-teams/api';
import { useResourceStore } from '@/stores/aiOfficeStore';
import { FileText, Download, CheckCircle } from 'lucide-react';

import { logger } from '@/lib/utils/logger';
import { formatDateSafe } from '@/lib/utils/date';
import ClientDate from '@/components/common/ClientDate';
interface SummaryDialogProps {
  topic: Topic;
  onClose: () => void;
}

export default function SummaryDialog({ topic, onClose }: SummaryDialogProps) {
  const [summaries, setSummaries] = useState<TopicSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<TopicSummary | null>(
    null
  );
  const [exportedSummaries, setExportedSummaries] = useState<Set<string>>(
    new Set()
  );
  const { models: aiModels } = useAIModels();
  const aiOfficeStore = useResourceStore();

  // 查找模型：优先用 modelId 匹配，兼容旧数据
  const findModel = (aiModel: string) => {
    const models = aiModels || [];
    return (
      models.find((m) => m.modelId === aiModel) ||
      models.find((m) => m.modelName === aiModel) ||
      models.find((m) => m.id === aiModel)
    );
  };

  useEffect(() => {
    loadSummaries();
  }, [topic.id]);

  const loadSummaries = async () => {
    setIsLoading(true);
    try {
      const data = await api.getSummaries(topic.id);
      setSummaries(data);
    } catch (error) {
      logger.error('Failed to load summaries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSummary = async (summaryId: string) => {
    try {
      await api.deleteSummary(topic.id, summaryId);
      setSummaries((prev) => prev.filter((s) => s.id !== summaryId));
      if (selectedSummary?.id === summaryId) {
        setSelectedSummary(null);
      }
    } catch (error) {
      logger.error('Failed to delete summary:', error);
    }
  };

  const handleExportToAIOffice = (summary: TopicSummary) => {
    const resourceId = `summary-${summary.id}`;

    // Check if already exported
    if (aiOfficeStore.resources.some((r) => r._id === resourceId)) {
      return;
    }

    // Convert summary to AI Office resource format
    const summaryAsResource: WebResource = {
      _id: resourceId,
      userId: 'current-user',
      resourceId: summary.id,
      resourceType: 'web_page',
      status: 'collected',
      collectedAt: new Date(),
      updatedAt: new Date(),
      url: '',
      metadata: {
        title: summary.title,
        description: `AI Team Summary from "${topic.name}"`,
        author: '',
        publishedAt: new Date(),
        siteName: 'AI Teams',
        language: 'en',
      },
      content: {
        rawHtml: '',
        cleanedText: summary.content,
        images: [],
        links: [],
      },
      aiAnalysis: {
        summary: summary.content,
        mainTopics: ['ai-team-summary'],
        keyInsights: [],
        credibility: 100,
      },
    };

    aiOfficeStore.addResource(summaryAsResource);
    setExportedSummaries((prev) => new Set([...prev, summary.id]));
  };

  const isExported = (summaryId: string) => {
    return (
      exportedSummaries.has(summaryId) ||
      aiOfficeStore.resources.some((r) => r._id === `summary-${summaryId}`)
    );
  };

  // formatDate removed - using ClientDate component for hydration safety

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[80vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Meeting Summaries
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGenerateDialog(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
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
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              Generate Summary
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Summaries List */}
          <div className="w-1/3 overflow-auto border-r border-gray-200">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
              </div>
            ) : summaries.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <svg
                  className="h-12 w-12 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="mt-2 text-sm text-gray-500">No summaries yet</p>
                <p className="text-xs text-gray-400">
                  Generate your first summary
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {summaries.map((summary) => (
                  <button
                    key={summary.id}
                    onClick={() => setSelectedSummary(summary)}
                    className={`w-full p-4 text-left transition-colors ${
                      selectedSummary?.id === summary.id
                        ? 'bg-blue-50'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <h3 className="truncate font-medium text-gray-900">
                      {summary.title}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      <ClientDate date={summary.createdAt} format="datetime" />
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      by{' '}
                      {summary.createdBy.fullName || summary.createdBy.username}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Summary Content */}
          <div className="flex-1 overflow-auto p-6">
            {selectedSummary ? (
              <div>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      {selectedSummary.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Generated on{' '}
                      <ClientDate
                        date={selectedSummary.createdAt}
                        format="datetime"
                      />{' '}
                      by{' '}
                      {selectedSummary.createdBy.fullName ||
                        selectedSummary.createdBy.username}
                    </p>
                    {selectedSummary.generatedBy && (
                      <p className="text-xs text-gray-400">
                        AI Model:{' '}
                        {findModel(selectedSummary.generatedBy)?.name ||
                          selectedSummary.generatedBy}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Export to AI Office Button */}
                    <button
                      onClick={() => handleExportToAIOffice(selectedSummary)}
                      disabled={isExported(selectedSummary.id)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        isExported(selectedSummary.id)
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
                      title={
                        isExported(selectedSummary.id)
                          ? 'Already in AI Office'
                          : 'Export to AI Office'
                      }
                    >
                      {isExported(selectedSummary.id) ? (
                        <>
                          <CheckCircle className="h-4 w-4" />
                          Exported
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4" />
                          Add to AI Office
                        </>
                      )}
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => handleDeleteSummary(selectedSummary.id)}
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete summary"
                    >
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-gray-700">
                    {selectedSummary.content}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-gray-400">
                <svg
                  className="h-16 w-16"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="mt-2 text-lg">Select a summary to view</p>
              </div>
            )}
          </div>
        </div>

        {/* Generate Summary Dialog */}
        {showGenerateDialog && (
          <GenerateSummaryDialog
            topicId={topic.id}
            aiModels={aiModels}
            onGenerate={async (summary) => {
              setSummaries((prev) => [summary, ...prev]);
              setSelectedSummary(summary);
              setShowGenerateDialog(false);
            }}
            onClose={() => setShowGenerateDialog(false)}
          />
        )}
      </div>
    </div>
  );
}

// Generate Summary Dialog
function GenerateSummaryDialog({
  topicId,
  aiModels,
  onGenerate,
  onClose,
}: {
  topicId: string;
  aiModels: ReturnType<typeof useAIModels>['models'];
  onGenerate: (summary: TopicSummary) => void;
  onClose: () => void;
}) {
  // 默认选择第一个模型的 modelId
  const defaultModelId = aiModels[0]?.modelId || 'grok-3-latest';
  const [title, setTitle] = useState('');
  const [selectedModel, setSelectedModel] = useState(defaultModelId);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const summary = await api.generateSummary(topicId, {
        title:
          title.trim() || `Summary - ${formatDateSafe(new Date(), 'date')}`,
        aiModel: selectedModel,
      });
      onGenerate(summary);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to generate summary'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">
          Generate Summary
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Weekly Discussion Summary"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              AI Model
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(aiModels || []).map((model) => (
                <button
                  key={model.id}
                  onClick={() => setSelectedModel(model.modelId)}
                  className={`flex items-center gap-2 rounded-lg border-2 p-3 text-left transition-colors ${
                    selectedModel === model.modelId
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {model.iconUrl ? (
                    <img
                      src={model.iconUrl}
                      alt={model.name}
                      className="h-5 w-5"
                    />
                  ) : (
                    <span className="text-xl">{model.icon}</span>
                  )}
                  <span className="text-sm font-medium">{model.name}</span>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <p className="text-xs text-gray-500">
            The AI will analyze all messages in this topic and generate a
            comprehensive summary of the discussion.
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Generating...
              </>
            ) : (
              <>
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
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
                Generate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
