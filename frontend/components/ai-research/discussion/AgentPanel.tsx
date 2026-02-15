'use client';

/**
 * AgentPanel - Research team SVG hexagon visualization
 *
 * Left panel showing:
 * 1. Header: team title + legend
 * 2. SVG Canvas: hexagon layout with 6 agent nodes, Bezier connections
 * 3. Agent status list (idle/speaking/searching/writing)
 * 4. Research directions (after ideation phase)
 *
 * Follows PlanTeamPanel pattern but uses Lucide icons via foreignObject
 */

import { useState } from 'react';
import {
  Crown,
  Search,
  BarChart3,
  PenLine,
  ShieldCheck,
  Info,
  ChevronDown,
  ChevronUp,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type {
  DiscussionMessage,
  DiscussionPhase,
  DiscussionRole,
} from '@/hooks';

// ---- Props ----

interface AgentPanelProps {
  messages: DiscussionMessage[];
  typingAgent: { role: string; name: string } | null;
  directions: string[];
  currentPhase: DiscussionPhase;
}

// ---- Constants ----

const ROLE_ICONS: Record<string, LucideIcon> = {
  director: Crown,
  researcher: Search,
  analyst: BarChart3,
  writer: PenLine,
  reviewer: ShieldCheck,
};

const ICON_MAP: Record<string, LucideIcon> = {
  crown: Crown,
  search: Search,
  'bar-chart-3': BarChart3,
  'pen-line': PenLine,
  'shield-check': ShieldCheck,
  info: Info,
};

/** Hex colors for SVG fills */
const ROLE_HEX_COLORS: Record<DiscussionRole, string> = {
  director: '#8B5CF6',
  researcher: '#3B82F6',
  analyst: '#10B981',
  writer: '#F59E0B',
  reviewer: '#F43F5E',
};

const ROLE_GLOW_COLORS: Record<DiscussionRole, string> = {
  director: '#C4B5FD',
  researcher: '#93C5FD',
  analyst: '#6EE7B7',
  writer: '#FCD34D',
  reviewer: '#FDA4AF',
};

const ROLE_TAILWIND_BG: Record<DiscussionRole, string> = {
  director: 'bg-purple-500',
  researcher: 'bg-blue-500',
  analyst: 'bg-emerald-500',
  writer: 'bg-amber-500',
  reviewer: 'bg-rose-500',
};

const ROLE_TAILWIND_TEXT: Record<DiscussionRole, string> = {
  director: 'text-purple-600',
  researcher: 'text-blue-600',
  analyst: 'text-emerald-600',
  writer: 'text-amber-600',
  reviewer: 'text-rose-600',
};

const ROLE_DESCRIPTIONS: Record<DiscussionRole, string> = {
  director: '统筹规划研究方向，协调团队讨论',
  researcher: '深度搜索和信息收集',
  analyst: '数据分析和交叉验证',
  writer: '撰写研究报告和摘要',
  reviewer: '质量审核和建议改进',
};

// Hexagon node positions (viewBox 320x200) - 6 roles
const HEXAGON_POSITIONS = [
  { x: 160, y: 32 }, // top: director
  { x: 248, y: 76 }, // top-right: researcher A
  { x: 248, y: 148 }, // bottom-right: researcher B
  { x: 160, y: 178 }, // bottom: writer
  { x: 72, y: 148 }, // bottom-left: analyst
  { x: 72, y: 76 }, // top-left: reviewer
];

type AgentStatus = 'idle' | 'speaking' | 'searching' | 'writing';

interface AgentNode {
  role: DiscussionRole;
  name: string;
  icon: string;
  status: AgentStatus;
  posIndex: number;
}

// ---- Helpers ----

function getAgentStatus(
  role: DiscussionRole,
  typingAgent: { role: string; name: string } | null
): AgentStatus {
  if (!typingAgent) return 'idle';
  if (typingAgent.role === role) {
    if (role === 'researcher') return 'searching';
    if (role === 'writer') return 'writing';
    return 'speaking';
  }
  return 'idle';
}

function extractAgentNodes(
  messages: DiscussionMessage[],
  typingAgent: { role: string; name: string } | null
): AgentNode[] {
  const seen = new Map<string, AgentNode>();

  // Default layout order for consistent positioning
  const roleOrder: DiscussionRole[] = [
    'director',
    'researcher',
    'researcher',
    'writer',
    'analyst',
    'reviewer',
  ];

  messages.forEach((msg) => {
    const key = `${msg.agentRole}_${msg.agentName}`;
    if (!seen.has(key)) {
      seen.set(key, {
        role: msg.agentRole,
        name: msg.agentName,
        icon: msg.agentIcon,
        status: getAgentStatus(msg.agentRole, typingAgent),
        posIndex: seen.size,
      });
    }
  });

  // If we have agents, use them; otherwise use defaults
  if (seen.size > 0) {
    const nodes = Array.from(seen.values());
    return nodes.slice(0, 6).map((n, i) => ({ ...n, posIndex: i }));
  }

  return roleOrder.map((role, i) => ({
    role,
    name: role === 'researcher' ? `研究员 ${i === 1 ? 'A' : 'B'}` : '',
    icon: '',
    status: 'idle' as AgentStatus,
    posIndex: i,
  }));
}

function getStatusLabel(status: AgentStatus): string {
  switch (status) {
    case 'speaking':
      return '发言中';
    case 'searching':
      return '搜索中';
    case 'writing':
      return '撰写中';
    default:
      return '待命';
  }
}

function getRoleCapabilities(role: DiscussionRole): string[] {
  const caps: Record<DiscussionRole, string[]> = {
    director: ['研究规划', '方向引导', '共识构建', '质量把控'],
    researcher: ['信息检索', '深度搜索', '来源分析', '数据收集'],
    analyst: ['数据分析', '交叉验证', '逻辑推理', '趋势识别'],
    writer: ['内容整合', '报告撰写', '结构组织', '文字润色'],
    reviewer: ['质量审核', '准确性验证', '一致性检查', '改进建议'],
  };
  return caps[role] || [];
}

// ---- Main Component ----

export function AgentPanel({
  messages,
  typingAgent,
  directions,
  currentPhase,
}: AgentPanelProps) {
  const [hoveredAgent, setHoveredAgent] = useState<number | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [directionsExpanded, setDirectionsExpanded] = useState(true);

  const agents = extractAgentNodes(messages, typingAgent);
  const canvasSize = { width: 320, height: 210 };
  const hasAgents = messages.length > 0;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-800">研究团队</h3>
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-purple-500" />
            总监
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            工作中
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-gray-300" />
            待命
          </span>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative flex-shrink-0 border-b border-gray-100">
        {hasAgents ? (
          <TeamCanvas
            agents={agents}
            canvasSize={canvasSize}
            hoveredAgent={hoveredAgent}
            onHover={setHoveredAgent}
            selectedAgent={selectedAgent}
            onSelect={setSelectedAgent}
          />
        ) : (
          <div className="flex h-[210px] flex-col items-center justify-center text-gray-400">
            <Crown className="mb-2 h-8 w-8 text-purple-300" />
            <p className="text-sm">等待研究开始</p>
            <p className="mt-1 text-xs">团队将在研究启动后显示</p>
          </div>
        )}
      </div>

      {/* Active Tasks List */}
      {hasAgents && (
        <div className="flex-shrink-0 border-b border-gray-100 px-4 py-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            实时状态
          </h4>
          <div className="space-y-1.5">
            {agents.map((agent) => {
              const Icon =
                ICON_MAP[agent.icon] || ROLE_ICONS[agent.role] || Info;
              const isActive = agent.status !== 'idle';
              return (
                <div
                  key={`${agent.role}_${agent.name}`}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                    isActive ? 'bg-blue-50/60' : 'bg-transparent'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-white',
                      ROLE_TAILWIND_BG[agent.role]
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </div>
                  <span className="flex-1 truncate font-medium text-gray-700">
                    {agent.name}
                  </span>
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      isActive ? 'animate-pulse bg-blue-500' : 'bg-gray-300'
                    )}
                  />
                  <span
                    className={cn(
                      'text-[10px]',
                      isActive ? 'font-medium text-blue-600' : 'text-gray-400'
                    )}
                  >
                    {getStatusLabel(agent.status)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Research Directions */}
      {directions.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <button
            onClick={() => setDirectionsExpanded(!directionsExpanded)}
            className="flex w-full items-center justify-between px-4 py-2 text-left"
          >
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              研究方向
            </h4>
            {directionsExpanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>
          {directionsExpanded && (
            <div className="space-y-1.5 px-4 pb-4">
              {directions.map((direction, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50/50 p-2.5"
                >
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-purple-500 text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="flex-1 text-xs leading-snug text-gray-700">
                    {direction}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- SVG Team Canvas ----

function TeamCanvas({
  agents,
  canvasSize,
  hoveredAgent,
  onHover,
  selectedAgent,
  onSelect,
}: {
  agents: AgentNode[];
  canvasSize: { width: number; height: number };
  hoveredAgent: number | null;
  onHover: (index: number | null) => void;
  selectedAgent: number | null;
  onSelect: (index: number | null) => void;
}) {
  const positions = HEXAGON_POSITIONS;

  // Render Bezier curve connections
  const renderConnections = () => {
    const connections: JSX.Element[] = [];
    if (agents.length === 0) return connections;

    const leaderPos = positions[0];

    // Leader -> each member
    for (let i = 1; i < Math.min(agents.length, positions.length); i++) {
      const mPos = positions[i];
      const isActive =
        agents[0]?.status !== 'idle' || agents[i]?.status !== 'idle';

      const midX = (leaderPos.x + mPos.x) / 2;
      const midY = (leaderPos.y + mPos.y) / 2 - 8;

      connections.push(
        <path
          key={`leader-${i}`}
          d={`M ${leaderPos.x} ${leaderPos.y + 16} Q ${midX} ${midY} ${mPos.x} ${mPos.y - 14}`}
          className={cn(
            'fill-none transition-all duration-300',
            isActive
              ? 'stroke-blue-400 stroke-[1.5]'
              : 'stroke-gray-200 stroke-[1]'
          )}
          strokeDasharray={isActive ? 'none' : '3 3'}
          opacity={isActive ? 0.8 : 0.5}
        />
      );
    }

    // Hexagon edges
    for (let i = 1; i < Math.min(agents.length, positions.length); i++) {
      const next = i === positions.length - 1 ? 1 : i + 1;
      if (next >= agents.length) continue;
      const p1 = positions[i];
      const p2 = positions[next];
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2 - 3;

      connections.push(
        <path
          key={`edge-${i}-${next}`}
          d={`M ${p1.x} ${p1.y} Q ${midX} ${midY} ${p2.x} ${p2.y}`}
          className="fill-none stroke-gray-200 stroke-[0.5]"
          strokeDasharray="3 3"
          opacity={0.3}
        />
      );
    }

    return connections;
  };

  // Render nodes
  const renderNodes = () => {
    return agents.map((agent, index) => {
      const pos = positions[index];
      if (!pos) return null;

      const isLeader = index === 0;
      const isActive = agent.status !== 'idle';
      const isHovered = hoveredAgent === index;
      const nodeRadius = isLeader ? 18 : 15;
      const color = ROLE_HEX_COLORS[agent.role];
      const glowColor = ROLE_GLOW_COLORS[agent.role];
      const Icon = ICON_MAP[agent.icon] || ROLE_ICONS[agent.role] || Info;

      return (
        <g
          key={`${agent.role}_${agent.name}_${index}`}
          transform={`translate(${pos.x}, ${pos.y})`}
          onMouseEnter={() => onHover(index)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onSelect(index)}
          style={{ cursor: 'pointer' }}
        >
          {/* Layer 1: Working glow */}
          {isActive && (
            <circle
              r={nodeRadius + 6}
              fill="none"
              stroke={glowColor}
              strokeWidth={2}
              opacity={0.4}
            >
              <animate
                attributeName="r"
                from={nodeRadius + 4}
                to={nodeRadius + 12}
                dur="1.5s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                from="0.4"
                to="0"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </circle>
          )}

          {/* Layer 2: White ring */}
          <circle
            r={nodeRadius + 3}
            fill="white"
            opacity={isHovered ? 1 : 0.9}
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.1))' }}
          />

          {/* Layer 3: Main colored circle */}
          <circle
            r={nodeRadius}
            fill={color}
            stroke="white"
            strokeWidth={2}
            style={{
              filter: isActive
                ? `drop-shadow(0 0 6px ${glowColor})`
                : isLeader
                  ? `drop-shadow(0 0 4px ${glowColor})`
                  : '',
              transform: isHovered ? 'scale(1.1)' : 'scale(1)',
              transformOrigin: 'center',
              transition: 'transform 0.2s ease',
            }}
          />

          {/* Layer 4: Lucide icon */}
          <foreignObject
            x={-(isLeader ? 8 : 7)}
            y={-(isLeader ? 8 : 7)}
            width={isLeader ? 16 : 14}
            height={isLeader ? 16 : 14}
          >
            <div className="flex h-full w-full items-center justify-center text-white">
              <Icon
                className={isLeader ? 'h-4 w-4' : 'h-3.5 w-3.5'}
                strokeWidth={2.5}
              />
            </div>
          </foreignObject>

          {/* Layer 5: Name label */}
          <text
            textAnchor="middle"
            y={nodeRadius + 12}
            className="fill-gray-600 font-medium"
            style={{ fontSize: '9px' }}
          >
            {agent.name.length > 6 ? agent.name.slice(0, 6) : agent.name}
          </text>

          {/* Layer 6: Working status */}
          {isActive && (
            <text
              textAnchor="middle"
              y={nodeRadius + 22}
              className="fill-blue-600 font-medium"
              style={{ fontSize: '8px' }}
            >
              <animate
                attributeName="opacity"
                values="1;0.5;1"
                dur="1.5s"
                repeatCount="indefinite"
              />
              {getStatusLabel(agent.status)}
            </text>
          )}
        </g>
      );
    });
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
        className="h-[210px] w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background grid */}
        <defs>
          <pattern
            id="discussion-grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="10" cy="10" r="0.5" fill="#E5E7EB" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#discussion-grid)" />

        {/* Connections */}
        {renderConnections()}

        {/* Nodes */}
        {renderNodes()}
      </svg>

      {/* Hover tooltip */}
      {hoveredAgent !== null &&
        selectedAgent === null &&
        agents[hoveredAgent] && (
          <HoverTooltip
            agent={agents[hoveredAgent]}
            posIndex={hoveredAgent}
            canvasSize={canvasSize}
          />
        )}

      {/* Selected agent detail card */}
      {selectedAgent !== null && agents[selectedAgent] && (
        <AgentDetailCard
          agent={agents[selectedAgent]}
          onClose={() => onSelect(null)}
        />
      )}
    </div>
  );
}

// ---- Hover Tooltip ----

function HoverTooltip({
  agent,
  posIndex,
  canvasSize,
}: {
  agent: AgentNode;
  posIndex: number;
  canvasSize: { width: number; height: number };
}) {
  const pos = HEXAGON_POSITIONS[posIndex];
  if (!pos) return null;

  const tooltipX = (pos.x / canvasSize.width) * 100;
  const tooltipY = (pos.y / canvasSize.height) * 100;
  const showAbove = tooltipY > 50;

  const Icon = ICON_MAP[agent.icon] || ROLE_ICONS[agent.role] || Info;

  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg border border-gray-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur"
      style={{
        left: `${Math.min(Math.max(tooltipX, 20), 80)}%`,
        top: showAbove ? `${tooltipY - 18}%` : `${tooltipY + 20}%`,
        transform: 'translateX(-50%)',
      }}
    >
      <div className="text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-gray-800">
          <Icon className={cn('h-3 w-3', ROLE_TAILWIND_TEXT[agent.role])} />
          {agent.name}
        </div>
        <div className="mt-0.5 text-gray-500">
          {ROLE_DESCRIPTIONS[agent.role]}
        </div>
      </div>
    </div>
  );
}

// ---- Agent Detail Card ----

function AgentDetailCard({
  agent,
  onClose,
}: {
  agent: AgentNode;
  onClose: () => void;
}) {
  const Icon = ICON_MAP[agent.icon] || ROLE_ICONS[agent.role] || Info;
  const statusLabel = getStatusLabel(agent.status);
  const isActive = agent.status !== 'idle';

  const bgColorMap: Record<DiscussionRole, string> = {
    director: 'bg-purple-50',
    researcher: 'bg-blue-50',
    analyst: 'bg-emerald-50',
    writer: 'bg-amber-50',
    reviewer: 'bg-rose-50',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-20 bg-black/10 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Card */}
      <div className="absolute left-1/2 top-1/2 z-30 w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full',
                bgColorMap[agent.role]
              )}
            >
              <Icon className={cn('h-5 w-5', ROLE_TAILWIND_TEXT[agent.role])} />
            </div>
            <div>
              <div className="font-semibold text-gray-800">{agent.name}</div>
              <span className="text-xs text-gray-500">
                {ROLE_DESCRIPTIONS[agent.role]}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs text-gray-500">当前状态</span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-xs',
              isActive
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600'
            )}
          >
            {statusLabel}
          </span>
        </div>

        {/* Role */}
        <div className="mb-3">
          <div className="mb-1 text-xs font-medium text-gray-500">角色职责</div>
          <p className="text-sm text-gray-700">
            {ROLE_DESCRIPTIONS[agent.role]}
          </p>
        </div>

        {/* Capabilities */}
        <div>
          <div className="mb-1.5 text-xs font-medium text-gray-500">
            能力标签
          </div>
          <div className="flex flex-wrap gap-1.5">
            {getRoleCapabilities(agent.role).map((cap) => (
              <span
                key={cap}
                className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700"
              >
                {cap}
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
