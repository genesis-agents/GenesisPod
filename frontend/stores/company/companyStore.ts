/**
 * 一人公司 OS · 跨路由共享状态（M0 原型，纯前端内存）。
 *
 * /marketplace（招人/采购）与 /me 我的团队（组队/任命/下任务）通过本 store 联动。
 * M0 不持久化：整页刷新即回到种子状态。真接后端见 design.md §7 M2。
 */

import { create } from 'zustand';
import {
  AGENT_LISTINGS,
  SKILL_LISTINGS,
  TOOL_LISTINGS,
  WORKFLOW_LISTINGS,
  findListing,
} from '@/components/marketplace/marketplace.mock';
import type {
  AgentListing,
  Seniority,
  WorkflowListing,
} from '@/components/marketplace/marketplace.types';

/** 可为 Agent 配置的模型档位（M0 展示名；真实走 TaskProfile/模型选择，不硬编码 provider）。 */
export const MODEL_OPTIONS = ['Opus', 'Sonnet', 'Haiku'] as const;

export interface HiredAgent {
  /** 每次招聘生成的唯一实例 id（同一 listing 可招多个） */
  instanceId: string;
  listingId: string;
  name: string;
  role: string;
  seniority: Seniority;
  avatarGradient: string;
  /** 模型 fallback 链（有序，第一个为主模型，后续为备用） */
  models: string[];
  /** 自动 fallback：主模型失败时按链顺序自动切换 */
  autoFallback: boolean;
  /** 已装配技能（listing id），初始 = listing 自带 */
  skillIds: string[];
  /** 已装配工具（listing id），初始 = listing 自带 */
  toolIds: string[];
}

export interface CompanyTeam {
  id: string;
  name: string;
  /** 成员 = HiredAgent.instanceId（含 leader） */
  memberIds: string[];
  leaderId: string | null;
  /** 套用的工作流 = TeamWorkflow.id */
  workflowId: string | null;
}

/** 工作流来源：market=从工作流市场获取（私有副本），custom=自建。 */
export type WorkflowOrigin = 'market' | 'custom';

/**
 * 团队工作流（私有）—— 市场获取的副本与自建的统一表示，名称/阶段/角色均可编辑。
 */
export interface TeamWorkflow {
  id: string;
  name: string;
  category: string;
  stages: string[];
  teamSize: number;
  roles: string[];
  origin: WorkflowOrigin;
  /** market 来源的市场 listing id（custom 则无） */
  sourceListingId?: string;
}

export type MissionStatus = 'queued' | 'running' | 'review' | 'done' | 'failed';

export interface CompanyMission {
  id: string;
  teamId: string;
  title: string;
  status: MissionStatus;
  /** 0–100 */
  progress: number;
  createdAt: number;
}

interface CompanyState {
  ceoId: string | null;
  hired: HiredAgent[];
  acquiredSkillIds: string[];
  acquiredToolIds: string[];
  teamWorkflows: TeamWorkflow[];
  teams: CompanyTeam[];
  missions: CompanyMission[];

  // ―― 市场采购 ――
  hireAgent: (listing: AgentListing) => string;
  fireAgent: (instanceId: string) => void;
  acquireSkill: (id: string) => void;
  acquireTool: (id: string) => void;
  acquireWorkflow: (id: string) => void;

  // ―― 工作流（市场副本 + 自建，统一可编辑）――
  addCustomWorkflow: () => string;
  renameWorkflow: (id: string, name: string) => void;
  updateWorkflow: (id: string, patch: Partial<TeamWorkflow>) => void;
  removeWorkflow: (id: string) => void;

  // ―― 团队编排 ――
  appointCeo: (instanceId: string | null) => void;
  createTeam: (name: string) => string;
  renameTeam: (teamId: string, name: string) => void;
  deleteTeam: (teamId: string) => void;
  addMember: (teamId: string, instanceId: string) => void;
  removeMember: (teamId: string, instanceId: string) => void;
  setLeader: (teamId: string, instanceId: string) => void;
  setWorkflow: (teamId: string, workflowId: string | null) => void;

  // ―― 成员装配 ――
  toggleAgentSkill: (instanceId: string, skillId: string) => void;
  toggleAgentTool: (instanceId: string, toolId: string) => void;
  setAgentModels: (instanceId: string, models: string[]) => void;
  setAgentAutoFallback: (instanceId: string, value: boolean) => void;

  // ―― 任务 ――
  createMission: (teamId: string, title: string) => string;
  setMissionProgress: (
    missionId: string,
    progress: number,
    status?: MissionStatus
  ) => void;
}

let seq = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${seq++}`;

function instanceFromListing(listing: AgentListing): HiredAgent {
  return {
    instanceId: uid('m'),
    listingId: listing.id,
    name: listing.name,
    role: listing.role,
    seniority: listing.seniority,
    avatarGradient: listing.avatarGradient,
    models: [listing.defaultModel],
    autoFallback: true,
    skillIds: [...listing.skillIds],
    toolIds: [...listing.toolIds],
  };
}

function toTeamWorkflow(w: WorkflowListing): TeamWorkflow {
  return {
    id: w.id,
    name: w.name,
    category: w.category,
    stages: [...w.stages],
    teamSize: w.teamSize,
    roles: [...w.roles],
    origin: 'market',
    sourceListingId: w.id,
  };
}

// ―― 种子数据：已招 4 人、1 个 CEO、2 个 Team、2 个进行中任务 ――
function seed() {
  const byId = (id: string) => AGENT_LISTINGS.find((a) => a.id === id)!;
  const ceo = instanceFromListing(byId('agent-murphy'));
  const luna = instanceFromListing(byId('agent-luna'));
  const quill = instanceFromListing(byId('agent-quill'));
  const ada = instanceFromListing(byId('agent-ada'));

  const teamA: CompanyTeam = {
    id: uid('t'),
    name: '内容组',
    memberIds: [quill.instanceId, luna.instanceId],
    leaderId: quill.instanceId,
    workflowId: 'wf-content-factory',
  };
  const teamB: CompanyTeam = {
    id: uid('t'),
    name: '研发组',
    memberIds: [ada.instanceId],
    leaderId: ada.instanceId,
    workflowId: 'wf-product-sprint',
  };

  const missions: CompanyMission[] = [
    {
      id: uid('ms'),
      teamId: teamA.id,
      title: '撰写本季度复盘',
      status: 'running',
      progress: 80,
      createdAt: Date.now() - 1000 * 60 * 42,
    },
    {
      id: uid('ms'),
      teamId: teamB.id,
      title: '调研竞品定价策略',
      status: 'running',
      progress: 40,
      createdAt: Date.now() - 1000 * 60 * 18,
    },
  ];

  return {
    ceoId: ceo.instanceId,
    hired: [ceo, luna, quill, ada],
    acquiredSkillIds: SKILL_LISTINGS.slice(0, 4).map((s) => s.id),
    acquiredToolIds: TOOL_LISTINGS.slice(0, 4).map((t) => t.id),
    teamWorkflows: WORKFLOW_LISTINGS.slice(0, 3).map(toTeamWorkflow),
    teams: [teamA, teamB],
    missions,
  };
}

export const useCompanyStore = create<CompanyState>((set) => ({
  ...seed(),

  hireAgent: (listing) => {
    const agent = instanceFromListing(listing);
    set((s) => ({
      hired: [...s.hired, agent],
      acquiredSkillIds: Array.from(
        new Set([...s.acquiredSkillIds, ...listing.skillIds])
      ),
      acquiredToolIds: Array.from(
        new Set([...s.acquiredToolIds, ...listing.toolIds])
      ),
    }));
    return agent.instanceId;
  },

  fireAgent: (instanceId) =>
    set((s) => ({
      hired: s.hired.filter((a) => a.instanceId !== instanceId),
      ceoId: s.ceoId === instanceId ? null : s.ceoId,
      teams: s.teams.map((t) => ({
        ...t,
        memberIds: t.memberIds.filter((m) => m !== instanceId),
        leaderId: t.leaderId === instanceId ? null : t.leaderId,
      })),
    })),

  acquireSkill: (id) =>
    set((s) => ({
      acquiredSkillIds: Array.from(new Set([...s.acquiredSkillIds, id])),
    })),
  acquireTool: (id) =>
    set((s) => ({
      acquiredToolIds: Array.from(new Set([...s.acquiredToolIds, id])),
    })),
  acquireWorkflow: (id) =>
    set((s) => {
      if (s.teamWorkflows.some((w) => w.sourceListingId === id)) return s;
      const listing = findListing(id);
      if (!listing || listing.kind !== 'workflow') return s;
      return { teamWorkflows: [...s.teamWorkflows, toTeamWorkflow(listing)] };
    }),

  addCustomWorkflow: () => {
    const wf: TeamWorkflow = {
      id: uid('cwf'),
      name: '新工作流',
      category: '自建',
      stages: ['规划', '执行', '评审'],
      teamSize: 3,
      roles: ['Leader', '成员'],
      origin: 'custom',
    };
    set((s) => ({ teamWorkflows: [...s.teamWorkflows, wf] }));
    return wf.id;
  },

  renameWorkflow: (id, name) =>
    set((s) => ({
      teamWorkflows: s.teamWorkflows.map((w) =>
        w.id === id ? { ...w, name } : w
      ),
    })),

  updateWorkflow: (id, patch) =>
    set((s) => ({
      teamWorkflows: s.teamWorkflows.map((w) =>
        w.id === id ? { ...w, ...patch } : w
      ),
    })),

  removeWorkflow: (id) =>
    set((s) => ({
      teamWorkflows: s.teamWorkflows.filter((w) => w.id !== id),
      teams: s.teams.map((t) =>
        t.workflowId === id ? { ...t, workflowId: null } : t
      ),
    })),

  appointCeo: (instanceId) => set({ ceoId: instanceId }),

  createTeam: (name) => {
    const team: CompanyTeam = {
      id: uid('t'),
      name,
      memberIds: [],
      leaderId: null,
      workflowId: null,
    };
    set((s) => ({ teams: [...s.teams, team] }));
    return team.id;
  },

  renameTeam: (teamId, name) =>
    set((s) => ({
      teams: s.teams.map((t) => (t.id === teamId ? { ...t, name } : t)),
    })),

  deleteTeam: (teamId) =>
    set((s) => ({
      teams: s.teams.filter((t) => t.id !== teamId),
      missions: s.missions.filter((m) => m.teamId !== teamId),
    })),

  addMember: (teamId, instanceId) =>
    set((s) => ({
      teams: s.teams.map((t) =>
        t.id === teamId && !t.memberIds.includes(instanceId)
          ? { ...t, memberIds: [...t.memberIds, instanceId] }
          : t
      ),
    })),

  removeMember: (teamId, instanceId) =>
    set((s) => ({
      teams: s.teams.map((t) =>
        t.id === teamId
          ? {
              ...t,
              memberIds: t.memberIds.filter((m) => m !== instanceId),
              leaderId: t.leaderId === instanceId ? null : t.leaderId,
            }
          : t
      ),
    })),

  setLeader: (teamId, instanceId) =>
    set((s) => ({
      teams: s.teams.map((t) =>
        t.id === teamId
          ? {
              ...t,
              leaderId: instanceId,
              memberIds: t.memberIds.includes(instanceId)
                ? t.memberIds
                : [...t.memberIds, instanceId],
            }
          : t
      ),
    })),

  setWorkflow: (teamId, workflowId) =>
    set((s) => ({
      teams: s.teams.map((t) => (t.id === teamId ? { ...t, workflowId } : t)),
    })),

  toggleAgentSkill: (instanceId, skillId) =>
    set((s) => ({
      hired: s.hired.map((a) =>
        a.instanceId === instanceId
          ? {
              ...a,
              skillIds: a.skillIds.includes(skillId)
                ? a.skillIds.filter((x) => x !== skillId)
                : [...a.skillIds, skillId],
            }
          : a
      ),
    })),

  toggleAgentTool: (instanceId, toolId) =>
    set((s) => ({
      hired: s.hired.map((a) =>
        a.instanceId === instanceId
          ? {
              ...a,
              toolIds: a.toolIds.includes(toolId)
                ? a.toolIds.filter((x) => x !== toolId)
                : [...a.toolIds, toolId],
            }
          : a
      ),
    })),

  setAgentModels: (instanceId, models) =>
    set((s) => ({
      hired: s.hired.map((a) =>
        a.instanceId === instanceId ? { ...a, models } : a
      ),
    })),

  setAgentAutoFallback: (instanceId, value) =>
    set((s) => ({
      hired: s.hired.map((a) =>
        a.instanceId === instanceId ? { ...a, autoFallback: value } : a
      ),
    })),

  createMission: (teamId, title) => {
    const mission: CompanyMission = {
      id: uid('ms'),
      teamId,
      title,
      status: 'running',
      progress: 0,
      createdAt: Date.now(),
    };
    set((s) => ({ missions: [mission, ...s.missions] }));
    return mission.id;
  },

  setMissionProgress: (missionId, progress, status) =>
    set((s) => ({
      missions: s.missions.map((m) =>
        m.id === missionId
          ? {
              ...m,
              progress,
              status: status ?? (progress >= 100 ? 'done' : m.status),
            }
          : m
      ),
    })),
}));
