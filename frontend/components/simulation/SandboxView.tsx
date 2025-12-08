'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
  Crown,
  Target,
  Store,
  Scale,
  Sparkles,
  Loader2,
  Image as ImageIcon,
} from 'lucide-react';
import { config } from '@/lib/config';
import { getAuthHeader } from '@/lib/auth';

// 类型定义
interface Agent {
  id?: string;
  role: string;
  team: 'BLUE' | 'RED' | 'GREEN' | 'WHITE' | 'CHAOS';
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

// 后端submission数据结构
interface Submission {
  agentId?: string;
  companyId?: string;
  team?: string;
  role?: string;
  innerMonologue?: string;
  publicAction?: string;
  visibility?: string;
  timestamp?: string;
  tools?: any;
  irrational?: boolean;
  chaosInjected?: boolean;
}

interface Turn {
  id: string;
  roundNumber: number;
  submissions?: Submission[]; // 后端返回的是数组而不是对象
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

// 视角权限类型
type ViewPermission = 'GOD' | 'BLUE' | 'RED' | 'GREEN' | 'WHITE';

interface SandboxViewProps {
  run: Run;
  onPause?: () => void;
  onResume?: () => void;
  onIntervene?: (message: string) => void;
  viewPermission?: ViewPermission;
  userRole?: string;
}

// 队伍颜色配置 - 包含WHITE
const TEAM_COLORS: Record<
  string,
  {
    primary: string;
    secondary: string;
    bg: string;
    text: string;
    icon: string;
    gradient: string;
    label: string;
    description: string;
  }
> = {
  BLUE: {
    primary: '#3B82F6',
    secondary: '#60A5FA',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    icon: '🔵',
    gradient: 'from-blue-500 to-blue-600',
    label: '蓝军',
    description: '我方/主角公司',
  },
  RED: {
    primary: '#EF4444',
    secondary: '#F87171',
    bg: 'bg-red-100',
    text: 'text-red-700',
    icon: '🔴',
    gradient: 'from-red-500 to-red-600',
    label: '红军',
    description: '竞争对手/挑战者',
  },
  GREEN: {
    primary: '#10B981',
    secondary: '#34D399',
    bg: 'bg-green-100',
    text: 'text-green-700',
    icon: '🟢',
    gradient: 'from-green-500 to-green-600',
    label: '绿军',
    description: '市场/客户/供应商',
  },
  WHITE: {
    primary: '#6B7280',
    secondary: '#9CA3AF',
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    icon: '⚪',
    gradient: 'from-gray-500 to-gray-600',
    label: '白方',
    description: '裁判/监管机构',
  },
  CHAOS: {
    primary: '#8B5CF6',
    secondary: '#A78BFA',
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    icon: '🟣',
    gradient: 'from-purple-500 to-purple-600',
    label: '混沌',
    description: '黑天鹅事件',
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
type ViewType = 'sandtable' | 'network' | 'competition' | 'timeline' | 'agents';

// 行业背景配置 - 预置和动态生成
const INDUSTRY_BACKGROUNDS: Record<
  string,
  {
    gradient: string;
    pattern: string;
    accent: string;
    promptHint: string;
  }
> = {
  半导体: {
    gradient: 'from-blue-900 via-indigo-900 to-purple-900',
    pattern: 'circuit',
    accent: '#60A5FA',
    promptHint:
      'semiconductor chip factory, circuit board patterns, silicon wafer, clean room environment',
  },
  芯片: {
    gradient: 'from-blue-900 via-indigo-900 to-purple-900',
    pattern: 'circuit',
    accent: '#60A5FA',
    promptHint:
      'microchip manufacturing, integrated circuit, semiconductor fab, high-tech cleanroom',
  },
  AI: {
    gradient: 'from-purple-900 via-fuchsia-900 to-pink-900',
    pattern: 'neural',
    accent: '#A78BFA',
    promptHint:
      'artificial intelligence neural network, data center servers, digital brain visualization',
  },
  人工智能: {
    gradient: 'from-purple-900 via-fuchsia-900 to-pink-900',
    pattern: 'neural',
    accent: '#A78BFA',
    promptHint:
      'AI computing infrastructure, machine learning clusters, futuristic tech environment',
  },
  算力: {
    gradient: 'from-cyan-900 via-blue-900 to-indigo-900',
    pattern: 'data',
    accent: '#22D3EE',
    promptHint:
      'high performance computing data center, GPU server racks, cooling systems, blue LED lights',
  },
  汽车: {
    gradient: 'from-gray-900 via-slate-800 to-zinc-900',
    pattern: 'mechanical',
    accent: '#94A3B8',
    promptHint:
      'automotive factory, electric vehicle assembly line, car manufacturing robots',
  },
  新能源: {
    gradient: 'from-green-900 via-emerald-800 to-teal-900',
    pattern: 'energy',
    accent: '#34D399',
    promptHint:
      'solar panels field, wind turbines, renewable energy infrastructure, green technology',
  },
  医疗: {
    gradient: 'from-teal-900 via-cyan-800 to-blue-900',
    pattern: 'medical',
    accent: '#2DD4BF',
    promptHint:
      'modern hospital, medical equipment, pharmaceutical laboratory, healthcare technology',
  },
  金融: {
    gradient: 'from-amber-900 via-yellow-800 to-orange-900',
    pattern: 'finance',
    accent: '#FBBF24',
    promptHint:
      'financial trading floor, stock market displays, banking headquarters, modern skyscrapers',
  },
  零售: {
    gradient: 'from-orange-900 via-red-800 to-rose-900',
    pattern: 'retail',
    accent: '#FB923C',
    promptHint:
      'modern retail store, shopping mall, e-commerce warehouse, consumer products display',
  },
  互联网: {
    gradient: 'from-violet-900 via-purple-800 to-fuchsia-900',
    pattern: 'network',
    accent: '#8B5CF6',
    promptHint:
      'internet infrastructure, server farm, cloud computing, digital connectivity visualization',
  },
  电信: {
    gradient: 'from-sky-900 via-blue-800 to-indigo-900',
    pattern: 'telecom',
    accent: '#38BDF8',
    promptHint:
      '5G tower, telecommunications infrastructure, fiber optic network, satellite communication',
  },
  制造: {
    gradient: 'from-slate-800 via-gray-700 to-zinc-800',
    pattern: 'industrial',
    accent: '#71717A',
    promptHint:
      'industrial factory, automated assembly line, robotic manufacturing, precision machinery',
  },
  default: {
    gradient: 'from-slate-900 via-slate-800 to-slate-900',
    pattern: 'grid',
    accent: '#06B6D4',
    promptHint:
      'professional business environment, strategic planning room, modern corporate office',
  },
};

export default function SandboxView({
  run,
  onPause,
  onResume,
  onIntervene,
  viewPermission = 'GOD',
  userRole,
}: SandboxViewProps) {
  const [activeView, setActiveView] = useState<ViewType>('sandtable');
  const [selectedRound, setSelectedRound] = useState<number>(run.currentRound);
  const [showBlackSwan, setShowBlackSwan] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(2000); // 播放速度（毫秒/回合）
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  // 自动播放功能
  useEffect(() => {
    if (!isPlaying) return;

    const maxRound = run.turns?.length
      ? Math.max(...run.turns.map((t) => t.roundNumber))
      : run.currentRound;

    if (selectedRound >= maxRound) {
      setIsPlaying(false);
      return;
    }

    const timer = setInterval(() => {
      setSelectedRound((prev) => {
        const next = prev + 1;
        if (next > maxRound) {
          setIsPlaying(false);
          return prev;
        }
        return next;
      });
    }, playbackSpeed);

    return () => clearInterval(timer);
  }, [isPlaying, selectedRound, playbackSpeed, run.turns, run.currentRound]);

  // 时间线拖动处理
  const handleTimelineDrag = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      const round = Math.max(1, Math.round(percentage * run.rounds));

      // 只能拖动到已有数据的回合
      const maxRound = run.turns?.length
        ? Math.max(...run.turns.map((t) => t.roundNumber))
        : run.currentRound;
      setSelectedRound(Math.min(round, maxRound));
    },
    [run.rounds, run.turns, run.currentRound]
  );

  // 鼠标事件监听
  useEffect(() => {
    if (!isDraggingTimeline) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleTimelineDrag(e);
    };

    const handleMouseUp = () => {
      setIsDraggingTimeline(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingTimeline, handleTimelineDrag]);

  // 行业背景相关状态
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [isGeneratingBackground, setIsGeneratingBackground] = useState(false);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const backgroundGeneratedRef = useRef<string | null>(null);

  // 获取行业背景配置
  const industryConfig = useMemo(() => {
    const industry = run.scenario?.industry || '';
    // 尝试匹配行业关键词
    for (const [key, value] of Object.entries(INDUSTRY_BACKGROUNDS)) {
      if (key !== 'default' && industry.includes(key)) {
        return { key, ...value };
      }
    }
    return { key: 'default', ...INDUSTRY_BACKGROUNDS.default };
  }, [run.scenario?.industry]);

  // 生成行业背景图片
  const generateIndustryBackground = useCallback(async () => {
    const industry = run.scenario?.industry;
    if (!industry || backgroundGeneratedRef.current === industry) return;

    setIsGeneratingBackground(true);
    setBackgroundError(null);

    try {
      const authHeader = getAuthHeader();
      const prompt = `Strategic wargame sandbox visualization for ${industry} industry.
        ${industryConfig.promptHint}.
        Bird's eye view of a strategic planning table, dark futuristic aesthetic,
        holographic displays, glowing grid lines, professional military-style war room,
        isometric 2.5D perspective, ultra detailed, 8k quality.
        Style: sci-fi strategic command center, dark blue and cyan color scheme.`;

      const response = await fetch(`${config.apiUrl}/ai-image/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify({
          prompt,
          aspectRatio: '16:9',
          style: 'cinematic',
          skipEnhancement: true,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.imageUrl) {
          setBackgroundImage(data.imageUrl);
          backgroundGeneratedRef.current = industry;
        }
      } else {
        const error = await response.text();
        console.warn('Failed to generate background:', error);
        setBackgroundError('背景生成失败');
      }
    } catch (error) {
      console.warn('Background generation error:', error);
      setBackgroundError('网络错误');
    } finally {
      setIsGeneratingBackground(false);
    }
  }, [run.scenario?.industry, industryConfig.promptHint]);

  // 当行业变化时自动生成背景（仅在沙盘视图激活时）
  useEffect(() => {
    if (
      activeView === 'sandtable' &&
      run.scenario?.industry &&
      !backgroundImage
    ) {
      // 延迟生成，避免频繁请求
      const timer = setTimeout(() => {
        generateIndustryBackground();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [
    activeView,
    run.scenario?.industry,
    backgroundImage,
    generateIndustryBackground,
  ]);

  // 更新选中的回合
  useEffect(() => {
    setSelectedRound(run.currentRound);
  }, [run.currentRound]);

  // 获取当前回合数据
  const currentTurn = useMemo(() => {
    return run.turns?.find((t) => t.roundNumber === selectedRound);
  }, [run.turns, selectedRound]);

  // 解析Agent分组 - 包含WHITE
  const agentsByTeam = useMemo(() => {
    const agents = run.scenario?.agents || [];
    const grouped: Record<string, Agent[]> = {
      BLUE: [],
      RED: [],
      GREEN: [],
      WHITE: [],
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

  // 视角过滤 - 根据权限过滤可见内容
  const filterByPermission = useCallback(
    (data: any, team?: string) => {
      if (viewPermission === 'GOD') return data;
      if (viewPermission === team) return data;
      // 非上帝视角只能看公开信息
      if (data?.publicAction) return { publicAction: data.publicAction };
      return { hidden: true };
    },
    [viewPermission]
  );

  // 生成时间轴年份 (模拟2024-2030+)
  const timelineYears = useMemo(() => {
    const startYear = 2024;
    const yearsCount = Math.max(run.rounds, 6);
    return Array.from({ length: yearsCount }, (_, i) => startYear + i);
  }, [run.rounds]);

  // 渲染顶部控制栏
  const renderHeader = () => (
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {run.scenario?.name || '战略推演沙盘'}
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
          {run.status === 'RUNNING' ? '推演中' : run.status}
        </div>
        <div className="text-sm text-gray-500">
          回合 {run.currentRound}/{run.rounds}
        </div>

        {/* 视角指示器 */}
        <div className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
          <Eye className="h-3 w-3" />
          {viewPermission === 'GOD'
            ? '上帝视角'
            : `${TEAM_COLORS[viewPermission]?.label}视角`}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* 视图切换 */}
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            onClick={() => setActiveView('sandtable')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeView === 'sandtable'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Map className="h-3.5 w-3.5" />
            沙盘
          </button>
          <button
            onClick={() => setActiveView('network')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeView === 'network'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            关系
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
            格局
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

  // 渲染四象限卡片
  const renderQuadrantCard = (team: string, Icon: any) => {
    const teamConfig = TEAM_COLORS[team];
    const teamAgents = agentsByTeam[team] || [];
    const isHovered = hoveredZone === team;

    // 获取该队伍的提交
    const teamSubmissions =
      currentTurn?.submissions && Array.isArray(currentTurn.submissions)
        ? currentTurn.submissions.filter((sub) => sub.team === team)
        : [];

    return (
      <div
        className={`flex h-full flex-col rounded-lg border transition-all ${
          isHovered ? 'border-white/40 shadow-lg' : 'border-white/20'
        }`}
        style={{ backgroundColor: `${teamConfig.primary}15` }}
        onMouseEnter={() => setHoveredZone(team)}
        onMouseLeave={() => setHoveredZone(null)}
      >
        {/* 区域标题栏 */}
        <div
          className="flex shrink-0 items-center justify-between rounded-t-lg px-3 py-2"
          style={{ backgroundColor: `${teamConfig.primary}25` }}
        >
          <div className="flex items-center gap-2">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br ${teamConfig.gradient}`}
            >
              <Icon className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">
              {teamConfig.label}
            </span>
          </div>
          <div
            className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: teamConfig.primary }}
          >
            {teamAgents.length}
          </div>
        </div>

        {/* 行动内容区域 - 固定高度可滚动 */}
        <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
          {teamSubmissions.length > 0 ? (
            teamSubmissions.slice(0, 3).map((submission, idx) => {
              const canView =
                viewPermission === 'GOD' || viewPermission === team;
              return (
                <div
                  key={idx}
                  className="rounded border p-1.5"
                  style={{
                    backgroundColor: `${teamConfig.primary}10`,
                    borderColor: `${teamConfig.primary}30`,
                  }}
                >
                  {/* 角色名 */}
                  <div className="mb-1 flex items-center gap-1">
                    <div
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                      style={{ backgroundColor: teamConfig.primary }}
                    >
                      {(submission.role || '?')[0]}
                    </div>
                    <span className="truncate text-[11px] font-medium text-white">
                      {submission.role || '未知角色'}
                    </span>
                  </div>

                  {canView ? (
                    <div className="line-clamp-2 text-[10px] leading-relaxed text-gray-300">
                      {submission.publicAction || '无公开行动'}
                    </div>
                  ) : (
                    <div className="text-[10px] italic text-gray-500">
                      🔒 需要{teamConfig.label}视角
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-gray-500">
              暂无行动
            </div>
          )}
          {teamSubmissions.length > 3 && (
            <div className="text-center text-[10px] text-gray-500">
              +{teamSubmissions.length - 3} 更多
            </div>
          )}
        </div>

        {/* Agent标签 */}
        <div className="flex shrink-0 flex-wrap gap-1 border-t border-white/10 p-1.5">
          {teamAgents.slice(0, 3).map((agent, idx) => (
            <span
              key={idx}
              className="rounded border border-white/20 bg-black/30 px-1 py-0.5 text-[9px] text-gray-400"
            >
              {agent.role.length > 6
                ? agent.role.substring(0, 6) + '..'
                : agent.role}
            </span>
          ))}
          {teamAgents.length > 3 && (
            <span className="text-[9px] text-gray-500">
              +{teamAgents.length - 3}
            </span>
          )}
        </div>
      </div>
    );
  };

  // 渲染平面沙盘视图 - 四象限布局
  const renderSandtableView = () => {
    // 收集本回合所有事件用于中心展示
    const allSubmissions =
      currentTurn?.submissions && Array.isArray(currentTurn.submissions)
        ? currentTurn.submissions
        : [];

    // 检测事件关联 - 简单的关键词匹配
    const findRelatedEvents = () => {
      const relations: Array<{
        from: string;
        to: string;
        type: 'conflict' | 'response' | 'impact';
      }> = [];

      // 蓝军和红军之间的竞争关系
      const blueActions = allSubmissions.filter((s) => s.team === 'BLUE');
      const redActions = allSubmissions.filter((s) => s.team === 'RED');

      if (blueActions.length > 0 && redActions.length > 0) {
        relations.push({ from: 'BLUE', to: 'RED', type: 'conflict' });
      }

      // 绿军对蓝红的影响
      const greenActions = allSubmissions.filter((s) => s.team === 'GREEN');
      if (greenActions.length > 0) {
        if (blueActions.length > 0)
          relations.push({ from: 'GREEN', to: 'BLUE', type: 'impact' });
        if (redActions.length > 0)
          relations.push({ from: 'GREEN', to: 'RED', type: 'impact' });
      }

      // 白方的监管影响
      const whiteActions = allSubmissions.filter((s) => s.team === 'WHITE');
      if (whiteActions.length > 0) {
        relations.push({ from: 'WHITE', to: 'BLUE', type: 'response' });
        relations.push({ from: 'WHITE', to: 'RED', type: 'response' });
      }

      return relations;
    };

    const eventRelations = findRelatedEvents();

    return (
      <div
        className={`relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-br ${industryConfig.gradient}`}
      >
        {/* 背景遮罩层 */}
        <div className="absolute inset-0 bg-black/40" />

        {/* 左侧信息面板 */}
        <div className="absolute left-4 top-4 z-20 w-44 space-y-3">
          {/* 场景信息 */}
          <div
            className="rounded-lg border bg-black/50 p-3 backdrop-blur-sm"
            style={{ borderColor: `${industryConfig.accent}30` }}
          >
            <div className="text-[10px] text-gray-500">推演场景</div>
            <div
              className="mt-1 text-sm font-medium"
              style={{ color: industryConfig.accent }}
            >
              {run.scenario?.name || run.scenario?.industry || '未知场景'}
            </div>
            <div className="mt-1 text-[10px] text-gray-500">
              主题:{' '}
              {industryConfig.key !== 'default' ? industryConfig.key : 'AI'}
            </div>
          </div>

          {/* 势力分布 */}
          <div className="rounded-lg border border-white/10 bg-black/50 p-3 backdrop-blur-sm">
            <div className="mb-2 text-[10px] text-gray-500">势力分布</div>
            {Object.entries(TEAM_COLORS)
              .slice(0, 4)
              .map(([team, config]) => {
                const count = agentsByTeam[team]?.length || 0;
                return (
                  <div
                    key={team}
                    className="flex items-center justify-between py-0.5"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: config.primary }}
                      />
                      <span className="text-[11px] text-gray-400">
                        {config.label}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-white">
                      {count}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>

        {/* 主内容区域 - 四象限居中 */}
        <div className="relative z-10 flex flex-1 items-center justify-center pb-28">
          {/* 四象限容器 - 正面平视布局 */}
          <div className="relative" style={{ width: '620px', height: '280px' }}>
            {/* 四象限网格 - 2x2 正面布局 */}
            <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-2">
              {/* 左上 - 蓝军 */}
              <div>{renderQuadrantCard('BLUE', Crown)}</div>

              {/* 右上 - 红军 */}
              <div>{renderQuadrantCard('RED', Target)}</div>

              {/* 左下 - 绿军 */}
              <div>{renderQuadrantCard('GREEN', Store)}</div>

              {/* 右下 - 白方 */}
              <div>{renderQuadrantCard('WHITE', Scale)}</div>
            </div>

            {/* 中心回合指示器 */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="pointer-events-auto flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 backdrop-blur-sm"
                style={{
                  borderColor: `${industryConfig.accent}60`,
                  backgroundColor: 'rgba(0,0,0,0.85)',
                  boxShadow: `0 0 20px ${industryConfig.accent}40`,
                }}
              >
                <div
                  className="text-lg font-bold"
                  style={{ color: industryConfig.accent }}
                >
                  R{selectedRound}
                </div>
                <div className="text-[8px] text-gray-400">
                  {allSubmissions.length} 行动
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 黑天鹅事件横幅 */}
        {currentTurn?.adjudication?.blackSwanEvent && (
          <div className="absolute bottom-28 left-1/2 z-20 w-[620px] -translate-x-1/2 rounded border border-purple-500/50 bg-purple-900/60 px-3 py-1.5 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-purple-400" />
              <span className="text-xs font-medium text-purple-300">
                黑天鹅事件:
              </span>
              <span className="truncate text-xs text-purple-200">
                {currentTurn.adjudication.blackSwanEvent.event}
              </span>
            </div>
          </div>
        )}

        {/* 时间轴 - 底部 */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-black/50 px-6 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            {/* 播放控制 */}
            <div className="flex items-center gap-2">
              {/* 回退到开始 */}
              <button
                onClick={() => {
                  setIsPlaying(false);
                  setSelectedRound(1);
                }}
                disabled={selectedRound <= 1}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
                title="回到开始"
              >
                <SkipBack className="h-3.5 w-3.5" />
              </button>

              {/* 上一回合 */}
              <button
                onClick={() => setSelectedRound(Math.max(1, selectedRound - 1))}
                disabled={selectedRound <= 1}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
                title="上一回合"
              >
                <Play className="h-3.5 w-3.5 rotate-180" />
              </button>

              {/* 播放/暂停 */}
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg hover:opacity-90"
                style={{
                  backgroundColor: industryConfig.accent,
                  boxShadow: `0 10px 15px -3px ${industryConfig.accent}30`,
                }}
                title={isPlaying ? '暂停' : '播放推演'}
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </button>

              {/* 下一回合 */}
              <button
                onClick={() => {
                  const maxRound = run.turns?.length
                    ? Math.max(...run.turns.map((t) => t.roundNumber))
                    : run.currentRound;
                  setSelectedRound(Math.min(maxRound, selectedRound + 1));
                }}
                disabled={
                  selectedRound >=
                  (run.turns?.length
                    ? Math.max(...run.turns.map((t) => t.roundNumber))
                    : run.currentRound)
                }
                className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
                title="下一回合"
              >
                <Play className="h-3.5 w-3.5" />
              </button>

              {/* 跳到最新 */}
              <button
                onClick={() => {
                  const maxRound = run.turns?.length
                    ? Math.max(...run.turns.map((t) => t.roundNumber))
                    : run.currentRound;
                  setSelectedRound(maxRound);
                }}
                disabled={
                  selectedRound >=
                  (run.turns?.length
                    ? Math.max(...run.turns.map((t) => t.roundNumber))
                    : run.currentRound)
                }
                className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white disabled:opacity-30"
                title="跳到最新"
              >
                <SkipForward className="h-3.5 w-3.5" />
              </button>

              {/* 播放速度控制 */}
              <div className="ml-2 flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1">
                <span className="text-[10px] text-gray-500">速度</span>
                <select
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                  className="cursor-pointer bg-transparent text-xs text-white focus:outline-none"
                >
                  <option value={3000} className="bg-gray-800">
                    0.5x
                  </option>
                  <option value={2000} className="bg-gray-800">
                    1x
                  </option>
                  <option value={1000} className="bg-gray-800">
                    2x
                  </option>
                  <option value={500} className="bg-gray-800">
                    4x
                  </option>
                </select>
              </div>
            </div>

            {/* 时间轴 - 支持拖动 */}
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs text-gray-500">
                {timelineYears.map((year, idx) => (
                  <span key={year}>
                    {year}
                    {idx === timelineYears.length - 1 ? '+' : ''}
                  </span>
                ))}
              </div>
              <div
                ref={timelineRef}
                className={`relative mt-2 h-3 cursor-pointer rounded-full bg-white/10 transition-all ${
                  isDraggingTimeline ? 'h-4 bg-white/20' : 'hover:bg-white/15'
                }`}
                onMouseDown={(e) => {
                  setIsDraggingTimeline(true);
                  setIsPlaying(false);
                  handleTimelineDrag(e);
                }}
                title="拖动时间轴查看不同回合"
              >
                {/* 进度条 - 使用行业主题色 */}
                <div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{
                    width: `${(selectedRound / run.rounds) * 100}%`,
                    background: `linear-gradient(to right, ${industryConfig.accent}, ${industryConfig.accent}CC)`,
                  }}
                />
                {/* 回合标记 */}
                {run.turns?.map((turn) => {
                  const position = (turn.roundNumber / run.rounds) * 100;
                  const hasBlackSwan = !!turn.adjudication?.blackSwanEvent;
                  const isSelected = turn.roundNumber === selectedRound;

                  return (
                    <button
                      key={turn.id}
                      onClick={() => setSelectedRound(turn.roundNumber)}
                      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-all ${
                        isSelected ? 'z-10' : ''
                      }`}
                      style={{ left: `${position}%` }}
                    >
                      <div
                        className={`rounded-full border-2 transition-all ${
                          hasBlackSwan && !isSelected
                            ? 'h-3 w-3 border-purple-400 bg-purple-500'
                            : !isSelected
                              ? 'h-3 w-3 border-gray-500 bg-gray-600 hover:border-white'
                              : 'h-5 w-5 border-white shadow-lg'
                        }`}
                        style={
                          isSelected
                            ? {
                                backgroundColor: industryConfig.accent,
                                boxShadow: `0 10px 15px -3px ${industryConfig.accent}50`,
                              }
                            : undefined
                        }
                      />
                      {hasBlackSwan && isSelected && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-purple-500 px-2 py-1 text-xs text-white">
                          🦢 黑天鹅
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-gray-500">回合 1</span>
                <span
                  className="font-medium"
                  style={{ color: industryConfig.accent }}
                >
                  当前: R{selectedRound}
                </span>
                <span className="text-gray-500">回合 {run.rounds}</span>
              </div>
            </div>

            {/* 当前回合详情面板 */}
            <div className="w-72 rounded-lg border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Clock
                    className="h-4 w-4"
                    style={{ color: industryConfig.accent }}
                  />
                  回合 {selectedRound} 详情
                </div>
                {isPlaying && (
                  <span
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                    style={{
                      backgroundColor: `${industryConfig.accent}20`,
                      color: industryConfig.accent,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 animate-pulse rounded-full"
                      style={{ backgroundColor: industryConfig.accent }}
                    />
                    播放中
                  </span>
                )}
              </div>

              {currentTurn ? (
                <div className="mt-2 space-y-2">
                  {/* 裁决摘要 */}
                  {currentTurn.adjudication?.summary && (
                    <div className="text-xs text-gray-300">
                      {currentTurn.adjudication.summary}
                    </div>
                  )}

                  {/* 市场状态 */}
                  {currentTurn.worldState && (
                    <div className="flex gap-3 rounded bg-white/5 p-2">
                      <div className="text-center">
                        <div className="text-[10px] text-gray-500">
                          市场价格
                        </div>
                        <div className="text-xs font-medium text-white">
                          {currentTurn.worldState.marketPrice?.toFixed?.(1) ||
                            '-'}
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-gray-500">
                          短缺指数
                        </div>
                        <div className="text-xs font-medium text-white">
                          {(
                            (currentTurn.worldState.shortage || 0) * 100
                          ).toFixed(1)}
                          %
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 黑天鹅事件 */}
                  {currentTurn.adjudication?.blackSwanEvent && (
                    <div className="flex items-center gap-2 rounded bg-purple-500/20 p-2 text-xs text-purple-300">
                      <span>🦢</span>
                      <span className="line-clamp-1">
                        {currentTurn.adjudication.blackSwanEvent.event}
                      </span>
                    </div>
                  )}

                  {/* 各方行动概览 */}
                  {currentTurn.submissions &&
                    Array.isArray(currentTurn.submissions) &&
                    currentTurn.submissions.length > 0 && (
                      <div className="mt-1">
                        <div className="mb-1 text-[10px] text-gray-500">
                          本轮行动 ({currentTurn.submissions.length})
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {currentTurn.submissions.slice(0, 4).map((sub, i) => (
                            <span
                              key={i}
                              className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-gray-400"
                              style={{
                                borderLeft: `2px solid ${
                                  TEAM_COLORS[sub.team || 'BLUE']?.primary ||
                                  '#3B82F6'
                                }`,
                              }}
                            >
                              {(sub.role || '').length > 8
                                ? (sub.role || '').substring(0, 8) + '...'
                                : sub.role || '未知'}
                            </span>
                          ))}
                          {currentTurn.submissions.length > 4 && (
                            <span className="text-[10px] text-gray-500">
                              +{currentTurn.submissions.length - 4}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                </div>
              ) : (
                <div className="mt-2 text-xs italic text-gray-500">
                  {selectedRound > run.currentRound
                    ? '此回合尚未推演'
                    : '加载中...'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 渲染网络关系图
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
                {/* 外圈动画 */}
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
                  {teamColor.icon}
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
              </g>
            );
          })}

          {/* 中心 */}
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
            {Object.entries(TEAM_COLORS)
              .slice(0, 5)
              .map(([team, colors]) => (
                <div key={team} className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: colors.primary }}
                  />
                  <span className="text-xs text-gray-600">
                    {colors.label} - {colors.description}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>
    );
  };

  // 渲染竞争格局视图
  const renderCompetitionView = () => {
    const competitionData = companies.map((company, idx) => {
      const metrics = company.metrics || {};
      return {
        name: company.name,
        x: metrics.share || 20 + Math.random() * 30,
        y: metrics.profit || 10 + Math.random() * 20,
        z: metrics.revenue || 50 + Math.random() * 100,
        team: idx % 2 === 0 ? 'BLUE' : 'RED',
        type: company.type,
      };
    });

    if (competitionData.length === 0) {
      competitionData.push(
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
          name: '市场参与者',
          x: 15,
          y: 22,
          z: 40,
          team: 'GREEN',
          type: 'regional',
        }
      );
    }

    return (
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
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
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
      </div>
    );
  };

  // 渲染时间线视图
  const renderTimelineView = () => (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">推演时间线</h3>
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
            <Tooltip />
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

      {/* 事件列表 */}
      <div className="mt-4 flex-1 overflow-y-auto">
        <div className="relative space-y-3 pl-4">
          <div className="absolute bottom-0 left-1 top-0 w-0.5 bg-gray-200" />
          {run.turns?.map((turn) => {
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
                    </div>
                    {adj.summary && (
                      <p className="mt-1 line-clamp-2 text-xs text-gray-600">
                        {adj.summary}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // 渲染主视图
  const renderMainContent = () => {
    switch (activeView) {
      case 'sandtable':
        return renderSandtableView();
      case 'network':
        return renderNetworkView();
      case 'competition':
        return renderCompetitionView();
      case 'timeline':
        return renderTimelineView();
      default:
        return renderSandtableView();
    }
  };

  return (
    <div
      className={`flex flex-col bg-white ${isFullscreen ? 'fixed inset-0 z-50' : 'h-full rounded-xl border border-gray-200'}`}
    >
      {renderHeader()}
      <div className="flex-1 overflow-hidden">{renderMainContent()}</div>

      {/* 底部状态栏 - 仅在非沙盘视图显示 */}
      {activeView !== 'sandtable' && (
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
      )}
    </div>
  );
}
