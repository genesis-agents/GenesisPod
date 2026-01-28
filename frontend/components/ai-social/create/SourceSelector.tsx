'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useSocialCreateStore } from '@/stores';
import {
  useSocialSources,
  SocialContentSourceType,
} from '@/hooks/domain/useAISocial';
import {
  PenTool,
  Globe,
  Compass,
  BookOpen,
  Briefcase,
  Edit3,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Search,
  Calendar,
  FileText,
} from 'lucide-react';
import { ClientDate } from '@/components/common/ClientDate';

interface SourceItem {
  id: string;
  title: string;
  description?: string;
  type?: string;
  createdAt?: string;
}

export function SourceSelector() {
  const { t } = useTranslation();
  const {
    sourceType,
    sourceId,
    externalUrl,
    setSource,
    setExternalUrl,
    setStep,
  } = useSocialCreateStore();

  const {
    fetchExplore,
    fetchResearch,
    fetchOffice,
    fetchWriting,
    loading: sourcesLoading,
  } = useSocialSources();

  const [sourceItems, setSourceItems] = useState<SourceItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Source options configuration
  const sourceOptions: {
    id: SocialContentSourceType;
    icon: typeof PenTool;
    label: string;
    desc: string;
    gradient: string;
    count?: number;
  }[] = [
    {
      id: 'MANUAL',
      icon: PenTool,
      label: t('aiSocial.sources.manual'),
      desc: t('aiSocial.sources.manualDesc'),
      gradient: 'from-violet-500 to-purple-600',
    },
    {
      id: 'EXTERNAL_URL',
      icon: Globe,
      label: t('aiSocial.sources.external_url'),
      desc: t('aiSocial.sources.externalUrlDesc'),
      gradient: 'from-blue-500 to-cyan-600',
    },
    {
      id: 'AI_EXPLORE',
      icon: Compass,
      label: t('aiSocial.sources.ai_explore'),
      desc: t('aiSocial.sources.aiExploreDesc'),
      gradient: 'from-amber-500 to-orange-600',
    },
    {
      id: 'AI_RESEARCH',
      icon: BookOpen,
      label: t('aiSocial.sources.ai_research'),
      desc: t('aiSocial.sources.aiResearchDesc'),
      gradient: 'from-emerald-500 to-teal-600',
    },
    {
      id: 'AI_OFFICE',
      icon: Briefcase,
      label: t('aiSocial.sources.ai_office'),
      desc: t('aiSocial.sources.aiOfficeDesc'),
      gradient: 'from-rose-500 to-pink-600',
    },
    {
      id: 'AI_WRITING',
      icon: Edit3,
      label: t('aiSocial.sources.ai_writing'),
      desc: t('aiSocial.sources.aiWritingDesc'),
      gradient: 'from-indigo-500 to-blue-600',
    },
  ];

  // Load source items when source type changes
  const loadSourceItems = async (type: SocialContentSourceType) => {
    setError(null);
    try {
      let result: { items: SourceItem[]; total: number } = {
        items: [],
        total: 0,
      };

      switch (type) {
        case 'AI_EXPLORE':
          result = await fetchExplore({ limit: 50 });
          break;
        case 'AI_RESEARCH':
          result = await fetchResearch({ limit: 50 });
          break;
        case 'AI_OFFICE':
          result = await fetchOffice({ limit: 50 });
          break;
        case 'AI_WRITING':
          result = await fetchWriting({ limit: 50 });
          break;
      }

      setSourceItems(result.items || []);
    } catch (err) {
      setError(t('aiSocial.create.loadSourceFailed'));
    }
  };

  useEffect(() => {
    if (
      sourceType &&
      !['MANUAL', 'EXTERNAL_URL'].includes(sourceType) &&
      !sourceId
    ) {
      loadSourceItems(sourceType);
    }
  }, [sourceType]);

  // Handle source type selection
  const handleSourceTypeSelect = (type: SocialContentSourceType) => {
    setSource(type);
    if (type === 'MANUAL') {
      setStep(2);
    }
  };

  // Handle source item selection
  const handleSourceItemSelect = (item: SourceItem) => {
    setSource(sourceType, item.id, item.title);
    setStep(2);
  };

  // Handle URL submission
  const handleUrlSubmit = () => {
    if (!externalUrl.trim()) {
      setError(t('aiSocial.modal.urlRequired'));
      return;
    }
    setStep(2);
  };

  // Filter source items by search query
  const filteredItems = sourceItems.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // If no source type selected, show source type selection
  if (!sourceType) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {t('aiSocial.create.selectSource')}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {t('aiSocial.create.selectSourceDesc') ||
              'Choose where to get your content from'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sourceOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                onClick={() => handleSourceTypeSelect(option.id)}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 text-left transition-all hover:border-transparent hover:shadow-lg"
              >
                {/* Gradient background on hover */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${option.gradient} opacity-0 transition-opacity group-hover:opacity-5`}
                />

                <div
                  className={`mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${option.gradient}`}
                >
                  <Icon className="h-7 w-7 text-white" />
                </div>

                <h3 className="font-semibold text-gray-900">{option.label}</h3>
                <p className="mt-2 text-sm text-gray-500">{option.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // External URL input
  if (sourceType === 'EXTERNAL_URL') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSource(null)}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {t('aiSocial.modal.urlLabel')}
            </h2>
            <p className="text-sm text-gray-500">
              {t('aiSocial.modal.urlHint')}
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-xl space-y-4">
          <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600">
              <Globe className="h-8 w-8 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">
                {t('aiSocial.create.importFromUrl') || 'Import from URL'}
              </h3>
              <p className="text-sm text-gray-500">
                {t('aiSocial.create.importFromUrlDesc') ||
                  "We'll extract the content automatically"}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex flex-wrap gap-2 text-xs text-gray-500">
              <span className="rounded-full bg-gray-100 px-3 py-1">
                {t('aiSocial.create.supportedSites') || 'Supported'}:
              </span>
              <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">
                WeChat
              </span>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">
                Zhihu
              </span>
              <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-700">
                Juejin
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1">+ more</span>
            </div>
          </div>

          <button
            onClick={handleUrlSubmit}
            disabled={!externalUrl.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 px-6 py-3 text-base font-medium text-white transition-all hover:from-blue-600 hover:to-cyan-700 disabled:opacity-50"
          >
            {t('aiSocial.create.extractContent') || 'Extract Content'}
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    );
  }

  // Source items list
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setSource(null)}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {t('aiSocial.create.selectItem', {
              source: t(`aiSocial.sources.${sourceType?.toLowerCase()}`),
            })}
          </h2>
          <p className="text-sm text-gray-500">
            {t('aiSocial.create.selectItemDesc') ||
              'Choose content to transform'}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            t('aiSocial.create.searchContent') || 'Search content...'
          }
          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-12 pr-4 focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Loading */}
      {sourcesLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          <FileText className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4">{t('aiSocial.create.noSourceItems')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleSourceItemSelect(item)}
              className={`group w-full rounded-xl border p-4 text-left transition-all hover:border-rose-300 hover:bg-rose-50 ${
                sourceId === item.id
                  ? 'border-rose-500 bg-rose-50 ring-2 ring-rose-500/20'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                    sourceId === item.id
                      ? 'border-rose-500 bg-rose-500'
                      : 'border-gray-300 group-hover:border-rose-400'
                  }`}
                >
                  {sourceId === item.id && (
                    <div className="h-2 w-2 rounded-full bg-white" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-gray-900">{item.title}</h3>
                  {item.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                      {item.description}
                    </p>
                  )}
                  {item.createdAt && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                      <Calendar className="h-3 w-3" />
                      <ClientDate date={item.createdAt} format="date" />
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
