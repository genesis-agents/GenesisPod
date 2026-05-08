/**
 * BusinessAgentTeam — Mission Store 抽象接口
 *
 * 2026-05-08 PR-E2：从 ai-app/agent-playground/services/mission/lifecycle/ @migrated-from
 * mission-store.service.ts 提取核心 lifecycle 方法签名作为框架接口。reference impl
 * store 是 reference 实现（含 28 public 方法 + 业务 schema），其他 BusinessAgentTeam
 * 实例（research / TI / writing 反向迁移时）只需实现本接口的核心 lifecycle 部分，
 * 业务专属方法（saveReportVersion / appendLeaderJournal 等）由各业务方扩展。
 *
 * 框架依赖原则：harness 后续 framework（E3 RerunGuard / E4 BusinessAgentTeamFactory）
 * 通过 IBusinessTeamMissionStore 接口注入业务 store，避免直接依赖 reference impl 具体类。
 *
 * **暂不强制 implements**：mission-store.service.ts 通过 TypeScript structural
 * typing 隐式 satisfies 本接口（所有方法签名一致）。未来 mission-store 重构拆分
 * 时再显式 `implements IBusinessTeamMissionStore` 锁定契约。
 */

/**
 * Mission store 核心 lifecycle 接口。
 *
 * 业务方（reference impl / research / 等）的 mission store 必须 satisfies 这些方法
 * 签名以接入 BusinessAgentTeam 框架（mission-runtime-shell / RerunGuard 等）。
 *
 * 字段：
 *   - missionId: 统一用 string（UUID v4 是约定，但接口不约束格式）
 *   - userId: 用于 depth-defense（updateMany where{id, userId}）
 *   - podId: heartbeat 写入时附加的 pod 标识（区分 zombie pod）
 */
export interface IBusinessTeamMissionStore {
  /**
   * 刷新 mission 的 heartbeat 字段（每 30s 一次，由 mission-runtime-shell 调度）。
   * 用于 MissionLivenessGuard 判定 mission 是否真在跑。
   */
  refreshHeartbeat(missionId: string, podId: string): Promise<void>;

  /**
   * 清除 heartbeat（status 转 final 态时调用，让 RerunGuard 判定 not-in-flight）。
   */
  clearHeartbeat(missionId: string, userId: string): Promise<void>;

  /**
   * 标记 mission 当前已完成的最大 stage 编号（用于 dispatcher 重启 / cascade rerun）。
   */
  markStageComplete(missionId: string, stageNumber: number): Promise<void>;

  /**
   * 当前用户运行中 mission 数（用于并发限流 / rerun guard）。
   */
  countRunningByUser(userId: string): Promise<number>;

  /**
   * 清理 status=running 但 heartbeat 已 stale 的 mission（启动期 + 周期性 cron 调用）。
   * 返回值：清理统计供 logger 输出。
   */
  cleanupOrphanRunningMissions(thresholdSeconds: number): Promise<{
    found: number;
    cleaned: number;
  }>;

  /**
   * 标记 mission 失败（终态）。args.userId 传入时走 updateMany 严格隔离；
   * 缺失时走 update + assertOwnership 兼容路径。
   *
   * args.errorMessage 由业务方决定截断长度（reference impl: 2000 chars）。
   */
  markFailed(
    missionId: string,
    args: { userId?: string; errorMessage?: string },
  ): Promise<void>;

  /**
   * 把 failed / quality-failed mission 反向 transition 回 running（rerun 起点）。
   * 用乐观锁（updateMany where status in [...]）+ 检查 affectedRows 防 TOCTOU。
   */
  markReopened(missionId: string, userId: string): Promise<void>;
}
