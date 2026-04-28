/**
 * MissionTodoLedger —— Leader-owned 动态任务台账
 *
 * 任务列表不是预设槽位，而是 Leader 主持下、随 mission 进程不断追加 / 重派 / 拆分
 * 的全景台账。每条 todo 都有起因（origin）、提出者（createdBy）、当前 assignee 与
 * narrativeLog（这条任务的人话进展流）。
 *
 * 派生规则（按 originating event）:
 *   stage:completed(leader) + dimensions[]              → leader-plan todos
 *   dimensions:appended                                  → leader-chat-create todos
 *   leader:decision(assess-research-dispatched)          → S4 评审决策概览
 *   dimension:retrying（reason !== leader-assess-*）     → self-heal-retry 子 todo
 *   dimension:retrying（reason starts with leader-）     → leader-assess-* 子 todo
 *   chapter:revision                                     → reviewer-revise chapter 子 todo
 *   critic:verdict.warnings[]                            → critic-blindspot todos
 *   reconciliation:completed.gapCount > 0                → reconciler-gap todo
 *   stage:started/completed (system stages)              → system-stage todos
 *   agent:narrative                                      → 直接挂到对应 todo 的 narrativeLog
 */

import type { PlaygroundEvent } from '@/hooks/useAgentPlaygroundStream';
import type {
  AgentLiveState,
  AgentRole,
  DimensionPipelineState,
  MissionState,
  VerifierVerdict,
} from './derive';

export type MissionTodoOrigin =
  | 'leader-plan'
  | 'leader-assess-retry'
  | 'leader-assess-replace'
  | 'leader-assess-extend'
  | 'leader-assess-abort'
  | 'leader-chat-create'
  | 'self-heal-retry'
  | 'reviewer-revise'
  | 'critic-blindspot'
  | 'reconciler-gap'
  | 'system-stage';

export type MissionTodoScope =
  | 'mission'
  | 'dimension'
  | 'chapter'
  | 'review'
  | 'system';

export type MissionTodoStatus =
  | 'pending'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface MissionTodoAssignee {
  role: AgentRole | 'reconciler' | 'critic' | 'mission';
  agentId?: string;
  dimensionName?: string;
}

export interface MissionTodoArtifact {
  kind:
    | 'finding-count'
    | 'insight-count'
    | 'fact-table'
    | 'figure'
    | 'chapter'
    | 'verdict-score'
    | 'critic-warning'
    | 'foreword';
  label: string;
  value?: string | number;
}

export interface MissionTodoNarrativeItem {
  ts: number;
  text: string;
  tone?: 'info' | 'success' | 'warn' | 'error';
}

export type SystemStageId =
  | 's1-budget'
  | 's2-leader-plan'
  | 's3-researchers'
  | 's4-leader-assess'
  | 's5-reconciler'
  | 's6-analyst'
  | 's7-writer-outline'
  | 's8-writer-draft'
  | 's9-critic-l4'
  | 's10-leader-signoff'
  | 's11-persist';

export interface MissionTodo {
  id: string;
  parentId?: string;
  origin: MissionTodoOrigin;
  createdBy: 'leader' | 'reviewer' | 'critic' | 'reconciler' | 'system';
  createdAt: number;
  reasonText: string;
  scope: MissionTodoScope;
  title: string;
  assignee: MissionTodoAssignee;
  status: MissionTodoStatus;
  startedAt?: number;
  endedAt?: number;
  artifacts: MissionTodoArtifact[];
  narrativeLog: MissionTodoNarrativeItem[];
  agentRefId?: string;
  dimensionRef?: string;
  systemStageId?: SystemStageId;
}

export interface DeriveTodoArgs {
  events: PlaygroundEvent[];
  mission: MissionState;
  agents: AgentLiveState[];
  verdicts: VerifierVerdict[];
  dimensionPipelines: Map<string, DimensionPipelineState>;
}

export function deriveTodoLedger(args: DeriveTodoArgs): MissionTodo[] {
  const { events, agents, dimensionPipelines } = args;
  const todos = new Map<string, MissionTodo>();
  const order: string[] = [];

  const upsert = (
    id: string,
    init: () => MissionTodo,
    mutate?: (t: MissionTodo) => void
  ) => {
    let cur = todos.get(id);
    if (!cur) {
      cur = init();
      todos.set(id, cur);
      order.push(id);
    }
    if (mutate) mutate(cur);
    return cur;
  };

  const addNarrative = (
    todoId: string,
    ts: number,
    text: string,
    tone: MissionTodoNarrativeItem['tone'] = 'info'
  ) => {
    const cur = todos.get(todoId);
    if (!cur) return;
    if (
      cur.narrativeLog.length > 0 &&
      cur.narrativeLog[cur.narrativeLog.length - 1].text === text
    ) {
      return;
    }
    cur.narrativeLog.push({ ts, text, tone });
  };

  const systemStageInit = (
    stageId: SystemStageId,
    title: string,
    reason: string,
    assigneeRole: MissionTodoAssignee['role'],
    ts: number
  ): MissionTodo => ({
    id: `system:${stageId}`,
    origin: 'system-stage',
    createdBy: 'system',
    createdAt: ts,
    reasonText: reason,
    scope: 'system',
    title,
    assignee: { role: assigneeRole },
    status: 'pending',
    artifacts: [],
    narrativeLog: [],
    systemStageId: stageId,
  });

  // 启动时种入 S1 budget todo
  for (const ev of events) {
    if (ev.type === 'agent-playground.mission:started') {
      upsert(
        'system:s1-budget',
        () =>
          systemStageInit(
            's1-budget',
            '预算闸门 + Mission 启动',
            '根据用户档位（depth × budgetProfile）估算 token 预算并校验余额',
            'mission',
            ev.timestamp
          ),
        (t) => {
          if (t.status === 'pending') {
            t.status = 'in_progress';
            t.startedAt = ev.timestamp;
          }
        }
      );
      break;
    }
  }

  for (const ev of events) {
    const t = ev.type;
    const p = (ev.payload ?? {}) as Record<string, unknown>;

    if (t === 'agent-playground.mission:started') {
      addNarrative(
        'system:s1-budget',
        ev.timestamp,
        'Mission 已启动，进入预算闸门',
        'info'
      );
    } else if (t === 'agent-playground.agent:narrative') {
      // 后端发来的人话叙事 —— 直接挂到对应 todo
      const stage = p.stage as string | undefined;
      const role = p.role as string | undefined;
      const tag = p.tag as string | undefined;
      const text = p.text as string | undefined;
      const dim = p.dimension as string | undefined;
      const evAgentId = ev.agentId;
      if (!text) continue;
      const tone: MissionTodoNarrativeItem['tone'] =
        tag === 'success'
          ? 'success'
          : tag === 'warning'
            ? 'warn'
            : tag === 'error'
              ? 'error'
              : 'info';
      let target: MissionTodo | undefined;
      if (dim) {
        target = order
          .map((id) => todos.get(id)!)
          .reverse()
          .find((td) => td.scope === 'dimension' && td.dimensionRef === dim);
      }
      if (!target && evAgentId) {
        target = order
          .map((id) => todos.get(id)!)
          .find((td) => td.agentRefId === evAgentId);
      }
      if (!target && stage) {
        target = todos.get(`system:${stage}`);
      }
      if (!target && role) {
        target = order
          .map((id) => todos.get(id)!)
          .find(
            (td) =>
              td.scope === 'system' &&
              (td.assignee.role === role ||
                (role === 'researcher' && td.id === 'system:s3-researchers') ||
                (role === 'reviewer' && td.id === 'system:s8-writer-draft'))
          );
      }
      if (target) addNarrative(target.id, ev.timestamp, text, tone);
    } else if (
      t === 'agent-playground.mission:budget-warning-soft' ||
      t === 'agent-playground.mission:budget-warning-hard'
    ) {
      const isHard = t.endsWith('hard');
      addNarrative(
        'system:s1-budget',
        ev.timestamp,
        isHard
          ? `预算硬告警：${(p.suggestion as string) ?? 'abort'}（短缺 ${(p.shortfall as number) ?? '?'} credits）`
          : `预算软告警：估算超出建议但可继续`,
        isHard ? 'error' : 'warn'
      );
    } else if (t === 'agent-playground.stage:started') {
      const stage = p.stage as string | undefined;
      if (stage === 'leader') {
        upsert(
          'system:s2-leader-plan',
          () =>
            systemStageInit(
              's2-leader-plan',
              'Leader 拆解任务',
              'Leader 看 topic，产出 themeSummary + 多个研究维度并声明 successCriteria',
              'leader',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
            const s1 = todos.get('system:s1-budget');
            if (s1 && s1.status !== 'done' && s1.status !== 'failed') {
              s1.status = 'done';
              s1.endedAt = ev.timestamp;
              s1.artifacts.push({
                kind: 'finding-count',
                label: '余额校验通过',
              });
            }
          }
        );
      } else if (stage === 'researchers') {
        const count = (p.count as number) ?? 0;
        const dims = (p.dimensions as string[]) ?? [];
        upsert(
          'system:s3-researchers',
          () =>
            systemStageInit(
              's3-researchers',
              `维度并行研究 · ${count} 个 Researcher`,
              '按 Leader 拆解的维度并行派遣 Researcher，每人负责一个维度的资料采集',
              'researcher',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
            t0.title = `维度并行研究 · ${count} 个 Researcher`;
          }
        );
        if (dims.length > 0) {
          addNarrative(
            'system:s3-researchers',
            ev.timestamp,
            `派遣 ${count} 个 Researcher：${dims.slice(0, 3).join(' / ')}${dims.length > 3 ? '…' : ''}`
          );
        }
      } else if (stage === 'reconciler') {
        upsert(
          'system:s5-reconciler',
          () =>
            systemStageInit(
              's5-reconciler',
              '跨维度对账',
              'Reconciler 把所有维度的 finding 收齐做事实抽取、冲突检测、缺口识别',
              'reconciler',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
          }
        );
      } else if (stage === 'analyst') {
        upsert(
          'system:s6-analyst',
          () =>
            systemStageInit(
              's6-analyst',
              '综合分析',
              'Analyst 把对账后的 fact + 各维度 findings 综合成 mission-level insight',
              'analyst',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
          }
        );
      } else if (stage === 'writer') {
        upsert(
          'system:s8-writer-draft',
          () =>
            systemStageInit(
              's8-writer-draft',
              '撰写报告',
              'Writer 起草报告并由 L3 verifier 三路评分；若分数低于阈值会触发重写',
              'writer',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
          }
        );
      } else if (stage === 'critic') {
        upsert(
          'system:s9-critic-l4',
          () =>
            systemStageInit(
              's9-critic-l4',
              'L4 元审 · 盲点 / 偏见 / 建议',
              'Critic 独立 meta-review，从盲点 / 偏见 / 改进建议三个维度审视报告',
              'critic',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
          }
        );
      }
    } else if (t === 'agent-playground.stage:completed') {
      const stage = p.stage as string | undefined;
      if (stage === 'leader') {
        const dims =
          (p.dimensions as
            | { id: string; name: string; rationale: string }[]
            | undefined) ?? [];
        const themeSummary = p.themeSummary as string | undefined;
        const s2 = upsert('system:s2-leader-plan', () =>
          systemStageInit(
            's2-leader-plan',
            'Leader 拆解任务',
            '规划',
            'leader',
            ev.timestamp
          )
        );
        s2.status = 'done';
        s2.endedAt = ev.timestamp;
        s2.artifacts = [
          { kind: 'finding-count', label: '维度数', value: dims.length },
          ...(themeSummary
            ? [{ kind: 'finding-count' as const, label: '主题摘要已产出' }]
            : []),
        ];
        // 为每个 dim 创建 leader-plan todo
        dims.forEach((d, i) => {
          const id = `dim:${d.id}`;
          upsert(id, () => ({
            id,
            origin: 'leader-plan',
            createdBy: 'leader',
            createdAt: ev.timestamp,
            reasonText: d.rationale,
            scope: 'dimension',
            title: d.name,
            assignee: {
              role: 'researcher',
              agentId: `researcher#${i}`,
              dimensionName: d.name,
            },
            status: 'pending',
            artifacts: [],
            narrativeLog: [
              {
                ts: ev.timestamp,
                text: `Leader 派下来：${d.rationale.slice(0, 120)}${d.rationale.length > 120 ? '…' : ''}`,
                tone: 'info',
              },
            ],
            dimensionRef: d.name,
            agentRefId: `researcher#${i}`,
          }));
        });
      } else if (stage === 'researchers') {
        const results =
          (p.results as
            | { dimension: string; findingsCount: number; summary: string }[]
            | undefined) ?? [];
        const s3 = upsert('system:s3-researchers', () =>
          systemStageInit(
            's3-researchers',
            '维度并行研究',
            '按 Leader 拆解的维度并行派遣 Researcher',
            'researcher',
            ev.timestamp
          )
        );
        s3.status = 'done';
        s3.endedAt = ev.timestamp;
        const okCount = results.filter((r) => r.findingsCount > 0).length;
        s3.artifacts = [
          {
            kind: 'finding-count',
            label: '完成 / 总数',
            value: `${okCount} / ${results.length}`,
          },
        ];
      } else if (stage === 'reconciler') {
        const s5 = upsert('system:s5-reconciler', () =>
          systemStageInit(
            's5-reconciler',
            '跨维度对账',
            '对账',
            'reconciler',
            ev.timestamp
          )
        );
        s5.status = (p.state as string) === 'completed' ? 'done' : 'failed';
        s5.endedAt = ev.timestamp;
      } else if (stage === 'analyst') {
        const s6 = upsert('system:s6-analyst', () =>
          systemStageInit(
            's6-analyst',
            '综合分析',
            '综合',
            'analyst',
            ev.timestamp
          )
        );
        s6.status = 'done';
        s6.endedAt = ev.timestamp;
        s6.artifacts = [
          {
            kind: 'insight-count',
            label: '核心洞察',
            value: (p.insightsCount as number) ?? 0,
          },
        ];
      } else if (stage === 'writer') {
        const s8 = upsert('system:s8-writer-draft', () =>
          systemStageInit(
            's8-writer-draft',
            '撰写报告',
            '撰写',
            'writer',
            ev.timestamp
          )
        );
        s8.status = 'done';
        s8.endedAt = ev.timestamp;
        const finalScore = p.finalScore as number | undefined;
        const attempts = p.attempts as number | undefined;
        s8.artifacts = [
          ...(finalScore != null
            ? [
                {
                  kind: 'verdict-score' as const,
                  label: '最终评分',
                  value: finalScore,
                },
              ]
            : []),
          ...(attempts != null && attempts > 1
            ? [
                {
                  kind: 'finding-count' as const,
                  label: '撰写迭代',
                  value: `${attempts} 轮`,
                },
              ]
            : []),
        ];
      }
    } else if (t === 'agent-playground.dimensions:appended') {
      const items =
        (p.items as { id: string; name: string; rationale: string }[]) ?? [];
      items.forEach((d) => {
        const id = `dim:${d.id}`;
        upsert(id, () => ({
          id,
          origin: 'leader-chat-create',
          createdBy: 'leader',
          createdAt: ev.timestamp,
          reasonText: d.rationale,
          scope: 'dimension',
          title: d.name,
          assignee: { role: 'researcher', dimensionName: d.name },
          status: 'pending',
          artifacts: [],
          narrativeLog: [
            {
              ts: ev.timestamp,
              text: `Leader Chat 触发追加：${d.rationale.slice(0, 120)}`,
              tone: 'info',
            },
          ],
          dimensionRef: d.name,
        }));
      });
    } else if (t === 'agent-playground.leader:decision') {
      const phase = p.phase as string | undefined;
      if (phase === 'assess-research-dispatched') {
        const stats = (p.stats as Record<string, number>) ?? {};
        const decisionMsg = `重派 ${stats.retried ?? 0} / 中止 ${stats.aborted ?? 0} / 追加 ${stats.appended ?? 0} / 跳过 ${stats.skipped ?? 0}`;
        upsert(
          'system:s4-leader-assess',
          () =>
            systemStageInit(
              's4-leader-assess',
              'Leader 评审 Researcher 产出',
              'Leader 看每个 dim 的 finding 数、来源质量，给出 accept/patch/redirect/abort 决策',
              'leader',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'done';
            t0.endedAt = ev.timestamp;
            t0.artifacts = [
              {
                kind: 'finding-count',
                label: '维度调度',
                value: decisionMsg,
              },
            ];
          }
        );
      } else if (phase === 'assess-research') {
        upsert(
          'system:s4-leader-assess',
          () =>
            systemStageInit(
              's4-leader-assess',
              'Leader 评审 Researcher 产出',
              '评审',
              'leader',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = t0.startedAt ?? ev.timestamp;
          }
        );
      }
    } else if (t === 'agent-playground.leader:foreword') {
      upsert(
        'system:s10-leader-signoff',
        () =>
          systemStageInit(
            's10-leader-signoff',
            'Leader 终审签字',
            'Leader 综合所有产出写前言并对最终交付物签字',
            'leader',
            ev.timestamp
          ),
        (t0) => {
          t0.status = 'in_progress';
          t0.startedAt = t0.startedAt ?? ev.timestamp;
          t0.artifacts.push({ kind: 'foreword', label: '前言已写' });
        }
      );
    } else if (t === 'agent-playground.leader:signed') {
      const score = p.leaderOverallScore as number | undefined;
      const verdict = p.leaderVerdict as string | undefined;
      const signed = p.signed as boolean | undefined;
      upsert(
        'system:s10-leader-signoff',
        () =>
          systemStageInit(
            's10-leader-signoff',
            'Leader 终审签字',
            'Leader 终审',
            'leader',
            ev.timestamp
          ),
        (t0) => {
          t0.status = signed === false ? 'failed' : 'done';
          t0.endedAt = ev.timestamp;
          if (score != null) {
            t0.artifacts.push({
              kind: 'verdict-score',
              label: 'Leader 总评',
              value: `${score}/100`,
            });
          }
          if (verdict) {
            t0.artifacts.push({
              kind: 'finding-count',
              label: 'Verdict',
              value: verdict,
            });
          }
        }
      );
    } else if (t === 'agent-playground.dimension:retrying') {
      const dim = p.dimension as string | undefined;
      const reason = p.reason as string | undefined;
      const critique = p.critique as string | undefined;
      const isLeaderTriggered =
        reason === 'leader-assess-retry' ||
        reason === 'leader-assess-replace' ||
        reason === 'leader-assess-abort' ||
        reason === 'leader-assess-extend';
      const parentTodo = order
        .map((id) => todos.get(id)!)
        .find(
          (td) =>
            td.scope === 'dimension' &&
            td.dimensionRef === dim &&
            td.status !== 'cancelled'
        );
      if (!dim) continue;
      if (reason === 'leader-assess-abort' && parentTodo) {
        parentTodo.status = 'cancelled';
        parentTodo.endedAt = ev.timestamp;
        addNarrative(
          parentTodo.id,
          ev.timestamp,
          `Leader 评审决定：放弃该维度（${critique?.slice(0, 100) ?? ''}）`,
          'warn'
        );
        continue;
      }
      const childOrigin: MissionTodoOrigin = isLeaderTriggered
        ? reason === 'leader-assess-replace'
          ? 'leader-assess-replace'
          : reason === 'leader-assess-extend'
            ? 'leader-assess-extend'
            : 'leader-assess-retry'
        : 'self-heal-retry';
      const childId = `${parentTodo?.id ?? `dim:${dim}`}:retry@${ev.timestamp}`;
      upsert(childId, () => ({
        id: childId,
        parentId: parentTodo?.id,
        origin: childOrigin,
        createdBy: isLeaderTriggered ? 'leader' : 'system',
        createdAt: ev.timestamp,
        reasonText:
          critique ??
          (isLeaderTriggered
            ? 'Leader 在评审阶段要求重做该维度'
            : `自愈重试（上一轮失败码 ${reason ?? '未知'}）`),
        scope: 'dimension',
        title: `${dim} · 重试`,
        assignee: { role: 'researcher', dimensionName: dim },
        status: 'in_progress',
        startedAt: ev.timestamp,
        artifacts: [],
        narrativeLog: [
          {
            ts: ev.timestamp,
            text: isLeaderTriggered
              ? `Leader 触发重派：${critique?.slice(0, 150) ?? '提升覆盖率与来源质量'}`
              : `自愈重试（上一轮 ${reason}）`,
            tone: isLeaderTriggered ? 'info' : 'warn',
          },
        ],
        dimensionRef: dim,
      }));
      if (parentTodo) {
        addNarrative(
          parentTodo.id,
          ev.timestamp,
          isLeaderTriggered
            ? 'Leader 派出重试任务（见子任务）'
            : '触发自愈重试',
          'warn'
        );
      }
    } else if (t === 'agent-playground.researcher:completed') {
      const dim = (p.dimension as string | undefined) ?? '';
      const cnt = (p.findingsCount as number | undefined) ?? 0;
      const state = p.state as string | undefined;
      const summary = p.summary as string | undefined;
      const target = order
        .map((id) => todos.get(id)!)
        .reverse()
        .find((td) => td.scope === 'dimension' && td.dimensionRef === dim);
      if (!target) continue;
      target.endedAt = ev.timestamp;
      if (state === 'completed') {
        target.status = 'done';
        target.artifacts.push({
          kind: 'finding-count',
          label: '采集到 finding',
          value: cnt,
        });
        addNarrative(
          target.id,
          ev.timestamp,
          `采集完成 · ${cnt} 条 finding${summary ? ` · ${summary.slice(0, 100)}` : ''}`,
          'success'
        );
      } else {
        target.status = 'failed';
        addNarrative(
          target.id,
          ev.timestamp,
          `采集失败（state=${state}）`,
          'error'
        );
      }
    } else if (t === 'agent-playground.dimension:degraded') {
      const dim = p.dimension as string | undefined;
      const innerCode = p.innerFailureCode as string | undefined;
      const target = order
        .map((id) => todos.get(id)!)
        .reverse()
        .find((td) => td.scope === 'dimension' && td.dimensionRef === dim);
      if (target) {
        if (target.status !== 'done') {
          target.status = 'failed';
          target.endedAt = ev.timestamp;
        }
        addNarrative(
          target.id,
          ev.timestamp,
          `维度降级（${innerCode ?? '未知失败码'}），下游 Analyst 走退化路径`,
          'warn'
        );
      }
    } else if (t === 'agent-playground.reconciliation:completed') {
      const factCount = (p.factCount as number) ?? 0;
      const conflicts = (p.conflictCount as number) ?? 0;
      const overlaps = (p.overlapCount as number) ?? 0;
      const gaps = (p.gapCount as number) ?? 0;
      const figs = (p.figureCandidateCount as number) ?? 0;
      const s5 = upsert('system:s5-reconciler', () =>
        systemStageInit(
          's5-reconciler',
          '跨维度对账',
          '对账',
          'reconciler',
          ev.timestamp
        )
      );
      s5.artifacts = [
        { kind: 'fact-table', label: '事实条目', value: factCount },
        { kind: 'finding-count', label: '冲突', value: conflicts },
        { kind: 'finding-count', label: '重叠', value: overlaps },
        { kind: 'finding-count', label: '缺口', value: gaps },
        { kind: 'figure', label: '图候选', value: figs },
      ];
      if (gaps > 0) {
        const gapId = `gap:reconciler@${ev.timestamp}`;
        upsert(gapId, () => ({
          id: gapId,
          origin: 'reconciler-gap',
          createdBy: 'reconciler',
          createdAt: ev.timestamp,
          reasonText: `对账时发现 ${gaps} 处跨维度缺口，建议下游 Analyst 显式标注未覆盖区域`,
          scope: 'review',
          title: `跨维度缺口 · ${gaps} 处`,
          assignee: { role: 'analyst' },
          status: 'pending',
          artifacts: [],
          narrativeLog: [
            {
              ts: ev.timestamp,
              text: `Reconciler 标记 ${gaps} 处缺口`,
              tone: 'warn',
            },
          ],
        }));
      }
    } else if (t === 'agent-playground.chapter:revision') {
      const dim = p.dimension as string | undefined;
      const idx = p.chapterIndex as number | undefined;
      if (!dim || idx == null) continue;
      const parent = order
        .map((id) => todos.get(id)!)
        .reverse()
        .find((td) => td.scope === 'dimension' && td.dimensionRef === dim);
      const childId = `chapter:${dim}:${idx}@${ev.timestamp}`;
      upsert(childId, () => ({
        id: childId,
        parentId: parent?.id,
        origin: 'reviewer-revise',
        createdBy: 'reviewer',
        createdAt: ev.timestamp,
        reasonText:
          (p.critique as string | undefined) ??
          'Chapter Reviewer 评分低于阈值，要求重写',
        scope: 'chapter',
        title: `${dim} · 第 ${idx} 章 · 重写`,
        assignee: { role: 'writer', dimensionName: dim },
        status: 'in_progress',
        startedAt: ev.timestamp,
        artifacts: [],
        narrativeLog: [
          { ts: ev.timestamp, text: 'Reviewer 触发章节重写', tone: 'warn' },
        ],
        dimensionRef: dim,
      }));
    } else if (t === 'agent-playground.critic:verdict') {
      const warnings =
        (p.warnings as
          | { kind: string; message: string; severity?: string }[]
          | undefined) ?? [];
      const overall = p.overall as string | undefined;
      const s9 = upsert(
        'system:s9-critic-l4',
        () =>
          systemStageInit(
            's9-critic-l4',
            'L4 元审 · 盲点 / 偏见 / 建议',
            'Critic 独立元审',
            'critic',
            ev.timestamp
          ),
        (t0) => {
          t0.status = 'done';
          t0.endedAt = ev.timestamp;
          t0.artifacts = [
            { kind: 'critic-warning', label: '警示', value: warnings.length },
            ...(overall
              ? [
                  {
                    kind: 'finding-count' as const,
                    label: '总评',
                    value: overall,
                  },
                ]
              : []),
          ];
        }
      );
      warnings.forEach((w, i) => {
        const wid = `critic:${ev.timestamp}#${i}`;
        upsert(wid, () => ({
          id: wid,
          parentId: s9.id,
          origin: 'critic-blindspot',
          createdBy: 'critic',
          createdAt: ev.timestamp,
          reasonText: w.message,
          scope: 'review',
          title: `${w.kind === 'l4-blindspot' ? '盲点' : w.kind === 'l4-bias' ? '偏见' : w.kind === 'l4-suggestion' ? '建议' : 'L4 警示'} · ${w.message.slice(0, 60)}`,
          assignee: { role: 'critic' },
          status: 'done',
          endedAt: ev.timestamp,
          artifacts: [],
          narrativeLog: [{ ts: ev.timestamp, text: w.message, tone: 'warn' }],
        }));
      });
    } else if (t === 'agent-playground.mission:completed') {
      upsert(
        'system:s11-persist',
        () =>
          systemStageInit(
            's11-persist',
            '落库 + 索引',
            '把 mission 全部产出（report / artifact / verdicts / cost）写入数据库',
            'mission',
            ev.timestamp
          ),
        (t0) => {
          t0.status = 'done';
          t0.endedAt = ev.timestamp;
        }
      );
      addNarrative(
        'system:s11-persist',
        ev.timestamp,
        'Mission 完成 · 已持久化',
        'success'
      );
    } else if (t === 'agent-playground.mission:failed') {
      // mission 失败：把当前正在跑的 stage 标 failed（因为它就是真正挂掉的那个），
      // pending 的 stage 保持 pending（它们根本没跑），不要级联红化。
      const failMsg = (p.message as string) ?? '未知错误';
      for (const id of order) {
        const td = todos.get(id)!;
        if (td.scope !== 'system') continue;
        if (td.status === 'in_progress') {
          td.status = 'failed';
          td.endedAt = ev.timestamp;
          addNarrative(
            td.id,
            ev.timestamp,
            `Mission 失败：${failMsg}`,
            'error'
          );
        }
      }
    }
  }

  // 用 agents.phase 反向覆盖 dim todos 的 in_progress / done 状态
  const dimTodos = order
    .map((id) => todos.get(id)!)
    .filter((td) => td.scope === 'dimension');
  for (const td of dimTodos) {
    if (!td.dimensionRef) continue;
    const matching = agents.find(
      (a) => a.dimension === td.dimensionRef && a.role === 'researcher'
    );
    if (!matching) continue;
    if (td.status === 'pending' && matching.phase === 'running') {
      td.status = 'in_progress';
      td.startedAt = matching.startedAt ?? td.createdAt;
    }
    if (td.status === 'in_progress' && matching.phase === 'completed') {
      td.status = 'done';
      td.endedAt = matching.endedAt;
    }
    if (matching.phase === 'failed' && td.status !== 'cancelled') {
      td.status = 'failed';
      td.endedAt = matching.endedAt;
    }
  }

  // 用 dimensionPipelines 给 dim todos 补 chapter 产出
  for (const td of dimTodos) {
    if (!td.dimensionRef) continue;
    const pipeline = dimensionPipelines.get(td.dimensionRef);
    if (pipeline && pipeline.chapters.length > 0) {
      const passed = pipeline.chapters.filter(
        (c) => c.status === 'passed'
      ).length;
      td.artifacts.push({
        kind: 'chapter',
        label: '章节通过 / 总数',
        value: `${passed} / ${pipeline.chapters.length}`,
      });
      if (pipeline.grade) {
        td.artifacts.push({
          kind: 'verdict-score',
          label: '维度评分',
          value: `${pipeline.grade.overall}/100`,
        });
      }
    }
  }

  return order.map((id) => todos.get(id)!);
}

export interface MissionTodoLayer {
  id: 'AI-APP' | 'AI-HARNESS' | 'AI-ENGINE' | 'AI-INFRA';
  label: string;
  detail: string;
}

/**
 * 4 层架构面包屑 —— 给 drawer 顶部用
 * 根据 todo 的 systemStageId / origin 派生
 */
export function deriveLayerBreadcrumb(todo: MissionTodo): MissionTodoLayer[] {
  const harnessLoop = (() => {
    if (todo.scope === 'system' && todo.systemStageId) {
      switch (todo.systemStageId) {
        case 's2-leader-plan':
        case 's4-leader-assess':
        case 's10-leader-signoff':
          return 'Leader-Replanner-Lite';
        case 's3-researchers':
          return 'ReAct + 自愈';
        case 's5-reconciler':
        case 's9-critic-l4':
          return 'Judge';
        case 's6-analyst':
          return 'Reflexion';
        case 's7-writer-outline':
          return 'Planning';
        case 's8-writer-draft':
          return 'ReAct (自愈)';
        case 's1-budget':
        case 's11-persist':
          return '—';
      }
    }
    if (todo.scope === 'dimension') return 'ReAct + 自愈';
    if (todo.scope === 'chapter') return 'Chapter-pipeline';
    if (todo.scope === 'review') return 'Judge';
    return '—';
  })();

  const engineCapability = (() => {
    if (todo.scope === 'system' && todo.systemStageId) {
      switch (todo.systemStageId) {
        case 's2-leader-plan':
          return 'TaskProfile · Leader prompt';
        case 's3-researchers':
          return 'Tools · web-search / arxiv / scrape';
        case 's4-leader-assess':
          return 'TaskProfile · 决策提示';
        case 's5-reconciler':
          return 'Skills · 实体抽取 / 冲突检测';
        case 's6-analyst':
          return 'TaskProfile · 综合提示';
        case 's7-writer-outline':
        case 's8-writer-draft':
          return 'Skills · 写作 + 引用规范化';
        case 's9-critic-l4':
          return 'TaskProfile · 元审';
        case 's10-leader-signoff':
          return 'TaskProfile · 签字提示';
        case 's1-budget':
          return 'modelRouting · 预估';
        case 's11-persist':
          return 'memory · trajectory';
      }
    }
    if (todo.scope === 'dimension') return 'Tools · web-search / arxiv';
    if (todo.scope === 'chapter') return 'Skills · 写作';
    if (todo.scope === 'review') return 'Skills · 评审';
    return '—';
  })();

  const infraCapability = (() => {
    if (todo.systemStageId === 's1-budget') return 'Credits · 预估 + 闸门';
    if (todo.systemStageId === 's11-persist') return 'Storage · DB 落库';
    return 'Credits · BillingContext + tickCost';
  })();

  return [
    {
      id: 'AI-APP',
      label: 'AI-APP',
      detail: 'agent-playground · 原生 Agent Team',
    },
    {
      id: 'AI-HARNESS',
      label: 'AI-HARNESS',
      detail: harnessLoop,
    },
    {
      id: 'AI-ENGINE',
      label: 'AI-ENGINE',
      detail: engineCapability,
    },
    {
      id: 'AI-INFRA',
      label: 'AI-INFRA',
      detail: infraCapability,
    },
  ];
}
