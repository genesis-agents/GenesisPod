'use client';

/**
 * 增强型幻灯片渲染器
 * 根据幻灯片类型渲染不同的可视化组件
 */

import React from 'react';
import type { EnhancedSlide } from '@/lib/ai-office/markdown-parser';
import { renderMarkdownLine } from '@/lib/ai-office/markdown-parser';
import type { PPTTemplate } from '@/lib/ai-office/ppt-templates';
import ChartRenderer from '../visualizations/ChartRenderer';
import FlowDiagram from '../visualizations/FlowDiagram';
import MatrixLayout from '../visualizations/MatrixLayout';

interface EnhancedSlideRendererProps {
  slide: EnhancedSlide;
  template: PPTTemplate;
}

export default function EnhancedSlideRenderer({
  slide,
  template,
}: EnhancedSlideRendererProps) {
  return (
    <div
      className="relative w-full max-w-5xl overflow-hidden rounded-2xl shadow-2xl"
      style={{
        aspectRatio: '16/9',
        backgroundColor: template.colors.background,
        backgroundImage: template.colors.backgroundOverlay
          ? template.colors.backgroundOverlay.startsWith('linear')
            ? template.colors.backgroundOverlay
            : `linear-gradient(135deg, ${template.colors.background}, ${template.colors.background})`
          : undefined,
      }}
    >
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
          <h1
            className="mb-2 font-bold"
            style={{
              fontSize: `${template.typography.title}px`,
              color:
                template.style.layoutStyle === 'dark'
                  ? template.colors.textLight
                  : template.colors.primary,
              fontFamily: template.fonts.heading,
            }}
          >
            {slide.title}
          </h1>
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
          {renderSlideContent(slide, template)}
        </div>
      </div>
    </div>
  );
}

function renderSlideContent(slide: EnhancedSlide, template: PPTTemplate) {
  switch (slide.type) {
    case 'cover':
      return renderCoverSlide(slide, template);

    case 'flowchart':
      return renderFlowchartSlide(slide, template);

    case 'chart':
      return renderChartSlide(slide, template);

    case 'matrix':
      return renderMatrixSlide(slide, template);

    case 'comparison':
      return render2ColumnSlide(slide, template);

    default:
      return renderStandardSlide(slide, template);
  }
}

// 封面页
function renderCoverSlide(slide: EnhancedSlide, template: PPTTemplate) {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      {slide.images && slide.images.length > 0 && (
        <img
          src={slide.images[0]}
          alt="Cover"
          className="mb-8 max-h-48 rounded-lg shadow-lg"
        />
      )}
      <div className="text-center">
        {slide.content.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) return null;
          return (
            <p
              key={idx}
              className="mb-2"
              style={{
                fontSize: `${template.typography.subtitle}px`,
                color:
                  template.style.layoutStyle === 'dark'
                    ? template.colors.textLight
                    : template.colors.textSecondary,
                fontFamily: template.fonts.body,
              }}
              dangerouslySetInnerHTML={{ __html: renderMarkdownLine(trimmed) }}
            />
          );
        })}
      </div>
    </div>
  );
}

// 流程图页
function renderFlowchartSlide(slide: EnhancedSlide, template: PPTTemplate) {
  return (
    <div className="flex h-full items-center justify-center">
      {slide.flowSteps && slide.flowSteps.length > 0 ? (
        <FlowDiagram steps={slide.flowSteps} template={template} />
      ) : (
        renderStandardSlide(slide, template)
      )}
    </div>
  );
}

// 图表页
function renderChartSlide(slide: EnhancedSlide, template: PPTTemplate) {
  return (
    <div className="h-full">
      {slide.chartData && slide.chartType ? (
        <div className="flex h-full flex-col">
          {/* 如果有额外文本内容，显示在图表上方 */}
          {slide.content.length > 0 && (
            <div className="mb-4">
              {slide.content.slice(0, 2).map((line, idx) => {
                const trimmed = line.trim();
                if (
                  !trimmed ||
                  trimmed.startsWith('<!--') ||
                  trimmed.startsWith('-')
                )
                  return null;
                return (
                  <p
                    key={idx}
                    className="mb-1"
                    style={{
                      fontSize: `${template.typography.body - 1}px`,
                      color:
                        template.style.layoutStyle === 'dark'
                          ? template.colors.textLight
                          : template.colors.textSecondary,
                      fontFamily: template.fonts.body,
                    }}
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdownLine(trimmed),
                    }}
                  />
                );
              })}
            </div>
          )}
          <div className="flex-1">
            <ChartRenderer
              data={slide.chartData}
              type={slide.chartType}
              template={template}
            />
          </div>
        </div>
      ) : (
        renderStandardSlide(slide, template)
      )}
    </div>
  );
}

// 矩阵页
function renderMatrixSlide(slide: EnhancedSlide, template: PPTTemplate) {
  return (
    <div className="h-full">
      {slide.matrixItems && slide.matrixItems.length > 0 ? (
        <MatrixLayout items={slide.matrixItems} template={template} />
      ) : (
        renderStandardSlide(slide, template)
      )}
    </div>
  );
}

// 2列对比页
function render2ColumnSlide(slide: EnhancedSlide, template: PPTTemplate) {
  const columns: string[][] = [[], []];
  let currentColumn = 0;

  for (const line of slide.content) {
    const trimmed = line.trim();
    if (trimmed.match(/^\*\*.+\*\*[:：]/)) {
      // 新的列标题
      if (currentColumn === 0 && columns[0].length > 0) {
        currentColumn = 1;
      }
    }
    columns[currentColumn].push(line);
  }

  return (
    <div className="grid h-full grid-cols-2 gap-8">
      {columns.map((columnLines, colIdx) => (
        <div key={colIdx} className="space-y-3">
          {columnLines.map((line, idx) => {
            const trimmed = line.trim();
            if (!trimmed) return null;

            const isBoldTitle = trimmed.match(/^\*\*(.+?)\*\*[:：]/);
            if (isBoldTitle) {
              return (
                <h3
                  key={idx}
                  className="mb-2 font-bold"
                  style={{
                    fontSize: `${template.typography.subtitle}px`,
                    color:
                      template.style.layoutStyle === 'dark'
                        ? template.colors.textLight
                        : template.colors.primary,
                    fontFamily: template.fonts.heading,
                  }}
                >
                  {isBoldTitle[1]}
                </h3>
              );
            }

            if (trimmed.startsWith('-')) {
              const text = trimmed.replace(/^[-•]\s*/, '');
              return (
                <div key={idx} className="flex items-start space-x-2">
                  <span
                    className="mt-1"
                    style={{
                      color: template.colors.decorative,
                      fontSize: `${template.typography.body}px`,
                    }}
                  >
                    •
                  </span>
                  <p
                    className="flex-1"
                    style={{
                      fontSize: `${template.typography.body - 1}px`,
                      color:
                        template.style.layoutStyle === 'dark'
                          ? template.colors.text
                          : template.colors.text,
                      fontFamily: template.fonts.body,
                    }}
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdownLine(text),
                    }}
                  />
                </div>
              );
            }

            return null;
          })}
        </div>
      ))}
    </div>
  );
}

// 标准内容页
function renderStandardSlide(slide: EnhancedSlide, template: PPTTemplate) {
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
          {renderContentList(slide.content, template)}
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
      {renderContentList(slide.content, template)}
    </div>
  );
}

function renderContentList(content: string[], template: PPTTemplate) {
  return content.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('<!--')) return null;

    // 列表项
    if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
      const text = trimmed.replace(/^[-•]\s*/, '');
      return (
        <div key={idx} className="flex items-start space-x-3">
          <span
            className="mt-1 font-bold"
            style={{
              color: template.colors.decorative,
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
            dangerouslySetInnerHTML={{ __html: renderMarkdownLine(text) }}
          />
        </div>
      );
    }

    // 数字列表
    if (trimmed.match(/^\d+\./)) {
      return (
        <p
          key={idx}
          className="pl-6 leading-relaxed"
          style={{
            fontSize: `${template.typography.body}px`,
            color:
              template.style.layoutStyle === 'dark'
                ? template.colors.text
                : template.colors.text,
            fontFamily: template.fonts.body,
          }}
          dangerouslySetInnerHTML={{ __html: renderMarkdownLine(trimmed) }}
        />
      );
    }

    // 普通段落
    return (
      <p
        key={idx}
        className="leading-relaxed"
        style={{
          fontSize: `${template.typography.body}px`,
          color:
            template.style.layoutStyle === 'dark'
              ? template.colors.text
              : template.colors.text,
          fontFamily: template.fonts.body,
        }}
        dangerouslySetInnerHTML={{ __html: renderMarkdownLine(trimmed) }}
      />
    );
  });
}
