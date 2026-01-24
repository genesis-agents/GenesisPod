'use client';

import { useState, useEffect, memo, useCallback } from 'react';
import { config } from '@/lib/utils/config';
import { useThumbnailGenerator, needsThumbnail } from '@/hooks';
import { useRouter } from 'next/navigation';
import { useImageSourceStore } from '@/stores';

import { logger } from '@/lib/utils/logger';
interface Resource {
  id: string;
  type: string;
  title: string;
  abstract?: string;
  aiSummary?: string;
  publishedAt: string;
  sourceUrl: string;
  pdfUrl?: string;
  thumbnailUrl?: string;
  authors?: Array<{ username?: string; platform?: string; name?: string }>;
  categories?: string[];
  qualityScore?: string;
  upvoteCount?: number;
  viewCount?: number;
  commentCount?: number;
  metadata?: {
    feedTitle?: string;
    channelName?: string;
    sourceName?: string;
    [key: string]: any;
  };
  sourceType?: string;
}

interface ResourceCardProps {
  resource: Resource;
  onClick: () => void;
  onToggleBookmark: (e: React.MouseEvent) => void;
  isBookmarked: boolean;
  onUpvote?: (e: React.MouseEvent) => void;
  onCommentClick?: (e: React.MouseEvent) => void;
  hasUpvoted?: boolean;
}

function ResourceCardComponent({
  resource,
  onClick,
  onToggleBookmark,
  isBookmarked,
  onUpvote,
  onCommentClick,
  hasUpvoted = false,
}: ResourceCardProps) {
  const [localThumbnailUrl, setLocalThumbnailUrl] = useState<string | null>(
    resource.thumbnailUrl || null
  );
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
  const { generateAndUploadThumbnail } = useThumbnailGenerator();
  const router = useRouter();
  const addSource = useImageSourceStore((state) => state.addSource);

  const handleAddToImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    addSource({
      id: resource.id,
      type: resource.type.toLowerCase() as any,
      title: resource.title,
      url: resource.sourceUrl || resource.pdfUrl || '',
      thumbnailUrl: resource.thumbnailUrl,
      addedAt: new Date(),
    });
    router.push('/library?tab=images');
  };

  // Helper function to extract source name from resource
  const getSourceName = (): string | null => {
    // Try metadata fields first
    if (resource.metadata?.feedTitle) {
      return resource.metadata.feedTitle;
    }
    if (resource.metadata?.channelName) {
      return resource.metadata.channelName;
    }
    if (resource.metadata?.sourceName) {
      return resource.metadata.sourceName;
    }
    // Try authors (RSS feeds store channel name in author)
    if (resource.authors && resource.authors.length > 0) {
      const author = resource.authors[0];
      if (author.name) return author.name;
      if (author.username) return author.username;
    }
    // Try to extract from sourceUrl domain
    if (resource.sourceUrl) {
      try {
        const url = new URL(resource.sourceUrl);
        const hostname = url.hostname.replace('www.', '');
        // Known source domain mappings
        const domainMap: Record<string, string> = {
          'youtube.com': 'YouTube',
          'arxiv.org': 'arXiv',
          'github.com': 'GitHub',
          'medium.com': 'Medium',
          'news.ycombinator.com': 'Hacker News',
          'substack.com': 'Substack',
        };
        if (domainMap[hostname]) {
          return domainMap[hostname];
        }
        // Return cleaned domain name
        return hostname.split('.')[0];
      } catch {
        return null;
      }
    }
    return null;
  };

  // Get source badge color based on source type or name
  const getSourceBadgeColor = (sourceName: string): string => {
    const name = sourceName.toLowerCase();
    if (name.includes('youtube') || resource.type === 'YOUTUBE_VIDEO') {
      return 'bg-red-100 text-red-700';
    }
    if (name.includes('arxiv') || resource.type === 'PAPER') {
      return 'bg-orange-100 text-orange-700';
    }
    if (name.includes('github') || resource.type === 'PROJECT') {
      return 'bg-gray-100 text-gray-700';
    }
    if (name.includes('hacker') || resource.type === 'NEWS') {
      return 'bg-amber-100 text-amber-700';
    }
    if (resource.type === 'POLICY') {
      return 'bg-blue-100 text-blue-700';
    }
    if (resource.type === 'REPORT') {
      return 'bg-purple-100 text-purple-700';
    }
    if (resource.type === 'BLOG') {
      return 'bg-green-100 text-green-700';
    }
    return 'bg-gray-100 text-gray-600';
  };

  const sourceName = getSourceName();

  // Auto-generate thumbnail on mount if needed
  useEffect(() => {
    const autoGenerateThumbnail = async () => {
      if (needsThumbnail(resource) && !isGeneratingThumbnail) {
        setIsGeneratingThumbnail(true);

        try {
          const success = await generateAndUploadThumbnail(
            resource.id,
            resource.pdfUrl!
          );

          if (success) {
            // Fetch updated resource to get thumbnail URL
            const response = await fetch(
              `${config.apiBaseUrl}/api/v1/resources/${resource.id}`
            );
            if (response.ok) {
              const updatedResource = await response.json();
              setLocalThumbnailUrl(updatedResource.thumbnailUrl);
            }
          }
        } catch (error) {
          logger.error('Auto thumbnail generation failed:', error);
        } finally {
          setIsGeneratingThumbnail(false);
        }
      }
    };

    // Delay auto-generation to avoid overwhelming on initial load
    const timer = setTimeout(autoGenerateThumbnail, Math.random() * 2000);
    return () => clearTimeout(timer);
  }, [resource.id, resource.pdfUrl, resource.type]);

  return (
    <article
      onClick={onClick}
      className="cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:shadow-lg"
    >
      <div className="flex gap-6 p-6">
        {/* Left: Thumbnail */}
        <div className="w-40 flex-shrink-0">
          <div
            className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-100 shadow-sm"
            style={{ aspectRatio: '1/1.4' }}
          >
            {localThumbnailUrl ? (
              <img
                src={`${config.apiBaseUrl}${localThumbnailUrl}`}
                alt={resource.title}
                className="h-full w-full object-cover"
              />
            ) : isGeneratingThumbnail ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                <svg
                  className="h-8 w-8 animate-spin text-blue-500"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="mt-2 text-xs">Generating...</span>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                {resource.type === 'PAPER' && (
                  <svg
                    className="h-12 w-12"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                )}
                {resource.type === 'PROJECT' && (
                  <svg
                    className="h-12 w-12"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                )}
                {resource.type === 'NEWS' && (
                  <svg
                    className="h-12 w-12"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                    />
                  </svg>
                )}
              </div>
            )}

            {/* Stats Overlay */}
            <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-white/90 px-2 py-1 text-xs shadow-sm backdrop-blur-sm">
              <svg
                className="h-3 w-3 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              <span className="font-medium text-gray-700">
                {resource.upvoteCount || 0}
              </span>
              <svg
                className="h-3 w-3 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Right: Content */}
        <div className="min-w-0 flex-1">
          {/* Date, Source Badge and Tags */}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>
              {new Date(resource.publishedAt).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            {/* Source Badge */}
            {sourceName && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${getSourceBadgeColor(sourceName)}`}
                title={`Source: ${sourceName}`}
              >
                {resource.type === 'YOUTUBE_VIDEO' && (
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                )}
                {resource.type === 'PAPER' && (
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                {resource.type === 'PROJECT' && (
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                )}
                <span className="max-w-[120px] truncate">{sourceName}</span>
              </span>
            )}
            {resource.categories &&
              resource.categories.slice(0, 2).map((cat, i) => (
                <span key={i} className="text-gray-600">
                  {cat}
                </span>
              ))}
          </div>

          {/* Title */}
          <h2 className="mb-3 text-xl font-semibold text-red-600 hover:underline">
            {resource.title}
          </h2>

          {/* Abstract */}
          {(resource.aiSummary || resource.abstract) && (
            <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-gray-700">
              {resource.aiSummary || resource.abstract}
            </p>
          )}

          {/* Bottom Actions */}
          <div className="flex items-center gap-6 border-t border-gray-100 pt-3">
            <button
              onClick={onToggleBookmark}
              className={`flex items-center gap-2 text-sm transition-colors ${
                isBookmarked
                  ? 'font-medium text-blue-600'
                  : 'text-gray-600 hover:text-blue-600'
              }`}
            >
              <svg
                className="h-4 w-4"
                fill={isBookmarked ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
              {isBookmarked ? 'Saved' : 'Save'}
            </button>

            {/* Upvote Button */}
            <button
              onClick={onUpvote}
              className={`flex items-center gap-2 text-sm transition-colors ${
                hasUpvoted
                  ? 'font-medium text-red-600'
                  : 'text-gray-600 hover:text-red-600'
              }`}
              title="点赞"
            >
              <svg
                className={`h-4 w-4 ${hasUpvoted ? 'fill-current' : ''}`}
                fill={hasUpvoted ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 10h4.764a2 2 0 011.789 2.894l-3.646 7.23a2 2 0 01-1.788 1.106H7a2 2 0 01-2-2v-8a2 2 0 012-2h3.764a2 2 0 012 2v4m-4-8l.305.06l2.582-2.468a2 2 0 112.827 2.827L14 10l-4.695-4.695a2 2 0 00-2.827 2.827L9.5 10v6"
                />
              </svg>
              {resource.upvoteCount || 0}
            </button>

            {/* Comment Button */}
            <button
              onClick={onCommentClick}
              className="flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-green-600"
              title="评论"
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
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              {resource.commentCount || 0}
            </button>

            {/* To Image Button */}
            <button
              onClick={handleAddToImage}
              className="flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-purple-600"
              title="Generate Image"
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
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Image
            </button>

            {resource.pdfUrl && (
              <a
                href={resource.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-red-600"
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
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                PDF
              </a>
            )}

            <a
              href={resource.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-red-600"
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
              Source
            </a>

            <button className="flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-red-600">
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
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
              Share
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

// 使用 memo 优化，只有当 props 变化时才重新渲染
const ResourceCard = memo(ResourceCardComponent, (prevProps, nextProps) => {
  // 自定义比较函数：只比较关键属性
  return (
    prevProps.resource.id === nextProps.resource.id &&
    prevProps.isBookmarked === nextProps.isBookmarked &&
    prevProps.hasUpvoted === nextProps.hasUpvoted &&
    prevProps.resource.upvoteCount === nextProps.resource.upvoteCount &&
    prevProps.resource.commentCount === nextProps.resource.commentCount &&
    prevProps.resource.thumbnailUrl === nextProps.resource.thumbnailUrl
  );
});

export default ResourceCard;
