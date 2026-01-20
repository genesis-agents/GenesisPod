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
  useSocialSources,
  SocialContentType,
  SocialContentSourceType,
  SocialContent,
} from '@/hooks/domain/useAISocial';
import { toast } from '@/stores/toastStore';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  FileText,
  Send,
  Save,
  AlertCircle,
  RefreshCw,
  Check,
  Globe,
  BookOpen,
  Briefcase,
  PenTool,
  Compass,
} from 'lucide-react';

// 步骤定义
type Step = 'select-source' | 'select-platform' | 'edit-content';

// 来源项类型
interface SourceItem {
  id: string;
  title: string;
  description?: string;
  type?: string;
  createdAt?: string;
}

function CreateSocialContentForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading, isAdmin } = useAuth();

  // URL 参数
  const sourceParam = searchParams.get(
    'source'
  ) as SocialContentSourceType | null;
  const urlParam = searchParams.get('url');
  const sourceIdParam = searchParams.get('sourceId');

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
  const {
    fetchExplore,
    fetchResearch,
    fetchOffice,
    fetchWriting,
    loading: sourcesLoading,
  } = useSocialSources();

  // 状态
  const [currentStep, setCurrentStep] = useState<Step>('select-source');
  const [selectedSource, setSelectedSource] =
    useState<SocialContentSourceType | null>(sourceParam);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    sourceIdParam
  );
  const [externalUrl, setExternalUrl] = useState(urlParam || '');
  const [selectedPlatform, setSelectedPlatform] =
    useState<SocialContentType | null>(null);
  const [sourceItems, setSourceItems] = useState<SourceItem[]>([]);

  // 调试状态 - 显示 API 返回的原始数据
  const [debugData, setDebugData] = useState<{
    sourceListResponse?: unknown;
    selectedItemData?: unknown;
    processResponse?: unknown;
  }>({});

  // 内容状态
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [digest, setDigest] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [currentContent, setCurrentContent] = useState<SocialContent | null>(
    null
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 根据 URL 参数初始化步骤
  useEffect(() => {
    if (sourceParam === 'MANUAL') {
      setCurrentStep('select-platform');
    } else if (sourceParam === 'EXTERNAL_URL' && urlParam) {
      setCurrentStep('select-platform');
    } else if (sourceParam && sourceIdParam) {
      // 有来源和来源 ID，直接选择平台
      setCurrentStep('select-platform');
    } else if (sourceParam && !sourceIdParam) {
      // 有来源但没有 ID，需要先选择具体内容
      loadSourceItems(sourceParam);
      setCurrentStep('select-source');
    }
  }, [sourceParam, urlParam, sourceIdParam]);

  // 加载来源列表
  const loadSourceItems = async (sourceType: SocialContentSourceType) => {
    setError(null);
    try {
      let result: { items: SourceItem[]; total: number } = {
        items: [],
        total: 0,
      };

      switch (sourceType) {
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

      // 保存调试数据
      setDebugData((prev) => ({
        ...prev,
        sourceListResponse: result,
      }));
      console.log('[DEBUG] Source list API response:', result);

      setSourceItems(result.items || []);
    } catch (err) {
      setError(t('aiSocial.create.loadSourceFailed'));
    }
  };

  // 处理来源选择
  const handleSourceSelect = (source: SocialContentSourceType) => {
    setSelectedSource(source);
    setSelectedSourceId(null);
    setExternalUrl('');

    if (source === 'MANUAL') {
      setCurrentStep('select-platform');
    } else if (source === 'EXTERNAL_URL') {
      // 保持在当前步骤，显示 URL 输入
    } else {
      loadSourceItems(source);
    }
  };

  // 处理来源项选择
  const handleSourceItemSelect = (item: SourceItem) => {
    setSelectedSourceId(item.id);
    // 保存选中项的调试数据
    setDebugData((prev) => ({
      ...prev,
      selectedItemData: item,
    }));
    console.log('[DEBUG] Selected item:', item);
    setCurrentStep('select-platform');
  };

  // 处理 URL 提交
  const handleUrlSubmit = () => {
    if (!externalUrl.trim()) {
      setError(t('aiSocial.modal.urlRequired'));
      return;
    }
    setCurrentStep('select-platform');
  };

  // 处理平台选择
  const handlePlatformSelect = async (platform: SocialContentType) => {
    setSelectedPlatform(platform);
    setError(null);

    // MANUAL 来源直接进入编辑
    if (selectedSource === 'MANUAL') {
      setCurrentStep('edit-content');
      return;
    }

    // 其他来源需要 AI 处理
    setIsProcessing(true);
    setCurrentStep('edit-content');

    try {
      let result;

      if (selectedSource === 'EXTERNAL_URL' && externalUrl) {
        result = await processFromUrl({
          url: externalUrl,
          targetType: platform,
        });
      } else if (selectedSourceId) {
        result = await processFromSource({
          sourceType: selectedSource!,
          sourceId: selectedSourceId,
          targetType: platform,
        });
      }

      if (result) {
        // 保存处理结果的调试数据
        setDebugData((prev) => ({
          ...prev,
          processResponse: result,
        }));
        console.log('[DEBUG] Process API response:', result);

        setCurrentContent(result.content);
        setTitle(result.content.title);
        setContent(result.content.content);
        setDigest(result.content.digest || '');
        setTags(result.content.tags || []);
        toast.success(result.message || t('aiSocial.create.processSuccess'));
      }
    } catch (err) {
      // Display the actual error message from the backend
      const errorMessage =
        err instanceof Error ? err.message : t('aiSocial.create.processFailed');
      setError(errorMessage);
      // 保存错误信息
      setDebugData((prev) => ({
        ...prev,
        processResponse: { error: errorMessage, rawError: String(err) },
      }));
      console.error('[DEBUG] Process API error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // 重新生成
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

  // 保存草稿
  const handleSaveDraft = async () => {
    if (!selectedPlatform || !title || !content) return;

    setError(null);

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
      const created = await addContent({
        contentType: selectedPlatform,
        sourceType: selectedSource || 'MANUAL',
        sourceUrl: externalUrl || undefined,
        sourceId: selectedSourceId || undefined,
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

  // 发布
  const handlePublish = async () => {
    if (!selectedPlatform || !title || !content) return;

    setError(null);

    let contentToPublish = currentContent;

    if (!contentToPublish) {
      const created = await addContent({
        contentType: selectedPlatform,
        sourceType: selectedSource || 'MANUAL',
        sourceUrl: externalUrl || undefined,
        sourceId: selectedSourceId || undefined,
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

    const result = await publish(contentToPublish.id);

    if (result.success) {
      toast.success(t('aiSocial.toast.published'));
      router.push('/ai-social');
    } else {
      setError(result.errorMessage || t('aiSocial.create.publishFailed'));
    }
  };

  // 返回上一步
  const handleBack = () => {
    if (currentStep === 'edit-content') {
      setCurrentStep('select-platform');
      setTitle('');
      setContent('');
      setDigest('');
      setTags([]);
      setCurrentContent(null);
    } else if (currentStep === 'select-platform') {
      if (sourceParam) {
        router.push('/ai-social');
      } else {
        setCurrentStep('select-source');
        setSelectedPlatform(null);
      }
    } else {
      router.push('/ai-social');
    }
  };

  const isLoading =
    isProcessing ||
    aiLoading ||
    contentLoading ||
    publishLoading ||
    sourcesLoading;

  // 来源选项配置
  const sourceOptions = [
    {
      id: 'MANUAL' as const,
      icon: PenTool,
      label: t('aiSocial.sources.manual'),
      desc: t('aiSocial.sources.manualDesc'),
    },
    {
      id: 'EXTERNAL_URL' as const,
      icon: Globe,
      label: t('aiSocial.sources.external_url'),
      desc: t('aiSocial.sources.externalUrlDesc'),
    },
    {
      id: 'AI_EXPLORE' as const,
      icon: Compass,
      label: t('aiSocial.sources.ai_explore'),
      desc: t('aiSocial.sources.aiExploreDesc'),
    },
    {
      id: 'AI_RESEARCH' as const,
      icon: BookOpen,
      label: t('aiSocial.sources.ai_research'),
      desc: t('aiSocial.sources.aiResearchDesc'),
    },
    {
      id: 'AI_OFFICE' as const,
      icon: Briefcase,
      label: t('aiSocial.sources.ai_office'),
      desc: t('aiSocial.sources.aiOfficeDesc'),
    },
    {
      id: 'AI_WRITING' as const,
      icon: PenTool,
      label: t('aiSocial.sources.ai_writing'),
      desc: t('aiSocial.sources.aiWritingDesc'),
    },
  ];

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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
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
            {t('aiSocial.create.title')}
          </h1>
          <p className="text-sm text-gray-500">
            {t('aiSocial.create.subtitle')}
          </p>
        </div>
      </div>

      {/* 步骤指示器 */}
      <div className="mb-8 flex items-center justify-center gap-2">
        {[
          { step: 'select-source', label: t('aiSocial.steps.source') },
          { step: 'select-platform', label: t('aiSocial.steps.platform') },
          { step: 'edit-content', label: t('aiSocial.steps.edit') },
        ].map((item, index) => {
          const isActive = currentStep === item.step;
          const isPassed =
            (item.step === 'select-source' &&
              currentStep !== 'select-source') ||
            (item.step === 'select-platform' && currentStep === 'edit-content');

          return (
            <div key={item.step} className="flex items-center">
              {index > 0 && (
                <div
                  className={`mx-2 h-0.5 w-8 ${isPassed || isActive ? 'bg-rose-500' : 'bg-gray-200'}`}
                />
              )}
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                    isActive
                      ? 'bg-rose-500 text-white'
                      : isPassed
                        ? 'bg-rose-100 text-rose-600'
                        : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {isPassed ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span
                  className={`text-sm ${isActive ? 'font-medium text-gray-900' : 'text-gray-500'}`}
                >
                  {item.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error Display */}
      {(error || aiError || contentError) && (
        <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-600">
          {error || aiError || contentError}
        </div>
      )}

      {/* Step 1: 选择来源 */}
      {currentStep === 'select-source' && (
        <div className="space-y-6">
          {/* 来源类型选择 */}
          {!selectedSource && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {sourceOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    onClick={() => handleSourceSelect(option.id)}
                    className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 p-6 text-center transition-all hover:border-rose-300 hover:bg-rose-50"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100">
                      <Icon className="h-6 w-6 text-rose-600" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {option.label}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {option.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* External URL 输入 */}
          {selectedSource === 'EXTERNAL_URL' && (
            <div className="rounded-xl border border-gray-200 p-6">
              <h3 className="mb-4 font-medium text-gray-900">
                {t('aiSocial.modal.urlLabel')}
              </h3>
              <div className="space-y-4">
                <input
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
                <p className="text-sm text-gray-500">
                  {t('aiSocial.modal.urlHint')}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedSource(null)}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t('common.back')}
                  </button>
                  <button
                    onClick={handleUrlSubmit}
                    disabled={!externalUrl.trim()}
                    className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {t('common.continue')}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 来源列表选择 */}
          {selectedSource &&
            !['MANUAL', 'EXTERNAL_URL'].includes(selectedSource) && (
              <div className="rounded-xl border border-gray-200 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">
                    {t('aiSocial.create.selectItem', {
                      source: t(
                        `aiSocial.sources.${selectedSource.toLowerCase()}`
                      ),
                    })}
                  </h3>
                  <button
                    onClick={() => setSelectedSource(null)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    {t('common.back')}
                  </button>
                </div>

                {sourcesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
                  </div>
                ) : sourceItems.length === 0 ? (
                  <div className="py-12 text-center text-gray-500">
                    {t('aiSocial.create.noSourceItems')}
                  </div>
                ) : (
                  <div className="max-h-96 space-y-2 overflow-y-auto">
                    {sourceItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleSourceItemSelect(item)}
                        className={`w-full rounded-lg border p-4 text-left transition-all hover:border-rose-300 hover:bg-rose-50 ${
                          selectedSourceId === item.id
                            ? 'border-rose-500 bg-rose-50'
                            : 'border-gray-200'
                        }`}
                      >
                        <div className="font-medium text-gray-900">
                          {item.title}
                        </div>
                        {item.description && (
                          <div className="mt-1 line-clamp-2 text-sm text-gray-500">
                            {item.description}
                          </div>
                        )}
                        {item.createdAt && (
                          <div className="mt-2 text-xs text-gray-400">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
        </div>
      )}

      {/* Step 2: 选择平台 */}
      {currentStep === 'select-platform' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 p-6">
            <h3 className="mb-4 font-medium text-gray-900">
              {t('aiSocial.create.selectPlatform')}
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {(
                ['WECHAT_ARTICLE', 'XIAOHONGSHU_NOTE'] as SocialContentType[]
              ).map((platform) => (
                <button
                  key={platform}
                  onClick={() => handlePlatformSelect(platform)}
                  disabled={isLoading}
                  className={`flex items-center justify-center gap-3 rounded-xl border p-6 transition-all ${
                    selectedPlatform === platform
                      ? 'border-rose-500 bg-rose-50'
                      : 'border-gray-200 hover:border-rose-300 hover:bg-rose-50'
                  } disabled:opacity-50`}
                >
                  <FileText className="h-6 w-6 text-rose-600" />
                  <span className="font-medium text-gray-900">
                    {t(`aiSocial.contentTypes.${platform.toLowerCase()}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 3: 编辑内容 */}
      {currentStep === 'edit-content' && (
        <div className="space-y-6">
          {/* 处理中状态 */}
          {isProcessing && !content && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 py-16">
              <Loader2 className="mb-4 h-12 w-12 animate-spin text-rose-500" />
              <p className="text-gray-600">{t('aiSocial.create.processing')}</p>
              <p className="mt-2 text-sm text-gray-400">
                {t('aiSocial.create.processingHint')}
              </p>
            </div>
          )}

          {/* 编辑表单 */}
          {(!isProcessing || content) && (
            <>
              {/* 标题 */}
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

              {/* 内容编辑与预览 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    内容
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

                {/* 双栏布局：编辑器 + 预览（预览区更宽） */}
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
                  {/* 左侧：代码编辑器（2/5 宽度） */}
                  <div className="space-y-2 xl:col-span-2">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="rounded bg-gray-100 px-2 py-0.5">
                        {selectedPlatform === 'WECHAT_ARTICLE'
                          ? 'HTML'
                          : '纯文本'}
                      </span>
                      <span>源代码</span>
                    </div>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      rows={20}
                      disabled={isLoading}
                      className="font-mono w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 disabled:bg-gray-50"
                      placeholder={t('aiSocial.create.contentPlaceholder')}
                    />
                  </div>

                  {/* 右侧：实时预览（3/5 宽度） */}
                  <div className="space-y-2 xl:col-span-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="rounded bg-green-100 px-2 py-0.5 text-green-700">
                        {t('aiSocial.create.preview')}
                      </span>
                      <span>
                        {selectedPlatform === 'WECHAT_ARTICLE'
                          ? '微信公众号效果'
                          : '小红书效果'}
                      </span>
                    </div>
                    <div
                      className="max-h-[600px] min-h-[400px] overflow-auto rounded-lg border border-gray-200 bg-white p-4"
                      style={{
                        // 模拟微信公众号文章样式
                        fontFamily:
                          selectedPlatform === 'WECHAT_ARTICLE'
                            ? '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei UI", "Microsoft YaHei", Arial, sans-serif'
                            : 'inherit',
                        fontSize: '16px',
                        lineHeight: '1.75',
                        color: '#333',
                      }}
                    >
                      {selectedPlatform === 'WECHAT_ARTICLE' ? (
                        // 微信公众号：渲染 HTML
                        <div
                          dangerouslySetInnerHTML={{
                            __html:
                              content ||
                              '<p style="color: #999;">预览内容将在此显示...</p>',
                          }}
                        />
                      ) : (
                        // 小红书：渲染纯文本（保留换行和表情）
                        <div className="whitespace-pre-wrap">
                          {content || '预览内容将在此显示...'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 摘要 */}
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

              {/* 标签 */}
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

              {/* 操作按钮 */}
              <div className="flex justify-end gap-3 border-t pt-6">
                <button
                  onClick={handleBack}
                  disabled={isLoading}
                  className="rounded-lg border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {t('common.back')}
                </button>
                <button
                  onClick={handleSaveDraft}
                  disabled={!title || !content || isLoading}
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
                  disabled={!title || !content || isLoading}
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
        </div>
      )}
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
