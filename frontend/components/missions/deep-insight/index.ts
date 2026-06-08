/**
 * Deep-Insight 能力包对外桶。
 * L4 成品 + 契约 + adapter；面板/左栏属内部组装件，按需从子路径取。
 */

export { DeepInsightMissionDetail } from './DeepInsightMissionDetail';
export type { DeepInsightMissionDetailProps } from './DeepInsightMissionDetail';

export {
  fromCompanyMissionResult,
  fromPlaygroundMissionView,
} from './contract';
export type {
  DeepInsightMissionView,
  BaseMissionView,
  TeamTopologyView,
  MissionStep,
  ComputeUsage,
  MissionAction,
  MissionActionVariant,
  Reference,
  Fact,
  Verdict,
  CompanyMissionInput,
  MissionReportResultLike,
} from './contract';
