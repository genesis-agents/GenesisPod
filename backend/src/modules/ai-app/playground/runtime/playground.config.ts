/**
 * @deprecated 上架沉淀(P2)：deep-insight mission recipe 已挪到能力家
 * `marketplace/capabilities/deep-insight/recipe/deep-insight.recipe`（recipe 是平台共享
 * 能力的一部分，不归 playground）。此处留 re-export 桩，playground 存量 import 不变；
 * 后续机械步骤把 import 指向能力家后删桩。
 */
export { PLAYGROUND_PIPELINE } from "@/modules/ai-app/marketplace/capabilities/deep-insight/recipe/deep-insight.recipe";
