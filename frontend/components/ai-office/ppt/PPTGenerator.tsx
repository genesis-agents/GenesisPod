'use client';

/**
 * PPT Generator Component
 *
 * AI Office 3.0 - PPT 生成器主组件
 *
 * 功能：
 * 1. 输入提示词/URL/文件
 * 2. 流式显示生成进度
 * 3. 实时预览生成的幻灯片
 * 4. 支持单页编辑和重新生成
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Play,
  FileText,
  Link,
  Upload,
  Settings,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Download,
  Palette,
  Layout,
  Image as ImageIcon,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import {
  PPTGenerationInput,
  PPTDocument,
  PPTStreamEvent,
  GeneratedSlide,
  PPTOutline,
  PPT_THEME_LIST,
  LAYOUT_OPTIONS,
} from '@/types/ppt';

// ============================================
// 子组件
// ============================================

// 主题选择器
const ThemeSelector: React.FC<{
  selectedTheme: string;
  onSelect: (themeId: string) => void;
}> = ({ selectedTheme, onSelect }) => {
  return (
    <div className="flex flex-wrap gap-2">
      {PPT_THEME_LIST.map((theme) => (
        <button
          key={theme.id}
          onClick={() => onSelect(theme.id)}
          className={`
            flex items-center gap-2 rounded-lg border px-3 py-2 transition-all
            ${
              selectedTheme === theme.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
            }
          `}
        >
          <div
            className="h-4 w-4 rounded-full"
            style={{ backgroundColor: theme.preview }}
          />
          <span className="text-sm">{theme.nameZh}</span>
        </button>
      ))}
    </div>
  );
};

// 进度显示
const GenerationProgress: React.FC<{
  progress: PPTStreamEvent['progress'];
  outline?: PPTOutline;
}> = ({ progress, outline }) => {
  if (!progress) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          生成进度
        </h3>
        <span className="text-sm text-gray-500">{progress.percentage}%</span>
      </div>

      {/* 进度条 */}
      <div className="mb-4 h-2 w-full rounded-full bg-gray-100 dark:bg-gray-700">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>

      {/* 当前步骤 */}
      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{progress.message}</span>
      </div>

      {/* 幻灯片进度 */}
      {progress.currentSlide !== undefined && progress.totalSlides && (
        <div className="mt-3 text-sm text-gray-500">
          幻灯片 {progress.currentSlide} / {progress.totalSlides}
        </div>
      )}

      {/* 大纲预览 */}
      {outline && (
        <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
          <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            {outline.title}
          </h4>
          <div className="space-y-1">
            {outline.slides.slice(0, 5).map((slide, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-gray-500"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded bg-gray-100 dark:bg-gray-700">
                  {i + 1}
                </span>
                <span className="truncate">{slide.title}</span>
              </div>
            ))}
            {outline.slides.length > 5 && (
              <div className="text-xs text-gray-400">
                +{outline.slides.length - 5} 更多...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// 幻灯片缩略图列表
const SlideThumbnailList: React.FC<{
  slides: GeneratedSlide[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}> = ({ slides, selectedIndex, onSelect }) => {
  return (
    <div className="w-48 overflow-y-auto border-r border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
      <div className="space-y-2 p-3">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            onClick={() => onSelect(index)}
            className={`
              aspect-video w-full overflow-hidden rounded-lg border-2 transition-all
              ${
                selectedIndex === index
                  ? 'border-blue-500 shadow-md'
                  : 'border-transparent hover:border-gray-300'
              }
            `}
          >
            {/* 幻灯片预览 */}
            <div
              className="h-full w-full bg-white p-2 text-left dark:bg-gray-800"
              dangerouslySetInnerHTML={{
                __html: slide.renderedHtml
                  ? `<div style="transform: scale(0.15); transform-origin: top left; width: 666%; height: 666%;">${slide.renderedHtml}</div>`
                  : `<div class="text-xs text-gray-500">${slide.content.title}</div>`,
              }}
            />
            {/* 页码 */}
            <div className="absolute bottom-1 right-1 rounded bg-black/50 px-1 text-xs text-white">
              {index + 1}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

// 幻灯片预览
const SlidePreview: React.FC<{
  slide: GeneratedSlide | null;
  onRegenerate?: () => void;
  onChangeLayout?: () => void;
}> = ({ slide, onRegenerate, onChangeLayout }) => {
  if (!slide) {
    return (
      <div className="flex flex-1 items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-gray-400">选择一个幻灯片预览</div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-gray-100 p-6 dark:bg-gray-900">
      {/* 工具栏 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">
            幻灯片 {slide.index + 1} - {slide.spec.purpose}
          </span>
          <span className="rounded bg-gray-200 px-2 py-0.5 text-xs dark:bg-gray-700">
            {slide.spec.layoutType}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onChangeLayout}
            className="rounded-lg p-2 hover:bg-gray-200 dark:hover:bg-gray-700"
            title="更换布局"
          >
            <Layout className="h-4 w-4" />
          </button>
          <button
            onClick={onRegenerate}
            className="rounded-lg p-2 hover:bg-gray-200 dark:hover:bg-gray-700"
            title="重新生成"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 幻灯片内容 */}
      <div className="flex-1 overflow-hidden rounded-xl bg-white shadow-lg dark:bg-gray-800">
        <div
          className="h-full w-full"
          style={{ aspectRatio: '16/9' }}
          dangerouslySetInnerHTML={{ __html: slide.renderedHtml || '' }}
        />
      </div>

      {/* 演讲者备注 */}
      {slide.content.speakerNotes && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            演讲者备注
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {slide.content.speakerNotes}
          </p>
        </div>
      )}
    </div>
  );
};

// ============================================
// 主组件
// ============================================

export const PPTGenerator: React.FC = () => {
  // 状态
  const [prompt, setPrompt] = useState('');
  const [urls, setUrls] = useState<string[]>([]);
  const [themeId, setThemeId] = useState('professional');
  const [includeImages, setIncludeImages] = useState(true);
  const [includeSpeakerNotes, setIncludeSpeakerNotes] = useState(true);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<PPTStreamEvent['progress']>();
  const [outline, setOutline] = useState<PPTOutline>();
  const [pptDocument, setPptDocument] = useState<PPTDocument | null>(null);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [showSettings, setShowSettings] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  // 清理 EventSource
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // 开始生成
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() && urls.length === 0) {
      setError('请输入提示词或添加 URL');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setProgress(undefined);
    setOutline(undefined);
    setPptDocument(null);

    // 构建查询参数
    const params = new URLSearchParams({
      prompt: prompt.trim(),
      themeId,
      includeImages: String(includeImages),
    });

    if (urls.length > 0) {
      params.set('urls', urls.join(','));
    }

    // 创建 SSE 连接
    const url = `/api/ai-office/ppt/generate/stream?${params.toString()}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: PPTStreamEvent = JSON.parse(event.data);

        switch (data.type) {
          case 'progress':
            setProgress(data.progress);
            break;

          case 'outline_complete':
            setOutline(data.outline);
            break;

          case 'slide_complete':
            // 增量更新幻灯片
            if (data.slide) {
              setPptDocument((prev) => {
                if (!prev) return prev;
                const newSlides = [...prev.slides];
                newSlides[data.slide!.index] = {
                  ...newSlides[data.slide!.index],
                  content: data.slide!.content!,
                  images: data.slide!.images || [],
                  renderedHtml: data.slide!.renderedHtml,
                } as GeneratedSlide;
                return { ...prev, slides: newSlides };
              });
            }
            break;

          case 'complete':
            setIsGenerating(false);
            setProgress(undefined);
            // 获取完整文档
            if (data.result?.pptId) {
              fetchPPTDocument(data.result.pptId);
            }
            break;

          case 'error':
            setError(data.error?.message || '生成失败');
            setIsGenerating(false);
            break;
        }
      } catch (e) {
        console.error('Failed to parse SSE event:', e);
      }
    };

    eventSource.onerror = (event) => {
      console.error('SSE error:', event);
      setError('连接中断，请重试');
      setIsGenerating(false);
      eventSource.close();
    };
  }, [prompt, urls, themeId, includeImages]);

  // 获取完整文档
  const fetchPPTDocument = async (pptId: string) => {
    try {
      const response = await fetch(`/api/ai-office/ppt/${pptId}`);
      if (response.ok) {
        const doc = await response.json();
        setPptDocument(doc);
      }
    } catch (e) {
      console.error('Failed to fetch PPT document:', e);
    }
  };

  // 停止生成
  const handleStop = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsGenerating(false);
  }, []);

  // 添加 URL
  const handleAddUrl = useCallback(() => {
    const url = window.prompt('输入 URL:');
    if (url && url.trim()) {
      setUrls((prev) => [...prev, url.trim()]);
    }
  }, []);

  // 删除 URL
  const handleRemoveUrl = useCallback((index: number) => {
    setUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // 重新生成单页
  const handleRegenerateSlide = useCallback(async () => {
    if (!pptDocument) return;

    const slide = pptDocument.slides[selectedSlideIndex];
    if (!slide) return;

    try {
      const response = await fetch(
        `/api/ai-office/ppt/${pptDocument.id}/slides/${selectedSlideIndex}/regenerate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            regenerateContent: true,
            regenerateImage: true,
          }),
        }
      );

      if (response.ok) {
        const newSlide = await response.json();
        setPptDocument((prev) => {
          if (!prev) return prev;
          const newSlides = [...prev.slides];
          newSlides[selectedSlideIndex] = newSlide;
          return { ...prev, slides: newSlides };
        });
      }
    } catch (e) {
      console.error('Failed to regenerate slide:', e);
    }
  }, [pptDocument, selectedSlideIndex]);

  // 导出 PPT
  const handleExport = useCallback(async () => {
    if (!pptDocument) return;

    try {
      const response = await fetch(
        `/api/ai-office/ppt/${pptDocument.id}/export`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            format: 'pptx',
            includeNotes: includeSpeakerNotes,
          }),
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${pptDocument.title}.pptx`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('Failed to export PPT:', e);
    }
  }, [pptDocument, includeSpeakerNotes]);

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-900">
      {/* 顶部输入区 */}
      {!pptDocument && (
        <div className="border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto max-w-4xl space-y-4">
            {/* 标题 */}
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              AI PPT 生成器
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              输入主题或粘贴内容，AI 将自动生成专业的演示文稿
            </p>

            {/* 输入框 */}
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述你想要的 PPT 内容，例如：介绍人工智能的发展历程和未来趋势..."
                className="h-32 w-full resize-none rounded-xl border border-gray-200 bg-white p-4 pr-12 text-gray-900 placeholder-gray-400 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="absolute right-3 top-3 rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Settings className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            {/* URL 列表 */}
            {urls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {urls.map((url, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                  >
                    <Link className="h-3 w-3" />
                    <span className="max-w-[200px] truncate">{url}</span>
                    <button
                      onClick={() => handleRemoveUrl(i)}
                      className="hover:text-blue-800"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 设置面板 */}
            {showSettings && (
              <div className="space-y-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-900">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    选择主题
                  </label>
                  <ThemeSelector
                    selectedTheme={themeId}
                    onSelect={setThemeId}
                  />
                </div>
                <div className="flex items-center gap-6">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeImages}
                      onChange={(e) => setIncludeImages(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      生成配图
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeSpeakerNotes}
                      onChange={(e) => setIncludeSpeakerNotes(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      生成演讲稿
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleAddUrl}
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
              >
                <Link className="h-4 w-4" />
                <span>添加 URL</span>
              </button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex items-center gap-2 rounded-lg bg-blue-500 px-6 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>生成中...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    <span>开始生成</span>
                  </>
                )}
              </button>
              {isGenerating && (
                <button
                  onClick={handleStop}
                  className="rounded-lg px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  停止
                </button>
              )}
            </div>

            {/* 错误提示 */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-red-600 dark:bg-red-900/20 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 生成进度 */}
      {isGenerating && (
        <div className="p-6">
          <div className="mx-auto max-w-xl">
            <GenerationProgress progress={progress} outline={outline} />
          </div>
        </div>
      )}

      {/* PPT 编辑器 */}
      {pptDocument && (
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧缩略图 */}
          <SlideThumbnailList
            slides={pptDocument.slides}
            selectedIndex={selectedSlideIndex}
            onSelect={setSelectedSlideIndex}
          />

          {/* 中间预览 */}
          <SlidePreview
            slide={pptDocument.slides[selectedSlideIndex]}
            onRegenerate={handleRegenerateSlide}
          />

          {/* 右侧面板 */}
          <div className="w-80 space-y-4 overflow-y-auto border-l border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            {/* 文档信息 */}
            <div>
              <h3 className="mb-2 font-semibold text-gray-900 dark:text-white">
                {pptDocument.title}
              </h3>
              <div className="space-y-1 text-sm text-gray-500">
                <div>{pptDocument.slides.length} 页幻灯片</div>
                <div>预计 {pptDocument.outline.estimatedDuration} 分钟</div>
                <div>{pptDocument.metadata.imageCount} 张配图</div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="space-y-2">
              <button
                onClick={handleExport}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
              >
                <Download className="h-4 w-4" />
                <span>导出 PPTX</span>
              </button>
              <button
                onClick={() => {
                  setPptDocument(null);
                  setSelectedSlideIndex(0);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
              >
                <RefreshCw className="h-4 w-4" />
                <span>重新生成</span>
              </button>
            </div>

            {/* 主题信息 */}
            <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
              <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                当前主题
              </h4>
              <div className="flex items-center gap-2">
                <div
                  className="h-6 w-6 rounded-full"
                  style={{ backgroundColor: pptDocument.theme.colors.primary }}
                />
                <span className="text-sm">{pptDocument.theme.nameZh}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PPTGenerator;
