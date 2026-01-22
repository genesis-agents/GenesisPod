'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useSocialCreateStore } from '@/stores/socialCreateStore';
import {
  useSocialAIEngine,
  useSocialContents,
  SocialContentType,
} from '@/hooks/domain/useAISocial';
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  ImageIcon,
  Hash,
  X,
  Plus,
  AlertCircle,
  FileText,
  Type,
} from 'lucide-react';

export function ContentEditor() {
  const { t } = useTranslation();
  const {
    platform,
    sourceType,
    sourceId,
    externalUrl,
    title,
    content,
    digest,
    tags,
    coverImage,
    isProcessing,
    setTitle,
    setContentText,
    setDigest,
    setTags,
    setCoverImage,
    setIsProcessing,
    setContentFromAI,
    setStep,
  } = useSocialCreateStore();

  const {
    processFromUrl,
    processFromSource,
    loading: aiLoading,
  } = useSocialAIEngine();
  const { addContent, editContent } = useSocialContents();

  const [newTag, setNewTag] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  // Platform specific config
  const platformConfig: Record<
    SocialContentType,
    {
      showDigest: boolean;
      maxTitleLength: number;
      maxDigestLength: number;
      gradient: string;
      bgGradient: string;
    }
  > = {
    WECHAT_ARTICLE: {
      showDigest: true,
      maxTitleLength: 64,
      maxDigestLength: 120,
      gradient: 'from-green-500 to-emerald-600',
      bgGradient: 'from-green-50 to-emerald-50',
    },
    XIAOHONGSHU_NOTE: {
      showDigest: false,
      maxTitleLength: 20,
      maxDigestLength: 0,
      gradient: 'from-red-500 to-rose-600',
      bgGradient: 'from-red-50 to-rose-50',
    },
  };

  const config = platform
    ? platformConfig[platform]
    : platformConfig.WECHAT_ARTICLE;

  // Generate content from source
  const handleGenerate = async () => {
    if (!platform) return;

    setIsProcessing(true);
    setError(null);

    try {
      let result;

      if (sourceType === 'EXTERNAL_URL' && externalUrl) {
        result = await processFromUrl({
          url: externalUrl,
          targetType: platform,
        });
      } else if (sourceType && sourceId) {
        result = await processFromSource({
          sourceType,
          sourceId,
          targetType: platform,
        });
      } else if (sourceType === 'MANUAL') {
        // Manual mode - just continue with empty content
        setHasGenerated(true);
        setIsProcessing(false);
        return;
      }

      if (result?.content) {
        const generatedContent = result.content;
        setContentFromAI({
          title: generatedContent.title || '',
          content: generatedContent.content || '',
          digest: generatedContent.digest || '',
          tags: generatedContent.tags || [],
          contentId: generatedContent.id,
        });
        setHasGenerated(true);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('aiSocial.create.generateFailed') || 'Failed to generate content'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-generate on mount if not manual
  useEffect(() => {
    if (!hasGenerated && sourceType !== 'MANUAL' && !title && !content) {
      handleGenerate();
    } else if (sourceType === 'MANUAL') {
      setHasGenerated(true);
    }
  }, []);

  // Handle tag add
  const handleAddTag = () => {
    const trimmed = newTag.trim().replace(/^#/, '');
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setNewTag('');
    }
  };

  // Handle tag remove
  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  // Handle tag input keydown
  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  // Loading state - generating content
  if (isProcessing || aiLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div
          className={`mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${config.gradient}`}
        >
          <Sparkles className="h-10 w-10 animate-pulse text-white" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-gray-900">
          {t('aiSocial.create.generating') || 'Generating Content'}
        </h3>
        <p className="text-sm text-gray-500">
          {t('aiSocial.create.generatingDesc') ||
            'AI is transforming your content...'}
        </p>
        <Loader2 className="mt-6 h-8 w-8 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setStep(3)}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900">
            {t('aiSocial.create.editContent') || 'Edit Content'}
          </h2>
          <p className="text-sm text-gray-500">
            {t('aiSocial.create.editContentDesc') ||
              'Review and customize before publishing'}
          </p>
        </div>
        {/* Regenerate button */}
        {sourceType !== 'MANUAL' && (
          <button
            onClick={handleGenerate}
            disabled={isProcessing}
            className={`flex items-center gap-2 rounded-xl bg-gradient-to-r ${config.gradient} px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50`}
          >
            <Sparkles className="h-4 w-4" />
            {t('aiSocial.create.regenerate') || 'Regenerate'}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <p className="font-medium text-red-800">{error}</p>
            <button
              onClick={handleGenerate}
              className="mt-2 text-sm text-red-600 underline hover:no-underline"
            >
              {t('common.retry') || 'Retry'}
            </button>
          </div>
        </div>
      )}

      {/* Content form */}
      <div className="space-y-5">
        {/* Title */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
            <Type className="h-4 w-4" />
            {t('aiSocial.create.titleLabel') || 'Title'}
            <span className="ml-auto text-xs text-gray-400">
              {title.length}/{config.maxTitleLength}
            </span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) =>
              setTitle(e.target.value.slice(0, config.maxTitleLength))
            }
            placeholder={
              t('aiSocial.create.titlePlaceholder') || 'Enter title...'
            }
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
          />
        </div>

        {/* Digest (WeChat only) */}
        {config.showDigest && (
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
              <FileText className="h-4 w-4" />
              {t('aiSocial.create.digestLabel') || 'Digest'}
              <span className="ml-auto text-xs text-gray-400">
                {digest.length}/{config.maxDigestLength}
              </span>
            </label>
            <textarea
              value={digest}
              onChange={(e) =>
                setDigest(e.target.value.slice(0, config.maxDigestLength))
              }
              placeholder={
                t('aiSocial.create.digestPlaceholder') ||
                'Brief summary for preview...'
              }
              rows={2}
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
          </div>
        )}

        {/* Content */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
            <FileText className="h-4 w-4" />
            {t('aiSocial.create.contentLabel') || 'Content'}
          </label>
          <textarea
            value={content}
            onChange={(e) => setContentText(e.target.value)}
            placeholder={
              t('aiSocial.create.contentPlaceholder') || 'Enter content...'
            }
            rows={12}
            className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
            <Hash className="h-4 w-4" />
            {t('aiSocial.create.tagsLabel') || 'Tags'}
          </label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className={`flex items-center gap-1 rounded-full bg-gradient-to-r ${config.bgGradient} px-3 py-1 text-sm`}
              >
                #{tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 rounded-full p-0.5 hover:bg-white/50"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder={t('aiSocial.create.addTag') || 'Add tag...'}
                className="w-24 rounded-full border border-gray-200 px-3 py-1 text-sm focus:border-rose-500 focus:outline-none"
              />
              <button
                onClick={handleAddTag}
                disabled={!newTag.trim()}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Cover Image */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
            <ImageIcon className="h-4 w-4" />
            {t('aiSocial.create.coverImageLabel') || 'Cover Image'}
          </label>
          {coverImage ? (
            <div className="relative">
              <img
                src={coverImage}
                alt="Cover"
                className="h-48 w-full rounded-xl object-cover"
              />
              <button
                onClick={() => setCoverImage('')}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex h-32 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 transition-colors hover:border-gray-300">
              <ImageIcon className="mb-2 h-8 w-8 text-gray-400" />
              <p className="text-sm text-gray-500">
                {t('aiSocial.create.addCoverImage') || 'Add cover image'}
              </p>
              <input
                type="url"
                placeholder="https://..."
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                className="mt-2 w-64 rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:border-rose-500 focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
