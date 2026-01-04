'use client';

/**
 * DesignThinkingCard - 设计思考卡片组件
 *
 * 以结构化的四步流程展示页面设计过程：
 * 1. Drafting - 草稿设计：风格、情绪、核心元素
 * 2. Layout - 布局优化：对齐、间距、图形位置
 * 3. Visuals - 视觉规划：颜色、装饰元素
 * 4. HTML - 代码生成：模板选择、技术方案
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Palette,
  Layout,
  Sparkles,
  Code,
  ChevronDown,
  ChevronRight,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type { PageDesign } from '@/types/slides';

interface DesignThinkingCardProps {
  design: PageDesign;
  pageNumber?: number;
  className?: string;
  defaultExpanded?: boolean;
}

interface StepConfig {
  id: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const STEP_CONFIGS: StepConfig[] = [
  {
    id: 'drafting',
    icon: Lightbulb,
    title: 'Step 1: Drafting',
    subtitle: '草稿设计',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  {
    id: 'layout',
    icon: Layout,
    title: 'Step 2: Layout',
    subtitle: '布局优化',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  {
    id: 'visuals',
    icon: Palette,
    title: 'Step 3: Visuals',
    subtitle: '视觉规划',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
  {
    id: 'html',
    icon: Code,
    title: 'Step 4: HTML',
    subtitle: '代码生成',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
];

/**
 * 单个步骤卡片
 */
function StepCard({
  config,
  content,
  stepNumber,
}: {
  config: StepConfig;
  content: React.ReactNode;
  stepNumber: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'rounded-lg border transition-all',
        config.borderColor,
        config.bgColor
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <div
          className={cn(
            'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
            config.bgColor,
            'border',
            config.borderColor
          )}
        >
          <span className={cn('text-xs font-bold', config.color)}>
            {stepNumber}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon className={cn('h-4 w-4', config.color)} />
            <span className={cn('text-sm font-medium', config.color)}>
              {config.title}
            </span>
            <span className="text-xs text-gray-500">{config.subtitle}</span>
          </div>
        </div>

        <ChevronDown
          className={cn(
            'h-4 w-4 text-gray-400 transition-transform',
            expanded ? 'rotate-180' : ''
          )}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 bg-white/50 px-3 pb-3 pt-2">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * 标签组件
 */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
      {children}
    </span>
  );
}

/**
 * 颜色展示
 */
function ColorSwatch({ color, label }: { color: string; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-4 w-4 rounded border border-gray-300"
        style={{ backgroundColor: color }}
        title={color}
      />
      {label && (
        <span className="font-mono text-xs text-gray-600">{color}</span>
      )}
    </div>
  );
}

/**
 * 信息行
 */
function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="min-w-[4rem] text-gray-500">{label}:</span>
      <span className="text-gray-700">{value}</span>
    </div>
  );
}

/**
 * 主组件
 */
export function DesignThinkingCard({
  design,
  pageNumber,
  className,
  defaultExpanded = true,
}: DesignThinkingCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!design) {
    return (
      <div className={cn('p-4 text-center text-sm text-gray-400', className)}>
        暂无设计思考数据
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* 页面标题 */}
      {pageNumber !== undefined && (
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-medium text-gray-700">
            第 {pageNumber} 页 · 设计思考
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600"
          >
            {expanded ? '收起' : '展开'}
          </button>
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-2 overflow-hidden"
          >
            {/* Step 1: Drafting */}
            <StepCard
              config={STEP_CONFIGS[0]}
              stepNumber={1}
              content={
                <div className="space-y-2">
                  <InfoRow label="风格" value={design.step1_drafting?.style} />
                  <InfoRow label="情绪" value={design.step1_drafting?.mood} />
                  {design.step1_drafting?.coreElements &&
                    design.step1_drafting.coreElements.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-sm text-gray-500">核心元素:</span>
                        <div className="flex flex-wrap gap-1">
                          {design.step1_drafting.coreElements.map((el, i) => (
                            <Tag key={i}>{el}</Tag>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              }
            />

            {/* Step 2: Layout */}
            <StepCard
              config={STEP_CONFIGS[1]}
              stepNumber={2}
              content={
                <div className="space-y-2">
                  <InfoRow
                    label="对齐"
                    value={design.step2_refiningLayout?.alignment}
                  />
                  <InfoRow
                    label="位置"
                    value={design.step2_refiningLayout?.graphicsPosition}
                  />
                  <InfoRow
                    label="间距"
                    value={design.step2_refiningLayout?.spacing}
                  />
                </div>
              }
            />

            {/* Step 3: Visuals */}
            <StepCard
              config={STEP_CONFIGS[2]}
              stepNumber={3}
              content={
                <div className="space-y-2">
                  {design.step3_planningVisuals?.backgroundColor && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">背景色:</span>
                      <ColorSwatch
                        color={design.step3_planningVisuals.backgroundColor}
                        label={design.step3_planningVisuals.backgroundColor}
                      />
                    </div>
                  )}
                  {design.step3_planningVisuals?.accentColors &&
                    design.step3_planningVisuals.accentColors.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-sm text-gray-500">强调色:</span>
                        <div className="flex gap-1">
                          {design.step3_planningVisuals.accentColors.map(
                            (color, i) => (
                              <ColorSwatch key={i} color={color} />
                            )
                          )}
                        </div>
                      </div>
                    )}
                  {design.step3_planningVisuals?.decorations &&
                    design.step3_planningVisuals.decorations.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-sm text-gray-500">装饰元素:</span>
                        <div className="flex flex-wrap gap-1">
                          {design.step3_planningVisuals.decorations.map(
                            (dec, i) => (
                              <Tag key={i}>{dec}</Tag>
                            )
                          )}
                        </div>
                      </div>
                    )}
                </div>
              }
            />

            {/* Step 4: HTML */}
            <StepCard
              config={STEP_CONFIGS[3]}
              stepNumber={4}
              content={
                <div className="space-y-2">
                  <InfoRow
                    label="模板"
                    value={design.step4_formulatingHTML?.templateUsed}
                  />
                  {design.step4_formulatingHTML?.sectionsCount && (
                    <InfoRow
                      label="区块数"
                      value={String(design.step4_formulatingHTML.sectionsCount)}
                    />
                  )}
                </div>
              }
            />

            {/* AI 推理过程 */}
            {design.rawResponse && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium text-gray-700">
                    AI 设计推理
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-600">
                  {design.rawResponse}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default DesignThinkingCard;
