/**
 * DX entry — AI App 业务方的唯一进入点
 *
 * 业务方只需 `import { DefineAgent, AgentSpec, AgentRunner }` from
 * "@/modules/ai-engine/harness/dx"，从此告别样板代码。
 */

export {
  DefineAgent,
  AgentSpec,
  readDefineAgentMeta,
  type DefineAgentOptions,
} from "./agent-spec.base";

export {
  AgentRunner,
  type RunResult,
  DefineAgentMissingError,
  InputValidationError,
} from "./agent-runner.service";

export { FixtureStore, type RecordedRun } from "./fixture-store";

// HarnessInspectorController moved to open-api/admin/harness-inspector.controller.ts (PR-X17)
