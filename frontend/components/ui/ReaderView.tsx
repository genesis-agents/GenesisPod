'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { config } from '@/lib/config';

interface ReaderViewProps {
  url: string;
  title?: string;
  className?: string;
  category?: string; // 资源类别，用于选择合适的API端点
  isImportedResource?: boolean; // 是否为已导入的资源（来自数据库），如果是则不限制域名
  onArticleLoaded?: (article: Article) => void;
}

interface Article {
  success: boolean;
  title: string;
  content: string;
  textContent: string;
  excerpt?: string;
  byline?: string;
  siteName?: string;
  length?: number;
  sourceUrl: string;
}

// 主题配置 - 参考 Medium/Substack 的配色方案
type ThemeType = 'light' | 'sepia' | 'dark';
type FontSizeType = 'small' | 'medium' | 'large';

const themes: Record<
  ThemeType,
  {
    bg: string;
    text: string;
    secondary: string;
    border: string;
    heading: string;
  }
> = {
  light: {
    bg: 'bg-white',
    text: 'text-gray-700',
    secondary: 'text-gray-500',
    border: 'border-gray-200',
    heading: 'text-gray-900',
  },
  sepia: {
    bg: 'bg-[#FBF7F0]',
    text: 'text-[#5C4B37]',
    secondary: 'text-[#8B7355]',
    border: 'border-[#E8DFD0]',
    heading: 'text-[#3D2E1C]',
  },
  dark: {
    bg: 'bg-[#1A1A1A]',
    text: 'text-gray-300',
    secondary: 'text-gray-500',
    border: 'border-gray-700',
    heading: 'text-gray-100',
  },
};

const fontSizes: Record<
  FontSizeType,
  { body: string; heading: string; meta: string }
> = {
  small: { body: 'text-[15px]', heading: 'text-2xl', meta: 'text-xs' },
  medium: { body: 'text-[18px]', heading: 'text-3xl', meta: 'text-sm' },
  large: { body: 'text-[21px]', heading: 'text-4xl', meta: 'text-base' },
};

/**
 * Reader View组件 - 使用Mozilla Readability提取清洁内容
 *
 * 功能特性:
 * - 完美规避X-Frame-Options、CSP等安全限制
 * - 提取网页主要内容，去除广告和干扰元素
 * - 统一的阅读样式，优秀的阅读体验
 * - 支持AI完整分析内容
 * - 快速加载，节省流量
 */
export default function ReaderView({
  url,
  title: propTitle,
  className = '',
  category,
  isImportedResource = false,
  onArticleLoaded,
}: ReaderViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // 阅读体验设置
  const [theme, setTheme] = useState<ThemeType>('light');
  const [fontSize, setFontSize] = useState<FontSizeType>('medium');
  const [readingProgress, setReadingProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // 计算阅读进度
  const handleScroll = useCallback(() => {
    if (!contentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
    const progress = Math.min(
      100,
      Math.round((scrollTop / (scrollHeight - clientHeight)) * 100)
    );
    setReadingProgress(isNaN(progress) ? 0 : progress);
  }, []);

  // 加载文章内容
  useEffect(() => {
    const loadArticle = async () => {
      setLoading(true);
      setError(null);

      try {
        // 根据资源类别选择合适的API端点
        // News类型使用html-reader-news（无域名限制），其他类型使用html-reader（有域名白名单）
        console.log('[ReaderView] Category:', category, 'URL:', url);

        // 决定使用哪个端点：
        // 1. 已导入的资源（来自数据库）：使用无域名限制的 html-reader-news 端点
        // 2. 新闻类别或新闻域名：使用无域名限制的 html-reader-news 端点
        // 3. 其他情况：使用有白名单限制的 html-reader 端点
        const newsDomains = [
          'reuters.com',
          'bbc.com',
          'theguardian.com',
          'nytimes.com',
          'wsj.com',
          'ft.com',
          'bloomberg.com',
          'apnews.com',
          'cnn.com',
          'foxnews.com',
          'nbcnews.com',
          'abcnews.go.com',
          'cbsnews.com',
        ];
        const urlDomain = new URL(url).hostname.replace('www.', '');
        const isNewsByDomain = newsDomains.some((domain) =>
          urlDomain.includes(domain)
        );
        const isNewsByCategory = category?.toLowerCase() === 'news';
        const isNews = isNewsByCategory || isNewsByDomain;

        // 关键逻辑：已导入资源使用无限制端点，确保用户可以打开所有已收录的内容
        const useUnrestrictedEndpoint = isImportedResource || isNews;
        const endpoint = useUnrestrictedEndpoint
          ? 'html-reader-news'
          : 'html-reader';
        const readerUrl = `${config.apiUrl}/proxy/${endpoint}?url=${encodeURIComponent(url)}`;
        console.log(
          `[ReaderView] Using endpoint: ${endpoint} (imported: ${isImportedResource}, category: ${isNewsByCategory}, domain: ${isNewsByDomain})`
        );
        console.log(`[ReaderView] Fetching: ${readerUrl}`);

        const response = await fetch(readerUrl);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message ||
              `HTTP ${response.status}: ${response.statusText}`
          );
        }

        const data: Article = await response.json();

        if (!data.success || !data.content) {
          throw new Error('Failed to extract readable content from this page');
        }

        console.log(
          `Article loaded successfully: "${data.title}" (${data.length} characters)`
        );
        setArticle(data);
        onArticleLoaded?.(data);
        setLoading(false);
        setError(null);
      } catch (err) {
        console.error(`Failed to load article from ${url}:`, err);
        setLoading(false);
        setError(
          err instanceof Error
            ? `无法提取内容: ${err.message}`
            : '无法提取可读内容。该网页可能不支持阅读模式。'
        );
      }
    };

    loadArticle();
  }, [url, retryCount]);

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  const handleOpenInNewTab = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const currentTheme = themes[theme];
  const currentFontSize = fontSizes[fontSize];

  return (
    <div className={`relative flex h-full flex-col ${className}`}>
      {/* 阅读进度条 */}
      {article && !loading && (
        <div className="absolute left-0 right-0 top-0 z-20 h-1 bg-gray-200">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-150 ease-out"
            style={{ width: `${readingProgress}%` }}
          />
        </div>
      )}

      {/* 控制栏 */}
      <div
        className={`flex items-center justify-between gap-2 border-b px-3 py-2 ${currentTheme.bg} ${currentTheme.border}`}
      >
        {/* 阅读模式标识 + 进度 */}
        <div
          className={`flex items-center gap-2 text-sm font-medium ${currentTheme.text}`}
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
          </svg>
          <span>阅读模式</span>
          {article && (
            <span className={`ml-1 ${currentTheme.secondary}`}>
              · {readingProgress}%
            </span>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1">
          {/* 阅读设置按钮 */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`rounded-lg p-1.5 transition-colors ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
              title="阅读设置"
            >
              <svg
                className={`h-4 w-4 ${currentTheme.text}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
            </button>

            {/* 设置面板 */}
            {showSettings && (
              <div
                className={`absolute right-0 top-full z-30 mt-2 w-48 rounded-lg border p-3 shadow-lg ${currentTheme.bg} ${currentTheme.border}`}
              >
                {/* 主题选择 */}
                <div className="mb-3">
                  <div
                    className={`mb-2 text-xs font-medium ${currentTheme.secondary}`}
                  >
                    主题
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setTheme('light')}
                      className={`flex-1 rounded px-2 py-1 text-xs ${theme === 'light' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      浅色
                    </button>
                    <button
                      onClick={() => setTheme('sepia')}
                      className={`flex-1 rounded px-2 py-1 text-xs ${theme === 'sepia' ? 'bg-blue-500 text-white' : 'bg-[#F5EFE6] text-[#5C4B37] hover:bg-[#E8DFD0]'}`}
                    >
                      护眼
                    </button>
                    <button
                      onClick={() => setTheme('dark')}
                      className={`flex-1 rounded px-2 py-1 text-xs ${theme === 'dark' ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'}`}
                    >
                      深色
                    </button>
                  </div>
                </div>

                {/* 字号选择 */}
                <div>
                  <div
                    className={`mb-2 text-xs font-medium ${currentTheme.secondary}`}
                  >
                    字号
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setFontSize('small')}
                      className={`flex-1 rounded px-2 py-1 text-xs ${fontSize === 'small' ? 'bg-blue-500 text-white' : theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      小
                    </button>
                    <button
                      onClick={() => setFontSize('medium')}
                      className={`flex-1 rounded px-2 py-1 text-xs ${fontSize === 'medium' ? 'bg-blue-500 text-white' : theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      中
                    </button>
                    <button
                      onClick={() => setFontSize('large')}
                      className={`flex-1 rounded px-2 py-1 text-xs ${fontSize === 'large' ? 'bg-blue-500 text-white' : theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      大
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleRetry}
            className={`rounded-lg p-1.5 transition-colors ${theme === 'dark' ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
            title="刷新"
          >
            <svg
              className={`h-4 w-4 ${currentTheme.text}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>

          <button
            onClick={handleOpenInNewTab}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            title="在新标签页打开原始页面"
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
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            打开原始
          </button>
        </div>
      </div>

      {/* 文章内容区域 */}
      <div
        ref={contentRef}
        onScroll={handleScroll}
        className={`relative flex-1 overflow-y-auto ${currentTheme.bg}`}
      >
        {/* Loading State */}
        {loading && (
          <div
            className={`absolute inset-0 z-10 flex items-center justify-center ${currentTheme.bg}`}
          >
            <div className="text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
              <p className="mt-4 text-sm text-gray-600">正在提取内容...</p>
              <p className="mt-2 text-xs text-gray-500">
                使用 Reader Mode 解析网页
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50">
            <div className="max-w-md px-4 text-center">
              <svg
                className="mx-auto h-16 w-16 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">
                无法提取内容
              </h3>
              <p className="mt-2 text-sm text-gray-600">{error}</p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={handleRetry}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  重试{retryCount > 0 && ` (${retryCount})`}
                </button>
                <button
                  onClick={handleOpenInNewTab}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
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
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  打开原始页面
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 文章内容 - 优化的阅读样式 */}
        {article && !loading && !error && (
          <article
            className="mx-auto px-6 py-10 sm:px-8 md:px-12"
            style={{ maxWidth: '680px' }}
          >
            {/* 文章元信息 */}
            <header className={`mb-8 border-b pb-6 ${currentTheme.border}`}>
              <h1
                className={`mb-4 font-bold leading-tight ${currentFontSize.heading} ${currentTheme.heading}`}
              >
                {article.title || propTitle || '无标题'}
              </h1>

              <div
                className={`flex flex-wrap items-center gap-3 ${currentFontSize.meta} ${currentTheme.secondary}`}
              >
                {article.byline && (
                  <div className="flex items-center gap-1">
                    <svg
                      className="h-4 w-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{article.byline}</span>
                  </div>
                )}

                {article.siteName && (
                  <div className="flex items-center gap-1">
                    <svg
                      className="h-4 w-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{article.siteName}</span>
                  </div>
                )}

                {article.length && (
                  <div className="flex items-center gap-1">
                    <svg
                      className="h-4 w-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span>{Math.ceil(article.length / 1000)} 分钟阅读</span>
                  </div>
                )}
              </div>

              {article.excerpt && (
                <p
                  className={`mt-4 text-lg leading-relaxed ${currentTheme.text}`}
                >
                  {article.excerpt}
                </p>
              )}
            </header>

            {/* 文章正文 - 使用 prose 样式，支持纯文本和 HTML，动态主题和字号 */}
            <div
              className={`prose max-w-none [&>*:first-child]:mt-0
                ${currentFontSize.body} leading-[1.85]
                ${currentTheme.text}
                prose-headings:font-bold prose-headings:mt-10 prose-headings:mb-4
                ${theme === 'dark' ? 'prose-headings:text-gray-100' : theme === 'sepia' ? 'prose-headings:text-[#3D2E1C]' : 'prose-headings:text-gray-900'}
                prose-h1:text-2xl prose-h1:border-b prose-h1:pb-3
                ${theme === 'dark' ? 'prose-h1:border-gray-700' : theme === 'sepia' ? 'prose-h1:border-[#E8DFD0]' : 'prose-h1:border-gray-200'}
                prose-h2:text-xl prose-h3:text-lg
                prose-p:leading-[1.9] prose-p:mb-5
                prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-a:font-medium
                ${theme === 'dark' ? 'prose-strong:text-gray-100' : theme === 'sepia' ? 'prose-strong:text-[#3D2E1C]' : 'prose-strong:text-gray-900'} prose-strong:font-bold
                prose-em:italic
                ${theme === 'dark' ? 'prose-code:bg-gray-800 prose-code:text-pink-400' : theme === 'sepia' ? 'prose-code:bg-[#EDE5D8] prose-code:text-red-700' : 'prose-code:bg-gray-100 prose-code:text-red-600'}
                prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
                ${theme === 'dark' ? 'prose-pre:bg-gray-950' : 'prose-pre:bg-gray-900'} prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:p-4
                prose-img:rounded-xl prose-img:shadow-lg prose-img:my-8 prose-img:mx-auto
                prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:py-4 prose-blockquote:pr-4 prose-blockquote:rounded-r-lg prose-blockquote:my-8
                ${theme === 'dark' ? 'prose-blockquote:bg-gradient-to-r prose-blockquote:from-blue-900/30 prose-blockquote:to-transparent' : theme === 'sepia' ? 'prose-blockquote:bg-gradient-to-r prose-blockquote:from-[#E8DFD0] prose-blockquote:to-transparent' : 'prose-blockquote:bg-gradient-to-r prose-blockquote:from-blue-50 prose-blockquote:to-transparent'}
                prose-ul:list-disc prose-ul:pl-6 prose-ul:my-5 prose-ul:space-y-2
                prose-ol:list-decimal prose-ol:pl-6 prose-ol:my-5 prose-ol:space-y-2
                prose-li:leading-[1.8]
                prose-hr:my-10 ${theme === 'dark' ? 'prose-hr:border-gray-700' : theme === 'sepia' ? 'prose-hr:border-[#E8DFD0]' : 'prose-hr:border-gray-200'}
                prose-table:border-collapse prose-table:w-full prose-th:p-3 prose-th:text-left prose-td:p-3 prose-td:border
                ${theme === 'dark' ? 'prose-th:bg-gray-800 prose-td:border-gray-700' : theme === 'sepia' ? 'prose-th:bg-[#EDE5D8] prose-td:border-[#E8DFD0]' : 'prose-th:bg-gray-100 prose-td:border-gray-200'}`}
            >
              {/* 检查内容是否包含HTML标签，如果是纯文本则智能转换 */}
              {article.content.includes('<p>') ||
              article.content.includes('<div>') ||
              article.content.includes('<h') ? (
                <div dangerouslySetInnerHTML={{ __html: article.content }} />
              ) : (
                // 纯文本内容：智能识别格式并转换
                <div>
                  {article.content
                    .split(/\n\n+/)
                    .filter((para) => para.trim())
                    .map((paragraph, index) => {
                      const trimmed = paragraph.trim();

                      // 检测标题模式 (以数字+点开头，如 "1. Title" 或 "Section 1:")
                      const isNumberedHeading =
                        /^(\d+\.|\w+\s+\d+[:.])/.test(trimmed) &&
                        trimmed.length < 100;
                      const isSectionHeading =
                        /^(Section|Chapter|Part|Sec\.|[A-Z][a-z]*:)/.test(
                          trimmed
                        ) && trimmed.length < 120;
                      const isShortTitle =
                        trimmed.length < 80 &&
                        !trimmed.includes('.') &&
                        /^[A-Z]/.test(trimmed);

                      // 检测列表项
                      const listItems = trimmed
                        .split('\n')
                        .filter((line) =>
                          /^(\s*[-•*]\s+|\s*\d+[.)]\s+|\s*\([a-z]\)\s+|\s*\([ivx]+\)\s+)/i.test(
                            line
                          )
                        );
                      const isListBlock = listItems.length > 1;

                      if (isNumberedHeading || isSectionHeading) {
                        return (
                          <h2
                            key={index}
                            className={`mb-4 mt-10 border-l-4 border-blue-500 pl-4 text-xl font-bold ${currentTheme.heading}`}
                          >
                            {trimmed}
                          </h2>
                        );
                      }

                      if (isShortTitle && index > 0) {
                        return (
                          <h3
                            key={index}
                            className={`mb-3 mt-8 text-lg font-semibold ${currentTheme.heading}`}
                          >
                            {trimmed}
                          </h3>
                        );
                      }

                      if (isListBlock) {
                        return (
                          <ul key={index} className="my-5 space-y-2 pl-6">
                            {trimmed.split('\n').map((item, i) => {
                              const cleanItem = item
                                .replace(
                                  /^(\s*[-•*]\s+|\s*\d+[.)]\s+|\s*\([a-z]\)\s+|\s*\([ivx]+\)\s+)/i,
                                  ''
                                )
                                .trim();
                              return cleanItem ? (
                                <li
                                  key={i}
                                  className={`leading-[1.8] ${currentTheme.text}`}
                                >
                                  {cleanItem}
                                </li>
                              ) : null;
                            })}
                          </ul>
                        );
                      }

                      // 普通段落
                      return (
                        <p
                          key={index}
                          className={`mb-5 leading-[1.9] ${currentFontSize.body} ${currentTheme.text}`}
                        >
                          {paragraph.split('\n').map((line, lineIndex) => (
                            <span key={lineIndex}>
                              {line}
                              {lineIndex < paragraph.split('\n').length - 1 && (
                                <br />
                              )}
                            </span>
                          ))}
                        </p>
                      );
                    })}
                </div>
              )}
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
