'use client';

/**
 * QualityReportPanel - PPT 质量检查报告面板
 *
 * 功能：
 * 1. 显示 PPT 质量分数（0-100）
 * 2. 列出所有问题（重复内容、布局溢出、内容稀疏/密集等）
 * 3. 显示优化建议列表
 * 4. 支持一键自动修复（autoFixable 的建议）
 * 5. 问题可点击跳转到对应页面
 */

import React, { useState, useCallback } from 'react';
import {
  RingProgress,
  Badge,
  Accordion,
  Button,
  Card,
  Text,
  Group,
  Stack,
  Divider,
  ThemeIcon,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Wand2,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useApiGet, useApiPost } from '@/hooks/core';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';

// ==================== 类型定义 ====================

interface QualityIssue {
  id: string;
  type:
    | 'duplicate'
    | 'layout_overflow'
    | 'content_sparse'
    | 'content_dense'
    | 'inconsistency';
  severity: 'error' | 'warning' | 'info';
  pages: number[];
  description: string;
  details?: Record<string, unknown>;
}

interface Suggestion {
  id: string;
  issueId: string;
  action:
    | 'merge'
    | 'split'
    | 'adjust_layout'
    | 'add_content'
    | 'remove_content'
    | 'unify_style';
  description: string;
  autoFixable: boolean;
  priority: 'high' | 'medium' | 'low';
}

interface QualityReport {
  documentId: string;
  checkedAt: Date;
  score: number;
  issues: QualityIssue[];
  suggestions: Suggestion[];
}

// ==================== 配置 ====================

const SEVERITY_CONFIG = {
  error: {
    color: 'red',
    icon: AlertCircle,
    label: '错误',
    bgColor: 'rgb(254, 226, 226)',
    textColor: 'rgb(153, 27, 27)',
  },
  warning: {
    color: 'yellow',
    icon: AlertTriangle,
    label: '警告',
    bgColor: 'rgb(254, 249, 195)',
    textColor: 'rgb(113, 63, 18)',
  },
  info: {
    color: 'blue',
    icon: Info,
    label: '提示',
    bgColor: 'rgb(219, 234, 254)',
    textColor: 'rgb(30, 58, 138)',
  },
} as const;

const ISSUE_TYPE_LABELS = {
  duplicate: '重复内容',
  layout_overflow: '布局溢出',
  content_sparse: '内容稀疏',
  content_dense: '内容密集',
  inconsistency: '样式不一致',
} as const;

const ACTION_LABELS = {
  merge: '合并页面',
  split: '拆分页面',
  adjust_layout: '调整布局',
  add_content: '添加内容',
  remove_content: '精简内容',
  unify_style: '统一样式',
} as const;

const PRIORITY_CONFIG = {
  high: { color: 'red', label: '高' },
  medium: { color: 'orange', label: '中' },
  low: { color: 'gray', label: '低' },
} as const;

// ==================== 子组件 ====================

/**
 * 质量分数环形进度条
 */
const QualityScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'green';
    if (score >= 60) return 'yellow';
    return 'red';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return '优秀';
    if (score >= 80) return '良好';
    if (score >= 60) return '一般';
    return '需要改进';
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack align="center" gap="md">
        <Text size="lg" fw={600}>
          质量评分
        </Text>
        <RingProgress
          size={180}
          thickness={16}
          roundCaps
          sections={[{ value: score, color: getScoreColor(score) }]}
          label={
            <div style={{ textAlign: 'center' }}>
              <Text size="xl" fw={700} style={{ fontSize: '2.5rem' }}>
                {score}
              </Text>
              <Text size="sm" c="dimmed">
                {getScoreLabel(score)}
              </Text>
            </div>
          }
        />
      </Stack>
    </Card>
  );
};

/**
 * 问题列表项
 */
const IssueItem: React.FC<{
  issue: QualityIssue;
  onJumpToPage?: (page: number) => void;
}> = ({ issue, onJumpToPage }) => {
  const config = SEVERITY_CONFIG[issue.severity];
  const Icon = config.icon;

  return (
    <Card
      padding="md"
      radius="md"
      withBorder
      style={{
        borderLeft: `4px solid var(--mantine-color-${config.color}-6)`,
        backgroundColor: config.bgColor,
      }}
    >
      <Group gap="sm" wrap="nowrap">
        <ThemeIcon color={config.color} variant="light" size="lg">
          <Icon size={20} />
        </ThemeIcon>

        <Stack gap="xs" style={{ flex: 1 }}>
          <Group justify="space-between">
            <Text fw={600} c={config.textColor}>
              {ISSUE_TYPE_LABELS[issue.type]}
            </Text>
            <Badge color={config.color} variant="light">
              {config.label}
            </Badge>
          </Group>

          <Text size="sm" c="dark">
            {issue.description}
          </Text>

          {issue.pages.length > 0 && (
            <Group gap="xs">
              <Text size="xs" c="dimmed">
                影响页面：
              </Text>
              {issue.pages.map((page) => (
                <Tooltip key={page} label="点击跳转">
                  <Badge
                    size="sm"
                    variant="outline"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onJumpToPage?.(page)}
                  >
                    第 {page + 1} 页
                    <ExternalLink size={10} style={{ marginLeft: 4 }} />
                  </Badge>
                </Tooltip>
              ))}
            </Group>
          )}
        </Stack>
      </Group>
    </Card>
  );
};

/**
 * 优化建议列表项
 */
const SuggestionItem: React.FC<{
  suggestion: Suggestion;
  onApplyFix?: (suggestionId: string) => void;
  isApplying?: boolean;
}> = ({ suggestion, onApplyFix, isApplying = false }) => {
  const priorityConfig = PRIORITY_CONFIG[suggestion.priority];

  return (
    <Card padding="md" radius="md" withBorder>
      <Group justify="space-between" align="flex-start">
        <Stack gap="xs" style={{ flex: 1 }}>
          <Group gap="sm">
            <Badge color={priorityConfig.color} variant="light" size="sm">
              {priorityConfig.label}优先级
            </Badge>
            <Badge variant="outline" size="sm">
              {ACTION_LABELS[suggestion.action]}
            </Badge>
            {suggestion.autoFixable && (
              <Badge color="green" variant="light" size="sm">
                可自动修复
              </Badge>
            )}
          </Group>

          <Text size="sm">{suggestion.description}</Text>
        </Stack>

        {suggestion.autoFixable && (
          <Tooltip label="自动修复此问题">
            <ActionIcon
              color="violet"
              variant="light"
              size="lg"
              loading={isApplying}
              onClick={() => onApplyFix?.(suggestion.id)}
            >
              <Wand2 size={18} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Card>
  );
};

// ==================== 主组件 ====================

interface QualityReportPanelProps {
  documentId: string;
  onJumpToPage?: (page: number) => void;
  onReportUpdate?: (report: QualityReport) => void;
}

export const QualityReportPanel: React.FC<QualityReportPanelProps> = ({
  documentId,
  onJumpToPage,
  onReportUpdate,
}) => {
  const [applyingFixes, setApplyingFixes] = useState<Set<string>>(new Set());

  // 获取质量报告
  const {
    data: report,
    loading,
    error,
    execute: refetchReport,
  } = useApiGet<QualityReport>(
    `/api/ai-office/ppt/${documentId}/quality-check`,
    {
      onSuccess: (data) => {
        onReportUpdate?.(data);
      },
    }
  );

  // 应用单个修复
  const { execute: applySingleFix } = useApiPost(
    `/api/ai-office/ppt/${documentId}/quality-fix`,
    {
      onSuccess: () => {
        void refetchReport();
      },
    }
  );

  // 应用所有自动修复
  const { execute: applyAllFixes, loading: applyingAll } = useApiPost(
    `/api/ai-office/ppt/${documentId}/quality-fix-all`,
    {
      onSuccess: () => {
        void refetchReport();
      },
    }
  );

  // 处理单个修复
  const handleApplyFix = useCallback(
    async (suggestionId: string) => {
      setApplyingFixes((prev) => new Set(prev).add(suggestionId));

      try {
        await applySingleFix({ suggestionId });
      } finally {
        setApplyingFixes((prev) => {
          const next = new Set(prev);
          next.delete(suggestionId);
          return next;
        });
      }
    },
    [applySingleFix]
  );

  // 处理全部修复
  const handleApplyAllFixes = useCallback(async () => {
    await applyAllFixes();
  }, [applyAllFixes]);

  // 按严重程度分组问题
  const groupedIssues = React.useMemo(() => {
    if (!report) return { error: [], warning: [], info: [] };

    return report.issues.reduce(
      (acc, issue) => {
        acc[issue.severity].push(issue);
        return acc;
      },
      {
        error: [] as QualityIssue[],
        warning: [] as QualityIssue[],
        info: [] as QualityIssue[],
      }
    );
  }, [report]);

  // 可自动修复的建议数量
  const autoFixableCount = React.useMemo(() => {
    if (!report) return 0;
    return report.suggestions.filter((s) => s.autoFixable).length;
  }, [report]);

  // ==================== 渲染 ====================

  if (loading) {
    return <LoadingState text="正在分析 PPT 质量..." />;
  }

  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => void refetchReport()}
        title="加载质量报告失败"
      />
    );
  }

  if (!report) {
    return null;
  }

  const hasIssues = report.issues.length > 0;
  const hasSuggestions = report.suggestions.length > 0;

  return (
    <Stack gap="lg" p="md">
      {/* 质量分数 */}
      <QualityScoreRing score={report.score} />

      {/* 检查时间 */}
      <Text size="xs" c="dimmed" ta="center">
        检查时间：{new Date(report.checkedAt).toLocaleString('zh-CN')}
      </Text>

      <Divider />

      {/* 快速操作 */}
      {autoFixableCount > 0 && (
        <Card withBorder padding="md" radius="md" bg="violet.0">
          <Group justify="space-between">
            <div>
              <Text fw={600} size="sm">
                发现 {autoFixableCount} 个可自动修复的问题
              </Text>
              <Text size="xs" c="dimmed">
                点击按钮一键优化您的演示文稿
              </Text>
            </div>
            <Button
              leftSection={
                applyingAll ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Wand2 size={16} />
                )
              }
              color="violet"
              loading={applyingAll}
              onClick={() => void handleApplyAllFixes()}
            >
              一键修复全部
            </Button>
          </Group>
        </Card>
      )}

      {/* 问题列表 */}
      {hasIssues && (
        <>
          <div>
            <Group justify="space-between" mb="sm">
              <Text fw={600} size="lg">
                发现的问题 ({report.issues.length})
              </Text>
              <ActionIcon variant="light" onClick={() => void refetchReport()}>
                <RefreshCw size={16} />
              </ActionIcon>
            </Group>

            <Accordion variant="separated" defaultValue="errors">
              {/* 错误级别 */}
              {groupedIssues.error.length > 0 && (
                <Accordion.Item value="errors">
                  <Accordion.Control
                    icon={
                      <ThemeIcon color="red" variant="light">
                        <AlertCircle size={16} />
                      </ThemeIcon>
                    }
                  >
                    <Group gap="xs">
                      <Text fw={600}>错误</Text>
                      <Badge color="red" size="sm">
                        {groupedIssues.error.length}
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      {groupedIssues.error.map((issue) => (
                        <IssueItem
                          key={issue.id}
                          issue={issue}
                          onJumpToPage={onJumpToPage}
                        />
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* 警告级别 */}
              {groupedIssues.warning.length > 0 && (
                <Accordion.Item value="warnings">
                  <Accordion.Control
                    icon={
                      <ThemeIcon color="yellow" variant="light">
                        <AlertTriangle size={16} />
                      </ThemeIcon>
                    }
                  >
                    <Group gap="xs">
                      <Text fw={600}>警告</Text>
                      <Badge color="yellow" size="sm">
                        {groupedIssues.warning.length}
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      {groupedIssues.warning.map((issue) => (
                        <IssueItem
                          key={issue.id}
                          issue={issue}
                          onJumpToPage={onJumpToPage}
                        />
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              )}

              {/* 提示级别 */}
              {groupedIssues.info.length > 0 && (
                <Accordion.Item value="info">
                  <Accordion.Control
                    icon={
                      <ThemeIcon color="blue" variant="light">
                        <Info size={16} />
                      </ThemeIcon>
                    }
                  >
                    <Group gap="xs">
                      <Text fw={600}>提示</Text>
                      <Badge color="blue" size="sm">
                        {groupedIssues.info.length}
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      {groupedIssues.info.map((issue) => (
                        <IssueItem
                          key={issue.id}
                          issue={issue}
                          onJumpToPage={onJumpToPage}
                        />
                      ))}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              )}
            </Accordion>
          </div>

          <Divider />
        </>
      )}

      {/* 优化建议 */}
      {hasSuggestions && (
        <div>
          <Text fw={600} size="lg" mb="sm">
            优化建议 ({report.suggestions.length})
          </Text>

          <Stack gap="sm">
            {report.suggestions
              .sort((a, b) => {
                // 优先级排序：high > medium > low
                const priorityOrder = { high: 0, medium: 1, low: 2 };
                const priorityDiff =
                  priorityOrder[a.priority] - priorityOrder[b.priority];
                if (priorityDiff !== 0) return priorityDiff;

                // 可自动修复的优先
                if (a.autoFixable && !b.autoFixable) return -1;
                if (!a.autoFixable && b.autoFixable) return 1;

                return 0;
              })
              .map((suggestion) => (
                <SuggestionItem
                  key={suggestion.id}
                  suggestion={suggestion}
                  onApplyFix={(id) => void handleApplyFix(id)}
                  isApplying={applyingFixes.has(suggestion.id)}
                />
              ))}
          </Stack>
        </div>
      )}

      {/* 无问题状态 */}
      {!hasIssues && !hasSuggestions && (
        <Card withBorder padding="xl" radius="md" bg="green.0">
          <Stack align="center" gap="md">
            <ThemeIcon color="green" size={64} variant="light">
              <CheckCircle2 size={40} />
            </ThemeIcon>
            <div style={{ textAlign: 'center' }}>
              <Text fw={600} size="lg" c="green.9">
                质量检查通过！
              </Text>
              <Text size="sm" c="dimmed">
                您的演示文稿质量优秀，未发现需要优化的问题
              </Text>
            </div>
          </Stack>
        </Card>
      )}
    </Stack>
  );
};

export default QualityReportPanel;
