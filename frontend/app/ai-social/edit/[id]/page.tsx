'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DOMPurify from 'dompurify';
import { useTranslation } from '@/lib/i18n';
import { useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/layout/AppShell';
import {
  useSocialContents,
  useSocialPublish,
  SocialContent,
  SocialContentType,
} from '@/hooks/domain/useAISocial';
import { toast } from '@/stores';
import {
  ArrowLeft,
  Loader2,
  Save,
  Send,
  RefreshCw,
  AlertCircle,
  Eye,
  Code,
  Download,
} from 'lucide-react';
import { VersionTabs } from '@/components/ai-social/create/VersionTabs';
import { SocialPlatformType } from '@/services/ai-social/api';
import { ExportDialog } from '@/components/common/ExportDialog';

export default function EditSocialContentPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const contentId = params?.id as string;
  const { user, isLoading: authLoading, isAdmin } = useAuth();

  // Hooks
  const {
    fetchContent,
    editContent,
    loading: contentLoading,
    error: contentError,
  } = useSocialContents();
  const { publish, loading: publishLoading } = useSocialPublish();

  // Content state
  const [currentContent, setCurrentContent] = useState<SocialContent | null>(
    null
  );
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [digest, setDigest] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab state: 'preview' or 'source'
  const [activeTab, setActiveTab] = useState<'preview' | 'source'>('preview');

  // Platform version state
  const [selectedPlatform, setSelectedPlatform] =
    useState<SocialPlatformType>('WECHAT_MP');

  // Export dialog state
  const [showExport, setShowExport] = useState(false);

  // Client-side mount state to avoid hydration mismatch with DOMPurify
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load content on mount
  useEffect(() => {
    const loadContent = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const foundContent = await fetchContent(contentId);
        if (foundContent) {
          setCurrentContent(foundContent);
          setTitle(foundContent.title);
          setContent(foundContent.content);
          setDigest(foundContent.digest || '');
          setTags(foundContent.tags || []);
        } else {
          setError(t('aiSocial.edit.notFound'));
        }
      } catch (err) {
        setError(t('aiSocial.edit.loadFailed'));
      } finally {
        setIsLoading(false);
      }
    };

    if (contentId) {
      loadContent();
    }
  }, [contentId, fetchContent, t]);

  // Save draft
  const handleSave = async () => {
    if (!currentContent || !title || !content) return;

    setError(null);

    const updated = await editContent(currentContent.id, {
      title,
      content,
      digest: digest || undefined,
      tags: tags.length > 0 ? tags : undefined,
    });

    if (updated) {
      setCurrentContent(updated);
      toast.success(t('aiSocial.toast.saved'));
    } else {
      setError(contentError || t('aiSocial.edit.saveFailed'));
    }
  };

  // Publish
  const handlePublish = async () => {
    if (!currentContent || !title || !content) return;

    setError(null);

    // Save first
    const updated = await editContent(currentContent.id, {
      title,
      content,
      digest: digest || undefined,
      tags: tags.length > 0 ? tags : undefined,
    });

    if (!updated) {
      setError(contentError || t('aiSocial.edit.saveFailed'));
      return;
    }

    const result = await publish(updated.id);

    if (result.success) {
      toast.success(t('aiSocial.toast.published'));
      router.push('/ai-social');
    } else {
      setError(result.errorMessage || t('aiSocial.edit.publishFailed'));
    }
  };

  // Go back
  const handleBack = () => {
    router.push('/ai-social');
  };

  const isSaving = contentLoading || publishLoading;

  // Auth check
  if (authLoading) {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
        </div>
      </AppShell>
    );
  }

  if (!user || !isAdmin) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center">
          <AlertCircle className="mb-4 h-12 w-12 text-amber-500" />
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            {t('aiSocial.signIn.title')}
          </h2>
          <p className="text-sm text-gray-500">
            {t('aiSocial.signIn.description')}
          </p>
        </div>
      </AppShell>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <AppShell>
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
        </div>
      </AppShell>
    );
  }

  // Error state - content not found
  if (error && !currentContent) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center">
          <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            {t('aiSocial.edit.notFound')}
          </h2>
          <p className="mb-6 text-sm text-gray-500">{error}</p>
          <button
            onClick={handleBack}
            className="rounded-lg bg-rose-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-rose-700"
          >
            {t('common.back')}
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-4 py-8">
          {/* Header */}
          <div className="mb-8 flex items-center gap-4">
            <button
              onClick={handleBack}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900">
                {t('aiSocial.edit.title')}
              </h1>
              <p className="text-sm text-gray-500">
                {currentContent?.contentType === 'WECHAT_ARTICLE'
                  ? t('aiSocial.contentTypes.wechat_article')
                  : t('aiSocial.contentTypes.xiaohongshu_note')}
              </p>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Version Tabs */}
          {contentId && (
            <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
              <VersionTabs
                contentId={contentId}
                selectedPlatform={selectedPlatform}
                onVersionSelect={(version, platform) => {
                  setSelectedPlatform(platform);
                  if (version) {
                    setTitle(version.title);
                    setContent(version.content);
                    setDigest(version.digest || '');
                  }
                }}
              />
            </div>
          )}

          {/* Edit Form */}
          {currentContent && (
            <div className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  {t('aiSocial.contents.table.title')}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isSaving}
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 disabled:bg-gray-50"
                  placeholder={t('aiSocial.create.titlePlaceholder')}
                />
              </div>

              {/* Content Editor and Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    {t('aiSocial.edit.content')}
                  </label>
                </div>

                {/* Tab Switcher */}
                <div className="flex items-center border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => setActiveTab('preview')}
                    className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                      activeTab === 'preview'
                        ? 'border-rose-500 text-rose-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Eye className="h-4 w-4" />
                    {t('aiSocial.create.preview')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('source')}
                    className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                      activeTab === 'source'
                        ? 'border-rose-500 text-rose-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Code className="h-4 w-4" />
                    {currentContent.contentType === 'WECHAT_ARTICLE'
                      ? 'HTML'
                      : t('aiSocial.edit.plainText')}
                  </button>
                </div>

                {/* Tab Content */}
                <div className="mt-4">
                  {activeTab === 'source' ? (
                    /* Source Code Editor */
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      disabled={isSaving}
                      className="font-mono min-h-[500px] w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 disabled:bg-gray-50"
                      placeholder={t('aiSocial.create.contentPlaceholder')}
                    />
                  ) : (
                    /* Preview */
                    <div
                      data-export-content="social"
                      className="max-h-[calc(100vh-400px)] min-h-[500px] overflow-auto rounded-lg border border-gray-200 bg-white p-6"
                      style={{
                        fontFamily:
                          currentContent.contentType === 'WECHAT_ARTICLE'
                            ? '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", Arial, sans-serif'
                            : 'inherit',
                        fontSize: '16px',
                        lineHeight: '1.75',
                        color: '#333',
                      }}
                    >
                      {currentContent.contentType === 'WECHAT_ARTICLE' ? (
                        mounted ? (
                          <div
                            dangerouslySetInnerHTML={{
                              __html: DOMPurify.sanitize(
                                content ||
                                  `<p style="color: #999;">${t('aiSocial.edit.previewPlaceholder')}</p>`,
                                {
                                  ALLOWED_TAGS: [
                                    'p',
                                    'h1',
                                    'h2',
                                    'h3',
                                    'h4',
                                    'h5',
                                    'h6',
                                    'strong',
                                    'em',
                                    'b',
                                    'i',
                                    'u',
                                    'blockquote',
                                    'ul',
                                    'ol',
                                    'li',
                                    'br',
                                    'hr',
                                    'span',
                                    'div',
                                    'img',
                                    'a',
                                  ],
                                  ALLOWED_ATTR: [
                                    'style',
                                    'class',
                                    'href',
                                    'src',
                                    'alt',
                                    'title',
                                  ],
                                  ALLOW_DATA_ATTR: false,
                                }
                              ),
                            }}
                          />
                        ) : (
                          <div className="text-gray-400">
                            {t('aiSocial.edit.previewPlaceholder')}
                          </div>
                        )
                      ) : (
                        <div className="whitespace-pre-wrap">
                          {content || t('aiSocial.edit.previewPlaceholder')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
                  disabled={isSaving}
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
                        disabled={isSaving}
                      >
                        x
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder={t('aiSocial.create.addTag')}
                    disabled={isSaving}
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

              {/* Action Buttons */}
              <div className="flex items-center justify-between border-t pt-6">
                <button
                  onClick={() => setShowExport(true)}
                  disabled={!title || !content}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {t('common.export')}
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={handleBack}
                    disabled={isSaving}
                    className="rounded-lg border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {t('common.back')}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!title || !content || isSaving}
                    className="flex items-center gap-2 rounded-lg border border-rose-200 px-6 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {contentLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {t('aiSocial.edit.save')}
                  </button>
                  {/* Publish button - always visible */}
                  <button
                    onClick={handlePublish}
                    disabled={!title || !content || isSaving}
                    className="flex items-center gap-2 rounded-lg bg-rose-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {publishLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : currentContent.status === 'FAILED' ? (
                      <RefreshCw className="h-4 w-4" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {currentContent.status === 'FAILED'
                      ? t('aiSocial.edit.retry') || 'Retry Publish'
                      : t('aiSocial.edit.publish')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Export Dialog */}
        {currentContent && (
          <ExportDialog
            isOpen={showExport}
            onClose={() => setShowExport(false)}
            contentSelector="[data-export-content='social']"
            contentTitle={title || currentContent.title}
            moduleType="social"
            sourceId={contentId}
            availableFormats={['PDF', 'DOCX', 'HTML']}
          />
        )}
      </main>
    </AppShell>
  );
}
