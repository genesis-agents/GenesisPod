'use client';

/**
 * Slides Engine - 主页面组件
 *
 * 根据设计文档 Section 7 实现：
 * - 浅色主题，与项目整体风格一致
 * - 两栏布局：对话面板 + 预览面板
 * - 底部进度条
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  History,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Brain,
  FileText,
  Send,
  ChevronDown,
  Layers,
  Eye,
  Palette,
  Grid3X3,
  Sparkles,
  RefreshCw,
  Trash2,
  LayoutGrid,
  List,
  Plus,
  FolderOpen,
  X,
  ArrowLeft,
  Home,
  Copy,
  Terminal,
  Play,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Check,
  MoreVertical,
  Crown,
  Search,
  PenTool,
  CheckCircle,
  Users,
} from 'lucide-react';

import { cn } from '@/lib/utils/common';
import { useSlidesStore, selectOverallProgress } from '@/stores/slidesStore';
import {
  useSlideGenerationTeam,
  useCheckpoints,
  useSessions,
  SessionWithCheckpoint,
} from '@/hooks/features/slides';
import type {
  GenerateRequest,
  PageState,
  PageOutline,
  GenerationProgress,
  OutlinePlan,
} from '@/types/slides';
import type { GenerateTeamRequest } from '@/types/slides-team';
import { AgentTeamPanel } from './AgentTeamPanel';
import { PhaseTimeline } from './PhaseTimeline';
import { AIAssistMenu } from './AIAssistMenu';
import {
  useSlidesHistoryStore,
  formatRelativeTime,
  SlidesHistoryItem,
} from '@/stores/slidesHistoryStore';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/utils/config';
import {
  ThemeSelector,
  SLIDE_THEMES,
  type SlideThemeId,
} from './ThemeSelector';

// ============================================================================
// 类型定义
// ============================================================================

interface ToolCallItem {
  id: string;
  type:
    | 'thinking'
    | 'outline'
    | 'render'
    | 'image'
    | 'checkpoint'
    | 'data'
    | 'step'
    | 'user'
    | 'system';
  title: string;
  status: 'running' | 'completed' | 'error';
  content?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

// ★ @ Mention 选项定义
const MENTION_OPTIONS = [
  {
    id: 'leader',
    label: '@leader',
    description: '让 Leader 分发任务给团队',
    icon: Crown,
    color: 'text-amber-500',
  },
  {
    id: 'analyst',
    label: '@analyst',
    description: '让分析师分析内容',
    icon: Search,
    color: 'text-blue-500',
  },
  {
    id: 'writer',
    label: '@writer',
    description: '让写手修改或重写内容',
    icon: PenTool,
    color: 'text-green-500',
  },
  {
    id: 'reviewer',
    label: '@reviewer',
    description: '让审核员检查质量',
    icon: CheckCircle,
    color: 'text-purple-500',
  },
  {
    id: 'team',
    label: '@team',
    description: '通知整个团队',
    icon: Users,
    color: 'text-orange-500',
  },
];

// ============================================================================
// 主组件
// ============================================================================

export function SlidesTab() {
  const { session, pages, generating, streamEvents, progress, outlinePlan } =
    useSlidesStore();
  const { generateWithTeam, cancel, teamState, teamEvents } =
    useSlideGenerationTeam();
  const { createCheckpoint, checkpoints } = useCheckpoints();
  const { history, addHistory, updateHistory, removeHistory, clearHistory } =
    useSlidesHistoryStore();
  const { restoreCheckpoint, restoreBySessionId } = useCheckpoints();
  const {
    sessions: backendSessions,
    loading: sessionsLoading,
    refresh: refreshSessions,
    updateSession,
    deleteSession,
  } = useSessions();
  const { user } = useAuth();
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showNewForm, setShowNewForm] = useState(false);
  const [showPresentation, setShowPresentation] = useState(false);
  const currentHistoryIdRef = useRef<string | null>(null);

  // 重置回到历史记录画廊
  const handleBackToGallery = useCallback(() => {
    const { reset } = useSlidesStore.getState();
    reset();
    setShowNewForm(false);
    refreshSessions();
  }, [refreshSessions]);

  // ★ 清理不一致的状态：如果 generating=true 但没有活跃的生成进程，重置状态
  // 这可能发生在页面刷新或中途关闭后重新打开时
  useEffect(() => {
    const store = useSlidesStore.getState();
    // 如果标记为生成中，但没有 teamState（即没有活跃的 SSE 连接），说明是残留状态
    if (store.generating && !teamState) {
      console.log(
        '[SlidesTab] Cleaning up stale generating state, resetting to gallery'
      );
      store.reset(); // 完全重置，回到画廊视图
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在挂载时执行一次

  // ★ 自动隐藏历史记录：当有活跃会话、页面内容或正在生成时
  useEffect(() => {
    if (session || pages.length > 0 || generating) {
      setShowHistory(false);
    }
  }, [session, pages.length, generating]);

  // 将 streamEvents 和 teamEvents 转换为 toolCalls
  // 精简版：只显示关键节点，Agent 状态由 AgentTeamPanel 负责
  // 目标：最多显示 5-8 个条目，而不是 20+ 个
  useEffect(() => {
    const calls: ToolCallItem[] = [];
    let hasExecutionStarted = false;
    let hasExecutionCompleted = false;
    let totalPagesGenerated = 0;

    // 只处理 teamEvents（新格式），忽略旧格式的 streamEvents
    teamEvents.forEach((event) => {
      const id = `team-${event.type}-${event.timestamp}`;

      // 1. 开始事件 - 只显示一次
      if (event.type === 'execution:started') {
        if (!hasExecutionStarted) {
          hasExecutionStarted = true;
          calls.push({
            id,
            type: 'step',
            title: '🚀 开始生成',
            status: 'completed',
            timestamp: new Date(event.timestamp),
          });
        }
      }
      // 2. 阶段完成事件 - 只显示主要阶段的完成（不显示开始）
      else if (event.type === 'phase:completed') {
        const eventData = event.data as {
          phase: string;
          result?: Record<string, unknown>;
        };

        // 只显示关键阶段完成
        const keyPhases = ['analyzing', 'planning', 'generating', 'reviewing'];
        if (keyPhases.includes(eventData.phase)) {
          const phaseNames: Record<string, string> = {
            analyzing: '📊 内容分析完成',
            planning: '📝 大纲规划完成',
            generating: '🎨 页面生成完成',
            reviewing: '✅ 质量检查完成',
          };
          calls.push({
            id,
            type: 'step',
            title: phaseNames[eventData.phase] || eventData.phase,
            status: 'completed',
            timestamp: new Date(event.timestamp),
          });
        }
      }
      // 3. 页面生成 - 只统计数量，不单独显示每页
      else if (event.type === 'slide:generated') {
        totalPagesGenerated++;
      }
      // 4. 完成事件 - 只显示一次
      else if (event.type === 'execution:completed') {
        if (!hasExecutionCompleted) {
          hasExecutionCompleted = true;
          const data = event.data as {
            totalPages?: number;
            totalTime?: number;
          };
          calls.push({
            id,
            type: 'checkpoint',
            title: '🎉 生成完成',
            content: data.totalPages
              ? `共 ${data.totalPages} 页，耗时 ${((data.totalTime || 0) / 1000).toFixed(1)}s`
              : totalPagesGenerated > 0
                ? `共 ${totalPagesGenerated} 页`
                : undefined,
            status: 'completed',
            timestamp: new Date(event.timestamp),
          });
        }
      }
      // 5. 失败事件
      else if (event.type === 'execution:failed') {
        const data = event.data as { error?: string };
        calls.push({
          id,
          type: 'step',
          title: '❌ 生成失败',
          content: data.error,
          status: 'error',
          timestamp: new Date(event.timestamp),
        });
      }
      // 其他事件（agent:*, phase:started, heartbeat 等）不显示在时间线
      // Agent 状态完全由 AgentTeamPanel 负责显示
    });

    setToolCalls(calls);
  }, [streamEvents, teamEvents]);

  const handleSendMessage = useCallback((message: string) => {
    // 添加用户消息到 streamEvents
    const { addStreamEvent, pages, selectedPageIndex } =
      useSlidesStore.getState();

    // 添加用户消息事件
    addStreamEvent({
      type: 'user_message',
      timestamp: new Date(),
      data: {
        message,
        pageNumber: pages[selectedPageIndex]?.pageNumber,
      },
    });

    // TODO: 实现后端接续生成 API
    // 目前显示提示信息
    const currentPage = pages[selectedPageIndex];
    if (currentPage) {
      addStreamEvent({
        type: 'system_message',
        timestamp: new Date(),
        data: {
          message: `收到您对第 ${currentPage.pageNumber} 页的修改建议。接续编辑功能正在开发中，敬请期待！`,
        },
      });
    } else {
      addStreamEvent({
        type: 'system_message',
        timestamp: new Date(),
        data: {
          message: '收到您的反馈。接续编辑功能正在开发中，敬请期待！',
        },
      });
    }
  }, []);

  const handleCreateCheckpoint = useCallback(() => {
    createCheckpoint('用户保存点');
  }, [createCheckpoint]);

  // 智能标签生成 - 基于内容主题分析
  const handleSmartTags = useCallback(async () => {
    const { pages, addStreamEvent } = useSlidesStore.getState();
    if (pages.length === 0) return;

    // 收集所有页面的文本内容用于分析
    const allText = pages
      .map((p) => {
        // 从 HTML 中提取纯文本，但排除 style 和 script 标签内容
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = p.html || '';
        // 移除 style 和 script 标签
        tempDiv.querySelectorAll('style, script').forEach((el) => el.remove());
        return tempDiv.textContent || tempDiv.innerText || '';
      })
      .join(' ');

    // 提取中文词组（2-4字的有意义词汇）
    const chineseWords: string[] = [];
    const chinesePattern = /[\u4e00-\u9fa5]{2,6}/g;
    let match;
    while ((match = chinesePattern.exec(allText)) !== null) {
      chineseWords.push(match[0]);
    }

    // 提取英文单词（排除常见技术词汇）
    const englishWords = allText
      .replace(/[\u4e00-\u9fa5]/g, ' ')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 4);

    // CSS/HTML/技术停用词（这些不是内容相关的）
    const techStopWords = new Set([
      // CSS 属性
      'slide',
      'container',
      'overflow',
      'hidden',
      'height',
      'width',
      'display',
      'flex',
      'grid',
      'margin',
      'padding',
      'border',
      'background',
      'color',
      'font',
      'size',
      'style',
      'class',
      'position',
      'absolute',
      'relative',
      'fixed',
      'center',
      'left',
      'right',
      'top',
      'bottom',
      'auto',
      'none',
      'block',
      'inline',
      'item',
      'items',
      'content',
      'justify',
      'align',
      'text',
      'weight',
      'bold',
      'normal',
      'italic',
      'rgba',
      'rgb',
      'hover',
      'active',
      'focus',
      'before',
      'after',
      'first',
      'last',
      // HTML 标签
      'div',
      'span',
      'section',
      'header',
      'footer',
      'main',
      'article',
      'html',
      'body',
      'head',
      'title',
      'meta',
      'link',
      'script',
      // 通用技术词
      'function',
      'return',
      'const',
      'let',
      'var',
      'import',
      'export',
      'true',
      'false',
      'null',
      'undefined',
      'object',
      'array',
      'string',
      'number',
      'boolean',
      'type',
      'interface',
      'class',
      'props',
    ]);

    // 中文停用词
    const chineseStopWords = new Set([
      '的',
      '了',
      '是',
      '在',
      '有',
      '和',
      '与',
      '等',
      '为',
      '中',
      '对',
      '个',
      '上',
      '下',
      '不',
      '也',
      '就',
      '都',
      '而',
      '及',
      '这',
      '那',
      '你',
      '我',
      '他',
      '她',
      '它',
      '们',
      '会',
      '能',
      '要',
      '从',
      '到',
      '以',
      '可',
      '被',
      '让',
      '把',
      '将',
      '向',
      '着',
      '过',
      '给',
      '但',
      '如',
      '很',
      '更',
      '最',
      '还',
      '只',
      '又',
      '已',
      '所',
      '每',
      '其',
      '此',
      '或',
      '并',
      '使',
      '因',
    ]);

    // 统计中文词频
    const chineseWordCount: Record<string, number> = {};
    chineseWords.forEach((w) => {
      if (!chineseStopWords.has(w) && w.length >= 2) {
        chineseWordCount[w] = (chineseWordCount[w] || 0) + 1;
      }
    });

    // 统计英文词频（排除技术词汇）
    const englishWordCount: Record<string, number> = {};
    const commonStopWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'and',
      'or',
      'but',
      'not',
      'this',
      'that',
      'these',
      'those',
      'it',
      'its',
      'as',
      'if',
      'then',
      'than',
      'so',
      'such',
      'what',
      'which',
      'who',
      'whom',
      'when',
      'where',
      'why',
      'how',
    ]);
    englishWords.forEach((w) => {
      if (!techStopWords.has(w) && !commonStopWords.has(w)) {
        englishWordCount[w] = (englishWordCount[w] || 0) + 1;
      }
    });

    // 获取高频中文词作为主要标签
    const chineseTags = Object.entries(chineseWordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([word]) => word);

    // 获取高频英文词作为补充标签（首字母大写）
    const englishTags = Object.entries(englishWordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));

    // 合并标签，优先中文
    const tags = [...chineseTags, ...englishTags].slice(0, 5);

    // 如果当前有 session，更新历史记录
    if (session?.id) {
      const historyItem = history.find(
        (h) => h.sessionId === session.id || h.checkpointId === session.id
      );
      if (historyItem) {
        updateHistory(historyItem.id, { tags });
      }
    }

    // 显示成功提示
    addStreamEvent({
      type: 'system_message',
      timestamp: new Date(),
      data: {
        message: `已生成智能标签：${tags.join('、') || '暂无标签'}`,
        source: 'AI 辅助',
      },
    });
  }, [session, history, updateHistory]);

  const handleGenerate = useCallback(
    (request: GenerateRequest) => {
      const historyId = addHistory({
        title: request.title,
        sourceText: request.sourceText.slice(0, 200),
        targetPages: request.targetPages || 10,
        status: 'pending',
      });
      currentHistoryIdRef.current = historyId;
      // 转换为 Team 请求格式
      const teamRequest: GenerateTeamRequest = {
        title: request.title,
        sourceText: request.sourceText,
        userRequirement: request.title, // 同时作为用户需求
        targetPages: request.targetPages,
        stylePreference: request.stylePreference,
        themeId: request.themeId,
      };
      generateWithTeam(teamRequest);
    },
    [generateWithTeam, addHistory]
  );

  // 监听 session 创建和完成事件，更新历史记录
  useEffect(() => {
    const historyId = currentHistoryIdRef.current;
    if (!historyId) return;

    // 查找最新的 session_created 和 complete 事件
    const sessionEvent = streamEvents.find((e) => e.type === 'session_created');
    const completeEvent = streamEvents.find((e) => e.type === 'complete');

    if (sessionEvent) {
      const sessionData = sessionEvent.data as {
        session: { id: string; title: string };
      };
      updateHistory(historyId, {
        sessionId: sessionData.session.id,
      });
    }

    if (completeEvent) {
      const completeData = completeEvent.data as {
        sessionId: string;
        checkpointId: string;
      };
      updateHistory(historyId, {
        status: 'success',
        sessionId: completeData.sessionId,
        checkpointId: completeData.checkpointId,
      });
      currentHistoryIdRef.current = null;
    }
  }, [streamEvents, updateHistory]);

  // 恢复历史记录（localStorage）
  const handleRestoreHistory = useCallback(
    async (item: SlidesHistoryItem) => {
      setRestoring(true);
      try {
        // 优先使用 checkpointId，如果没有则使用 sessionId
        if (item.checkpointId) {
          await restoreCheckpoint(item.checkpointId);
        } else if (item.sessionId) {
          await restoreBySessionId(item.sessionId);
        } else {
          console.warn('No checkpointId or sessionId in history item');
          return;
        }
        setShowHistory(false);
      } catch (err) {
        console.error('Failed to restore:', err);
      } finally {
        setRestoring(false);
      }
    },
    [restoreCheckpoint, restoreBySessionId]
  );

  // 恢复后端会话
  const handleRestoreSession = useCallback(
    async (sessionItem: SessionWithCheckpoint) => {
      console.log(
        '[SlidesTab] handleRestoreSession called:',
        sessionItem.id,
        sessionItem.title
      );
      setRestoring(true);
      try {
        if (sessionItem.latestCheckpoint?.id) {
          console.log(
            '[SlidesTab] Restoring from checkpoint:',
            sessionItem.latestCheckpoint.id
          );
          await restoreCheckpoint(sessionItem.latestCheckpoint.id);
        } else {
          console.log('[SlidesTab] Restoring from session:', sessionItem.id);
          await restoreBySessionId(sessionItem.id);
        }
        console.log('[SlidesTab] Restore completed successfully');
        setShowHistory(false);
        setShowNewForm(false);
      } catch (err) {
        console.error('[SlidesTab] Failed to restore session:', err);
        // 显示错误提示给用户
        alert('恢复失败: ' + (err instanceof Error ? err.message : '未知错误'));
      } finally {
        setRestoring(false);
      }
    },
    [restoreCheckpoint, restoreBySessionId]
  );

  // 初始状态 - 显示 Sessions 画廊或输入表单
  if (!session && pages.length === 0 && !generating) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-white">
        {/* 头部 */}
        <Header
          showHistory={showHistory}
          onToggleHistory={() => setShowHistory(!showHistory)}
          onCreateCheckpoint={handleCreateCheckpoint}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onNewClick={() => setShowNewForm(true)}
          showViewToggle={!showNewForm}
          onSmartTags={handleSmartTags}
        />

        {/* 历史记录面板 */}
        <HistoryPanel
          show={showHistory}
          history={history}
          onRemove={removeHistory}
          onClear={clearHistory}
          onRestore={handleRestoreHistory}
        />

        {/* 根据状态显示画廊或输入表单 */}
        {showNewForm ? (
          <InitialInputForm
            onGenerate={handleGenerate}
            onCancel={() => setShowNewForm(false)}
          />
        ) : (
          <SessionsGallery
            backendSessions={backendSessions}
            localHistory={history}
            viewMode={viewMode}
            onRestoreSession={handleRestoreSession}
            onRestoreHistory={handleRestoreHistory}
            onNewClick={() => setShowNewForm(true)}
            loading={sessionsLoading}
            restoring={restoring}
            onUpdateSession={updateSession}
            onDeleteSession={deleteSession}
          />
        )}
      </div>
    );
  }

  // 生成中或已有内容 - 显示两栏布局
  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* 头部 */}
      <Header
        title={session?.title}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory(!showHistory)}
        onCreateCheckpoint={handleCreateCheckpoint}
        showBackButton={true}
        onBackToGallery={handleBackToGallery}
        onStartPresentation={() => setShowPresentation(true)}
        hasPages={pages.length > 0}
        onSmartTags={handleSmartTags}
      />

      {/* 历史记录面板 */}
      <HistoryPanel
        show={showHistory}
        history={history}
        onRemove={removeHistory}
        onClear={clearHistory}
        onRestore={handleRestoreHistory}
      />

      {/* 两栏布局 */}
      <div className="flex flex-1 overflow-hidden">
        <ConversationPanel
          onSendMessage={handleSendMessage}
          onCancel={cancel}
          toolCalls={toolCalls}
          generating={generating}
          progress={progress}
          outlinePlan={outlinePlan}
          teamState={teamState}
        />
        <PreviewPanel />
      </div>

      {/* 底部进度条 */}
      <ProgressBar />

      {/* 演示模式 */}
      {showPresentation && (
        <PresentationMode
          pages={pages}
          onClose={() => setShowPresentation(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// PresentationMode 组件 - 全屏演示
// ============================================================================

function PresentationMode({
  pages,
  onClose,
}: {
  pages: PageState[];
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 确保容器获得焦点（防止 iframe 抢占焦点导致键盘事件失效）
  useEffect(() => {
    // 短暂延迟后聚焦容器，确保 DOM 已渲染
    const focusTimer = setTimeout(() => {
      containerRef.current?.focus();
    }, 100);
    return () => clearTimeout(focusTimer);
  }, []);

  // 键盘导航 - 使用 capture 模式确保优先处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 确保容器保持焦点
      if (document.activeElement !== containerRef.current) {
        containerRef.current?.focus();
      }

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          e.stopPropagation();
          setCurrentIndex((prev) => Math.min(prev + 1, pages.length - 1));
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          e.stopPropagation();
          setCurrentIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Home':
          e.preventDefault();
          e.stopPropagation();
          setCurrentIndex(0);
          break;
        case 'End':
          e.preventDefault();
          e.stopPropagation();
          setCurrentIndex(pages.length - 1);
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }
    };

    // 使用 capture 模式优先捕获键盘事件
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [pages.length, onClose]);

  // 进入/退出全屏
  useEffect(() => {
    const container = containerRef.current;
    if (container && document.fullscreenEnabled) {
      container.requestFullscreen?.().catch(() => {
        // 全屏请求失败，静默处理
      });
    }

    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, []);

  const currentPage = pages[currentIndex];

  // 固定画布尺寸 (16:9)
  const SLIDE_WIDTH = 1280;
  const SLIDE_HEIGHT = 720;

  // 计算全屏缩放
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const screenHeight =
    typeof window !== 'undefined' ? window.innerHeight : 1080;
  const scaleX = screenWidth / SLIDE_WIDTH;
  const scaleY = screenHeight / SLIDE_HEIGHT;
  const scale = Math.min(scaleX, scaleY);

  const scaledWidth = Math.floor(SLIDE_WIDTH * scale);
  const scaledHeight = Math.floor(SLIDE_HEIGHT * scale);

  // 为 iframe 添加缩放样式
  const enhanceHtmlForPresentation = (
    html: string,
    zoomScale: number
  ): string => {
    const enhancementStyles = `
      <style>
        * {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }
        html {
          zoom: ${zoomScale};
        }
        body {
          margin: 0;
          padding: 0;
          width: ${SLIDE_WIDTH}px;
          height: ${SLIDE_HEIGHT}px;
          overflow: hidden;
        }
      </style>
    `;
    if (html.includes('</head>')) {
      return html.replace('</head>', enhancementStyles + '</head>');
    }
    if (html.includes('<body')) {
      return html.replace('<body', enhancementStyles + '<body');
    }
    return enhancementStyles + html;
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="fixed inset-0 z-50 flex flex-col bg-black outline-none"
      onClick={(e) => {
        // 点击空白区域下一页
        if (e.target === e.currentTarget) {
          setCurrentIndex((prev) => Math.min(prev + 1, pages.length - 1));
        }
      }}
      onMouseMove={() => {
        // 鼠标移动时确保容器获得焦点
        containerRef.current?.focus();
      }}
    >
      {/* 幻灯片内容 */}
      <div className="flex flex-1 items-center justify-center">
        {currentPage?.html ? (
          <iframe
            srcDoc={enhanceHtmlForPresentation(currentPage.html, scale)}
            style={{
              width: scaledWidth,
              height: scaledHeight,
              border: 'none',
              display: 'block',
              backgroundColor: '#0f172a',
              pointerEvents: 'none', // 防止 iframe 截获交互
            }}
            tabIndex={-1} // 防止 iframe 获得焦点
            sandbox="allow-scripts"
          />
        ) : (
          <div className="text-center text-white">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin" />
            <p>加载中...</p>
          </div>
        )}
      </div>

      {/* 控制栏 */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-6 py-4 opacity-0 transition-opacity hover:opacity-100">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
            title="退出演示 (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="text-sm text-white/80">
            按 Esc 退出 | 方向键或空格切换页面
          </span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
            disabled={currentIndex === 0}
            className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <span className="min-w-[80px] text-center text-sm font-medium text-white">
            {currentIndex + 1} / {pages.length}
          </span>

          <button
            onClick={() =>
              setCurrentIndex((prev) => Math.min(prev + 1, pages.length - 1))
            }
            disabled={currentIndex === pages.length - 1}
            className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Header 组件
// ============================================================================

function Header({
  title,
  showHistory,
  onToggleHistory,
  onCreateCheckpoint,
  onBackToGallery,
  viewMode,
  onViewModeChange,
  onNewClick,
  onStartPresentation,
  onSmartTags,
  showViewToggle = false,
  showBackButton = false,
  hasPages = false,
}: {
  title?: string;
  showHistory: boolean;
  onToggleHistory: () => void;
  onCreateCheckpoint: () => void;
  onBackToGallery?: () => void;
  viewMode?: 'grid' | 'list';
  onViewModeChange?: (mode: 'grid' | 'list') => void;
  onNewClick?: () => void;
  onStartPresentation?: () => void;
  onSmartTags?: () => Promise<void>;
  showViewToggle?: boolean;
  showBackButton?: boolean;
  hasPages?: boolean;
}) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <header className="flex-shrink-0 border-b border-gray-200 bg-white">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          {/* 返回按钮 */}
          {showBackButton && onBackToGallery && (
            <button
              onClick={onBackToGallery}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              title="返回历史记录"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">{title || 'AI 演示文稿'}</h1>
            <p className="text-xs text-gray-500">智能PPT生成</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 新建按钮 */}
          {onNewClick && (
            <button
              onClick={onNewClick}
              className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              <Plus className="h-4 w-4" />
              新建
            </button>
          )}

          {/* ★ AI 辅助菜单 - 首页显示在新建按钮旁 */}
          {onNewClick && (
            <AIAssistMenu onSmartTags={onSmartTags} disabled={!hasPages} />
          )}

          {/* 视图切换 */}
          {showViewToggle && viewMode && onViewModeChange && (
            <div className="flex items-center rounded-lg border border-gray-200 p-1">
              <button
                onClick={() => onViewModeChange('grid')}
                className={cn(
                  'rounded p-1.5 transition-colors',
                  viewMode === 'grid'
                    ? 'bg-orange-100 text-orange-600'
                    : 'text-gray-400 hover:text-gray-600'
                )}
                title="网格视图"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => onViewModeChange('list')}
                className={cn(
                  'rounded p-1.5 transition-colors',
                  viewMode === 'list'
                    ? 'bg-orange-100 text-orange-600'
                    : 'text-gray-400 hover:text-gray-600'
                )}
                title="列表视图"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* 历史记录 - 仅在首页显示，编辑页隐藏 */}
          {!showBackButton && (
            <button
              onClick={onToggleHistory}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors',
                showHistory
                  ? 'bg-orange-100 text-orange-600'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              <History className="h-4 w-4" />
              历史记录
            </button>
          )}

          {/* 创建保存点 */}
          <button
            onClick={onCreateCheckpoint}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            <Save className="h-4 w-4" />
            创建保存点
          </button>

          {/* AI 辅助菜单 */}
          {hasPages && (
            <AIAssistMenu onSmartTags={onSmartTags} disabled={false} />
          )}

          {/* 播放演示 */}
          {hasPages && onStartPresentation && (
            <button
              onClick={onStartPresentation}
              className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm text-white hover:bg-orange-600"
            >
              <Play className="h-4 w-4" />
              播放
            </button>
          )}

          {/* 导出 */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              <Download className="h-4 w-4" />
              导出
              <ChevronDown className="h-3 w-3" />
            </button>
            {showExportMenu && (
              <ExportDropdown onClose={() => setShowExportMenu(false)} />
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

// ============================================================================
// 历史记录面板
// ============================================================================

function HistoryPanel({
  show,
  history,
  onRemove,
  onClear,
  onRestore,
}: {
  show: boolean;
  history: SlidesHistoryItem[];
  onRemove: (id: string) => void;
  onClear: () => void;
  onRestore: (item: SlidesHistoryItem) => void;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden border-b border-gray-200 bg-gray-50"
        >
          <div className="max-h-[280px] overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">生成历史</h3>
              {history.length > 0 && (
                <button
                  onClick={onClear}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  清空
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-400">
                暂无历史记录
              </p>
            ) : (
              <div className="space-y-2">
                {history.slice(0, 20).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => item.sessionId && onRestore(item)}
                    className={cn(
                      'flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 transition-colors',
                      item.sessionId
                        ? 'cursor-pointer hover:border-orange-300 hover:bg-orange-50'
                        : 'hover:border-gray-300'
                    )}
                  >
                    <div className="mr-2 min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {item.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                        <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-600">
                          {item.targetPages} 页
                        </span>
                        {item.status === 'success' ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : item.status === 'error' ? (
                          <AlertCircle className="h-3 w-3 text-red-500" />
                        ) : (
                          <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                        )}
                        {item.sessionId && (
                          <span className="text-xs text-orange-500">
                            点击恢复
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(item.id);
                        }}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// 导出下拉菜单
// ============================================================================

function ExportDropdown({ onClose }: { onClose: () => void }) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { session } = useSlidesStore();
  const [exporting, setExporting] = useState<'pptx' | 'pdf' | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleExport = useCallback(
    async (format: 'pptx' | 'pdf') => {
      if (!session?.id) {
        alert('请先生成幻灯片');
        return;
      }

      setExporting(format);
      try {
        const response = await fetch(
          `${config.apiUrl}/ai-office/slides/sessions/${session.id}/export`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              format,
              quality: 'high',
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `导出失败: ${response.status}`);
        }

        // 获取文件名
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `slides.${format}`;
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="?([^"]+)"?/);
          if (match) {
            filename = match[1];
          }
        }

        // 下载文件
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        onClose();
      } catch (error: unknown) {
        console.error('Export failed:', error);
        alert(error instanceof Error ? error.message : '导出失败，请重试');
      } finally {
        setExporting(null);
      }
    },
    [session?.id, onClose]
  );

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-2 shadow-lg"
    >
      <button
        onClick={() => handleExport('pptx')}
        disabled={exporting !== null || !session?.id}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {exporting === 'pptx' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        导出 PPTX
      </button>
      <button
        onClick={() => handleExport('pdf')}
        disabled={exporting !== null || !session?.id}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {exporting === 'pdf' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        导出 PDF
      </button>
    </div>
  );
}

// ============================================================================
// 对话面板 - 左侧
// ============================================================================

function ConversationPanel({
  onSendMessage,
  onCancel,
  toolCalls,
  generating,
  progress,
  outlinePlan,
  teamState,
}: {
  onSendMessage: (message: string) => void;
  onCancel: () => void;
  toolCalls: ToolCallItem[];
  generating: boolean;
  progress: GenerationProgress | null;
  outlinePlan: OutlinePlan | null;
  teamState: import('@/types/slides-team').TeamExecutionState | null;
}) {
  const [inputValue, setInputValue] = useState('');
  const [outlineExpanded, setOutlineExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  // ★ @ Mention 状态
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { streamEvents, selectedPageIndex, setSelectedPageIndex } =
    useSlidesStore();

  // ƒ~. ‚?%‚­1‘?›Š_?‘,?‘?r‡""„§Z‘~_‡§‡"¯†¯S
  const chatMessages = React.useMemo(() => {
    const items: Array<{
      id: string;
      role: 'user' | 'system' | 'agent';
      author: string;
      message: string;
      timestamp: Date;
    }> = [];

    streamEvents.forEach((event, index) => {
      const data = (event.data || {}) as Record<string, any>;
      const timestamp =
        event.timestamp instanceof Date
          ? event.timestamp
          : new Date(event.timestamp);

      if (event.type === 'user_message') {
        if (!data.message) return;
        items.push({
          id: `${event.type}-${timestamp.getTime()}-${index}`,
          role: 'user',
          author: '我',
          message: String(data.message),
          timestamp,
        });
        return;
      }

      if (event.type === 'system_message') {
        if (!data.message) return;
        items.push({
          id: `${event.type}-${timestamp.getTime()}-${index}`,
          role: 'system',
          author: data.source || '系统',
          message: String(data.message),
          timestamp,
        });
        return;
      }

      if (
        event.type === 'agent:working' ||
        event.type === 'agent:completed' ||
        event.type === 'mission:agent_working' ||
        event.type === 'mission:agent_done'
      ) {
        const message =
          data.thought || data.task || data.result || data.message || '';
        if (!message) return;
        items.push({
          id: `${event.type}-${timestamp.getTime()}-${index}`,
          role: 'agent',
          author: data.agentName || data.agent || 'Agent',
          message: String(message),
          timestamp,
        });
      }
    });

    return items.slice(-50);
  }, [streamEvents]);

  const renderMessageText = useCallback((text: string) => {
    return text.split(/(@[\w-]+)/g).map((part, idx) => {
      if (part.startsWith('@')) {
        return (
          <span key={idx} className="font-medium text-orange-600">
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [toolCalls, progress, chatMessages]);

  // ★ 检测 @ mention
  useEffect(() => {
    const text = inputValue;
    const lastAtIndex = text.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const afterAt = text.slice(lastAtIndex + 1);
      // 如果 @ 后面没有空格，说明用户正在输入 mention
      if (!afterAt.includes(' ')) {
        setShowMentionMenu(true);
        setMentionFilter(afterAt.toLowerCase());
        setSelectedMentionIndex(0);
      } else {
        setShowMentionMenu(false);
        setMentionFilter('');
      }
    } else {
      setShowMentionMenu(false);
      setMentionFilter('');
    }
  }, [inputValue]);

  // ★ 过滤后的 mention 选项
  const filteredMentionOptions = React.useMemo(() => {
    if (!mentionFilter) return MENTION_OPTIONS;
    return MENTION_OPTIONS.filter(
      (opt) =>
        opt.id.toLowerCase().includes(mentionFilter) ||
        opt.label.toLowerCase().includes(mentionFilter)
    );
  }, [mentionFilter]);

  // ★ 处理 mention 选择
  const handleMentionSelect = useCallback(
    (option: (typeof MENTION_OPTIONS)[0]) => {
      const lastAtIndex = inputValue.lastIndexOf('@');
      if (lastAtIndex !== -1) {
        const newValue = inputValue.slice(0, lastAtIndex) + option.label + ' ';
        setInputValue(newValue);
      }
      setShowMentionMenu(false);
      setMentionFilter('');
      textareaRef.current?.focus();
    },
    [inputValue]
  );

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
    setShowMentionMenu(false);
    setMentionFilter('');
  }, [inputValue, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // ★ 处理 mention 菜单导航
      if (showMentionMenu && filteredMentionOptions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedMentionIndex((prev) =>
            prev < filteredMentionOptions.length - 1 ? prev + 1 : 0
          );
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedMentionIndex((prev) =>
            prev > 0 ? prev - 1 : filteredMentionOptions.length - 1
          );
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          handleMentionSelect(filteredMentionOptions[selectedMentionIndex]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowMentionMenu(false);
          return;
        }
      }

      // 正常的 Enter 提交
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [
      handleSend,
      showMentionMenu,
      filteredMentionOptions,
      selectedMentionIndex,
      handleMentionSelect,
    ]
  );

  // 复制日志到剪贴板
  const handleCopyLog = useCallback(() => {
    const logText = streamEvents
      .map((event) => {
        const time = new Date(event.timestamp).toLocaleTimeString();
        const data = JSON.stringify(event.data, null, 2);
        return `[${time}] ${event.type}\n${data}`;
      })
      .join('\n\n');

    navigator.clipboard.writeText(logText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [streamEvents]);

  return (
    <div className="flex h-full w-[360px] flex-shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      {/* 顶部：Agent 团队栏 */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-gradient-to-r from-slate-800 to-slate-900 px-3 py-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400">AI 团队</span>
          <button
            onClick={handleCopyLog}
            disabled={streamEvents.length === 0}
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
              copied
                ? 'bg-green-500/20 text-green-400'
                : 'text-slate-500 hover:bg-slate-700 hover:text-slate-300'
            )}
            title="复制完整日志"
          >
            {copied ? (
              <>
                <CheckCircle2 className="h-3 w-3" />
                已复制
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                日志
              </>
            )}
          </button>
        </div>
        <div className="flex items-center gap-1">
          {MENTION_OPTIONS.map((agent) => (
            <button
              key={agent.id}
              onClick={() => {
                setInputValue((prev) => prev + agent.label + ' ');
                textareaRef.current?.focus();
              }}
              className="group flex items-center gap-1 rounded-md bg-slate-700/50 px-2 py-1 text-xs transition-all hover:bg-slate-600"
              title={agent.description}
            >
              <agent.icon className={cn('h-3 w-3', agent.color)} />
              <span className="text-slate-300 group-hover:text-white">
                {agent.id}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 中间：对话和进度区域 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {/* 对话记录 */}
        <div className="border-b border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">对话</span>
            <span className="text-[10px] text-slate-400">
              {chatMessages.length} 条
            </span>
          </div>
          <div className="space-y-2">
            {chatMessages.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">
                点击上方 Agent 或输入 @ 开始对话
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'rounded-lg p-2.5',
                    msg.role === 'user' && 'ml-4 bg-blue-50',
                    msg.role === 'system' && 'bg-slate-100',
                    msg.role === 'agent' && 'mr-4 bg-amber-50'
                  )}
                >
                  <div className="mb-1 flex items-center gap-1.5 text-[10px]">
                    <span
                      className={cn(
                        'font-medium',
                        msg.role === 'user' && 'text-blue-600',
                        msg.role === 'system' && 'text-slate-600',
                        msg.role === 'agent' && 'text-amber-600'
                      )}
                    >
                      {msg.author}
                    </span>
                    <span className="text-slate-400">
                      {msg.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm text-slate-800">
                    {renderMessageText(msg.message)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 生成进度 */}
        <div className="p-3">
          <PhaseTimeline
            teamState={teamState}
            generating={generating}
            progress={
              progress
                ? {
                    currentPage: progress.currentPage,
                    totalPages: progress.totalPages,
                    message: progress.message,
                  }
                : undefined
            }
          />

          {/* 取消按钮 */}
          {generating && (
            <div className="mt-3 flex justify-center">
              <button
                onClick={onCancel}
                className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
              >
                <X className="h-3.5 w-3.5" />
                取消生成
              </button>
            </div>
          )}

          {/* 大纲预览 */}
          {outlinePlan && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5">
              <button
                onClick={() => setOutlineExpanded(!outlineExpanded)}
                className="flex w-full items-center gap-2 text-left text-xs font-medium text-slate-700"
              >
                <FileText className="h-3.5 w-3.5 text-blue-500" />
                大纲 ({outlinePlan.pages.length} 页)
                <ChevronDown
                  className={cn(
                    'ml-auto h-3.5 w-3.5 transition-transform',
                    outlineExpanded ? '' : '-rotate-90'
                  )}
                />
              </button>

              <AnimatePresence>
                {outlineExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 space-y-1">
                      {outlinePlan.pages.map(
                        (page: PageOutline, index: number) => (
                          <OutlineItem
                            key={index}
                            page={page}
                            index={index}
                            isSelected={selectedPageIndex === index}
                            onClick={() => setSelectedPageIndex(index)}
                          />
                        )
                      )}
                    </div>

                    <div className="mt-2">
                      {generating ? (
                        <div className="flex items-center justify-center gap-1.5 rounded bg-orange-100 py-1 text-xs font-medium text-orange-700">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          生成中...
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5 rounded bg-green-100 py-1 text-xs font-medium text-green-700">
                          <CheckCircle2 className="h-3 w-3" />
                          已完成
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* 固定在底部的输入框 */}
      <div className="relative flex-shrink-0 border-t border-gray-200 bg-white p-3">
        {/* ★ @ Mention 菜单 */}
        <AnimatePresence>
          {showMentionMenu && filteredMentionOptions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-full left-3 right-3 z-50 mb-2 rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
            >
              <div className="mb-2 px-2 text-xs text-gray-500">
                提及 Agent（使用 ↑↓ 选择，Enter 确认）
              </div>
              <div className="space-y-1">
                {filteredMentionOptions.map((option, index) => (
                  <button
                    key={option.id}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                      index === selectedMentionIndex
                        ? 'bg-orange-100 text-orange-700'
                        : 'hover:bg-gray-100'
                    )}
                    onClick={() => handleMentionSelect(option)}
                    onMouseEnter={() => setSelectedMentionIndex(index)}
                  >
                    <option.icon
                      className={cn('h-5 w-5 flex-shrink-0', option.color)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{option.label}</div>
                      <div className="truncate text-xs text-gray-500">
                        {option.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入修改建议或反馈... (输入 @ 提及 Agent)"
            rows={3}
            className="max-h-40 min-h-[80px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className={cn(
              'rounded-lg p-2.5 transition-colors',
              inputValue.trim()
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'bg-gray-100 text-gray-400'
            )}
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 工具调用卡片
// ============================================================================

function ToolCallCard({ call }: { call: ToolCallItem }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = call.content || call.details;

  const getIcon = () => {
    switch (call.type) {
      case 'thinking':
        return <Brain className="h-4 w-4" />;
      case 'outline':
        return <FileText className="h-4 w-4" />;
      case 'render':
        return <Palette className="h-4 w-4" />;
      case 'image':
        return <Eye className="h-4 w-4" />;
      case 'checkpoint':
        return <Save className="h-4 w-4" />;
      case 'step':
        return <Layers className="h-4 w-4" />;
      case 'data':
        return <Grid3X3 className="h-4 w-4" />;
      default:
        return <Brain className="h-4 w-4" />;
    }
  };

  const getStatusIcon = () => {
    switch (call.status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-orange-500" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusBg = () => {
    switch (call.status) {
      case 'running':
        return 'border-orange-200 bg-orange-50';
      case 'completed':
        return 'border-gray-200 bg-white';
      case 'error':
        return 'border-red-200 bg-red-50';
    }
  };

  // 渲染详细信息
  const renderDetails = () => {
    if (!call.details) return null;

    const details = call.details as {
      dataPoints?: Array<{ type: string; value: string; context: string }>;
      insights?: string[];
    };

    return (
      <div className="space-y-2">
        {details.dataPoints && details.dataPoints.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">
              数据点
            </div>
            <div className="space-y-1">
              {details.dataPoints.map((dp, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded bg-blue-50 px-2 py-1 text-xs"
                >
                  <span className="font-semibold text-blue-700">
                    {dp.value}
                  </span>
                  <span className="text-gray-600">{dp.context}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {details.insights && details.insights.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">
              关键洞察
            </div>
            <div className="space-y-1">
              {details.insights.map((insight, i) => (
                <div
                  key={i}
                  className="rounded bg-green-50 px-2 py-1 text-xs text-green-700"
                >
                  💡 {insight}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn('rounded-lg border', getStatusBg())}>
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-3 text-left"
        disabled={!hasDetails}
      >
        <div
          className={cn(
            'flex-shrink-0',
            call.status === 'running'
              ? 'text-orange-500'
              : call.status === 'error'
                ? 'text-red-500'
                : 'text-gray-500'
          )}
        >
          {getIcon()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-900">
            {call.title}
          </div>
          {call.content && !expanded && (
            <div className="mt-0.5 truncate text-xs text-gray-500">
              {call.content.split('\n')[0]}
            </div>
          )}
          <div className="mt-0.5 text-[10px] text-gray-400">
            {call.timestamp.toLocaleTimeString()}
          </div>
        </div>
        {getStatusIcon()}
        {hasDetails && (
          <ChevronDown
            className={cn(
              'h-4 w-4 flex-shrink-0 text-gray-400 transition-transform',
              expanded ? '' : '-rotate-90'
            )}
          />
        )}
      </button>

      <AnimatePresence>
        {expanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-gray-100 p-3">
              {call.content && (
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-600">
                  {call.content}
                </pre>
              )}
              {renderDetails()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// 大纲项
// ============================================================================

function OutlineItem({
  page,
  index,
  isSelected,
  onClick,
}: {
  page: PageOutline;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
        isSelected
          ? 'bg-orange-100 ring-1 ring-orange-300'
          : 'bg-slate-50 hover:bg-slate-100'
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[10px] font-medium',
          isSelected
            ? 'bg-orange-500 text-white'
            : 'bg-orange-100 text-orange-600'
        )}
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate font-medium',
            isSelected ? 'text-orange-700' : 'text-slate-700'
          )}
        >
          {page.title}
        </div>
        <div className="truncate text-[10px] text-slate-400">
          {page.templateType}
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// 预览面板 - 右侧
// ============================================================================

type ViewMode = 'preview' | 'code' | 'thinking';

function PreviewPanel() {
  const { pages, selectedPageIndex, setSelectedPageIndex } = useSlidesStore();
  const currentPage = pages[selectedPageIndex];
  const containerRef = useRef<HTMLDivElement>(null);
  const thumbnailStripRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const lastWheelTime = useRef<number>(0);
  const accumulatedDelta = useRef<number>(0);

  // 鼠标滚轮切换页面（仅垂直滚动时，允许水平滚动正常工作）
  // 添加防抖和阈值控制，防止滚动太快
  const handleThumbnailWheel = useCallback(
    (e: React.WheelEvent) => {
      if (pages.length <= 1) return;

      // 如果是水平滚动（deltaX 大于 deltaY），让原生滚动处理
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        return; // 不阻止默认行为，允许水平滚动
      }

      // 垂直滚动时切换页面
      e.preventDefault();

      const now = Date.now();
      const timeSinceLastWheel = now - lastWheelTime.current;

      // 如果距离上次滚动超过 150ms，重置累积值
      if (timeSinceLastWheel > 150) {
        accumulatedDelta.current = 0;
      }

      // 累积滚动量
      accumulatedDelta.current += e.deltaY;

      // 需要累积足够的滚动量才触发翻页（阈值 50）
      // 并且距离上次翻页至少 200ms（防抖）
      if (
        Math.abs(accumulatedDelta.current) >= 50 &&
        timeSinceLastWheel >= 200
      ) {
        if (accumulatedDelta.current > 0) {
          // 下一页
          setSelectedPageIndex(
            Math.min(selectedPageIndex + 1, pages.length - 1)
          );
        } else {
          // 上一页
          setSelectedPageIndex(Math.max(selectedPageIndex - 1, 0));
        }
        // 重置
        accumulatedDelta.current = 0;
        lastWheelTime.current = now;
      }
    },
    [pages.length, selectedPageIndex, setSelectedPageIndex]
  );

  // 自动滚动缩略图到当前选中页
  useEffect(() => {
    if (thumbnailStripRef.current && pages.length > 0) {
      const strip = thumbnailStripRef.current;
      const selectedThumb = strip.children[selectedPageIndex] as HTMLElement;
      if (selectedThumb) {
        selectedThumb.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      }
    }
  }, [selectedPageIndex, pages.length]);

  // 使用 ResizeObserver 监听容器尺寸变化
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 初始化时立即获取尺寸
    const rect = container.getBoundingClientRect();
    setDimensions({ width: rect.width, height: rect.height });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // 固定画布尺寸 (16:9)
  const SLIDE_WIDTH = 1280;
  const SLIDE_HEIGHT = 720;
  const PADDING = 24;

  // 检查容器尺寸是否已正确测量
  const isDimensionsReady = dimensions.width > 100 && dimensions.height > 100;

  // 计算可用空间 - 只在尺寸准备好后使用真实值
  const availableWidth = isDimensionsReady ? dimensions.width - PADDING : 800; // 默认宽度
  const availableHeight = isDimensionsReady ? dimensions.height - PADDING : 450; // 默认高度 (16:9)

  // 计算缩放比例，保持宽高比，允许放大以填充空间
  const scaleX = availableWidth / SLIDE_WIDTH;
  const scaleY = availableHeight / SLIDE_HEIGHT;
  const scale = Math.min(scaleX, scaleY); // 移除最大 1 的限制，允许放大

  // 缩放后的尺寸
  const scaledWidth = Math.floor(SLIDE_WIDTH * scale);
  const scaledHeight = Math.floor(SLIDE_HEIGHT * scale);

  // 为 iframe 内容添加缩放样式 - 使用内部缩放而非外部 transform
  // 这样渲染更清晰，因为浏览器会重新渲染而不是缩放像素
  const enhanceHtmlForClarity = useCallback(
    (html: string, zoomScale: number): string => {
      // 注入缩放和字体平滑样式
      const enhancementStyles = `
      <style>
        * {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }
        html {
          zoom: ${zoomScale};
        }
        body {
          margin: 0;
          padding: 0;
          width: ${SLIDE_WIDTH}px;
          height: ${SLIDE_HEIGHT}px;
          overflow: hidden;
        }
      </style>
    `;
      // 在 </head> 前插入样式
      if (html.includes('</head>')) {
        return html.replace('</head>', enhancementStyles + '</head>');
      }
      // 如果没有 head，在 body 前插入
      if (html.includes('<body')) {
        return html.replace('<body', enhancementStyles + '<body');
      }
      return enhancementStyles + html;
    },
    []
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-gradient-to-br from-slate-100 to-slate-200">
      {/* 缩略图区域 - 支持鼠标滚轮切换页面和水平滚动 */}
      <div
        className="flex-shrink-0 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur-sm"
        onWheel={handleThumbnailWheel}
      >
        <div
          ref={thumbnailStripRef}
          className="scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent flex items-center gap-2 overflow-x-auto pb-1"
        >
          {pages.length === 0 ? (
            <div className="flex h-14 w-full items-center justify-center text-sm text-slate-500">
              <Layers className="mr-2 h-4 w-4 opacity-50" />
              开始生成后将显示缩略图
            </div>
          ) : (
            pages.map((page, index) => (
              <ThumbnailCard
                key={page.pageNumber}
                page={page}
                index={index}
                isSelected={index === selectedPageIndex}
                onClick={() => setSelectedPageIndex(index)}
              />
            ))
          )}
        </div>
      </div>

      {/* 视图模式切换标签 - Preview | Code | Thinking */}
      <div className="flex-shrink-0 border-b border-slate-200 bg-white/60 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('preview')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              viewMode === 'preview'
                ? 'bg-orange-100 text-orange-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            )}
          >
            <Eye className="h-4 w-4" />
            Preview
          </button>
          <button
            onClick={() => setViewMode('code')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              viewMode === 'code'
                ? 'bg-orange-100 text-orange-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            )}
          >
            <Terminal className="h-4 w-4" />
            Code
          </button>
          <button
            onClick={() => setViewMode('thinking')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              viewMode === 'thinking'
                ? 'bg-orange-100 text-orange-700 shadow-sm'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
            )}
          >
            <Brain className="h-4 w-4" />
            Thinking
          </button>

          {/* 右侧操作按钮 */}
          {currentPage?.html && viewMode === 'code' && (
            <div className="ml-auto">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(currentPage.html || '');
                }}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-700"
              >
                <Copy className="h-4 w-4" />
                Copy
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 主内容区域 - 根据 viewMode 显示不同内容 */}
      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 overflow-hidden"
      >
        {/* Preview 模式 */}
        {viewMode === 'preview' && (
          <div className="flex flex-1 items-center justify-center p-4">
            {currentPage ? (
              <div
                className="relative rounded-xl shadow-2xl ring-1 ring-slate-700/50"
                style={{
                  width: scaledWidth,
                  height: scaledHeight,
                  overflow: 'hidden',
                  willChange: 'transform',
                  backfaceVisibility: 'hidden',
                  perspective: 1000,
                }}
              >
                {currentPage.html ? (
                  <iframe
                    srcDoc={enhanceHtmlForClarity(currentPage.html, scale)}
                    style={{
                      width: scaledWidth,
                      height: scaledHeight,
                      border: 'none',
                      display: 'block',
                      backgroundColor: '#0f172a',
                    }}
                    sandbox="allow-scripts"
                  />
                ) : (
                  <div
                    className="flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900"
                    style={{ width: '100%', height: '100%' }}
                  >
                    {currentPage.status === 'generating' ? (
                      <div className="text-center">
                        <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-orange-400" />
                        <p className="text-sm font-medium text-slate-300">
                          正在生成第 {currentPage.pageNumber} 页...
                        </p>
                        <p className="mt-1 text-xs text-slate-500">请稍候</p>
                      </div>
                    ) : currentPage.status === 'error' ? (
                      <div className="text-center">
                        <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />
                        <p className="text-sm font-medium text-red-300">
                          {currentPage.error || '生成失败'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          请重试或检查内容
                        </p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Layers className="mx-auto mb-4 h-10 w-10 text-slate-600" />
                        <p className="text-sm font-medium text-slate-400">
                          等待生成...
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-200">
                  <Grid3X3 className="h-10 w-10 text-slate-400" />
                </div>
                <p className="text-lg font-medium text-slate-700">
                  开始生成演示文稿
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  在左侧输入内容并点击生成
                </p>
              </div>
            )}
          </div>
        )}

        {/* Code 模式 - 显示当前页面的 HTML 代码 */}
        {viewMode === 'code' && (
          <div className="flex-1 overflow-auto bg-slate-900 p-4">
            {currentPage?.html ? (
              <pre className="font-mono text-sm leading-relaxed text-slate-300">
                <code>{formatHtmlCode(currentPage.html)}</code>
              </pre>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Terminal className="mx-auto mb-4 h-10 w-10 text-slate-600" />
                  <p className="text-sm text-slate-500">
                    {currentPage
                      ? '代码将在生成完成后显示'
                      : '选择一个页面查看代码'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Thinking 模式 - 显示 AI 的思考过程 */}
        {viewMode === 'thinking' && (
          <div className="flex-1 overflow-auto bg-slate-50 p-4">
            {currentPage ? (
              <div className="space-y-4">
                {/* 页面大纲信息 */}
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <FileText className="h-4 w-4 text-orange-500" />
                    页面大纲
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-slate-500">标题: </span>
                      <span className="font-medium text-slate-700">
                        {currentPage.outline?.title || '未设置'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">模板类型: </span>
                      <span className="rounded bg-orange-100 px-2 py-0.5 text-orange-700">
                        {currentPage.outline?.templateType || '未知'}
                      </span>
                    </div>
                    {currentPage.outline?.keyPoints &&
                      currentPage.outline.keyPoints.length > 0 && (
                        <div>
                          <span className="text-slate-500">要点:</span>
                          <ul className="mt-1 list-inside list-disc space-y-1 text-slate-600">
                            {currentPage.outline.keyPoints.map((point, i) => (
                              <li key={i}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                </div>

                {/* 设计思考过程 - 4 步 */}
                {currentPage.design && (
                  <>
                    {/* Step 1: 草稿设计 */}
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                          1
                        </span>
                        Drafting 草稿设计
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-slate-500">风格: </span>
                          <span className="text-slate-700">
                            {currentPage.design.step1_drafting?.style || '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">情绪: </span>
                          <span className="text-slate-700">
                            {currentPage.design.step1_drafting?.mood || '-'}
                          </span>
                        </div>
                        {currentPage.design.step1_drafting?.coreElements && (
                          <div>
                            <span className="text-slate-500">核心元素:</span>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {currentPage.design.step1_drafting.coreElements.map(
                                (el, i) => (
                                  <span
                                    key={i}
                                    className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                                  >
                                    {el}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Step 2: 布局优化 */}
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                          2
                        </span>
                        Layout 布局优化
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-slate-500">对齐方式: </span>
                          <span className="text-slate-700">
                            {currentPage.design.step2_refiningLayout
                              ?.alignment || '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">图形位置: </span>
                          <span className="text-slate-700">
                            {currentPage.design.step2_refiningLayout
                              ?.graphicsPosition || '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">间距: </span>
                          <span className="text-slate-700">
                            {currentPage.design.step2_refiningLayout?.spacing ||
                              '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Step 3: 视觉规划 */}
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">
                          3
                        </span>
                        Visuals 视觉规划
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">背景色: </span>
                          {currentPage.design.step3_planningVisuals
                            ?.backgroundColor && (
                            <>
                              <span
                                className="inline-block h-4 w-4 rounded border border-slate-300"
                                style={{
                                  backgroundColor:
                                    currentPage.design.step3_planningVisuals
                                      .backgroundColor,
                                }}
                              />
                              <span className="font-mono text-xs text-slate-600">
                                {
                                  currentPage.design.step3_planningVisuals
                                    .backgroundColor
                                }
                              </span>
                            </>
                          )}
                        </div>
                        {currentPage.design.step3_planningVisuals
                          ?.accentColors && (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500">强调色:</span>
                            <div className="flex gap-1">
                              {currentPage.design.step3_planningVisuals.accentColors.map(
                                (color, i) => (
                                  <span
                                    key={i}
                                    className="inline-block h-4 w-4 rounded border border-slate-300"
                                    style={{ backgroundColor: color }}
                                    title={color}
                                  />
                                )
                              )}
                            </div>
                          </div>
                        )}
                        {currentPage.design.step3_planningVisuals
                          ?.decorations &&
                          currentPage.design.step3_planningVisuals.decorations
                            .length > 0 && (
                            <div>
                              <span className="text-slate-500">装饰元素:</span>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {currentPage.design.step3_planningVisuals.decorations.map(
                                  (dec, i) => (
                                    <span
                                      key={i}
                                      className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700"
                                    >
                                      {dec}
                                    </span>
                                  )
                                )}
                              </div>
                            </div>
                          )}
                      </div>
                    </div>

                    {/* Step 4: HTML 生成 */}
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
                          4
                        </span>
                        HTML 生成
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-slate-500">状态: </span>
                          <span
                            className={cn('rounded px-2 py-0.5', {
                              'bg-green-100 text-green-700': currentPage.html,
                              'bg-yellow-100 text-yellow-700':
                                !currentPage.html,
                            })}
                          >
                            {currentPage.html ? '已生成' : '待生成'}
                          </span>
                        </div>
                        {currentPage.design.step4_formulatingHTML
                          ?.templateUsed && (
                          <div>
                            <span className="text-slate-500">使用模板: </span>
                            <span className="rounded bg-orange-100 px-2 py-0.5 text-orange-700">
                              {
                                currentPage.design.step4_formulatingHTML
                                  .templateUsed
                              }
                            </span>
                          </div>
                        )}
                        {currentPage.design.step4_formulatingHTML
                          ?.sectionsCount !== undefined && (
                          <div>
                            <span className="text-slate-500">内容区块: </span>
                            <span className="text-slate-700">
                              {
                                currentPage.design.step4_formulatingHTML
                                  .sectionsCount
                              }{' '}
                              个
                            </span>
                          </div>
                        )}
                        {currentPage.design.step4_formulatingHTML?.hasImages !==
                          undefined && (
                          <div>
                            <span className="text-slate-500">包含图片: </span>
                            <span
                              className={cn('rounded px-2 py-0.5', {
                                'bg-green-100 text-green-700':
                                  currentPage.design.step4_formulatingHTML
                                    .hasImages,
                                'bg-slate-100 text-slate-600':
                                  !currentPage.design.step4_formulatingHTML
                                    .hasImages,
                              })}
                            >
                              {currentPage.design.step4_formulatingHTML
                                .hasImages
                                ? '是'
                                : '否'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* AI 完整思考过程 - 可折叠 */}
                    {currentPage.design.rawResponse && (
                      <details className="group rounded-lg border border-slate-200 bg-white">
                        <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                          <Brain className="h-4 w-4 text-orange-500" />
                          AI 完整思考过程
                          <ChevronRight className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open:rotate-90" />
                        </summary>
                        <div className="border-t border-slate-100 p-4">
                          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-600">
                            {currentPage.design.rawResponse}
                          </pre>
                        </div>
                      </details>
                    )}
                  </>
                )}

                {/* 如果没有设计数据 */}
                {!currentPage.design && (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                    <Brain className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                    <p className="text-sm text-slate-500">
                      {currentPage.status === 'generating'
                        ? '正在思考中...'
                        : '设计思考数据将在生成时显示'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Brain className="mx-auto mb-4 h-10 w-10 text-slate-400" />
                  <p className="text-sm text-slate-500">
                    选择一个页面查看 AI 思考过程
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 属性面板 */}
      {currentPage && (
        <div className="flex-shrink-0 border-t border-slate-200 bg-white/90 px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">模板:</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  {currentPage.outline?.templateType || '未知'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">状态:</span>
                <span
                  className={cn('rounded px-2 py-0.5 font-medium', {
                    'bg-green-100 text-green-700':
                      currentPage.status === 'completed',
                    'bg-orange-100 text-orange-700':
                      currentPage.status === 'generating',
                    'bg-red-100 text-red-700': currentPage.status === 'error',
                    'bg-slate-100 text-slate-600':
                      currentPage.status === 'pending',
                  })}
                >
                  {getStatusText(currentPage.status)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-slate-700">
                {selectedPageIndex + 1}
              </span>
              <span className="text-slate-400">/</span>
              <span className="text-slate-500">{pages.length} 页</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 缩略图卡片
// ============================================================================

function ThumbnailCard({
  page,
  index,
  isSelected,
  onClick,
}: {
  page: PageState;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative aspect-[16/9] w-24 flex-shrink-0 overflow-hidden rounded-lg transition-all',
        isSelected
          ? 'shadow-lg ring-2 ring-orange-500 ring-offset-2'
          : 'ring-1 ring-slate-200 hover:ring-slate-300'
      )}
    >
      {page.html ? (
        <div
          className="pointer-events-none h-full w-full bg-slate-900"
          style={{
            transform: 'scale(0.1)',
            transformOrigin: 'top left',
            width: '1000%',
            height: '1000%',
          }}
          dangerouslySetInnerHTML={{ __html: page.html }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
          {page.status === 'generating' ? (
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          ) : page.status === 'error' ? (
            <AlertCircle className="h-4 w-4 text-red-500" />
          ) : (
            <span className="text-xs font-medium text-slate-400">
              {index + 1}
            </span>
          )}
        </div>
      )}

      <div className="absolute bottom-1 right-1 rounded bg-black/50 px-1 text-[10px] text-white">
        {index + 1}
      </div>
    </button>
  );
}

// ============================================================================
// 底部进度条
// ============================================================================

function ProgressBar() {
  const overallProgress = useSlidesStore(selectOverallProgress);
  const { progress, pages, generating } = useSlidesStore();
  const { checkpoints } = useCheckpoints();

  if (!generating && pages.length === 0) {
    return null;
  }

  const completedPages = pages.filter((p) => p.status === 'completed').length;
  const latestCheckpoint = checkpoints[0];

  return (
    <div className="flex h-12 flex-shrink-0 items-center justify-between border-t border-gray-200 bg-white px-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-48 overflow-hidden rounded-full bg-gray-200">
            <motion.div
              className="h-full bg-gradient-to-r from-orange-500 to-orange-400"
              initial={{ width: 0 }}
              animate={{ width: `${overallProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-sm font-medium text-gray-700">
            {overallProgress}%
          </span>
        </div>

        <span className="text-sm text-gray-500">
          {completedPages} / {pages.length} 页
        </span>
      </div>

      {latestCheckpoint && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Save className="h-4 w-4" />
          <span>检查点: {latestCheckpoint.name}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 输入表单（初始状态）
// ============================================================================

function InitialInputForm({
  onGenerate,
  onCancel,
}: {
  onGenerate: (request: GenerateRequest) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [targetPages, setTargetPages] = useState(10);
  const [themeId, setThemeId] = useState<SlideThemeId>('genspark-dark');
  const { generating } = useSlidesStore();

  const handleSubmit = useCallback(() => {
    if (!title.trim() || !sourceText.trim()) return;
    onGenerate({
      title: title.trim(),
      sourceText: sourceText.trim(),
      targetPages,
      stylePreference: 'dark',
      themeId,
    });
  }, [title, sourceText, targetPages, themeId, onGenerate]);

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-gray-50">
      <div className="flex-1 overflow-auto p-8">
        <div className="mx-auto w-full max-w-2xl">
          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                创建新的演示文稿
              </h2>
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  取消
                </button>
              )}
            </div>

            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  标题
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入演示文稿标题..."
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  素材内容
                </label>
                <textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  placeholder="粘贴要转换为幻灯片的文本内容..."
                  rows={8}
                  className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  目标页数: {targetPages} 页
                </label>
                <input
                  type="range"
                  min={5}
                  max={30}
                  value={targetPages}
                  onChange={(e) => setTargetPages(parseInt(e.target.value))}
                  className="w-full accent-orange-500"
                />
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>5 页</span>
                  <span>30 页</span>
                </div>
              </div>

              {/* 主题选择 */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  主题风格
                </label>
                <ThemeSelector
                  value={themeId}
                  onChange={setThemeId}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-3"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 固定在底部的按钮 */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white p-4">
        <div className="mx-auto w-full max-w-2xl">
          <button
            onClick={handleSubmit}
            disabled={generating || !title.trim() || !sourceText.trim()}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg py-4 text-base font-medium transition-colors',
              generating || !title.trim() || !sourceText.trim()
                ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                : 'bg-orange-500 text-white hover:bg-orange-600'
            )}
          >
            {generating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Layers className="h-5 w-5" />
                开始生成
              </>
            )}
          </button>
        </div>
      </div>
    </main>
  );
}

// ============================================================================
// Sessions 画廊组件
// ============================================================================

function SessionsGallery({
  backendSessions,
  localHistory,
  viewMode,
  onRestoreSession,
  onRestoreHistory,
  onNewClick,
  loading,
  restoring,
  onUpdateSession,
  onDeleteSession,
}: {
  backendSessions: SessionWithCheckpoint[];
  localHistory: SlidesHistoryItem[];
  viewMode: 'grid' | 'list';
  onRestoreSession: (session: SessionWithCheckpoint) => void;
  onRestoreHistory: (item: SlidesHistoryItem) => void;
  onNewClick: () => void;
  loading?: boolean;
  restoring?: boolean;
  onUpdateSession?: (sessionId: string, title: string) => Promise<boolean>;
  onDeleteSession?: (sessionId: string) => Promise<boolean>;
}) {
  // 优先使用后端会话，如果没有则使用本地历史
  const hasBackendSessions = backendSessions.length > 0;
  const localSessions = localHistory.filter(
    (item) => item.sessionId && item.status === 'success'
  );

  if (loading) {
    return (
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center bg-gray-50 p-8">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-orange-500" />
          <p className="text-sm text-gray-500">加载历史记录...</p>
        </div>
      </main>
    );
  }

  if (!hasBackendSessions && localSessions.length === 0) {
    return (
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center bg-gray-50 p-8">
        <div className="text-center">
          <FolderOpen className="mx-auto mb-4 h-16 w-16 text-gray-300" />
          <h2 className="mb-2 text-lg font-medium text-gray-900">
            还没有演示文稿
          </h2>
          <p className="mb-6 text-sm text-gray-500">
            点击新建按钮创建您的第一个 AI 演示文稿
          </p>
          <button
            onClick={onNewClick}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-medium text-white hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            新建演示文稿
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-gray-50">
      {/* 恢复加载遮罩 */}
      {restoring && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80">
          <div className="text-center">
            <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-orange-500" />
            <p className="text-sm font-medium text-gray-600">
              正在恢复演示文稿...
            </p>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto p-6">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {/* 后端会话 */}
            {backendSessions.map((session) => (
              <BackendSessionCard
                key={session.id}
                session={session}
                onClick={() => onRestoreSession(session)}
                onUpdate={onUpdateSession}
                onDelete={onDeleteSession}
              />
            ))}
            {/* 本地历史（只显示不在后端的） */}
            {!hasBackendSessions &&
              localSessions.map((item) => (
                <SessionGridCard
                  key={item.id}
                  item={item}
                  onClick={() => onRestoreHistory(item)}
                />
              ))}
          </div>
        ) : (
          <div className="space-y-2">
            {/* 后端会话 */}
            {backendSessions.map((session) => (
              <BackendSessionListItem
                key={session.id}
                session={session}
                onClick={() => onRestoreSession(session)}
                onUpdate={onUpdateSession}
                onDelete={onDeleteSession}
              />
            ))}
            {/* 本地历史 */}
            {!hasBackendSessions &&
              localSessions.map((item) => (
                <SessionListItem
                  key={item.id}
                  item={item}
                  onClick={() => onRestoreHistory(item)}
                />
              ))}
          </div>
        )}
      </div>
    </main>
  );
}

// 后端会话卡片
function BackendSessionCard({
  session,
  onClick,
  onUpdate,
  onDelete,
}: {
  session: SessionWithCheckpoint;
  onClick: () => void;
  onUpdate?: (sessionId: string, title: string) => Promise<boolean>;
  onDelete?: (sessionId: string) => Promise<boolean>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSaveEdit = async () => {
    if (onUpdate && editTitle.trim() && editTitle !== session.title) {
      await onUpdate(session.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!onDelete) {
      console.warn('[SessionCard] onDelete is not provided');
      return;
    }
    if (!confirm('确定要删除这个演示文稿吗？此操作不可撤销。')) return;
    setIsDeleting(true);
    try {
      const success = await onDelete(session.id);
      if (!success) {
        alert('删除失败，请重试');
      }
    } catch (error) {
      console.error('[SessionCard] Delete error:', error);
      alert(
        '删除失败: ' + (error instanceof Error ? error.message : '未知错误')
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditTitle(session.title);
    }
  };

  const pagesCount = session.latestCheckpoint?.pagesCount ?? 0;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition-all hover:border-orange-300 hover:shadow-lg">
      {/* 缩略图区域 - 显示标题预览 */}
      <button
        onClick={onClick}
        className="relative aspect-[16/9] bg-gradient-to-br from-slate-800 to-slate-900"
      >
        {/* 封面内容预览 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
          <Layers className="mb-2 h-6 w-6 text-slate-500" />
          <h3 className="line-clamp-2 text-center text-sm font-medium text-white/90">
            {session.title || '无标题'}
          </h3>
        </div>
        {/* 页数标签 */}
        <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
          {pagesCount > 0 ? `${pagesCount} 页` : '空'}
        </div>
        {/* 来源标识 */}
        <div className="absolute left-2 top-2 rounded bg-green-500/80 px-1.5 py-0.5 text-xs text-white">
          已保存
        </div>
      </button>

      {/* 信息和操作按钮 */}
      <div className="flex-1 p-3">
        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              className="flex-1 rounded border border-orange-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <button onClick={onClick} className="min-w-0 flex-1 text-left">
              <h3 className="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-orange-600">
                {session.title}
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                {formatRelativeTime(session.updatedAt)}
              </p>
            </button>

            {/* 操作菜单 */}
            <div className="relative flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="rounded p-1 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              {showMenu && (
                <>
                  {/* 点击外部关闭菜单的遮罩层 */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                    }}
                  />
                  {/* 下拉菜单 - 向上弹出避免被截断 */}
                  <div className="absolute bottom-full right-0 z-50 mb-1 w-28 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsEditing(true);
                        setShowMenu(false);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      重命名
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenu(false);
                        handleDelete();
                      }}
                      disabled={isDeleting}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      删除
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// 后端会话列表项
function BackendSessionListItem({
  session,
  onClick,
  onUpdate,
  onDelete,
}: {
  session: SessionWithCheckpoint;
  onClick: () => void;
  onUpdate?: (sessionId: string, title: string) => Promise<boolean>;
  onDelete?: (sessionId: string) => Promise<boolean>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const [isDeleting, setIsDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSaveEdit = async () => {
    if (onUpdate && editTitle.trim() && editTitle !== session.title) {
      await onUpdate(session.id, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!onDelete) {
      console.warn('[SessionCard] onDelete is not provided');
      return;
    }
    if (!confirm('确定要删除这个演示文稿吗？此操作不可撤销。')) return;
    setIsDeleting(true);
    try {
      const success = await onDelete(session.id);
      if (!success) {
        alert('删除失败，请重试');
      }
    } catch (error) {
      console.error('[SessionCard] Delete error:', error);
      alert(
        '删除失败: ' + (error instanceof Error ? error.message : '未知错误')
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditTitle(session.title);
    }
  };

  return (
    <div className="group flex w-full items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 text-left transition-all hover:border-orange-300 hover:bg-orange-50">
      {/* 缩略图 - 可点击 */}
      <button
        onClick={onClick}
        className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-slate-800 to-slate-900"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Layers className="h-6 w-6 text-slate-600" />
        </div>
        {/* 来源标识 */}
        <div className="absolute left-1 top-1 rounded bg-green-500/80 px-1 py-0.5 text-[10px] text-white">
          已保存
        </div>
      </button>

      {/* 信息 */}
      <div className="min-w-0 flex-1">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSaveEdit}
            className="w-full rounded border border-orange-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button onClick={onClick} className="w-full text-left">
            <h3 className="truncate text-sm font-medium text-gray-900">
              {session.title}
            </h3>
            <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
              <span>{formatRelativeTime(session.updatedAt)}</span>
              <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-600">
                {(session.latestCheckpoint?.pagesCount ?? 0) > 0
                  ? `${session.latestCheckpoint?.pagesCount} 页`
                  : '空'}
              </span>
            </div>
          </button>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="重命名"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          disabled={isDeleting}
          className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
          title="删除"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* 箭头 */}
      <button onClick={onClick}>
        <ChevronDown className="h-5 w-5 -rotate-90 text-gray-400" />
      </button>
    </div>
  );
}

// 网格卡片
function SessionGridCard({
  item,
  onClick,
}: {
  item: SlidesHistoryItem;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition-all hover:border-orange-300 hover:shadow-lg"
    >
      {/* 缩略图占位 */}
      <div className="relative aspect-[16/9] bg-gradient-to-br from-slate-800 to-slate-900">
        <div className="absolute inset-0 flex items-center justify-center">
          <Layers className="h-8 w-8 text-slate-600" />
        </div>
        <div className="absolute bottom-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
          {item.targetPages || '?'} 页
        </div>
      </div>

      {/* 信息 */}
      <div className="flex-1 p-3">
        <h3 className="line-clamp-2 text-sm font-medium text-gray-900 group-hover:text-orange-600">
          {item.title}
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          {formatRelativeTime(item.timestamp)}
        </p>
      </div>
    </button>
  );
}

// 列表项
function SessionListItem({
  item,
  onClick,
}: {
  item: SlidesHistoryItem;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 text-left transition-all hover:border-orange-300 hover:bg-orange-50"
    >
      {/* 缩略图 */}
      <div className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-slate-800 to-slate-900">
        <div className="absolute inset-0 flex items-center justify-center">
          <Layers className="h-6 w-6 text-slate-600" />
        </div>
      </div>

      {/* 信息 */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-gray-900">
          {item.title}
        </h3>
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
          <span>{formatRelativeTime(item.timestamp)}</span>
          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-600">
            {item.targetPages || '?'} 页
          </span>
        </div>
      </div>

      {/* 箭头 */}
      <ChevronDown className="h-5 w-5 -rotate-90 text-gray-400" />
    </button>
  );
}

// ============================================================================
// 工具函数
// ============================================================================

function getPhaseTitle(phase: string): string {
  const titles: Record<string, string> = {
    task_decomposition: '🧠 深度思考 - 任务分解',
    outline_planning: '📄 大纲规划',
    page_rendering: '🎨 页面渲染',
    quality_review: '✅ 质量检查',
  };
  return titles[phase] || phase;
}

function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    pending: '等待中',
    generating: '生成中',
    completed: '已完成',
    error: '失败',
  };
  return texts[status] || status;
}

/**
 * 格式化 HTML 代码，添加缩进以提高可读性
 */
function formatHtmlCode(html: string): string {
  try {
    let formatted = '';
    let indent = 0;
    const lines = html.split(/>\s*</);

    lines.forEach((line, i) => {
      // 检测是否为自闭合标签或闭合标签
      const isClosingTag = line.match(/^\/\w/);
      const isSelfClosing = line.match(/\/$/);
      const isOpeningTag =
        line.match(/^<?\w/) && !isClosingTag && !isSelfClosing;

      if (isClosingTag) {
        indent = Math.max(0, indent - 1);
      }

      const prefix = i === 0 ? '' : '<';
      const suffix = i === lines.length - 1 ? '' : '>';
      formatted += '  '.repeat(indent) + prefix + line + suffix + '\n';

      if (isOpeningTag && !isSelfClosing) {
        indent++;
      }
    });

    return formatted.trim();
  } catch {
    return html; // 如果格式化失败，返回原始代码
  }
}

export default SlidesTab;
