'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

// AI Image Team - Preview (3 core agents)
const AI_TEAM_PREVIEW = [
  {
    id: 'analyst',
    icon: '🎨',
    name: '风格分析师',
    color: 'from-pink-500 to-rose-600',
  },
  {
    id: 'prompt',
    icon: '✍️',
    name: '提示词专家',
    color: 'from-purple-500 to-violet-600',
  },
  {
    id: 'generator',
    icon: '🖼️',
    name: '图像生成',
    color: 'from-blue-500 to-cyan-600',
  },
];

// Vibrant gradient color schemes for image cards
const IMAGE_GRADIENTS = [
  {
    from: 'from-pink-500',
    to: 'to-rose-600',
    shadow: 'shadow-pink-500/30',
  },
  {
    from: 'from-violet-500',
    to: 'to-purple-600',
    shadow: 'shadow-violet-500/30',
  },
  { from: 'from-blue-500', to: 'to-cyan-500', shadow: 'shadow-blue-500/30' },
  {
    from: 'from-emerald-500',
    to: 'to-teal-500',
    shadow: 'shadow-emerald-500/30',
  },
  {
    from: 'from-amber-500',
    to: 'to-orange-600',
    shadow: 'shadow-amber-500/30',
  },
  {
    from: 'from-indigo-500',
    to: 'to-blue-600',
    shadow: 'shadow-indigo-500/30',
  },
];

interface GeneratedImage {
  id: string;
  prompt: string;
  enhancedPrompt?: string;
  imageUrl: string;
  createdAt: string;
  width: number;
  height: number;
  isBookmarked?: boolean;
}

function getImageGradient(imageId: string) {
  let hash = 0;
  for (let i = 0; i < imageId.length; i++) {
    hash = (hash << 5) - hash + imageId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % IMAGE_GRADIENTS.length;
  return IMAGE_GRADIENTS[index];
}

export default function AIImagePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch image history
  const fetchHistory = useCallback(async () => {
    if (!user) return;

    setIsLoadingImages(true);
    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/ai-image/history`,
        {
          headers: { ...getAuthHeader() },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setImages(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setIsLoadingImages(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      void fetchHistory();
    }
  }, [user, fetchHistory]);

  const handleDelete = async (e: React.MouseEvent, imageId: string) => {
    e.stopPropagation();
    if (!confirm('确定要删除这张图片吗？')) return;

    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/ai-image/${imageId}`,
        {
          method: 'DELETE',
          headers: { ...getAuthHeader() },
        }
      );
      if (response.ok) {
        setImages((prev) => prev.filter((img) => img.id !== imageId));
      }
    } catch (err) {
      console.error('Failed to delete image:', err);
    }
  };

  const handleToggleBookmark = async (
    e: React.MouseEvent,
    image: GeneratedImage
  ) => {
    e.stopPropagation();

    try {
      const method = image.isBookmarked ? 'DELETE' : 'POST';
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/ai-image/${image.id}/bookmark`,
        {
          method,
          headers: { ...getAuthHeader() },
        }
      );
      if (response.ok) {
        setImages((prev) =>
          prev.map((img) =>
            img.id === image.id
              ? { ...img, isBookmarked: !img.isBookmarked }
              : img
          )
        );
      }
    } catch (err) {
      console.error('Failed to toggle bookmark:', err);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString();
  };

  // Filter images by search query
  const filteredImages = images.filter((image) => {
    if (!searchQuery) return true;
    return (
      image.prompt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      image.enhancedPrompt?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  if (authLoading) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-pink-500 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <svg
            className="h-16 w-16 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-gray-700">请先登录</h2>
          <p className="text-gray-500">登录后即可使用 AI 绘图</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="flex-1 overflow-auto">
        {/* Header - Sticky */}
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 shadow-lg shadow-pink-500/25">
                  <svg
                    className="h-7 w-7 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">AI 绘图</h1>
                  <p className="text-sm text-gray-500">
                    3 位 AI 专家协作，帮你生成精美图像
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push('/ai-image/create')}
                className="flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-pink-700"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                开始创作
              </button>
            </div>

            {/* Search Bar */}
            <div className="mt-4">
              <div className="relative">
                <svg
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="搜索图片..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          {isLoadingImages ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-pink-500 border-t-transparent" />
            </div>
          ) : filteredImages.length === 0 && !searchQuery ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-12">
              <svg
                className="h-16 w-16 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-700">
                还没有图片
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                描述你的想法，AI 团队将协作生成图像
              </p>

              {/* AI Team Preview */}
              <div className="mt-6 rounded-xl bg-pink-50 p-4">
                <p className="mb-3 text-center text-xs font-medium text-pink-700">
                  AI 绘图团队
                </p>
                <div className="flex items-center justify-center gap-4">
                  {AI_TEAM_PREVIEW.map((agent) => (
                    <div key={agent.id} className="flex flex-col items-center">
                      <span
                        className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${agent.color} text-xl shadow-sm`}
                      >
                        {agent.icon}
                      </span>
                      <span className="mt-1.5 text-xs text-gray-500">
                        {agent.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => router.push('/ai-image/create')}
                className="mt-6 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-700"
              >
                开始创作
              </button>
            </div>
          ) : filteredImages.length === 0 && searchQuery ? (
            /* No Search Results */
            <div className="flex flex-col items-center justify-center py-12">
              <svg
                className="h-16 w-16 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-700">
                没有找到匹配的图片
              </h3>
              <p className="mt-2 text-sm text-gray-500">尝试其他关键词搜索</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredImages.map((image) => {
                const gradient = getImageGradient(image.id);

                return (
                  <div
                    key={image.id}
                    onClick={() =>
                      router.push(`/ai-image/create?id=${image.id}`)
                    }
                    className="group relative cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-pink-300 hover:shadow-md"
                  >
                    {/* Image */}
                    <div className="aspect-square overflow-hidden bg-gray-100">
                      <img
                        src={image.imageUrl}
                        alt={image.prompt}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>

                    {/* Overlay with actions */}
                    <div className="absolute inset-0 flex items-start justify-end gap-1 bg-gradient-to-b from-black/40 via-transparent to-black/40 p-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) => handleToggleBookmark(e, image)}
                        className={`rounded-lg p-1.5 shadow-sm transition-colors ${
                          image.isBookmarked
                            ? 'bg-pink-500 text-white'
                            : 'bg-white/90 text-gray-600 hover:bg-white hover:text-pink-600'
                        }`}
                        title={image.isBookmarked ? '取消收藏' : '收藏'}
                      >
                        <svg
                          className="h-4 w-4"
                          fill={image.isBookmarked ? 'currentColor' : 'none'}
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, image.id)}
                        className="rounded-lg bg-white/90 p-1.5 text-gray-600 shadow-sm hover:bg-white hover:text-red-600"
                        title="删除"
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
                      </button>
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <p className="line-clamp-2 text-xs text-gray-600">
                        {image.prompt}
                      </p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">
                          {image.width} × {image.height}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {formatTime(image.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Create New Card */}
              <button
                onClick={() => router.push('/ai-image/create')}
                className="flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white transition-colors hover:border-pink-400 hover:bg-pink-50"
              >
                <svg
                  className="h-10 w-10 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span className="mt-2 text-sm font-medium text-gray-600">
                  创作新图
                </span>
              </button>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  );
}
