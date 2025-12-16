'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  TeamMission,
  AgentTask,
  TopicAIMember,
  MissionStatus,
  AgentTaskStatus,
} from '@/types/ai-teams';

interface TeamCanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
  mission: TeamMission | null;
  aiMembers: TopicAIMember[];
  typingAIs: Set<string>;
  embedded?: boolean;
}

// Status colors for mission
const missionStatusConfig: Record<
  MissionStatus,
  { color: string; bgColor: string; label: string; icon: string }
> = {
  PENDING: {
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    label: '待开始',
    icon: '⏳',
  },
  PLANNING: {
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    label: '规划中',
    icon: '📋',
  },
  IN_PROGRESS: {
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    label: '执行中',
    icon: '⚡',
  },
  REVIEW: {
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
    label: '审核中',
    icon: '🔍',
  },
  COMPLETED: {
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    label: '已完成',
    icon: '✅',
  },
  FAILED: {
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    label: '失败',
    icon: '❌',
  },
  CANCELLED: {
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    label: '已取消',
    icon: '🚫',
  },
};

const taskStatusConfig: Record<
  AgentTaskStatus,
  {
    color: string;
    bgColor: string;
    borderColor: string;
    icon: string;
    label: string;
  }
> = {
  PENDING: {
    color: 'text-gray-500',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    icon: '○',
    label: '等待中',
  },
  IN_PROGRESS: {
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    icon: '◐',
    label: '执行中',
  },
  BLOCKED: {
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: '⊘',
    label: '阻塞',
  },
  AWAITING_REVIEW: {
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    icon: '◉',
    label: '待审核',
  },
  REVISION_NEEDED: {
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: '↻',
    label: '需修订',
  },
  COMPLETED: {
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: '✓',
    label: '已完成',
  },
  CANCELLED: {
    color: 'text-gray-400',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    icon: '○',
    label: '已取消',
  },
};

// Get agent status color for canvas nodes
const getAgentStatusColor = (
  isLeader: boolean,
  isWorking: boolean,
  hasCompletedTasks: boolean,
  hasActiveTasks: boolean
): { bg: string; border: string; glow: string; fill: string } => {
  if (isWorking) {
    return {
      bg: 'bg-blue-500',
      border: 'border-blue-600',
      glow: 'shadow-blue-500/50',
      fill: '#3b82f6',
    };
  }
  if (isLeader) {
    return {
      bg: 'bg-purple-500',
      border: 'border-purple-600',
      glow: 'shadow-purple-500/30',
      fill: '#a855f7',
    };
  }
  if (hasCompletedTasks) {
    return {
      bg: 'bg-green-500',
      border: 'border-green-600',
      glow: '',
      fill: '#22c55e',
    };
  }
  if (hasActiveTasks) {
    return {
      bg: 'bg-yellow-500',
      border: 'border-yellow-600',
      glow: '',
      fill: '#eab308',
    };
  }
  return {
    bg: 'bg-gray-400',
    border: 'border-gray-500',
    glow: '',
    fill: '#9ca3af',
  };
};

// Get task connection color
const getTaskConnectionColor = (status: AgentTaskStatus): string => {
  switch (status) {
    case 'IN_PROGRESS':
      return '#60a5fa';
    case 'COMPLETED':
      return '#4ade80';
    case 'AWAITING_REVIEW':
      return '#c084fc';
    case 'REVISION_NEEDED':
      return '#fb923c';
    case 'BLOCKED':
      return '#f87171';
    default:
      return '#d1d5db';
  }
};

// Professional hierarchical tree layout algorithm
function calculateNodePositions(
  leaderId: string | null,
  agents: TopicAIMember[],
  width: number,
  height: number,
  tasksByAgent?: Map<string, AgentTask[]>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const centerX = width / 2;

  const leader = agents.find((a) => a.id === leaderId);
  const workers = agents.filter((a) => a.id !== leaderId);

  // Enhanced node sizing for better readability
  const leaderRadius = 45;
  const workerRadius = 38;
  const minHorizontalSpacing = 140; // Minimum space between nodes
  const verticalSpacing = 160; // Space between rows

  // Position leader at top center with more room
  const leaderY = 90;
  if (leader) {
    positions.set(leader.id, { x: centerX, y: leaderY });
  }

  // Smart layout for workers - organize by task status for visual clarity
  const workerCount = workers.length;
  if (workerCount > 0) {
    // Sort workers by activity: working > has tasks > idle
    const sortedWorkers = [...workers].sort((a, b) => {
      const aTasks = tasksByAgent?.get(a.id) || [];
      const bTasks = tasksByAgent?.get(b.id) || [];
      const aActive = aTasks.some((t) => t.status === 'IN_PROGRESS')
        ? 2
        : aTasks.length > 0
          ? 1
          : 0;
      const bActive = bTasks.some((t) => t.status === 'IN_PROGRESS')
        ? 2
        : bTasks.length > 0
          ? 1
          : 0;
      return bActive - aActive;
    });

    // Calculate optimal layout based on available space
    const availableWidth = width - 120; // Padding on sides
    const maxNodesPerRow = Math.max(
      2,
      Math.min(6, Math.floor(availableWidth / minHorizontalSpacing))
    );

    // Determine actual nodes per row based on count
    let nodesPerRow: number;
    if (workerCount <= 3) {
      nodesPerRow = workerCount;
    } else if (workerCount <= 6) {
      nodesPerRow = Math.ceil(workerCount / 1); // Single row if possible
      if (nodesPerRow > maxNodesPerRow) {
        nodesPerRow = Math.ceil(workerCount / 2);
      }
    } else {
      // For larger teams, use optimal distribution
      const rows = Math.ceil(workerCount / maxNodesPerRow);
      nodesPerRow = Math.ceil(workerCount / rows);
    }

    nodesPerRow = Math.min(nodesPerRow, maxNodesPerRow);
    const totalRows = Math.ceil(workerCount / nodesPerRow);

    // Calculate spacing based on actual nodes per row
    const actualSpacing = Math.max(
      minHorizontalSpacing,
      availableWidth / (nodesPerRow + 1)
    );

    // Starting Y position for workers
    const startY = leaderY + verticalSpacing;

    sortedWorkers.forEach((worker, index) => {
      const row = Math.floor(index / nodesPerRow);
      const col = index % nodesPerRow;

      // How many nodes in this row
      const nodesInThisRow =
        row === totalRows - 1
          ? workerCount - (totalRows - 1) * nodesPerRow
          : nodesPerRow;

      // Center each row
      const rowWidth = (nodesInThisRow - 1) * actualSpacing;
      const rowStartX = centerX - rowWidth / 2;

      const x = rowStartX + col * actualSpacing;
      const y = startY + row * verticalSpacing;

      positions.set(worker.id, { x, y });
    });
  }

  return positions;
}

export default function TeamCanvasModal({
  isOpen,
  onClose,
  mission,
  aiMembers,
  typingAIs,
  embedded = false,
}: TeamCanvasModalProps) {
  const [selectedAgent, setSelectedAgent] = useState<TopicAIMember | null>(
    null
  );
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [animationTick, setAnimationTick] = useState(0);
  const [draggedNode, setDraggedNode] = useState<string | null>(null);
  const [customPositions, setCustomPositions] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Popover position state
  const [popoverPosition, setPopoverPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Zoom and pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Animation loop for dynamic effects
  useEffect(() => {
    if (!isOpen || !mission) return;
    const hasActiveWork = mission.tasks?.some(
      (t) => t.status === 'IN_PROGRESS' || t.status === 'AWAITING_REVIEW'
    );
    if (!hasActiveWork) return;

    const interval = setInterval(() => {
      setAnimationTick((prev) => (prev + 1) % 100);
    }, 50);
    return () => clearInterval(interval);
  }, [isOpen, mission]);

  // Canvas dimensions
  const canvasWidth = 900;
  const canvasHeight = 600;

  // Get tasks grouped by agent (moved up for use in layout)
  const tasksByAgent = useMemo(() => {
    const map = new Map<string, AgentTask[]>();
    if (mission?.tasks) {
      mission.tasks.forEach((task) => {
        const existing = map.get(task.assignedToId) || [];
        existing.push(task);
        map.set(task.assignedToId, existing);
      });
    }
    return map;
  }, [mission?.tasks]);

  // Calculate node positions (must be before handlers that use it)
  const nodePositions = useMemo(() => {
    return calculateNodePositions(
      mission?.leaderId || null,
      aiMembers,
      canvasWidth,
      canvasHeight,
      tasksByAgent
    );
  }, [mission?.leaderId, aiMembers, tasksByAgent]);

  // Handle drag start
  const handleDragStart = useCallback(
    (agentId: string, event: React.MouseEvent<SVGGElement>) => {
      const svg = event.currentTarget.ownerSVGElement;
      if (!svg) return;

      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse());

      const currentPos =
        customPositions.get(agentId) || nodePositions.get(agentId);
      if (currentPos) {
        setDragOffset({
          x: svgPoint.x - currentPos.x,
          y: svgPoint.y - currentPos.y,
        });
      }
      setDraggedNode(agentId);
      event.stopPropagation();
    },
    [customPositions, nodePositions]
  );

  // Handle drag move
  const handleDragMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!draggedNode) return;

      const svg = event.currentTarget;
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const svgPoint = point.matrixTransform(svg.getScreenCTM()?.inverse());

      const newX = Math.max(
        50,
        Math.min(canvasWidth - 50, svgPoint.x - dragOffset.x)
      );
      const newY = Math.max(
        50,
        Math.min(canvasHeight - 50, svgPoint.y - dragOffset.y)
      );

      setCustomPositions((prev) => {
        const newMap = new Map(prev);
        newMap.set(draggedNode, { x: newX, y: newY });
        return newMap;
      });
    },
    [draggedNode, dragOffset, canvasWidth, canvasHeight]
  );

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedNode(null);
  }, []);

  // Reset positions
  const handleResetPositions = useCallback(() => {
    setCustomPositions(new Map());
  }, []);

  // Zoom handlers
  const handleWheel = useCallback((event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.max(0.3, Math.min(5, prev * delta)));
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(5, prev * 1.2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(0.3, prev * 0.8));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Pan handlers
  const handlePanStart = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (event.button === 1 || (event.button === 0 && event.altKey)) {
        // Middle click or Alt+Left click
        setIsPanning(true);
        setPanStart({ x: event.clientX - pan.x, y: event.clientY - pan.y });
      }
    },
    [pan]
  );

  const handlePanMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (isPanning) {
        setPan({
          x: event.clientX - panStart.x,
          y: event.clientY - panStart.y,
        });
      }
    },
    [isPanning, panStart]
  );

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Handle agent click with position for popover
  const handleAgentClick = useCallback(
    (agent: TopicAIMember, event: React.MouseEvent) => {
      if (draggedNode) return;

      // Get click position relative to viewport
      const rect = (event.currentTarget as HTMLElement)
        .closest('.canvas-container')
        ?.getBoundingClientRect();
      if (rect) {
        setPopoverPosition({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      } else {
        setPopoverPosition({ x: event.clientX, y: event.clientY });
      }
      setSelectedAgent(agent);
      setSelectedTask(null);
    },
    [draggedNode]
  );

  // Handle task click with position for popover
  const handleTaskClick = useCallback(
    (task: AgentTask, event: React.MouseEvent) => {
      const rect = (event.currentTarget as HTMLElement)
        .closest('.canvas-container')
        ?.getBoundingClientRect();
      if (rect) {
        setPopoverPosition({
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      } else {
        setPopoverPosition({ x: event.clientX, y: event.clientY });
      }
      setSelectedTask(task);
      setSelectedAgent(null);
    },
    []
  );

  // Close popover
  const handleClosePopover = useCallback(() => {
    setSelectedAgent(null);
    setSelectedTask(null);
    setPopoverPosition(null);
  }, []);

  // Get actual position (custom or default) - used by connection lines and nodes
  const _getNodePosition = useCallback(
    (agentId: string) => {
      return customPositions.get(agentId) || nodePositions.get(agentId);
    },
    [customPositions, nodePositions]
  );

  // Get agent stats
  const getAgentStats = useCallback(
    (agentId: string) => {
      const tasks = tasksByAgent.get(agentId) || [];
      const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
      const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
      const total = tasks.length;
      return { completed, inProgress, total, tasks };
    },
    [tasksByAgent]
  );

  // Download results
  const handleDownloadResults = useCallback(() => {
    if (!mission) return;

    const report = {
      mission: {
        id: mission.id,
        title: mission.title,
        description: mission.description,
        status: mission.status,
        leader: mission.leader?.displayName,
        createdAt: mission.createdAt,
        completedAt: mission.completedAt,
        finalResult: mission.finalResult,
      },
      tasks: mission.tasks?.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        assignedTo: t.assignedTo?.displayName,
        result: t.result,
        leaderFeedback: t.leaderFeedback,
        revisionCount: t.revisionCount,
        startedAt: t.startedAt,
        completedAt: t.completedAt,
      })),
      summary: {
        totalTasks: mission.tasks?.length || 0,
        completedTasks:
          mission.tasks?.filter((t) => t.status === 'COMPLETED').length || 0,
        totalRevisions:
          mission.tasks?.reduce((sum, t) => sum + (t.revisionCount || 0), 0) ||
          0,
      },
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mission-${mission.id}-report.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [mission]);

  if (!isOpen) return null;

  const statusConfig = mission ? missionStatusConfig[mission.status] : null;

  // Content container - different sizing for modal vs embedded
  const contentClasses = embedded
    ? 'relative flex h-full w-full flex-col bg-white'
    : 'relative flex h-[90vh] w-[95vw] max-w-7xl flex-col rounded-2xl bg-white shadow-2xl';

  const content = (
    <div className={contentClasses}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-gray-900">AI Team Canvas</h2>
          {mission && statusConfig && (
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
            >
              {statusConfig.icon} {statusConfig.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
            <button
              onClick={handleZoomOut}
              className="rounded p-1.5 transition-colors hover:bg-gray-200"
              title="缩小"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 12H4"
                />
              </svg>
            </button>
            <span className="min-w-[50px] px-2 text-center text-xs font-medium text-gray-600">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="rounded p-1.5 transition-colors hover:bg-gray-200"
              title="放大"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
            <div className="mx-1 h-4 w-px bg-gray-300" />
            <button
              onClick={handleResetZoom}
              className="rounded p-1.5 transition-colors hover:bg-gray-200"
              title="重置视图"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>
          </div>
          {/* Reset Positions Button */}
          {customPositions.size > 0 && (
            <button
              onClick={handleResetPositions}
              className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              title="重置节点位置"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              重置布局
            </button>
          )}
          {/* Download Button */}
          {mission && (
            <button
              onClick={handleDownloadResults}
              className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              下载报告
            </button>
          )}
          {/* Close Button */}
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas Area */}
        <div className="canvas-container relative flex-1 overflow-hidden bg-gradient-to-br from-gray-50 to-blue-50/30 p-4">
          {!mission ? (
            <div className="flex h-full flex-col items-center justify-center">
              <div className="mb-4 text-6xl">🎨</div>
              <p className="text-lg text-gray-500">
                创建一个任务后，这里将展示 AI 团队的协作视图
              </p>
            </div>
          ) : (
            <div className="h-full w-full">
              {/* Mission Title */}
              <div className="mb-4 text-center">
                <h3 className="text-lg font-semibold text-gray-800">
                  {mission.title}
                </h3>
                {mission.description && (
                  <p className="mx-auto mt-1 line-clamp-2 max-w-2xl text-sm text-gray-500">
                    {mission.description}
                  </p>
                )}
              </div>

              {/* SVG Canvas with zoom/pan support */}
              <svg
                viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                className={`h-full w-full ${draggedNode ? 'cursor-grabbing' : isPanning ? 'cursor-move' : 'cursor-default'}`}
                preserveAspectRatio="xMidYMid meet"
                onMouseMove={(e) => {
                  handleDragMove(e);
                  handlePanMove(e);
                }}
                onMouseUp={() => {
                  handleDragEnd();
                  handlePanEnd();
                }}
                onMouseLeave={() => {
                  handleDragEnd();
                  handlePanEnd();
                }}
                onMouseDown={handlePanStart}
                onWheel={handleWheel}
              >
                {/* Background Grid */}
                <defs>
                  <pattern
                    id="canvas-grid"
                    width="30"
                    height="30"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 30 0 L 0 0 0 30"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="0.5"
                    />
                  </pattern>
                  {/* Gradient for nodes */}
                  <linearGradient
                    id="leader-gradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>
                  <linearGradient
                    id="worker-gradient"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#1d4ed8" />
                  </linearGradient>
                  {/* Drop shadows */}
                  <filter
                    id="shadow"
                    x="-50%"
                    y="-50%"
                    width="200%"
                    height="200%"
                  >
                    <feDropShadow
                      dx="0"
                      dy="4"
                      stdDeviation="6"
                      floodOpacity="0.15"
                    />
                  </filter>
                </defs>
                <rect width="100%" height="100%" fill="url(#canvas-grid)" />

                {/* Zoomable/Pannable container */}
                <g
                  transform={`translate(${pan.x / zoom + (canvasWidth * (1 - zoom)) / (2 * zoom)}, ${pan.y / zoom + (canvasHeight * (1 - zoom)) / (2 * zoom)}) scale(${zoom})`}
                >
                  {/* Connection Lines with animated particles */}
                  {mission.tasks?.map((task, taskIndex) => {
                    const leaderId = mission.leaderId;
                    if (!leaderId) return null;
                    const leaderPos =
                      customPositions.get(leaderId) ||
                      nodePositions.get(leaderId);
                    const agentPos =
                      customPositions.get(task.assignedToId) ||
                      nodePositions.get(task.assignedToId);
                    if (!leaderPos || !agentPos) return null;

                    const isHovered = hoveredNode === task.assignedToId;
                    const connectionColor = getTaskConnectionColor(task.status);
                    const midX = (leaderPos.x + agentPos.x) / 2;
                    const midY = (leaderPos.y + agentPos.y) / 2 - 30;
                    const pathId = `path-${task.id}`;

                    // Calculate animated particle position
                    const isActive =
                      task.status === 'IN_PROGRESS' ||
                      task.status === 'AWAITING_REVIEW';
                    // particleOffset could be used for custom animation timing
                    const _particleOffset =
                      ((animationTick + taskIndex * 20) % 100) / 100;

                    return (
                      <g key={task.id}>
                        {/* Glow effect for active connections */}
                        {isActive && (
                          <path
                            d={`M ${leaderPos.x} ${leaderPos.y + 40} Q ${midX} ${midY} ${agentPos.x} ${agentPos.y - 40}`}
                            fill="none"
                            stroke={connectionColor}
                            strokeWidth={8}
                            opacity={0.2}
                            className="animate-pulse"
                          />
                        )}

                        {/* Main path */}
                        <path
                          id={pathId}
                          d={`M ${leaderPos.x} ${leaderPos.y + 40} Q ${midX} ${midY} ${agentPos.x} ${agentPos.y - 40}`}
                          fill="none"
                          stroke={connectionColor}
                          strokeWidth={isHovered ? 4 : 2}
                          strokeDasharray={
                            task.status === 'PENDING' ? '8 4' : 'none'
                          }
                          className="transition-all duration-300"
                          style={{ cursor: 'pointer' }}
                          onClick={(e) => handleTaskClick(task, e)}
                        />

                        {/* Animated particles for active tasks - data flowing */}
                        {isActive && (
                          <>
                            {/* Main particle */}
                            <circle r="6" fill={connectionColor} opacity={0.9}>
                              <animateMotion
                                dur={
                                  task.status === 'IN_PROGRESS' ? '2s' : '3s'
                                }
                                repeatCount="indefinite"
                                path={`M ${leaderPos.x} ${leaderPos.y + 40} Q ${midX} ${midY} ${agentPos.x} ${agentPos.y - 40}`}
                              />
                            </circle>
                            {/* Trail particle 1 */}
                            <circle r="4" fill={connectionColor} opacity={0.6}>
                              <animateMotion
                                dur={
                                  task.status === 'IN_PROGRESS' ? '2s' : '3s'
                                }
                                repeatCount="indefinite"
                                begin="-0.3s"
                                path={`M ${leaderPos.x} ${leaderPos.y + 40} Q ${midX} ${midY} ${agentPos.x} ${agentPos.y - 40}`}
                              />
                            </circle>
                            {/* Trail particle 2 */}
                            <circle r="3" fill={connectionColor} opacity={0.3}>
                              <animateMotion
                                dur={
                                  task.status === 'IN_PROGRESS' ? '2s' : '3s'
                                }
                                repeatCount="indefinite"
                                begin="-0.6s"
                                path={`M ${leaderPos.x} ${leaderPos.y + 40} Q ${midX} ${midY} ${agentPos.x} ${agentPos.y - 40}`}
                              />
                            </circle>
                          </>
                        )}

                        {/* Completion checkmark for completed tasks */}
                        {task.status === 'COMPLETED' && (
                          <g transform={`translate(${midX}, ${midY})`}>
                            <circle r="12" fill="#22c55e" />
                            <path
                              d="M-4 0 L-1 3 L5 -3"
                              fill="none"
                              stroke="white"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </g>
                        )}

                        {/* Arrow marker */}
                        <circle
                          cx={agentPos.x}
                          cy={agentPos.y - 40}
                          r={isHovered ? 7 : 5}
                          fill={connectionColor}
                          className="transition-all duration-300"
                        />

                        {/* Enhanced message bubble - always visible for active tasks */}
                        {(isActive || isHovered) && (
                          <g transform={`translate(${midX}, ${midY - 25})`}>
                            {/* Bubble background with shadow */}
                            <filter
                              id={`bubble-shadow-${task.id}`}
                              x="-50%"
                              y="-50%"
                              width="200%"
                              height="200%"
                            >
                              <feDropShadow
                                dx="0"
                                dy="2"
                                stdDeviation="3"
                                floodOpacity="0.2"
                              />
                            </filter>
                            <rect
                              x="-55"
                              y="-16"
                              width="110"
                              height="32"
                              rx="8"
                              fill="white"
                              stroke={connectionColor}
                              strokeWidth="2"
                              filter={`url(#bubble-shadow-${task.id})`}
                            />
                            {/* Bubble tail */}
                            <path
                              d="M -5 16 L 0 24 L 5 16"
                              fill="white"
                              stroke={connectionColor}
                              strokeWidth="2"
                              strokeLinejoin="round"
                            />
                            <rect
                              x="-6"
                              y="14"
                              width="12"
                              height="4"
                              fill="white"
                            />
                            {/* Status icon and text */}
                            <g transform="translate(0, 0)">
                              <text
                                textAnchor="middle"
                                dy="0.35em"
                                fontSize="12"
                                fill="#374151"
                                fontWeight="600"
                              >
                                {task.status === 'IN_PROGRESS'
                                  ? '⚡ 执行中...'
                                  : task.status === 'COMPLETED'
                                    ? '✅ 已完成'
                                    : task.status === 'AWAITING_REVIEW'
                                      ? '🔍 待审核'
                                      : task.status === 'PENDING'
                                        ? '⏳ 等待中'
                                        : task.status === 'REVISION_NEEDED'
                                          ? '↻ 需修订'
                                          : task.status}
                              </text>
                            </g>
                          </g>
                        )}

                        {/* Task title tooltip on hover */}
                        {isHovered && task.title && (
                          <g transform={`translate(${midX}, ${midY + 30})`}>
                            <rect
                              x={-Math.min(task.title.length * 5, 100)}
                              y="-12"
                              width={Math.min(task.title.length * 10, 200)}
                              height="24"
                              rx="4"
                              fill="#1f2937"
                              opacity="0.9"
                            />
                            <text
                              textAnchor="middle"
                              dy="0.35em"
                              fontSize="11"
                              fill="white"
                            >
                              {task.title.length > 20
                                ? task.title.slice(0, 20) + '...'
                                : task.title}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Agent Nodes */}
                  {aiMembers.map((agent) => {
                    const defaultPos = nodePositions.get(agent.id);
                    const pos = customPositions.get(agent.id) || defaultPos;
                    if (!pos) return null;

                    const isLeader = agent.id === mission.leaderId;
                    const isWorking = typingAIs.has(agent.id);
                    const stats = getAgentStats(agent.id);
                    const statusColors = getAgentStatusColor(
                      isLeader,
                      isWorking,
                      stats.completed > 0,
                      stats.inProgress > 0
                    );
                    const isHovered = hoveredNode === agent.id;
                    const isSelected = selectedAgent?.id === agent.id;
                    const isDragging = draggedNode === agent.id;
                    // Increased node sizes for better visibility
                    const nodeRadius = isLeader ? 48 : 40;

                    // Smart name parsing for better display
                    const fullName = agent.displayName || 'Agent';
                    // Extract model name (e.g., "AI-ChatGPT" -> "ChatGPT")
                    const cleanName = fullName.replace(/^AI-/i, '');
                    // Split into primary and secondary parts
                    const nameParts = cleanName.split(/[\s-_]+/);
                    const primaryName =
                      nameParts[0].length > 10
                        ? nameParts[0].slice(0, 10)
                        : nameParts[0];
                    const secondaryName =
                      nameParts.length > 1
                        ? nameParts.slice(1).join(' ').slice(0, 12)
                        : null;

                    return (
                      <g
                        key={agent.id}
                        transform={`translate(${pos.x}, ${pos.y})`}
                        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                        onMouseEnter={() =>
                          !draggedNode && setHoveredNode(agent.id)
                        }
                        onMouseLeave={() =>
                          !draggedNode && setHoveredNode(null)
                        }
                        onMouseDown={(e) => handleDragStart(agent.id, e)}
                        onClick={(e) => handleAgentClick(agent, e)}
                      >
                        {/* Selection ring for selected agent */}
                        {isSelected && (
                          <circle
                            r={nodeRadius + 12}
                            fill="none"
                            stroke="#6366f1"
                            strokeWidth="3"
                            strokeDasharray="8 4"
                            opacity="0.8"
                          >
                            <animateTransform
                              attributeName="transform"
                              type="rotate"
                              from="0"
                              to="360"
                              dur="10s"
                              repeatCount="indefinite"
                            />
                          </circle>
                        )}

                        {/* Glow effect for working agents */}
                        {isWorking && (
                          <>
                            <circle
                              r={nodeRadius + 18}
                              fill={statusColors.fill}
                              opacity="0.15"
                              className="animate-ping"
                            />
                            <circle
                              r={nodeRadius + 10}
                              fill={statusColors.fill}
                              opacity="0.25"
                            />
                          </>
                        )}

                        {/* Outer ring for hover */}
                        <circle
                          r={nodeRadius + 6}
                          fill="white"
                          filter="url(#shadow)"
                          className={`transition-all duration-300 ${isHovered || isSelected ? 'opacity-100' : 'opacity-85'}`}
                        />

                        {/* Main circle */}
                        <circle
                          r={nodeRadius}
                          fill={
                            isLeader
                              ? 'url(#leader-gradient)'
                              : statusColors.fill
                          }
                          className={`transition-all duration-300 ${isHovered ? 'scale-105' : ''}`}
                          style={{ transformOrigin: 'center' }}
                        />

                        {/* Agent initial/icon - larger */}
                        <text
                          textAnchor="middle"
                          dy="0.35em"
                          fill="white"
                          fontSize={isLeader ? '24' : '22'}
                          fontWeight="bold"
                        >
                          {cleanName.charAt(0).toUpperCase()}
                        </text>

                        {/* Leader crown */}
                        {isLeader && (
                          <text
                            textAnchor="middle"
                            y={-nodeRadius - 14}
                            fontSize="22"
                          >
                            👑
                          </text>
                        )}

                        {/* Agent name - Two-line display */}
                        <g transform={`translate(0, ${nodeRadius + 16})`}>
                          {/* Primary name (model type) */}
                          <text
                            textAnchor="middle"
                            fill="#1f2937"
                            fontSize="13"
                            fontWeight="600"
                          >
                            {primaryName}
                          </text>
                          {/* Secondary name (identifier) */}
                          {secondaryName && (
                            <text
                              textAnchor="middle"
                              y="15"
                              fill="#6b7280"
                              fontSize="11"
                            >
                              {secondaryName}
                            </text>
                          )}
                        </g>

                        {/* Full name tooltip on hover */}
                        {isHovered && fullName.length > 12 && (
                          <g
                            transform={`translate(0, ${-nodeRadius - (isLeader ? 42 : 28)})`}
                          >
                            <rect
                              x={-Math.min(fullName.length * 4, 70) - 8}
                              y="-14"
                              width={Math.min(fullName.length * 8, 140) + 16}
                              height="28"
                              rx="6"
                              fill="#1f2937"
                              opacity="0.95"
                            />
                            <text
                              textAnchor="middle"
                              dy="0.35em"
                              fill="white"
                              fontSize="12"
                              fontWeight="500"
                            >
                              {fullName.length > 18
                                ? fullName.slice(0, 18) + '...'
                                : fullName}
                            </text>
                          </g>
                        )}

                        {/* Task count badge - larger */}
                        {stats.total > 0 && (
                          <g
                            transform={`translate(${nodeRadius - 6}, ${-nodeRadius + 6})`}
                          >
                            <circle
                              r="16"
                              fill="white"
                              stroke={
                                stats.completed === stats.total
                                  ? '#22c55e'
                                  : stats.inProgress > 0
                                    ? '#3b82f6'
                                    : '#d1d5db'
                              }
                              strokeWidth="2.5"
                            />
                            <text
                              textAnchor="middle"
                              dy="0.35em"
                              fontSize="12"
                              fontWeight="bold"
                              fill={
                                stats.completed === stats.total
                                  ? '#16a34a'
                                  : stats.inProgress > 0
                                    ? '#2563eb'
                                    : '#6b7280'
                              }
                            >
                              {stats.completed}/{stats.total}
                            </text>
                          </g>
                        )}

                        {/* Working indicator with ripple */}
                        {isWorking && (
                          <g
                            transform={`translate(${-nodeRadius + 6}, ${-nodeRadius + 6})`}
                          >
                            <circle
                              r="12"
                              fill="#3b82f6"
                              className="animate-pulse"
                            />
                            <circle r="4" fill="white" />
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>
                {/* End of Zoomable container */}
              </svg>
            </div>
          )}

          {/* Agent Popover */}
          {selectedAgent && popoverPosition && (
            <AgentPopover
              agent={selectedAgent}
              isLeader={selectedAgent.id === mission?.leaderId}
              tasks={tasksByAgent.get(selectedAgent.id) || []}
              isWorking={typingAIs.has(selectedAgent.id)}
              position={popoverPosition}
              onClose={handleClosePopover}
              onTaskClick={(task) => {
                setSelectedTask(task);
                setSelectedAgent(null);
              }}
              missionTitle={mission?.title}
            />
          )}

          {/* Task Popover */}
          {selectedTask && popoverPosition && (
            <TaskPopover
              task={selectedTask}
              position={popoverPosition}
              onClose={handleClosePopover}
            />
          )}
        </div>
      </div>
    </div>
  );

  // Return embedded content directly or wrapped in modal overlay
  if (embedded) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {content}
    </div>
  );
}

// Agent Detail Panel - Enhanced with responsibilities, goals, and results
function AgentDetailPanel({
  agent,
  isLeader,
  tasks,
  isWorking,
  onClose,
  onTaskClick,
  missionTitle,
}: {
  agent: TopicAIMember;
  isLeader: boolean;
  tasks: AgentTask[];
  isWorking: boolean;
  onClose: () => void;
  onTaskClick: (task: AgentTask) => void;
  missionTitle?: string;
}) {
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED');
  const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS');
  const totalRevisions = tasks.reduce(
    (sum, t) => sum + (t.revisionCount || 0),
    0
  );

  // Calculate agent's contribution
  const completedResults = completedTasks.map((t) => t.result).filter(Boolean);

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-slate-50 to-white">
      {/* Enhanced Header with gradient background */}
      <div className="relative overflow-hidden">
        <div
          className={`absolute inset-0 ${
            isLeader
              ? 'bg-gradient-to-br from-purple-500/10 via-violet-500/5 to-transparent'
              : 'bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent'
          }`}
        />
        <div className="relative p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {/* Enhanced Avatar */}
              <div className="relative">
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold text-white shadow-lg ${
                    isLeader
                      ? 'bg-gradient-to-br from-purple-500 to-violet-600 ring-4 ring-purple-200'
                      : 'bg-gradient-to-br from-blue-500 to-indigo-600 ring-4 ring-blue-200'
                  }`}
                >
                  {agent.displayName?.charAt(0) || 'A'}
                </div>
                {isLeader && (
                  <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-xs shadow-md">
                    👑
                  </div>
                )}
                {isWorking && (
                  <div className="absolute -bottom-1 -right-1 h-4 w-4 animate-pulse rounded-full bg-green-500 ring-2 ring-white" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900">
                  {agent.displayName}
                </h3>
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    isLeader
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {isLeader ? '🎯 Team Leader' : '💼 Team Member'}
                </div>
                {isWorking && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-green-600">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
                    </span>
                    正在工作中...
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Role & Responsibilities - Enhanced */}
        <div className="mb-4 overflow-hidden rounded-xl border border-purple-200/50 bg-gradient-to-br from-purple-50 via-violet-50/50 to-blue-50/30 shadow-sm">
          <div className="flex items-center gap-2 border-b border-purple-100/50 bg-white/50 px-3 py-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-purple-500 to-violet-500">
              <svg
                className="h-3 w-3 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <span className="text-xs font-semibold text-purple-700">
              职责定位
            </span>
          </div>
          <div className="p-3 text-sm leading-relaxed text-gray-600">
            {isLeader
              ? '作为Team Leader，负责：任务规划与分解、工作分配、进度监控、质量审核、成果整合'
              : '作为Team Member，负责：执行分配的任务、产出高质量成果、响应Leader反馈'}
          </div>
        </div>

        {/* Current Goal - Enhanced */}
        {(inProgressTasks.length > 0 || missionTitle) && (
          <div className="mb-4 overflow-hidden rounded-xl border border-blue-200/50 bg-gradient-to-br from-blue-50 via-sky-50/50 to-cyan-50/30 shadow-sm">
            <div className="flex items-center gap-2 border-b border-blue-100/50 bg-white/50 px-3 py-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-blue-500 to-cyan-500">
                <svg
                  className="h-3 w-3 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <span className="text-xs font-semibold text-blue-700">
                当前目标
              </span>
            </div>
            <div className="p-3 text-sm leading-relaxed text-gray-600">
              {inProgressTasks.length > 0
                ? inProgressTasks.map((t) => t.title).join('、')
                : isLeader
                  ? `协调团队完成：${missionTitle || '待分配任务'}`
                  : '等待任务分配'}
            </div>
          </div>
        )}

        {/* Expertise */}
        {agent.expertiseAreas && agent.expertiseAreas.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-1 text-xs font-medium text-gray-500">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              专长领域
            </div>
            <div className="flex flex-wrap gap-1">
              {agent.expertiseAreas.map((area) => (
                <span
                  key={area}
                  className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700"
                >
                  {area}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Performance Stats - Enhanced Design */}
        {tasks.length > 0 && (
          <div className="mb-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500">
                <svg
                  className="h-3.5 w-3.5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <span className="text-sm font-semibold text-gray-700">
                绩效统计
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 transition-all hover:border-slate-300 hover:shadow-sm">
                <div className="absolute -right-2 -top-2 h-12 w-12 rounded-full bg-slate-100 opacity-50" />
                <div className="relative">
                  <div className="text-2xl font-bold text-slate-700">
                    {tasks.length}
                  </div>
                  <div className="text-xs font-medium text-slate-500">
                    分配任务
                  </div>
                </div>
              </div>
              <div className="group relative overflow-hidden rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3 transition-all hover:border-emerald-300 hover:shadow-sm">
                <div className="absolute -right-2 -top-2 h-12 w-12 rounded-full bg-emerald-100 opacity-50" />
                <div className="relative">
                  <div className="text-2xl font-bold text-emerald-600">
                    {completedTasks.length}
                  </div>
                  <div className="text-xs font-medium text-emerald-600">
                    已完成
                  </div>
                </div>
              </div>
              <div className="group relative overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-3 transition-all hover:border-blue-300 hover:shadow-sm">
                <div className="absolute -right-2 -top-2 h-12 w-12 rounded-full bg-blue-100 opacity-50" />
                <div className="relative">
                  <div className="text-2xl font-bold text-blue-600">
                    {inProgressTasks.length}
                  </div>
                  <div className="text-xs font-medium text-blue-600">
                    进行中
                  </div>
                </div>
              </div>
              <div className="group relative overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-3 transition-all hover:border-amber-300 hover:shadow-sm">
                <div className="absolute -right-2 -top-2 h-12 w-12 rounded-full bg-amber-100 opacity-50" />
                <div className="relative">
                  <div className="text-2xl font-bold text-amber-600">
                    {totalRevisions}
                  </div>
                  <div className="text-xs font-medium text-amber-600">
                    修订次数
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Completed Results Summary - Enhanced */}
        {completedResults.length > 0 && (
          <div className="mb-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500">
                <svg
                  className="h-3.5 w-3.5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <span className="text-sm font-semibold text-gray-700">
                已完成的成果
              </span>
            </div>
            <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
              {completedTasks.slice(0, 3).map((task) => (
                <div
                  key={task.id}
                  className="group rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50/80 to-teal-50/50 p-3 transition-all hover:border-emerald-200 hover:shadow-sm"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-emerald-500">✓</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-emerald-800">
                        {task.title}
                      </div>
                      {task.result && (
                        <div className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-500">
                          {task.result.substring(0, 120)}...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {completedTasks.length > 3 && (
                <div className="py-2 text-center text-xs text-gray-400">
                  还有 {completedTasks.length - 3} 个完成的任务...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Task List - Enhanced */}
        {tasks.length > 0 && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-slate-500 to-gray-600">
                <svg
                  className="h-3.5 w-3.5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <span className="text-sm font-semibold text-gray-700">
                全部任务
              </span>
              <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                {tasks.length}
              </span>
            </div>
            <div className="space-y-2">
              {tasks.map((task) => {
                const statusConfig = taskStatusConfig[task.status];
                return (
                  <div
                    key={task.id}
                    onClick={() => onTaskClick(task)}
                    className={`group cursor-pointer rounded-xl border p-3 transition-all hover:shadow-md ${statusConfig.borderColor} ${statusConfig.bgColor}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-800 group-hover:text-gray-900">
                          {task.title}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
                          >
                            {statusConfig.icon} {statusConfig.label}
                          </span>
                          {task.revisionCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                              ↻ {task.revisionCount}次
                            </span>
                          )}
                        </div>
                      </div>
                      <svg
                        className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Task Detail Panel
function TaskDetailPanel({
  task,
  onClose,
}: {
  task: AgentTask;
  onClose: () => void;
}) {
  const statusConfig = taskStatusConfig[task.status];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-100 p-4">
        <h3 className="font-semibold text-gray-900">任务详情</h3>
        <button onClick={onClose} className="rounded p-1 hover:bg-gray-100">
          <svg
            className="h-5 w-5 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Task Header */}
        <div className="mb-4">
          <h4 className="font-semibold text-gray-900">{task.title}</h4>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
            >
              {statusConfig.icon} {statusConfig.label}
            </span>
            {task.revisionCount > 0 && (
              <span className="text-xs text-orange-500">
                修订 {task.revisionCount}次
              </span>
            )}
          </div>
        </div>

        {/* Assignee */}
        <div className="mb-4 rounded-lg bg-gray-50 p-3">
          <div className="mb-1 text-xs font-medium text-gray-500">执行者</div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-blue-400 text-xs text-white">
              {task.assignedTo?.displayName?.charAt(0) || 'A'}
            </div>
            <span className="text-sm font-medium text-gray-700">
              {task.assignedTo?.displayName || 'Unknown'}
            </span>
          </div>
        </div>

        {/* Description */}
        {task.description && task.description !== task.title && (
          <div className="mb-4">
            <div className="mb-1 text-xs font-medium text-gray-500">
              任务描述
            </div>
            <div className="whitespace-pre-wrap text-sm text-gray-700">
              {task.description}
            </div>
          </div>
        )}

        {/* Result */}
        {task.result && (
          <div className="mb-4">
            <div className="mb-1 text-xs font-medium text-gray-500">
              执行成果
            </div>
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
              {task.result}
            </div>
          </div>
        )}

        {/* Leader Feedback */}
        {task.leaderFeedback && (
          <div className="mb-4">
            <div className="mb-1 text-xs font-medium text-gray-500">
              Leader 评审
            </div>
            <div
              className={`whitespace-pre-wrap rounded-lg p-3 text-sm text-gray-700 ${
                task.status === 'COMPLETED'
                  ? 'border border-green-200 bg-green-50'
                  : task.status === 'REVISION_NEEDED'
                    ? 'border border-orange-200 bg-orange-50'
                    : 'border border-purple-200 bg-purple-50'
              }`}
            >
              {task.leaderFeedback}
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="space-y-1 text-xs text-gray-400">
          {task.startedAt && (
            <div>开始: {new Date(task.startedAt).toLocaleString('zh-CN')}</div>
          )}
          {task.completedAt && (
            <div>
              完成: {new Date(task.completedAt).toLocaleString('zh-CN')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Agent Popover - Centered modal for agent details
function AgentPopover({
  agent,
  isLeader,
  tasks,
  isWorking,
  onClose,
  onTaskClick,
  missionTitle,
}: {
  agent: TopicAIMember;
  isLeader: boolean;
  tasks: AgentTask[];
  isWorking: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onTaskClick: (task: AgentTask) => void;
  missionTitle?: string;
}) {
  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED');
  const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS');
  const totalRevisions = tasks.reduce(
    (sum, t) => sum + (t.revisionCount || 0),
    0
  );

  return (
    <>
      {/* Backdrop - full screen overlay */}
      <div
        className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal Card - centered */}
      <div
        className="animate-in fade-in zoom-in-95 fixed left-1/2 top-1/2 z-[201] w-[600px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          {/* Header with gradient */}
          <div
            className={`relative px-4 py-3 ${
              isLeader
                ? 'bg-gradient-to-r from-purple-500 to-violet-600'
                : 'bg-gradient-to-r from-blue-500 to-indigo-600'
            }`}
          >
            <button
              onClick={onClose}
              className="absolute right-2 top-2 rounded-full p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-xl font-bold text-white backdrop-blur-sm">
                {agent.displayName?.charAt(0) || 'A'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-white">
                    {agent.displayName}
                  </span>
                  {isLeader && <span className="text-lg">👑</span>}
                </div>
                <div className="text-sm text-white/80">
                  {isLeader ? 'Team Leader' : 'Team Member'}
                </div>
              </div>
            </div>
            {isWorking && (
              <div className="mt-2 flex items-center gap-2 text-sm text-white/90">
                <span className="flex gap-0.5">
                  <span
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-white"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-white"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-white"
                    style={{ animationDelay: '300ms' }}
                  />
                </span>
                正在工作中...
              </div>
            )}
          </div>

          {/* Content */}
          <div className="max-h-[60vh] overflow-y-auto p-6">
            {/* Role Info */}
            <div className="mb-5 rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="mb-2 text-sm font-semibold text-gray-600">
                职责定位
              </div>
              <div className="text-base leading-relaxed text-gray-700">
                {isLeader
                  ? '任务规划与分解、工作分配、进度监控、质量审核、成果整合'
                  : '执行分配的任务、产出高质量成果、响应Leader反馈'}
              </div>
            </div>

            {/* Current Goal */}
            {(inProgressTasks.length > 0 || missionTitle) && (
              <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
                <div className="mb-2 text-sm font-semibold text-blue-600">
                  当前目标
                </div>
                <div className="text-base leading-relaxed text-gray-700">
                  {inProgressTasks.length > 0
                    ? inProgressTasks.map((t) => t.title).join('、')
                    : isLeader
                      ? `协调团队完成：${missionTitle || '待分配任务'}`
                      : '等待任务分配'}
                </div>
              </div>
            )}

            {/* Performance Stats */}
            {tasks.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 text-sm font-medium text-gray-500">
                  绩效统计
                </div>
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div className="rounded-xl bg-gray-100 p-3">
                    <div className="text-xl font-bold text-gray-900">
                      {tasks.length}
                    </div>
                    <div className="text-xs text-gray-500">分配</div>
                  </div>
                  <div className="rounded-xl bg-green-100 p-3">
                    <div className="text-xl font-bold text-green-600">
                      {completedTasks.length}
                    </div>
                    <div className="text-xs text-green-600">完成</div>
                  </div>
                  <div className="rounded-xl bg-blue-100 p-3">
                    <div className="text-xl font-bold text-blue-600">
                      {inProgressTasks.length}
                    </div>
                    <div className="text-xs text-blue-600">进行中</div>
                  </div>
                  <div className="rounded-xl bg-orange-100 p-3">
                    <div className="text-xl font-bold text-orange-600">
                      {totalRevisions}
                    </div>
                    <div className="text-xs text-orange-600">修订</div>
                  </div>
                </div>
              </div>
            )}

            {/* Expertise */}
            {agent.expertiseAreas && agent.expertiseAreas.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 text-sm font-medium text-gray-500">
                  专长领域
                </div>
                <div className="flex flex-wrap gap-2">
                  {agent.expertiseAreas.map((area) => (
                    <span
                      key={area}
                      className="rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-600"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Task List */}
            {tasks.length > 0 && (
              <div>
                <div className="mb-3 text-sm font-medium text-gray-500">
                  任务列表
                </div>
                <div className="space-y-2">
                  {tasks.slice(0, 6).map((task) => {
                    const config = taskStatusConfig[task.status];
                    return (
                      <div
                        key={task.id}
                        onClick={() => onTaskClick(task)}
                        className={`cursor-pointer rounded-xl border px-4 py-3 transition-all hover:shadow-md ${config.borderColor} ${config.bgColor}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900">
                            {task.title}
                          </span>
                          <span className={`text-sm ${config.color}`}>
                            {config.icon} {config.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {tasks.length > 6 && (
                    <div className="py-2 text-center text-sm text-gray-400">
                      还有 {tasks.length - 6} 个任务...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Task Popover - Centered modal for task details
function TaskPopover({
  task,
  onClose,
}: {
  task: AgentTask;
  position: { x: number; y: number };
  onClose: () => void;
}) {
  const statusConfig = taskStatusConfig[task.status];

  return (
    <>
      {/* Backdrop - full screen overlay */}
      <div
        className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal Card - centered */}
      <div
        className="animate-in fade-in zoom-in-95 fixed left-1/2 top-1/2 z-[201] w-[650px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          {/* Header */}
          <div className={`relative px-6 py-5 ${statusConfig.bgColor}`}>
            <button
              onClick={onClose}
              className="absolute right-2 top-2 rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <div className="flex items-start gap-4">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full text-xl ${
                  task.status === 'COMPLETED'
                    ? 'bg-green-500 text-white'
                    : task.status === 'IN_PROGRESS'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-300 text-gray-600'
                }`}
              >
                {statusConfig.icon}
              </div>
              <div className="flex-1 pr-8">
                <h3 className="text-lg font-semibold text-gray-900">
                  {task.title}
                </h3>
                <div className="mt-2 flex items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${statusConfig.bgColor} ${statusConfig.color} border ${statusConfig.borderColor}`}
                  >
                    {statusConfig.label}
                  </span>
                  {task.revisionCount > 0 && (
                    <span className="text-sm text-orange-500">
                      修订 {task.revisionCount} 次
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-[60vh] overflow-y-auto p-6">
            {/* Assignee */}
            <div className="mb-5 flex items-center gap-4 rounded-xl bg-gray-50 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-blue-400 text-base font-medium text-white">
                {task.assignedTo?.displayName?.charAt(0) || 'A'}
              </div>
              <div>
                <div className="text-sm text-gray-500">执行者</div>
                <div className="text-lg font-medium text-gray-900">
                  {task.assignedTo?.displayName || 'Unknown'}
                </div>
              </div>
            </div>

            {/* Description */}
            {task.description && task.description !== task.title && (
              <div className="mb-5">
                <div className="mb-2 text-sm font-semibold text-gray-600">
                  任务描述
                </div>
                <div className="prose prose-sm max-w-none rounded-xl border border-gray-100 bg-gray-50 p-4 text-gray-700">
                  <ReactMarkdown>{task.description}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Result */}
            {task.result && (
              <div className="mb-5">
                <div className="mb-2 text-sm font-semibold text-gray-600">
                  执行成果
                </div>
                <div className="prose prose-sm max-h-[250px] max-w-none overflow-y-auto rounded-xl border border-green-100 bg-green-50 p-4 text-gray-700">
                  <ReactMarkdown>{task.result}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Leader Feedback */}
            {task.leaderFeedback && (
              <div className="mb-5">
                <div className="mb-2 text-sm font-semibold text-gray-600">
                  Leader 评审
                </div>
                <div
                  className={`prose prose-sm max-h-[180px] max-w-none overflow-y-auto rounded-xl border p-4 text-gray-700 ${
                    task.status === 'COMPLETED'
                      ? 'border-green-200 bg-green-50'
                      : task.status === 'REVISION_NEEDED'
                        ? 'border-orange-200 bg-orange-50'
                        : 'border-purple-200 bg-purple-50'
                  }`}
                >
                  <ReactMarkdown>{task.leaderFeedback}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="flex gap-8 rounded-xl bg-gray-50 p-4 text-base text-gray-500">
              {task.startedAt && (
                <div>
                  <span className="font-semibold text-gray-600">开始:</span>{' '}
                  {new Date(task.startedAt).toLocaleString('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              )}
              {task.completedAt && (
                <div>
                  <span className="font-semibold text-gray-600">完成:</span>{' '}
                  {new Date(task.completedAt).toLocaleString('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
