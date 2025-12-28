'use client';

/**
 * TemplatePicker Component
 *
 * PPT 模板选择器组件
 *
 * 功能：
 * 1. 显示 12 种专业模板的网格视图
 * 2. 模板卡片显示名称、描述、缩略图预览
 * 3. 支持为单页推荐模板（显示匹配分数）
 * 4. 点击模板应用到当前页面
 * 5. 支持智能匹配模式（根据内容自动推荐）
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Check, Sparkles, Layout, Star } from 'lucide-react';
import {
  Badge,
  Card,
  Grid,
  Group,
  Stack,
  Text,
  Title,
  Tooltip,
  ActionIcon,
} from '@mantine/core';

// ============================================
// 类型定义
// ============================================

/**
 * 幻灯片模板
 */
interface SlideTemplate {
  key: string;
  name: string;
  nameZh: string;
  purpose: string[];
  contentTypes: string[];
  layout: {
    type: string;
    showBrand?: boolean;
    showPageRefs?: boolean;
  };
  defaultStyle: {
    backgroundType?: string;
    emphasisLevel?: string;
  };
  description?: string;
}

/**
 * 模板推荐结果
 */
interface TemplateSuggestion {
  template: SlideTemplate;
  score: number;
  reason: string;
}

/**
 * 组件 Props
 */
interface TemplatePickerProps {
  /** PPT 文档 ID */
  pptId?: string;
  /** 幻灯片索引 (用于单页推荐) */
  slideIndex?: number;
  /** 当前选中的模板 */
  selectedTemplateKey?: string;
  /** 模板应用回调 */
  onApplyTemplate: (template: SlideTemplate) => void;
  /** 是否启用智能推荐模式 */
  enableSmartMatch?: boolean;
  /** 自定义类名 */
  className?: string;
}

// ============================================
// 模板缩略图组件
// ============================================

/**
 * 根据模板类型生成预览缩略图
 */
const TemplatePreview: React.FC<{ template: SlideTemplate }> = ({
  template,
}) => {
  // 根据 layout.type 渲染不同的预览布局
  const renderPreview = () => {
    switch (template.layout.type) {
      case 'center':
        return (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4">
            <div className="text-center">
              <div className="mb-2 h-2 w-16 rounded bg-white/90" />
              <div className="h-1 w-12 rounded bg-white/70" />
            </div>
          </div>
        );

      case 'two_column':
        return (
          <div className="grid h-full grid-cols-2 gap-2 bg-white p-3">
            <div className="space-y-1 rounded border border-gray-200 bg-blue-50 p-2">
              <div className="h-1 w-full rounded bg-blue-400" />
              <div className="h-1 w-3/4 rounded bg-blue-300" />
              <div className="h-1 w-2/3 rounded bg-blue-300" />
            </div>
            <div className="space-y-1 rounded border border-gray-200 bg-purple-50 p-2">
              <div className="h-1 w-full rounded bg-purple-400" />
              <div className="h-1 w-3/4 rounded bg-purple-300" />
              <div className="h-1 w-2/3 rounded bg-purple-300" />
            </div>
          </div>
        );

      case 'three_column':
        return (
          <div className="grid h-full grid-cols-3 gap-1 bg-white p-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-1 rounded bg-gray-100 p-1.5">
                <div className="h-1 w-full rounded bg-blue-500" />
                <div className="h-1 w-3/4 rounded bg-gray-400" />
                <div className="h-1 w-2/3 rounded bg-gray-400" />
              </div>
            ))}
          </div>
        );

      case 'five_column':
        return (
          <div className="flex h-full items-center justify-center bg-white p-2">
            <div className="relative h-16 w-16">
              {[...Array(5)].map((_, i) => {
                const angle = (i * 72 - 90) * (Math.PI / 180);
                const x = Math.cos(angle) * 24 + 24;
                const y = Math.sin(angle) * 24 + 24;
                return (
                  <div
                    key={i}
                    className="absolute h-3 w-3 rounded-full bg-blue-500"
                    style={{ left: `${x}px`, top: `${y}px` }}
                  />
                );
              })}
            </div>
          </div>
        );

      case 'cards':
        return (
          <div className="grid h-full grid-cols-3 gap-1.5 bg-gray-50 p-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded bg-white p-1.5 shadow-sm">
                <div className="mb-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
                <div className="h-1 w-full rounded bg-gray-300" />
                <div className="mt-0.5 h-1 w-3/4 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        );

      case 'metrics':
        return (
          <div className="grid h-full grid-cols-4 gap-1 bg-white p-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="text-center">
                <div className="mb-1 text-xs font-bold text-blue-600">89%</div>
                <div className="h-0.5 w-full rounded bg-gray-300" />
              </div>
            ))}
          </div>
        );

      case 'timeline':
        return (
          <div className="flex h-full items-center bg-white p-2">
            <div className="flex w-full items-center justify-between">
              {[...Array(4)].map((_, i) => (
                <React.Fragment key={i}>
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  {i < 3 && <div className="h-0.5 flex-1 bg-gray-300" />}
                </React.Fragment>
              ))}
            </div>
          </div>
        );

      case 'phases':
        return (
          <div className="flex h-full items-center gap-1 bg-gradient-to-r from-blue-50 to-purple-50 p-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex-1 rounded bg-blue-500/80 p-1">
                <div className="h-1 w-full rounded bg-white/90" />
              </div>
            ))}
          </div>
        );

      case 'single_column':
      default:
        return (
          <div className="bg-white p-3">
            <div className="mb-2 h-1.5 w-2/3 rounded bg-gray-800" />
            <div className="space-y-1">
              <div className="flex items-start gap-1">
                <div className="mt-1 h-0.5 w-0.5 rounded-full bg-blue-500" />
                <div className="h-1 flex-1 rounded bg-gray-400" />
              </div>
              <div className="flex items-start gap-1">
                <div className="mt-1 h-0.5 w-0.5 rounded-full bg-blue-500" />
                <div className="h-1 flex-1 rounded bg-gray-400" />
              </div>
              <div className="flex items-start gap-1">
                <div className="mt-1 h-0.5 w-0.5 rounded-full bg-blue-500" />
                <div className="h-1 flex-1 rounded bg-gray-400" />
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50 shadow-sm">
      {renderPreview()}
    </div>
  );
};

// ============================================
// 主组件
// ============================================

export const TemplatePicker: React.FC<TemplatePickerProps> = ({
  pptId,
  slideIndex,
  selectedTemplateKey,
  onApplyTemplate,
  enableSmartMatch = false,
  className = '',
}) => {
  // ============================================
  // 状态管理
  // ============================================

  const [templates, setTemplates] = useState<SlideTemplate[]>([]);
  const [suggestions, setSuggestions] = useState<TemplateSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================
  // 数据加载
  // ============================================

  /**
   * 获取所有模板
   */
  const fetchAllTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ai-office/slides/templates/all');
      if (!response.ok) {
        throw new Error('获取模板列表失败');
      }

      const data = await response.json();
      setTemplates(data);
    } catch (err: any) {
      setError(err.message || '加载失败');
      console.error('[TemplatePicker] Failed to fetch templates:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 获取单页推荐模板
   */
  const fetchSuggestions = useCallback(async () => {
    if (!pptId || slideIndex === undefined) {
      return;
    }

    setSuggestionsLoading(true);

    try {
      const response = await fetch(
        `/api/ai-office/slides/${pptId}/slides/${slideIndex}/suggest-templates`,
        { method: 'POST' }
      );

      if (!response.ok) {
        throw new Error('获取推荐模板失败');
      }

      const data = await response.json();
      if (data.success && data.suggestions) {
        setSuggestions(data.suggestions);
      }
    } catch (err: any) {
      console.error('[TemplatePicker] Failed to fetch suggestions:', err);
      // 推荐失败不阻塞主流程，仅显示所有模板
    } finally {
      setSuggestionsLoading(false);
    }
  }, [pptId, slideIndex]);

  /**
   * 初始化加载
   */
  useEffect(() => {
    fetchAllTemplates();
  }, [fetchAllTemplates]);

  /**
   * 当启用智能推荐且有 pptId 和 slideIndex 时，加载推荐
   */
  useEffect(() => {
    if (enableSmartMatch && pptId && slideIndex !== undefined) {
      fetchSuggestions();
    }
  }, [enableSmartMatch, pptId, slideIndex, fetchSuggestions]);

  // ============================================
  // 事件处理
  // ============================================

  /**
   * 点击模板卡片
   */
  const handleTemplateClick = useCallback(
    (template: SlideTemplate) => {
      onApplyTemplate(template);
    },
    [onApplyTemplate]
  );

  // ============================================
  // 辅助函数
  // ============================================

  /**
   * 获取模板的匹配分数（如果在推荐列表中）
   */
  const getTemplateScore = useCallback(
    (templateKey: string): number | null => {
      const suggestion = suggestions.find(
        (s) => s.template.key === templateKey
      );
      return suggestion ? suggestion.score : null;
    },
    [suggestions]
  );

  /**
   * 获取模板的推荐原因
   */
  const getTemplateReason = useCallback(
    (templateKey: string): string | null => {
      const suggestion = suggestions.find(
        (s) => s.template.key === templateKey
      );
      return suggestion ? suggestion.reason : null;
    },
    [suggestions]
  );

  /**
   * 模板是否为推荐
   */
  const isRecommended = useCallback(
    (templateKey: string): boolean => {
      return suggestions.some((s) => s.template.key === templateKey);
    },
    [suggestions]
  );

  // ============================================
  // 渲染
  // ============================================

  // 加载状态
  if (loading) {
    return (
      <div className={`flex items-center justify-center p-12 ${className}`}>
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-500" />
          <Text size="sm" c="dimmed" mt="md">
            加载模板中...
          </Text>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div
        className={`rounded-lg border border-red-200 bg-red-50 p-6 ${className}`}
      >
        <Text size="sm" c="red">
          {error}
        </Text>
        <button
          onClick={fetchAllTemplates}
          className="mt-3 text-sm text-blue-600 hover:underline"
        >
          重试
        </button>
      </div>
    );
  }

  // 空状态
  if (templates.length === 0) {
    return (
      <div className={`p-12 text-center ${className}`}>
        <Text size="sm" c="dimmed">
          暂无可用模板
        </Text>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* 标题栏 */}
      <Group justify="space-between" mb="lg">
        <Group gap="xs">
          <Layout className="h-5 w-5 text-gray-700" />
          <Title order={4} fw={600}>
            选择模板
          </Title>
          {suggestionsLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          )}
        </Group>
        {suggestions.length > 0 && (
          <Badge
            leftSection={<Sparkles className="h-3 w-3" />}
            variant="light"
            color="blue"
          >
            {suggestions.length} 个推荐
          </Badge>
        )}
      </Group>

      {/* 模板网格 */}
      <Grid gutter="md">
        {templates.map((template) => {
          const score = getTemplateScore(template.key);
          const reason = getTemplateReason(template.key);
          const recommended = isRecommended(template.key);
          const selected = selectedTemplateKey === template.key;

          return (
            <Grid.Col
              key={template.key}
              span={{ base: 12, sm: 6, md: 4, lg: 3 }}
            >
              <Card
                shadow="sm"
                padding="md"
                radius="md"
                withBorder
                className={`
                  cursor-pointer transition-all duration-200 hover:shadow-md
                  ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
                  ${recommended ? 'border-blue-300' : ''}
                `}
                onClick={() => handleTemplateClick(template)}
              >
                <Card.Section>
                  {/* 缩略图预览 */}
                  <div className="relative">
                    <TemplatePreview template={template} />

                    {/* 选中标记 */}
                    {selected && (
                      <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white shadow-md">
                        <Check className="h-4 w-4" />
                      </div>
                    )}

                    {/* 推荐标记 */}
                    {recommended && (
                      <div className="absolute left-2 top-2">
                        <Tooltip label={reason || '推荐模板'} position="right">
                          <Badge
                            size="sm"
                            variant="filled"
                            color="blue"
                            leftSection={<Star className="h-3 w-3" />}
                          >
                            {score}%
                          </Badge>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                </Card.Section>

                <Stack gap="xs" mt="md">
                  {/* 模板名称 */}
                  <Group justify="space-between" gap="xs">
                    <Text fw={600} size="sm" lineClamp={1}>
                      {template.nameZh}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {template.name}
                    </Text>
                  </Group>

                  {/* 模板描述 */}
                  {template.description && (
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {template.description}
                    </Text>
                  )}

                  {/* 用途标签 */}
                  <Group gap={4} mt="xs">
                    {template.purpose.slice(0, 2).map((purpose) => (
                      <Badge
                        key={purpose}
                        size="xs"
                        variant="light"
                        color="gray"
                      >
                        {purpose}
                      </Badge>
                    ))}
                  </Group>
                </Stack>
              </Card>
            </Grid.Col>
          );
        })}
      </Grid>

      {/* 底部说明 */}
      {suggestions.length > 0 && (
        <Text size="xs" c="dimmed" mt="lg" ta="center">
          <Star className="inline h-3 w-3 text-blue-500" />
          推荐模板根据当前页面内容智能匹配，分数越高越适合
        </Text>
      )}
    </div>
  );
};

export default TemplatePicker;
