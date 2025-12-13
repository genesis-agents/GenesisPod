'use client';

/**
 * AI Slides 页面
 * Create Image 风格的 PPT 生成器
 * 分步流程：用户输入 → 大纲规划 → 布局配色 → 内容生成
 * 采用左右分栏布局：左侧资源+AI对话，右侧PPT预览
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Download,
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
  FileText,
  Layout,
  Palette,
  RefreshCw,
  CheckCircle2,
  Circle,
  Wand2,
} from 'lucide-react';
import Link from 'next/link';

import Sidebar from '@/components/layout/Sidebar';
import { useResourceStore, useDocumentStore } from '@/stores/aiOfficeStore';
import { cn } from '@/lib/utils/common';
import {
  parseMarkdownToEnhancedSlides,
  EnhancedSlide,
} from '@/lib/ai-office/markdown-parser';
import EditableSlideRenderer from '@/components/ai-office/document/EditableSlideRenderer';
import { getTemplateById, PPTTemplate } from '@/lib/ai-office/ppt-templates';

// ============================================
// 类型定义
// ============================================
interface Resource {
  _id: string;
  resourceType: string;
  metadata?: {
    title?: string;
  };
  status: string;
}

// 生成步骤
type GenerationStep = 'idle' | 'outline' | 'layout' | 'content' | 'complete';

// 大纲项
interface OutlineItem {
  slideNumber: number;
  title: string;
  points: string[];
  layoutSuggestion?: string;
}

// 布局配置
interface LayoutConfig {
  slideNumber: number;
  layoutType: 'title' | 'content' | 'twoColumn' | 'chart' | 'image' | 'summary';
  colorScheme: string;
  visualElements?: string[];
}

// ============================================
// 资源列表组件
// ============================================
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

// ============================================
// 步骤指示器组件
// ============================================
function StepIndicator({
  currentStep,
  onStepClick,
}: {
  currentStep: GenerationStep;
  onStepClick?: (step: GenerationStep) => void;
}) {
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
        const Icon = step.icon;

        return (
          <React.Fragment key={step.id}>
            <button
              onClick={() => onStepClick?.(step.id)}
              disabled={status === 'pending'}
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all',
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
            </button>
            {index < steps.length - 1 && (
              <ChevronRight className="h-4 w-4 text-gray-300" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ============================================
// 大纲编辑器组件
// ============================================
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
                className="rounded-lg border border-gray-200 bg-white p-4 transition-all hover:shadow-sm"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
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
                </div>
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
              </div>
            ))}
            <button
              onClick={() => {
                const newOutline = [...outline];
                newOutline.push({
                  slideNumber: outline.length + 1,
                  title: '',
                  points: [''],
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

// ============================================
// 布局配置组件
// ============================================
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

                {/* 布局类型选择 */}
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

                {/* 配色方案选择 */}
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
  const [leftPanelWidth, setLeftPanelWidth] = useState(480);
  const [isDragging, setIsDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState('professional');

  // 生成流程状态
  const [generationStep, setGenerationStep] = useState<GenerationStep>('idle');
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [layouts, setLayouts] = useState<LayoutConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // PPT 预览状态
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [thumbnailsCollapsed, setThumbnailsCollapsed] = useState(false);
  const [isInlineEditMode, setIsInlineEditMode] = useState(false); // 内联编辑模式
  const [isSourceEditMode, setIsSourceEditMode] = useState(false); // 源码编辑模式
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
  }, [messages]);

  // 拖拽调整左侧面板宽度
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      const constrainedWidth = Math.max(400, Math.min(650, newWidth));
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

  // 第一步：生成大纲
  const generateOutline = async () => {
    if (!input.trim()) return;

    const userInput = input;
    setInput('');
    setIsLoading(true);
    setGenerationStep('outline');

    // 添加用户消息
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
      const selectedResources = resources.filter((r) =>
        selectedResourceIds.includes(r._id)
      );

      // 调用API生成大纲
      const response = await fetch('/api/ai-office/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `请为以下主题生成一份PPT大纲，输出JSON格式：
主题：${userInput}

要求：
1. 生成8-15页的PPT大纲
2. 每页包含标题和3-5个要点
3. 包含封面页和总结页
4. 输出格式为JSON数组，每项包含 slideNumber, title, points

只输出JSON，不要其他文字。`,
          resources: selectedResources,
          stream: false,
        }),
      });

      const data = await response.json();

      // 解析大纲
      try {
        const outlineData = JSON.parse(data.content || data.message || '[]');
        setOutline(outlineData);
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `已生成 ${outlineData.length} 页的PPT大纲，请在右侧查看和编辑。`,
            timestamp: new Date(),
          },
        ]);
      } catch {
        // 如果JSON解析失败，生成默认大纲
        const defaultOutline: OutlineItem[] = [
          {
            slideNumber: 1,
            title: userInput,
            points: ['核心观点', '价值主张'],
          },
          {
            slideNumber: 2,
            title: '背景介绍',
            points: ['行业现状', '发展趋势', '市场机会'],
          },
          {
            slideNumber: 3,
            title: '核心内容',
            points: ['要点一', '要点二', '要点三'],
          },
          {
            slideNumber: 4,
            title: '详细分析',
            points: ['数据支撑', '案例说明', '深入解读'],
          },
          {
            slideNumber: 5,
            title: '总结展望',
            points: ['核心结论', '行动建议', '未来展望'],
          },
        ];
        setOutline(defaultOutline);
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `已生成基础大纲，请在右侧编辑调整。`,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (error) {
      console.error('Generate outline error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '抱歉，生成大纲时出错，请重试。',
          timestamp: new Date(),
        },
      ]);
      setGenerationStep('idle');
    } finally {
      setIsLoading(false);
    }
  };

  // 第二步：确认大纲，进入布局配置
  const confirmOutline = () => {
    setGenerationStep('layout');

    // 根据大纲生成默认布局配置
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

  // 第三步：生成最终PPT内容
  const generateContent = async () => {
    setIsLoading(true);
    setGenerationStep('content');

    // 创建文档
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
      content: { markdown: '' },
      metadata: { wordCount: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    addDocument(newDocument as any);
    setCurrentDocument(newDocumentId);

    try {
      // 构建详细的prompt
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
          message: `请根据以下大纲和布局配置生成完整的PPT内容。

【大纲】
${outlineText}

【布局配置】
${layoutText}

【输出格式要求】
请严格按照以下Markdown格式输出：

### Slide 1: [标题]
- 内容要点

---

### Slide 2: [标题]
- 内容要点

---

注意：
1. 每页以 "### Slide X: " 开头
2. 使用 "---" 分隔
3. 内容丰富详实，每页3-5个要点
4. 对于图表页，添加 <!-- CHART:type --> 标记
5. 直接输出，不要添加说明`,
          resources: resources.filter((r) =>
            selectedResourceIds.includes(r._id)
          ),
          documentId: newDocumentId,
          stream: true,
          isDocumentGeneration: true,
        }),
      });

      if (!response.ok) throw new Error('AI service request failed');

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
                  updateDocument(newDocumentId, {
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

      // 完成
      const slideCount = aiContent.split('---').filter((s) => s.trim()).length;
      updateDocument(newDocumentId, {
        status: 'completed',
        updatedAt: new Date(),
      } as any);

      setGenerationStep('complete');
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: `PPT生成完成！共 ${slideCount} 页。您可以在右侧预览和编辑。`,
          timestamp: new Date(),
        },
      ]);
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
    } finally {
      setIsLoading(false);
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
  };

  // 处理幻灯片内联编辑更新
  const handleSlideChange = useCallback(
    (slideIndex: number, updatedSlide: EnhancedSlide) => {
      if (!currentDocumentId || !content) return;

      // 将更新后的幻灯片转换回markdown格式
      const slidesSections = content.split(/(?=### Slide \d+:)/);
      const newSections = slidesSections.map((section: string, idx: number) => {
        if (idx === slideIndex) {
          // 重建这个幻灯片的markdown
          let newMarkdown = `### Slide ${slideIndex + 1}: ${updatedSlide.title}\n`;
          updatedSlide.content.forEach((line) => {
            if (line.trim()) {
              newMarkdown += `${line}\n`;
            }
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
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* 左侧面板：资源 + 生成流程 */}
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
                <h1 className="font-semibold">AI Slides</h1>
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
                  <RefreshCw className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={cn(
                  'rounded-lg p-2 transition-colors',
                  showSettings
                    ? 'bg-blue-100 text-blue-600'
                    : 'hover:bg-gray-100'
                )}
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* 步骤指示器 */}
          {generationStep !== 'idle' && (
            <div className="border-b border-gray-200 bg-gray-50">
              <StepIndicator currentStep={generationStep} />
            </div>
          )}

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
              resourceListCollapsed ? 'h-12' : 'h-48'
            )}
          >
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-semibold text-gray-700">
                  已选资源
                </h3>
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
              <div className="flex h-[calc(100%-44px)] flex-col overflow-hidden">
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
                    <div className="py-4 text-center">
                      <Plus className="mx-auto h-8 w-8 text-gray-400" />
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
              /* 初始状态：AI对话输入 */
              <>
                <div className="flex items-center space-x-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 shadow-sm">
                    <Sparkles className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-800">
                      AI 智能助手
                    </h3>
                    <p className="text-xs text-gray-500">
                      描述你想要的PPT，我来帮你规划
                    </p>
                  </div>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-gray-400">
                      <div className="text-center">
                        <Wand2 className="mx-auto mb-3 h-12 w-12" />
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
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          generateOutline();
                        }
                      }}
                      placeholder="描述PPT主题，如：为AI产品发布会创建一份商业提案..."
                      className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 pb-12 pr-28 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                      rows={3}
                      disabled={isLoading}
                    />
                    <div className="absolute bottom-3 right-3 flex items-center space-x-2">
                      <button
                        className="rounded-lg p-2 hover:bg-gray-100"
                        title="附加资源"
                      >
                        <Paperclip className="h-5 w-5 text-gray-500" />
                      </button>
                      <button
                        onClick={generateOutline}
                        disabled={!input.trim() || isLoading}
                        className="flex items-center space-x-1.5 rounded-lg bg-blue-600 px-4 py-2 text-white disabled:bg-gray-300"
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        <span>开始</span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {generationStep === 'outline' && (
              /* 大纲编辑器 */
              <OutlineEditor
                outline={outline}
                onUpdate={setOutline}
                onConfirm={confirmOutline}
                onRegenerate={generateOutline}
                isLoading={isLoading}
              />
            )}

            {generationStep === 'layout' && (
              /* 布局配置器 */
              <LayoutConfigurator
                layouts={layouts}
                onUpdate={setLayouts}
                onConfirm={generateContent}
                onBack={() => setGenerationStep('outline')}
                isLoading={isLoading}
              />
            )}

            {(generationStep === 'content' ||
              generationStep === 'complete') && (
              /* 生成中/完成状态 */
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                {generationStep === 'content' ? (
                  <>
                    <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-600" />
                    <h3 className="text-lg font-semibold text-gray-800">
                      正在生成PPT...
                    </h3>
                    <p className="mt-2 text-sm text-gray-500">
                      AI正在根据大纲和布局配置生成内容
                    </p>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mb-4 h-12 w-12 text-green-500" />
                    <h3 className="text-lg font-semibold text-gray-800">
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
              <button className="flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                <Download className="h-4 w-4" />
                <span>导出</span>
              </button>
            </div>
          </div>

          {/* PPT 内容区域 */}
          {!content ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <div className="mb-4 text-6xl">📊</div>
                <p className="mb-2 text-lg font-medium text-gray-700">
                  准备生成PPT
                </p>
                <p className="text-sm text-gray-500">
                  在左侧描述你想要的PPT内容
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
                      onClick={() =>
                        setThumbnailsCollapsed(!thumbnailsCollapsed)
                      }
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
                <div className="mb-6 flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    幻灯片 {currentSlideIndex + 1} / {slides.length}
                  </div>
                  <div className="flex items-center space-x-2">
                    {/* 内联编辑模式切换 */}
                    <button
                      onClick={() => {
                        setIsInlineEditMode(!isInlineEditMode);
                        if (!isInlineEditMode) {
                          setIsSourceEditMode(false);
                        }
                      }}
                      className={cn(
                        'flex items-center space-x-1 rounded-lg px-3 py-2 text-sm transition-all',
                        isInlineEditMode
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'border border-gray-300 hover:bg-white'
                      )}
                      title="双击幻灯片文字可直接编辑"
                    >
                      <Edit3 className="h-4 w-4" />
                      <span>内联编辑</span>
                    </button>

                    {/* 源码编辑模式切换 */}
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
                        if (!isSourceEditMode) {
                          setIsInlineEditMode(false);
                        }
                      }}
                      className={cn(
                        'flex items-center space-x-1 rounded-lg px-3 py-2 text-sm transition-all',
                        isSourceEditMode
                          ? 'bg-orange-600 text-white hover:bg-orange-700'
                          : 'border border-gray-300 hover:bg-white'
                      )}
                      title="编辑 Markdown 源码"
                    >
                      {isSourceEditMode ? (
                        <>
                          <Eye className="h-4 w-4" />
                          <span>预览</span>
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4" />
                          <span>源码</span>
                        </>
                      )}
                    </button>

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

                <div className="flex flex-1 items-center justify-center">
                  {isSourceEditMode ? (
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
    </div>
  );
}
