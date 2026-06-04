/**
 * Self-Driven Team SSE client
 *
 * Consumes POST /api/v1/ask/self-driven/stream (text/event-stream).
 * Events are the SelfDrivenMissionEvent union transparently forwarded by the
 * backend harness runner. Each raw SSE data line is parsed and delivered to
 * the onEvent callback so the caller can render incrementally.
 *
 * Isolated from the regular ask stream path — no session / reconcile / BYOK
 * wiring; this endpoint is fully stateless from the UI's perspective.
 */

import { logger } from '@/lib/utils/logger';
import { config } from '@/lib/utils/config';

export type SelfDrivenEventType =
  | 'mission_started'
  | 'phase'
  | 'plan'
  | 'team_built'
  | 'step_started'
  | 'step_completed'
  | 'awaiting_approval'
  | 'approval_resolved'
  | 'chunk'
  | 'deliverable'
  | 'done'
  | 'error';

export interface MissionStartedEvent {
  type: 'mission_started';
  missionId: string;
}

export interface PhaseEvent {
  type: 'phase';
  missionId: string;
  phase: string;
  status: 'started' | 'completed';
}

export interface ChunkEvent {
  type: 'chunk';
  missionId: string;
  content: string;
}

export interface DeliverableEvent {
  type: 'deliverable';
  missionId: string;
  deliverableType: 'report';
  content: string;
}

export interface DoneEvent {
  type: 'done';
  missionId: string;
}

export interface SelfDrivenErrorEvent {
  type: 'error';
  missionId: string;
  message: string;
}

// --------------- new events (self-driven P1) ---------------

export interface RubricItem {
  dimension: string;
  weight: number;
  passLine: number;
}

export interface ExecutionStep {
  id: string;
  name: string;
  description: string;
  executor: string;
  type: 'task' | 'review' | 'integration' | 'delivery';
  loopKind?: 'react' | 'plan-act' | 'leader-worker';
  dependencies: string[];
  estimatedDuration: number;
  estimatedCost: number;
}

export interface RoleAssignment {
  roleId: string;
  modelId: string;
}

export interface MissionExecutionPlanSummary {
  id: string;
  missionId: string;
  steps: ExecutionStep[];
  estimatedCost: number;
  estimatedDuration: number;
  roleAssignments?: RoleAssignment[];
  rubric?: RubricItem[];
  deliverableType?: 'report';
}

export interface PlanEvent {
  type: 'plan';
  missionId: string;
  plan: MissionExecutionPlanSummary;
}

export interface TeamBuiltEvent {
  type: 'team_built';
  missionId: string;
  roles: Array<{ roleId: string; modelId: string }>;
}

export interface StepStartedEvent {
  type: 'step_started';
  missionId: string;
  stepId: string;
  stepName: string;
  executor: string;
  stepIndex: number;
  totalSteps: number;
}

export interface StepCompletedEvent {
  type: 'step_completed';
  missionId: string;
  stepId: string;
  stepName: string;
  ok: boolean;
  durationMs: number;
}

export interface AwaitingApprovalEvent {
  type: 'awaiting_approval';
  missionId: string;
  requestId: string;
  gate: 'plan_confirm' | 'deliver_confirm';
  prompt: string;
}

export interface ApprovalResolvedEvent {
  type: 'approval_resolved';
  missionId: string;
  requestId: string;
  gate: 'plan_confirm' | 'deliver_confirm';
  approved: boolean;
  timedOut: boolean;
  appendInstruction?: string;
}

export type SelfDrivenMissionEvent =
  | MissionStartedEvent
  | PhaseEvent
  | PlanEvent
  | TeamBuiltEvent
  | StepStartedEvent
  | StepCompletedEvent
  | AwaitingApprovalEvent
  | ApprovalResolvedEvent
  | ChunkEvent
  | DeliverableEvent
  | DoneEvent
  | SelfDrivenErrorEvent;

/**
 * Submit a HITL approval response to the backend.
 * Path: POST /api/v1/admin/approvals/{requestId}/respond
 */
export async function respondApproval(opts: {
  requestId: string;
  approved: boolean;
  feedback?: string;
  token: string;
}): Promise<void> {
  const { requestId, approved, feedback, token } = opts;
  const res = await fetch(
    `${config.apiUrl}/admin/approvals/${requestId}/respond`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ approved, feedback }),
    }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    throw new Error(
      (body.message as string | undefined) ?? `HTTP ${res.status}`
    );
  }
}

export interface SelfDrivenStreamOptions {
  prompt: string;
  clarifications?: Record<string, string>;
  token: string;
  signal?: AbortSignal;
  onEvent: (event: SelfDrivenMissionEvent) => void;
}

/**
 * Opens an SSE connection to the self-driven stream endpoint and calls
 * onEvent for every parsed event until done/error or the signal aborts.
 *
 * Returns when the stream ends (done, error, or abort).
 */
export async function streamSelfDriven(
  opts: SelfDrivenStreamOptions
): Promise<void> {
  const { prompt, clarifications, token, signal, onEvent } = opts;

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}/ask/self-driven/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt, clarifications }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    logger.error('[SelfDriven] fetch failed:', err);
    onEvent({
      type: 'error',
      missionId: '',
      message: err instanceof Error ? err.message : 'Network error',
    });
    return;
  }

  if (!response.ok || !response.body) {
    const errorData = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const msg = errorData.message as string | undefined;
    logger.error('[SelfDriven] stream HTTP error', { status: response.status });
    onEvent({
      type: 'error',
      missionId: '',
      message: msg ?? `HTTP ${response.status}`,
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const flush = (chunks: readonly string[]) => {
    for (const raw of chunks) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        const ev = JSON.parse(payload) as SelfDrivenMissionEvent;
        onEvent(ev);
      } catch (parseErr) {
        logger.warn('[SelfDriven] parse error:', parseErr);
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer.trim()) flush([buffer]);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      flush(parts);
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      logger.error('[SelfDriven] read error:', err);
      onEvent({
        type: 'error',
        missionId: '',
        message: err instanceof Error ? err.message : 'Stream read error',
      });
    }
  }
}
