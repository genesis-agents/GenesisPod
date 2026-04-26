'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useSocialCreateStore } from '@/stores';
import {
  useSocialAIEngine,
  useSocialContents,
  SocialContentType,
} from '@/hooks/domain/useAISocial';
import { useAIImage } from '@/hooks/domain/useAIImage';
import { useAutoSave } from '@/hooks/utils/useAutoSave';
import { generateDraftId, type DraftData } from '@/lib/storage/draft-storage';
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
  Clock,
  Brain,
  FileSearch,
  Wand2,
  CheckCircle2,
  Eye,
  Code,
  Link,
  Save,
} from 'lucide-react';
import DOMPurify from 'isomorphic-dompurify';
import { DraftRecoveryDialog } from './DraftRecoveryDialog';
import { VersionTabs, PLATFORMS } from './VersionTabs';
import {
  SocialContentVersion,
  SocialPlatformType,
  updateVersion,
} from '@/services/ai-social/api';

import { logger } from '@/lib/utils/logger';
import { Tooltip } from '@/components/ui/Tooltip';

export function ContentEditor() {
  const { t } = useTranslation();
  const {
    platform,
    sourceType,
    sourceId,
    externalUrl,
    keepFormat,
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
    setSeriesFromAI,
    setStep,
  } = useSocialCreateStore();

  const {
    processFromUrl,
    processFromSource,
    loading: aiLoading,
  } = useSocialAIEngine();
  const { addContent, editContent } = useSocialContents();
  const { generate: generateImage, isGenerating: isGeneratingImage } =
    useAIImage();

  const [newTag, setNewTag] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [contentViewMode, setContentViewMode] = useState<'preview' | 'source'>(
    'preview'
  );
  const [coverImageMode, setCoverImageMode] = useState<'url' | 'ai'>('ai');
  const [coverImagePrompt, setCoverImagePrompt] = useState('');
  const [showDraftRecovery, setShowDraftRecovery] = useState(false);
  const [detectedDraft, setDetectedDraft] = useState<DraftData | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Version management state
  const [selectedPlatform, setSelectedPlatform] = useState<SocialPlatformType>(
    platform === 'XIAOHONGSHU_NOTE' ? 'XIAOHONGSHU' : 'WECHAT_MP'
  );
  const [currentVersion, setCurrentVersion] =
    useState<SocialContentVersion | null>(null);
  const [isVersionMode, setIsVersionMode] = useState(false);

  // Generate draft ID
  const draftId =
    platform && sourceType
      ? generateDraftId(platform, sourceType, sourceId || undefined)
      : '';

  // Auto-save hook
  const autoSave = useAutoSave(
    {
      title,
      content,
      digest,
      tags,
      coverImage,
    },
    {
      draftId,
      platform: platform || '',
      sourceType: sourceType || '',
      sourceId: sourceId || undefined,
      externalUrl: externalUrl || undefined,
      enabled: !!platform && !!sourceType && hasGenerated,
      onDraftDetected: (draft) => {
        setDetectedDraft(draft);
        setShowDraftRecovery(true);
      },
    }
  );

  // Progress messages for friendly UI
  const progressMessages = [
    {
      icon: FileSearch,
      text: '正在获取源内容...',
      textEn: 'Fetching source content...',
    },
    {
      icon: Brain,
      text: '正在分析内容结构...',
      textEn: 'Analyzing content structure...',
    },
    {
      icon: Wand2,
      text: 'AI 正在创作优质内容...',
      textEn: 'AI is crafting quality content...',
    },
    {
      icon: Sparkles,
      text: '正在优化排版格式...',
      textEn: 'Optimizing layout and formatting...',
    },
  ];

  // Tips to show during generation
  const tips = [
    'AI 会根据平台特点自动调整内容风格',
    '公众号文章会自动生成精美的 HTML 排版',
    'YouTube 视频会自动获取字幕并翻译',
    '生成完成后您可以自由编辑内容',
  ];

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

  // Start progress animation
  const startProgressAnimation = () => {
    setProgressStep(0);
    setElapsedTime(0);

    // Elapsed time counter
    timerRef.current = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    // Progress step animation (slower to match AI generation time)
    progressTimerRef.current = setInterval(() => {
      setProgressStep((prev) => {
        // Stay on the last step (AI generating) until complete
        if (prev >= progressMessages.length - 1) return prev;
        return prev + 1;
      });
    }, 8000); // Change step every 8 seconds
  };

  // Stop progress animation
  const stopProgressAnimation = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      stopProgressAnimation();
    };
  }, []);

  // Generate content from source
  const handleGenerate = async () => {
    if (!platform) return;

    setIsProcessing(true);
    setError(null);
    startProgressAnimation();

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
          keepFormat: keepFormat || undefined,
        });
      } else if (sourceType === 'MANUAL') {
        // Manual mode - just continue with empty content
        setHasGenerated(true);
        setIsProcessing(false);
        stopProgressAnimation();
        return;
      }

      // Check for series response (only from processFromSource)
      const seriesResult = result as
        | {
            seriesId?: string | null;
            seriesContents?: Array<{
              id: string;
              title: string;
              content: string;
              digest: string | null;
              seriesOrder: number | null;
              status: string;
            }>;
            content?: {
              id: string;
              title: string;
              content: string;
              digest: string | null;
              tags: string[];
            };
          }
        | undefined;

      if (
        seriesResult?.seriesId &&
        seriesResult.seriesContents &&
        seriesResult.seriesContents.length > 1
      ) {
        // Series mode: multiple articles from Topic Insights
        setSeriesFromAI({
          seriesId: seriesResult.seriesId,
          parts: seriesResult.seriesContents.map((sc) => ({
            id: sc.id,
            title: sc.title,
            content: sc.content,
            digest: sc.digest || '',
            seriesOrder: sc.seriesOrder || 0,
            status: sc.status,
          })),
        });
        setHasGenerated(true);
      } else if (result?.content) {
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
      stopProgressAnimation();
    }
  };

  // Auto-generate on mount if not manual, or mark as generated if editing existing content
  useEffect(() => {
    if (!hasGenerated && sourceType !== 'MANUAL' && !title && !content) {
      handleGenerate();
    } else if (sourceType === 'MANUAL' || title || content) {
      // Manual mode or editing existing content - mark as generated
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

  // Handle AI cover image generation
  const handleGenerateCoverImage = async () => {
    if (!coverImagePrompt.trim()) return;

    try {
      const result = await generateImage({
        prompt: coverImagePrompt,
        style: 'cover-art',
      });

      if (result && result.length > 0) {
        setCoverImage(result[0].url);
        setCoverImagePrompt('');
      }
    } catch (err) {
      logger.error('Failed to generate cover image:', err);
    }
  };

  // Format elapsed time as mm:ss
  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle draft recovery
  const handleRecoverDraft = () => {
    if (!detectedDraft) return;

    setContentFromAI({
      title: detectedDraft.title,
      content: detectedDraft.content,
      digest: detectedDraft.digest,
      tags: detectedDraft.tags,
    });
    setCoverImage(detectedDraft.coverImage);

    setShowDraftRecovery(false);
    setDetectedDraft(null);

    logger.debug('Draft recovered:', detectedDraft.id);
  };

  // Handle draft discard
  const handleDiscardDraft = () => {
    if (!detectedDraft) return;

    autoSave.clear();
    setShowDraftRecovery(false);
    setDetectedDraft(null);

    logger.debug('Draft discarded:', detectedDraft.id);
  };

  // Handle version selection from VersionTabs
  const handleVersionSelect = (
    version: SocialContentVersion | null,
    platformType: SocialPlatformType
  ) => {
    setSelectedPlatform(platformType);
    setCurrentVersion(version);

    if (version) {
      // Switch to version mode and load version content
      setIsVersionMode(true);
      setTitle(version.title);
      setContentText(version.content);
      if (version.digest) {
        setDigest(version.digest);
      }
    } else {
      // No version for this platform, keep current content
      setIsVersionMode(false);
    }
  };

  // Get content ID from store (if content was created)
  const contentId = useSocialCreateStore((state) => state.currentContentId);

  // Format last saved time
  const formatLastSaved = (): string => {
    if (!autoSave.lastSaved) return '';

    const now = new Date();
    const diffMs = now.getTime() - autoSave.lastSaved.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 5) {
      return t('aiSocial.draft.justSaved') || 'Saved just now';
    } else if (diffSecs < 60) {
      return (
        t('aiSocial.draft.savedSecondsAgo', { count: diffSecs }) ||
        `Saved ${diffSecs}s ago`
      );
    } else {
      const diffMins = Math.floor(diffSecs / 60);
      return (
        t('aiSocial.draft.savedMinutesAgo', { count: diffMins }) ||
        `Saved ${diffMins}m ago`
      );
    }
  };

  // Loading state - generating content with friendly progress
  if (isProcessing || aiLoading) {
    const currentMessage = progressMessages[progressStep];
    const CurrentIcon = currentMessage.icon;
    const currentTip = tips[Math.floor(elapsedTime / 10) % tips.length];

    return (
      <div className="flex flex-col items-center justify-center py-12">
        {/* Main icon with animated ring */}
        <div className="relative mb-8">
          <div
            className={`flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br ${config.gradient} shadow-lg`}
          >
            <CurrentIcon className="h-12 w-12 text-white" />
          </div>
          {/* Animated pulse ring */}
          <div
            className={`absolute -inset-2 animate-ping rounded-2xl bg-gradient-to-br ${config.gradient} opacity-20`}
            style={{ animationDuration: '2s' }}
          />
        </div>

        {/* Progress title */}
        <h3 className="mb-2 text-xl font-semibold text-gray-900">
          AI 内容生成中
        </h3>

        {/* Current step message */}
        <p className="mb-6 text-base text-gray-600">{currentMessage.text}</p>

        {/* Progress steps */}
        <div className="mb-8 flex items-center gap-2">
          {progressMessages.map((msg, index) => (
            <div
              key={index}
              className={`flex h-2 w-8 rounded-full transition-all duration-500 ${
                index <= progressStep
                  ? `bg-gradient-to-r ${config.gradient}`
                  : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Time elapsed */}
        <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <Clock className="h-4 w-4" />
          <span>已用时 {formatElapsedTime(elapsedTime)}</span>
          <span className="text-gray-300">|</span>
          <span>预计需要 30-60 秒</span>
        </div>

        {/* Loading spinner */}
        <Loader2 className="mb-8 h-6 w-6 animate-spin text-rose-500" />

        {/* Tip box */}
        <div className="max-w-md rounded-xl bg-gray-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100">
              <Sparkles className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                小提示
              </p>
              <p className="mt-1 text-sm text-gray-700">{currentTip}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Draft Recovery Dialog */}
      {showDraftRecovery && detectedDraft && (
        <DraftRecoveryDialog
          draft={detectedDraft}
          onRecover={handleRecoverDraft}
          onDiscard={handleDiscardDraft}
        />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Tooltip content={t('aiSocial.create.tooltip.back')}>
            <button
              onClick={() => setStep(3)}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
          </Tooltip>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900">
              {t('aiSocial.create.editContent') || 'Edit Content'}
            </h2>
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-500">
                {t('aiSocial.create.editContentDesc') ||
                  'Review and customize before publishing'}
              </p>
              {/* Auto-save status */}
              {autoSave.lastSaved && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <span>•</span>
                  {autoSave.isSaving ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>{t('aiSocial.draft.saving') || 'Saving...'}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      <span>{formatLastSaved()}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Regenerate button */}
          {sourceType !== 'MANUAL' && (
            <Tooltip content={t('aiSocial.create.tooltip.regenerate')}>
              <button
                onClick={handleGenerate}
                disabled={isProcessing}
                className={`flex items-center gap-2 rounded-xl bg-gradient-to-r ${config.gradient} px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50`}
              >
                <Sparkles className="h-4 w-4" />
                {t('aiSocial.create.regenerate') || 'Regenerate'}
              </button>
            </Tooltip>
          )}
        </div>

        {/* Version Tabs - only show after content is generated */}
        {hasGenerated && contentId && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <VersionTabs
              contentId={contentId}
              selectedPlatform={selectedPlatform}
              onVersionSelect={handleVersionSelect}
            />
          </div>
        )}

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
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <FileText className="h-4 w-4" />
                {t('aiSocial.create.contentLabel') || 'Content'}
              </label>
              {/* View mode toggle */}
              <div className="flex items-center rounded-lg bg-gray-100 p-1">
                <button
                  onClick={() => setContentViewMode('preview')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    contentViewMode === 'preview'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  {t('aiSocial.create.previewMode') || 'Preview'}
                </button>
                <button
                  onClick={() => setContentViewMode('source')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    contentViewMode === 'source'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Code className="h-3.5 w-3.5" />
                  {t('aiSocial.create.sourceMode') || 'Source'}
                </button>
              </div>
            </div>

            {contentViewMode === 'preview' ? (
              /* Preview mode - rendered HTML */
              <div
                className="prose prose-sm max-w-none overflow-auto rounded-xl border border-gray-200 bg-white p-6"
                style={{ minHeight: '300px', maxHeight: '500px' }}
              >
                {content ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(content),
                    }}
                  />
                ) : (
                  <p className="italic text-gray-400">
                    {t('aiSocial.create.noContentPreview') ||
                      'No content to preview'}
                  </p>
                )}
              </div>
            ) : (
              /* Source mode - editable HTML */
              <textarea
                value={content}
                onChange={(e) => setContentText(e.target.value)}
                placeholder={
                  t('aiSocial.create.contentPlaceholder') || 'Enter content...'
                }
                rows={12}
                className="font-mono w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                style={{ minHeight: '300px' }}
              />
            )}
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
                  <Tooltip content={t('aiSocial.create.tooltip.removeTag')}>
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 rounded-full p-0.5 hover:bg-white/50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Tooltip>
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
                <Tooltip content={t('aiSocial.create.tooltip.addTag')}>
                  <button
                    onClick={handleAddTag}
                    disabled={!newTag.trim()}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* Cover Image */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <ImageIcon className="h-4 w-4" />
                {t('aiSocial.create.coverImageLabel') || 'Cover Image'}
              </label>
              {/* Mode toggle */}
              <div className="flex items-center rounded-lg bg-gray-100 p-1">
                <button
                  onClick={() => setCoverImageMode('ai')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    coverImageMode === 'ai'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('aiSocial.create.aiGenerate') || 'AI Generate'}
                </button>
                <button
                  onClick={() => setCoverImageMode('url')}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    coverImageMode === 'url'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Link className="h-3.5 w-3.5" />
                  {t('aiSocial.create.urlInput') || 'URL'}
                </button>
              </div>
            </div>

            {coverImage ? (
              <div className="relative">
                <img
                  src={coverImage}
                  alt="Cover"
                  className="h-48 w-full rounded-xl object-cover"
                />
                <Tooltip
                  content={t('aiSocial.create.tooltip.removeCoverImage')}
                >
                  <button
                    onClick={() => setCoverImage('')}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
            ) : coverImageMode === 'ai' ? (
              /* AI Generation Mode */
              <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Sparkles className="h-4 w-4 text-rose-500" />
                    <span>
                      {t('aiSocial.create.describeCoverImage') ||
                        'Describe the cover image you want'}
                    </span>
                  </div>
                  <textarea
                    value={coverImagePrompt}
                    onChange={(e) => setCoverImagePrompt(e.target.value)}
                    placeholder={
                      t('aiSocial.create.coverImagePromptPlaceholder') ||
                      'e.g., A futuristic cityscape with AI robots, vibrant colors, digital art style...'
                    }
                    rows={2}
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                  <button
                    onClick={handleGenerateCoverImage}
                    disabled={!coverImagePrompt.trim() || isGeneratingImage}
                    className={`flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r ${config.gradient} px-4 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50`}
                  >
                    {isGeneratingImage ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('aiSocial.create.generating') || 'Generating...'}
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" />
                        {t('aiSocial.create.generateCoverImage') ||
                          'Generate Cover Image'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* URL Input Mode */
              <div className="flex h-32 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 transition-colors hover:border-gray-300">
                <Link className="mb-2 h-8 w-8 text-gray-400" />
                <p className="text-sm text-gray-500">
                  {t('aiSocial.create.enterImageUrl') || 'Enter image URL'}
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
    </>
  );
}
