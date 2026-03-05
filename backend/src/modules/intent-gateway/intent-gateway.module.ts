/**
 * IntentGatewayModule — L6 意图网关
 *
 * 用户交互的统一入口：
 * - 意图解析与分类
 * - 请求路由到 AI Apps (L4)
 * - 调用链追踪
 * - 会话管理
 *
 * Architecture layer: L6 (top of 6-layer stack)
 * Depends on: L2 AI Engine (via facade) — injected as @Optional
 */
import { Module } from "@nestjs/common";
import { IntentGatewayService } from "./intent-gateway.service";

@Module({
  providers: [IntentGatewayService],
  exports: [IntentGatewayService],
})
export class IntentGatewayModule {}
