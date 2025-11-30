'use client';

/**
 * AI Image Generator Component
 * - 支持多种输入：提示词、YouTube/视频URL、普通URL、文本内容、文件上传
 * - 使用系统默认文本模型优化提示词
 * - 显示完整的处理过程（可折叠）
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { config } from '@/lib/config';
import { getAuthHeader } from '@/lib/auth';

// 处理步骤类型
interface ProcessingStep {
  step: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  title: string;
  content?: string;
  timestamp?: string;
}

interface GeneratedImage {
  id: string;
  prompt: string;
  enhancedPrompt?: string;
  imageUrl: string;
  createdAt: string;
  width: number;
  height: number;
  isBookmarked?: boolean;
  processingSteps?: ProcessingStep[];
  extractedContent?: string;
  textModelUsed?: string;
  imageModelUsed?: string;
}

interface AIModel {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  icon?: string;
  isDefault: boolean;
}

interface ModelsResponse {
  textModels: AIModel[];
  imageModels: AIModel[];
}

interface UploadedFile {
  file: File;
  id: string;
  preview?: string;
}

type InputMode = 'prompt' | 'youtube' | 'url' | 'files';

export default function ImageGenerator() {
  // 输入状态
  const [inputMode, setInputMode] = useState<InputMode>('prompt');
  const [prompt, setPrompt] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [urls, setUrls] = useState<string[]>(['']);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [filesPrompt, setFilesPrompt] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // 生成状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  // 模型状态 - 只保留图片模型选择
  const [models, setModels] = useState<ModelsResponse>({
    textModels: [],
    imageModels: [],
  });
  const [selectedImageModelId, setSelectedImageModelId] = useState<string>('');
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [skipEnhancement, setSkipEnhancement] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<
    '1:1' | '16:9' | '9:16' | '4:3'
  >(() => {
    // 从 localStorage 读取上次的选择
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ai-image-aspect-ratio');
      if (saved && ['1:1', '16:9', '9:16', '4:3'].includes(saved)) {
        return saved as '1:1' | '16:9' | '9:16' | '4:3';
      }
    }
    return '1:1';
  });

  // 思考过程展示
  const [showProcessing, setShowProcessing] = useState(true);

  // Lightbox 状态
  const [lightboxImage, setLightboxImage] = useState<GeneratedImage | null>(
    null
  );

  // Context Menu 状态
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    image: GeneratedImage;
  } | null>(null);
  const [bookmarkedImages, setBookmarkedImages] = useState<Set<string>>(
    new Set()
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  // 获取可用模型
  const fetchModels = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/ai-image/models`,
        { headers: { ...getAuthHeader() } }
      );

      if (response.ok) {
        const data: ModelsResponse = await response.json();
        setModels(data);

        // 只设置默认图片模型
        const defaultImageModel =
          data.imageModels.find((m) => m.isDefault) || data.imageModels[0];
        if (defaultImageModel) setSelectedImageModelId(defaultImageModel.id);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  // 获取历史记录
  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/ai-image/history`,
        { headers: { ...getAuthHeader() } }
      );

      if (response.ok) {
        const data: GeneratedImage[] = await response.json();
        if (data && data.length > 0) {
          setGeneratedImages(data);
          // 默认选中最新的图片
          setSelectedImage(data[0]);
          // 初始化已收藏的图片
          const bookmarked = new Set<string>();
          data.forEach((img) => {
            if (img.isBookmarked) {
              bookmarked.add(img.id);
            }
          });
          setBookmarkedImages(bookmarked);
        }
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  }, []);

  useEffect(() => {
    fetchModels();
    fetchHistory();
  }, [fetchModels, fetchHistory]);

  // 保存比例选择到 localStorage
  useEffect(() => {
    localStorage.setItem('ai-image-aspect-ratio', aspectRatio);
  }, [aspectRatio]);

  // ESC 键关闭 Lightbox 和 Context Menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (contextMenu) setContextMenu(null);
        else if (lightboxImage) setLightboxImage(null);
      }
    };
    const handleClick = () => {
      if (contextMenu) setContextMenu(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClick);
    };
  }, [lightboxImage, contextMenu]);

  // URL 相关函数
  const addUrlInput = () => setUrls([...urls, '']);
  const removeUrlInput = (index: number) => {
    if (urls.length > 1) setUrls(urls.filter((_, i) => i !== index));
  };
  const updateUrl = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  // 文件处理函数
  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newFiles: UploadedFile[] = [];
    Array.from(files).forEach((file) => {
      const supportedTypes = [
        'text/plain',
        'text/markdown',
        'text/html',
        'application/json',
        'application/pdf',
        'text/vtt',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
      ];
      const supportedExtensions = [
        '.txt',
        '.md',
        '.html',
        '.json',
        '.pdf',
        '.srt',
        '.vtt',
      ];
      const isSupported =
        supportedTypes.includes(file.type) ||
        supportedExtensions.some((ext) =>
          file.name.toLowerCase().endsWith(ext)
        ) ||
        file.type.startsWith('image/');

      if (isSupported && file.size <= 50 * 1024 * 1024) {
        const uploadedFile: UploadedFile = {
          file,
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        };
        if (file.type.startsWith('image/')) {
          uploadedFile.preview = URL.createObjectURL(file);
        }
        newFiles.push(uploadedFile);
      }
    });

    setUploadedFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  // 拖放处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  // 获取文件图标
  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/'))
      return 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z';
    if (file.type === 'application/pdf')
      return 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z';
    return 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';
  };

  // 检查是否有有效输入
  const hasValidInput = () => {
    switch (inputMode) {
      case 'prompt':
        return prompt.trim().length > 0;
      case 'youtube':
        return youtubeUrl.trim().length > 0;
      case 'url':
        return urls.some((u) => u.trim().length > 0);
      case 'files':
        return uploadedFiles.length > 0;
      default:
        return false;
    }
  };

  // 生成图片
  const handleGenerate = async () => {
    if (!hasValidInput() || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    try {
      // 如果是文件上传模式，使用 FormData
      if (inputMode === 'files' && uploadedFiles.length > 0) {
        const formData = new FormData();
        uploadedFiles.forEach((uf) => formData.append('files', uf.file));
        if (selectedImageModelId)
          formData.append('imageModelId', selectedImageModelId);
        formData.append('skipEnhancement', String(skipEnhancement));
        formData.append('aspectRatio', aspectRatio);
        if (filesPrompt.trim()) {
          formData.append('prompt', filesPrompt.trim());
        }

        const response = await fetch(
          `${config.apiBaseUrl}/api/v1/ai-image/generate-with-files`,
          { method: 'POST', headers: { ...getAuthHeader() }, body: formData }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to generate image');
        }

        const data = await response.json();
        const newImage: GeneratedImage = {
          ...data,
          createdAt: new Date().toISOString(),
        };
        setGeneratedImages((prev) => [newImage, ...prev]);
        setSelectedImage(newImage);
        return;
      }

      // 其他模式使用 JSON
      const requestBody: Record<string, unknown> = {
        imageModelId: selectedImageModelId,
        skipEnhancement,
        aspectRatio,
      };

      switch (inputMode) {
        case 'prompt':
          requestBody.prompt = prompt.trim();
          break;
        case 'youtube':
          requestBody.urls = [youtubeUrl.trim()];
          break;
        case 'url':
          requestBody.urls = urls.filter((u) => u.trim());
          break;
      }

      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/ai-image/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to generate image');
      }

      const data = await response.json();
      const newImage: GeneratedImage = {
        ...data,
        createdAt: new Date().toISOString(),
      };
      setGeneratedImages((prev) => [newImage, ...prev]);
      setSelectedImage(newImage);
    } catch (err) {
      console.error('Image generation failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate image');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && inputMode === 'prompt') {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleDownload = async (image: GeneratedImage) => {
    try {
      const response = await fetch(image.imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-image-${image.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  // Context Menu 处理
  const handleContextMenu = (e: React.MouseEvent, image: GeneratedImage) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, image });
  };

  const handleBookmark = async (image: GeneratedImage) => {
    try {
      const isBookmarked = bookmarkedImages.has(image.id);
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/ai-image/${image.id}/bookmark`,
        {
          method: isBookmarked ? 'DELETE' : 'POST',
          headers: { ...getAuthHeader() },
        }
      );

      if (response.ok) {
        setBookmarkedImages((prev) => {
          const newSet = new Set(prev);
          if (isBookmarked) {
            newSet.delete(image.id);
          } else {
            newSet.add(image.id);
          }
          return newSet;
        });
        // 更新图片列表中的状态
        setGeneratedImages((prev) =>
          prev.map((img) =>
            img.id === image.id ? { ...img, isBookmarked: !isBookmarked } : img
          )
        );
      }
    } catch (err) {
      console.error('Bookmark failed:', err);
    }
    setContextMenu(null);
  };

  const handleDelete = async (image: GeneratedImage) => {
    if (!confirm('Are you sure you want to delete this image?')) {
      setContextMenu(null);
      return;
    }

    try {
      const response = await fetch(
        `${config.apiBaseUrl}/api/v1/ai-image/${image.id}`,
        {
          method: 'DELETE',
          headers: { ...getAuthHeader() },
        }
      );

      if (response.ok) {
        // 从列表中移除
        setGeneratedImages((prev) => prev.filter((img) => img.id !== image.id));
        // 如果删除的是当前选中的图片，清除选中状态
        if (selectedImage?.id === image.id) {
          setSelectedImage(null);
        }
        // 从收藏中移除
        setBookmarkedImages((prev) => {
          const newSet = new Set(prev);
          newSet.delete(image.id);
          return newSet;
        });
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
    setContextMenu(null);
  };

  const handleCopyLink = async (image: GeneratedImage) => {
    try {
      await navigator.clipboard.writeText(image.imageUrl);
    } catch (err) {
      console.error('Copy link failed:', err);
    }
    setContextMenu(null);
  };

  const handleCopyImage = async (image: GeneratedImage) => {
    try {
      const response = await fetch(image.imageUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
    } catch (err) {
      console.error('Copy image failed:', err);
    }
    setContextMenu(null);
  };

  const handleOpenInNewTab = (image: GeneratedImage) => {
    window.open(image.imageUrl, '_blank');
    setContextMenu(null);
  };

  // Handle wheel scroll in gallery to navigate between images
  const handleGalleryWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (generatedImages.length <= 1) return;

      // Prevent default vertical scroll, scroll horizontally
      if (galleryRef.current) {
        galleryRef.current.scrollLeft += e.deltaY;
      }

      // Also change selected image on scroll
      const currentIndex = generatedImages.findIndex(
        (img) => img.id === selectedImage?.id
      );
      if (currentIndex === -1) return;

      // Scroll down (positive deltaY) = next image, scroll up = previous image
      const direction = e.deltaY > 0 ? 1 : -1;
      const newIndex = Math.max(
        0,
        Math.min(generatedImages.length - 1, currentIndex + direction)
      );

      if (newIndex !== currentIndex) {
        setSelectedImage(generatedImages[newIndex]);
      }
    },
    [generatedImages, selectedImage]
  );

  // 渲染处理步骤
  const renderProcessingSteps = (steps: ProcessingStep[]) => (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div key={index} className="flex items-start gap-2 text-xs">
          <div
            className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
              step.status === 'completed'
                ? 'text-green-500'
                : step.status === 'processing'
                  ? 'animate-pulse text-blue-500'
                  : step.status === 'error'
                    ? 'text-red-500'
                    : 'text-gray-400'
            }`}
          >
            {step.status === 'completed' && (
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            {step.status === 'processing' && (
              <svg
                className="animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {step.status === 'error' && (
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
            {step.status === 'pending' && (
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  strokeWidth="2"
                  className="opacity-30"
                />
              </svg>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-300">{step.title}</p>
            {step.content && (
              <p className="mt-0.5 line-clamp-2 break-all text-gray-500">
                {step.content}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-[#1a1a2e]">
      {/* Top Bar - Only Image Model Selector */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Image Model:</span>
          {isLoadingModels ? (
            <div className="h-7 w-36 animate-pulse rounded bg-white/10" />
          ) : models.imageModels.length > 0 ? (
            <select
              value={selectedImageModelId}
              onChange={(e) => setSelectedImageModelId(e.target.value)}
              className="rounded bg-white/10 px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50"
              disabled={isGenerating}
            >
              {models.imageModels.map((model) => (
                <option
                  key={model.id}
                  value={model.id}
                  className="bg-[#1a1a2e]"
                >
                  {model.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-yellow-400">No image models</span>
          )}
        </div>

        {/* Aspect Ratio Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Ratio:</span>
          <div className="flex gap-1">
            {(['1:1', '16:9', '9:16', '4:3'] as const).map((ratio) => (
              <button
                key={ratio}
                onClick={() => setAspectRatio(ratio)}
                disabled={isGenerating}
                className={`rounded px-2 py-1 text-xs transition ${
                  aspectRatio === ratio
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white'
                } disabled:opacity-50`}
                title={
                  ratio === '1:1'
                    ? '正方形'
                    : ratio === '16:9'
                      ? '横向'
                      : ratio === '9:16'
                        ? '竖向'
                        : '4:3'
                }
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={skipEnhancement}
            onChange={(e) => setSkipEnhancement(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-600 bg-transparent text-purple-500 focus:ring-purple-500/50"
            disabled={isGenerating}
          />
          <span className="text-xs text-gray-400">
            Skip AI prompt enhancement
          </span>
        </label>

        <button
          onClick={fetchModels}
          disabled={isLoadingModels}
          className="ml-auto rounded p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
          title="Refresh models"
        >
          <svg
            className={`h-4 w-4 ${isLoadingModels ? 'animate-spin' : ''}`}
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
      </div>

      {/* Main Image Display Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Image Display */}
        <div className="flex flex-1 items-center justify-center overflow-auto p-6">
          {selectedImage ? (
            <div className="relative max-h-full max-w-full">
              <img
                src={selectedImage.imageUrl}
                alt={selectedImage.prompt}
                className="max-h-[75vh] cursor-pointer rounded-2xl object-contain shadow-2xl transition hover:opacity-90"
                onClick={() => setLightboxImage(selectedImage)}
                onContextMenu={(e) => handleContextMenu(e, selectedImage)}
                title="点击放大查看 | 右键打开菜单"
              />
              <div className="absolute bottom-4 right-4 flex gap-2">
                <button
                  onClick={() => setLightboxImage(selectedImage)}
                  className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-md transition hover:bg-white/20"
                  title="全屏查看"
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
                      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                    />
                  </svg>
                  Expand
                </button>
                <button
                  onClick={() => handleDownload(selectedImage)}
                  className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-md transition hover:bg-white/20"
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
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download
                </button>
              </div>
            </div>
          ) : isGenerating ? (
            <div className="flex flex-col items-center gap-6">
              <div className="relative h-24 w-24">
                <div className="absolute inset-0 animate-spin rounded-full border-4 border-purple-500/30 border-t-purple-500" />
                <div
                  className="absolute inset-3 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-500"
                  style={{
                    animationDirection: 'reverse',
                    animationDuration: '1.5s',
                  }}
                />
              </div>
              <p className="text-lg text-gray-400">Creating your image...</p>
            </div>
          ) : (
            <div className="flex max-w-xl flex-col items-center gap-6 text-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                <svg
                  className="h-12 w-12 text-purple-400"
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
              </div>
              <div>
                <h2 className="mb-2 text-2xl font-semibold text-white">
                  Create with AI
                </h2>
                <p className="text-gray-400">
                  Describe, paste URLs, upload files, or add YouTube videos
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Processing Steps Panel (Right Side) */}
        {selectedImage?.processingSteps &&
          selectedImage.processingSteps.length > 0 && (
            <div
              className={`flex flex-col border-l border-white/10 bg-[#12121f] transition-all duration-300 ${showProcessing ? 'w-80' : 'w-10'}`}
            >
              <button
                onClick={() => setShowProcessing(!showProcessing)}
                className="flex w-full flex-shrink-0 items-center justify-between border-b border-white/10 px-3 py-2 text-xs text-gray-400 hover:text-white"
              >
                {showProcessing && <span>Processing Details</span>}
                <svg
                  className={`h-4 w-4 transition-transform ${showProcessing ? '' : 'rotate-180'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
              {showProcessing && (
                <div className="scrollbar-dark flex-1 overflow-y-auto p-4">
                  {/* Models Used */}
                  {(selectedImage.textModelUsed ||
                    selectedImage.imageModelUsed) && (
                    <div className="mb-4 space-y-1 border-b border-white/10 pb-3">
                      {selectedImage.textModelUsed && (
                        <p className="text-xs text-gray-500">
                          <span className="text-gray-400">Text Model:</span>{' '}
                          {selectedImage.textModelUsed}
                        </p>
                      )}
                      {selectedImage.imageModelUsed && (
                        <p className="text-xs text-gray-500">
                          <span className="text-gray-400">Image Model:</span>{' '}
                          {selectedImage.imageModelUsed}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Steps */}
                  {renderProcessingSteps(selectedImage.processingSteps)}

                  {/* Enhanced Prompt */}
                  {selectedImage.enhancedPrompt && (
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <p className="mb-2 text-xs font-medium text-gray-400">
                        Final Image Prompt:
                      </p>
                      <p className="text-xs leading-relaxed text-gray-300">
                        {selectedImage.enhancedPrompt}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
      </div>

      {/* Generated Images Gallery - Compact */}
      {generatedImages.length > 0 && (
        <div className="flex-shrink-0 border-t border-white/10 px-4 py-2">
          <div
            ref={galleryRef}
            onWheel={handleGalleryWheel}
            className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/20 hover:scrollbar-thumb-white/40 flex gap-2 overflow-x-auto"
          >
            {generatedImages.map((img) => (
              <button
                key={img.id}
                onClick={() => setSelectedImage(img)}
                onContextMenu={(e) => handleContextMenu(e, img)}
                className={`relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg transition ${
                  selectedImage?.id === img.id
                    ? 'ring-2 ring-purple-500 ring-offset-1 ring-offset-[#1a1a2e]'
                    : 'opacity-60 hover:opacity-100'
                }`}
              >
                {bookmarkedImages.has(img.id) && (
                  <div className="absolute right-0.5 top-0.5 z-10">
                    <svg
                      className="h-3 w-3 text-yellow-400"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </div>
                )}
                <img
                  src={img.imageUrl}
                  alt={img.prompt}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Mode Tabs */}
      <div className="flex-shrink-0 border-t border-white/10 px-4 pt-2">
        <div className="flex gap-1">
          {[
            {
              mode: 'prompt' as InputMode,
              label: 'Prompt',
              icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
            },
            {
              mode: 'youtube' as InputMode,
              label: 'YouTube',
              icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
            },
            {
              mode: 'url' as InputMode,
              label: 'URLs',
              icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
            },
            {
              mode: 'files' as InputMode,
              label: 'Files',
              icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12',
            },
          ].map(({ mode, label, icon }) => (
            <button
              key={mode}
              onClick={() => setInputMode(mode)}
              className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-medium transition ${
                inputMode === mode
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={icon}
                />
              </svg>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-white/10 p-4">
        <div className="mx-auto max-w-3xl">
          {error && (
            <div className="mb-3 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Prompt Input */}
          {inputMode === 'prompt' && (
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2 ring-1 ring-white/10 focus-within:ring-purple-500/50">
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what you want to create..."
                className="flex-1 bg-transparent px-3 py-2 text-white placeholder-gray-500 focus:outline-none"
                disabled={isGenerating}
              />
              <button
                onClick={handleGenerate}
                disabled={
                  !hasValidInput() ||
                  isGenerating ||
                  models.imageModels.length === 0
                }
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-white transition hover:from-purple-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
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
                      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                    />
                  </svg>
                )}
              </button>
            </div>
          )}

          {/* YouTube Input */}
          {inputMode === 'youtube' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10 focus-within:ring-red-500/50">
                <svg
                  className="h-5 w-5 text-red-500"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="Paste YouTube video URL..."
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
                  disabled={isGenerating}
                />
              </div>
              <p className="text-xs text-gray-500">
                The system will extract video subtitles and generate an image
                based on the content
              </p>
              <div className="flex justify-end">
                <button
                  onClick={handleGenerate}
                  disabled={
                    !hasValidInput() ||
                    isGenerating ||
                    models.imageModels.length === 0
                  }
                  className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-red-600 to-pink-600 px-4 py-2 text-sm text-white transition hover:from-red-700 hover:to-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGenerating ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
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
                        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                      />
                    </svg>
                  )}
                  Generate from Video
                </button>
              </div>
            </div>
          )}

          {/* URL Input */}
          {inputMode === 'url' && (
            <div className="space-y-2">
              {urls.map((url, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="flex flex-1 items-center rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10 focus-within:ring-purple-500/50">
                    <svg
                      className="mr-2 h-4 w-4 flex-shrink-0 text-gray-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                      />
                    </svg>
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => updateUrl(index, e.target.value)}
                      placeholder="https://example.com/article  输入描述来指导AI生成..."
                      className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
                      disabled={isGenerating}
                    />
                  </div>
                  {urls.length > 1 && (
                    <button
                      onClick={() => removeUrlInput(index)}
                      className="rounded-lg p-2 text-gray-500 transition hover:bg-white/10 hover:text-white"
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
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              <p className="text-xs text-gray-500">
                支持在URL后添加描述来指导AI生成，例如：https://example.com/article
                请生成信息图
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={addUrlInput}
                  className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-gray-400 transition hover:bg-white/10 hover:text-white"
                >
                  <svg
                    className="h-3.5 w-3.5"
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
                  Add URL
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleGenerate}
                  disabled={
                    !hasValidInput() ||
                    isGenerating ||
                    models.imageModels.length === 0
                  }
                  className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2 text-sm text-white transition hover:from-purple-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGenerating ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
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
                        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                      />
                    </svg>
                  )}
                  Generate
                </button>
              </div>
            </div>
          )}

          {/* Files Input */}
          {inputMode === 'files' && (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt,.md,.html,.json,.pdf,.srt,.vtt,image/*"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition ${
                  isDragging
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-white/20 bg-white/5 hover:border-purple-500/50 hover:bg-white/10'
                }`}
              >
                <svg
                  className={`mb-2 h-8 w-8 ${isDragging ? 'text-purple-400' : 'text-gray-500'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-sm text-gray-400">
                  {isDragging
                    ? 'Drop files here'
                    : 'Click or drag files to upload'}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  PDF, TXT, MD, HTML, JSON, SRT, VTT, Images (max 50MB)
                </p>
              </div>

              {/* Prompt input for files */}
              <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10 focus-within:ring-purple-500/50">
                <svg
                  className="h-4 w-4 flex-shrink-0 text-gray-500"
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
                <input
                  type="text"
                  value={filesPrompt}
                  onChange={(e) => setFilesPrompt(e.target.value)}
                  placeholder="Describe what image to generate from these files..."
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
                  disabled={isGenerating}
                />
              </div>

              {uploadedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {uploadedFiles.map((uf) => (
                    <div
                      key={uf.id}
                      className="group flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2"
                    >
                      {uf.preview ? (
                        <img
                          src={uf.preview}
                          alt={uf.file.name}
                          className="h-8 w-8 rounded object-cover"
                        />
                      ) : (
                        <svg
                          className="h-5 w-5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d={getFileIcon(uf.file)}
                          />
                        </svg>
                      )}
                      <span className="max-w-[150px] truncate text-xs text-gray-300">
                        {uf.file.name}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(uf.id);
                        }}
                        className="ml-1 rounded p-0.5 text-gray-500 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleGenerate}
                  disabled={
                    !hasValidInput() ||
                    isGenerating ||
                    models.imageModels.length === 0
                  }
                  className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2 text-sm text-white transition hover:from-purple-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGenerating ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
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
                        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                      />
                    </svg>
                  )}
                  Generate from Files
                </button>
              </div>
            </div>
          )}

          <p className="mt-1 pb-1 text-center text-xs text-gray-500">
            {inputMode === 'prompt' &&
              'Enter to generate • AI enhances prompts'}
            {inputMode === 'youtube' && 'Extract subtitles to generate images'}
            {inputMode === 'url' && 'Add URLs to generate images'}
            {inputMode === 'files' && 'Upload files for AI analysis'}
          </p>
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setLightboxImage(null)}
        >
          {/* Close button */}
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
            title="关闭 (ESC)"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Download button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDownload(lightboxImage);
            }}
            className="absolute right-20 top-4 z-10 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
            title="下载图片"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </button>

          {/* Image container */}
          <div
            className="relative max-h-[95vh] max-w-[95vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage.imageUrl}
              alt={lightboxImage.prompt}
              className="max-h-[95vh] max-w-[95vw] rounded-lg object-contain shadow-2xl"
              onContextMenu={(e) => handleContextMenu(e, lightboxImage)}
            />

            {/* Image info at bottom */}
            <div className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-gradient-to-t from-black/80 to-transparent p-4">
              {lightboxImage.enhancedPrompt && (
                <p className="line-clamp-2 text-sm text-gray-300">
                  {lightboxImage.enhancedPrompt}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                {lightboxImage.width} × {lightboxImage.height} •{' '}
                {new Date(lightboxImage.createdAt).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Navigation hint */}
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-gray-500">
            点击图片外区域或按 ESC 关闭
          </p>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[60] min-w-[180px] overflow-hidden rounded-lg border border-white/10 bg-[#1a1a2e] py-1 shadow-xl"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 200),
            top: Math.min(contextMenu.y, window.innerHeight - 280),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Bookmark */}
          <button
            onClick={() => handleBookmark(contextMenu.image)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-300 transition hover:bg-white/10"
          >
            <svg
              className={`h-4 w-4 ${bookmarkedImages.has(contextMenu.image.id) ? 'text-yellow-400' : 'text-gray-400'}`}
              fill={
                bookmarkedImages.has(contextMenu.image.id)
                  ? 'currentColor'
                  : 'none'
              }
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
            {bookmarkedImages.has(contextMenu.image.id)
              ? 'Remove Bookmark'
              : 'Add Bookmark'}
          </button>

          <div className="my-1 border-t border-white/10" />

          {/* Download */}
          <button
            onClick={() => {
              handleDownload(contextMenu.image);
              setContextMenu(null);
            }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-300 transition hover:bg-white/10"
          >
            <svg
              className="h-4 w-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download
          </button>

          {/* Copy Image */}
          <button
            onClick={() => handleCopyImage(contextMenu.image)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-300 transition hover:bg-white/10"
          >
            <svg
              className="h-4 w-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
              />
            </svg>
            Copy Image
          </button>

          {/* Copy Link */}
          <button
            onClick={() => handleCopyLink(contextMenu.image)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-300 transition hover:bg-white/10"
          >
            <svg
              className="h-4 w-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            Copy Link
          </button>

          <div className="my-1 border-t border-white/10" />

          {/* Open in New Tab */}
          <button
            onClick={() => handleOpenInNewTab(contextMenu.image)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-300 transition hover:bg-white/10"
          >
            <svg
              className="h-4 w-4 text-gray-400"
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
            Open in New Tab
          </button>

          {/* View in Lightbox (if not already in lightbox) */}
          {!lightboxImage && (
            <button
              onClick={() => {
                setLightboxImage(contextMenu.image);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-300 transition hover:bg-white/10"
            >
              <svg
                className="h-4 w-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
              View Fullscreen
            </button>
          )}

          <div className="my-1 border-t border-white/10" />

          {/* Delete */}
          <button
            onClick={() => handleDelete(contextMenu.image)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-400 transition hover:bg-red-500/10"
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
        </div>
      )}
    </div>
  );
}
