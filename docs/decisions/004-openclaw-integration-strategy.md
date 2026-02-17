# 004. OpenClaw Integration Strategy - AI Content Hub Positioning

**Date**: 2026-02-05
**Status**: Accepted

## Background

OpenClaw (formerly Clawdbot/Moltbot) is a rapidly growing open-source AI personal assistant (150K+ GitHub stars) that integrates with messaging platforms (WhatsApp, Telegram, Discord, Slack, Signal, Teams). Its ecosystem includes ClawHub (skill marketplace) and Moltbook (AI agent social network with 1.4M+ agents).

Genesis.ai has mature deep content production capabilities (research, writing, team collaboration, office automation) but limited distribution reach (only WeChat MP and Xiaohongshu). The integration aims to extend Raven's content distribution capabilities while maintaining its core identity.

## Decision

### Product Positioning: AI Content Hub

Raven positions as an **AI-powered deep content production and distribution platform**:

```
Input (any source) → Raven Production Engine → Distribution (any platform)
```

Core value proposition: "Give me a topic, I'll complete the entire pipeline from deep research to content creation to multi-platform distribution."

OpenClaw serves as a **distribution channel partner**, not a feature module. It extends Raven's output reach from 2 platforms to 8+ through MCP protocol, without absorbing OpenClaw's codebase.

### Integration Model: MCP-Based Channel Extension

OpenClaw instances connect to Raven as remote MCP Servers. Raven's `MCPManager` (already supporting HTTP/SSE transport) connects to OpenClaw to invoke messaging capabilities. This is the same pattern used for any MCP Server, not an OpenClaw-specific integration.

```
Raven MCPManager ──HTTP/SSE──→ OpenClaw MCP Server ──→ WhatsApp/TG/Discord/Slack
                                                    ──→ Signal/Teams/iMessage
```

### What We Do NOT Do

1. **Do NOT embed OpenClaw code** into Raven
2. **Do NOT build a parallel messaging layer** - OpenClaw handles platform-specific protocols
3. **Do NOT depend on OpenClaw** - it's an optional channel, Raven works without it
4. **Do NOT expose Raven internals** - communication is strictly via MCP protocol

## Rationale

### Why AI Content Hub (not other positioning models)

| Positioning                             | Rejected Because                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Distribution Channel Only (Model A)     | Underutilizes OpenClaw ecosystem; Raven's social module already does this via Playwright                               |
| Backend Engine (Model B)                | Raven becomes "headless", brand hidden behind OpenClaw                                                                 |
| A2A Federation (Model C)                | Elegant but unclear practical collaboration scenarios; Moltbook is experimental                                        |
| **AI Content Hub (Model D-simplified)** | **Selected**: Amplifies Raven's core strength (deep content production), OpenClaw fills the last-mile distribution gap |

### Why MCP Protocol (not custom integration)

- Raven's `MCPManager` already supports stdio/HTTP/SSE transport (`mcp-client-factory.ts`)
- Raven's MCP Server already exposes Research/Ask/Teams tools (`mcp-server/`)
- OpenClaw is MCP-compatible by design
- No protocol invention needed; standard interoperability

### Current Code Reality (verified against implementation)

| Component                    | Status                      | Key File                                      |
| ---------------------------- | --------------------------- | --------------------------------------------- |
| MCP Client (stdio/HTTP/SSE)  | Implemented                 | `mcp/client/mcp-client-factory.ts`            |
| MCP Manager (multi-server)   | Implemented                 | `mcp/manager/mcp-manager.ts`                  |
| MCP Server (Streamable HTTP) | Implemented                 | `mcp-server/mcp-server.controller.ts`         |
| A2A Client (outbound)        | Implemented                 | `a2a/adapter/a2a-client.service.ts`           |
| A2A Controller (inbound)     | Placeholder                 | `a2a/a2a.controller.ts` (TODO in createTask)  |
| Social MCPClientService      | Separate stdio-only         | `social/core/mcp-client.service.ts`           |
| PublishExecutorService       | Hardcoded 2 platforms       | `social/services/publish-executor.service.ts` |
| IPlatformAdapter             | Well-defined                | `social/types/platform.types.ts`              |
| SocialPlatformType           | Only WECHAT_MP, XIAOHONGSHU | `social/types/index.ts`                       |

## Architecture Changes Required

### P0: Unify MCP Infrastructure

Social module's standalone `MCPClientService` (stdio-only, 523 lines) must migrate to AI Engine's `MCPManager` (supports stdio/HTTP/SSE via factory).

**Impact**: Social module gains remote MCP connectivity without new code.

### P1: Platform Adapter Registry

Replace hardcoded switch/case in `PublishExecutorService` with dynamic adapter registry. The `IPlatformAdapter` interface already exists; only the registration mechanism is missing.

### P2: OpenClaw Channel Adapter

Implement `IPlatformAdapter` for OpenClaw, delegating to `MCPManager.callTool()` for message delivery.

### P3: Guardrails Integration

Wire `GuardrailsPipelineService` into the call chain for all external MCP inputs, especially from OpenClaw-sourced content.

## Impact

- **Positive**: Distribution reach expands from 2 to 8+ platforms
- **Positive**: Leverages existing MCP infrastructure (no new protocols)
- **Positive**: Optional integration - Raven operates independently without OpenClaw
- **Positive**: Potential user acquisition via ClawHub skill marketplace
- **Negative**: Dependency on OpenClaw instance availability for non-Chinese platforms
- **Risk**: Security - ClawHub has had malicious skill incidents (341 reported); all inputs must pass guardrails
- **Risk**: OpenClaw platform API stability; messaging platform policy changes

## References

- [001 MCP Transport Extension](./001-mcp-transport-extension.md)
- [002 Raven as MCP Server](./002-raven-as-mcp-server.md)
- [003 A2A Protocol Adoption](./003-a2a-protocol-adoption.md)
- [AI Social Architecture](../architecture/ai-apps/ai-social/ai-social-architecture.md)
- [OpenClaw Docs - Skills](https://docs.openclaw.ai/tools/skills)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
