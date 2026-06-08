'use client';

/**
 * useCompanyMissionStream — 订阅 company namespace 的 mission 事件流。
 *
 * 基于 useMissionStream 泛化 hook，连接后端 company namespace，
 * 接受所有 'company.' 前缀事件，无服务端 replay 端点（传入 no-op stub）。
 */

import { useMissionStream, type MissionEvent } from './useMissionStream';

export type { MissionEvent };

/** company namespace 事件 payload 形状 */
export interface CompanyMissionStartedPayload {
  missionId: string;
}

export interface CompanyStageLifecyclePayload {
  stage: string;
  status: 'started' | 'completed';
}

export interface CompanyMissionCompletedPayload {
  missionId: string;
}

export interface CompanyMissionFailedPayload {
  missionId: string;
  message: string;
}

/**
 * No-op replay stub — company namespace 暂无服务端 replay 端点，
 * 返回空事件列表，保持 useMissionStream 接口兼容。
 */
async function noopReplay(
  _missionId: string,
  _since?: number
): Promise<{ events: MissionEvent[] }> {
  return { events: [] };
}

export function useCompanyMissionStream(missionId: string | null) {
  return useMissionStream(missionId, {
    namespace: '/company',
    replay: noopReplay,
    joinEvent: 'join',
    leaveEvent: 'leave',
    idKey: 'missionId',
    // company 事件均以 'company.' 开头
    acceptEvent: (type: string) => type.startsWith('company.'),
  });
}
