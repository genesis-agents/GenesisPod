'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';
import {
  FileText,
  Plus,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Edit3,
  Trash2,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  Link,
  Sparkles,
  ArrowLeft,
  Globe,
  Loader2,
} from 'lucide-react';

// Types matching backend
type ContentStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED';
type ContentType = 'WECHAT_ARTICLE' | 'XIAOHONGSHU_NOTE';
type SourceType =
  | 'MANUAL'
  | 'EXTERNAL_URL'
  | 'AI_EXPLORE'
  | 'AI_RESEARCH'
  | 'AI_OFFICE'
  | 'AI_WRITING';

interface SocialContent {
  id: string;
  title: string;
  contentType: ContentType;
  sourceType: SourceType;
  status: ContentStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<
  ContentStatus,
  { icon: typeof CheckCircle; color: string; bgColor: string }
> = {
  DRAFT: { icon: Edit3, color: 'text-gray-600', bgColor: 'bg-gray-100' },
  PENDING: { icon: Clock, color: 'text-amber-600', bgColor: 'bg-amber-100' },
  SCHEDULED: { icon: Clock, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  PUBLISHING: {
    icon: RefreshCw,
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  PUBLISHED: {
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  FAILED: { icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-100' },
};

export default function ContentsTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const [contents, setContents] = useState<SocialContent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'ALL'>(
    'ALL'
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSource, setSelectedSource] = useState<SourceType | null>(null);
  const [modalStep, setModalStep] = useState<1 | 2>(1);
  const [externalUrl, setExternalUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const resetModal = () => {
    setShowCreateModal(false);
    setSelectedSource(null);
    setModalStep(1);
    setExternalUrl('');
    setIsProcessing(false);
  };

  const handleContinue = () => {
    if (!selectedSource) return;

    if (selectedSource === 'EXTERNAL_URL') {
      setModalStep(2);
    } else {
      // For other sources, navigate to a picker page
      router.push(`/ai-social/create?source=${selectedSource}`);
      resetModal();
    }
  };

  const handleProcessUrl = async () => {
    if (!externalUrl.trim()) return;

    setIsProcessing(true);
    try {
      // Navigate to create page with URL
      router.push(
        `/ai-social/create?source=EXTERNAL_URL&url=${encodeURIComponent(externalUrl)}`
      );
      resetModal();
    } catch (error) {
      console.error('Error processing URL:', error);
      setIsProcessing(false);
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    // TODO: Fetch contents from API
    setTimeout(() => setIsLoading(false), 1000);
  };

  const handleDelete = async (contentId: string) => {
    // TODO: Delete via API
    setContents(contents.filter((c) => c.id !== contentId));
  };

  const handlePublish = async (contentId: string) => {
    // TODO: Publish via API
  };

  const getStatusBadge = (status: ContentStatus) => {
    const config = STATUS_CONFIG[status];
    const Icon = config.icon;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bgColor} ${config.color}`}
      >
        <Icon
          className={`h-3 w-3 ${status === 'PUBLISHING' ? 'animate-spin' : ''}`}
        />
        {t(`aiSocial.status.${status.toLowerCase()}`)}
      </span>
    );
  };

  const filteredContents = contents.filter((content) => {
    const matchesSearch = content.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'ALL' || content.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {t('aiSocial.contents.title')}
          </h2>
          <p className="text-sm text-gray-500">
            {t('aiSocial.contents.description')}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            />
            {t('aiSocial.contents.refresh')}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
          >
            <Plus className="h-4 w-4" />
            {t('aiSocial.contents.create')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={t('aiSocial.contents.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as ContentStatus | 'ALL')
            }
            className="rounded-lg border border-gray-200 py-2 pl-3 pr-8 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          >
            <option value="ALL">{t('aiSocial.contents.allStatus')}</option>
            <option value="DRAFT">{t('aiSocial.status.draft')}</option>
            <option value="PENDING">{t('aiSocial.status.pending')}</option>
            <option value="SCHEDULED">{t('aiSocial.status.scheduled')}</option>
            <option value="PUBLISHED">{t('aiSocial.status.published')}</option>
            <option value="FAILED">{t('aiSocial.status.failed')}</option>
          </select>
        </div>
      </div>

      {/* Content List */}
      {filteredContents.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t('aiSocial.contents.table.title')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t('aiSocial.contents.table.type')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t('aiSocial.contents.table.source')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t('aiSocial.contents.table.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t('aiSocial.contents.table.date')}
                </th>
                <th className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredContents.map((content) => (
                <tr key={content.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-gray-400" />
                      <span className="font-medium text-gray-900">
                        {content.title}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {t(
                      `aiSocial.contentTypes.${content.contentType.toLowerCase()}`
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {t(`aiSocial.sources.${content.sourceType.toLowerCase()}`)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    {getStatusBadge(content.status)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {new Date(content.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      {content.status === 'DRAFT' && (
                        <button
                          onClick={() => handlePublish(content.id)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-rose-600"
                          title={t('aiSocial.contents.publish')}
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      )}
                      {content.externalUrl && (
                        <a
                          href={content.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                          title={t('aiSocial.contents.viewExternal')}
                        >
                          <Link className="h-4 w-4" />
                        </a>
                      )}
                      <button
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title={t('aiSocial.contents.preview')}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(content.id)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                        title={t('aiSocial.contents.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Empty State */
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-2 text-lg font-medium text-gray-900">
            {t('aiSocial.contents.emptyTitle')}
          </h3>
          <p className="mb-6 text-sm text-gray-500">
            {t('aiSocial.contents.emptyDescription')}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-700"
          >
            <Plus className="h-4 w-4" />
            {t('aiSocial.contents.createFirst')}
          </button>
        </div>
      )}

      {/* Create Content Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            {/* Step 1: Source Selection */}
            {modalStep === 1 && (
              <>
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100">
                    <Sparkles className="h-5 w-5 text-rose-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {t('aiSocial.contents.createTitle')}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {t('aiSocial.contents.createDescription')}
                    </p>
                  </div>
                </div>

                {/* Source Selection */}
                <div className="mb-6 space-y-3">
                  <label className="text-sm font-medium text-gray-700">
                    {t('aiSocial.contents.selectSource')}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        'EXTERNAL_URL',
                        'AI_EXPLORE',
                        'AI_RESEARCH',
                        'AI_OFFICE',
                        'AI_WRITING',
                      ] as SourceType[]
                    ).map((source) => (
                      <button
                        key={source}
                        type="button"
                        onClick={() => setSelectedSource(source)}
                        className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                          selectedSource === source
                            ? 'border-rose-500 bg-rose-50 ring-1 ring-rose-500'
                            : 'border-gray-200 hover:border-rose-300 hover:bg-rose-50'
                        }`}
                      >
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            selectedSource === source
                              ? 'bg-rose-100'
                              : 'bg-gray-100'
                          }`}
                        >
                          <FileText
                            className={`h-4 w-4 ${
                              selectedSource === source
                                ? 'text-rose-600'
                                : 'text-gray-600'
                            }`}
                          />
                        </div>
                        <span
                          className={`text-sm font-medium ${
                            selectedSource === source
                              ? 'text-rose-700'
                              : 'text-gray-900'
                          }`}
                        >
                          {t(`aiSocial.sources.${source.toLowerCase()}`)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={resetModal}
                    className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleContinue}
                    disabled={!selectedSource}
                    className="flex-1 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('common.continue')}
                  </button>
                </div>
              </>
            )}

            {/* Step 2: External URL Input */}
            {modalStep === 2 && selectedSource === 'EXTERNAL_URL' && (
              <>
                <div className="mb-6 flex items-center gap-3">
                  <button
                    onClick={() => setModalStep(1)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200"
                  >
                    <ArrowLeft className="h-5 w-5 text-gray-600" />
                  </button>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {t('aiSocial.sources.external_url')}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {t('aiSocial.modal.enterUrl')}
                    </p>
                  </div>
                </div>

                {/* URL Input */}
                <div className="mb-6 space-y-3">
                  <label className="text-sm font-medium text-gray-700">
                    {t('aiSocial.modal.urlLabel')}
                  </label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    <input
                      type="url"
                      value={externalUrl}
                      onChange={(e) => setExternalUrl(e.target.value)}
                      placeholder="https://example.com/article"
                      className="w-full rounded-lg border border-gray-200 py-3 pl-11 pr-4 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                    />
                  </div>
                  <p className="text-xs text-gray-500">
                    {t('aiSocial.modal.urlHint')}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={resetModal}
                    className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleProcessUrl}
                    disabled={!externalUrl.trim() || isProcessing}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('aiSocial.modal.processing')}
                      </>
                    ) : (
                      t('aiSocial.modal.processUrl')
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
