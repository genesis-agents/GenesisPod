'use client';

/**
 * Slides Engine - ä¸»é¡µé¢ç»„ä»¶
 *
 * æ ¹æ®è®¾è®¡æ–‡æ¡£ Section 7 å®žçŽ°ï¼š
 * - æµ…è‰²ä¸»é¢˜ï¼Œä¸Žé¡¹ç›®æ•´ä½“é£Žæ ¼ä¸€è‡´
 * - ä¸¤æ å¸ƒå±€ï¼šå¯¹è¯é¢æ¿ + é¢„è§ˆé¢æ¿
 * - åº•éƒ¨è¿›åº¦æ¡
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
import type { GenerateTeamRequest, SlidesTeamEvent } from '@/types/slides-team';
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
// ç±»åž‹å®šä¹‰
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

// â˜… @ Mention é€‰é¡¹å®šä¹‰
const MENTION_OPTIONS = [
  {
    id: 'leader',
    label: '@leader',
    description: 'è®© Leader åˆ†å‘ä»»åŠ¡ç»™å›¢é˜Ÿ',
    icon: Crown,
    color: 'text-amber-500',
  },
  {
    id: 'analyst',
    label: '@analyst',
    description: 'è®©åˆ†æžå¸ˆåˆ†æžå†…å®¹',
    icon: Search,
    color: 'text-blue-500',
  },
  {
    id: 'writer',
    label: '@writer',
    description: 'è®©å†™æ‰‹ä¿®æ”¹æˆ–é‡å†™å†…å®¹',
    icon: PenTool,
    color: 'text-green-500',
  },
  {
    id: 'reviewer',
    label: '@reviewer',
    description: 'è®©å®¡æ ¸å‘˜æ£€æŸ¥è´¨é‡',
    icon: CheckCircle,
    color: 'text-purple-500',
  },
  {
    id: 'team',
    label: '@team',
    description: 'é€šçŸ¥æ•´ä¸ªå›¢é˜Ÿ',
    icon: Users,
    color: 'text-orange-500',
  },
];

// ============================================================================
// ä¸»ç»„ä»¶
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

  // é‡ç½®å›žåˆ°åŽ†å²è®°å½•ç”»å»Š
  const handleBackToGallery = useCallback(() => {
    const { reset } = useSlidesStore.getState();
    reset();
    setShowNewForm(false);
    refreshSessions();
  }, [refreshSessions]);

  // â˜… æ¸…ç†ä¸ä¸€è‡´çš„çŠ¶æ€ï¼šå¦‚æžœ generating=true ä½†æ²¡æœ‰æ´»è·ƒçš„ç”Ÿæˆè¿›ç¨‹ï¼Œé‡ç½®çŠ¶æ€
  // è¿™å¯èƒ½å‘ç”Ÿåœ¨é¡µé¢åˆ·æ–°æˆ–ä¸­é€”å…³é—­åŽé‡æ–°æ‰“å¼€æ—¶
  useEffect(() => {
    const store = useSlidesStore.getState();
    // å¦‚æžœæ ‡è®°ä¸ºç”Ÿæˆä¸­ï¼Œä½†æ²¡æœ‰ teamStateï¼ˆå³æ²¡æœ‰æ´»è·ƒçš„ SSE è¿žæŽ¥ï¼‰ï¼Œè¯´æ˜Žæ˜¯æ®‹ç•™çŠ¶æ€
    if (store.generating && !teamState) {
      console.log(
        '[SlidesTab] Cleaning up stale generating state, resetting to gallery'
      );
      store.reset(); // å®Œå…¨é‡ç½®ï¼Œå›žåˆ°ç”»å»Šè§†å›¾
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // åªåœ¨æŒ‚è½½æ—¶æ‰§è¡Œä¸€æ¬¡

  // â˜… è‡ªåŠ¨éšè—åŽ†å²è®°å½•ï¼šå½“æœ‰æ´»è·ƒä¼šè¯ã€é¡µé¢å†…å®¹æˆ–æ­£åœ¨ç”Ÿæˆæ—¶
  useEffect(() => {
    if (session || pages.length > 0 || generating) {
      setShowHistory(false);
    }
  }, [session, pages.length, generating]);

  // å°† streamEvents å’Œ teamEvents è½¬æ¢ä¸º toolCalls
  // ç²¾ç®€ç‰ˆï¼šåªæ˜¾ç¤ºå…³é”®èŠ‚ç‚¹ï¼ŒAgent çŠ¶æ€ç”± AgentTeamPanel è´Ÿè´£
  // ç›®æ ‡ï¼šæœ€å¤šæ˜¾ç¤º 5-8 ä¸ªæ¡ç›®ï¼Œè€Œä¸æ˜¯ 20+ ä¸ª
  useEffect(() => {
    const calls: ToolCallItem[] = [];
    let hasExecutionStarted = false;
    let hasExecutionCompleted = false;
    let totalPagesGenerated = 0;

    // åªå¤„ç† teamEventsï¼ˆæ–°æ ¼å¼ï¼‰ï¼Œå¿½ç•¥æ—§æ ¼å¼çš„ streamEvents
    teamEvents.forEach((event) => {
      const id = `team-${event.type}-${event.timestamp}`;

      // 1. å¼€å§‹äº‹ä»¶ - åªæ˜¾ç¤ºä¸€æ¬¡
      if (event.type === 'execution:started') {
        if (!hasExecutionStarted) {
          hasExecutionStarted = true;
          calls.push({
            id,
            type: 'step',
            title: 'ðŸš€ å¼€å§‹ç”Ÿæˆ',
            status: 'completed',
            timestamp: new Date(event.timestamp),
          });
        }
      }
      // 2. é˜¶æ®µå®Œæˆäº‹ä»¶ - åªæ˜¾ç¤ºä¸»è¦é˜¶æ®µçš„å®Œæˆï¼ˆä¸æ˜¾ç¤ºå¼€å§‹ï¼‰
      else if (event.type === 'phase:completed') {
        const eventData = event.data as {
          phase: string;
          result?: Record<string, unknown>;
        };

        // åªæ˜¾ç¤ºå…³é”®é˜¶æ®µå®Œæˆ
        const keyPhases = ['analyzing', 'planning', 'generating', 'reviewing'];
        if (keyPhases.includes(eventData.phase)) {
          const phaseNames: Record<string, string> = {
            analyzing: 'ðŸ“Š å†…å®¹åˆ†æžå®Œæˆ',
            planning: 'ðŸ“ å¤§çº²è§„åˆ’å®Œæˆ',
            generating: 'ðŸŽ¨ é¡µé¢ç”Ÿæˆå®Œæˆ',
            reviewing: 'âœ… è´¨é‡æ£€æŸ¥å®Œæˆ',
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
      // 3. é¡µé¢ç”Ÿæˆ - åªç»Ÿè®¡æ•°é‡ï¼Œä¸å•ç‹¬æ˜¾ç¤ºæ¯é¡µ
      else if (event.type === 'slide:generated') {
        totalPagesGenerated++;
      }
      // 4. å®Œæˆäº‹ä»¶ - åªæ˜¾ç¤ºä¸€æ¬¡
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
            title: 'ðŸŽ‰ ç”Ÿæˆå®Œæˆ',
            content: data.totalPages
              ? `å…± ${data.totalPages} é¡µï¼Œè€—æ—¶ ${((data.totalTime || 0) / 1000).toFixed(1)}s`
              : totalPagesGenerated > 0
                ? `å…± ${totalPagesGenerated} é¡µ`
                : undefined,
            status: 'completed',
            timestamp: new Date(event.timestamp),
          });
        }
      }
      // 5. å¤±è´¥äº‹ä»¶
      else if (event.type === 'execution:failed') {
        const data = event.data as { error?: string };
        calls.push({
          id,
          type: 'step',
          title: 'âŒ ç”Ÿæˆå¤±è´¥',
          content: data.error,
          status: 'error',
          timestamp: new Date(event.timestamp),
        });
      }
      // å…¶ä»–äº‹ä»¶ï¼ˆagent:*, phase:started, heartbeat ç­‰ï¼‰ä¸æ˜¾ç¤ºåœ¨æ—¶é—´çº¿
      // Agent çŠ¶æ€å®Œå…¨ç”± AgentTeamPanel è´Ÿè´£æ˜¾ç¤º
    });

    setToolCalls(calls);
  }, [streamEvents, teamEvents]);

  const handleSendMessage = useCallback((message: string) => {
    // æ·»åŠ ç”¨æˆ·æ¶ˆæ¯åˆ° streamEvents
    const { addStreamEvent, pages, selectedPageIndex } =
      useSlidesStore.getState();

    // æ·»åŠ ç”¨æˆ·æ¶ˆæ¯äº‹ä»¶
    addStreamEvent({
      type: 'user_message',
      timestamp: new Date(),
      data: {
        message,
        pageNumber: pages[selectedPageIndex]?.pageNumber,
      },
    });

    // TODO: å®žçŽ°åŽç«¯æŽ¥ç»­ç”Ÿæˆ API
    // ç›®å‰æ˜¾ç¤ºæç¤ºä¿¡æ¯
    const currentPage = pages[selectedPageIndex];
    if (currentPage) {
      addStreamEvent({
        type: 'system_message',
        timestamp: new Date(),
        data: {
          message: `æ”¶åˆ°æ‚¨å¯¹ç¬¬ ${currentPage.pageNumber} é¡µçš„ä¿®æ”¹å»ºè®®ã€‚æŽ¥ç»­ç¼–è¾‘åŠŸèƒ½æ­£åœ¨å¼€å‘ä¸­ï¼Œæ•¬è¯·æœŸå¾…ï¼`,
        },
      });
    } else {
      addStreamEvent({
        type: 'system_message',
        timestamp: new Date(),
        data: {
          message:
            'æ”¶åˆ°æ‚¨çš„åé¦ˆã€‚æŽ¥ç»­ç¼–è¾‘åŠŸèƒ½æ­£åœ¨å¼€å‘ä¸­ï¼Œæ•¬è¯·æœŸå¾…ï¼',
        },
      });
    }
  }, []);

  const handleCreateCheckpoint = useCallback(() => {
    createCheckpoint('ç”¨æˆ·ä¿å­˜ç‚¹');
  }, [createCheckpoint]);

  const handleGenerate = useCallback(
    (request: GenerateRequest) => {
      const historyId = addHistory({
        title: request.title,
        sourceText: request.sourceText.slice(0, 200),
        targetPages: request.targetPages || 10,
        status: 'pending',
      });
      currentHistoryIdRef.current = historyId;
      // è½¬æ¢ä¸º Team è¯·æ±‚æ ¼å¼
      const teamRequest: GenerateTeamRequest = {
        title: request.title,
        sourceText: request.sourceText,
        userRequirement: request.title, // åŒæ—¶ä½œä¸ºç”¨æˆ·éœ€æ±‚
        targetPages: request.targetPages,
        stylePreference: request.stylePreference,
        themeId: request.themeId,
      };
      generateWithTeam(teamRequest);
    },
    [generateWithTeam, addHistory]
  );

  // ç›‘å¬ session åˆ›å»ºå’Œå®Œæˆäº‹ä»¶ï¼Œæ›´æ–°åŽ†å²è®°å½•
  useEffect(() => {
    const historyId = currentHistoryIdRef.current;
    if (!historyId) return;

    // æŸ¥æ‰¾æœ€æ–°çš„ session_created å’Œ complete äº‹ä»¶
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

  // æ¢å¤åŽ†å²è®°å½•ï¼ˆlocalStorageï¼‰
  const handleRestoreHistory = useCallback(
    async (item: SlidesHistoryItem) => {
      setRestoring(true);
      try {
        // ä¼˜å…ˆä½¿ç”¨ checkpointIdï¼Œå¦‚æžœæ²¡æœ‰åˆ™ä½¿ç”¨ sessionId
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

  // æ¢å¤åŽç«¯ä¼šè¯
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
        // æ˜¾ç¤ºé”™è¯¯æç¤ºç»™ç”¨æˆ·
        alert(
          'æ¢å¤å¤±è´¥: ' +
            (err instanceof Error ? err.message : 'æœªçŸ¥é”™è¯¯')
        );
      } finally {
        setRestoring(false);
      }
    },
    [restoreCheckpoint, restoreBySessionId]
  );

  // åˆå§‹çŠ¶æ€ - æ˜¾ç¤º Sessions ç”»å»Šæˆ–è¾“å…¥è¡¨å•
  if (!session && pages.length === 0 && !generating) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-white">
        {/* å¤´éƒ¨ */}
        <Header
          showHistory={showHistory}
          onToggleHistory={() => setShowHistory(!showHistory)}
          onCreateCheckpoint={handleCreateCheckpoint}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onNewClick={() => setShowNewForm(true)}
          showViewToggle={!showNewForm}
        />

        {/* åŽ†å²è®°å½•é¢æ¿ */}
        <HistoryPanel
          show={showHistory}
          history={history}
          onRemove={removeHistory}
          onClear={clearHistory}
          onRestore={handleRestoreHistory}
        />

        {/* æ ¹æ®çŠ¶æ€æ˜¾ç¤ºç”»å»Šæˆ–è¾“å…¥è¡¨å• */}
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

  // ç”Ÿæˆä¸­æˆ–å·²æœ‰å†…å®¹ - æ˜¾ç¤ºä¸¤æ å¸ƒå±€
  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* å¤´éƒ¨ */}
      <Header
        title={session?.title}
        showHistory={showHistory}
        onToggleHistory={() => setShowHistory(!showHistory)}
        onCreateCheckpoint={handleCreateCheckpoint}
        showBackButton={true}
        onBackToGallery={handleBackToGallery}
        onStartPresentation={() => setShowPresentation(true)}
        hasPages={pages.length > 0}
      />

      {/* åŽ†å²è®°å½•é¢æ¿ */}
      <HistoryPanel
        show={showHistory}
        history={history}
        onRemove={removeHistory}
        onClear={clearHistory}
        onRestore={handleRestoreHistory}
      />

      {/* ä¸¤æ å¸ƒå±€ */}
      <div className="flex flex-1 overflow-hidden">
        <ConversationPanel
          onSendMessage={handleSendMessage}
          onCancel={cancel}
          toolCalls={toolCalls}
          generating={generating}
          progress={progress}
          outlinePlan={outlinePlan}
          teamState={teamState}
          teamEvents={teamEvents}
        />
        <PreviewPanel />
      </div>

      {/* åº•éƒ¨è¿›åº¦æ¡ */}
      <ProgressBar />

      {/* æ¼”ç¤ºæ¨¡å¼ */}
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
// PresentationMode ç»„ä»¶ - å…¨å±æ¼”ç¤º
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

  // ç¡®ä¿å®¹å™¨èŽ·å¾—ç„¦ç‚¹ï¼ˆé˜²æ­¢ iframe æŠ¢å ç„¦ç‚¹å¯¼è‡´é”®ç›˜äº‹ä»¶å¤±æ•ˆï¼‰
  useEffect(() => {
    // çŸ­æš‚å»¶è¿ŸåŽèšç„¦å®¹å™¨ï¼Œç¡®ä¿ DOM å·²æ¸²æŸ“
    const focusTimer = setTimeout(() => {
      containerRef.current?.focus();
    }, 100);
    return () => clearTimeout(focusTimer);
  }, []);

  // é”®ç›˜å¯¼èˆª - ä½¿ç”¨ capture æ¨¡å¼ç¡®ä¿ä¼˜å…ˆå¤„ç†
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ç¡®ä¿å®¹å™¨ä¿æŒç„¦ç‚¹
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

    // ä½¿ç”¨ capture æ¨¡å¼ä¼˜å…ˆæ•èŽ·é”®ç›˜äº‹ä»¶
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [pages.length, onClose]);

  // è¿›å…¥/é€€å‡ºå…¨å±
  useEffect(() => {
    const container = containerRef.current;
    if (container && document.fullscreenEnabled) {
      container.requestFullscreen?.().catch(() => {
        // å…¨å±è¯·æ±‚å¤±è´¥ï¼Œé™é»˜å¤„ç†
      });
    }

    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, []);

  const currentPage = pages[currentIndex];

  // å›ºå®šç”»å¸ƒå°ºå¯¸ (16:9)
  const SLIDE_WIDTH = 1280;
  const SLIDE_HEIGHT = 720;

  // è®¡ç®—å…¨å±ç¼©æ”¾
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const screenHeight =
    typeof window !== 'undefined' ? window.innerHeight : 1080;
  const scaleX = screenWidth / SLIDE_WIDTH;
  const scaleY = screenHeight / SLIDE_HEIGHT;
  const scale = Math.min(scaleX, scaleY);

  const scaledWidth = Math.floor(SLIDE_WIDTH * scale);
  const scaledHeight = Math.floor(SLIDE_HEIGHT * scale);

  // ä¸º iframe æ·»åŠ ç¼©æ”¾æ ·å¼
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
        // ç‚¹å‡»ç©ºç™½åŒºåŸŸä¸‹ä¸€é¡µ
        if (e.target === e.currentTarget) {
          setCurrentIndex((prev) => Math.min(prev + 1, pages.length - 1));
        }
      }}
      onMouseMove={() => {
        // é¼ æ ‡ç§»åŠ¨æ—¶ç¡®ä¿å®¹å™¨èŽ·å¾—ç„¦ç‚¹
        containerRef.current?.focus();
      }}
    >
      {/* å¹»ç¯ç‰‡å†…å®¹ */}
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
              pointerEvents: 'none', // é˜²æ­¢ iframe æˆªèŽ·äº¤äº’
            }}
            tabIndex={-1} // é˜²æ­¢ iframe èŽ·å¾—ç„¦ç‚¹
            sandbox="allow-scripts"
          />
        ) : (
          <div className="text-center text-white">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin" />
            <p>åŠ è½½ä¸­...</p>
          </div>
        )}
      </div>

      {/* æŽ§åˆ¶æ  */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-6 py-4 opacity-0 transition-opacity hover:opacity-100">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
            title="é€€å‡ºæ¼”ç¤º (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
          <span className="text-sm text-white/80">
            æŒ‰ Esc é€€å‡º | æ–¹å‘é”®æˆ–ç©ºæ ¼åˆ‡æ¢é¡µé¢
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
// Header ç»„ä»¶
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
  showViewToggle?: boolean;
  showBackButton?: boolean;
  hasPages?: boolean;
}) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  return (
    <header className="flex-shrink-0 border-b border-gray-200 bg-white">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          {/* è¿”å›žæŒ‰é’® */}
          {showBackButton && onBackToGallery && (
            <button
              onClick={onBackToGallery}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              title="è¿”å›žåŽ†å²è®°å½•"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-orange-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">
              {title || 'AI æ¼”ç¤ºæ–‡ç¨¿'}
            </h1>
            <p className="text-xs text-gray-500">æ™ºèƒ½PPTç”Ÿæˆ</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* æ–°å»ºæŒ‰é’® */}
          {onNewClick && (
            <button
              onClick={onNewClick}
              className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600"
            >
              <Plus className="h-4 w-4" />
              æ–°å»º
            </button>
          )}

          {/* â˜… AI è¾…åŠ©èœå• - é¦–é¡µæ˜¾ç¤ºåœ¨æ–°å»ºæŒ‰é’®æ— */}
          {onNewClick && <AIAssistMenu disabled={false} />}

          {/* è§†å›¾åˆ‡æ¢ */}
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
                title="ç½‘æ ¼è§†å›¾"
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
                title="åˆ—è¡¨è§†å›¾"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* åŽ†å²è®°å½• - ä»…åœ¨é¦–é¡µæ˜¾ç¤ºï¼Œç¼–è¾‘é¡µéšè— */}
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
              åŽ†å²è®°å½•
            </button>
          )}

          {/* åˆ›å»ºä¿å­˜ç‚¹ */}
          <button
            onClick={onCreateCheckpoint}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            <Save className="h-4 w-4" />
            åˆ›å»ºä¿å­˜ç‚¹
          </button>

          {/* AI è¾…åŠ©èœå• */}
          {hasPages && <AIAssistMenu disabled={false} />}

          {/* æ’­æ”¾æ¼”ç¤º */}
          {hasPages && onStartPresentation && (
            <button
              onClick={onStartPresentation}
              className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm text-white hover:bg-orange-600"
            >
              <Play className="h-4 w-4" />
              æ’­æ”¾
            </button>
          )}

          {/* å¯¼å‡º */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              <Download className="h-4 w-4" />
              å¯¼å‡º
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
// åŽ†å²è®°å½•é¢æ¿
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
              <h3 className="text-sm font-medium text-gray-700">ç”ŸæˆåŽ†å²</h3>
              {history.length > 0 && (
                <button
                  onClick={onClear}
                  className="text-xs text-red-500 hover:text-red-600"
                >
                  æ¸…ç©º
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-400">
                æš‚æ— åŽ†å²è®°å½•
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
                          {item.targetPages} é¡µ
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
                            ç‚¹å‡»æ¢å¤
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
                        title="åˆ é™¤"
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
// å¯¼å‡ºä¸‹æ‹‰èœå•
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
        alert('è¯·å…ˆç”Ÿæˆå¹»ç¯ç‰‡');
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
          throw new Error(
            errorData.message || `å¯¼å‡ºå¤±è´¥: ${response.status}`
          );
        }

        // èŽ·å–æ–‡ä»¶å
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = `slides.${format}`;
        if (contentDisposition) {
          const match = contentDisposition.match(/filename="?([^"]+)"?/);
          if (match) {
            filename = match[1];
          }
        }

        // ä¸‹è½½æ–‡ä»¶
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
        alert(
          error instanceof Error ? error.message : 'å¯¼å‡ºå¤±è´¥ï¼Œè¯·é‡è¯•'
        );
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
        å¯¼å‡º PPTX
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
        å¯¼å‡º PDF
      </button>
    </div>
  );
}

// ============================================================================
// å¯¹è¯é¢æ¿ - å·¦ä¾§
// ============================================================================

function ConversationPanel({
  onSendMessage,
  onCancel,
  toolCalls,
  generating,
  progress,
  outlinePlan,
  teamState,
  teamEvents,
}: {
  onSendMessage: (message: string) => void;
  onCancel: () => void;
  toolCalls: ToolCallItem[];
  generating: boolean;
  progress: GenerationProgress | null;
  outlinePlan: OutlinePlan | null;
  teamState: import('@/types/slides-team').TeamExecutionState | null;
  teamEvents: SlidesTeamEvent[];
}) {
  const [inputValue, setInputValue] = useState('');
  const [outlineExpanded, setOutlineExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  // â˜… @ Mention çŠ¶æ€
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { streamEvents, selectedPageIndex, setSelectedPageIndex } =
    useSlidesStore();

  // Aggregate chat messages (user/system + team SSE)
  const chatMessages = React.useMemo(() => {
    const items: Array<{
      id: string;
      role: 'user' | 'system' | 'agent';
      author: string;
      message: string;
      timestamp: Date;
    }> = [];

    // Store events (user/system/agent)
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
          author: 'me',
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
          author: data.source || 'system',
          message: String(data.message),
          timestamp,
        });
        return;
      }

      if (event.type === 'agent:working' || event.type === 'agent:completed') {
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

    // Team SSE events (Agent/phase)
    teamEvents.forEach((event, index) => {
      const data = (event.data || {}) as Record<string, any>;
      const timestamp = data.timestamp
        ? new Date(data.timestamp as string)
        : (event as { timestamp?: string | Date }).timestamp
          ? new Date((event as { timestamp?: string | Date }).timestamp as any)
          : new Date();

      if (event.type === 'agent:working' || event.type === 'agent:completed') {
        const message =
          data.thought || data.task || data.result || data.message || '';
        if (!message) return;
        items.push({
          id: `${event.type}-${timestamp.getTime()}-team-${index}`,
          role: 'agent',
          author: data.agentName || data.agent || 'Agent',
          message: String(message),
          timestamp,
        });
        return;
      }

      if (event.type === 'phase:started' || event.type === 'phase:completed') {
        const message =
          data.message ||
          (data.phase
            ? `${event.type === 'phase:started' ? 'phase started' : 'phase completed'}: ${data.phase}`
            : '');
        if (!message) return;
        items.push({
          id: `${event.type}-${timestamp.getTime()}-team-${index}`,
          role: 'system',
          author: 'system',
          message: String(message),
          timestamp,
        });
      }
    });

    return items.slice(-50);
  }, [streamEvents, teamEvents]);

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

  // â˜… æ£€æµ‹ @ mention
  useEffect(() => {
    const text = inputValue;
    const lastAtIndex = text.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const afterAt = text.slice(lastAtIndex + 1);
      // å¦‚æžœ @ åŽé¢æ²¡æœ‰ç©ºæ ¼ï¼Œè¯´æ˜Žç”¨æˆ·æ­£åœ¨è¾“å…¥ mention
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

  // â˜… è¿‡æ»¤åŽçš„ mention é€‰é¡¹
  const filteredMentionOptions = React.useMemo(() => {
    if (!mentionFilter) return MENTION_OPTIONS;
    return MENTION_OPTIONS.filter(
      (opt) =>
        opt.id.toLowerCase().includes(mentionFilter) ||
        opt.label.toLowerCase().includes(mentionFilter)
    );
  }, [mentionFilter]);

  // â˜… å¤„ç† mention é€‰æ‹©
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
      // â˜… å¤„ç† mention èœå•å¯¼èˆª
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

      // æ­£å¸¸çš„ Enter æäº¤
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

  // å¤åˆ¶æ—¥å¿—åˆ°å‰ªè´´æ¿
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
      {/* é¡¶éƒ¨æ ‡é¢˜æ  */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Terminal className="h-4 w-4 text-orange-500" />
          ç”Ÿæˆè¿‡ç¨‹ ({toolCalls.length})
        </div>
        <button
          onClick={handleCopyLog}
          disabled={streamEvents.length === 0}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
            copied
              ? 'bg-green-100 text-green-700'
              : 'text-gray-600 hover:bg-gray-100'
          )}
          title="å¤åˆ¶å®Œæ•´æ—¥å¿—"
        >
          {copied ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              å·²å¤åˆ¶
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              å¤åˆ¶æ—¥å¿—
            </>
          )}
        </button>
      </div>

      {/* æ»šåŠ¨åŒºåŸŸ */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {/* é˜¶æ®µæ—¶é—´çº¿ - æŒ‰è§’è‰²åˆ†ç»„æ˜¾ç¤ºï¼Œæ›¿æ¢æ··ä¹±çš„ toolCalls åˆ—è¡¨ */}
        {/* å¯¹è¯è®°å½• */}
        <div className="mb-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>å¯¹è¯</span>
            <span>{chatMessages.length} æ¡</span>
          </div>
          {chatMessages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2 text-xs text-gray-500">
              æš‚æ— æ¶ˆæ¯ï¼Œè¾“å…¥ @leader/@analyst ç­‰ä¸Žå›¢é˜Ÿæ²Ÿé€š
            </div>
          ) : (
            chatMessages.map((msg) => (
              <div
                key={msg.id}
                className="rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5',
                      msg.role === 'user' && 'bg-blue-50 text-blue-700',
                      msg.role === 'system' && 'bg-slate-100 text-slate-700',
                      msg.role === 'agent' && 'bg-amber-50 text-amber-700'
                    )}
                  >
                    {msg.author}
                  </span>
                  <span>{msg.timestamp.toLocaleTimeString()}</span>
                </div>
                <div className="whitespace-pre-wrap text-sm text-gray-900">
                  {renderMessageText(msg.message)}
                </div>
              </div>
            ))
          )}
        </div>

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

        {/* å–æ¶ˆæŒ‰é’® */}
        {generating && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-100"
            >
              <X className="h-4 w-4" />
              å–æ¶ˆç”Ÿæˆ
            </button>
          </div>
        )}

        {/* å¤§çº²é¢„è§ˆ */}
        {outlinePlan && (
          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
            <button
              onClick={() => setOutlineExpanded(!outlineExpanded)}
              className="flex w-full items-center gap-2 text-left text-sm font-medium text-gray-700"
            >
              <FileText className="h-4 w-4 text-blue-500" />
              å¤§çº²é¢„è§ˆ ({outlinePlan.pages.length} é¡µ)
              <ChevronDown
                className={cn(
                  'ml-auto h-4 w-4 transition-transform',
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

                  <div className="mt-3">
                    {generating ? (
                      <div className="flex items-center justify-center gap-2 rounded-lg bg-orange-100 py-1.5 text-sm font-medium text-orange-700">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        æ­£åœ¨ç”Ÿæˆé¡µé¢...
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 rounded-lg bg-green-100 py-1.5 text-sm font-medium text-green-700">
                        <CheckCircle2 className="h-4 w-4" />
                        å¤§çº²å·²ç¡®è®¤ï¼Œç”Ÿæˆå®Œæˆ
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* å›ºå®šåœ¨åº•éƒ¨çš„è¾“å…¥æ¡† */}
      <div className="relative flex-shrink-0 border-t border-gray-200 bg-white p-3">
        {/* â˜… @ Mention èœå• */}
        <AnimatePresence>
          {showMentionMenu && filteredMentionOptions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-full left-3 right-3 z-50 mb-2 rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
            >
              <div className="mb-2 px-2 text-xs text-gray-500">
                æåŠ Agentï¼ˆä½¿ç”¨ â†‘â†“ é€‰æ‹©ï¼ŒEnter ç¡®è®¤ï¼‰
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
            placeholder="è¾“å…¥ä¿®æ”¹å»ºè®®æˆ–åé¦ˆ... (è¾“å…¥ @ æåŠ Agent)"
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
// å·¥å…·è°ƒç”¨å¡ç‰‡
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

  // æ¸²æŸ“è¯¦ç»†ä¿¡æ¯
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
              æ•°æ®ç‚¹
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
              å…³é”®æ´žå¯Ÿ
            </div>
            <div className="space-y-1">
              {details.insights.map((insight, i) => (
                <div
                  key={i}
                  className="rounded bg-green-50 px-2 py-1 text-xs text-green-700"
                >
                  ðŸ’¡ {insight}
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
// å¤§çº²é¡¹
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
// é¢„è§ˆé¢æ¿ - å³ä¾§
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

  // é¼ æ ‡æ»šè½®åˆ‡æ¢é¡µé¢ï¼ˆä»…åž‚ç›´æ»šåŠ¨æ—¶ï¼Œå…è®¸æ°´å¹³æ»šåŠ¨æ­£å¸¸å·¥ä½œï¼‰
  // æ·»åŠ é˜²æŠ–å’Œé˜ˆå€¼æŽ§åˆ¶ï¼Œé˜²æ­¢æ»šåŠ¨å¤ªå¿«
  const handleThumbnailWheel = useCallback(
    (e: React.WheelEvent) => {
      if (pages.length <= 1) return;

      // å¦‚æžœæ˜¯æ°´å¹³æ»šåŠ¨ï¼ˆdeltaX å¤§äºŽ deltaYï¼‰ï¼Œè®©åŽŸç”Ÿæ»šåŠ¨å¤„ç†
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        return; // ä¸é˜»æ­¢é»˜è®¤è¡Œä¸ºï¼Œå…è®¸æ°´å¹³æ»šåŠ¨
      }

      // åž‚ç›´æ»šåŠ¨æ—¶åˆ‡æ¢é¡µé¢
      e.preventDefault();

      const now = Date.now();
      const timeSinceLastWheel = now - lastWheelTime.current;

      // å¦‚æžœè·ç¦»ä¸Šæ¬¡æ»šåŠ¨è¶…è¿‡ 150msï¼Œé‡ç½®ç´¯ç§¯å€¼
      if (timeSinceLastWheel > 150) {
        accumulatedDelta.current = 0;
      }

      // ç´¯ç§¯æ»šåŠ¨é‡
      accumulatedDelta.current += e.deltaY;

      // éœ€è¦ç´¯ç§¯è¶³å¤Ÿçš„æ»šåŠ¨é‡æ‰è§¦å‘ç¿»é¡µï¼ˆé˜ˆå€¼ 50ï¼‰
      // å¹¶ä¸”è·ç¦»ä¸Šæ¬¡ç¿»é¡µè‡³å°‘ 200msï¼ˆé˜²æŠ–ï¼‰
      if (
        Math.abs(accumulatedDelta.current) >= 50 &&
        timeSinceLastWheel >= 200
      ) {
        if (accumulatedDelta.current > 0) {
          // ä¸‹ä¸€é¡µ
          setSelectedPageIndex(
            Math.min(selectedPageIndex + 1, pages.length - 1)
          );
        } else {
          // ä¸Šä¸€é¡µ
          setSelectedPageIndex(Math.max(selectedPageIndex - 1, 0));
        }
        // é‡ç½®
        accumulatedDelta.current = 0;
        lastWheelTime.current = now;
      }
    },
    [pages.length, selectedPageIndex, setSelectedPageIndex]
  );

  // è‡ªåŠ¨æ»šåŠ¨ç¼©ç•¥å›¾åˆ°å½“å‰é€‰ä¸­é¡µ
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

  // ä½¿ç”¨ ResizeObserver ç›‘å¬å®¹å™¨å°ºå¯¸å˜åŒ–
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // åˆå§‹åŒ–æ—¶ç«‹å³èŽ·å–å°ºå¯¸
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

  // å›ºå®šç”»å¸ƒå°ºå¯¸ (16:9)
  const SLIDE_WIDTH = 1280;
  const SLIDE_HEIGHT = 720;
  const PADDING = 24;

  // è®¡ç®—å¯ç”¨ç©ºé—´
  const availableWidth = Math.max(dimensions.width - PADDING, 300);
  const availableHeight = Math.max(dimensions.height - PADDING, 200);

  // è®¡ç®—ç¼©æ”¾æ¯”ä¾‹ï¼Œä¿æŒå®½é«˜æ¯”ï¼Œå…è®¸æ”¾å¤§ä»¥å¡«å……ç©ºé—´
  const scaleX = availableWidth / SLIDE_WIDTH;
  const scaleY = availableHeight / SLIDE_HEIGHT;
  const scale = Math.min(scaleX, scaleY); // ç§»é™¤æœ€å¤§ 1 çš„é™åˆ¶ï¼Œå…è®¸æ”¾å¤§

  // ç¼©æ”¾åŽçš„å°ºå¯¸
  const scaledWidth = Math.floor(SLIDE_WIDTH * scale);
  const scaledHeight = Math.floor(SLIDE_HEIGHT * scale);

  // ä¸º iframe å†…å®¹æ·»åŠ ç¼©æ”¾æ ·å¼ - ä½¿ç”¨å†…éƒ¨ç¼©æ”¾è€Œéžå¤–éƒ¨ transform
  // è¿™æ ·æ¸²æŸ“æ›´æ¸…æ™°ï¼Œå› ä¸ºæµè§ˆå™¨ä¼šé‡æ–°æ¸²æŸ“è€Œä¸æ˜¯ç¼©æ”¾åƒç´
  const enhanceHtmlForClarity = useCallback(
    (html: string, zoomScale: number): string => {
      // æ³¨å…¥ç¼©æ”¾å’Œå­—ä½“å¹³æ»‘æ ·å¼
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
      // åœ¨ </head> å‰æ’å…¥æ ·å¼
      if (html.includes('</head>')) {
        return html.replace('</head>', enhancementStyles + '</head>');
      }
      // å¦‚æžœæ²¡æœ‰ headï¼Œåœ¨ body å‰æ’å…¥
      if (html.includes('<body')) {
        return html.replace('<body', enhancementStyles + '<body');
      }
      return enhancementStyles + html;
    },
    []
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-gradient-to-br from-slate-100 to-slate-200">
      {/* ç¼©ç•¥å›¾åŒºåŸŸ - æ”¯æŒé¼ æ ‡æ»šè½®åˆ‡æ¢é¡µé¢å’Œæ°´å¹³æ»šåŠ¨ */}
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
              å¼€å§‹ç”ŸæˆåŽå°†æ˜¾ç¤ºç¼©ç•¥å›¾
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

      {/* è§†å›¾æ¨¡å¼åˆ‡æ¢æ ‡ç­¾ - Preview | Code | Thinking */}
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

          {/* å³ä¾§æ“ä½œæŒ‰é’® */}
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

      {/* ä¸»å†…å®¹åŒºåŸŸ - æ ¹æ® viewMode æ˜¾ç¤ºä¸åŒå†…å®¹ */}
      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 overflow-hidden"
      >
        {/* Preview æ¨¡å¼ */}
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
                          æ­£åœ¨ç”Ÿæˆç¬¬ {currentPage.pageNumber} é¡µ...
                        </p>
                        <p className="mt-1 text-xs text-slate-500">è¯·ç¨å€™</p>
                      </div>
                    ) : currentPage.status === 'error' ? (
                      <div className="text-center">
                        <AlertCircle className="mx-auto mb-4 h-10 w-10 text-red-400" />
                        <p className="text-sm font-medium text-red-300">
                          {currentPage.error || 'ç”Ÿæˆå¤±è´¥'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          è¯·é‡è¯•æˆ–æ£€æŸ¥å†…å®¹
                        </p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Layers className="mx-auto mb-4 h-10 w-10 text-slate-600" />
                        <p className="text-sm font-medium text-slate-400">
                          ç­‰å¾…ç”Ÿæˆ...
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
                  å¼€å§‹ç”Ÿæˆæ¼”ç¤ºæ–‡ç¨¿
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  åœ¨å·¦ä¾§è¾“å…¥å†…å®¹å¹¶ç‚¹å‡»ç”Ÿæˆ
                </p>
              </div>
            )}
          </div>
        )}

        {/* Code æ¨¡å¼ - æ˜¾ç¤ºå½“å‰é¡µé¢çš„ HTML ä»£ç  */}
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
                      ? 'ä»£ç å°†åœ¨ç”Ÿæˆå®ŒæˆåŽæ˜¾ç¤º'
                      : 'é€‰æ‹©ä¸€ä¸ªé¡µé¢æŸ¥çœ‹ä»£ç '}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Thinking æ¨¡å¼ - æ˜¾ç¤º AI çš„æ€è€ƒè¿‡ç¨‹ */}
        {viewMode === 'thinking' && (
          <div className="flex-1 overflow-auto bg-slate-50 p-4">
            {currentPage ? (
              <div className="space-y-4">
                {/* é¡µé¢å¤§çº²ä¿¡æ¯ */}
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <FileText className="h-4 w-4 text-orange-500" />
                    é¡µé¢å¤§çº²
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-slate-500">æ ‡é¢˜: </span>
                      <span className="font-medium text-slate-700">
                        {currentPage.outline?.title || 'æœªè®¾ç½®'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">æ¨¡æ¿ç±»åž‹: </span>
                      <span className="rounded bg-orange-100 px-2 py-0.5 text-orange-700">
                        {currentPage.outline?.templateType || 'æœªçŸ¥'}
                      </span>
                    </div>
                    {currentPage.outline?.keyPoints &&
                      currentPage.outline.keyPoints.length > 0 && (
                        <div>
                          <span className="text-slate-500">è¦ç‚¹:</span>
                          <ul className="mt-1 list-inside list-disc space-y-1 text-slate-600">
                            {currentPage.outline.keyPoints.map((point, i) => (
                              <li key={i}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                  </div>
                </div>

                {/* è®¾è®¡æ€è€ƒè¿‡ç¨‹ - 4 æ­¥ */}
                {currentPage.design && (
                  <>
                    {/* Step 1: è‰ç¨¿è®¾è®¡ */}
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                          1
                        </span>
                        Drafting è‰ç¨¿è®¾è®¡
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-slate-500">é£Žæ ¼: </span>
                          <span className="text-slate-700">
                            {currentPage.design.step1_drafting?.style || '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">æƒ…ç»ª: </span>
                          <span className="text-slate-700">
                            {currentPage.design.step1_drafting?.mood || '-'}
                          </span>
                        </div>
                        {currentPage.design.step1_drafting?.coreElements && (
                          <div>
                            <span className="text-slate-500">
                              æ ¸å¿ƒå…ƒç´ :
                            </span>
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

                    {/* Step 2: å¸ƒå±€ä¼˜åŒ– */}
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                          2
                        </span>
                        Layout å¸ƒå±€ä¼˜åŒ–
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-slate-500">å¯¹é½æ–¹å¼: </span>
                          <span className="text-slate-700">
                            {currentPage.design.step2_refiningLayout
                              ?.alignment || '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">å›¾å½¢ä½ç½®: </span>
                          <span className="text-slate-700">
                            {currentPage.design.step2_refiningLayout
                              ?.graphicsPosition || '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">é—´è·: </span>
                          <span className="text-slate-700">
                            {currentPage.design.step2_refiningLayout?.spacing ||
                              '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Step 3: è§†è§‰è§„åˆ’ */}
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">
                          3
                        </span>
                        Visuals è§†è§‰è§„åˆ’
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">èƒŒæ™¯è‰²: </span>
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
                            <span className="text-slate-500">å¼ºè°ƒè‰²:</span>
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
                              <span className="text-slate-500">
                                è£…é¥°å…ƒç´ :
                              </span>
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

                    {/* Step 4: HTML ç”Ÿæˆ */}
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
                          4
                        </span>
                        HTML ç”Ÿæˆ
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-slate-500">çŠ¶æ€: </span>
                          <span
                            className={cn('rounded px-2 py-0.5', {
                              'bg-green-100 text-green-700': currentPage.html,
                              'bg-yellow-100 text-yellow-700':
                                !currentPage.html,
                            })}
                          >
                            {currentPage.html ? 'å·²ç”Ÿæˆ' : 'å¾…ç”Ÿæˆ'}
                          </span>
                        </div>
                        {currentPage.design.step4_formulatingHTML
                          ?.templateUsed && (
                          <div>
                            <span className="text-slate-500">
                              ä½¿ç”¨æ¨¡æ¿:{' '}
                            </span>
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
                            <span className="text-slate-500">
                              å†…å®¹åŒºå—:{' '}
                            </span>
                            <span className="text-slate-700">
                              {
                                currentPage.design.step4_formulatingHTML
                                  .sectionsCount
                              }{' '}
                              ä¸ª
                            </span>
                          </div>
                        )}
                        {currentPage.design.step4_formulatingHTML?.hasImages !==
                          undefined && (
                          <div>
                            <span className="text-slate-500">
                              åŒ…å«å›¾ç‰‡:{' '}
                            </span>
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
                                ? 'æ˜¯'
                                : 'å¦'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* AI å®Œæ•´æ€è€ƒè¿‡ç¨‹ - å¯æŠ˜å  */}
                    {currentPage.design.rawResponse && (
                      <details className="group rounded-lg border border-slate-200 bg-white">
                        <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                          <Brain className="h-4 w-4 text-orange-500" />
                          AI å®Œæ•´æ€è€ƒè¿‡ç¨‹
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

                {/* å¦‚æžœæ²¡æœ‰è®¾è®¡æ•°æ® */}
                {!currentPage.design && (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                    <Brain className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                    <p className="text-sm text-slate-500">
                      {currentPage.status === 'generating'
                        ? 'æ­£åœ¨æ€è€ƒä¸­...'
                        : 'è®¾è®¡æ€è€ƒæ•°æ®å°†åœ¨ç”Ÿæˆæ—¶æ˜¾ç¤º'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Brain className="mx-auto mb-4 h-10 w-10 text-slate-400" />
                  <p className="text-sm text-slate-500">
                    é€‰æ‹©ä¸€ä¸ªé¡µé¢æŸ¥çœ‹ AI æ€è€ƒè¿‡ç¨‹
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* å±žæ€§é¢æ¿ */}
      {currentPage && (
        <div className="flex-shrink-0 border-t border-slate-200 bg-white/90 px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">æ¨¡æ¿:</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  {currentPage.outline?.templateType || 'æœªçŸ¥'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">çŠ¶æ€:</span>
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
              <span className="text-slate-500">{pages.length} é¡µ</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ç¼©ç•¥å›¾å¡ç‰‡
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
// åº•éƒ¨è¿›åº¦æ¡
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
          {completedPages} / {pages.length} é¡µ
        </span>
      </div>

      {latestCheckpoint && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Save className="h-4 w-4" />
          <span>æ£€æŸ¥ç‚¹: {latestCheckpoint.name}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// è¾“å…¥è¡¨å•ï¼ˆåˆå§‹çŠ¶æ€ï¼‰
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
                åˆ›å»ºæ–°çš„æ¼”ç¤ºæ–‡ç¨¿
              </h2>
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  å–æ¶ˆ
                </button>
              )}
            </div>

            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  æ ‡é¢˜
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="è¾“å…¥æ¼”ç¤ºæ–‡ç¨¿æ ‡é¢˜..."
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  ç´ æå†…å®¹
                </label>
                <textarea
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  placeholder="ç²˜è´´è¦è½¬æ¢ä¸ºå¹»ç¯ç‰‡çš„æ–‡æœ¬å†…å®¹..."
                  rows={8}
                  className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  ç›®æ ‡é¡µæ•°: {targetPages} é¡µ
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
                  <span>5 é¡µ</span>
                  <span>30 é¡µ</span>
                </div>
              </div>

              {/* ä¸»é¢˜é€‰æ‹© */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  ä¸»é¢˜é£Žæ ¼
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

      {/* å›ºå®šåœ¨åº•éƒ¨çš„æŒ‰é’® */}
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
                ç”Ÿæˆä¸­...
              </>
            ) : (
              <>
                <Layers className="h-5 w-5" />
                å¼€å§‹ç”Ÿæˆ
              </>
            )}
          </button>
        </div>
      </div>
    </main>
  );
}

// ============================================================================
// Sessions ç”»å»Šç»„ä»¶
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
  // ä¼˜å…ˆä½¿ç”¨åŽç«¯ä¼šè¯ï¼Œå¦‚æžœæ²¡æœ‰åˆ™ä½¿ç”¨æœ¬åœ°åŽ†å²
  const hasBackendSessions = backendSessions.length > 0;
  const localSessions = localHistory.filter(
    (item) => item.sessionId && item.status === 'success'
  );

  if (loading) {
    return (
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center bg-gray-50 p-8">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-orange-500" />
          <p className="text-sm text-gray-500">åŠ è½½åŽ†å²è®°å½•...</p>
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
            è¿˜æ²¡æœ‰æ¼”ç¤ºæ–‡ç¨¿
          </h2>
          <p className="mb-6 text-sm text-gray-500">
            ç‚¹å‡»æ–°å»ºæŒ‰é’®åˆ›å»ºæ‚¨çš„ç¬¬ä¸€ä¸ª AI æ¼”ç¤ºæ–‡ç¨¿
          </p>
          <button
            onClick={onNewClick}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-medium text-white hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            æ–°å»ºæ¼”ç¤ºæ–‡ç¨¿
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-gray-50">
      {/* æ¢å¤åŠ è½½é®ç½© */}
      {restoring && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80">
          <div className="text-center">
            <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-orange-500" />
            <p className="text-sm font-medium text-gray-600">
              æ­£åœ¨æ¢å¤æ¼”ç¤ºæ–‡ç¨¿...
            </p>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto p-6">
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {/* åŽç«¯ä¼šè¯ */}
            {backendSessions.map((session) => (
              <BackendSessionCard
                key={session.id}
                session={session}
                onClick={() => onRestoreSession(session)}
                onUpdate={onUpdateSession}
                onDelete={onDeleteSession}
              />
            ))}
            {/* æœ¬åœ°åŽ†å²ï¼ˆåªæ˜¾ç¤ºä¸åœ¨åŽç«¯çš„ï¼‰ */}
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
            {/* åŽç«¯ä¼šè¯ */}
            {backendSessions.map((session) => (
              <BackendSessionListItem
                key={session.id}
                session={session}
                onClick={() => onRestoreSession(session)}
                onUpdate={onUpdateSession}
                onDelete={onDeleteSession}
              />
            ))}
            {/* æœ¬åœ°åŽ†å² */}
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

// åŽç«¯ä¼šè¯å¡ç‰‡
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
    if (
      !confirm('ç¡®å®šè¦åˆ é™¤è¿™ä¸ªæ¼”ç¤ºæ–‡ç¨¿å—ï¼Ÿæ­¤æ“ä½œä¸å¯æ’¤é”€ã€‚')
    )
      return;
    setIsDeleting(true);
    try {
      const success = await onDelete(session.id);
      if (!success) {
        alert('åˆ é™¤å¤±è´¥ï¼Œè¯·é‡è¯•');
      }
    } catch (error) {
      console.error('[SessionCard] Delete error:', error);
      alert(
        'åˆ é™¤å¤±è´¥: ' +
          (error instanceof Error ? error.message : 'æœªçŸ¥é”™è¯¯')
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
      {/* ç¼©ç•¥å›¾åŒºåŸŸ - æ˜¾ç¤ºæ ‡é¢˜é¢„è§ˆ */}
      <button
        onClick={onClick}
        className="relative aspect-[16/9] bg-gradient-to-br from-slate-800 to-slate-900"
      >
        {/* å°é¢å†…å®¹é¢„è§ˆ */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
          <Layers className="mb-2 h-6 w-6 text-slate-500" />
          <h3 className="line-clamp-2 text-center text-sm font-medium text-white/90">
            {session.title || 'æ— æ ‡é¢˜'}
          </h3>
        </div>
        {/* é¡µæ•°æ ‡ç­¾ */}
        <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
          {pagesCount > 0 ? `${pagesCount} é¡µ` : 'ç©º'}
        </div>
        {/* æ¥æºæ ‡è¯† */}
        <div className="absolute left-2 top-2 rounded bg-green-500/80 px-1.5 py-0.5 text-xs text-white">
          å·²ä¿å­˜
        </div>
      </button>

      {/* ä¿¡æ¯å’Œæ“ä½œæŒ‰é’® */}
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

            {/* æ“ä½œèœå• */}
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
                  {/* ç‚¹å‡»å¤–éƒ¨å…³é—­èœå•çš„é®ç½©å±‚ */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                    }}
                  />
                  {/* ä¸‹æ‹‰èœå• - å‘ä¸Šå¼¹å‡ºé¿å…è¢«æˆªæ–­ */}
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
                      é‡å‘½å
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
                      åˆ é™¤
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

// åŽç«¯ä¼šè¯åˆ—è¡¨é¡¹
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
    if (
      !confirm('ç¡®å®šè¦åˆ é™¤è¿™ä¸ªæ¼”ç¤ºæ–‡ç¨¿å—ï¼Ÿæ­¤æ“ä½œä¸å¯æ’¤é”€ã€‚')
    )
      return;
    setIsDeleting(true);
    try {
      const success = await onDelete(session.id);
      if (!success) {
        alert('åˆ é™¤å¤±è´¥ï¼Œè¯·é‡è¯•');
      }
    } catch (error) {
      console.error('[SessionCard] Delete error:', error);
      alert(
        'åˆ é™¤å¤±è´¥: ' +
          (error instanceof Error ? error.message : 'æœªçŸ¥é”™è¯¯')
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
      {/* ç¼©ç•¥å›¾ - å¯ç‚¹å‡» */}
      <button
        onClick={onClick}
        className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-slate-800 to-slate-900"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Layers className="h-6 w-6 text-slate-600" />
        </div>
        {/* æ¥æºæ ‡è¯† */}
        <div className="absolute left-1 top-1 rounded bg-green-500/80 px-1 py-0.5 text-[10px] text-white">
          å·²ä¿å­˜
        </div>
      </button>

      {/* ä¿¡æ¯ */}
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
                  ? `${session.latestCheckpoint?.pagesCount} é¡µ`
                  : 'ç©º'}
              </span>
            </div>
          </button>
        )}
      </div>

      {/* æ“ä½œæŒ‰é’® */}
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="é‡å‘½å"
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
          title="åˆ é™¤"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* ç®­å¤´ */}
      <button onClick={onClick}>
        <ChevronDown className="h-5 w-5 -rotate-90 text-gray-400" />
      </button>
    </div>
  );
}

// ç½‘æ ¼å¡ç‰‡
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
      {/* ç¼©ç•¥å›¾å ä½ */}
      <div className="relative aspect-[16/9] bg-gradient-to-br from-slate-800 to-slate-900">
        <div className="absolute inset-0 flex items-center justify-center">
          <Layers className="h-8 w-8 text-slate-600" />
        </div>
        <div className="absolute bottom-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
          {item.targetPages || '?'} é¡µ
        </div>
      </div>

      {/* ä¿¡æ¯ */}
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

// åˆ—è¡¨é¡¹
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
      {/* ç¼©ç•¥å›¾ */}
      <div className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-slate-800 to-slate-900">
        <div className="absolute inset-0 flex items-center justify-center">
          <Layers className="h-6 w-6 text-slate-600" />
        </div>
      </div>

      {/* ä¿¡æ¯ */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-gray-900">
          {item.title}
        </h3>
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
          <span>{formatRelativeTime(item.timestamp)}</span>
          <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-600">
            {item.targetPages || '?'} é¡µ
          </span>
        </div>
      </div>

      {/* ç®­å¤´ */}
      <ChevronDown className="h-5 w-5 -rotate-90 text-gray-400" />
    </button>
  );
}

// ============================================================================
// å·¥å…·å‡½æ•°
// ============================================================================

function getPhaseTitle(phase: string): string {
  const titles: Record<string, string> = {
    task_decomposition: 'ðŸ§  æ·±åº¦æ€è€ƒ - ä»»åŠ¡åˆ†è§£',
    outline_planning: 'ðŸ“„ å¤§çº²è§„åˆ’',
    page_rendering: 'ðŸŽ¨ é¡µé¢æ¸²æŸ“',
    quality_review: 'âœ… è´¨é‡æ£€æŸ¥',
  };
  return titles[phase] || phase;
}

function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    pending: 'ç­‰å¾…ä¸­',
    generating: 'ç”Ÿæˆä¸­',
    completed: 'å·²å®Œæˆ',
    error: 'å¤±è´¥',
  };
  return texts[status] || status;
}

/**
 * æ ¼å¼åŒ– HTML ä»£ç ï¼Œæ·»åŠ ç¼©è¿›ä»¥æé«˜å¯è¯»æ€§
 */
function formatHtmlCode(html: string): string {
  try {
    let formatted = '';
    let indent = 0;
    const lines = html.split(/>\s*</);

    lines.forEach((line, i) => {
      // æ£€æµ‹æ˜¯å¦ä¸ºè‡ªé—­åˆæ ‡ç­¾æˆ–é—­åˆæ ‡ç­¾
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
    return html; // å¦‚æžœæ ¼å¼åŒ–å¤±è´¥ï¼Œè¿”å›žåŽŸå§‹ä»£ç 
  }
}

export default SlidesTab;
