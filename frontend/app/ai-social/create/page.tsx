'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from '@/lib/i18n';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  FileText,
  Send,
  Save,
  AlertCircle,
} from 'lucide-react';

type SourceType =
  | 'MANUAL'
  | 'EXTERNAL_URL'
  | 'AI_EXPLORE'
  | 'AI_RESEARCH'
  | 'AI_OFFICE'
  | 'AI_WRITING';

type ContentType = 'WECHAT_ARTICLE' | 'XIAOHONGSHU_NOTE';

export default function CreateSocialContentPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading, isAdmin } = useAuth();

  const source = searchParams.get('source') as SourceType | null;
  const url = searchParams.get('url');

  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<ContentType | null>(
    null
  );
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [digest, setDigest] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Auto-process URL if provided
  useEffect(() => {
    if (source === 'EXTERNAL_URL' && url) {
      processExternalUrl(url);
    }
  }, [source, url]);

  const processExternalUrl = async (urlToProcess: string) => {
    setIsProcessing(true);
    setError(null);

    try {
      // TODO: Call API to process URL
      // For now, simulate processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Simulated response
      setTitle('示例文章标题');
      setContent(
        '这是从外部链接提取的内容示例。AI 将帮助您将此内容转换为适合社交媒体的格式。\n\n包含段落、格式等...'
      );
      setDigest('文章摘要内容');
      setTags(['科技', 'AI', '创新']);
    } catch (err) {
      setError('处理链接失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!selectedPlatform || !title || !content) return;

    setIsProcessing(true);
    try {
      // TODO: Call API to save draft
      await new Promise((resolve) => setTimeout(resolve, 1000));
      router.push('/ai-social');
    } catch (err) {
      setError('保存失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedPlatform || !title || !content) return;

    setIsProcessing(true);
    try {
      // TODO: Call API to publish
      await new Promise((resolve) => setTimeout(resolve, 1500));
      router.push('/ai-social');
    } catch (err) {
      setError('发布失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  // Auth check
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

      {/* Processing State */}
      {isProcessing && !content && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-rose-500" />
          <p className="text-gray-600">{t('aiSocial.create.processing')}</p>
        </div>
      )}

      {/* Content Form */}
      {!isProcessing || content ? (
        <div className="space-y-6">
          {/* Error Display */}
          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Platform Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">
              {t('aiSocial.create.selectPlatform')}
            </label>
            <div className="flex gap-3">
              {(['WECHAT_ARTICLE', 'XIAOHONGSHU_NOTE'] as ContentType[]).map(
                (platform) => (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => setSelectedPlatform(platform)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg border p-4 transition-colors ${
                      selectedPlatform === platform
                        ? 'border-rose-500 bg-rose-50 text-rose-700'
                        : 'border-gray-200 hover:border-rose-300 hover:bg-rose-50'
                    }`}
                  >
                    <FileText className="h-5 w-5" />
                    <span className="font-medium">
                      {t(`aiSocial.contentTypes.${platform.toLowerCase()}`)}
                    </span>
                  </button>
                )
              )}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              {t('aiSocial.contents.table.title')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              placeholder="输入标题..."
            />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              {t('aiSocial.create.preview')}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              placeholder="输入内容..."
            />
          </div>

          {/* Digest */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">摘要</label>
            <textarea
              value={digest}
              onChange={(e) => setDigest(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              placeholder="输入摘要..."
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">标签</label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-sm text-rose-700"
                >
                  #{tag}
                  <button
                    onClick={() => setTags(tags.filter((_, i) => i !== index))}
                    className="ml-1 text-rose-500 hover:text-rose-700"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder="添加标签..."
                className="rounded-lg border border-gray-200 px-3 py-1 text-sm focus:border-rose-500 focus:outline-none"
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
              className="rounded-lg border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={!selectedPlatform || !title || !content || isProcessing}
              className="flex items-center gap-2 rounded-lg border border-rose-200 px-6 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {t('aiSocial.create.saveDraft')}
            </button>
            <button
              onClick={handlePublish}
              disabled={!selectedPlatform || !title || !content || isProcessing}
              className="flex items-center gap-2 rounded-lg bg-rose-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t('aiSocial.create.publish')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
