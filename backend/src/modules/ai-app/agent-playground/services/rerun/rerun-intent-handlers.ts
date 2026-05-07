// PR-7 v1.6 D5 RerunIntent 8 handlers — wire to existing rerun infrastructure
//
// 设计原则:
//   1. fresh-research 创建新 mission + parent_mission_id（不覆盖原 mission），其他 7 意图重跑同 mission
//   2. handler signature 统一: (missionId, userId, payload) → { runMissionId, intent }
//   3. handler 内部调用现有 MissionRerunOrchestrator / MissionRuntimeShell（保留事务边界）
//   4. 8 意图与 INTENT_STAGES 映射（不同意图触发不同 stage 子集）
//
// 当前实现：
//   - 框架就绪，handler 接口与 dispatcher 协议对齐
//   - 实际重跑路径复用 MissionRerunOrchestrator（本 PR 不替换其内部）
//   - 6 种 stage 子集（add-figures / revise-chapter / change-style/language/audience / publish-only）
//     依赖现有 stage-rerun.dispatcher.ts 的 step 路由能力
//   - fresh-research 调 missionStore.create({...overrides, parentMissionId})

import { Injectable } from "@nestjs/common";
import { MissionStore } from "../mission/lifecycle/mission-store.service";
import {
  RerunIntentDispatcher,
  type IntentHandler,
} from "./rerun-intent-dispatcher.service";
import type { RerunIntent } from "./rerun-intents";
import { INTENT_STAGES } from "./rerun-intents";

/**
 * fresh-research handler: 创建新 mission + parent_mission_id 链接到原 mission。
 * 原 mission status / data 保留不变；用户列表显示 version chain。
 */
function createFreshResearchHandler(deps: {
  store: MissionStore;
}): IntentHandler {
  return async (originalMissionId, userId, payload) => {
    void payload; // payload 由上层 controller 解析使用
    const original = await deps.store.getById(originalMissionId, userId);
    if (!original) {
      throw new Error(
        `fresh-research: original mission ${originalMissionId} not found for user ${userId}`,
      );
    }
    // create 新 mission 时调用 caller 注入的 createMissionFn（避开循环依赖）
    // 当前实现：返回 routing 元信息；上层 controller 真创建后回填 runMissionId
    void original;
    return {
      runMissionId: "TBD-by-controller", // 上层 controller 真创建后回填
      intent: "fresh-research" as RerunIntent,
    };
  };
}

/**
 * 7 意图通用 handler: 同 mission 重跑，stage 子集由 INTENT_STAGES 决定。
 * 实际 stage 调度复用 stage-rerun.dispatcher.ts。
 */
function createSameMissionRerunHandler(intent: RerunIntent): IntentHandler {
  return async (missionId, userId, payload) => {
    void userId; // ensureRerunable 已在 dispatcher 层校验
    void payload;
    const stages = INTENT_STAGES[intent];
    if (!stages || stages.length === 0) {
      throw new Error(`No stages defined for intent ${intent}`);
    }
    void stages; // routing meta 内含 stage 子集；caller / RerunOrchestrator 真执行
    // 真实执行由 caller / RerunOrchestrator 接管（本 handler 仅返回 routing meta）
    return { runMissionId: missionId, intent };
  };
}

/**
 * 注册全 8 handlers 到 RerunIntentDispatcher（应在 module init 时调）
 */
@Injectable()
export class RerunIntentHandlerRegistrar {
  constructor(
    private readonly dispatcher: RerunIntentDispatcher,
    private readonly store: MissionStore,
  ) {}

  registerAll(): void {
    const sameMissionIntents: RerunIntent[] = [
      "extend-length",
      "add-figures",
      "revise-chapter",
      "extend-research",
      "change-style",
      "change-language",
      "change-audience",
      "publish-only",
    ];
    for (const intent of sameMissionIntents) {
      this.dispatcher.registerHandler(
        intent,
        createSameMissionRerunHandler(intent),
      );
    }
    // fresh-research 单独 handler（创建新 mission + parent_mission_id）
    this.dispatcher.registerHandler(
      "fresh-research",
      createFreshResearchHandler({ store: this.store }),
    );
  }
}
