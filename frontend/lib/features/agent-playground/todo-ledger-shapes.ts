/**
 * todo-ledger-shapes.ts — Todo ledger type re-export module（B4-4 final）
 *
 * 所有 component 需要的 todo-ledger 类型应当 import from 此文件，
 * 不再 import from `todo-ledger.ts`。
 *
 * 落地依据：thinning plan §B4-4 / §B5-2 / §6.6.3.
 *
 * §6.6.3 second list（UI-only helpers）仍 export from 此文件以保留 frontend-side
 * 使用：deriveLayerBreadcrumb 等。truth helper `deriveTodoLedger` 不被 re-export。
 */

export type {
  MissionTodoOrigin,
  MissionTodoScope,
  MissionTodoStatus,
  MissionTodoAssignee,
  MissionTodoArtifact,
  MissionTodoNarrativeItem,
  MissionTodoLayer,
  SystemStageId,
  MissionTodo,
} from './todo-ledger';

// UI-only helper（§6.6.3 second list；不携带 truth）
export { deriveLayerBreadcrumb } from './todo-ledger';
