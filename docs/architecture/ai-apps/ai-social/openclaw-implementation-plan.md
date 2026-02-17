# OpenClaw Integration - AI Content Hub Implementation Plan

**Date**: 2026-02-05
**Status**: Approved
**Related**: [ADR-004 OpenClaw Integration Strategy](../../../decisions/004-openclaw-integration-strategy.md) | [OpenClaw Architecture](./openclaw-integration-architecture.md)

## Overview

Integrate OpenClaw's multi-platform messaging capabilities into Genesis's Social module, extending distribution from 2 platforms (WeChat MP, Xiaohongshu) to 8+ platforms (adding WhatsApp, Telegram, Discord, Slack). OpenClaw connects as a remote MCP Server; Genesis's MCPManager calls OpenClaw tools for message delivery.

**Positioning**: Genesis = AI Content Hub (deep content production + multi-platform distribution); OpenClaw = distribution channel partner via MCP.

**连接模式**: 所有新增平台（WhatsApp/Telegram/Discord/Slack）统一通过 OpenClaw MCP Server 对接。需要部署 OpenClaw 实例。

### Architecture Diagram

```
Genesis AI Content Hub
├── Content Production (Research → Writing → Office)
├── Content Distribution
│   ├── Direct Platforms (Playwright-based, existing)
│   │   ├── WeChat MP     ← 无开放 API，维持 Playwright
│   │   └── Xiaohongshu   ← 维持 Playwright
│   └── OpenClaw Channels (MCP-based, NEW)
│       ├── WhatsApp
│       ├── Telegram
│       ├── Discord
│       └── Slack
└── MCPManager ──HTTP/SSE──→ OpenClaw MCP Server (需部署)
```

### OpenClaw 部署方式

OpenClaw 是独立服务，Genesis 通过 MCP 协议远程调用。部署选项：

| 方式           | 适用场景     | 说明                                    |
| -------------- | ------------ | --------------------------------------- |
| Docker Compose | 开发/测试    | `docker run openclaw/openclaw` 本地运行 |
| Railway/Render | 生产         | 与 Genesis 同平台部署，内网通信         |
| 独立 VPS       | 高稳定性需求 | 单独管理，通过公网 HTTPS 连接           |

管理员在 Admin → MCP Servers 注册 OpenClaw 实例的 HTTP/SSE endpoint，MCPManager 自动连接。

### 关于微信公众号

微信公众号**没有开放发布 API**（仅认证服务号有部分接口），OpenClaw 也不对接微信公众号。
因此 WeChat MP 维持现有 Playwright 方案，不在 OpenClaw 集成范围内。

---

## Phase 1: PlatformAdapterRegistry (Backend Infrastructure)

Replace hardcoded `switch/case` in `PublishExecutorService` with a dynamic adapter registry.

### 1.1 Create `platform-adapter-registry.ts`

**NEW**: `backend/src/modules/ai-app/social/core/platform-adapter-registry.ts`

```typescript
@Injectable()
export class PlatformAdapterRegistry {
  private adapters = new Map<SocialPlatformType, IPlatformAdapter>();

  register(adapter: IPlatformAdapter): void { ... }
  get(platformType: SocialPlatformType): IPlatformAdapter | undefined { ... }
  getAll(): IPlatformAdapter[] { ... }
  has(platformType: SocialPlatformType): boolean { ... }
}
```

- Inject all adapters via NestJS DI
- Each adapter self-registers its `platformType` in `onModuleInit()`

### 1.2 Modify `PublishExecutorService`

**MODIFY**: `backend/src/modules/ai-app/social/services/publish-executor.service.ts`

- Replace constructor injecting `WechatAdapter` + `XiaohongshuAdapter` with injecting `PlatformAdapterRegistry`
- Replace switch/case (lines 151-169) with `registry.get(connection.platformType).publish(...)`
- Remove hardcoded platform-type-to-adapter mapping at line 72-75

### 1.3 Update existing adapters

**MODIFY**: `backend/src/modules/ai-app/social/adapters/wechat.adapter.ts`
**MODIFY**: `backend/src/modules/ai-app/social/adapters/xiaohongshu.adapter.ts`

- Have both implement `IPlatformAdapter` properly (currently `XiaohongshuAdapter.publish()` signature doesn't match `IPlatformAdapter.publish()` — it takes `SocialPlatformConnection` instead of `SessionData`)
- Add `platformType` and `name` readonly properties
- Add `supportsMcp` flag

### 1.4 Update module registration

**MODIFY**: `backend/src/modules/ai-app/social/ai-social.module.ts`

- Add `PlatformAdapterRegistry` to providers
- Keep existing adapters as providers (DI resolves them)

---

## Phase 2: Expand Platform & Content Types

### 2.1 Prisma schema

**MODIFY**: `backend/prisma/schema/models.prisma` (line 7695-7703)

Add to `SocialPlatformType`:

```prisma
enum SocialPlatformType {
  WECHAT_MP      // 微信公众号
  XIAOHONGSHU    // 小红书
  WHATSAPP       // WhatsApp (via OpenClaw)
  TELEGRAM       // Telegram (via OpenClaw)
  DISCORD        // Discord (via OpenClaw)
  SLACK          // Slack (via OpenClaw)
}
```

Add to `SocialContentType`:

```prisma
enum SocialContentType {
  WECHAT_ARTICLE     // 公众号文章
  XIAOHONGSHU_NOTE   // 小红书笔记
  WHATSAPP_MESSAGE   // WhatsApp 消息
  TELEGRAM_POST      // Telegram 帖子
  DISCORD_MESSAGE    // Discord 消息
  SLACK_MESSAGE      // Slack 消息
}
```

Run: `npx prisma migrate dev --name add-openclaw-platforms`

### 2.2 Backend type definitions

**MODIFY**: `backend/src/modules/ai-app/social/types/index.ts`

- Add new enum values to match Prisma (WHATSAPP, TELEGRAM, DISCORD, SLACK)
- Add corresponding content types
- Add `OPENCLAW_PLATFORMS` constant: array of OpenClaw-backed platform types
- Add `isOpenClawPlatform(type)` helper

### 2.3 Backend platform config

**MODIFY**: `backend/src/modules/ai-app/social/config/platforms.config.ts`

- Add configs for WHATSAPP, TELEGRAM, DISCORD, SLACK to `PLATFORM_CONFIGS`
- Set `supportsMcp: true`, `mcpServerId: 'openclaw'` for all OpenClaw platforms
- Set `needClickLogin: false` (no Playwright login flow)
- Add `isOpenClawBacked: true` flag to distinguish from Playwright-based platforms
- Add rate limit configs for new platforms

### 2.4 Update `SessionManagerService`

**MODIFY**: `backend/src/modules/ai-app/social/core/session-manager.service.ts`

- For OpenClaw-backed platforms, session validation = MCP server connectivity check
- `validateSession` should call `MCPManager.getClient(openclawServerId)?.connected` for these platforms

---

## Phase 3: OpenClaw Channel Adapter (Core Integration)

### 3.1 Content formatter

**NEW**: `backend/src/modules/ai-app/social/services/openclaw-content-formatter.ts`

Transforms Genesis's `SocialContent` into platform-specific message formats:

| Platform | Format                        | Char Limit | Rich Text    | Images         |
| -------- | ----------------------------- | ---------- | ------------ | -------------- |
| WhatsApp | Plain text + limited markdown | 4096       | No           | Attachments    |
| Telegram | Markdown / HTML               | 4096       | Yes          | Photo/Document |
| Discord  | Markdown + Embeds             | 2000       | Yes (embeds) | Attachments    |
| Slack    | Block Kit (mrkdwn)            | 3000       | Yes (blocks) | File upload    |

```typescript
@Injectable()
export class OpenClawContentFormatter {
  format(content: SocialContent, platformType: SocialPlatformType): OpenClawMessage { ... }
  private formatWhatsApp(content: SocialContent): OpenClawMessage { ... }
  private formatTelegram(content: SocialContent): OpenClawMessage { ... }
  private formatDiscord(content: SocialContent): OpenClawMessage { ... }
  private formatSlack(content: SocialContent): OpenClawMessage { ... }
}
```

### 3.2 OpenClaw channel adapter

**NEW**: `backend/src/modules/ai-app/social/adapters/openclaw-channel.adapter.ts`

```typescript
@Injectable()
export class OpenClawChannelAdapter implements IPlatformAdapter {
  constructor(
    private readonly platformType: SocialPlatformType,
    private readonly mcpManager: MCPManager,
    private readonly formatter: OpenClawContentFormatter,
  ) {}

  readonly supportsMcp = true;
  readonly name: string; // derived from platformType

  // Login = verify OpenClaw server connectivity + channel availability
  async initLogin(): Promise<LoginSession> {
    // 1. Check MCPManager has openclaw server registered and connected
    // 2. Call openclaw MCP tool: 'list_channels' to verify platform available
    // 3. Return session with status='confirmed' (no QR code needed)
  }

  // Publish = call MCPManager.callTool(openclawServerId, 'send_message', {...})
  async publish(content, sessionData, options): Promise<PublishResult> {
    const formatted = this.formatter.format(content, this.platformType);
    const result = await this.mcpManager.callTool(
      this.openclawServerId, 'send_message', {
        platform: this.targetPlatform, // 'whatsapp' | 'telegram' | ...
        channel: sessionData.channelId,
        message: formatted,
      }
    );
    return { success: !result.isError, ... };
  }
}
```

### 3.3 Adapter factory

**NEW**: `backend/src/modules/ai-app/social/adapters/openclaw-adapter.factory.ts`

One adapter class instantiated per platform type via factory:

```typescript
@Injectable()
export class OpenClawAdapterFactory implements OnModuleInit {
  constructor(
    private readonly mcpManager: MCPManager,
    private readonly formatter: OpenClawContentFormatter,
    private readonly registry: PlatformAdapterRegistry,
  ) {}

  onModuleInit() {
    // Register an adapter instance for each OpenClaw platform
    for (const platformType of OPENCLAW_PLATFORMS) {
      const adapter = new OpenClawChannelAdapter(
        platformType,
        this.mcpManager,
        this.formatter,
      );
      this.registry.register(adapter);
    }
  }
}
```

### 3.4 Update connection flow for OpenClaw platforms

**MODIFY**: `backend/src/modules/ai-app/social/ai-social.service.ts`

In `initConnection()`:

- If `isOpenClawPlatform(platformType)` → skip Playwright, instead:
  1. Check MCPManager has OpenClaw server registered
  2. Call `MCPManager.callTool('openclaw', 'check_channel', { platform })` to verify channel availability
  3. Save connection with `sessionData = { type: 'openclaw', openclawServerId, channelId }`
  4. Return `{ status: 'confirmed', message: 'Channel connected via OpenClaw' }`

In `verifyConnection()`:

- If OpenClaw platform → verify MCPManager connectivity, return success immediately

### 3.5 Module registration

**MODIFY**: `backend/src/modules/ai-app/social/ai-social.module.ts`

Add providers:

- `PlatformAdapterRegistry`
- `OpenClawContentFormatter`
- `OpenClawAdapterFactory`
- Keep existing `WechatAdapter`, `XiaohongshuAdapter` (they self-register via `onModuleInit()`)

---

## Phase 4: Frontend Updates

### 4.1 Platform configuration

**MODIFY**: `frontend/lib/ai-social/platforms.ts`

- Extend `SocialPlatformType` union: add `'WHATSAPP' | 'TELEGRAM' | 'DISCORD' | 'SLACK'`
- Extend `SocialContentType` union: add new content types
- Add `PLATFORM_CONFIGS` entries for each new platform:

| Platform | Color      | Letter | Gradient                 |
| -------- | ---------- | ------ | ------------------------ |
| WhatsApp | green-500  | W      | green-500 → green-600    |
| Telegram | blue-500   | T      | blue-400 → blue-600      |
| Discord  | indigo-500 | D      | indigo-500 → purple-600  |
| Slack    | purple-500 | S      | purple-500 → fuchsia-600 |

- Add `CONTENT_TYPE_CONFIGS` entries (maxTitleLength, maxDigestLength per messaging platform)
- Add `isOpenClawPlatform(type)` helper function
- Add `PLATFORM_TO_CONTENT_TYPE` and `CONTENT_TYPE_TO_PLATFORM` mappings

### 4.2 ConnectionsTab

**MODIFY**: `frontend/components/ai-social/ConnectionsTab.tsx`

- Extend `PLATFORMS` record with new platform entries
- Group platforms into two sections:
  - **Direct Platforms** (WeChat, Xiaohongshu) — Playwright-based, QR code login
  - **Via OpenClaw** (WhatsApp, Telegram, Discord, Slack) — MCP-based, instant connection
- For OpenClaw platforms: replace QR code modal with status check modal
  - Show "Connecting..." → "Connected" (no QR scanning)
  - If OpenClaw MCP server not configured, show setup prompt
- Add visual "via OpenClaw" badge on platform cards
- Add "OpenClaw Status" indicator (connected/disconnected) in header

### 4.3 OpenClaw Setup Dialog

**NEW**: `frontend/components/ai-social/OpenClawSetupDialog.tsx`

Shown when user tries to connect an OpenClaw platform but no server is configured:

- Explanation: "This platform requires OpenClaw. Configure it in Admin → MCP Servers."
- "Go to Settings" button → navigates to `/admin/ai/mcp-servers`
- Shows existing OpenClaw server status if already configured

### 4.4 Content Editor

**MODIFY**: `frontend/components/ai-social/create/ContentEditor.tsx`

- For messaging platforms, show simplified editor (no rich text, character limits)
- WhatsApp: plain text, 4096 char limit
- Telegram: markdown, 4096 char limit
- Discord: markdown + embed preview, 2000 char limit
- Slack: Block Kit preview, 3000 char limit

### 4.5 PlatformSelector

**MODIFY**: `frontend/components/ai-social/create/PlatformSelector.tsx`

- Show all platforms grouped by type
- Disabled state for OpenClaw platforms when server not configured
- Badge showing "OpenClaw" on new platforms

### 4.6 Version Tabs

**MODIFY**: `frontend/components/ai-social/create/VersionTabs.tsx`

- Add tabs for new platform content types (formatting differs per platform)

---

## Phase 5: Guardrails Integration

### 5.1 Wire guardrails into publish flow

**MODIFY**: `backend/src/modules/ai-app/social/services/publish-executor.service.ts`

- Inject `GuardrailsPipelineService` (available from global `AiEngineModule`)
- Before publishing: `await guardrails.processOutput(content)` to check content safety
- After receiving from external MCP: `await guardrails.processInput(externalContent)` to validate

### 5.2 Add social-specific guardrail rules

**NEW**: `backend/src/modules/ai-app/social/guardrails/social-content.guardrail.ts`

- Platform-specific content policy checks (e.g., WhatsApp spam policies, Discord ToS)
- Link validation for messaging platforms
- Image content validation

---

## Files Summary

### New Files (7)

| #   | Path                                                                       | Description                                     |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | `backend/src/modules/ai-app/social/core/platform-adapter-registry.ts`      | Dynamic adapter registry                        |
| 2   | `backend/src/modules/ai-app/social/adapters/openclaw-channel.adapter.ts`   | OpenClaw channel adapter (IPlatformAdapter)     |
| 3   | `backend/src/modules/ai-app/social/adapters/openclaw-adapter.factory.ts`   | Factory creating per-platform adapter instances |
| 4   | `backend/src/modules/ai-app/social/services/openclaw-content-formatter.ts` | Content → platform message formatter            |
| 5   | `backend/src/modules/ai-app/social/guardrails/social-content.guardrail.ts` | Social content safety rules                     |
| 6   | `frontend/components/ai-social/OpenClawSetupDialog.tsx`                    | OpenClaw setup prompt dialog                    |
| 7   | Prisma migration file (auto-generated)                                     | Schema migration                                |

### Modified Files (14)

| #   | Path                                                                     | Change                                       |
| --- | ------------------------------------------------------------------------ | -------------------------------------------- |
| 1   | `backend/prisma/schema/models.prisma`                                    | Add WHATSAPP/TELEGRAM/DISCORD/SLACK to enums |
| 2   | `backend/src/modules/ai-app/social/types/index.ts`                       | Add enum values + OPENCLAW_PLATFORMS helper  |
| 3   | `backend/src/modules/ai-app/social/types/platform.types.ts`              | Add OpenClawSessionData type                 |
| 4   | `backend/src/modules/ai-app/social/config/platforms.config.ts`           | Add platform configs for new platforms       |
| 5   | `backend/src/modules/ai-app/social/ai-social.module.ts`                  | Register new providers                       |
| 6   | `backend/src/modules/ai-app/social/ai-social.service.ts`                 | OpenClaw connection flow (skip Playwright)   |
| 7   | `backend/src/modules/ai-app/social/services/publish-executor.service.ts` | Use registry + inject guardrails             |
| 8   | `backend/src/modules/ai-app/social/core/session-manager.service.ts`      | OpenClaw session = MCP connectivity          |
| 9   | `backend/src/modules/ai-app/social/adapters/xiaohongshu.adapter.ts`      | Implement IPlatformAdapter properly          |
| 10  | `frontend/lib/ai-social/platforms.ts`                                    | Add platforms + content types + helpers      |
| 11  | `frontend/components/ai-social/ConnectionsTab.tsx`                       | Platform groups + OpenClaw flow              |
| 12  | `frontend/components/ai-social/create/PlatformSelector.tsx`              | New platforms + disabled state               |
| 13  | `frontend/components/ai-social/create/ContentEditor.tsx`                 | Messaging-specific editor mode               |
| 14  | `frontend/components/ai-social/create/VersionTabs.tsx`                   | New platform content tabs                    |

---

## Verification Plan

1. **Type check**: `npm run type-check` — all new types compile
2. **Prisma migration**: `npx prisma migrate dev` — schema applied cleanly
3. **Unit test**: Registry returns correct adapter for each platform type
4. **Integration test**: OpenClaw adapter formats content correctly for each platform
5. **E2E test**:
   - Configure an OpenClaw MCP server in Admin → MCP Servers
   - Connect a WhatsApp channel via AI Social → Connections
   - Create content → select WhatsApp → publish → verify MCPManager.callTool called
6. **Frontend verification**:
   - ConnectionsTab shows 6 platforms in 2 groups
   - OpenClaw platforms show setup prompt when no server configured
   - Content editor adapts to messaging platform constraints
7. **Guardrails**: Content blocked by guardrails shows error before publishing

---

## Implementation Order

1. Phase 1 (PlatformAdapterRegistry) — backend foundation, no breaking changes
2. Phase 2 (Expand types) — Prisma migration, extend all type definitions
3. Phase 3 (OpenClaw adapter) — core integration logic
4. Phase 4 (Frontend) — UI updates for new platforms
5. Phase 5 (Guardrails) — safety layer

Each phase is independently deployable. Phase 1 is a pure refactor (no new features). Phases 2-3 add backend capability. Phase 4 exposes it in UI. Phase 5 adds safety.
