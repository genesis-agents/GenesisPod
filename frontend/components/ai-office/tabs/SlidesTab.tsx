'use client';

/**
 * AI Slides Tab 内容组件
 * 在 AI Office 页面的 Tab 中使用
 * 基于独立 slides page 的核心逻辑
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-misused-promises */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Edit3,
  Check,
  Sparkles,
  Plus,
  X,
  Loader2,
  FileText,
  Layout,
  RefreshCw,
  CheckCircle2,
  Circle,
  Wand2,
  ArrowLeft,
  Eye,
} from 'lucide-react';

import { useResourceStore, useDocumentStore } from '@/stores/aiOfficeStore';
import { cn } from '@/lib/utils/common';
import { config } from '@/lib/utils/config';
import {
  parseMarkdownToEnhancedSlides,
  EnhancedSlide,
} from '@/lib/ai-office/markdown-parser';
import EditableSlideRenderer from '@/components/ai-office/document/EditableSlideRenderer';
import { getTemplateById, PPTTemplate } from '@/lib/ai-office/ppt-templates';
import type { Document } from '@/types/ai-office';

// Document Store State 类型
interface DocumentStoreState {
  documents: Document[];
  currentDocumentId: string | null;
  addDocument: (doc: Document) => void;
  setCurrentDocument: (id: string) => void;
  updateDocument: (id: string, updates: Partial<Document>) => void;
}

// 类型定义
interface Resource {
  _id: string;
  resourceType: string;
  metadata?: { title?: string };
  status: string;
}

type GenerationStep = 'idle' | 'outline' | 'layout' | 'content' | 'complete';

// 幻灯片目的类型（与后端一致）
type SlidePurpose =
  | 'title'
  | 'agenda'
  | 'section_header'
  | 'content'
  | 'comparison'
  | 'timeline'
  | 'statistics'
  | 'quote'
  | 'team'
  | 'image_focus'
  | 'chart'
  | 'closing'
  | 'qna';

// 大纲项（与后端 SlideOutlineItem 对齐）
interface OutlineItem {
  slideNumber: number;
  index?: number; // 后端返回的索引
  purpose?: SlidePurpose;
  title: string;
  points: string[];
  keyPoints?: string[]; // 后端返回的字段
  layoutSuggestion?: string;
  // 专业设计师视角的新字段
  visualIntent?: string;
  imageHint?: string;
  needsImage?: boolean;
  needsChart?: boolean;
  emphasis?: 'high' | 'medium' | 'low';
}

// PPT 大纲（与后端 PPTOutline 对齐）
interface PPTOutlineData {
  title: string;
  subtitle?: string;
  estimatedDuration?: number;
  targetAudience?: string;
  suggestedTheme?: string;
  narrativeArc?: string;
  slides: OutlineItem[];
}

interface LayoutConfig {
  slideNumber: number;
  layoutType: 'title' | 'content' | 'twoColumn' | 'chart' | 'image' | 'summary';
  colorScheme: string;
  visualElements?: string[];
}

// 资源卡片组件
function ResourceCard({ resource }: { resource: Resource }) {
  const { removeResource, selectResource, deselectResource } =
    useResourceStore();
  const selectedIds = useResourceStore((state) => state.selectedResourceIds);
  const isSelected = selectedIds.includes(resource._id);

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
        <h4 className="truncate text-sm font-medium text-gray-900">
          {resource.metadata?.title || '无标题'}
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

// 步骤指示器
function StepIndicator({ currentStep }: { currentStep: GenerationStep }) {
  const steps = [
    { id: 'outline' as const, label: '大纲规划', icon: FileText },
    { id: 'layout' as const, label: '布局配色', icon: Layout },
    { id: 'content' as const, label: '内容生成', icon: Wand2 },
  ];

  const getStepStatus = (stepId: GenerationStep) => {
    const order = ['idle', 'outline', 'layout', 'content', 'complete'];
    const currentIndex = order.indexOf(currentStep);
    const stepIndex = order.indexOf(stepId);
    if (currentStep === 'complete') return 'complete';
    if (stepIndex < currentIndex) return 'complete';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };

  return (
    <div className="flex items-center justify-center gap-2 py-3">
      {steps.map((step, index) => {
        const status = getStepStatus(step.id);
        return (
          <React.Fragment key={step.id}>
            <div
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium',
                status === 'complete' && 'bg-green-100 text-green-700',
                status === 'current' &&
                  'bg-blue-100 text-blue-700 ring-2 ring-blue-500',
                status === 'pending' && 'bg-gray-100 text-gray-400'
              )}
            >
              {status === 'complete' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : status === 'current' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Circle className="h-4 w-4" />
              )}
              <span>{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <ChevronRight className="h-4 w-4 text-gray-300" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// 目的类型到中文名称的映射
const PURPOSE_LABELS: Record<SlidePurpose, string> = {
  title: '标题页',
  agenda: '议程',
  section_header: '章节',
  content: '内容',
  comparison: '对比',
  timeline: '时间线',
  statistics: '数据',
  quote: '引用',
  team: '团队',
  image_focus: '图片',
  chart: '图表',
  closing: '结束',
  qna: '问答',
};

// 强调程度徽章样式
const EMPHASIS_STYLES = {
  high: 'bg-amber-100 text-amber-700 border-amber-300',
  medium: 'bg-blue-50 text-blue-600 border-blue-200',
  low: 'bg-gray-50 text-gray-500 border-gray-200',
};

// 大纲编辑器 - 增强版，显示专业设计规格
function OutlineEditor({
  outline,
  onUpdate,
  onConfirm,
  onRegenerate,
  isLoading,
}: {
  outline: OutlineItem[];
  onUpdate: (outline: OutlineItem[]) => void;
  onConfirm: () => void;
  onRegenerate: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
        <h3 className="font-semibold text-gray-800">PPT 大纲</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onRegenerate}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            <span>重新生成</span>
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading || outline.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            <span>确认大纲</span>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {outline.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-400">
            <div className="text-center">
              <FileText className="mx-auto mb-3 h-12 w-12" />
              <p className="text-sm">等待生成大纲...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {outline.map((item, index) => (
              <div
                key={index}
                className={cn(
                  'rounded-lg border bg-white p-4 transition-all hover:shadow-sm',
                  item.emphasis === 'high'
                    ? 'border-amber-300 ring-1 ring-amber-200'
                    : 'border-gray-200'
                )}
              >
                {/* 头部：页码 + 标题 + 徽章 */}
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                      item.emphasis === 'high'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-blue-100 text-blue-700'
                    )}
                  >
                    {item.slideNumber}
                  </span>
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => {
                      const newOutline = [...outline];
                      newOutline[index].title = e.target.value;
                      onUpdate(newOutline);
                    }}
                    className="flex-1 border-none bg-transparent font-medium text-gray-900 focus:outline-none focus:ring-0"
                    placeholder="幻灯片标题"
                  />
                  {/* 徽章区域 */}
                  <div className="flex items-center gap-1.5">
                    {item.purpose && (
                      <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs text-purple-600">
                        {PURPOSE_LABELS[item.purpose] || item.purpose}
                      </span>
                    )}
                    {item.emphasis && (
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-xs',
                          EMPHASIS_STYLES[item.emphasis]
                        )}
                      >
                        {item.emphasis === 'high'
                          ? 'Hero'
                          : item.emphasis === 'medium'
                            ? '重点'
                            : '辅助'}
                      </span>
                    )}
                    {item.needsImage && (
                      <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-600">
                        图片
                      </span>
                    )}
                    {item.needsChart && (
                      <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-xs text-cyan-600">
                        图表
                      </span>
                    )}
                  </div>
                </div>

                {/* 要点列表 */}
                <ul className="ml-8 space-y-1">
                  {item.points.map((point, pointIndex) => (
                    <li key={pointIndex} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-400" />
                      <input
                        type="text"
                        value={point}
                        onChange={(e) => {
                          const newOutline = [...outline];
                          newOutline[index].points[pointIndex] = e.target.value;
                          onUpdate(newOutline);
                        }}
                        className="flex-1 border-none bg-transparent text-sm text-gray-600 focus:outline-none focus:ring-0"
                        placeholder="要点内容"
                      />
                    </li>
                  ))}
                  <button
                    onClick={() => {
                      const newOutline = [...outline];
                      newOutline[index].points.push('');
                      onUpdate(newOutline);
                    }}
                    className="ml-3.5 text-xs text-blue-600 hover:text-blue-700"
                  >
                    + 添加要点
                  </button>
                </ul>

                {/* 设计意图和图片提示（可折叠） */}
                {(item.visualIntent || item.imageHint) && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <details className="group">
                      <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-700">
                        <span className="inline-flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          查看设计规格
                        </span>
                      </summary>
                      <div className="mt-2 space-y-2 rounded-md bg-gray-50 p-2 text-xs">
                        {item.visualIntent && (
                          <div>
                            <span className="font-medium text-gray-600">
                              视觉意图：
                            </span>
                            <span className="text-gray-500">
                              {item.visualIntent}
                            </span>
                          </div>
                        )}
                        {item.imageHint && (
                          <div>
                            <span className="font-medium text-gray-600">
                              图片建议：
                            </span>
                            <span className="text-gray-500">
                              {item.imageHint}
                            </span>
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            ))}
            <button
              onClick={() => {
                const newOutline = [...outline];
                newOutline.push({
                  slideNumber: outline.length + 1,
                  title: '',
                  points: [''],
                  purpose: 'content',
                });
                onUpdate(newOutline);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600"
            >
              <Plus className="h-4 w-4" />
              <span>添加幻灯片</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// 布局配置器
function LayoutConfigurator({
  layouts,
  onUpdate,
  onConfirm,
  onBack,
  isLoading,
}: {
  layouts: LayoutConfig[];
  onUpdate: (layouts: LayoutConfig[]) => void;
  onConfirm: () => void;
  onBack: () => void;
  isLoading: boolean;
}) {
  const layoutTypes = [
    { id: 'title', name: '标题页', icon: '🎯' },
    { id: 'content', name: '内容页', icon: '📝' },
    { id: 'twoColumn', name: '双栏布局', icon: '📊' },
    { id: 'chart', name: '图表页', icon: '📈' },
    { id: 'image', name: '图片页', icon: '🖼️' },
    { id: 'summary', name: '总结页', icon: '✅' },
  ];

  const colorSchemes = [
    {
      id: 'professional',
      name: '专业蓝',
      colors: ['#1e3a5f', '#2563eb', '#60a5fa'],
    },
    { id: 'modern', name: '现代紫', colors: ['#4c1d95', '#7c3aed', '#a78bfa'] },
    { id: 'nature', name: '自然绿', colors: ['#14532d', '#16a34a', '#86efac'] },
    { id: 'warm', name: '温暖橙', colors: ['#7c2d12', '#ea580c', '#fdba74'] },
    {
      id: 'elegant',
      name: '典雅灰',
      colors: ['#1f2937', '#4b5563', '#9ca3af'],
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="rounded-lg p-1.5 hover:bg-gray-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h3 className="font-semibold text-gray-800">布局与配色</h3>
        </div>
        <button
          onClick={onConfirm}
          disabled={isLoading || layouts.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Wand2 className="h-4 w-4" />
          <span>开始生成</span>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {layouts.length === 0 ? (
          <div className="flex h-full items-center justify-center text-gray-400">
            <div className="text-center">
              <Layout className="mx-auto mb-3 h-12 w-12" />
              <p className="text-sm">等待规划布局...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {layouts.map((layout, index) => (
              <div
                key={index}
                className="rounded-lg border border-gray-200 bg-white p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    第 {layout.slideNumber} 页
                  </span>
                </div>
                <div className="mb-3">
                  <p className="mb-2 text-xs font-medium text-gray-500">
                    布局类型
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {layoutTypes.map((type) => (
                      <button
                        key={type.id}
                        onClick={() => {
                          const newLayouts = [...layouts];
                          newLayouts[index].layoutType = type.id as any;
                          onUpdate(newLayouts);
                        }}
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-all',
                          layout.layoutType === type.id
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300'
                        )}
                      >
                        <span>{type.icon}</span>
                        <span>{type.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-500">
                    配色方案
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {colorSchemes.map((scheme) => (
                      <button
                        key={scheme.id}
                        onClick={() => {
                          const newLayouts = [...layouts];
                          newLayouts[index].colorScheme = scheme.id;
                          onUpdate(newLayouts);
                        }}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-all',
                          layout.colorScheme === scheme.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        )}
                      >
                        <div className="flex">
                          {scheme.colors.map((color, i) => (
                            <span
                              key={i}
                              className="h-4 w-4 rounded-full border border-white"
                              style={{
                                backgroundColor: color,
                                marginLeft: i > 0 ? '-4px' : 0,
                              }}
                            />
                          ))}
                        </div>
                        <span className="text-sm">{scheme.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// 主组件
export default function SlidesTab() {
  // 资源状态
  const resources = useResourceStore((state) => state.resources);
  const selectedResourceIds = useResourceStore(
    (state) => state.selectedResourceIds
  );
  const { selectResource, clearSelection } = useResourceStore();

  // 文档状态
  const { documents, addDocument, setCurrentDocument, updateDocument } =
    useDocumentStore() as DocumentStoreState;
  const currentDocumentId = useDocumentStore(
    (state: DocumentStoreState) => state.currentDocumentId
  );
  const currentDocument = documents.find((d) => d._id === currentDocumentId);

  // UI 状态
  const [resourceListCollapsed, setResourceListCollapsed] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(420);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState('professional');

  // 解析后的意图状态（由后端返回）
  const [parsedIntent, setParsedIntent] = useState<{
    urls: string[];
    visualStyle: string;
    visualStyleName: string;
    pageCount: number | null;
    colorTheme: string | null;
    cleanPrompt: string;
  } | null>(null);

  // 生成流程状态
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle');
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [layouts, setLayouts] = useState<LayoutConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // PPT 预览状态
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [thumbnailsCollapsed, setThumbnailsCollapsed] = useState(false);
  const [isInlineEditMode, setIsInlineEditMode] = useState(false);
  const [isSourceEditMode, setIsSourceEditMode] = useState(false);
  const [editingContent, setEditingContent] = useState('');

  // 聊天状态
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<
    Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      timestamp: Date;
    }>
  >([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 获取当前文档内容
  const docContent = currentDocument?.content as
    | { markdown?: string; slides?: any[] }
    | undefined;
  const content = docContent?.markdown || '';
  const rawSlides = docContent?.slides || [];

  // 调试：检查原始幻灯片数据中的图片信息
  if (rawSlides.length > 0 && rawSlides[0]?.images) {
    console.log('[SlidesTab] rawSlides[0] images:', rawSlides[0].images);
    console.log(
      '[SlidesTab] rawSlides[0] backgroundImage:',
      rawSlides[0].backgroundImage
    );
  }

  // 解析 Markdown 并合并图片信息
  const parsedSlides = parseMarkdownToEnhancedSlides(content);

  // 合并 rawSlides 中的图片信息到 parsedSlides
  const slides = parsedSlides.map((parsedSlide, index) => {
    const rawSlide = rawSlides[index];
    if (rawSlide) {
      return {
        ...parsedSlide,
        backgroundImage: rawSlide.backgroundImage,
        contentImage: rawSlide.contentImage,
        images: rawSlide.images,
        renderedHtml: rawSlide.renderedHtml,
      };
    }
    return parsedSlide;
  });

  // 调试：检查合并后的幻灯片数据
  if (slides.length > 0) {
    const firstSlide = slides[0] as any;
    console.log('[SlidesTab] === SLIDE IMAGE DEBUG ===');
    console.log('[SlidesTab] rawSlides count:', rawSlides.length);
    console.log('[SlidesTab] rawSlides[0] full:', rawSlides[0]);
    console.log('[SlidesTab] Final slide[0] full:', firstSlide);
    console.log('[SlidesTab] Final slide[0] summary:', {
      title: firstSlide.title,
      hasBackgroundImage: !!firstSlide.backgroundImage,
      backgroundImage:
        firstSlide.backgroundImage?.slice?.(0, 100) ||
        firstSlide.backgroundImage,
      hasImages: !!firstSlide.images?.length,
      imagesCount: firstSlide.images?.length || 0,
      images: firstSlide.images,
    });
    console.log('[SlidesTab] === END DEBUG ===');
  }

  const template: PPTTemplate = currentDocument?.template?.id
    ? getTemplateById(currentDocument.template.id)
    : getTemplateById('corporate');

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  // 生成大纲（使用后端意图解析）
  const generateOutline = async () => {
    if (!input.trim()) return;
    const userInput = input;
    setInput('');
    setIsLoading(true);
    setGenerationStep('outline');

    // 显示用户输入的原始消息
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'user',
        content: userInput,
        timestamp: new Date(),
      },
    ]);

    try {
      // 1. 调用后端意图解析 API
      let intentData = {
        urls: [] as string[],
        visualStyle: 'default',
        visualStyleName: '默认',
        pageCount: 8,
        colorTheme: null,
        cleanPrompt: userInput,
      };

      try {
        const intentResponse = await fetch('/api/ai-office/parse-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: userInput }),
        });
        if (intentResponse.ok) {
          intentData = await intentResponse.json();
        }
      } catch (parseError) {
        console.warn('Intent parsing failed, using defaults:', parseError);
      }
      setParsedIntent(intentData);

      // 显示解析结果
      const intentSummary: string[] = [];
      if (intentData.urls?.length > 0) {
        intentSummary.push(`检测到 ${intentData.urls.length} 个链接`);
      }
      if (intentData.visualStyleName && intentData.visualStyle !== 'default') {
        intentSummary.push(`风格: ${intentData.visualStyleName}`);
      }
      if (intentData.pageCount) {
        intentSummary.push(`页数: ${intentData.pageCount}页`);
      }

      if (intentSummary.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 0.5).toString(),
            role: 'assistant',
            content: `AI 理解到的需求：\n${intentSummary.join('\n')}\n\n正在生成大纲...`,
            timestamp: new Date(),
          },
        ]);
      }

      // 使用解析后的参数
      const slideCount = intentData.pageCount || 8;
      const urls = intentData.urls || [];

      // 智能选择 API 端点：
      // 1. 如果 config.apiUrl 包含 localhost，说明环境变量没配置，使用相对路径（通过 Next.js API route）
      // 2. 否则直接调用后端 API（更快，没有 serverless 超时限制）
      const isLocalhost = config.apiUrl.includes('localhost');
      const backendUrl = isLocalhost
        ? '/api/ai-office/ppt/outline' // 使用 Next.js API route 作为代理
        : `${config.apiUrl}/ai-office/ppt/outline`; // 直接调用后端
      console.log(
        `[PPT] API URL: ${backendUrl} (${isLocalhost ? 'via proxy' : 'direct'})`
      );

      // 带重试的 API 调用（处理 AI API 偶发的 5xx 错误）
      const maxRetries = 3;
      let lastError: Error | null = null;
      let response: Response | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[PPT] Attempt ${attempt}/${maxRetries}...`);
          response = await fetch(backendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: userInput,
              urls: urls.length > 0 ? urls : undefined,
              slideCount: slideCount,
              language: 'zh',
              targetAudience: intentData.visualStyleName || undefined,
              presentationStyle: 'formal',
            }),
          });

          if (response.ok) {
            console.log(`[PPT] Success on attempt ${attempt}`);
            break;
          }

          // 5xx 错误可以重试，4xx 错误直接失败
          if (response.status >= 500 && attempt < maxRetries) {
            console.log(
              `[PPT] Server error ${response.status}, retrying in 2s...`
            );
            await new Promise((resolve) => setTimeout(resolve, 2000));
            lastError = new Error(
              `API responded with status: ${response.status}`
            );
            continue;
          }

          throw new Error(`API responded with status: ${response.status}`);
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < maxRetries) {
            console.log(
              `[PPT] Request failed: ${lastError.message}, retrying...`
            );
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }

      if (!response || !response.ok) {
        throw (
          lastError || new Error('Failed to generate outline after retries')
        );
      }

      const data = await response.json();
      console.log('[PPT] Response data:', JSON.stringify(data).slice(0, 500));

      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.outline || !data.outline.slides) {
        console.error('[PPT] Invalid response structure:', data);
        throw new Error('Invalid response: missing outline or slides');
      }

      // 解析后端返回的专业大纲
      const pptOutline: PPTOutlineData = data.outline;
      const suggestedTheme = data.suggestedTheme || 'professional';

      // 转换为前端 OutlineItem 格式
      const outlineData: OutlineItem[] = pptOutline.slides.map(
        (slide, index) => ({
          slideNumber: index + 1,
          index: slide.index,
          purpose: slide.purpose,
          title: slide.title,
          points: slide.keyPoints || slide.points || [],
          keyPoints: slide.keyPoints,
          visualIntent: slide.visualIntent,
          imageHint: slide.imageHint,
          needsImage: slide.needsImage,
          needsChart: slide.needsChart,
          emphasis: slide.emphasis,
        })
      );

      setOutline(outlineData);
      setSelectedTheme(suggestedTheme);

      // 构建详细的大纲预览消息
      const outlineSummary = outlineData
        .map((item) => {
          const emphasisBadge = item.emphasis === 'high' ? ' [Hero]' : '';
          const imageBadge = item.needsImage ? ' [Image]' : '';
          const chartBadge = item.needsChart ? ' [Chart]' : '';
          return `${item.slideNumber}. ${item.title}${emphasisBadge}${imageBadge}${chartBadge}`;
        })
        .join('\n');

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `已生成专业 PPT 大纲（${outlineData.length} 页）：\n\n${outlineSummary}\n\n推荐主题: ${suggestedTheme}\n${pptOutline.narrativeArc ? `叙事弧线: ${pptOutline.narrativeArc}` : ''}\n\n请在右侧查看和编辑。`,
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      console.error('Generate outline error:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `抱歉，生成大纲时出错：${errorMessage}`,
          timestamp: new Date(),
        },
      ]);
      setGenerationStep('idle');
    } finally {
      setIsLoading(false);
    }
  };

  // 确认大纲
  const confirmOutline = () => {
    setGenerationStep('layout');
    const defaultLayouts: LayoutConfig[] = outline.map((item, index) => ({
      slideNumber: item.slideNumber,
      layoutType:
        index === 0
          ? 'title'
          : index === outline.length - 1
            ? 'summary'
            : 'content',
      colorScheme: selectedTheme,
    }));
    setLayouts(defaultLayouts);
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: '大纲已确认！现在请为每页选择布局类型和配色方案。',
        timestamp: new Date(),
      },
    ]);
  };

  // 生成内容 - 使用后端完整PPT生成API（包含图片）
  const generateContent = async () => {
    setIsLoading(true);
    setGenerationStep('content');

    const newDocumentId = `doc-${Date.now()}`;
    const newDocument = {
      _id: newDocumentId,
      userId: 'current-user',
      type: 'ppt',
      title: outline[0]?.title || '未命名演示文稿',
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
      content: { markdown: '', slides: [] },
      metadata: { wordCount: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    addDocument(newDocument as any);
    setCurrentDocument(newDocumentId);

    try {
      // 构建大纲文本用于 prompt
      const outlineText = outline
        .map(
          (item) =>
            `第${item.slideNumber}页 - ${item.title}: ${item.points.join(', ')}`
        )
        .join('\n');

      // 获取解析的意图数据
      const visualStyle = parsedIntent?.visualStyle || 'default';
      const urls = parsedIntent?.urls || [];

      // 构建完整的提示词
      const fullPrompt = `${outline[0]?.title || input}\n\n大纲：\n${outlineText}`;

      // 映射视觉风格到主题ID
      const themeMapping: Record<string, string> = {
        default: 'professional',
        comic: 'creative',
        doraemon: 'doraemon', // 专门的机器猫主题
        anime: 'creative',
        watercolor: 'creative',
        pixel: 'creative',
        flat: 'modern',
        handdrawn: 'creative',
        professional: 'professional',
        tech: 'modern',
        minimal: 'minimal',
      };
      const themeId = themeMapping[visualStyle] || 'professional';

      // 构建 SSE 请求 URL
      const params = new URLSearchParams({
        prompt: fullPrompt,
        themeId: themeId,
        slideCount: String(outline.length),
        language: 'zh',
        includeImages: 'true',
      });

      if (urls.length > 0) {
        params.set('urls', urls.join(','));
      }

      // 智能选择 SSE 端点：
      // 1. 如果环境变量配置了后端 URL，直接连接后端（更稳定，无 serverless 超时）
      // 2. 否则使用 Next.js API route 作为代理
      const isLocalhost = config.apiUrl.includes('localhost');
      const sseUrl = isLocalhost
        ? `/api/ai-office/ppt/generate/stream?${params.toString()}`
        : `${config.apiUrl}/ai-office/ppt/generate/stream?${params.toString()}`;

      console.log(
        `[PPT] SSE URL: ${sseUrl.slice(0, 100)}... (${isLocalhost ? 'via proxy' : 'direct'})`
      );
      console.log(
        '[PPT] === CODE VERSION: 2024-12-11-v2 with addEventListener fix ==='
      );

      // 使用后端完整 PPT 生成 API（包含图片生成）
      const eventSource = new EventSource(sseUrl);

      let generatedSlides: any[] = [];
      let pptDocument: any = null;

      // 通用事件处理函数
      const handleSSEEvent = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[SlidesTab] SSE event received:', data.type, data);

          switch (data.type) {
            case 'progress':
              // 更新进度消息
              setMessages((prev) => {
                const lastMsg = prev[prev.length - 1];
                const progressMsg =
                  data.progress?.message || data.message || data.phase;
                if (
                  lastMsg?.role === 'assistant' &&
                  lastMsg.content.includes('正在')
                ) {
                  return [
                    ...prev.slice(0, -1),
                    {
                      ...lastMsg,
                      content: `正在生成: ${progressMsg}...`,
                    },
                  ];
                }
                return [
                  ...prev,
                  {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: `正在生成: ${progressMsg}...`,
                    timestamp: new Date(),
                  },
                ];
              });
              break;

            case 'slide_complete':
              // 后端发送的单页完成事件
              console.log('[SlidesTab] === SSE slide_complete EVENT ===');
              console.log('[SlidesTab] Raw data.slide:', data.slide);
              console.log('[SlidesTab] data.slide.images:', data.slide?.images);
              if (data.slide) {
                const backgroundImg = data.slide.images?.find(
                  (img: any) => img.position === 'background'
                );
                const contentImg = data.slide.images?.find(
                  (img: any) => img.position !== 'background'
                );
                console.log('[SlidesTab] backgroundImg found:', backgroundImg);
                console.log('[SlidesTab] contentImg found:', contentImg);

                const slideData = {
                  index: data.slide.index,
                  title:
                    data.slide.spec?.title ||
                    data.slide.content?.title ||
                    `Slide ${data.slide.index + 1}`,
                  content: data.slide.content?.bulletPoints || [],
                  backgroundImage: backgroundImg?.url,
                  contentImage: contentImg?.url,
                  renderedHtml: data.slide.renderedHtml,
                  spec: data.slide.spec,
                  rawContent: data.slide.content,
                  images: data.slide.images,
                };
                console.log('[SlidesTab] Constructed slideData:', slideData);
                generatedSlides.push(slideData);

                // 转换为 Markdown 格式更新文档
                const markdown = generatedSlides
                  .map(
                    (slide: any, idx: number) =>
                      `### Slide ${idx + 1}: ${slide.title}\n${
                        Array.isArray(slide.content)
                          ? slide.content
                              .map(
                                (c: any) =>
                                  `- ${typeof c === 'string' ? c : c.text || c}`
                              )
                              .join('\n')
                          : ''
                      }${slide.backgroundImage ? `\n<!-- BACKGROUND_IMAGE: ${slide.backgroundImage} -->` : ''}${slide.contentImage ? `\n<!-- CONTENT_IMAGE: ${slide.contentImage} -->` : ''}`
                  )
                  .join('\n\n---\n\n');
                updateDocument(newDocumentId, {
                  content: { markdown, slides: generatedSlides },
                  metadata: { wordCount: markdown.length },
                  updatedAt: new Date(),
                } as any);
              }
              break;

            case 'slide':
              // 兼容旧格式
              generatedSlides.push(data.slide);
              const markdownOld = generatedSlides
                .map(
                  (slide: any, idx: number) =>
                    `### Slide ${idx + 1}: ${slide.title}\n${
                      slide.content
                        ?.map((c: any) => `- ${c.text || c}`)
                        .join('\n') || ''
                    }${slide.backgroundImage ? `\n<!-- IMAGE: ${slide.backgroundImage} -->` : ''}`
                )
                .join('\n\n---\n\n');
              updateDocument(newDocumentId, {
                content: { markdown: markdownOld, slides: generatedSlides },
                metadata: { wordCount: markdownOld.length },
                updatedAt: new Date(),
              } as any);
              break;

            case 'complete':
              // 生成完成
              pptDocument = data.result;

              // 如果 result 中有 pptId，说明生成成功
              if (data.result?.pptId) {
                const finalMarkdown = generatedSlides
                  .map(
                    (slide: any, idx: number) =>
                      `### Slide ${idx + 1}: ${slide.title}\n${
                        Array.isArray(slide.content)
                          ? slide.content
                              .map(
                                (c: any) =>
                                  `- ${typeof c === 'string' ? c : c.text || c}`
                              )
                              .join('\n')
                          : ''
                      }${slide.backgroundImage ? `\n<!-- BACKGROUND_IMAGE: ${slide.backgroundImage} -->` : ''}${slide.contentImage ? `\n<!-- CONTENT_IMAGE: ${slide.contentImage} -->` : ''}`
                  )
                  .join('\n\n---\n\n');

                updateDocument(newDocumentId, {
                  content: {
                    markdown: finalMarkdown,
                    slides: generatedSlides,
                    pptId: data.result.pptId,
                  },
                  status: 'completed',
                  metadata: {
                    wordCount: finalMarkdown.length,
                    totalSlides: data.result.totalSlides,
                    duration: data.result.duration,
                  },
                  updatedAt: new Date(),
                } as any);
              }

              setGenerationStep('complete');
              const imageCount = generatedSlides.reduce(
                (acc: number, slide: any) =>
                  acc +
                  (slide.backgroundImage ? 1 : 0) +
                  (slide.contentImage ? 1 : 0),
                0
              );
              setMessages((prev) => [
                ...prev,
                {
                  id: Date.now().toString(),
                  role: 'assistant',
                  content: `PPT生成完成！共 ${generatedSlides.length} 页${imageCount > 0 ? `，包含 ${imageCount} 张AI生成的图片` : ''}。`,
                  timestamp: new Date(),
                },
              ]);
              setIsLoading(false);
              eventSource.close();
              break;

            case 'error':
              throw new Error(data.error?.message || 'PPT generation failed');
          }
        } catch (parseError) {
          console.error('Parse SSE event error:', parseError);
        }
      };

      // 监听所有 SSE 事件类型
      // NestJS SSE 发送命名事件，需要分别监听
      console.log('[PPT] Registering SSE event listeners...');

      // 未命名事件（默认 message 事件）
      eventSource.onmessage = (event) => {
        console.log(
          '[PPT] onmessage received:',
          event.data?.slice?.(0, 200) || event.data
        );
        handleSSEEvent(event);
      };

      // 命名事件 - NestJS @Sse 会根据返回对象的 type 字段设置事件名
      const eventTypes = [
        'progress',
        'outline_complete',
        'slide_planned',
        'slide_content_complete',
        'slide_image_complete',
        'slide_complete',
        'complete',
        'error',
      ];

      eventTypes.forEach((eventType) => {
        eventSource.addEventListener(eventType, (event) => {
          console.log(
            `[PPT] Named event '${eventType}' received:`,
            (event as MessageEvent).data?.slice?.(0, 200)
          );
          handleSSEEvent(event as MessageEvent);
        });
      });

      // 监听 open 事件确认连接
      eventSource.onopen = () => {
        console.log('[PPT] SSE connection opened');
      };

      console.log(
        '[PPT] SSE event listeners registered for:',
        eventTypes.join(', ')
      );

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        eventSource.close();

        // 如果已经有生成的slides，使用它们
        if (generatedSlides.length > 0) {
          const markdown = generatedSlides
            .map(
              (slide, idx) =>
                `### Slide ${idx + 1}: ${slide.title}\n${
                  slide.content
                    ?.map((c: any) => `- ${c.text || c}`)
                    .join('\n') || ''
                }`
            )
            .join('\n\n---\n\n');
          updateDocument(newDocumentId, {
            content: { markdown, slides: generatedSlides },
            status: 'completed',
            updatedAt: new Date(),
          } as any);
          setGenerationStep('complete');
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: `PPT生成完成！共 ${generatedSlides.length} 页。`,
              timestamp: new Date(),
            },
          ]);
        } else {
          // 回退到简单文本生成
          fallbackToTextGeneration(newDocumentId);
        }
        setIsLoading(false);
      };
    } catch (error) {
      console.error('Generate content error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: '抱歉，生成内容时出错，请重试。',
          timestamp: new Date(),
        },
      ]);
      setIsLoading(false);
    }
  };

  // 回退到简单文本生成（当后端PPT API不可用时）
  const fallbackToTextGeneration = async (documentId: string) => {
    try {
      const outlineText = outline
        .map(
          (item) =>
            `第${item.slideNumber}页 - ${item.title}:\n${item.points.map((p) => `  - ${p}`).join('\n')}`
        )
        .join('\n\n');
      const layoutText = layouts
        .map(
          (l) =>
            `第${l.slideNumber}页: ${l.layoutType} 布局, ${l.colorScheme} 配色`
        )
        .join('\n');

      const response = await fetch('/api/ai-office/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `请根据以下大纲和布局配置生成完整的PPT内容。\n\n【大纲】\n${outlineText}\n\n【布局配置】\n${layoutText}\n\n【输出格式要求】\n请严格按照以下Markdown格式输出：\n\n### Slide 1: [标题]\n- 内容要点\n\n---\n\n### Slide 2: [标题]\n- 内容要点\n\n---\n\n注意：\n1. 每页以 "### Slide X: " 开头\n2. 使用 "---" 分隔\n3. 内容丰富详实，每页3-5个要点\n4. 直接输出，不要添加说明`,
          resources: resources.filter((r) =>
            selectedResourceIds.includes(r._id)
          ),
          documentId: documentId,
          stream: true,
        }),
      });

      if (!response.ok) throw new Error('Fallback generation failed');

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
                  updateDocument(documentId, {
                    content: { markdown: aiContent },
                    metadata: { wordCount: aiContent.length },
                    updatedAt: new Date(),
                  } as any);
                }
              } catch {
                // 忽略解析错误
              }
            }
          }
        }
      }

      const slideCount = aiContent.split('---').filter((s) => s.trim()).length;
      updateDocument(documentId, {
        status: 'completed',
        updatedAt: new Date(),
      } as any);

      setGenerationStep('complete');
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: `PPT生成完成！共 ${slideCount} 页（文本模式）。`,
          timestamp: new Date(),
        },
      ]);
    } catch (error) {
      console.error('Fallback generation error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: '抱歉，生成内容时出错，请重试。',
          timestamp: new Date(),
        },
      ]);
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

  // 重置流程
  const resetGeneration = () => {
    setGenerationStep('idle');
    setOutline([]);
    setLayouts([]);
    setMessages([]);
    setParsedIntent(null);
  };

  // 处理幻灯片内联编辑更新
  const handleSlideChange = useCallback(
    (slideIndex: number, updatedSlide: EnhancedSlide) => {
      if (!currentDocumentId || !content) return;
      const slidesSections = content.split(/(?=### Slide \d+:)/);
      const newSections = slidesSections.map((section: string, idx: number) => {
        if (idx === slideIndex) {
          let newMarkdown = `### Slide ${slideIndex + 1}: ${updatedSlide.title}\n`;
          updatedSlide.content.forEach((line) => {
            if (line.trim()) newMarkdown += `${line}\n`;
          });
          return newMarkdown;
        }
        return section;
      });
      const newContent = newSections.join('\n---\n\n').trim();
      updateDocument(currentDocumentId, {
        content: { markdown: newContent },
        updatedAt: new Date(),
      } as any);
    },
    [currentDocumentId, content, updateDocument]
  );

  return (
    <div ref={containerRef} className="flex h-full overflow-hidden">
      {/* 左侧面板：资源 + 生成流程 */}
      <div
        className="relative flex flex-shrink-0 flex-col border-r border-gray-200 bg-white"
        style={{ width: `${leftPanelWidth}px` }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">AI Slides</h1>
              <p className="text-xs text-gray-500">智能PPT生成器</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {generationStep !== 'idle' && (
              <button
                onClick={resetGeneration}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                title="重新开始"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* 步骤指示器 */}
        {generationStep !== 'idle' && (
          <div className="border-b border-gray-200 bg-gray-50">
            <StepIndicator currentStep={generationStep} />
          </div>
        )}

        {/* AI 解析结果提示（仅在有解析结果时显示） */}
        <AnimatePresence>
          {parsedIntent && generationStep !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-b border-gray-200"
            >
              <div className="flex flex-wrap items-center gap-2 bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-2">
                <span className="text-xs text-gray-500">AI 理解:</span>
                {parsedIntent.urls.length > 0 && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                    📎 {parsedIntent.urls.length} 个链接
                  </span>
                )}
                {parsedIntent.visualStyle !== 'default' && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                    🎨 {parsedIntent.visualStyleName}
                  </span>
                )}
                {parsedIntent.pageCount && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                    📄 {parsedIntent.pageCount}页
                  </span>
                )}
                {parsedIntent.colorTheme && (
                  <span className="rounded-full bg-pink-100 px-2 py-0.5 text-xs text-pink-700">
                    🎨 {parsedIntent.colorTheme}
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 资源列表区域 */}
        <div
          className={cn(
            'border-b border-gray-200 transition-all duration-300',
            resourceListCollapsed ? 'h-11' : 'h-40'
          )}
        >
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
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
            <div className="flex h-[calc(100%-40px)] flex-col overflow-hidden">
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
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {resources.length === 0 ? (
                  <div className="py-4 text-center">
                    <Plus className="mx-auto h-6 w-6 text-gray-400" />
                    <p className="mt-2 text-xs text-gray-500">
                      在 Explore 页面添加资源
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

        {/* 主内容区域 - 根据步骤显示不同内容 */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {generationStep === 'idle' && (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-gray-400">
                    <div className="text-center">
                      <Wand2 className="mx-auto mb-3 h-10 w-10" />
                      <p className="text-sm font-medium">开始创建PPT</p>
                      <p className="mt-1 text-xs">
                        描述主题和要求，AI会为你规划大纲、设计布局
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          'flex',
                          message.role === 'user'
                            ? 'justify-end'
                            : 'justify-start'
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
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>
              <div className="border-t border-gray-200 bg-white p-4">
                <div className="relative">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        generateOutline();
                      }
                    }}
                    placeholder="直接描述你想要的PPT，AI会自动理解你的需求：&#10;&#10;例如：&#10;• 帮我做一个10页的AI发展历程PPT，用漫画风格&#10;• 基于 https://example.com/report 这篇文章做一个哆啦A梦风格的介绍&#10;• 做一份关于新能源汽车的商业报告，要专业一点，15页左右"
                    className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-4 pb-14 text-sm placeholder:text-gray-400 focus:border-orange-500 focus:outline-none"
                    rows={4}
                    disabled={isLoading}
                  />
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                      支持直接粘贴URL、指定风格、页数、配色等，AI会自动理解
                    </p>
                    <button
                      onClick={generateOutline}
                      disabled={!input.trim() || isLoading}
                      className="flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-600 disabled:bg-gray-300"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      <span>生成PPT</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {generationStep === 'outline' && (
            <OutlineEditor
              outline={outline}
              onUpdate={setOutline}
              onConfirm={confirmOutline}
              onRegenerate={generateOutline}
              isLoading={isLoading}
            />
          )}

          {generationStep === 'layout' && (
            <LayoutConfigurator
              layouts={layouts}
              onUpdate={setLayouts}
              onConfirm={generateContent}
              onBack={() => setGenerationStep('outline')}
              isLoading={isLoading}
            />
          )}

          {(generationStep === 'content' || generationStep === 'complete') && (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
              {generationStep === 'content' ? (
                <>
                  <Loader2 className="mb-4 h-10 w-10 animate-spin text-blue-600" />
                  <h3 className="text-base font-semibold text-gray-800">
                    正在生成PPT...
                  </h3>
                  <p className="mt-2 text-sm text-gray-500">
                    AI正在根据大纲和布局配置生成内容
                  </p>
                </>
              ) : (
                <>
                  <CheckCircle2 className="mb-4 h-10 w-10 text-green-500" />
                  <h3 className="text-base font-semibold text-gray-800">
                    PPT生成完成！
                  </h3>
                  <p className="mt-2 text-sm text-gray-500">
                    共 {slides.length} 页，可在右侧预览和编辑
                  </p>
                  <button
                    onClick={resetGeneration}
                    className="mt-4 flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                  >
                    <Plus className="h-4 w-4" />
                    <span>创建新PPT</span>
                  </button>
                </>
              )}
            </div>
          )}
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
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
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
                className="border-none bg-transparent text-sm font-medium text-gray-900 focus:outline-none"
                placeholder="未命名演示文稿"
              />
              <p className="text-xs text-gray-500">
                {content ? `${slides.length} 页幻灯片` : '等待生成...'}
              </p>
            </div>
          </div>
          <button className="flex items-center space-x-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            <Download className="h-4 w-4" />
            <span>导出</span>
          </button>
        </div>

        {/* PPT 内容区域 */}
        {!content ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <div className="mb-4 text-5xl">📊</div>
              <p className="mb-2 text-base font-medium text-gray-700">
                准备生成PPT
              </p>
              <p className="text-sm text-gray-500">在左侧描述你想要的PPT内容</p>
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
              <div className="p-2">
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
                <div className="flex space-x-2 overflow-x-auto pb-2">
                  {slides.map((slide, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'group relative w-32 flex-shrink-0 rounded-lg border-2 transition-all',
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
            <div className="flex flex-1 flex-col bg-gray-100 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  幻灯片 {currentSlideIndex + 1} / {slides.length}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setIsInlineEditMode(!isInlineEditMode);
                      if (!isInlineEditMode) setIsSourceEditMode(false);
                    }}
                    className={cn(
                      'flex items-center space-x-1 rounded-lg px-2 py-1.5 text-xs transition-all',
                      isInlineEditMode
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'border border-gray-300 hover:bg-white'
                    )}
                    title="双击幻灯片文字可直接编辑"
                  >
                    <Edit3 className="h-3 w-3" />
                    <span>编辑</span>
                  </button>
                  <button
                    onClick={() => {
                      if (isSourceEditMode) {
                        if (editingContent !== content && currentDocumentId) {
                          updateDocument(currentDocumentId, {
                            content: { markdown: editingContent },
                          } as any);
                        }
                      } else {
                        setEditingContent(content);
                      }
                      setIsSourceEditMode(!isSourceEditMode);
                      if (!isSourceEditMode) setIsInlineEditMode(false);
                    }}
                    className={cn(
                      'flex items-center space-x-1 rounded-lg px-2 py-1.5 text-xs transition-all',
                      isSourceEditMode
                        ? 'bg-orange-600 text-white hover:bg-orange-700'
                        : 'border border-gray-300 hover:bg-white'
                    )}
                    title="编辑 Markdown 源码"
                  >
                    {isSourceEditMode ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <FileText className="h-3 w-3" />
                    )}
                    <span>{isSourceEditMode ? '预览' : '源码'}</span>
                  </button>
                  <button
                    onClick={() =>
                      setCurrentSlideIndex(Math.max(0, currentSlideIndex - 1))
                    }
                    disabled={currentSlideIndex === 0}
                    className="flex items-center space-x-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-white disabled:opacity-50"
                  >
                    <ChevronLeft className="h-3 w-3" />
                    <span>上一页</span>
                  </button>
                  <button
                    onClick={() =>
                      setCurrentSlideIndex(
                        Math.min(slides.length - 1, currentSlideIndex + 1)
                      )
                    }
                    disabled={currentSlideIndex === slides.length - 1}
                    className="flex items-center space-x-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-white disabled:opacity-50"
                  >
                    <span>下一页</span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="flex flex-1 items-center justify-center">
                {isSourceEditMode ? (
                  <div className="flex h-full w-full max-w-4xl flex-col">
                    <div className="flex-1 rounded-xl bg-white p-4 shadow-xl">
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="h-full w-full resize-none rounded-lg border border-gray-200 p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="在此编辑幻灯片内容（Markdown格式）"
                      />
                    </div>
                  </div>
                ) : (
                  slides[currentSlideIndex] && (
                    <EditableSlideRenderer
                      slide={slides[currentSlideIndex]}
                      template={template}
                      isEditable={isInlineEditMode}
                      onSlideChange={(updatedSlide) =>
                        handleSlideChange(currentSlideIndex, updatedSlide)
                      }
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
