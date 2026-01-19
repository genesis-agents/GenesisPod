'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';
import { useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/layout/AppShell';
import {
  useSocialAIEngine,
  useSocialContents,
  useSocialPublish,
  SocialContentType,
  SocialContentSourceType,
  SocialContent,
} from '@/hooks/domain/useAISocial';
import { toast } from '@/stores/toastStore';
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  FileText,
  Send,
  Save,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

function CreateSocialContentForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, isAdmin } = useAuth();

  const source = searchParams.get('source') as SocialContentSourceType | null;
  const url = searchParams.get('url');
  const sourceId = searchParams.get('sourceId');

  // Hooks
  const {
    processFromUrl,
    processFromSource,
    regenerate,
    loading: aiLoading,
    error: aiError,
  } = useSocialAIEngine();
  const {
    addContent,
    editContent,
    loading: contentLoading,
    error: contentError,
  } = useSocialContents();
  const { publish, loading: publishLoading } = useSocialPublish();

  // State
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPlatform, setSelectedPlatform] =
    useState<SocialContentType | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [digest, setDigest] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [currentContent, setCurrentContent] = useState<SocialContent | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  // Auto-process URL or source when provided
  useEffect(() => {
    if (source === 'EXTERNAL_URL' && url && selectedPlatform) {
      handleProcessUrl(url);
    } else if (source && sourceId && selectedPlatform && source !== 'MANUAL') {
      handleProcessSource(source, sourceId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlatform]);

  const handleProcessUrl = async (urlToProcess: string) => {
    if (!selectedPlatform) {
      setError(t('aiSocial.create.selectPlatformFirst'));
      return;
    }

    setIsProcessing(true);
    setError(null);

    const result = await processFromUrl({
      url: urlToProcess,
      targetType: selectedPlatform,
    });

    setIsProcessing(false);

    if (result) {
      setCurrentContent(result.content);
      setTitle(result.content.title);
      setContent(result.content.content);
      setDigest(result.content.digest || '');
      setTags(result.content.tags || []);
      toast.success(result.message || t('aiSocial.create.processSuccess'));
    } else {
      setError(aiError || t('aiSocial.create.processFailed'));
    }
  };

  const handleProcessSource = async (
    sourceType: SocialContentSourceType,
    sourceIdValue: string
  ) => {
    if (!selectedPlatform) {
      setError(t('aiSocial.create.selectPlatformFirst'));
      return;
    }

    setIsProcessing(true);
    setError(null);

    const result = await processFromSource({
      sourceType,
      sourceId: sourceIdValue,
      targetType: selectedPlatform,
    });

    setIsProcessing(false);

    if (result) {
      setCurrentContent(result.content);
      setTitle(result.content.title);
      setContent(result.content.content);
      setDigest(result.content.digest || '');
      setTags(result.content.tags || []);
      toast.success(result.message || t('aiSocial.create.processSuccess'));
    } else {
      setError(aiError || t('aiSocial.create.processFailed'));
    }
  };

  const handleRegenerate = async () => {
    if (!currentContent) return;

    setIsProcessing(true);
    setError(null);

    const result = await regenerate(currentContent.id);

    setIsProcessing(false);

    if (result) {
      setCurrentContent(result.content);
      setTitle(result.content.title);
      setContent(result.content.content);
      setDigest(result.content.digest || '');
      setTags(result.content.tags || []);
      toast.success(t('aiSocial.create.regenerateSuccess'));
    } else {
      setError(aiError || t('common.error'));
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedPlatform || !title || !content) return;

    setError(null);

    // If we have existing content, update it
    if (currentContent) {
      const updated = await editContent(currentContent.id, {
        title,
        content,
        digest: digest || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      if (updated) {
        toast.success(t('aiSocial.toast.saved'));
        router.push('/ai-social');
      } else {
        setError(contentError || t('aiSocial.create.saveFailed'));
      }
    } else {
      // Create new content
      const created = await addContent({
        contentType: selectedPlatform,
        sourceType: source || 'MANUAL',
        sourceUrl: url || undefined,
        sourceId: sourceId || undefined,
        title,
        content,
        digest: digest || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      if (created) {
        toast.success(t('aiSocial.toast.saved'));
        router.push('/ai-social');
      } else {
        setError(contentError || t('aiSocial.create.saveFailed'));
      }
    }
  };

  const handlePublish = async () => {
    if (!selectedPlatform || !title || !content) return;

    setError(null);

    let contentToPublish = currentContent;

    // If no existing content, create it first
    if (!contentToPublish) {
      const created = await addContent({
        contentType: selectedPlatform,
        sourceType: source || 'MANUAL',
        sourceUrl: url || undefined,
        sourceId: sourceId || undefined,
        title,
        content,
        digest: digest || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      if (!created) {
        setError(contentError || t('aiSocial.create.saveFailed'));
        return;
      }
      contentToPublish = created;
    } else {
      // Update existing content first
      const updated = await editContent(contentToPublish.id, {
        title,
        content,
        digest: digest || undefined,
        tags: tags.length > 0 ? tags : undefined,
      });

      if (!updated) {
        setError(contentError || t('aiSocial.create.saveFailed'));
        return;
      }
      contentToPublish = updated;
    }

    // Now publish
    const result = await publish(contentToPublish.id);

    if (result.success) {
      toast.success(t('aiSocial.toast.published'));
      router.push('/ai-social');
    } else {
      setError(result.errorMessage || t('aiSocial.create.publishFailed'));
    }
  };

  const isLoading =
    isProcessing || aiLoading || contentLoading || publishLoading;

  // Auth check
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <AlertCircle className="mb-4 h-12 w-12 text-amber-500" />
        <h2 className="mb-2 text-lg font-semibold text-gray-900">
          {t('aiSocial.signIn.title')}
        </h2>
        <p className="text-sm text-gray-500">
          {t('aiSocial.signIn.description')}
        </p>
      </div>
    );
  }

  // No source specified
  if (!source) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
          <h3 className="mb-2 text-lg font-medium text-gray-900">
            {t('aiSocial.create.noSource')}
          </h3>
          <button
            onClick={() => router.push('/ai-social')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('aiSocial.create.goBack')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <button
          onClick={() => router.push('/ai-social')}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {t('aiSocial.create.title')}
          </h1>
          <p className="text-sm text-gray-500">
            {t('aiSocial.create.subtitle')}
          </p>
        </div>
      </div>

      {/* Content Form */}
      <div className="space-y-6">
        {/* Error Display */}
        {(error || aiError || contentError) && (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
            {error || aiError || contentError}
          </div>
        )}

        {/* Platform Selection - Must select first */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-700">
            {t('aiSocial.create.selectPlatform')}
          </label>
          <div className="flex gap-3">
            {(
              ['WECHAT_ARTICLE', 'XIAOHONGSHU_NOTE'] as SocialContentType[]
            ).map((platform) => (
              <button
                key={platform}
                type="button"
                onClick={() => setSelectedPlatform(platform)}
                disabled={isLoading && !!currentContent}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border p-4 transition-colors ${
                  selectedPlatform === platform
                    ? 'border-rose-500 bg-rose-50 text-rose-700'
                    : 'border-gray-200 hover:border-rose-300 hover:bg-rose-50'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <FileText className="h-5 w-5" />
                <span className="font-medium">
                  {t(`aiSocial.contentTypes.${platform.toLowerCase()}`)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Processing State */}
        {isProcessing && !content && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="mb-4 h-12 w-12 animate-spin text-rose-500" />
            <p className="text-gray-600">{t('aiSocial.create.processing')}</p>
          </div>
        )}

        {/* Show form when platform selected and either MANUAL source or content processed */}
        {selectedPlatform && (source === 'MANUAL' || content) && (
          <>
            {/* Title */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                {t('aiSocial.contents.table.title')}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isLoading}
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 disabled:bg-gray-50"
                placeholder={t('aiSocial.create.titlePlaceholder')}
              />
            </div>

            {/* Content */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  {t('aiSocial.create.preview')}
                </label>
                {currentContent && (
                  <button
                    onClick={handleRegenerate}
                    disabled={isLoading}
                    className="flex items-center gap-1 text-sm text-rose-600 hover:text-rose-700 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${isProcessing ? 'animate-spin' : ''}`}
                    />
                    {t('aiSocial.create.regenerate')}
                  </button>
                )}
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={12}
                disabled={isLoading}
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 disabled:bg-gray-50"
                placeholder={t('aiSocial.create.contentPlaceholder')}
              />
            </div>

            {/* Digest */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                {t('aiSocial.create.digest')}
              </label>
              <textarea
                value={digest}
                onChange={(e) => setDigest(e.target.value)}
                rows={2}
                disabled={isLoading}
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 disabled:bg-gray-50"
                placeholder={t('aiSocial.create.digestPlaceholder')}
              />
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                {t('aiSocial.create.tags')}
              </label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-sm text-rose-700"
                  >
                    #{tag}
                    <button
                      onClick={() =>
                        setTags(tags.filter((_, i) => i !== index))
                      }
                      className="ml-1 text-rose-500 hover:text-rose-700"
                      disabled={isLoading}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder={t('aiSocial.create.addTag')}
                  disabled={isLoading}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-sm focus:border-rose-500 focus:outline-none disabled:bg-gray-50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      e.preventDefault();
                      setTags([...tags, e.currentTarget.value.trim()]);
                      e.currentTarget.value = '';
                    }
                  }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 border-t pt-6">
              <button
                onClick={() => router.push('/ai-social')}
                disabled={isLoading}
                className="rounded-lg border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={!selectedPlatform || !title || !content || isLoading}
                className="flex items-center gap-2 rounded-lg border border-rose-200 px-6 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {contentLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t('aiSocial.create.saveDraft')}
              </button>
              <button
                onClick={handlePublish}
                disabled={!selectedPlatform || !title || !content || isLoading}
                className="flex items-center gap-2 rounded-lg bg-rose-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {publishLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {t('aiSocial.create.publish')}
              </button>
            </div>
          </>
        )}

        {/* Show prompt to select platform when not MANUAL and platform not selected */}
        {!selectedPlatform && source !== 'MANUAL' && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12">
            <Sparkles className="mb-4 h-12 w-12 text-gray-400" />
            <p className="text-gray-600">
              {t('aiSocial.create.selectPlatformPrompt')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CreateSocialContentPage() {
  return (
    <AppShell>
      <main className="flex-1 overflow-auto">
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
            </div>
          }
        >
          <CreateSocialContentForm />
        </Suspense>
      </main>
    </AppShell>
  );
}
