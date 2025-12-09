'use client';

/**
 * AI Slides 页面
 * Genspark 风格的 PPT 生成器
 * 采用左右分栏布局：左侧资源+AI对话，右侧PPT预览
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Download,
  RefreshCw,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Edit3,
  Check,
  Sparkles,
  Send,
  StopCircle,
  Paperclip,
  Plus,
  X,
  Loader2,
  Eye,
} from 'lucide-react';
import Link from 'next/link';

import { useResourceStore, useDocumentStore } from '@/stores/aiOfficeStore';
import { cn } from '@/lib/utils';
import { parseMarkdownToEnhancedSlides } from '@/lib/markdown-parser';
import EnhancedSlideRenderer from '@/components/ai-office/document/EnhancedSlideRenderer';
import { getTemplateById, PPTTemplate } from '@/lib/ppt-templates';

// ============================================
// 资源列表组件（复用自现有组件）
// ============================================
interface Resource {
  _id: string;
  resourceType: string;
  metadata?: {
    title?: string;
  };
  status: string;
}

function ResourceCard({ resource }: { resource: Resource }) {
  const { removeResource, selectResource, deselectResource } =
    useResourceStore();
  const selectedIds = useResourceStore((state) => state.selectedResourceIds);
  const isSelected = selectedIds.includes(resource._id);

  const getTitle = () => {
    return resource.metadata?.title || '无标题';
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2 transition-all',
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      )}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) =>
          e.target.checked
            ? selectResource(resource._id)
            : deselectResource(resource._id)
        }
        className="h-4 w-4 flex-shrink-0 cursor-pointer rounded border-gray-300 text-blue-600"
      />
      <div className="min-w-0 flex-1">
        <h4
          className="truncate text-sm font-medium text-gray-900"
          title={getTitle()}
        >
          {getTitle()}
        </h4>
      </div>
      <span
        className={cn(
          'h-2 w-2 flex-shrink-0 rounded-full',
          resource.status === 'collected'
            ? 'bg-green-500'
            : resource.status === 'collecting'
              ? 'animate-pulse bg-yellow-500'
              : 'bg-gray-400'
        )}
      />
      <button
        onClick={() => removeResource(resource._id)}
        className="flex-shrink-0 rounded p-1 hover:bg-gray-200"
      >
        <X className="h-4 w-4 text-gray-500" />
      </button>
    </div>
  );
}

// ============================================
// 主题选项
// ============================================
const THEME_OPTIONS = [
  { id: 'professional', name: '专业商务', color: '#1e3a5f' },
  { id: 'modern', name: '现代科技', color: '#6366f1' },
  { id: 'minimal', name: '极简风格', color: '#18181b' },
  { id: 'creative', name: '创意活力', color: '#ec4899' },
  { id: 'genspark', name: '深蓝专业', color: '#0A2B4E' },
];

// ============================================
// 主组件
// ============================================
export default function SlidesPage() {
  // 资源状态
  const resources = useResourceStore((state) => state.resources);
  const selectedResourceIds = useResourceStore(
    (state) => state.selectedResourceIds
  );
  const { selectResource, clearSelection } = useResourceStore();

  // 文档状态
  const { documents, addDocument, setCurrentDocument, updateDocument } =
    useDocumentStore();
  const currentDocumentId = useDocumentStore(
    (state: any) => state.currentDocumentId
  );
  const currentDocument = documents.find(
    (d: any) => d._id === currentDocumentId
  );

  // UI 状态
  const [resourceListCollapsed, setResourceListCollapsed] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(450);
  const [isDragging, setIsDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState('professional');

  // PPT 预览状态
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [thumbnailsCollapsed, setThumbnailsCollapsed] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingContent, setEditingContent] = useState('');

  // 聊天状态
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState<
    Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      timestamp: Date;
    }>
  >([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 获取当前文档内容
  const content = currentDocument
    ? (currentDocument.content as any)?.markdown || ''
    : '';
  const slides = parseMarkdownToEnhancedSlides(content);
  const template: PPTTemplate = currentDocument?.template?.id
    ? getTemplateById(currentDocument.template.id)
    : getTemplateById('corporate');

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // 拖拽调整左侧面板宽度
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      const constrainedWidth = Math.max(350, Math.min(600, newWidth));
      setLeftPanelWidth(constrainedWidth);
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // 发送消息并生成PPT
  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userInput = input;
    setInput('');

    // 添加用户消息
    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: userInput,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // 检测是否是PPT生成请求
    const isPPTRequest = /ppt|powerpoint|演示文稿|幻灯片|页/i.test(userInput);

    // 创建或更新文档
    let targetDocumentId = currentDocumentId;
    if (!currentDocument || !isPPTRequest) {
      // 创建新文档
      const newDocumentId = `doc-${Date.now()}`;
      const newDocument = {
        _id: newDocumentId,
        userId: 'current-user',
        type: 'ppt',
        title: '未命名演示文稿',
        status: 'generating' as const,
        resources: [],
        template: { id: selectedTheme, version: '1.0' },
        aiConfig: {
          model: 'grok',
          language: 'zh-CN',
          detailLevel: 3,
          professionalLevel: 3,
        },
        generationHistory: [
          { timestamp: new Date(), action: 'create' as const, aiModel: 'grok' },
        ],
        versions: [],
        content: { markdown: '' },
        metadata: { wordCount: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      addDocument(newDocument as any);
      setCurrentDocument(newDocumentId);
      targetDocumentId = newDocumentId;
    }

    setIsStreaming(true);

    try {
      // 获取选中的资源
      const selectedResources = resources.filter((r) =>
        selectedResourceIds.includes(r._id)
      );

      // 构建增强的prompt
      let enhancedPrompt = `${userInput}

【重要格式要求】请严格按照以下Markdown格式输出PPT内容：

### Slide 1: [封面标题]
- 副标题或核心观点

---

### Slide 2: [内容页标题]
- 要点1
- 要点2
- 要点3

---

【内容要求】
1. 每页幻灯片必须以 "### Slide X: " 开头
2. 使用 "---" 分隔不同幻灯片
3. 内容使用列表形式（- 开头）
4. 支持可视化标记：<!-- FLOW -->, <!-- CHART:line/pie/bar -->, <!-- MATRIX -->

请直接输出PPT内容，不要添加说明文字。`;

      // 调用API
      const response = await fetch('/api/ai-office/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: enhancedPrompt,
          resources: selectedResources,
          documentId: targetDocumentId,
          stream: true,
          isDocumentGeneration: true,
        }),
      });

      if (!response.ok) throw new Error('AI service request failed');

      // 创建AI消息
      const aiMessageId = (Date.now() + 1).toString();
      const aiMessage = {
        id: aiMessageId,
        role: 'assistant' as const,
        content: '',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);

      // 处理流式响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let aiContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  aiContent += parsed.content;

                  // 更新聊天消息
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === aiMessageId
                        ? {
                            ...msg,
                            content: `✅ 正在生成PPT...\n\n已生成 ${aiContent.split('---').length} 页`,
                          }
                        : msg
                    )
                  );

                  // 实时更新文档内容
                  updateDocument(targetDocumentId!, {
                    content: { markdown: aiContent },
                    metadata: { wordCount: aiContent.length },
                    updatedAt: new Date(),
                  } as any);
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
      }

      // 完成消息
      const slideCount = aiContent.split('---').filter((s) => s.trim()).length;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessageId
            ? {
                ...msg,
                content: `✅ PPT生成完成！共 ${slideCount} 页幻灯片。\n\n您可以在右侧预览和编辑。`,
              }
            : msg
        )
      );

      // 更新文档状态
      updateDocument(targetDocumentId!, {
        status: 'completed',
        updatedAt: new Date(),
      } as any);
    } catch (error) {
      console.error('AI chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          role: 'assistant',
          content: '抱歉，AI服务暂时不可用，请稍后再试。',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  // 全选/取消全选资源
  const handleToggleSelectAll = () => {
    if (
      selectedResourceIds.length === resources.length &&
      resources.length > 0
    ) {
      clearSelection();
    } else {
      resources.forEach((resource) => selectResource(resource._id));
    }
  };

  return (
    <div ref={containerRef} className="flex h-screen bg-gray-50">
      {/* 左侧面板：资源 + AI对话 */}
      <div
        className="relative flex flex-shrink-0 flex-col border-r border-gray-200 bg-white"
        style={{ width: `${leftPanelWidth}px` }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/ai-office"
              className="rounded-lg p-2 hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="font-semibold">AI 幻灯片</h1>
              <p className="text-xs text-gray-500">智能PPT生成器</p>
            </div>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              'rounded-lg p-2 transition-colors',
              showSettings ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'
            )}
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>

        {/* 设置面板 */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-b border-gray-200"
            >
              <div className="bg-gray-50 p-4">
                <h3 className="mb-3 text-sm font-medium">主题风格</h3>
                <div className="flex flex-wrap gap-2">
                  {THEME_OPTIONS.map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => setSelectedTheme(theme.id)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all',
                        selectedTheme === theme.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <span
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: theme.color }}
                      />
                      <span>{theme.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 资源列表区域 */}
        <div
          className={cn(
            'border-b border-gray-200 transition-all duration-300',
            resourceListCollapsed ? 'h-12' : 'h-2/5'
          )}
        >
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-semibold text-gray-700">已选资源</h3>
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-500">
                {resources.length}
              </span>
            </div>
            <button
              onClick={() => setResourceListCollapsed(!resourceListCollapsed)}
              className="rounded p-1 hover:bg-gray-200"
            >
              {resourceListCollapsed ? (
                <ChevronDown className="h-4 w-4 text-gray-600" />
              ) : (
                <ChevronUp className="h-4 w-4 text-gray-600" />
              )}
            </button>
          </div>

          {!resourceListCollapsed && (
            <div className="flex h-full flex-col overflow-hidden">
              {resources.length > 0 && (
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={
                        selectedResourceIds.length === resources.length &&
                        resources.length > 0
                      }
                      onChange={handleToggleSelectAll}
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-xs text-gray-600">
                      已选 {selectedResourceIds.length}/{resources.length}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {resources.length === 0 ? (
                  <div className="py-8 text-center">
                    <Plus className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mb-2 text-sm text-gray-600">还没有添加资源</p>
                    <p className="text-xs text-gray-500">
                      在 Explore 页面点击"AI Office"添加资源
                    </p>
                  </div>
                ) : (
                  resources.map((resource) => (
                    <ResourceCard
                      key={resource._id}
                      resource={resource as Resource}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* AI 对话区域 */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* 对话头部 */}
          <div className="flex items-center space-x-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 shadow-sm">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-base font-semibold text-gray-800">
              AI 智能助手
            </h3>
          </div>

          {/* 对话历史 */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-gray-400">
                <div className="text-center">
                  <Sparkles className="mx-auto mb-3 h-12 w-12" />
                  <p className="text-sm">开始与AI对话</p>
                  <p className="mt-1 text-xs">描述你想要的PPT，AI会帮你生成</p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'flex',
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-lg px-4 py-2',
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      )}
                    >
                      <p className="whitespace-pre-wrap text-sm">
                        {message.content}
                      </p>
                    </div>
                  </div>
                ))}
                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="flex items-center space-x-2 rounded-lg bg-gray-100 px-4 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      <span className="text-sm text-gray-600">
                        AI正在生成...
                      </span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* 输入框 */}
          <div className="border-t border-gray-200 bg-white p-4">
            <div className="relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="描述你想要的PPT，例如：为我的创业项目创建一份10页的商业计划书..."
                className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 pb-12 pr-28 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                rows={3}
                disabled={isStreaming}
              />
              <div className="absolute bottom-3 right-3 flex items-center space-x-2">
                <button
                  className="rounded-lg p-2 hover:bg-gray-100"
                  title="附加资源"
                >
                  <Paperclip className="h-5 w-5 text-gray-500" />
                </button>
                {isStreaming ? (
                  <button
                    onClick={() => setIsStreaming(false)}
                    className="flex items-center space-x-1.5 rounded-lg bg-red-600 px-4 py-2 text-white"
                  >
                    <StopCircle className="h-4 w-4" />
                    <span>停止</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="flex items-center space-x-1.5 rounded-lg bg-blue-600 px-4 py-2 text-white disabled:bg-gray-300"
                  >
                    <Send className="h-4 w-4" />
                    <span>发送</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 拖拽调节手柄 */}
        <div
          className={cn(
            'absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-blue-500',
            isDragging && 'bg-blue-500'
          )}
          onMouseDown={() => setIsDragging(true)}
        />
      </div>

      {/* 右侧面板：PPT预览 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
        {/* PPT 头部工具栏 */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <div className="flex items-center space-x-3">
            <span className="text-lg">📊</span>
            <div>
              <input
                type="text"
                value={currentDocument?.title || '未命名演示文稿'}
                onChange={(e) => {
                  if (currentDocumentId) {
                    updateDocument(currentDocumentId, {
                      title: e.target.value,
                    } as any);
                  }
                }}
                className="border-none bg-transparent text-base font-medium text-gray-900 focus:outline-none"
                placeholder="未命名演示文稿"
              />
              <p className="text-xs text-gray-500">
                {content ? `${slides.length} 页幻灯片` : '等待生成...'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* 导出按钮 */}
            <button className="flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Download className="h-4 w-4" />
              <span>导出</span>
            </button>
          </div>
        </div>

        {/* PPT 内容区域 */}
        {!content ? (
          // 空状态
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mb-4 text-6xl">📊</div>
              <p className="mb-2 text-lg font-medium text-gray-700">
                准备生成PPT
              </p>
              <p className="text-sm text-gray-500">
                在左侧输入框描述你想要的PPT内容
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* 顶部缩略图区域 */}
            <div
              className={cn(
                'border-b border-gray-200 bg-white transition-all duration-300',
                thumbnailsCollapsed ? 'h-0 overflow-hidden' : 'h-auto'
              )}
            >
              <div className="p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase text-gray-500">
                    所有幻灯片 ({slides.length})
                  </div>
                  <button
                    onClick={() => setThumbnailsCollapsed(!thumbnailsCollapsed)}
                    className="rounded p-1 hover:bg-gray-100"
                  >
                    <ChevronUp className="h-4 w-4 text-gray-500" />
                  </button>
                </div>

                {/* 水平滚动缩略图 */}
                <div className="flex space-x-2 overflow-x-auto pb-2">
                  {slides.map((slide, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'group relative w-40 flex-shrink-0 rounded-lg border-2 transition-all',
                        idx === currentSlideIndex
                          ? 'border-blue-500 bg-blue-50 shadow-md'
                          : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'
                      )}
                    >
                      <button
                        onClick={() => setCurrentSlideIndex(idx)}
                        className="w-full p-2 text-left"
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <div className="text-xs font-medium text-gray-500">
                            第 {idx + 1} 页
                          </div>
                          {idx === currentSlideIndex && (
                            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="line-clamp-2 text-xs font-semibold leading-tight text-gray-900">
                          {slide.title}
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 折叠状态下的展开按钮 */}
            {thumbnailsCollapsed && (
              <div className="border-b border-gray-200 bg-white">
                <button
                  onClick={() => setThumbnailsCollapsed(false)}
                  className="flex w-full items-center justify-center space-x-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                >
                  <span>展开缩略图</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* 主幻灯片预览区域 */}
            <div className="flex flex-1 flex-col bg-gray-100 p-8">
              {/* 导航栏 */}
              <div className="mb-6 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  幻灯片 {currentSlideIndex + 1} / {slides.length}
                </div>
                <div className="flex items-center space-x-2">
                  {/* 编辑/预览切换 */}
                  <button
                    onClick={() => {
                      if (isEditMode) {
                        if (editingContent !== content && currentDocumentId) {
                          updateDocument(currentDocumentId, {
                            content: { markdown: editingContent },
                          } as any);
                        }
                      } else {
                        setEditingContent(content);
                      }
                      setIsEditMode(!isEditMode);
                    }}
                    className={cn(
                      'flex items-center space-x-1 rounded-lg px-3 py-2 text-sm',
                      isEditMode
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'border border-gray-300 hover:bg-white'
                    )}
                  >
                    {isEditMode ? (
                      <>
                        <Eye className="h-4 w-4" />
                        <span>预览</span>
                      </>
                    ) : (
                      <>
                        <Edit3 className="h-4 w-4" />
                        <span>编辑</span>
                      </>
                    )}
                  </button>

                  {/* 翻页按钮 */}
                  <button
                    onClick={() =>
                      setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1))
                    }
                    disabled={currentSlideIndex === 0}
                    className="flex items-center space-x-1 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-white disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>上一页</span>
                  </button>
                  <button
                    onClick={() =>
                      setCurrentSlideIndex(
                        Math.min(slides.length - 1, currentSlideIndex + 1)
                      )
                    }
                    disabled={currentSlideIndex === slides.length - 1}
                    className="flex items-center space-x-1 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-white disabled:opacity-50"
                  >
                    <span>下一页</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* 幻灯片预览/编辑 */}
              <div className="flex flex-1 items-center justify-center">
                {isEditMode ? (
                  // 编辑模式
                  <div className="flex h-full w-full max-w-5xl flex-col">
                    <div className="flex-1 rounded-2xl bg-white p-6 shadow-2xl">
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="h-full w-full resize-none rounded-lg border border-gray-200 p-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="在此编辑幻灯片内容（Markdown格式）"
                      />
                    </div>
                  </div>
                ) : (
                  // 预览模式
                  slides[currentSlideIndex] && (
                    <EnhancedSlideRenderer
                      slide={slides[currentSlideIndex]}
                      template={template}
                    />
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
