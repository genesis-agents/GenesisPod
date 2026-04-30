/**
 * MissionCheckpointStore — 通用 checkpoint 存储抽象
 *
 * 沉淀自 TI research-checkpoint.service.ts，剥离对 ResearchMission 表的耦合。
 * ai-app 各自实现 MissionCheckpointStore（playground 落 agent_playground_missions，
 * TI 落 research_missions），MissionCheckpointService 只依赖此接口。
 */

export interface MissionCheckpointSnapshot<TPayload = unknown> {
  /** mission/job 唯一标识 */
  missionId: string;
  /** 创建时间（用于 stale 检测）*/
  savedAt: Date;
  /** 业务侧自定义快照内容 */
  payload: TPayload;
  /** 已完成的 phase / task / dimension 等粒度标识，用于"哪些可跳过" */
  completedKeys: string[];
  /** 当前 mission 的状态 */
  status: "running" | "paused" | "completed" | "failed" | "cancelled";
}

export interface MissionCheckpointStore<TPayload = unknown> {
  save(snapshot: MissionCheckpointSnapshot<TPayload>): Promise<void>;
  load(missionId: string): Promise<MissionCheckpointSnapshot<TPayload> | null>;
  clear(missionId: string): Promise<void>;
  /** 列出可恢复（status='running'/'paused' 且 savedAt 不太老）的 mission */
  listResumable(
    userId: string,
    olderThan?: Date,
  ): Promise<MissionCheckpointSnapshot<TPayload>[]>;
}
