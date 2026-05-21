---
name: project_ask_room_socket_proxy_fix_2026_05_21
description: AI Ask 房间代理环境 socket xhr poll error 根因 + 修复 + 故意未做的同类隐患
metadata:
  node_type: memory
  type: project
  originSessionId: 1adb6dfb-5cce-46fa-966f-91512c3454a9
---

2026-05-21：代理环境（自定义域名如 gens.team）进 AI Ask 房间报 `出错了: Socket 加入失败：connect_error: xhr poll error`。

**两个根因**（任一单独可触发）：

1. 后端 `ai-ask-room.gateway.ts` CORS 是硬编码数组，仅含 `*.up.railway.app` + FRONTEND_URL —— 自定义域名握手被拒。
2. 前端 `useAskRoomSocket.ts` 用 `NEXT_PUBLIC_API_URL?.replace('/api/v1','') || 'localhost:3001'`，既不绕 Next.js 代理（rewrites 只代理 `/api/v1/*`，不代理 `/socket.io/*`），未注入时还兜底到 localhost。

**修复**（用户选：函数式 CORS + ask-room 改 URL + 优雅降级）：

- 后端 CORS 改函数式（mirror main.ts/topic-insights）：放行无 Origin + dev localhost + CORS_ORIGINS/FRONTEND_URL/RAILWAY_FRONTEND_URL/APP_CONFIG.railway.\*。
- 前端 socket 改 `config.getBackendUrl()`（mirror radar/social/agent-playground）；`connect_error` 不再弹致命红条，仅 ack.ok===false 真 join 拒绝才报。

**部署前置**：前端域名必须在后端 `CORS_ORIGINS` 或 `FRONTEND_URL`，否则函数式 CORS 仍拒（非 `*`）。

**故意未做（用户明确缩范围，后续隐患）**：`useNotificationSocket` / `useWritingWebSocket` / `useResearchWebSocket` 仍是同款 `localhost:3001` 旧兜底；`ai-writing` / `ai-teams` 网关仍是严格白名单 CORS。同类问题随时可在这些模块复现。参见 [[feedback_socket_use_config_getbackendurl]]。
