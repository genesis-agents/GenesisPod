/**
 * CapabilityManifest —— 市场能力的**版本化声明式清单**（平台共享）。
 *
 * 设计意图（面向未来公开市场，成本近零但锁住可演进性）：
 *   能力 = 一份 manifest（契约）+ 一个可插拔的 runner（实现）。今天 runner 是进程内
 *   实现；未来公开市场可把同一 manifest 的实现换成**沙箱 / 远程 / MCP server**，
 *   消费方（按 manifest.id[@version] 解析）代码不变。这就是"契约固定、实现可插拔"。
 *
 * 对标业界：npm 包(版本+不可变)、VS Code 扩展(manifest+权限)、MCP server(协议化)、
 * OCI 镜像(digest pin)。本 manifest 是这些范式在本平台的最小落点。
 */

/** 四货架原语之一。 */
export type CapabilityKind = "workflow" | "agent" | "skill" | "tool";

export interface CapabilityManifest {
  /** 稳定 id —— 市场 listingId 的解析键（如 "deep-insight"）。 */
  readonly id: string;
  /**
   * 语义版本。今天恒 "1.0.0"；未来公开市场用于 pin / 兼容协商。
   * 解析键对外是 `${id}@${version}`，但 resolve 允许只给 id（取最新）以兼容现状。
   */
  readonly version: string;
  /** 四原语类型。 */
  readonly kind: CapabilityKind;
  readonly title: string;
  readonly description?: string;
  /** 工作流角色 id 列表（消费方据此把团队成员绑定到角色）。 */
  readonly roles?: readonly string[];
  /** 阶段展示标签（目录卡 / 详情图）。 */
  readonly stages?: readonly string[];
  /** 前端呈现面绑定键（resolveMissionKit）。 */
  readonly missionType?: string;
  /**
   * 预留：未来公开市场的声明式权限 / 沙箱边界（如 "web-search" / "fs:read"）。
   * 今天内部一方市场不消费；先占位，避免裸结构锁死未来。
   */
  readonly permissions?: readonly string[];
}

/** 组合 id@version 解析键。 */
export function capabilityKey(id: string, version: string): string {
  return `${id}@${version}`;
}
