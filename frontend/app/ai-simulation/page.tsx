'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

interface ScenarioRun {
  id: string;
  status: string;
  currentRound?: number;
}

interface ScenarioCard {
  id: string;
  name: string;
  industry: string;
  region?: string;
  companies?: ScenarioFormCompany[];
  agents?: ScenarioFormAgent[];
  runs?: ScenarioRun[];
  goals?: ScenarioGoals;
  params?: ScenarioParams;
  createdAt: string;
  updatedAt: string;
}

interface ScenarioFormCompany {
  name: string;
  type: string;
  market: string;
  metrics?: any;
}

interface ScenarioFormAgent {
  role: string;
  team: 'BLUE' | 'RED' | 'GREEN' | 'WHITE' | 'CHAOS';
  companyName?: string;
  persona?: string | object; // Can be JSON string or object from backend
  memoryPublic?: string | object;
  memoryPrivate?: string | object;
}

interface ScenarioTemplate {
  name: string;
  industry: string;
  region?: string;
  goals?: ScenarioGoals;
  constraints?: ScenarioParams;
  companies?: ScenarioFormCompany[];
  agents?: ScenarioFormAgent[];
  description?: string;
  badge?: string;
}

interface ScenarioGoals {
  targetShare?: string;
  risk?: string;
  growth?: string;
  custom?: string;
}

interface ScenarioParams {
  blindMove: boolean;
  cot: boolean;
  chaosProb: number;
  irrationalProb: number;
  humanBreakEvery: number;
}

interface ExternalSnapshot {
  snapshot: Record<string, any>;
  evidence: Array<{
    provider: string;
    ok: boolean;
    error?: string;
    endpoint?: string;
    timestamp: string;
  }>;
}

export default function AISimulationPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<ScenarioCard | null>(null);
  const [seed, setSeed] = useState<ScenarioTemplate | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const templates: ScenarioTemplate[] = useMemo(
    () => [
      {
        name: 'AI算力基础设施',
        industry: 'AI Compute Infrastructure',
        region: 'Global',
        goals: {
          targetShare: '守住份额并提升交付速度',
          risk: '控制合规与供应链黑天鹅',
          growth: '拉高算力利用率与现金流效率',
        },
        constraints: {
          blindMove: true,
          cot: true,
          chaosProb: 0.3,
          irrationalProb: 0.2,
          humanBreakEvery: 2,
        },
        companies: [
          { name: 'Benchmark Cloud GPU', type: 'benchmark', market: 'Global' },
          { name: 'Startup AI Infra', type: 'startup', market: 'US' },
        ],
        agents: [
          {
            role: 'CEO - 蓝军',
            team: 'BLUE',
            companyName: 'Benchmark Cloud GPU',
          },
          { role: 'CEO - 红军', team: 'RED', companyName: 'Startup AI Infra' },
          { role: '监管官员', team: 'WHITE' },
        ],
        description:
          'GPU/芯片/云算力供需、价格战、合规/出口管制与舆情对抗场景，默认盲注+Chaos+人类介入。',
        badge: '模板',
      },
    ],
    []
  );

  const fetchScenarios = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${config.apiUrl}/simulation/scenarios`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      });
      if (res.ok) {
        setScenarios(await res.json());
      } else {
        setMessage('加载场景失败，请确认已登录且有权限');
      }
    } catch (err: any) {
      setMessage(err.message || '加载场景失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void fetchScenarios();
  }, [user]);

  // 检查是否有从edit页面跳转过来的编辑请求
  useEffect(() => {
    const editId = sessionStorage.getItem('editScenarioId');
    if (editId && scenarios.length > 0) {
      const scenarioToEdit = scenarios.find((s) => s.id === editId);
      if (scenarioToEdit) {
        setEditing(scenarioToEdit);
        setShowEditor(true);
        sessionStorage.removeItem('editScenarioId');
      }
    }
  }, [scenarios]);

  const latestRun = (s: ScenarioCard) =>
    s.runs && s.runs.length > 0 ? s.runs[0] : null;

  const handleCreate = () => {
    setEditing(null);
    setSeed(null);
    setShowEditor(true);
  };

  // 点击卡片 -> 进入详情页查看推演过程
  const handleViewDetail = (scenario: ScenarioCard) => {
    router.push(`/ai-simulation/${scenario.id}`);
  };

  // 编辑按钮 -> 打开编辑器修改配置
  const handleEdit = (scenario: ScenarioCard, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止冒泡到卡片点击
    setEditing(scenario);
    setSeed(null);
    setShowEditor(true);
  };

  // 删除场景
  const handleDelete = async (scenario: ScenarioCard, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止冒泡到卡片点击

    if (!confirm(`确认删除场景"${scenario.name}"？此操作不可恢复。`)) {
      return;
    }

    try {
      const res = await fetch(
        `${config.apiUrl}/simulation/scenarios/${scenario.id}`,
        {
          method: 'DELETE',
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );

      if (res.ok) {
        setMessage('场景删除成功');
        setTimeout(() => setMessage(null), 3000);
        await fetchScenarios();
      } else {
        setMessage('删除失败，请稍后重试');
      }
    } catch (err) {
      console.error('Failed to delete scenario:', err);
      setMessage('删除失败');
    }
  };

  const handleTemplate = (template: ScenarioTemplate) => {
    setEditing(null);
    setSeed(template);
    setShowEditor(true);
  };

  if (authLoading) return null;

  if (!user) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 p-12">
          <div className="mx-auto max-w-3xl rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-gray-800">请先登录</h2>
            <p className="mt-2 text-sm text-gray-500">
              进入 AI Simulation 需要登录并拥有管理员权限。
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          {/* Header - 与系统其他页面一致 */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  AI Simulation
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  战略推演：多军对抗、真实数据、人类介入
                </p>
              </div>
              <button
                onClick={handleCreate}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                + 新建推演
              </button>
            </div>
          </div>

          {/* Templates */}
          <div className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  行业模板
                </h2>
                <p className="text-xs text-gray-500">
                  选择模板快速创建推演场景
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {templates.map((t) => (
                <div
                  key={t.name}
                  className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                  onClick={() => handleTemplate(t)}
                >
                  {/* Icon & Badge */}
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl">
                      🏭
                    </div>
                    {t.badge && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        {t.badge}
                      </span>
                    )}
                  </div>

                  {/* Title & Description */}
                  <h4 className="truncate text-base font-semibold text-gray-900">
                    {t.name}
                  </h4>
                  <p className="text-xs text-gray-500">
                    {t.industry} · {t.region || 'Global'}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                    {t.description}
                  </p>

                  {/* Stats */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                      公司 {t.companies?.length || 0}
                    </span>
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
                      角色 {t.agents?.length || 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Message */}
          {message && (
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              {message}
            </div>
          )}

          {/* Cards */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  场景列表
                </h2>
                <p className="text-xs text-gray-500">
                  点击卡片可查看/编辑，最新运行状态实时展示
                </p>
              </div>
              <button
                onClick={() => void fetchScenarios()}
                className="text-xs text-gray-600 hover:text-gray-800"
              >
                刷新
              </button>
            </div>
            {loading ? (
              <div className="py-10 text-center text-sm text-gray-500">
                加载中...
              </div>
            ) : scenarios.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 px-6 py-12 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6l7 4-7 4-7-4 7-4zm0 8l7 4-7 4-7-4 7-4z"
                  />
                </svg>
                <h3 className="mt-4 text-sm font-medium text-gray-900">
                  暂无推演场景
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  点击上方"新建推演"或选择模板开始
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {scenarios.map((s) => {
                  const run = latestRun(s);
                  return (
                    <div
                      key={s.id}
                      className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                      onClick={() => handleViewDetail(s)}
                    >
                      {/* Action Buttons - 悬浮显示 */}
                      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-all group-hover:opacity-100">
                        <button
                          onClick={(e) => handleEdit(s, e)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 shadow-sm backdrop-blur-sm transition-all hover:bg-blue-50 hover:shadow-md"
                          title="编辑场景配置"
                        >
                          <svg
                            className="h-4 w-4 text-blue-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => handleDelete(s, e)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 shadow-sm backdrop-blur-sm transition-all hover:bg-red-50 hover:shadow-md"
                          title="删除场景"
                        >
                          <svg
                            className="h-4 w-4 text-red-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>

                      {/* Icon & Status */}
                      <div className="mb-3 flex items-start justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 text-2xl">
                          ⚔️
                        </div>
                        {run ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              run.status === 'RUNNING'
                                ? 'bg-green-100 text-green-700'
                                : run.status === 'COMPLETED'
                                  ? 'bg-blue-100 text-blue-700'
                                  : run.status === 'PAUSED'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            {run.status === 'RUNNING'
                              ? '运行中'
                              : run.status === 'COMPLETED'
                                ? '已完成'
                                : run.status === 'PAUSED'
                                  ? '已暂停'
                                  : run.status}
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            未运行
                          </span>
                        )}
                      </div>

                      {/* Title & Industry */}
                      <h4 className="truncate text-base font-semibold text-gray-900">
                        {s.name}
                      </h4>
                      <p className="text-xs text-gray-500">
                        {s.industry} · {s.region || 'Global'}
                      </p>

                      {/* Stats */}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                          公司 {s.companies?.length || 0}
                        </span>
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
                          角色 {s.agents?.length || 0}
                        </span>
                        {run && (
                          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600">
                            回合 {run.currentRound ?? 0}
                          </span>
                        )}
                      </div>

                      {/* Updated Time & Hint */}
                      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                        <span>{new Date(s.updatedAt).toLocaleString()}</span>
                        <span className="text-indigo-500 opacity-0 transition-opacity group-hover:opacity-100">
                          点击查看详情 →
                        </span>
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={handleCreate}
                  className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-500 transition-all hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600"
                >
                  <span className="mb-2 text-3xl">+</span>
                  新建推演
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Editor Modal */}
      {showEditor && (
        <EditorModal
          scenario={editing}
          seed={seed}
          onClose={() => setShowEditor(false)}
          onSaved={() => {
            // 只刷新列表数据，不更新editing状态
            // 这样EditorModal内部的agents/companies状态不会被覆盖
            void fetchScenarios();
          }}
        />
      )}
    </div>
  );
}

// Company完整要素（基于PRD）
interface CompanyMetrics {
  cash: number; // 现金
  share: number; // 市场份额 %
  priceBand: string; // 价格带
  capacity: number; // 产能
  inventory: number; // 库存
  delivery: string; // 交付周期
  arpu: number; // ARPU
  margin: number; // 毛利率 %
  debt: number; // 负债
}

interface CompanyMoat {
  patents: number; // 专利数
  channels: string; // 渠道
  brand: string; // 品牌影响力
}

interface CompanyFull extends ScenarioFormCompany {
  metrics: CompanyMetrics;
  moat: CompanyMoat;
  riskThresholds: {
    cashMin: number;
    debtMax: number;
    complianceLevel: string;
  };
  sentimentScore: number;
}

// Agent完整Persona（基于PRD）- 用于文档和类型参考
// persona字段存储为JSON字符串，包含以下结构：
// {
//   traits: string;         // 性格特征
//   biases: string;         // 偏见
//   pressure: string;       // 压力源
//   timePref: string;       // 时间偏好 (短期/长期)
//   riskTolerance: number;  // 风险容忍度 0-100
//   compliance: number;     // 合规度 0-100
// }

function EditorModal({
  scenario,
  seed,
  onClose,
  onSaved,
}: {
  scenario: ScenarioCard | null;
  seed?: ScenarioTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const defaultConstraints: ScenarioParams = {
    blindMove: true,
    cot: true,
    chaosProb: 0.3,
    irrationalProb: 0.2,
    humanBreakEvery: 2,
  };

  // 本地场景状态 - 用于跟踪保存后获取的ID（新建场景时）
  const [localScenario, setLocalScenario] = useState<ScenarioCard | null>(
    scenario
  );

  // Tab state for organized editing - 向导式步骤
  type TabType = 'basic' | 'companies' | 'agents' | 'params';
  const [activeTab, setActiveTab] = useState<TabType>('basic');
  const [completedSteps, setCompletedSteps] = useState<Set<TabType>>(new Set());

  // 计算初始值的函数
  const getInitialForm = () => {
    const preset = (scenario || seed || {}) as Partial<ScenarioCard> &
      Partial<ScenarioTemplate>;
    return {
      name: preset.name || '',
      industry: preset.industry || '',
      region: preset.region || '',
      goals: {
        targetShare: preset.goals?.targetShare || '',
        risk: preset.goals?.risk || '',
        growth: preset.goals?.growth || '',
        custom: preset.goals?.custom || '',
      } as ScenarioGoals,
      constraints: preset.params || preset.constraints || defaultConstraints,
    };
  };

  const getInitialCompanies = (): ScenarioFormCompany[] => {
    const preset = (scenario || seed || {}) as Partial<ScenarioCard> &
      Partial<ScenarioTemplate>;
    if (preset.companies && preset.companies.length > 0) {
      return preset.companies;
    }
    return [
      { name: 'Benchmark Cloud GPU', type: 'benchmark', market: 'Global' },
      { name: 'Startup AI Infra', type: 'startup', market: 'US' },
    ];
  };

  const getInitialAgents = (): ScenarioFormAgent[] => {
    const preset = (scenario || seed || {}) as Partial<ScenarioCard> &
      Partial<ScenarioTemplate>;
    if (preset.agents && preset.agents.length > 0) {
      return preset.agents.map((a: any) => ({
        role: a.role || '',
        team: a.team || 'BLUE',
        companyName: a.companyName || a.company?.name || '',
        persona: a.persona,
        memoryPublic: a.memoryPublic,
        memoryPrivate: a.memoryPrivate,
      }));
    }
    // 默认角色不预设公司，让用户在配置公司后手动选择或使用AI推荐
    return [
      { role: 'CEO', team: 'BLUE', companyName: '' },
      { role: 'CEO', team: 'RED', companyName: '' },
      { role: '监管官员', team: 'WHITE' },
    ];
  };

  const [form, setForm] = useState(getInitialForm);
  const [companies, setCompanies] =
    useState<ScenarioFormCompany[]>(getInitialCompanies);
  const [agents, setAgents] = useState<ScenarioFormAgent[]>(getInitialAgents);

  // 当 scenario 或 seed 变化时重新初始化状态
  useEffect(() => {
    setForm(getInitialForm());
    setCompanies(getInitialCompanies());
    setAgents(getInitialAgents());
    setLocalScenario(scenario);
    setActiveTab('basic');
    setCompletedSteps(new Set());
  }, [scenario?.id, seed?.name]);

  // 当公司配置变化时，智能为各阵营角色分配公司
  // 业务逻辑：
  // - 蓝军(BLUE)：用户自己的公司，只分配一个benchmark/regional公司给第一个角色
  // - 红军(RED)：竞争对手，将所有竞争对手公司(competitor/challenger/startup)分散分配给红军角色
  // - 绿方(GREEN)：市场客户，将客户/供应商公司(customer/supplier)分散分配给绿方角色
  // - 白方(WHITE)：监管机构，不分配公司
  useEffect(() => {
    if (companies.length === 0) return;

    // 获取有效公司（非空名称）
    const validCompanies = companies.filter(
      (c) => c.name && !c.name.startsWith('Company ')
    );
    if (validCompanies.length === 0) return;

    // 按公司类型分类
    // 蓝军公司：用户自己的公司（benchmark或regional类型）
    const blueCompanies = validCompanies.filter(
      (c) => c.type === 'benchmark' || c.type === 'regional'
    );
    // 红军公司：竞争对手（competitor、challenger、startup类型）
    const redCompanies = validCompanies.filter(
      (c) =>
        c.type === 'competitor' ||
        c.type === 'challenger' ||
        c.type === 'startup'
    );
    // 绿方公司：客户和供应商（customer、supplier类型）
    const greenCompanies = validCompanies.filter(
      (c) => c.type === 'customer' || c.type === 'supplier'
    );

    setAgents((prev) => {
      // 统计各阵营需要分配公司的角色
      const blueAgents = prev
        .map((a, idx) => ({ agent: a, index: idx }))
        .filter((x) => x.agent.team === 'BLUE' && !x.agent.companyName);
      const redAgents = prev
        .map((a, idx) => ({ agent: a, index: idx }))
        .filter((x) => x.agent.team === 'RED' && !x.agent.companyName);
      const greenAgents = prev
        .map((a, idx) => ({ agent: a, index: idx }))
        .filter((x) => x.agent.team === 'GREEN' && !x.agent.companyName);

      // 如果没有需要分配的角色，直接返回
      if (
        blueAgents.length === 0 &&
        redAgents.length === 0 &&
        greenAgents.length === 0
      ) {
        return prev;
      }

      // 复制数组进行修改
      const updatedAgents = [...prev];

      // 蓝军：只分配第一个蓝军公司给第一个蓝军角色
      if (blueAgents.length > 0 && blueCompanies.length > 0) {
        updatedAgents[blueAgents[0].index] = {
          ...updatedAgents[blueAgents[0].index],
          companyName: blueCompanies[0].name,
        };
      }

      // 红军：将竞争对手公司循环分配给所有红军角色
      // 例如：NVIDIA -> CEO, AMD -> CTO, Intel -> CFO, NVIDIA -> 销售总监...
      if (redAgents.length > 0 && redCompanies.length > 0) {
        redAgents.forEach((item, i) => {
          const companyIndex = i % redCompanies.length;
          updatedAgents[item.index] = {
            ...updatedAgents[item.index],
            companyName: redCompanies[companyIndex].name,
          };
        });
      }

      // 绿方：将客户/供应商公司循环分配给所有绿方角色
      if (greenAgents.length > 0 && greenCompanies.length > 0) {
        greenAgents.forEach((item, i) => {
          const companyIndex = i % greenCompanies.length;
          updatedAgents[item.index] = {
            ...updatedAgents[item.index],
            companyName: greenCompanies[companyIndex].name,
          };
        });
      }

      return updatedAgents;
    });
  }, [companies]);

  const [saving, setSaving] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [external, setExternal] = useState<ExternalSnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);

  // AI辅助状态
  const [aiAssisting, setAiAssisting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{
    companies?: Array<{
      name: string;
      type: string;
      market: string;
      reason: string;
    }>;
    agents?: Array<{ role: string; team: string; reason: string }>;
    goals?: { targetShare: string; risk: string; growth: string };
    insights?: string[];
  } | null>(null);

  // AI辅助：根据行业自动获取竞争对手和市场信息
  const aiAssistAnalyze = async () => {
    if (!form.industry) {
      setMessage('请先填写行业信息');
      return;
    }
    setAiAssisting(true);
    setMessage(null);
    try {
      const res = await fetch(`${config.apiUrl}/simulation/ai-assist/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({
          industry: form.industry,
          region: form.region || 'Global',
          existingCompanies: companies.map((c) => c.name),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiSuggestions(data);
        setMessage('AI已分析行业竞争格局，请查看建议并选择采纳');
      } else {
        setMessage(data?.message || 'AI分析失败，请稍后重试');
      }
    } catch (err: any) {
      setMessage(err.message || 'AI分析失败');
    } finally {
      setAiAssisting(false);
    }
  };

  // 采纳AI建议的公司
  const adoptAiCompanies = () => {
    if (!aiSuggestions?.companies) return;
    const suggestedCompanies = aiSuggestions.companies.map((c) => ({
      name: c.name,
      type: c.type,
      market: c.market,
    }));

    setCompanies((prev) => {
      // 找出空白的公司槽位（name为空或只有默认占位符）
      const isEmptyCompany = (company: ScenarioFormCompany) =>
        !company.name ||
        company.name.trim() === '' ||
        company.name.startsWith('Company ');

      // 找出空白槽位索引
      const emptySlots: number[] = [];
      prev.forEach((company, index) => {
        if (isEmptyCompany(company)) {
          emptySlots.push(index);
        }
      });

      // 复制现有数组
      const updatedCompanies = [...prev];
      const companiesToAdd: ScenarioFormCompany[] = [];

      suggestedCompanies.forEach((suggested) => {
        if (emptySlots.length > 0) {
          // 填充空白槽位
          const slotIndex = emptySlots.shift()!;
          updatedCompanies[slotIndex] = suggested;
        } else {
          // 没有空白槽位，才添加新公司
          companiesToAdd.push(suggested);
        }
      });

      return [...updatedCompanies, ...companiesToAdd];
    });

    setMessage(`已采纳 ${suggestedCompanies.length} 家AI推荐的公司`);
  };

  // 采纳AI建议的角色
  const adoptAiAgents = () => {
    if (!aiSuggestions?.agents) return;
    const suggestedAgents = aiSuggestions.agents.map((a) => ({
      role: a.role,
      team: a.team as ScenarioFormAgent['team'],
    }));

    setAgents((prev) => {
      // 创建已存在角色的标识集合（team-role组合）
      const existingRoles = new Set(
        prev
          .filter((a) => a.role && a.role.trim() !== '')
          .map((a) => `${a.team}-${a.role}`.toLowerCase())
      );

      // 找出空白的角色槽位（role为空或只有默认占位符）
      const isEmptyAgent = (agent: ScenarioFormAgent) =>
        !agent.role || agent.role.trim() === '' || agent.role === '新角色';

      // 过滤掉已存在的角色
      const uniqueSuggestions = suggestedAgents.filter(
        (s) => !existingRoles.has(`${s.team}-${s.role}`.toLowerCase())
      );

      if (uniqueSuggestions.length === 0) {
        return prev; // 没有新角色需要添加
      }

      // 找出同team的空白槽位索引
      const emptySlotsByTeam: Record<string, number[]> = {};
      prev.forEach((agent, index) => {
        if (isEmptyAgent(agent)) {
          const team = agent.team;
          if (!emptySlotsByTeam[team]) emptySlotsByTeam[team] = [];
          emptySlotsByTeam[team].push(index);
        }
      });

      // 复制现有数组
      const updatedAgents = [...prev];
      const agentsToAdd: ScenarioFormAgent[] = [];

      uniqueSuggestions.forEach((suggested) => {
        // 优先填充同team的空白槽位
        const teamSlots = emptySlotsByTeam[suggested.team];
        if (teamSlots && teamSlots.length > 0) {
          const slotIndex = teamSlots.shift()!;
          updatedAgents[slotIndex] = suggested;
        } else {
          // 没有同team空白槽位，查找任意空白槽位
          let foundSlot = false;
          for (const team of Object.keys(emptySlotsByTeam)) {
            if (emptySlotsByTeam[team].length > 0) {
              const slotIndex = emptySlotsByTeam[team].shift()!;
              updatedAgents[slotIndex] = suggested;
              foundSlot = true;
              break;
            }
          }
          // 如果没有任何空白槽位，才添加新角色
          if (!foundSlot) {
            agentsToAdd.push(suggested);
          }
        }
      });

      return [...updatedAgents, ...agentsToAdd];
    });

    setMessage(`已采纳 ${suggestedAgents.length} 个AI推荐的角色`);
  };

  // 采纳AI建议的目标
  const adoptAiGoals = () => {
    if (!aiSuggestions?.goals) return;
    setForm((prev) => ({
      ...prev,
      goals: { ...prev.goals, ...aiSuggestions.goals },
    }));
    setMessage('已采纳AI推荐的推演目标');
  };

  // AI辅助：根据已有蓝军角色，智能推荐红军/绿军/Chaos角色
  const [aiAgentAssisting, setAiAgentAssisting] = useState(false);
  const [aiAgentSuggestions, setAiAgentSuggestions] = useState<Array<{
    role: string;
    team: string;
    companyName?: string;
    persona?: any;
    reason: string;
  }> | null>(null);

  const aiAssistAgents = async () => {
    // 检查是否已有蓝军角色
    const blueAgents = agents.filter((a) => a.team === 'BLUE');
    if (blueAgents.length === 0) {
      setMessage('请先配置至少一个蓝军角色');
      return;
    }
    if (!form.industry) {
      setMessage('请先在基本信息中填写行业');
      return;
    }

    setAiAgentAssisting(true);
    setMessage(null);
    try {
      const res = await fetch(
        `${config.apiUrl}/simulation/ai-assist/suggest-agents`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          credentials: 'include',
          body: JSON.stringify({
            industry: form.industry,
            companies: companies.map((c) => ({ name: c.name, type: c.type })),
            existingAgents: agents.map((a) => ({
              role: a.role,
              team: a.team,
              companyName: a.companyName,
            })),
          }),
        }
      );
      const data = await res.json();
      if (res.ok && data.agents) {
        setAiAgentSuggestions(data.agents);
        setMessage(
          `AI已推荐 ${data.agents.length} 个对手角色，请查看并选择采纳`
        );
      } else {
        setMessage(data?.message || 'AI推荐失败，请稍后重试');
      }
    } catch (err: any) {
      setMessage(err.message || 'AI推荐失败');
    } finally {
      setAiAgentAssisting(false);
    }
  };

  // 采纳AI推荐的对手角色
  const adoptAiAgentSuggestions = () => {
    if (!aiAgentSuggestions || aiAgentSuggestions.length === 0) return;

    const suggestedAgents = aiAgentSuggestions.map((a) => ({
      role: a.role,
      team: a.team as ScenarioFormAgent['team'],
      companyName: a.companyName,
      persona: a.persona ? JSON.stringify(a.persona) : undefined,
    }));

    setAgents((prev) => {
      // 创建已存在角色的标识集合（team-role组合）
      const existingRoles = new Set(
        prev
          .filter((a) => a.role && a.role.trim() !== '')
          .map((a) => `${a.team}-${a.role}`.toLowerCase())
      );

      // 找出空白的角色槽位（role为空或只有默认占位符）
      const isEmptyAgent = (agent: ScenarioFormAgent) =>
        !agent.role || agent.role.trim() === '' || agent.role === '新角色';

      // 过滤掉已存在的角色
      const uniqueSuggestions = suggestedAgents.filter(
        (s) => !existingRoles.has(`${s.team}-${s.role}`.toLowerCase())
      );

      if (uniqueSuggestions.length === 0) {
        return prev; // 没有新角色需要添加
      }

      // 找出同team的空白槽位索引
      const emptySlotsByTeam: Record<string, number[]> = {};
      prev.forEach((agent, index) => {
        if (isEmptyAgent(agent)) {
          const team = agent.team;
          if (!emptySlotsByTeam[team]) emptySlotsByTeam[team] = [];
          emptySlotsByTeam[team].push(index);
        }
      });

      // 复制现有数组
      const updatedAgents = [...prev];
      const agentsToAdd: ScenarioFormAgent[] = [];

      uniqueSuggestions.forEach((suggested) => {
        // 优先填充同team的空白槽位
        const teamSlots = emptySlotsByTeam[suggested.team];
        if (teamSlots && teamSlots.length > 0) {
          const slotIndex = teamSlots.shift()!;
          updatedAgents[slotIndex] = suggested;
        } else {
          // 没有同team空白槽位，查找任意空白槽位
          let foundSlot = false;
          for (const team of Object.keys(emptySlotsByTeam)) {
            if (emptySlotsByTeam[team].length > 0) {
              const slotIndex = emptySlotsByTeam[team].shift()!;
              updatedAgents[slotIndex] = suggested;
              foundSlot = true;
              break;
            }
          }
          // 如果没有任何空白槽位，才添加新角色
          if (!foundSlot) {
            agentsToAdd.push(suggested);
          }
        }
      });

      return [...updatedAgents, ...agentsToAdd];
    });

    const totalCount = suggestedAgents.length;
    setAiAgentSuggestions(null);
    setMessage(`已采纳 ${totalCount} 个AI推荐的角色`);
  };

  // AI辅助：推荐推演参数
  const [aiParamsAssisting, setAiParamsAssisting] = useState(false);
  const [aiParamsSuggestions, setAiParamsSuggestions] = useState<{
    blindMove: boolean;
    cot: boolean;
    chaosProb: number;
    irrationalProb: number;
    humanBreakEvery: number;
    rounds: number;
    enabledEvents: string[];
    reasoning: string;
  } | null>(null);

  const aiAssistParams = async () => {
    if (!form.industry) {
      setMessage('请先在基本信息中填写行业');
      return;
    }

    setAiParamsAssisting(true);
    setMessage(null);
    try {
      const res = await fetch(
        `${config.apiUrl}/simulation/ai-assist/suggest-params`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          credentials: 'include',
          body: JSON.stringify({
            industry: form.industry,
            region: form.region,
            companyCount: companies.length,
            agentCount: agents.length,
            goals: form.goals,
          }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        setAiParamsSuggestions(data);
        setMessage('AI已分析行业特征并推荐最优参数配置，点击"采纳建议"应用');
      } else {
        setMessage(data?.message || 'AI推荐失败，请稍后重试');
      }
    } catch (err: any) {
      setMessage(err.message || 'AI推荐失败');
    } finally {
      setAiParamsAssisting(false);
    }
  };

  // 采纳AI推荐的参数
  const adoptAiParamsSuggestions = () => {
    if (!aiParamsSuggestions) return;
    setForm((prev) => ({
      ...prev,
      constraints: {
        ...prev.constraints,
        blindMove: aiParamsSuggestions.blindMove,
        cot: aiParamsSuggestions.cot,
        chaosProb: aiParamsSuggestions.chaosProb,
        irrationalProb: aiParamsSuggestions.irrationalProb,
        humanBreakEvery: aiParamsSuggestions.humanBreakEvery,
      },
    }));
    setAiParamsSuggestions(null);
    setMessage('已采纳AI推荐的推演参数配置');
  };

  const saveScenario = async () => {
    setSaving(true);
    try {
      // 判断是编辑还是新建 - 使用localScenario跟踪保存后的ID
      const isEditing = !!localScenario?.id;
      const url = isEditing
        ? `${config.apiUrl}/simulation/scenarios/${localScenario.id}`
        : `${config.apiUrl}/simulation/scenarios`;
      const method = isEditing ? 'PATCH' : 'POST';

      // 准备要发送的agents数据
      const agentsToSave = agents.map((a) => ({
        ...a,
        persona: a.persona ? safeJson(a.persona, a.persona) : undefined,
        memoryPublic: a.memoryPublic
          ? safeJson(a.memoryPublic, a.memoryPublic)
          : undefined,
        memoryPrivate: a.memoryPrivate
          ? safeJson(a.memoryPrivate, a.memoryPrivate)
          : undefined,
      }));

      // 准备请求body
      const requestBody = {
        ...form,
        companies,
        agents: agentsToSave,
      };

      // 调试日志
      console.log('[saveScenario] Method:', method);
      console.log('[saveScenario] URL:', url);
      console.log('[saveScenario] isEditing:', isEditing);
      console.log('[saveScenario] localScenario?.id:', localScenario?.id);
      console.log('[saveScenario] Agents count:', agents.length);
      console.log('[saveScenario] Companies count:', companies.length);
      console.log(
        '[saveScenario] Request body:',
        JSON.stringify(requestBody, null, 2)
      );

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      console.log('[saveScenario] Response status:', res.status);
      const data = await res.json();
      console.log('[saveScenario] Response data:', data);

      if (res.ok) {
        setMessage(isEditing ? '场景已更新' : '场景已保存');
        // 更新本地场景状态（新建场景时获取ID，后续保存变为PATCH）
        setLocalScenario(data as ScenarioCard);
        // 通知父组件刷新列表（不传递数据，避免覆盖本地状态）
        onSaved();
      } else {
        setMessage(data?.message || '保存失败');
      }
    } catch (err: any) {
      setMessage(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const startRun = async () => {
    if (!localScenario?.id) {
      setMessage('请先保存场景');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${config.apiUrl}/simulation/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({
          scenarioId: localScenario.id,
          rounds: 4,
          params: form.constraints,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRunId(data.id);
        setMessage('推演已启动，正在跳转...');
        // 导航到推演页面
        router.push(`/ai-simulation/run/${data.id}`);
      } else {
        setMessage(data?.message || '启动失败');
      }
    } catch (err: any) {
      setMessage(err.message || '启动失败');
    } finally {
      setSaving(false);
    }
  };

  const updateCompany = (index: number, value: ScenarioFormCompany) => {
    setCompanies((prev) => prev.map((c, i) => (i === index ? value : c)));
  };
  const removeCompany = (index: number) => {
    setCompanies((prev) => prev.filter((_, i) => i !== index));
  };
  const addCompany = () =>
    setCompanies((prev) => [
      ...prev,
      { name: `Company ${prev.length + 1}`, type: 'startup', market: 'Global' },
    ]);
  const updateAgent = (index: number, value: ScenarioFormAgent) => {
    setAgents((prev) => prev.map((a, i) => (i === index ? value : a)));
  };
  const removeAgent = (index: number) => {
    setAgents((prev) => prev.filter((_, i) => i !== index));
  };
  const addAgent = () =>
    setAgents((prev) => [
      ...prev,
      { role: `Agent ${prev.length + 1}`, team: 'BLUE' },
    ]);

  // 重置角色配置为默认状态
  const resetAgents = () => {
    setAgents([
      { role: 'CEO', team: 'BLUE', companyName: '' },
      { role: 'CEO', team: 'RED', companyName: '' },
      { role: '监管官员', team: 'WHITE' },
    ]);
    setAiAgentSuggestions(null);
    setMessage('角色配置已重置');
  };

  // 清理重复和无效角色
  const cleanupAgents = () => {
    setAgents((prev) => {
      const seen = new Set<string>();
      const cleaned: ScenarioFormAgent[] = [];

      prev.forEach((agent) => {
        // 跳过空角色
        if (!agent.role || agent.role.trim() === '') return;

        // 创建唯一标识 (team-role-companyName)
        const key =
          `${agent.team}-${agent.role}-${agent.companyName || ''}`.toLowerCase();

        // 跳过重复角色
        if (seen.has(key)) return;
        seen.add(key);

        // 保留角色的所有属性，包括 companyName
        cleaned.push({ ...agent });
      });

      // 如果清理后没有角色，返回默认配置
      if (cleaned.length === 0) {
        return [
          { role: 'CEO', team: 'BLUE', companyName: '' },
          { role: 'CEO', team: 'RED', companyName: '' },
          { role: '监管官员', team: 'WHITE' },
        ];
      }

      return cleaned;
    });
    setMessage('已清理重复和无效角色');
  };

  const fetchExternal = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch(`${config.apiUrl}/simulation/external/snapshot`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setExternal(data);
        setMessage('已同步外部数据，建议复核字段并人工调整');
      } else {
        setMessage(data?.message || '同步外部数据失败');
      }
    } catch (err: any) {
      setMessage(err.message || '同步外部数据失败');
    } finally {
      setSyncing(false);
    }
  };

  // 智能合并公司数据：优先填充空白槽位，有数据的保留
  const mergeCompanies = (
    existingCompanies: ScenarioFormCompany[],
    newCompanies: ScenarioFormCompany[]
  ): ScenarioFormCompany[] => {
    if (newCompanies.length === 0) return existingCompanies;

    // 找出空白的公司槽位
    const isEmptyCompany = (company: ScenarioFormCompany) =>
      !company.name ||
      company.name.trim() === '' ||
      company.name.startsWith('Company ');

    // 找出有数据的公司（保留）和空白槽位
    const filledCompanies = existingCompanies.filter((c) => !isEmptyCompany(c));
    const emptySlots = existingCompanies.filter((c) => isEmptyCompany(c));

    // 过滤掉重复的公司名称
    const existingNames = new Set(
      filledCompanies.map((c) => c.name.toLowerCase())
    );
    const uniqueNewCompanies = newCompanies.filter(
      (c) => !existingNames.has(c.name.toLowerCase())
    );

    // 合并：已有数据 + 新数据（填充空白槽位或追加）
    const result = [...filledCompanies];
    let emptyIndex = 0;

    uniqueNewCompanies.forEach((newCompany) => {
      if (emptyIndex < emptySlots.length) {
        // 填充空白槽位
        result.push(newCompany);
        emptyIndex++;
      } else {
        // 没有空白槽位，追加
        result.push(newCompany);
      }
    });

    return result;
  };

  const injectFromMarket = async () => {
    // 检查外部数据是否有市场公司数组
    if (
      external?.snapshot?.market &&
      Array.isArray(external.snapshot.market) &&
      external.snapshot.market.length > 0
    ) {
      // 使用外部API返回的公司列表
      const newCompanies = external.snapshot.market
        .slice(0, 6)
        .map((item: any, idx: number) => ({
          name: item.name || item.title || `Company ${idx + 1}`,
          type: item.type || 'competitor',
          market: item.market || form.region || 'Global',
          metrics: item.metrics || item,
        }));
      setCompanies((prev) => mergeCompanies(prev, newCompanies));
      setMessage('已用外部市场数据填充公司，请确认类型/指标');
      return;
    }

    // 检查外部数据是否配置了但返回错误
    if (external?.snapshot?.market?.error) {
      const errorMsg = external.snapshot.market.error;
      if (errorMsg === 'provider_not_configured') {
        setMessage(
          '外部市场数据源未配置。请在系统设置中配置 market 类型的数据提供商，或使用AI智能分析'
        );
      } else if (errorMsg === 'provider_disabled') {
        setMessage('外部市场数据源已禁用。请启用数据提供商或使用AI智能分析');
      } else {
        setMessage(`外部数据获取失败: ${errorMsg}。将使用AI分析作为替代`);
      }
      // 不直接返回，继续使用AI分析
    }

    // 外部API没有返回公司列表，使用AI辅助分析
    if (!form.industry) {
      setMessage('请先在基本信息中填写行业，AI将根据行业分析竞争格局');
      return;
    }

    // 调用AI辅助分析
    setAiAssisting(true);
    setMessage('正在使用AI分析行业竞争格局...');
    try {
      const res = await fetch(`${config.apiUrl}/simulation/ai-assist/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({
          industry: form.industry,
          region: form.region || 'Global',
          existingCompanies: companies.map((c) => c.name),
        }),
      });
      const data = await res.json();
      if (res.ok && data.companies && Array.isArray(data.companies)) {
        // AI分析成功，为每个公司生成量化指标
        const companiesWithMetrics = await Promise.all(
          data.companies.map(async (c: any) => {
            try {
              const metricsRes = await fetch(
                `${config.apiUrl}/simulation/ai-assist/generate-metrics`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeader(),
                  },
                  credentials: 'include',
                  body: JSON.stringify({
                    companyName: c.name,
                    companyType: c.type || 'competitor',
                    industry: form.industry,
                    market: c.market || form.region || 'Global',
                  }),
                }
              );
              const metricsData = await metricsRes.json();
              return {
                name: c.name,
                type: c.type || 'competitor',
                market: c.market || form.region || 'Global',
                metrics:
                  metricsRes.ok && metricsData.metrics
                    ? metricsData.metrics
                    : {},
              };
            } catch {
              return {
                name: c.name,
                type: c.type || 'competitor',
                market: c.market || form.region || 'Global',
                metrics: {},
              };
            }
          })
        );
        setCompanies((prev) => mergeCompanies(prev, companiesWithMetrics));
        setAiSuggestions(data);
        setMessage(
          `AI已分析并推荐 ${companiesWithMetrics.length} 家公司（含量化指标），请确认类型/指标`
        );
      } else {
        setMessage(
          data?.message || 'AI分析未返回公司数据，请手动添加公司或重试'
        );
      }
    } catch (err: any) {
      setMessage(err.message || 'AI分析失败，请手动添加公司');
    } finally {
      setAiAssisting(false);
    }
  };

  const tabs: Array<{
    id: TabType;
    label: string;
    icon: string;
    count?: number;
    desc: string;
    required?: string[];
  }> = [
    {
      id: 'basic',
      label: '基本信息',
      icon: '📋',
      desc: '场景名称、行业、目标',
      required: ['name', 'industry'],
    },
    {
      id: 'companies',
      label: '公司配置',
      icon: '🏢',
      count: companies.length,
      desc: '参与推演的公司及量化指标',
    },
    {
      id: 'agents',
      label: '角色配置',
      icon: '👥',
      count: agents.length,
      desc: 'AI Agent与Persona配置',
    },
    {
      id: 'params',
      label: '推演参数',
      icon: '⚙️',
      desc: '对战机制、随机性、人类干预',
    },
  ];

  // 验证当前步骤是否完成
  const isStepValid = (tabId: TabType): boolean => {
    switch (tabId) {
      case 'basic':
        return !!(form.name && form.industry);
      case 'companies':
        return companies.length > 0 && companies.every((c) => c.name && c.type);
      case 'agents':
        return agents.length > 0 && agents.every((a) => a.role && a.team);
      case 'params':
        return true;
      default:
        return false;
    }
  };

  // 导航到下一步
  const goToNextStep = () => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    if (currentIndex < tabs.length - 1) {
      if (isStepValid(activeTab)) {
        setCompletedSteps((prev) => new Set([...prev, activeTab]));
      }
      setActiveTab(tabs[currentIndex + 1].id);
    }
  };

  // 导航到上一步
  const goToPrevStep = () => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    if (currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1].id);
    }
  };

  // 获取步骤状态
  const getStepStatus = (
    tabId: TabType
  ): 'completed' | 'current' | 'pending' => {
    if (completedSteps.has(tabId)) return 'completed';
    if (tabId === activeTab) return 'current';
    return 'pending';
  };

  const teamColors: Record<string, string> = {
    BLUE: 'bg-blue-100 text-blue-700 border-blue-200',
    RED: 'bg-red-100 text-red-700 border-red-200',
    GREEN: 'bg-green-100 text-green-700 border-green-200',
    WHITE: 'bg-gray-100 text-gray-700 border-gray-200',
    CHAOS: 'bg-purple-100 text-purple-700 border-purple-200',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {scenario ? '编辑推演场景' : '新建推演场景'}
            </h2>
            <p className="mt-0.5 text-sm text-gray-600">
              分步配置场景的基本信息、公司、角色和推演参数
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/60 hover:text-gray-600"
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

        {/* Step Indicator - 向导式步骤指示器 */}
        <div className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-indigo-50/30 px-6 py-4">
          <div className="flex items-center justify-between">
            {tabs.map((tab, index) => {
              const status = getStepStatus(tab.id);
              const isLast = index === tabs.length - 1;
              return (
                <div key={tab.id} className="flex flex-1 items-center">
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`group flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                      status === 'current'
                        ? 'bg-white shadow-sm ring-1 ring-indigo-200'
                        : status === 'completed'
                          ? 'hover:bg-white/50'
                          : 'opacity-60 hover:opacity-80'
                    }`}
                  >
                    {/* Step Number/Check */}
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                        status === 'completed'
                          ? 'bg-green-500 text-white'
                          : status === 'current'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {status === 'completed' ? (
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
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </div>
                    {/* Step Info */}
                    <div className="hidden sm:block">
                      <div
                        className={`text-sm font-medium ${
                          status === 'current'
                            ? 'text-indigo-700'
                            : status === 'completed'
                              ? 'text-green-700'
                              : 'text-gray-500'
                        }`}
                      >
                        {tab.label}
                        {tab.count !== undefined && (
                          <span
                            className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                              status === 'current'
                                ? 'bg-indigo-100'
                                : 'bg-gray-100'
                            }`}
                          >
                            {tab.count}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{tab.desc}</div>
                    </div>
                  </button>
                  {/* Connector Line */}
                  {!isLast && (
                    <div
                      className={`mx-2 h-0.5 flex-1 rounded ${
                        completedSteps.has(tab.id)
                          ? 'bg-green-300'
                          : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mx-6 mt-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
              message.includes('失败') || message.includes('错误')
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-green-200 bg-green-50 text-green-700'
            }`}
          >
            <span>{message.includes('失败') ? '⚠️' : '✓'}</span>
            <span>{message}</span>
            <button
              onClick={() => setMessage(null)}
              className="ml-auto text-current opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <div className="mx-auto max-w-3xl space-y-6">
              {/* 场景信息 */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                      1
                    </span>
                    场景信息
                  </h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      场景名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      placeholder="例如：AI算力基础设施对抗推演"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        行业 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={form.industry}
                        onChange={(e) =>
                          setForm({ ...form, industry: e.target.value })
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="">选择行业...</option>
                        <option value="AI Compute Infrastructure">
                          AI算力基础设施
                        </option>
                        <option value="Cloud Services">云服务</option>
                        <option value="Semiconductor">半导体</option>
                        <option value="Electric Vehicles">新能源汽车</option>
                        <option value="Fintech">金融科技</option>
                        <option value="E-commerce">电子商务</option>
                        <option value="SaaS">SaaS软件</option>
                        <option value="Gaming">游戏</option>
                        <option value="Healthcare">医疗健康</option>
                        <option value="Custom">自定义...</option>
                      </select>
                      {form.industry === 'Custom' && (
                        <input
                          type="text"
                          placeholder="输入自定义行业"
                          className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none"
                          onChange={(e) =>
                            setForm({ ...form, industry: e.target.value })
                          }
                        />
                      )}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        区域/市场
                      </label>
                      <select
                        value={form.region}
                        onChange={(e) =>
                          setForm({ ...form, region: e.target.value })
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="Global">全球</option>
                        <option value="China">中国</option>
                        <option value="US">美国</option>
                        <option value="Europe">欧洲</option>
                        <option value="Asia Pacific">亚太</option>
                        <option value="Southeast Asia">东南亚</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI辅助分析 */}
              <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
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
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        AI 智能分析
                      </h3>
                      <p className="text-xs text-gray-600">
                        根据行业和区域，AI将自动分析竞争格局、推荐竞争对手、建议角色配置
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => void aiAssistAnalyze()}
                    disabled={aiAssisting || !form.industry}
                    className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:from-indigo-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {aiAssisting ? (
                      <>
                        <svg
                          className="h-4 w-4 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        分析中...
                      </>
                    ) : (
                      <>
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
                            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                          />
                        </svg>
                        开始AI分析
                      </>
                    )}
                  </button>
                </div>

                {/* AI洞察展示 */}
                {aiSuggestions?.insights &&
                  aiSuggestions.insights.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                        行业洞察
                      </h4>
                      <div className="space-y-1.5">
                        {aiSuggestions.insights.map((insight, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 rounded-lg bg-white/60 px-3 py-2 text-sm text-gray-700"
                          >
                            <svg
                              className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-500"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span>{insight}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>

              {/* 推演目标 */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                      2
                    </span>
                    推演目标
                  </h3>
                  {aiSuggestions?.goals && (
                    <button
                      onClick={adoptAiGoals}
                      className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
                    >
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
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      采纳AI建议
                    </button>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                      市场目标
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-600">
                        份额
                      </span>
                    </label>
                    <input
                      type="text"
                      value={form.goals.targetShare || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          goals: { ...form.goals, targetShare: e.target.value },
                        })
                      }
                      placeholder="例如：守住份额并提升交付速度"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                      风险/合规
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">
                        风险
                      </span>
                    </label>
                    <input
                      type="text"
                      value={form.goals.risk || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          goals: { ...form.goals, risk: e.target.value },
                        })
                      }
                      placeholder="例如：控制合规与供应链黑天鹅"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                      增长目标
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-600">
                        增长
                      </span>
                    </label>
                    <input
                      type="text"
                      value={form.goals.growth || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          goals: { ...form.goals, growth: e.target.value },
                        })
                      }
                      placeholder="例如：拉高算力利用率与现金流效率"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                      自定义目标
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                        其他
                      </span>
                    </label>
                    <input
                      type="text"
                      value={form.goals.custom || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          goals: { ...form.goals, custom: e.target.value },
                        })
                      }
                      placeholder="补充其他目标或约束条件"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* 验证提示 */}
              {!isStepValid('basic') && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <svg
                    className="h-4 w-4 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span>请填写场景名称和行业后再进入下一步</span>
                </div>
              )}
            </div>
          )}

          {/* Companies Tab */}
          {activeTab === 'companies' && (
            <div className="mx-auto max-w-4xl space-y-5">
              {/* Header Actions */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    参与公司配置
                  </h3>
                  <p className="text-xs text-gray-500">
                    配置参与推演的公司及其量化指标（现金/份额/产能/库存等）
                  </p>
                </div>
                <div className="flex gap-2">
                  {aiSuggestions?.companies &&
                    aiSuggestions.companies.length > 0 && (
                      <button
                        onClick={adoptAiCompanies}
                        className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
                      >
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
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        采纳AI推荐 ({aiSuggestions.companies.length})
                      </button>
                    )}
                  <button
                    onClick={() => void fetchExternal()}
                    disabled={syncing}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
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
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    {syncing ? '同步中...' : '同步外部数据'}
                  </button>
                  <button
                    onClick={() => void injectFromMarket()}
                    disabled={aiAssisting || !form.industry}
                    className="flex items-center gap-1.5 rounded-lg border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-all hover:from-purple-100 hover:to-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                    title={
                      !form.industry ? '请先填写行业' : 'AI根据行业智能推荐公司'
                    }
                  >
                    {aiAssisting ? (
                      <>
                        <svg
                          className="h-3.5 w-3.5 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        AI分析中...
                      </>
                    ) : (
                      <>
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
                        AI智能推荐
                      </>
                    )}
                  </button>
                  <button
                    onClick={addCompany}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
                  >
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
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    添加公司
                  </button>
                </div>
              </div>

              {/* AI推荐展示 */}
              {aiSuggestions?.companies &&
                aiSuggestions.companies.length > 0 && (
                  <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 p-4">
                    <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
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
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      AI推荐的竞争对手
                    </h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {aiSuggestions.companies.map((c, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2"
                        >
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {c.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {c.type} · {c.market}
                            </div>
                          </div>
                          <span className="text-xs text-indigo-600">
                            {c.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* 外部数据同步提示 */}
              {external && (
                <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-sm font-medium text-blue-700">
                      外部数据已同步
                    </span>
                  </div>
                  <button
                    onClick={() => void injectFromMarket()}
                    disabled={aiAssisting}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {aiAssisting ? 'AI分析中...' : 'AI智能填充公司'}
                  </button>
                </div>
              )}

              {/* 公司列表 */}
              <div className="space-y-6">
                {companies.map((c, idx) => (
                  <CompanyCard
                    key={idx}
                    index={idx}
                    company={c}
                    industry={form.industry}
                    onUpdate={(value) => updateCompany(idx, value)}
                    onRemove={() => removeCompany(idx)}
                  />
                ))}
                {companies.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
                    <svg
                      className="mx-auto h-10 w-10 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                      />
                    </svg>
                    <h4 className="mt-3 text-sm font-medium text-gray-900">
                      暂无公司
                    </h4>
                    <p className="mt-1 text-xs text-gray-500">
                      点击上方"添加公司"或使用AI推荐
                    </p>
                  </div>
                )}
              </div>

              {/* 验证提示 */}
              {!isStepValid('companies') && companies.length > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <svg
                    className="h-4 w-4 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span>请确保所有公司都填写了名称和类型</span>
                </div>
              )}
            </div>
          )}

          {/* Agents Tab */}
          {activeTab === 'agents' && (
            <div className="mx-auto max-w-4xl space-y-5">
              {/* Header */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    AI 角色配置
                  </h3>
                  <p className="text-xs text-gray-500">
                    配置蓝军、红军、绿军、白方角色
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* AI智能配置按钮 */}
                  <button
                    onClick={() => void aiAssistAgents()}
                    disabled={aiAgentAssisting}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50"
                    title="AI智能推荐角色"
                  >
                    {aiAgentAssisting ? (
                      <svg
                        className="h-3.5 w-3.5 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                    ) : (
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
                    )}
                    AI推荐
                  </button>
                  {/* 去重按钮 - 只在有多余角色时显示 */}
                  {agents.length > 3 && (
                    <button
                      onClick={cleanupAgents}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
                      title="清理重复和无效角色"
                    >
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
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                  {/* 添加角色按钮 */}
                  <button
                    onClick={addAgent}
                    className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
                    title="添加新角色"
                  >
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
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    添加
                  </button>
                </div>
              </div>

              {/* AI智能推荐的角色 */}
              {aiAgentSuggestions && aiAgentSuggestions.length > 0 && (
                <div className="rounded-xl border-2 border-purple-200 bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-purple-700">
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
                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                        />
                      </svg>
                      AI推荐对手角色
                    </h4>
                    <div className="flex gap-2">
                      <button
                        onClick={adoptAiAgentSuggestions}
                        className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-700"
                      >
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
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        全部采纳
                      </button>
                      <button
                        onClick={() => setAiAgentSuggestions(null)}
                        className="rounded-lg px-2 py-1.5 text-xs text-gray-500 hover:bg-white/50"
                      >
                        忽略
                      </button>
                    </div>
                  </div>
                  <p className="mb-3 text-xs text-gray-600">
                    根据您配置的蓝军角色和行业特点，AI推荐以下对手角色以构建完整的对抗推演：
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {aiAgentSuggestions.map((a, idx) => {
                      const teamColors: Record<
                        string,
                        {
                          bg: string;
                          border: string;
                          text: string;
                          dot: string;
                        }
                      > = {
                        RED: {
                          bg: 'bg-red-50',
                          border: 'border-red-200',
                          text: 'text-red-700',
                          dot: 'bg-red-500',
                        },
                        GREEN: {
                          bg: 'bg-green-50',
                          border: 'border-green-200',
                          text: 'text-green-700',
                          dot: 'bg-green-500',
                        },
                        WHITE: {
                          bg: 'bg-gray-50',
                          border: 'border-gray-200',
                          text: 'text-gray-700',
                          dot: 'bg-gray-500',
                        },
                        CHAOS: {
                          bg: 'bg-purple-50',
                          border: 'border-purple-200',
                          text: 'text-purple-700',
                          dot: 'bg-purple-500',
                        },
                        BLUE: {
                          bg: 'bg-blue-50',
                          border: 'border-blue-200',
                          text: 'text-blue-700',
                          dot: 'bg-blue-500',
                        },
                      };
                      const colors = teamColors[a.team] || teamColors.RED;
                      return (
                        <div
                          key={idx}
                          className={`rounded-lg border ${colors.border} ${colors.bg} p-3`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${colors.dot}`}
                            />
                            <span
                              className={`text-xs font-semibold ${colors.text}`}
                            >
                              {a.team === 'RED'
                                ? '红军'
                                : a.team === 'GREEN'
                                  ? '绿军'
                                  : a.team === 'WHITE'
                                    ? '白方'
                                    : a.team === 'CHAOS'
                                      ? 'Chaos'
                                      : '蓝军'}
                            </span>
                          </div>
                          <div className="mt-1 font-medium text-gray-900">
                            {a.role}
                          </div>
                          {a.companyName && (
                            <div className="mt-0.5 text-xs text-gray-500">
                              {a.companyName}
                            </div>
                          )}
                          <div className="mt-2 text-xs text-gray-600">
                            {a.reason}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 角色列表 */}
              <div className="space-y-6">
                {agents.map((a, idx) => (
                  <AgentCard
                    key={idx}
                    index={idx}
                    agent={a}
                    companies={companies}
                    teamColors={teamColors}
                    onUpdate={(value) => updateAgent(idx, value)}
                    onRemove={() => removeAgent(idx)}
                  />
                ))}
                {agents.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
                    <svg
                      className="mx-auto h-10 w-10 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    <h4 className="mt-3 text-sm font-medium text-gray-900">
                      暂无角色
                    </h4>
                    <p className="mt-1 text-xs text-gray-500">
                      点击"AI推荐"或"添加"按钮配置角色
                    </p>
                  </div>
                )}
              </div>

              {/* 验证提示 */}
              {!isStepValid('agents') && agents.length > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <svg
                    className="h-4 w-4 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span>请确保所有角色都填写了名称和所属阵营</span>
                </div>
              )}
            </div>
          )}

          {/* Params Tab */}
          {activeTab === 'params' && (
            <div className="mx-auto max-w-3xl space-y-6">
              {/* AI辅助推荐参数 */}
              <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
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
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        AI 智能推荐参数
                      </h3>
                      <p className="text-xs text-gray-600">
                        根据行业特征、公司数量、角色配置，AI推荐最优推演参数
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => void aiAssistParams()}
                    disabled={aiParamsAssisting || !form.industry}
                    className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:from-indigo-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {aiParamsAssisting ? (
                      <>
                        <svg
                          className="h-4 w-4 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        分析中...
                      </>
                    ) : (
                      <>
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
                            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                          />
                        </svg>
                        AI推荐参数
                      </>
                    )}
                  </button>
                </div>

                {/* AI推荐结果展示 */}
                {aiParamsSuggestions && (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg bg-white/80 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                          AI推荐配置
                        </h4>
                        <button
                          onClick={adoptAiParamsSuggestions}
                          className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
                        >
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
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          采纳建议
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg bg-gray-50 px-3 py-2">
                          <div className="text-xs text-gray-500">盲注模式</div>
                          <div className="text-sm font-medium text-gray-900">
                            {aiParamsSuggestions.blindMove ? '开启' : '关闭'}
                          </div>
                        </div>
                        <div className="rounded-lg bg-gray-50 px-3 py-2">
                          <div className="text-xs text-gray-500">CoT推理</div>
                          <div className="text-sm font-medium text-gray-900">
                            {aiParamsSuggestions.cot ? '开启' : '关闭'}
                          </div>
                        </div>
                        <div className="rounded-lg bg-gray-50 px-3 py-2">
                          <div className="text-xs text-gray-500">推荐轮数</div>
                          <div className="text-sm font-medium text-gray-900">
                            {aiParamsSuggestions.rounds}轮
                          </div>
                        </div>
                        <div className="rounded-lg bg-purple-50 px-3 py-2">
                          <div className="text-xs text-purple-600">
                            黑天鹅概率
                          </div>
                          <div className="text-sm font-medium text-purple-700">
                            {Math.round(aiParamsSuggestions.chaosProb * 100)}%
                          </div>
                        </div>
                        <div className="rounded-lg bg-orange-50 px-3 py-2">
                          <div className="text-xs text-orange-600">
                            非理性概率
                          </div>
                          <div className="text-sm font-medium text-orange-700">
                            {Math.round(
                              aiParamsSuggestions.irrationalProb * 100
                            )}
                            %
                          </div>
                        </div>
                        <div className="rounded-lg bg-blue-50 px-3 py-2">
                          <div className="text-xs text-blue-600">
                            人工介入间隔
                          </div>
                          <div className="text-sm font-medium text-blue-700">
                            每{aiParamsSuggestions.humanBreakEvery}轮
                          </div>
                        </div>
                      </div>
                      {aiParamsSuggestions.enabledEvents.length > 0 && (
                        <div className="mt-3">
                          <div className="mb-1.5 text-xs text-gray-500">
                            推荐启用的事件类型
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {aiParamsSuggestions.enabledEvents.map((event) => (
                              <span
                                key={event}
                                className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700"
                              >
                                {event === 'supply_chain' && '供应链'}
                                {event === 'regulation' && '监管政策'}
                                {event === 'competitor' && '竞争对手'}
                                {event === 'customer' && '客户变动'}
                                {event === 'media' && '媒体曝光'}
                                {event === 'tech' && '技术变革'}
                                {event === 'finance' && '金融波动'}
                                {event === 'talent' && '人才变动'}
                                {event === 'disaster' && '自然灾害'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-3 flex items-start gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                        <svg
                          className="mt-0.5 h-4 w-4 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span>{aiParamsSuggestions.reasoning}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 对战机制 */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                    1
                  </span>
                  对战机制
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50">
                    <input
                      type="checkbox"
                      checked={form.constraints.blindMove}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          constraints: {
                            ...form.constraints,
                            blindMove: e.target.checked,
                          },
                        })
                      }
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        盲注模式
                      </div>
                      <div className="text-xs text-gray-500">
                        各方同时提交决策，不知道对手行动
                      </div>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50">
                    <input
                      type="checkbox"
                      checked={form.constraints.cot}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          constraints: {
                            ...form.constraints,
                            cot: e.target.checked,
                          },
                        })
                      }
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        强制 CoT 推理
                      </div>
                      <div className="text-xs text-gray-500">
                        要求AI展示推理过程（内心独白）
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* 随机性参数 */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                    2
                  </span>
                  随机性与不确定性
                </h3>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">
                        黑天鹅概率
                      </label>
                      <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                        {Math.round(form.constraints.chaosProb * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={form.constraints.chaosProb}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          constraints: {
                            ...form.constraints,
                            chaosProb: parseFloat(e.target.value),
                          },
                        })
                      }
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-purple-600"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      每轮触发黑天鹅事件的概率
                    </p>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">
                        非理性决策概率
                      </label>
                      <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                        {Math.round(form.constraints.irrationalProb * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={form.constraints.irrationalProb}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          constraints: {
                            ...form.constraints,
                            irrationalProb: parseFloat(e.target.value),
                          },
                        })
                      }
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-orange-600"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Agent做出非理性/情绪化决策的概率
                    </p>
                  </div>
                </div>
              </div>

              {/* 事件库 */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                    3
                  </span>
                  黑天鹅事件库
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-600">
                    基于行业: {form.industry || '未选择'}
                  </span>
                </h3>
                <p className="mb-3 text-xs text-gray-500">
                  选择可能在推演中触发的事件类型
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    {
                      id: 'supply_chain',
                      label: '供应链中断',
                      icon: '🚢',
                      desc: '关键零部件短缺、物流受阻',
                    },
                    {
                      id: 'regulation',
                      label: '监管政策变化',
                      icon: '⚖️',
                      desc: '出口管制、反垄断调查',
                    },
                    {
                      id: 'competitor',
                      label: '竞争对手突袭',
                      icon: '⚔️',
                      desc: '价格战、挖角、专利诉讼',
                    },
                    {
                      id: 'customer',
                      label: '客户变动',
                      icon: '👥',
                      desc: '大单签约/解约、客户流失',
                    },
                    {
                      id: 'media',
                      label: '媒体曝光',
                      icon: '📰',
                      desc: '负面新闻、ESG危机',
                    },
                    {
                      id: 'tech',
                      label: '技术突破/故障',
                      icon: '💡',
                      desc: '技术泄露、产品缺陷',
                    },
                    {
                      id: 'finance',
                      label: '金融市场波动',
                      icon: '📈',
                      desc: '汇率、利率、融资环境',
                    },
                    {
                      id: 'talent',
                      label: '人才变动',
                      icon: '👔',
                      desc: '高管离职、团队流失',
                    },
                    {
                      id: 'disaster',
                      label: '自然灾害',
                      icon: '🌪️',
                      desc: '地震、洪水、疫情',
                    },
                  ].map((event) => (
                    <label
                      key={event.id}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 px-3 py-2 transition-colors hover:border-purple-300 hover:bg-purple-50/50"
                    >
                      <input
                        type="checkbox"
                        defaultChecked={[
                          'supply_chain',
                          'regulation',
                          'competitor',
                        ].includes(event.id)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <div>
                        <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
                          <span>{event.icon}</span>
                          {event.label}
                        </div>
                        <div className="text-xs text-gray-500">
                          {event.desc}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* 人类介入 */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                    4
                  </span>
                  人类介入 (Human-in-the-Loop)
                </h3>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      自动暂停间隔
                    </label>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600">每</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={form.constraints.humanBreakEvery}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            constraints: {
                              ...form.constraints,
                              humanBreakEvery:
                                parseInt(e.target.value, 10) || 2,
                            },
                          })
                        }
                        className="w-16 rounded-lg border border-gray-300 px-3 py-2 text-center text-sm focus:border-indigo-500 focus:outline-none"
                      />
                      <span className="text-sm text-gray-600">轮暂停一次</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      推演将在指定轮次后暂停，等待人类审核和干预
                    </p>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      推演总轮数
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        max={20}
                        defaultValue={4}
                        className="w-16 rounded-lg border border-gray-300 px-3 py-2 text-center text-sm focus:border-indigo-500 focus:outline-none"
                      />
                      <span className="text-sm text-gray-600">轮</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      建议 4-6 轮，每轮代表一个决策周期
                    </p>
                  </div>
                </div>
              </div>

              {/* 裁判规则 */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                    5
                  </span>
                  裁判系统配置
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        外部数据验证
                      </div>
                      <div className="text-xs text-gray-500">
                        裁判将使用真实外部数据验证行动可行性
                      </div>
                    </div>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      已启用
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        证据链记录
                      </div>
                      <div className="text-xs text-gray-500">
                        每次判定记录数据来源、时间戳、置信度
                      </div>
                    </div>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      已启用
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        行动驳回
                      </div>
                      <div className="text-xs text-gray-500">
                        裁判可驳回不可行的行动（资金/时间/合规不足）
                      </div>
                    </div>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      已启用
                    </span>
                  </div>
                </div>
              </div>

              {/* 状态显示 */}
              {(scenario?.id || runId) && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                  <h3 className="mb-2 text-sm font-semibold text-indigo-900">
                    当前状态
                  </h3>
                  <div className="space-y-1 text-sm text-indigo-700">
                    {scenario?.id && (
                      <p>
                        场景 ID:{' '}
                        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                          {scenario.id}
                        </code>
                      </p>
                    )}
                    {runId && (
                      <p>
                        运行 ID:{' '}
                        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                          {runId}
                        </code>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions - 向导式导航 */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-gradient-to-r from-gray-50 to-indigo-50/30 px-6 py-4">
          {/* 左侧：当前步骤状态 */}
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500">
              步骤 {tabs.findIndex((t) => t.id === activeTab) + 1} /{' '}
              {tabs.length}
            </div>
            <div className="h-4 w-px bg-gray-300" />
            <div className="text-xs text-gray-600">
              {activeTab === 'basic' &&
                (isStepValid('basic')
                  ? '✓ 基本信息已完成'
                  : '请填写场景名称和行业')}
              {activeTab === 'companies' && `已配置 ${companies.length} 家公司`}
              {activeTab === 'agents' && `已配置 ${agents.length} 个角色`}
              {activeTab === 'params' && '配置对战机制和随机性参数'}
            </div>
          </div>

          {/* 右侧：导航和操作按钮 */}
          <div className="flex items-center gap-3">
            {/* 上一步 */}
            {activeTab !== 'basic' && (
              <button
                onClick={goToPrevStep}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
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
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                上一步
              </button>
            )}

            {/* 取消 */}
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
              取消
            </button>

            {/* 下一步 / 保存 */}
            {activeTab !== 'params' ? (
              <button
                onClick={goToNextStep}
                disabled={activeTab === 'basic' && !isStepValid('basic')}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                下一步
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
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            ) : (
              <>
                <button
                  onClick={() => void saveScenario()}
                  disabled={saving || !form.name || !form.industry}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存场景'}
                </button>
                {scenario?.id && (
                  <button
                    onClick={() => void startRun()}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-purple-500/25 transition-all hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50"
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
                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    开始推演
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function safeJson(input: string | object | null | undefined, fallback: any) {
  if (input === null || input === undefined) {
    return fallback;
  }
  // If input is already an object, return it directly
  if (typeof input === 'object') {
    return input;
  }
  // If input is a string, try to parse it
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}

// Agent卡片组件 - 完整Persona配置（基于PRD）
function AgentCard({
  index,
  agent,
  companies,
  teamColors,
  onUpdate,
  onRemove,
}: {
  index: number;
  agent: ScenarioFormAgent;
  companies: ScenarioFormCompany[];
  teamColors: Record<string, string>;
  onUpdate: (value: ScenarioFormAgent) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // 解析persona JSON - 使用useMemo确保响应式更新
  const persona = useMemo(() => {
    return agent.persona ? safeJson(agent.persona, {}) : {};
  }, [agent.persona]);

  const updatePersona = (key: string, value: any) => {
    const newPersona = { ...persona, [key]: value };
    onUpdate({ ...agent, persona: JSON.stringify(newPersona) });
  };

  const teamInfo: Record<
    string,
    { label: string; color: string; bgColor: string; icon: string }
  > = {
    BLUE: {
      label: '蓝军',
      color: 'text-blue-700',
      bgColor: 'bg-blue-100',
      icon: '🔵',
    },
    RED: {
      label: '红军',
      color: 'text-red-700',
      bgColor: 'bg-red-100',
      icon: '🔴',
    },
    GREEN: {
      label: '绿军',
      color: 'text-green-700',
      bgColor: 'bg-green-100',
      icon: '🟢',
    },
    WHITE: {
      label: '白方',
      color: 'text-gray-700',
      bgColor: 'bg-gray-100',
      icon: '⚪',
    },
    CHAOS: {
      label: 'Chaos',
      color: 'text-purple-700',
      bgColor: 'bg-purple-100',
      icon: '🟣',
    },
  };

  const currentTeam = teamInfo[agent.team] || teamInfo.BLUE;

  // 边框颜色映射
  const borderColorMap: Record<string, string> = {
    BLUE: 'border-blue-200',
    RED: 'border-red-200',
    GREEN: 'border-green-200',
    WHITE: 'border-gray-200',
    CHAOS: 'border-purple-200',
  };

  return (
    <div
      className={`rounded-xl border bg-white shadow-sm transition-all hover:shadow-md ${
        borderColorMap[agent.team] || 'border-gray-200'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-4 p-4">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg ${currentTeam.bgColor}`}
        >
          {currentTeam.icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <select
              value={agent.team}
              onChange={(e) =>
                onUpdate({
                  ...agent,
                  team: e.target.value as ScenarioFormAgent['team'],
                })
              }
              className={`rounded-lg border-none px-2 py-1 text-xs font-semibold ${currentTeam.bgColor} ${currentTeam.color} focus:outline-none focus:ring-1 focus:ring-indigo-500`}
            >
              <option value="BLUE">🔵 蓝军</option>
              <option value="RED">🔴 红军</option>
              <option value="GREEN">🟢 绿军</option>
              <option value="WHITE">⚪ 白方</option>
              <option value="CHAOS">🟣 Chaos</option>
            </select>
            <input
              value={agent.role}
              onChange={(e) => onUpdate({ ...agent, role: e.target.value })}
              placeholder="角色名称 (如 CEO、CFO、监管官)"
              className="flex-1 border-none bg-transparent text-sm font-semibold text-gray-900 placeholder-gray-400 focus:outline-none"
            />
          </div>
          <div className="mt-1 flex items-center gap-2">
            <select
              value={agent.companyName || ''}
              onChange={(e) =>
                onUpdate({ ...agent, companyName: e.target.value })
              }
              className="rounded border-none bg-gray-100 px-2 py-0.5 text-xs text-gray-600 focus:outline-none"
            >
              <option value="">无所属公司</option>
              {companies.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            {persona.riskTolerance !== undefined && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  persona.riskTolerance > 70
                    ? 'bg-red-100 text-red-700'
                    : persona.riskTolerance > 40
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-green-100 text-green-700'
                }`}
              >
                风险偏好: {persona.riskTolerance}%
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              expanded
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {expanded ? '收起' : '展开Persona'}
            <svg
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <button
            onClick={onRemove}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded - Persona详情 */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 p-4">
          {/* 性格与偏见 */}
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-indigo-100 text-indigo-600">
                🎭
              </span>
              性格与偏见
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  性格特征
                </label>
                <input
                  type="text"
                  value={persona.traits || ''}
                  onChange={(e) => updatePersona('traits', e.target.value)}
                  placeholder="如：激进派、保守稳健、机会主义者"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  偏见/倾向
                </label>
                <input
                  type="text"
                  value={persona.biases || ''}
                  onChange={(e) => updatePersona('biases', e.target.value)}
                  placeholder="如：偏好短期收益、风险规避、市场份额优先"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 压力与时间偏好 */}
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-orange-100 text-orange-600">
                ⏱️
              </span>
              压力源与时间偏好
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  压力源
                </label>
                <input
                  type="text"
                  value={persona.pressure || ''}
                  onChange={(e) => updatePersona('pressure', e.target.value)}
                  placeholder="如：财报压力、融资需求、竞争对手威胁"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  时间偏好
                </label>
                <select
                  value={persona.timePref || ''}
                  onChange={(e) => updatePersona('timePref', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">选择时间偏好...</option>
                  <option value="短期">短期 (0-6个月)</option>
                  <option value="中期">中期 (6-18个月)</option>
                  <option value="长期">长期 (18个月以上)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 风险与合规 */}
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-red-100 text-red-600">
                ⚠️
              </span>
              风险容忍度与合规度
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs text-gray-500">风险容忍度</label>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      (persona.riskTolerance || 50) > 70
                        ? 'bg-red-100 text-red-700'
                        : (persona.riskTolerance || 50) > 40
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {persona.riskTolerance || 50}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={persona.riskTolerance || 50}
                  onChange={(e) =>
                    updatePersona('riskTolerance', parseInt(e.target.value))
                  }
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-red-600"
                />
                <div className="mt-1 flex justify-between text-xs text-gray-400">
                  <span>保守</span>
                  <span>激进</span>
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs text-gray-500">合规度</label>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      (persona.compliance || 50) > 70
                        ? 'bg-green-100 text-green-700'
                        : (persona.compliance || 50) > 40
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {persona.compliance || 50}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={persona.compliance || 50}
                  onChange={(e) =>
                    updatePersona('compliance', parseInt(e.target.value))
                  }
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-green-600"
                />
                <div className="mt-1 flex justify-between text-xs text-gray-400">
                  <span>灵活</span>
                  <span>严格</span>
                </div>
              </div>
            </div>
          </div>

          {/* 私有记忆 */}
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-gray-600">
                🔒
              </span>
              私有记忆（仅该角色可见）
            </h4>
            <textarea
              value={
                typeof agent.memoryPrivate === 'object'
                  ? JSON.stringify(agent.memoryPrivate, null, 2)
                  : agent.memoryPrivate || ''
              }
              onChange={(e) =>
                onUpdate({ ...agent, memoryPrivate: e.target.value })
              }
              placeholder="该角色独有的隐藏信息，如：资金链紧张、内部矛盾、即将离职..."
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* AI提示 */}
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-600">
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
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              Persona配置影响AI的决策风格。风险容忍度高+合规度低的角色更可能做出激进决策
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// 公司卡片组件 - 完整Company要素（基于PRD）
function CompanyCard({
  index,
  company,
  industry,
  onUpdate,
  onRemove,
}: {
  index: number;
  company: ScenarioFormCompany;
  industry: string;
  onUpdate: (value: ScenarioFormCompany) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{
    metrics: any;
    reasoning: string;
    dataSource?: string; // 数据来源标识
  } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // 从metrics中获取值，提供默认值
  const metrics = company.metrics || {};

  const updateMetrics = (key: string, value: any) => {
    onUpdate({
      ...company,
      metrics: { ...metrics, [key]: value },
    });
  };

  // AI辅助生成指标
  const handleAiAssist = async () => {
    if (!company.name || !company.type) {
      alert('请先填写公司名称和类型');
      return;
    }

    setAiLoading(true);
    try {
      const res = await fetch(
        `${config.apiUrl}/simulation/ai-assist/generate-metrics`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({
            companyName: company.name,
            companyType: company.type,
            industry: industry,
            market: company.market,
          }),
        }
      );

      if (!res.ok) throw new Error('AI生成失败');

      const data = await res.json();
      setAiSuggestion(data);
      setShowConfirmDialog(true);
    } catch (err) {
      console.error('AI assist error:', err);
      alert('AI生成失败，请重试');
    } finally {
      setAiLoading(false);
    }
  };

  // 确认应用AI建议
  const applyAiSuggestion = () => {
    if (aiSuggestion) {
      onUpdate({
        ...company,
        metrics: aiSuggestion.metrics,
      });
      setShowConfirmDialog(false);
      setAiSuggestion(null);
      setExpanded(true); // 展开查看结果
    }
  };

  const companyTypes = [
    {
      value: 'benchmark',
      label: '行业标杆',
      color: 'bg-blue-100 text-blue-700',
    },
    {
      value: 'startup',
      label: '初创公司',
      color: 'bg-green-100 text-green-700',
    },
    {
      value: 'regional',
      label: '区域龙头',
      color: 'bg-purple-100 text-purple-700',
    },
    {
      value: 'challenger',
      label: '挑战者',
      color: 'bg-orange-100 text-orange-700',
    },
    {
      value: 'competitor',
      label: '竞争对手',
      color: 'bg-red-100 text-red-700',
    },
    {
      value: 'customer',
      label: '客户/市场',
      color: 'bg-cyan-100 text-cyan-700',
    },
    {
      value: 'supplier',
      label: '供应商',
      color: 'bg-teal-100 text-teal-700',
    },
    {
      value: 'regulatory',
      label: '监管机构',
      color: 'bg-gray-100 text-gray-700',
    },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md">
      {/* Header - 始终显示 */}
      <div className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-semibold text-white">
          {index + 1}
        </div>
        <div className="flex-1">
          <input
            value={company.name}
            onChange={(e) => onUpdate({ ...company, name: e.target.value })}
            placeholder="公司名称"
            className="w-full border-none bg-transparent text-base font-semibold text-gray-900 placeholder-gray-400 focus:outline-none"
          />
          <div className="mt-1 flex items-center gap-2">
            <select
              value={company.type}
              onChange={(e) => onUpdate({ ...company, type: e.target.value })}
              className="rounded border-none bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">选择类型...</option>
              {companyTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">·</span>
            <input
              value={company.market}
              onChange={(e) => onUpdate({ ...company, market: e.target.value })}
              placeholder="市场区域"
              className="w-24 border-none bg-transparent text-xs text-gray-500 placeholder-gray-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* AI辅助按钮 */}
          <button
            onClick={handleAiAssist}
            disabled={aiLoading}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              aiLoading
                ? 'cursor-wait bg-purple-100 text-purple-400'
                : 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600'
            }`}
            title="AI辅助生成量化指标"
          >
            {aiLoading ? (
              <>
                <svg
                  className="h-3.5 w-3.5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                生成中...
              </>
            ) : (
              <>
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
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                AI生成
              </>
            )}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              expanded
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {expanded ? '收起' : '展开量化指标'}
            <svg
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <button
            onClick={onRemove}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* AI确认对话框 */}
      {showConfirmDialog && aiSuggestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
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
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  AI生成的指标建议
                </h3>
                <p className="text-sm text-gray-500">{company.name}</p>
              </div>
            </div>

            {/* 数据来源标识 */}
            {aiSuggestion.dataSource && (
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    aiSuggestion.dataSource.includes('External')
                      ? 'bg-green-100 text-green-700'
                      : aiSuggestion.dataSource.includes('LLM')
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  📊 {aiSuggestion.dataSource}
                </span>
              </div>
            )}

            {/* AI推理说明 */}
            <div className="mb-4 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-700">
              <span className="font-medium">AI分析：</span>{' '}
              {aiSuggestion.reasoning}
            </div>

            {/* 指标预览 */}
            <div className="mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">现金储备</span>
                  <p className="font-semibold text-gray-900">
                    ${aiSuggestion.metrics.cash?.toLocaleString()}万
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">市场份额</span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.share}%
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">毛利率</span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.margin}%
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">负债</span>
                  <p className="font-semibold text-gray-900">
                    ${aiSuggestion.metrics.debt?.toLocaleString()}万
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">产能</span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.capacity?.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">库存</span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.inventory?.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">价格定位</span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.priceBand}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">交付周期</span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.delivery}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">专利数量</span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.patents?.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">渠道</span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.channels}
                  </p>
                </div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  setAiSuggestion(null);
                }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={applyAiSuggestion}
                className="flex-1 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:from-purple-600 hover:to-indigo-700"
              >
                应用建议
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded - 量化指标详情 */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 p-4">
          {/* 核心财务指标 */}
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-green-100 text-green-600">
                $
              </span>
              核心财务指标
            </h4>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  现金 (万美元)
                </label>
                <input
                  type="number"
                  value={metrics.cash || ''}
                  onChange={(e) =>
                    updateMetrics('cash', parseFloat(e.target.value) || 0)
                  }
                  placeholder="10000"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  市场份额 (%)
                </label>
                <input
                  type="number"
                  value={metrics.share || ''}
                  onChange={(e) =>
                    updateMetrics('share', parseFloat(e.target.value) || 0)
                  }
                  placeholder="15"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  毛利率 (%)
                </label>
                <input
                  type="number"
                  value={metrics.margin || ''}
                  onChange={(e) =>
                    updateMetrics('margin', parseFloat(e.target.value) || 0)
                  }
                  placeholder="35"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  负债 (万美元)
                </label>
                <input
                  type="number"
                  value={metrics.debt || ''}
                  onChange={(e) =>
                    updateMetrics('debt', parseFloat(e.target.value) || 0)
                  }
                  placeholder="5000"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 运营指标 */}
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-100 text-blue-600">
                ⚡
              </span>
              运营指标
            </h4>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  产能 (单位)
                </label>
                <input
                  type="number"
                  value={metrics.capacity || ''}
                  onChange={(e) =>
                    updateMetrics('capacity', parseFloat(e.target.value) || 0)
                  }
                  placeholder="1000"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  库存 (单位)
                </label>
                <input
                  type="number"
                  value={metrics.inventory || ''}
                  onChange={(e) =>
                    updateMetrics('inventory', parseFloat(e.target.value) || 0)
                  }
                  placeholder="200"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  价格带
                </label>
                <input
                  type="text"
                  value={metrics.priceBand || ''}
                  onChange={(e) => updateMetrics('priceBand', e.target.value)}
                  placeholder="高端/中端/低端"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  交付周期
                </label>
                <input
                  type="text"
                  value={metrics.delivery || ''}
                  onChange={(e) => updateMetrics('delivery', e.target.value)}
                  placeholder="2-4周"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 护城河指标 */}
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-purple-100 text-purple-600">
                🏰
              </span>
              护城河
            </h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  专利数量
                </label>
                <input
                  type="number"
                  value={metrics.patents || ''}
                  onChange={(e) =>
                    updateMetrics('patents', parseInt(e.target.value) || 0)
                  }
                  placeholder="50"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  渠道优势
                </label>
                <input
                  type="text"
                  value={metrics.channels || ''}
                  onChange={(e) => updateMetrics('channels', e.target.value)}
                  placeholder="直销/代理/电商"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  品牌影响力
                </label>
                <select
                  value={metrics.brand || ''}
                  onChange={(e) => updateMetrics('brand', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">选择...</option>
                  <option value="global_leader">全球领导者</option>
                  <option value="strong">强势品牌</option>
                  <option value="growing">成长中</option>
                  <option value="niche">细分市场</option>
                  <option value="emerging">新兴品牌</option>
                </select>
              </div>
            </div>
          </div>

          {/* AI补充提示 */}
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-600">
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
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>提示：不确定的数据可留空，AI裁判将基于外部数据源补充</span>
          </div>
        </div>
      )}
    </div>
  );
}
