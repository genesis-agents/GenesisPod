'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Cell,
  Legend,
  PieChart,
  Pie,
} from 'recharts';
import {
  Map,
  BarChart3,
  Clock,
  Users,
  Zap,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RefreshCw,
} from 'lucide-react';

// 类型定义
interface Agent {
  id?: string;
  role: string;
  team: 'BLUE' | 'RED' | 'GREEN' | 'CHAOS';
  company?: { name: string } | null;
  companyName?: string;
}

interface Company {
  id?: string;
  name: string;
  type?: string;
  market?: string;
  metrics?: {
    cash?: number;
    share?: number;
    revenue?: number;
    profit?: number;
  };
}

interface Turn {
  id: string;
  roundNumber: number;
  submissions?: Record<string, any>;
  adjudication?: {
    ruling?: string;
    summary?: string;
    blackSwanEvent?: {
      event: string;
      team?: string;
    };
    marketUpdate?: any;
  };
  worldState?: any;
  createdAt: string;
}

interface Run {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
  currentRound: number;
  rounds: number;
  params?: any;
  worldState?: any;
  turns?: Turn[];
  scenario?: {
    id: string;
    name: string;
    industry: string;
    companies?: Company[];
    agents?: Agent[];
  };
}

interface SandboxViewProps {
  run: Run;
  onPause?: () => void;
  onResume?: () => void;
  onIntervene?: (message: string) => void;
}

// 队伍颜色配置
const TEAM_COLORS: Record<
  string,
  { primary: string; bg: string; text: string; icon: string }
> = {
  BLUE: {
    primary: '#3B82F6',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    icon: '🔵',
  },
  RED: {
    primary: '#EF4444',
    bg: 'bg-red-100',
    text: 'text-red-700',
    icon: '🔴',
  },
  GREEN: {
    primary: '#10B981',
    bg: 'bg-green-100',
    text: 'text-green-700',
    icon: '🟢',
  },
  CHAOS: {
    primary: '#8B5CF6',
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    icon: '🟣',
  },
};

// 状态颜色
const STATUS_COLORS: Record<
  string,
  { bg: string; text: string; pulse?: boolean }
> = {
  PENDING: { bg: 'bg-gray-100', text: 'text-gray-600' },
  RUNNING: { bg: 'bg-green-100', text: 'text-green-700', pulse: true },
  PAUSED: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  COMPLETED: { bg: 'bg-blue-100', text: 'text-blue-700' },
  FAILED: { bg: 'bg-red-100', text: 'text-red-700' },
};

// 视图类型
type ViewType = 'network' | 'competition' | 'timeline' | 'agents';

export default function SandboxView({
  run,
  onPause,
  onResume,
  onIntervene,
}: SandboxViewProps) {
  const [activeView, setActiveView] = useState<ViewType>('network');
  const [selectedRound, setSelectedRound] = useState<number>(run.currentRound);
  const [showBlackSwan, setShowBlackSwan] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  // 更新选中的回合
  useEffect(() => {
    setSelectedRound(run.currentRound);
  }, [run.currentRound]);

  // 获取当前回合数据
  const currentTurn = useMemo(() => {
    return run.turns?.find((t) => t.roundNumber === selectedRound);
  }, [run.turns, selectedRound]);

  // 解析Agent分组
  const agentsByTeam = useMemo(() => {
    const agents = run.scenario?.agents || [];
    const grouped: Record<string, Agent[]> = {
      BLUE: [],
      RED: [],
      GREEN: [],
      CHAOS: [],
    };
    agents.forEach((agent) => {
      const team = agent.team || 'BLUE';
      if (grouped[team]) {
        grouped[team].push(agent);
      }
    });
    return grouped;
  }, [run.scenario?.agents]);

  // 解析公司数据
  const companies = useMemo(() => {
    return run.scenario?.companies || [];
  }, [run.scenario?.companies]);

  // 生成时间线数据
  const timelineData = useMemo(() => {
    if (!run.turns) return [];
    return run.turns.map((turn) => {
      const worldState = turn.worldState || {};
      const adj = turn.adjudication || {};
      return {
        round: `R${turn.roundNumber}`,
        roundNumber: turn.roundNumber,
        marketPrice: worldState.marketPrice || 100 + Math.random() * 20,
        shortage: (worldState.shortage || Math.random() * 0.3) * 100,
        hasBlackSwan: !!adj.blackSwanEvent,
        blackSwanEvent: adj.blackSwanEvent?.event,
        ruling: adj.ruling,
        summary: adj.summary,
      };
    });
  }, [run.turns]);

  // 生成竞争格局数据（气泡图）
  const competitionData = useMemo(() => {
    const data: Array<{
      name: string;
      x: number;
      y: number;
      z: number;
      team: string;
      type?: string;
    }> = [];

    companies.forEach((company, idx) => {
      const metrics = company.metrics || {};
      data.push({
        name: company.name,
        x: metrics.share || 20 + Math.random() * 30, // 市场份额
        y: metrics.profit || 10 + Math.random() * 20, // 利润率
        z: metrics.revenue || 50 + Math.random() * 100, // 规模
        team: idx % 2 === 0 ? 'BLUE' : 'RED',
        type: company.type,
      });
    });

    // 如果没有公司数据，生成示例
    if (data.length === 0) {
      data.push(
        {
          name: '蓝军企业',
          x: 35,
          y: 15,
          z: 120,
          team: 'BLUE',
          type: 'benchmark',
        },
        { name: '红军企业', x: 25, y: 18, z: 80, team: 'RED', type: 'startup' },
        {
          name: '市场新锐',
          x: 15,
          y: 22,
          z: 40,
          team: 'GREEN',
          type: 'startup',
        }
      );
    }

    return data;
  }, [companies]);

  // 渲染顶部控制栏
  const renderHeader = () => (
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {run.scenario?.name || '推演沙盘'}
        </h2>
        <div
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[run.status]?.bg} ${STATUS_COLORS[run.status]?.text}`}
        >
          {STATUS_COLORS[run.status]?.pulse && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
            </span>
          )}
          {run.status === 'RUNNING' ? '运行中' : run.status}
        </div>
        <div className="text-sm text-gray-500">
          回合 {run.currentRound}/{run.rounds}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* 视图切换 */}
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            onClick={() => setActiveView('network')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeView === 'network'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Map className="h-3.5 w-3.5" />
            关系图
          </button>
          <button
            onClick={() => setActiveView('competition')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeView === 'competition'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            竞争格局
          </button>
          <button
            onClick={() => setActiveView('timeline')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeView === 'timeline'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            时间线
          </button>
          <button
            onClick={() => setActiveView('agents')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeView === 'agents'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            角色
          </button>
        </div>

        {/* 控制按钮 */}
        <div className="flex items-center gap-1 border-l border-gray-200 pl-2">
          {run.status === 'RUNNING' && onPause && (
            <button
              onClick={onPause}
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
              title="暂停"
            >
              <Pause className="h-4 w-4" />
            </button>
          )}
          {run.status === 'PAUSED' && onResume && (
            <button
              onClick={onResume}
              className="rounded-lg p-2 text-green-600 hover:bg-green-50"
              title="继续"
            >
              <Play className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
            title={isFullscreen ? '退出全屏' : '全屏'}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // 渲染网络关系图（简化版力导向图）
  const renderNetworkView = () => {
    const agents = run.scenario?.agents || [];
    const centerX = 300;
    const centerY = 200;
    const radius = 150;

    return (
      <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
        <svg className="h-full w-full" viewBox="0 0 600 400">
          {/* 背景网格 */}
          <defs>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* 连接线 */}
          {agents.map((agent, i) => {
            const angle1 = (i / agents.length) * 2 * Math.PI - Math.PI / 2;
            const x1 = centerX + radius * Math.cos(angle1);
            const y1 = centerY + radius * Math.sin(angle1);

            return agents.slice(i + 1).map((agent2, j) => {
              const angle2 =
                ((i + j + 1) / agents.length) * 2 * Math.PI - Math.PI / 2;
              const x2 = centerX + radius * Math.cos(angle2);
              const y2 = centerY + radius * Math.sin(angle2);

              const isSameTeam = agent.team === agent2.team;
              const isOpposing =
                (agent.team === 'BLUE' && agent2.team === 'RED') ||
                (agent.team === 'RED' && agent2.team === 'BLUE');

              return (
                <line
                  key={`${i}-${j}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={
                    isOpposing ? '#EF4444' : isSameTeam ? '#3B82F6' : '#9CA3AF'
                  }
                  strokeWidth={isOpposing ? 2 : 1}
                  strokeDasharray={isOpposing ? '5,5' : isSameTeam ? '' : '3,3'}
                  opacity={0.4}
                />
              );
            });
          })}

          {/* Agent节点 */}
          {agents.map((agent, i) => {
            const angle = (i / agents.length) * 2 * Math.PI - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            const teamColor = TEAM_COLORS[agent.team] || TEAM_COLORS.BLUE;
            const isHovered = hoveredAgent === agent.role;

            return (
              <g
                key={i}
                transform={`translate(${x}, ${y})`}
                onMouseEnter={() => setHoveredAgent(agent.role)}
                onMouseLeave={() => setHoveredAgent(null)}
                className="cursor-pointer"
              >
                {/* 外圈动画（运行中状态） */}
                {run.status === 'RUNNING' && (
                  <circle
                    r={isHovered ? 35 : 30}
                    fill="none"
                    stroke={teamColor.primary}
                    strokeWidth="2"
                    opacity="0.3"
                    className="animate-ping"
                  />
                )}

                {/* 主圆 */}
                <circle
                  r={isHovered ? 30 : 25}
                  fill={teamColor.primary}
                  opacity={isHovered ? 1 : 0.9}
                  className="transition-all duration-200"
                />

                {/* 图标 */}
                <text
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="16"
                  className="pointer-events-none"
                >
                  {agent.team === 'BLUE'
                    ? '👔'
                    : agent.team === 'RED'
                      ? '🎯'
                      : agent.team === 'GREEN'
                        ? '⚖️'
                        : '🌀'}
                </text>

                {/* 角色名 */}
                <text
                  y={40}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#374151"
                  fontWeight="500"
                  className="pointer-events-none"
                >
                  {agent.role.length > 8
                    ? agent.role.substring(0, 8) + '...'
                    : agent.role}
                </text>

                {/* 公司名 */}
                {(agent.companyName || agent.company?.name) && (
                  <text
                    y={54}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#6B7280"
                    className="pointer-events-none"
                  >
                    {(agent.companyName || agent.company?.name || '').substring(
                      0,
                      12
                    )}
                  </text>
                )}
              </g>
            );
          })}

          {/* 中心标题 */}
          <text
            x={centerX}
            y={centerY - 10}
            textAnchor="middle"
            fontSize="14"
            fill="#6B7280"
          >
            {run.scenario?.industry || '推演场景'}
          </text>
          <text
            x={centerX}
            y={centerY + 10}
            textAnchor="middle"
            fontSize="12"
            fill="#9CA3AF"
          >
            回合 {selectedRound}/{run.rounds}
          </text>
        </svg>

        {/* 图例 */}
        <div className="absolute bottom-4 left-4 rounded-lg border border-gray-200 bg-white/90 p-3 backdrop-blur-sm">
          <div className="mb-2 text-xs font-medium text-gray-700">队伍图例</div>
          <div className="flex flex-col gap-1.5">
            {Object.entries(TEAM_COLORS).map(([team, colors]) => (
              <div key={team} className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: colors.primary }}
                />
                <span className="text-xs text-gray-600">
                  {team === 'BLUE'
                    ? '蓝军'
                    : team === 'RED'
                      ? '红军'
                      : team === 'GREEN'
                        ? '绿军'
                        : '混沌'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 当前回合信息 */}
        {currentTurn?.adjudication?.summary && (
          <div className="absolute right-4 top-4 max-w-xs rounded-lg border border-gray-200 bg-white/90 p-3 backdrop-blur-sm">
            <div className="mb-1 text-xs font-medium text-gray-700">
              本轮摘要
            </div>
            <div className="text-xs leading-relaxed text-gray-600">
              {currentTurn.adjudication.summary.substring(0, 150)}
              {currentTurn.adjudication.summary.length > 150 && '...'}
            </div>
          </div>
        )}
      </div>
    );
  };

  // 渲染竞争格局视图
  const renderCompetitionView = () => (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">市场竞争格局</h3>
        <div className="text-xs text-gray-500">
          X: 市场份额 | Y: 利润率 | 气泡大小: 规模
        </div>
      </div>

      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              type="number"
              dataKey="x"
              name="市场份额"
              unit="%"
              domain={[0, 50]}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="利润率"
              unit="%"
              domain={[0, 30]}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                      <div className="font-medium text-gray-900">
                        {data.name}
                      </div>
                      <div className="mt-1 space-y-1 text-xs text-gray-600">
                        <div>市场份额: {data.x.toFixed(1)}%</div>
                        <div>利润率: {data.y.toFixed(1)}%</div>
                        <div>规模指数: {data.z.toFixed(0)}</div>
                        <div className="mt-1 text-gray-400">
                          {data.type || '未分类'}
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend />
            <Scatter name="公司" data={competitionData}>
              {competitionData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={TEAM_COLORS[entry.team]?.primary || '#6B7280'}
                  opacity={0.8}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* 公司列表 */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {competitionData.map((company, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-gray-200 bg-white p-3 transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-2">
              <div
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: TEAM_COLORS[company.team]?.primary }}
              />
              <span className="text-sm font-medium text-gray-900">
                {company.name}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
              <span>份额 {company.x.toFixed(1)}%</span>
              <span>利润 {company.y.toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // 渲染时间线视图
  const renderTimelineView = () => (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">推演时间线</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBlackSwan(!showBlackSwan)}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${
              showBlackSwan
                ? 'bg-purple-100 text-purple-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {showBlackSwan ? (
              <Eye className="h-3 w-3" />
            ) : (
              <EyeOff className="h-3 w-3" />
            )}
            黑天鹅事件
          </button>
        </div>
      </div>

      {/* 图表 */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={timelineData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="round" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                      <div className="font-medium text-gray-900">{label}</div>
                      <div className="mt-1 space-y-1 text-xs text-gray-600">
                        <div>市场价格: {data.marketPrice?.toFixed(1)}</div>
                        <div>短缺指数: {data.shortage?.toFixed(1)}%</div>
                        {data.hasBlackSwan && showBlackSwan && (
                          <div className="mt-1 text-purple-600">
                            🦢 {data.blackSwanEvent?.substring(0, 50)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="marketPrice"
              stroke="#3B82F6"
              fill="#3B82F6"
              fillOpacity={0.2}
              name="市场价格"
            />
            <Area
              type="monotone"
              dataKey="shortage"
              stroke="#EF4444"
              fill="#EF4444"
              fillOpacity={0.1}
              name="短缺指数"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 事件时间线 */}
      <div className="mt-4 flex-1 overflow-y-auto">
        <div className="relative space-y-3 pl-4">
          {/* 时间线竖线 */}
          <div className="absolute bottom-0 left-1 top-0 w-0.5 bg-gray-200" />

          {run.turns?.map((turn, idx) => {
            const adj = turn.adjudication || {};
            const isSelected = turn.roundNumber === selectedRound;
            const hasBlackSwan = !!adj.blackSwanEvent;

            return (
              <div
                key={turn.id}
                className={`relative cursor-pointer rounded-lg border p-3 transition-all ${
                  isSelected
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onClick={() => setSelectedRound(turn.roundNumber)}
              >
                {/* 时间线圆点 */}
                <div
                  className={`absolute -left-3 top-4 h-3 w-3 rounded-full border-2 border-white ${
                    hasBlackSwan
                      ? 'bg-purple-500'
                      : isSelected
                        ? 'bg-indigo-500'
                        : 'bg-gray-400'
                  }`}
                />

                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        回合 {turn.roundNumber}
                      </span>
                      {hasBlackSwan && showBlackSwan && (
                        <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
                          🦢 黑天鹅
                        </span>
                      )}
                      {adj.ruling === 'proceed' && (
                        <span className="text-xs text-green-600">✓ 继续</span>
                      )}
                    </div>
                    {adj.summary && (
                      <p className="mt-1 line-clamp-2 text-xs text-gray-600">
                        {adj.summary}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(turn.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 回合控制 */}
      <div className="mt-4 flex items-center justify-center gap-4 border-t border-gray-200 pt-4">
        <button
          onClick={() => setSelectedRound(Math.max(1, selectedRound - 1))}
          disabled={selectedRound <= 1}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <span className="text-sm text-gray-700">
          {selectedRound} / {run.rounds}
        </span>
        <button
          onClick={() =>
            setSelectedRound(Math.min(run.currentRound, selectedRound + 1))
          }
          disabled={selectedRound >= run.currentRound}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
        >
          <SkipForward className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  // 渲染角色视图
  const renderAgentsView = () => (
    <div className="h-full overflow-y-auto p-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Object.entries(agentsByTeam).map(([team, agents]) => {
          if (agents.length === 0) return null;
          const teamConfig = TEAM_COLORS[team];

          return (
            <div key={team} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{teamConfig.icon}</span>
                <span className={`text-sm font-medium ${teamConfig.text}`}>
                  {team === 'BLUE'
                    ? '蓝军'
                    : team === 'RED'
                      ? '红军'
                      : team === 'GREEN'
                        ? '绿军'
                        : '混沌'}
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {agents.length}
                </span>
              </div>

              <div className="space-y-2">
                {agents.map((agent, idx) => {
                  // 获取该Agent在当前回合的提交
                  const submission = currentTurn?.submissions?.[agent.role];

                  return (
                    <div
                      key={idx}
                      className={`rounded-lg border p-3 transition-all hover:shadow-md ${teamConfig.bg} border-${team.toLowerCase()}-200`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div
                            className={`text-sm font-medium ${teamConfig.text}`}
                          >
                            {agent.role}
                          </div>
                          {(agent.companyName || agent.company?.name) && (
                            <div className="mt-0.5 text-xs text-gray-500">
                              {agent.companyName || agent.company?.name}
                            </div>
                          )}
                        </div>
                        {run.status === 'RUNNING' && (
                          <Activity className="h-4 w-4 animate-pulse text-green-500" />
                        )}
                      </div>

                      {/* 当前回合动作 */}
                      {submission && (
                        <div className="mt-2 rounded bg-white/60 p-2">
                          <div className="text-xs text-gray-600">
                            <span className="font-medium">动作:</span>{' '}
                            {submission.action || submission.decision || '-'}
                          </div>
                          {submission.reasoning && (
                            <div className="mt-1 line-clamp-2 text-xs text-gray-500">
                              {submission.reasoning}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // 渲染主视图内容
  const renderMainContent = () => {
    switch (activeView) {
      case 'network':
        return renderNetworkView();
      case 'competition':
        return renderCompetitionView();
      case 'timeline':
        return renderTimelineView();
      case 'agents':
        return renderAgentsView();
      default:
        return renderNetworkView();
    }
  };

  return (
    <div
      className={`flex flex-col bg-white ${isFullscreen ? 'fixed inset-0 z-50' : 'h-full rounded-xl border border-gray-200'}`}
    >
      {renderHeader()}
      <div className="flex-1 overflow-hidden">{renderMainContent()}</div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>
            {run.scenario?.agents?.length || 0} 个角色 | {companies.length}{' '}
            家公司
          </span>
          {currentTurn?.adjudication?.blackSwanEvent && (
            <span className="flex items-center gap-1 text-purple-600">
              <AlertTriangle className="h-3 w-3" />
              本轮有黑天鹅事件
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <RefreshCw className="h-3 w-3" />
          实时同步中
        </div>
      </div>
    </div>
  );
}
