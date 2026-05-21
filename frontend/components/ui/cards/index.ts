/**
 * Cards — 卡片设计系统（ui/ 层 primitive 卡）
 *
 * 卡片 canonical 总览（标准 22 §2.2 卡片体系）：
 * - StatCard（本目录）：统计/指标 tile（数字 + 标签）。
 * - AssetCard（components/common/asset-card）：资源/资产列表卡（composite，依赖 common/ClientDate 故留 common 层）。
 * - CitationListItem / CitationBadge（components/common/citations）：引用/来源卡。
 * 新增卡 primitive 落本目录；composite 卡留 common/ 以免 ui→common 层级倒置。
 */

export { StatCard } from './StatCard';
export type { StatCardProps, StatTone } from './StatCard';
export { SectionPanelCard } from './SectionPanelCard';
export type { SectionPanelCardProps, SectionAccent } from './SectionPanelCard';
export { MessageCardShell } from './MessageCardShell';
export type { MessageCardShellProps, MessageTone } from './MessageCardShell';
