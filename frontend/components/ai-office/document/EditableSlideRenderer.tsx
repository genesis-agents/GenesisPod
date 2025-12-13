'use client';

/**
 * 可编辑幻灯片渲染器
 * 支持直接点击编辑幻灯片中的标题和内容
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils/common';
import type { EnhancedSlide } from '@/lib/ai-office/markdown-parser';
import { renderMarkdownLine } from '@/lib/ai-office/markdown-parser';
import type { PPTTemplate } from '@/lib/ai-office/ppt-templates';
import ChartRenderer from '../visualizations/ChartRenderer';
import FlowDiagram from '../visualizations/FlowDiagram';
import MatrixLayout from '../visualizations/MatrixLayout';
import { Edit3, Check, X } from 'lucide-react';

interface EditableSlideRendererProps {
  slide: EnhancedSlide & {
    backgroundImage?: string;
    contentImage?: string;
  };
  template: PPTTemplate;
  isEditable?: boolean;
  onTitleChange?: (newTitle: string) => void;
  onContentChange?: (index: number, newContent: string) => void;
  onSlideChange?: (updatedSlide: EnhancedSlide) => void;
}

// 可编辑文本组件
interface EditableTextProps {
  value: string;
  onChange: (newValue: string) => void;
  isEditable: boolean;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  multiline?: boolean;
  renderAsHtml?: boolean;
}

function EditableText({
  value,
  onChange,
  isEditable,
  className,
  style,
  placeholder = '点击编辑...',
  multiline = false,
  renderAsHtml = false,
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    if (isEditable) {
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    if (editValue !== value) {
      onChange(editValue);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="group relative inline-flex w-full items-center">
        {multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className={cn(
              'w-full resize-none rounded border-2 border-blue-500 bg-white/90 px-2 py-1 outline-none',
              className
            )}
            style={{
              ...style,
              minHeight: '60px',
            }}
            rows={3}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className={cn(
              'w-full rounded border-2 border-blue-500 bg-white/90 px-2 py-1 outline-none',
              className
            )}
            style={style}
          />
        )}
        <div className="absolute -right-16 top-1/2 flex -translate-y-1/2 gap-1">
          <button
            onClick={handleSave}
            className="rounded bg-green-500 p-1 text-white hover:bg-green-600"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={handleCancel}
            className="rounded bg-gray-400 p-1 text-white hover:bg-gray-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group relative cursor-text rounded transition-all',
        isEditable && 'hover:bg-white/10 hover:ring-2 hover:ring-blue-400/50',
        className
      )}
      style={style}
      onDoubleClick={handleDoubleClick}
      title={isEditable ? '双击编辑' : undefined}
    >
      {renderAsHtml ? (
        <span
          dangerouslySetInnerHTML={{
            __html: renderMarkdownLine(value || placeholder),
          }}
        />
      ) : (
        <span>{value || placeholder}</span>
      )}
      {isEditable && (
        <span className="absolute -right-6 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
          <Edit3 className="h-4 w-4 text-blue-400" />
        </span>
      )}
    </div>
  );
}

// 可编辑列表项组件
interface EditableListItemProps {
  value: string;
  index: number;
  onChange: (index: number, newValue: string) => void;
  onDelete?: (index: number) => void;
  isEditable: boolean;
  template: PPTTemplate;
  bulletColor: string;
}

function EditableListItem({
  value,
  index,
  onChange,
  onDelete,
  isEditable,
  template,
  bulletColor,
}: EditableListItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    if (isEditable) {
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    if (editValue !== value) {
      onChange(index, editValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-start space-x-3">
        <span
          className="mt-1 font-bold"
          style={{
            color: bulletColor,
            fontSize: `${template.typography.body + 4}px`,
          }}
        >
          •
        </span>
        <div className="flex flex-1 items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="flex-1 rounded border-2 border-blue-500 bg-white/90 px-2 py-1 text-gray-900 outline-none"
            style={{
              fontSize: `${template.typography.body}px`,
              fontFamily: template.fonts.body,
            }}
          />
          <button
            onClick={handleSave}
            className="rounded bg-green-500 p-1 text-white hover:bg-green-600"
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group flex items-start space-x-3 rounded transition-all',
        isEditable && 'cursor-text hover:bg-white/10'
      )}
      onDoubleClick={handleDoubleClick}
      title={isEditable ? '双击编辑' : undefined}
    >
      <span
        className="mt-1 font-bold"
        style={{
          color: bulletColor,
          fontSize: `${template.typography.body + 4}px`,
        }}
      >
        •
      </span>
      <p
        className="flex-1 leading-relaxed"
        style={{
          fontSize: `${template.typography.body}px`,
          color:
            template.style.layoutStyle === 'dark'
              ? template.colors.text
              : template.colors.text,
          fontFamily: template.fonts.body,
        }}
        dangerouslySetInnerHTML={{ __html: renderMarkdownLine(value) }}
      />
      {isEditable && (
        <span className="opacity-0 transition-opacity group-hover:opacity-100">
          <Edit3 className="h-4 w-4 text-blue-400" />
        </span>
      )}
    </div>
  );
}

export default function EditableSlideRenderer({
  slide,
  template,
  isEditable = false,
  onTitleChange,
  onContentChange,
  onSlideChange,
}: EditableSlideRendererProps) {
  const handleTitleChange = useCallback(
    (newTitle: string) => {
      if (onTitleChange) {
        onTitleChange(newTitle);
      }
      if (onSlideChange) {
        onSlideChange({ ...slide, title: newTitle });
      }
    },
    [slide, onTitleChange, onSlideChange]
  );

  const handleContentItemChange = useCallback(
    (index: number, newContent: string) => {
      if (onContentChange) {
        onContentChange(index, newContent);
      }
      if (onSlideChange) {
        const newContentArray = [...slide.content];
        // 保持原有的格式（如果是列表项，保持 - 前缀）
        const originalLine = slide.content[index];
        if (originalLine.trim().startsWith('-')) {
          newContentArray[index] = `- ${newContent}`;
        } else {
          newContentArray[index] = newContent;
        }
        onSlideChange({ ...slide, content: newContentArray });
      }
    },
    [slide, onContentChange, onSlideChange]
  );

  // 从 slide 中提取背景图片（可能来自后端PPT API）
  // images 可能是对象数组 [{url, position}] 或字符串数组
  const backgroundImageUrl =
    slide.backgroundImage ||
    (slide.images && slide.images.length > 0
      ? typeof slide.images[0] === 'string'
        ? slide.images[0]
        : (slide.images[0] as { url?: string; position?: string })?.url
      : null);

  return (
    <div
      className={cn(
        'relative w-full max-w-5xl overflow-hidden rounded-2xl shadow-2xl transition-all',
        isEditable && 'ring-2 ring-blue-500/30'
      )}
      style={{
        aspectRatio: '16/9',
        backgroundColor: template.colors.background,
        backgroundImage: backgroundImageUrl
          ? `url(${backgroundImageUrl})`
          : template.colors.backgroundOverlay
            ? template.colors.backgroundOverlay.startsWith('linear')
              ? template.colors.backgroundOverlay
              : `linear-gradient(135deg, ${template.colors.background}, ${template.colors.background})`
            : undefined,
        backgroundSize: backgroundImageUrl ? 'cover' : undefined,
        backgroundPosition: backgroundImageUrl ? 'center' : undefined,
      }}
    >
      {/* 背景图片遮罩（提高文字可读性） */}
      {backgroundImageUrl && (
        <div
          className="absolute inset-0 z-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 100%)',
          }}
        />
      )}

      {/* 编辑模式指示器 */}
      {isEditable && (
        <div className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-full bg-blue-500/90 px-3 py-1 text-xs font-medium text-white">
          <Edit3 className="h-3 w-3" />
          <span>编辑模式</span>
        </div>
      )}

      {/* 顶部装饰条 */}
      {template.decorations.showTopBar && (
        <div
          className="absolute left-0 right-0 top-0 h-2"
          style={{ backgroundColor: template.colors.decorative }}
        />
      )}

      {/* 底部装饰条 */}
      {template.decorations.showBottomBar && (
        <div
          className="absolute bottom-0 left-0 right-0 h-1.5"
          style={{ backgroundColor: template.colors.decorative }}
        />
      )}

      {/* 主内容区 */}
      <div className="relative z-10 flex h-full flex-col p-12">
        {/* 幻灯片标题 */}
        <div className="mb-6">
          <EditableText
            value={slide.title}
            onChange={handleTitleChange}
            isEditable={isEditable}
            className="mb-2 font-bold"
            style={{
              fontSize: `${template.typography.title}px`,
              color: backgroundImageUrl
                ? '#ffffff'
                : template.style.layoutStyle === 'dark'
                  ? template.colors.textLight
                  : template.colors.primary,
              fontFamily: template.fonts.heading,
              textShadow: backgroundImageUrl
                ? '0 2px 4px rgba(0,0,0,0.5)'
                : undefined,
            }}
            placeholder="点击输入标题..."
          />
          {/* 标题下划线 */}
          {template.decorations.showTitleUnderline && (
            <div
              className="h-1 rounded-full"
              style={{
                width: '80px',
                backgroundColor: template.colors.decorative,
              }}
            />
          )}
        </div>

        {/* 根据幻灯片类型渲染内容 */}
        <div className="flex-1 overflow-hidden">
          {renderEditableSlideContent(
            slide,
            template,
            isEditable,
            handleContentItemChange,
            !!backgroundImageUrl
          )}
        </div>
      </div>
    </div>
  );
}

function renderEditableSlideContent(
  slide: EnhancedSlide,
  template: PPTTemplate,
  isEditable: boolean,
  onContentChange: (index: number, newContent: string) => void,
  hasBackgroundImage: boolean = false
) {
  switch (slide.type) {
    case 'cover':
      return renderEditableCoverSlide(
        slide,
        template,
        isEditable,
        onContentChange,
        hasBackgroundImage
      );

    case 'flowchart':
      return renderFlowchartSlide(slide, template);

    case 'chart':
      return renderChartSlide(slide, template);

    case 'matrix':
      return renderMatrixSlide(slide, template);

    case 'comparison':
      return renderEditable2ColumnSlide(
        slide,
        template,
        isEditable,
        onContentChange,
        hasBackgroundImage
      );

    default:
      return renderEditableStandardSlide(
        slide,
        template,
        isEditable,
        onContentChange,
        hasBackgroundImage
      );
  }
}

// 可编辑封面页
function renderEditableCoverSlide(
  slide: EnhancedSlide,
  template: PPTTemplate,
  isEditable: boolean,
  onContentChange: (index: number, newContent: string) => void,
  hasBackgroundImage: boolean = false
) {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="w-full max-w-2xl text-center">
        {slide.content.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) return null;
          return (
            <EditableText
              key={idx}
              value={trimmed.replace(/^[-•]\s*/, '')}
              onChange={(newValue) => onContentChange(idx, newValue)}
              isEditable={isEditable}
              className="mb-2 block"
              style={{
                fontSize: `${template.typography.subtitle}px`,
                color: hasBackgroundImage
                  ? '#ffffff'
                  : template.style.layoutStyle === 'dark'
                    ? template.colors.textLight
                    : template.colors.textSecondary,
                fontFamily: template.fonts.body,
                textShadow: hasBackgroundImage
                  ? '0 2px 4px rgba(0,0,0,0.5)'
                  : undefined,
              }}
              renderAsHtml
            />
          );
        })}
      </div>
    </div>
  );
}

// 流程图页（保持原样，不可编辑）
function renderFlowchartSlide(slide: EnhancedSlide, template: PPTTemplate) {
  return (
    <div className="flex h-full items-center justify-center">
      {slide.flowSteps && slide.flowSteps.length > 0 ? (
        <FlowDiagram steps={slide.flowSteps} template={template} />
      ) : (
        <div className="text-gray-400">流程图数据为空</div>
      )}
    </div>
  );
}

// 图表页（保持原样，不可编辑）
function renderChartSlide(slide: EnhancedSlide, template: PPTTemplate) {
  return (
    <div className="h-full">
      {slide.chartData && slide.chartType ? (
        <div className="flex h-full flex-col">
          <div className="flex-1">
            <ChartRenderer
              data={slide.chartData}
              type={slide.chartType}
              template={template}
            />
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-gray-400">
          图表数据为空
        </div>
      )}
    </div>
  );
}

// 矩阵页（保持原样，不可编辑）
function renderMatrixSlide(slide: EnhancedSlide, template: PPTTemplate) {
  return (
    <div className="h-full">
      {slide.matrixItems && slide.matrixItems.length > 0 ? (
        <MatrixLayout items={slide.matrixItems} template={template} />
      ) : (
        <div className="flex h-full items-center justify-center text-gray-400">
          矩阵数据为空
        </div>
      )}
    </div>
  );
}

// 可编辑2列对比页
function renderEditable2ColumnSlide(
  slide: EnhancedSlide,
  template: PPTTemplate,
  isEditable: boolean,
  onContentChange: (index: number, newContent: string) => void,
  hasBackgroundImage: boolean = false
) {
  const columns: { line: string; originalIndex: number }[][] = [[], []];
  let currentColumn = 0;

  slide.content.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.match(/^\*\*.+\*\*[:：]/)) {
      if (currentColumn === 0 && columns[0].length > 0) {
        currentColumn = 1;
      }
    }
    columns[currentColumn].push({ line, originalIndex: idx });
  });

  return (
    <div className="grid h-full grid-cols-2 gap-8">
      {columns.map((columnItems, colIdx) => (
        <div key={colIdx} className="space-y-3">
          {columnItems.map(({ line, originalIndex }) => {
            const trimmed = line.trim();
            if (!trimmed) return null;

            const isBoldTitle = trimmed.match(/^\*\*(.+?)\*\*[:：]/);
            if (isBoldTitle) {
              return (
                <EditableText
                  key={originalIndex}
                  value={isBoldTitle[1]}
                  onChange={(newValue) =>
                    onContentChange(originalIndex, `**${newValue}**:`)
                  }
                  isEditable={isEditable}
                  className="mb-2 font-bold"
                  style={{
                    fontSize: `${template.typography.subtitle}px`,
                    color: hasBackgroundImage
                      ? '#ffffff'
                      : template.style.layoutStyle === 'dark'
                        ? template.colors.textLight
                        : template.colors.primary,
                    fontFamily: template.fonts.heading,
                    textShadow: hasBackgroundImage
                      ? '0 2px 4px rgba(0,0,0,0.5)'
                      : undefined,
                  }}
                />
              );
            }

            if (trimmed.startsWith('-')) {
              const text = trimmed.replace(/^[-•]\s*/, '');
              return (
                <EditableListItem
                  key={originalIndex}
                  value={text}
                  index={originalIndex}
                  onChange={onContentChange}
                  isEditable={isEditable}
                  template={template}
                  bulletColor={
                    hasBackgroundImage ? '#ffffff' : template.colors.decorative
                  }
                />
              );
            }

            return null;
          })}
        </div>
      ))}
    </div>
  );
}

// 可编辑标准内容页
function renderEditableStandardSlide(
  slide: EnhancedSlide,
  template: PPTTemplate,
  isEditable: boolean,
  onContentChange: (index: number, newContent: string) => void,
  hasBackgroundImage: boolean = false
) {
  const hasImages = slide.images && slide.images.length > 0;
  const layout = slide.layout || 'content';

  if (layout === 'image-full' && hasImages) {
    return (
      <div className="flex h-full items-center justify-center">
        <img
          src={slide.images![0]}
          alt="Slide visual"
          className="max-h-full max-w-full rounded-lg object-contain shadow-lg"
        />
      </div>
    );
  }

  if ((layout === 'image-left' || layout === 'image-right') && hasImages) {
    return (
      <div
        className={`grid h-full grid-cols-2 gap-8 ${layout === 'image-left' ? '' : 'grid-flow-dense'}`}
      >
        {layout === 'image-left' && (
          <div className="flex items-center justify-center">
            <img
              src={slide.images![0]}
              alt="Slide visual"
              className="max-h-full max-w-full rounded-lg object-contain shadow-lg"
            />
          </div>
        )}
        <div className="space-y-3 overflow-y-auto">
          {renderEditableContentList(
            slide.content,
            template,
            isEditable,
            onContentChange,
            hasBackgroundImage
          )}
        </div>
        {layout === 'image-right' && (
          <div className="flex items-center justify-center">
            <img
              src={slide.images![0]}
              alt="Slide visual"
              className="max-h-full max-w-full rounded-lg object-contain shadow-lg"
            />
          </div>
        )}
      </div>
    );
  }

  // 纯文本布局
  return (
    <div className="space-y-3 overflow-y-auto">
      {renderEditableContentList(
        slide.content,
        template,
        isEditable,
        onContentChange,
        hasBackgroundImage
      )}
    </div>
  );
}

function renderEditableContentList(
  content: string[],
  template: PPTTemplate,
  isEditable: boolean,
  onContentChange: (index: number, newContent: string) => void,
  hasBackgroundImage: boolean = false
) {
  return content.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('<!--')) return null;

    // 列表项
    if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
      const text = trimmed.replace(/^[-•]\s*/, '');
      return (
        <EditableListItem
          key={idx}
          value={text}
          index={idx}
          onChange={onContentChange}
          isEditable={isEditable}
          template={template}
          bulletColor={
            hasBackgroundImage ? '#ffffff' : template.colors.decorative
          }
        />
      );
    }

    // 数字列表
    if (trimmed.match(/^\d+\./)) {
      const text = trimmed.replace(/^\d+\.\s*/, '');
      const number = trimmed.match(/^(\d+)\./)?.[1] || '';
      return (
        <div
          key={idx}
          className={cn(
            'group flex items-start space-x-2 rounded transition-all',
            isEditable && 'cursor-text hover:bg-white/10'
          )}
        >
          <span
            className="font-medium"
            style={{
              color: hasBackgroundImage
                ? '#ffffff'
                : template.colors.decorative,
              fontSize: `${template.typography.body}px`,
              textShadow: hasBackgroundImage
                ? '0 1px 2px rgba(0,0,0,0.5)'
                : undefined,
            }}
          >
            {number}.
          </span>
          <EditableText
            value={text}
            onChange={(newValue) =>
              onContentChange(idx, `${number}. ${newValue}`)
            }
            isEditable={isEditable}
            className="flex-1 leading-relaxed"
            style={{
              fontSize: `${template.typography.body}px`,
              color: hasBackgroundImage
                ? '#ffffff'
                : template.style.layoutStyle === 'dark'
                  ? template.colors.text
                  : template.colors.text,
              fontFamily: template.fonts.body,
              textShadow: hasBackgroundImage
                ? '0 1px 2px rgba(0,0,0,0.5)'
                : undefined,
            }}
            renderAsHtml
          />
        </div>
      );
    }

    // 普通段落
    return (
      <EditableText
        key={idx}
        value={trimmed}
        onChange={(newValue) => onContentChange(idx, newValue)}
        isEditable={isEditable}
        className="leading-relaxed"
        style={{
          fontSize: `${template.typography.body}px`,
          color: hasBackgroundImage
            ? '#ffffff'
            : template.style.layoutStyle === 'dark'
              ? template.colors.text
              : template.colors.text,
          fontFamily: template.fonts.body,
          textShadow: hasBackgroundImage
            ? '0 1px 2px rgba(0,0,0,0.5)'
            : undefined,
        }}
        renderAsHtml
      />
    );
  });
}
