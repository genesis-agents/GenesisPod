'use client';

import React from 'react';
import { ThumbsUp } from 'lucide-react';
import ResourceThumbnail from './ResourceThumbnail';
import { InsightChip } from './InsightBadge';
import {
  getSourceName,
  getSourceBadgeColor,
  convertToAIOfficeResource,
} from './resourceHelpers';
import type { Resource } from './types';
import { useResourceStore } from '@/stores/aiOfficeStore';
import { useImageSourceStore } from '@/stores/imageSourceStore';

interface ResourceCardProps {
  resource: Resource;
  isBookmarked: boolean;
  hasUpvoted: boolean;
  onResourceClick: (resource: Resource) => void;
  onToggleBookmark: (resourceId: string, e: React.MouseEvent) => void;
  onToggleUpvote: (resourceId: string, e: React.MouseEvent) => void;
  onCommentClick: (resource: Resource, e: React.MouseEvent) => void;
  onDeleteResource?: (resourceId: string, e: React.MouseEvent) => void;
  onToast: (message: string, type: 'success' | 'error') => void;
  isAdmin?: boolean;
}

export function ResourceCard({
  resource,
  isBookmarked,
  hasUpvoted,
  onResourceClick,
  onToggleBookmark,
  onToggleUpvote,
  onCommentClick,
  onDeleteResource,
  onToast,
  isAdmin = false,
}: ResourceCardProps) {
  const aiOfficeStore = useResourceStore();
  const addSource = useImageSourceStore((state) => state.addSource);
  const imageSources = useImageSourceStore((state) => state.sources);

  const sourceName = getSourceName(resource);
  const isInAIOffice = aiOfficeStore.resources.some(
    (r) => r._id === resource.id
  );
  const isInImagePool = imageSources.some((s) => s.id === resource.id);

  return (
    <article
      key={resource.id}
      onClick={() => onResourceClick(resource)}
      className="group w-full cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:shadow-lg"
    >
      <div className="flex h-48 w-full overflow-hidden">
        {/* Thumbnail */}
        <div
          className={`relative h-48 flex-shrink-0 overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 ${resource.type === 'PAPER' ? 'w-36' : 'w-64'}`}
        >
          <ResourceThumbnail resource={resource} className="h-full w-full" />
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-5">
          {/* Date, Source Badge, Tags, and Stats */}
          <div className="mb-2 flex flex-shrink-0 flex-wrap items-center gap-2 text-xs text-gray-500">
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
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${getSourceBadgeColor(sourceName, resource.type)}`}
                title={`Source: ${sourceName}`}
              >
                <span className="max-w-[120px] truncate">{sourceName}</span>
              </span>
            )}

            {resource.upvoteCount !== undefined && (
              <span className="flex items-center gap-1 text-gray-600">
                <svg
                  className="h-3 w-3"
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
                {resource.upvoteCount}
              </span>
            )}

            {resource.categories &&
              resource.categories.slice(0, 2).map((cat, i) => (
                <span key={i} className="text-gray-600">
                  {cat}
                </span>
              ))}

            {/* AI Insights Chip */}
            {resource.keyInsights && resource.keyInsights.length > 0 && (
              <InsightChip insights={resource.keyInsights} />
            )}
          </div>

          {/* Title */}
          <h2
            className="mb-2 flex-shrink-0 truncate text-xl font-semibold text-red-600 hover:underline"
            title={resource.title}
          >
            {resource.title}
          </h2>

          {/* Abstract or Fallback Info */}
          <p
            className="line-clamp-2 min-h-0 flex-shrink overflow-hidden text-ellipsis text-sm leading-relaxed text-gray-700"
            title={resource.aiSummary || resource.abstract || ''}
          >
            {resource.aiSummary || resource.abstract || (
              <span className="text-gray-500">
                {resource.sourceUrl && (
                  <>
                    <span className="font-medium">Source:</span>{' '}
                    {new URL(resource.sourceUrl).hostname.replace('www.', '')}
                  </>
                )}
                {resource.authors && resource.authors.length > 0 && (
                  <>
                    {resource.sourceUrl && ' • '}
                    <span className="font-medium">By:</span>{' '}
                    {resource.authors
                      .slice(0, 3)
                      .map((a) => a.name || a.username || 'Unknown')
                      .join(', ')}
                    {resource.authors.length > 3 && ' et al.'}
                  </>
                )}
              </span>
            )}
          </p>

          {/* Spacer */}
          <div className="flex-1"></div>

          {/* Bottom Actions */}
          <div className="flex flex-shrink-0 items-center gap-6 border-t border-gray-100 pt-2">
            {/* Bookmark Button */}
            <button
              onClick={(e) => onToggleBookmark(resource.id, e)}
              className={`flex items-center gap-2 text-sm transition-colors ${
                isBookmarked
                  ? 'text-blue-600 hover:text-blue-700'
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
              {isBookmarked ? 'Bookmarked' : 'Bookmark'}
            </button>

            {/* Upvote Button */}
            {resource.upvoteCount !== undefined && (
              <button
                className={`flex items-center gap-2 text-sm transition-colors ${
                  hasUpvoted
                    ? 'font-medium text-blue-600'
                    : 'text-gray-600 hover:text-blue-600'
                }`}
                onClick={(e) => onToggleUpvote(resource.id, e)}
                title="点赞"
              >
                <ThumbsUp
                  className={`h-4 w-4 ${hasUpvoted ? 'fill-current' : ''}`}
                />
                {resource.upvoteCount}
              </button>
            )}

            {/* Comment Button */}
            {resource.commentCount !== undefined && (
              <button
                className="flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-green-600"
                onClick={(e) => onCommentClick(resource, e)}
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
                {resource.commentCount}
              </button>
            )}

            {/* AI Office Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isInAIOffice) {
                  aiOfficeStore.removeResource(resource.id);
                } else {
                  const aiResource = convertToAIOfficeResource(resource);
                  aiOfficeStore.addResource(aiResource as any);
                }
              }}
              className={`flex items-center gap-2 text-sm transition-colors ${
                isInAIOffice
                  ? 'cursor-pointer text-green-600 hover:text-red-600'
                  : 'text-gray-600 hover:text-blue-600'
              }`}
              title={isInAIOffice ? '点击移除 AI Office' : '添加到 AI Office'}
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              {isInAIOffice ? 'Added' : 'AI Office'}
            </button>

            {/* Image Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isInImagePool) {
                  addSource({
                    id: resource.id,
                    type: resource.type.toLowerCase() as any,
                    title: resource.title,
                    url: resource.sourceUrl || resource.pdfUrl || '',
                    thumbnailUrl: resource.thumbnailUrl,
                    addedAt: new Date(),
                  });
                  onToast(
                    `Added "${resource.title}" to Image Source Pool`,
                    'success'
                  );
                }
              }}
              className={`flex items-center gap-2 text-sm transition-colors ${
                isInImagePool
                  ? 'cursor-default font-medium text-purple-600'
                  : 'text-gray-600 hover:text-purple-600'
              }`}
              title={
                isInImagePool
                  ? 'Already in Image Source Pool'
                  : 'Add to Image Source Pool'
              }
              disabled={isInImagePool}
            >
              <svg
                className="h-4 w-4"
                fill={isInImagePool ? 'currentColor' : 'none'}
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
              {isInImagePool ? 'Added' : 'Image'}
            </button>

            {/* Admin Delete Button */}
            {isAdmin && onDeleteResource && (
              <button
                onClick={(e) => onDeleteResource(resource.id, e)}
                className="flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-red-600"
                title="Delete resource (Admin)"
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
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
