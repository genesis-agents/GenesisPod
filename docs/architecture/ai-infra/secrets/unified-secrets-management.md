# 统一密钥管理系统设计方案

> **版本**: v1.0
> **日期**: 2026-01-12
> **状态**: 待评审
> **作者**: Claude Code

---

## 1. 背景与目标

### 1.1 现状问题

当前系统中 API Keys 和敏感配置分散在多处，存在以下问题：

| 问题             | 描述                                                  | 影响               |
| ---------------- | ----------------------------------------------------- | ------------------ |
| **存储分散**     | 密钥分布在 .env、AdminSettings、MCPServerConfigs 三处 | 难以统一管理和审计 |
| **加密不一致**   | 部分明文存储，部分简单加密                            | 安全风险           |
| **UI 分散**      | External API 页面和 AI Capabilities 页面各自管理密钥  | 用户体验割裂       |
| **无法动态配置** | .env 中的密钥需要重启服务才能生效                     | 运维不便           |
| **缺少审计**     | 无法追踪密钥的使用和变更历史                          | 合规风险           |

### 1.2 当前密钥分布

```
┌─────────────────────────────────────────────────────────────────┐
│                        当前密钥分布                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📁 .env 文件 (需重启生效)                                       │
│  ├── TAVILY_API_KEY                                             │
│  ├── SERPER_API_KEY                                             │
│  ├── PERPLEXITY_API_KEY                                         │
│  ├── JINA_API_KEY                                               │
│  ├── FIRECRAWL_API_KEY                                          │
│  ├── NOTION_CLIENT_ID / NOTION_CLIENT_SECRET                    │
│  └── JWT_SECRET, ENCRYPTION_KEY (系统级)                        │
│                                                                  │
│  🗄️ AdminSettings 表 (External API 页面管理)                    │
│  ├── providers.openai.apiKey                                    │
│  ├── providers.anthropic.apiKey                                 │
│  ├── providers.xai.apiKey                                       │
│  ├── providers.deepseek.apiKey                                  │
│  └── providers.*.apiKey ...                                     │
│                                                                  │
│  🗄️ MCPServerConfigs 表 (AI Capabilities 页面管理)              │
│  ├── exa.apiKey                                                 │
│  ├── browserbase.apiKey                                         │
│  └── *.apiKey ...                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 设计目标

| 目标             | 描述                                                         |
| ---------------- | ------------------------------------------------------------ |
| **统一存储**     | 所有可配置密钥存储在统一的 `secrets` 表中                    |
| **统一加密**     | 使用 AES-256-GCM 加密所有密钥值                              |
| **统一管理 UI**  | 新建"密钥管理中心"页面，集中管理所有密钥                     |
| **动态生效**     | 密钥修改后立即生效，无需重启                                 |
| **审计追踪**     | 记录所有密钥操作的审计日志                                   |
| **现有页面改造** | External API 和 AI Capabilities 页面改为引用密钥，不直接编辑 |

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      Admin 管理后台                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  外部 API 设置   │  │  AI 能力管理    │  │  密钥管理中心   │  │
│  │  ─────────────  │  │  ─────────────  │  │  ─────────────  │  │
│  │  • 选择提供商    │  │  • Tools 开关   │  │  • 所有密钥 CRUD │  │
│  │  • 配置参数      │  │  • Skills 开关  │  │  • 分类管理     │  │
│  │  • 测试连接      │  │  • MCP 配置     │  │  • 加密存储     │  │
│  │                 │  │                 │  │  • 审计日志     │  │
│  │  [密钥状态显示]  │  │  [密钥状态显示]  │  │  [完整编辑]     │  │
│  │  [跳转配置密钥]  │  │  [跳转配置密钥]  │  │                 │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┴────────────────────┘           │
│                                │                                │
│                                ▼                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    SecretsService                           ││
│  │  ───────────────────────────────────────────────────────── ││
│  │  getSecret(key) → 解密返回值                                ││
│  │  setSecret(key, value) → 加密存储                           ││
│  │  isConfigured(key) → 检查是否已配置                          ││
│  │  getSecretStatus(category) → 获取分类下密钥状态              ││
│  │  rotateSecret(key, newValue) → 轮换密钥                     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                │                                │
│                                ▼                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    PostgreSQL                               ││
│  │  ┌─────────────┐  ┌─────────────────────┐                  ││
│  │  │   secrets   │  │  secret_audit_logs  │                  ││
│  │  └─────────────┘  └─────────────────────┘                  ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 密钥分类体系

```
secrets
├── llm                    # LLM 服务提供商
│   ├── openai_api_key
│   ├── anthropic_api_key
│   ├── xai_api_key
│   ├── deepseek_api_key
│   ├── google_api_key
│   └── azure_openai_api_key
│
├── search                 # 搜索服务
│   ├── tavily_api_key
│   ├── serper_api_key
│   ├── perplexity_api_key
│   └── exa_api_key
│
├── content                # 内容处理服务
│   ├── jina_api_key
│   └── firecrawl_api_key
│
├── mcp                    # MCP 服务器
│   ├── mcp_exa_api_key
│   ├── mcp_browserbase_api_key
│   ├── mcp_slack_token
│   └── mcp_*
│
├── integration            # 第三方集成
│   ├── notion_client_id
│   ├── notion_client_secret
│   ├── github_token
│   └── google_oauth_*
│
└── system                 # 系统级密钥 (只读展示)
    ├── jwt_secret
    └── encryption_key
```

---

## 3. 数据库设计

### 3.1 Prisma Schema

```prisma
// ==================== 密钥管理 ====================

/// 密钥存储表
model Secret {
  id              String    @id @default(cuid())

  // 密钥标识
  key             String    @unique          // 唯一标识: openai_api_key

  // 加密存储
  encryptedValue  String?   @map("encrypted_value")  // AES-256-GCM 加密值

  // 分类信息
  category        SecretCategory              // llm, search, content, mcp, integration, system
  provider        String?                     // 提供商: openai, tavily, exa...

  // 显示信息
  displayName     String    @map("display_name")     // 显示名称
  description     String?                            // 描述

  // 状态信息
  isRequired      Boolean   @default(false) @map("is_required")     // 是否必需
  isConfigured    Boolean   @default(false) @map("is_configured")   // 是否已配置
  isSystemManaged Boolean   @default(false) @map("is_system_managed") // 系统管理(只读)

  // 元数据
  metadata        Json?                       // 额外配置信息

  // 时间追踪
  lastUsedAt      DateTime? @map("last_used_at")     // 最后使用时间
  lastRotatedAt   DateTime? @map("last_rotated_at")  // 最后轮换时间
  expiresAt       DateTime? @map("expires_at")       // 过期时间

  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  // 关联
  auditLogs       SecretAuditLog[]

  @@index([category])
  @@index([provider])
  @@index([isConfigured])
  @@map("secrets")
}

/// 密钥分类枚举
enum SecretCategory {
  LLM           // LLM 服务
  SEARCH        // 搜索服务
  CONTENT       // 内容处理
  MCP           // MCP 服务器
  INTEGRATION   // 第三方集成
  SYSTEM        // 系统级
}

/// 密钥审计日志
model SecretAuditLog {
  id          String   @id @default(cuid())

  // 关联密钥
  secretId    String   @map("secret_id")
  secret      Secret   @relation(fields: [secretId], references: [id], onDelete: Cascade)
  secretKey   String   @map("secret_key")  // 冗余存储，防止密钥删除后无法查询

  // 操作信息
  action      SecretAuditAction             // 操作类型
  actor       String?                       // 操作者 (userId 或 "system")
  actorType   String?  @map("actor_type")   // user, system, api

  // 上下文
  ipAddress   String?  @map("ip_address")
  userAgent   String?  @map("user_agent")

  // 变更详情 (不含实际值)
  details     Json?                         // { previouslyConfigured: true, newlyConfigured: true }

  createdAt   DateTime @default(now()) @map("created_at")

  @@index([secretId])
  @@index([action])
  @@index([createdAt])
  @@map("secret_audit_logs")
}

/// 审计操作类型
enum SecretAuditAction {
  CREATE      // 创建
  READ        // 读取 (用于审计敏感操作)
  UPDATE      // 更新
  DELETE      // 删除
  ROTATE      // 轮换
  TEST        // 测试
}
```

### 3.2 数据库迁移 SQL

```sql
-- CreateEnum
CREATE TYPE "SecretCategory" AS ENUM ('LLM', 'SEARCH', 'CONTENT', 'MCP', 'INTEGRATION', 'SYSTEM');
CREATE TYPE "SecretAuditAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'ROTATE', 'TEST');

-- CreateTable: 密钥存储表
CREATE TABLE "secrets" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "encrypted_value" TEXT,
    "category" "SecretCategory" NOT NULL,
    "provider" TEXT,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_configured" BOOLEAN NOT NULL DEFAULT false,
    "is_system_managed" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "last_used_at" TIMESTAMP(3),
    "last_rotated_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable: 密钥审计日志
CREATE TABLE "secret_audit_logs" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "secret_key" TEXT NOT NULL,
    "action" "SecretAuditAction" NOT NULL,
    "actor" TEXT,
    "actor_type" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secret_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "secrets_key_key" ON "secrets"("key");
CREATE INDEX "secrets_category_idx" ON "secrets"("category");
CREATE INDEX "secrets_provider_idx" ON "secrets"("provider");
CREATE INDEX "secrets_is_configured_idx" ON "secrets"("is_configured");
CREATE INDEX "secret_audit_logs_secret_id_idx" ON "secret_audit_logs"("secret_id");
CREATE INDEX "secret_audit_logs_action_idx" ON "secret_audit_logs"("action");
CREATE INDEX "secret_audit_logs_created_at_idx" ON "secret_audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "secret_audit_logs" ADD CONSTRAINT "secret_audit_logs_secret_id_fkey"
    FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

---

## 4. 后端服务设计

### 4.1 服务架构

```
backend/src/modules/ai-infra/secrets/
├── secrets.module.ts              # 模块定义
├── secrets.service.ts             # 核心服务 (加密/解密/CRUD)
├── secrets.controller.ts          # REST API
├── secrets-crypto.service.ts      # 加密工具服务
├── secrets-audit.service.ts       # 审计日志服务
├── secrets-migration.service.ts   # 数据迁移服务
├── dto/
│   ├── create-secret.dto.ts
│   ├── update-secret.dto.ts
│   └── secret-response.dto.ts
└── interfaces/
    └── secret.interface.ts
```

### 4.2 SecretsService 核心接口

```typescript
// secrets.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { SecretsCryptoService } from "./secrets-crypto.service";
import { SecretsAuditService } from "./secrets-audit.service";
import { SecretCategory, SecretAuditAction } from "@prisma/client";

export interface SecretStatus {
  key: string;
  displayName: string;
  category: SecretCategory;
  provider: string | null;
  isConfigured: boolean;
  isRequired: boolean;
  isSystemManaged: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  // 注意: 不返回实际值
}

export interface SecretWithValue extends SecretStatus {
  value: string | null; // 解密后的值 (仅内部使用)
}

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);

  // 内存缓存 (避免频繁解密)
  private cache = new Map<string, { value: string; expiresAt: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 分钟

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: SecretsCryptoService,
    private readonly audit: SecretsAuditService,
  ) {}

  /**
   * 获取密钥值 (自动解密)
   * 用于业务服务获取 API Key
   */
  async getSecret(
    key: string,
    options?: { skipCache?: boolean },
  ): Promise<string | null> {
    // 1. 检查缓存
    if (!options?.skipCache) {
      const cached = this.cache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }
    }

    // 2. 从数据库获取
    const secret = await this.prisma.secret.findUnique({
      where: { key },
    });

    if (!secret || !secret.encryptedValue) {
      return null;
    }

    // 3. 解密
    const decrypted = this.crypto.decrypt(secret.encryptedValue);

    // 4. 更新缓存
    this.cache.set(key, {
      value: decrypted,
      expiresAt: Date.now() + this.CACHE_TTL,
    });

    // 5. 更新最后使用时间 (异步，不阻塞)
    this.prisma.secret
      .update({
        where: { key },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => {});

    return decrypted;
  }

  /**
   * 设置密钥值 (自动加密)
   */
  async setSecret(
    key: string,
    value: string,
    metadata?: {
      displayName?: string;
      description?: string;
      category?: SecretCategory;
      provider?: string;
      isRequired?: boolean;
    },
    auditContext?: { actor?: string; ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    const encrypted = this.crypto.encrypt(value);
    const existing = await this.prisma.secret.findUnique({ where: { key } });

    await this.prisma.secret.upsert({
      where: { key },
      create: {
        key,
        encryptedValue: encrypted,
        displayName: metadata?.displayName || key,
        description: metadata?.description,
        category: metadata?.category || SecretCategory.INTEGRATION,
        provider: metadata?.provider,
        isRequired: metadata?.isRequired || false,
        isConfigured: true,
      },
      update: {
        encryptedValue: encrypted,
        isConfigured: true,
        lastRotatedAt: existing?.isConfigured ? new Date() : undefined,
        ...(metadata?.displayName && { displayName: metadata.displayName }),
        ...(metadata?.description && { description: metadata.description }),
      },
    });

    // 清除缓存
    this.cache.delete(key);

    // 记录审计日志
    await this.audit.log({
      secretKey: key,
      action: existing ? SecretAuditAction.UPDATE : SecretAuditAction.CREATE,
      ...auditContext,
      details: {
        previouslyConfigured: existing?.isConfigured || false,
        newlyConfigured: true,
      },
    });
  }

  /**
   * 删除密钥
   */
  async deleteSecret(
    key: string,
    auditContext?: { actor?: string; ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    const existing = await this.prisma.secret.findUnique({ where: { key } });

    if (existing?.isSystemManaged) {
      throw new Error("Cannot delete system-managed secret");
    }

    await this.prisma.secret.update({
      where: { key },
      data: {
        encryptedValue: null,
        isConfigured: false,
      },
    });

    this.cache.delete(key);

    await this.audit.log({
      secretKey: key,
      action: SecretAuditAction.DELETE,
      ...auditContext,
    });
  }

  /**
   * 检查密钥是否已配置
   */
  async isConfigured(key: string): Promise<boolean> {
    const secret = await this.prisma.secret.findUnique({
      where: { key },
      select: { isConfigured: true },
    });
    return secret?.isConfigured || false;
  }

  /**
   * 获取密钥状态 (不含值)
   */
  async getSecretStatus(key: string): Promise<SecretStatus | null> {
    const secret = await this.prisma.secret.findUnique({
      where: { key },
    });

    if (!secret) return null;

    return {
      key: secret.key,
      displayName: secret.displayName,
      category: secret.category,
      provider: secret.provider,
      isConfigured: secret.isConfigured,
      isRequired: secret.isRequired,
      isSystemManaged: secret.isSystemManaged,
      lastUsedAt: secret.lastUsedAt,
      expiresAt: secret.expiresAt,
    };
  }

  /**
   * 按分类获取所有密钥状态
   */
  async getSecretsByCategory(
    category?: SecretCategory,
  ): Promise<SecretStatus[]> {
    const secrets = await this.prisma.secret.findMany({
      where: category ? { category } : undefined,
      orderBy: [{ category: "asc" }, { provider: "asc" }, { key: "asc" }],
    });

    return secrets.map((s) => ({
      key: s.key,
      displayName: s.displayName,
      category: s.category,
      provider: s.provider,
      isConfigured: s.isConfigured,
      isRequired: s.isRequired,
      isSystemManaged: s.isSystemManaged,
      lastUsedAt: s.lastUsedAt,
      expiresAt: s.expiresAt,
    }));
  }

  /**
   * 获取密钥掩码值 (用于 UI 显示)
   * 例如: "sk-proj-****1234"
   */
  async getMaskedValue(key: string): Promise<string | null> {
    const value = await this.getSecret(key);
    if (!value) return null;

    if (value.length <= 8) {
      return "••••••••";
    }

    const prefix = value.slice(0, 4);
    const suffix = value.slice(-4);
    return `${prefix}••••${suffix}`;
  }

  /**
   * 测试密钥有效性
   */
  async testSecret(
    key: string,
  ): Promise<{ success: boolean; message: string }> {
    const value = await this.getSecret(key);
    if (!value) {
      return { success: false, message: "密钥未配置" };
    }

    // 根据密钥类型调用对应的测试逻辑
    try {
      const secret = await this.prisma.secret.findUnique({ where: { key } });
      if (!secret) {
        return { success: false, message: "密钥不存在" };
      }

      // 委托给具体的测试方法
      return await this.testSecretByCategory(
        secret.category,
        secret.provider,
        value,
      );
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  private async testSecretByCategory(
    category: SecretCategory,
    provider: string | null,
    value: string,
  ): Promise<{ success: boolean; message: string }> {
    switch (category) {
      case SecretCategory.LLM:
        return this.testLLMApiKey(provider, value);
      case SecretCategory.SEARCH:
        return this.testSearchApiKey(provider, value);
      default:
        return { success: true, message: "密钥格式有效" };
    }
  }

  private async testLLMApiKey(
    provider: string | null,
    apiKey: string,
  ): Promise<{ success: boolean; message: string }> {
    // 实现各 LLM 提供商的 API Key 测试
    // ...
    return { success: true, message: "连接成功" };
  }

  private async testSearchApiKey(
    provider: string | null,
    apiKey: string,
  ): Promise<{ success: boolean; message: string }> {
    // 实现各搜索服务的 API Key 测试
    // ...
    return { success: true, message: "连接成功" };
  }

  /**
   * 初始化预定义密钥 (应用启动时调用)
   */
  async initializeSecrets(): Promise<void> {
    const predefinedSecrets = this.getPredefinedSecrets();

    for (const secret of predefinedSecrets) {
      const existing = await this.prisma.secret.findUnique({
        where: { key: secret.key },
      });

      if (!existing) {
        await this.prisma.secret.create({
          data: {
            key: secret.key,
            displayName: secret.displayName,
            description: secret.description,
            category: secret.category,
            provider: secret.provider,
            isRequired: secret.isRequired,
            isConfigured: false,
            isSystemManaged: secret.isSystemManaged || false,
            metadata: secret.metadata,
          },
        });
        this.logger.log(`Initialized secret: ${secret.key}`);
      }
    }
  }

  /**
   * 预定义密钥列表
   */
  private getPredefinedSecrets() {
    return [
      // LLM 服务
      {
        key: "openai_api_key",
        displayName: "OpenAI API Key",
        category: SecretCategory.LLM,
        provider: "openai",
        isRequired: true,
        description: "OpenAI GPT 模型 API 密钥",
      },
      {
        key: "anthropic_api_key",
        displayName: "Anthropic API Key",
        category: SecretCategory.LLM,
        provider: "anthropic",
        isRequired: false,
        description: "Anthropic Claude 模型 API 密钥",
      },
      {
        key: "xai_api_key",
        displayName: "xAI API Key",
        category: SecretCategory.LLM,
        provider: "xai",
        isRequired: false,
        description: "xAI Grok 模型 API 密钥",
      },
      {
        key: "deepseek_api_key",
        displayName: "DeepSeek API Key",
        category: SecretCategory.LLM,
        provider: "deepseek",
        isRequired: false,
        description: "DeepSeek 模型 API 密钥",
      },
      {
        key: "google_api_key",
        displayName: "Google AI API Key",
        category: SecretCategory.LLM,
        provider: "google",
        isRequired: false,
        description: "Google Gemini 模型 API 密钥",
      },

      // 搜索服务
      {
        key: "tavily_api_key",
        displayName: "Tavily API Key",
        category: SecretCategory.SEARCH,
        provider: "tavily",
        isRequired: true,
        description: "Tavily AI 搜索服务 API 密钥",
      },
      {
        key: "serper_api_key",
        displayName: "Serper API Key",
        category: SecretCategory.SEARCH,
        provider: "serper",
        isRequired: false,
        description: "Serper Google 搜索 API 密钥",
      },
      {
        key: "perplexity_api_key",
        displayName: "Perplexity API Key",
        category: SecretCategory.SEARCH,
        provider: "perplexity",
        isRequired: false,
        description: "Perplexity AI 搜索 API 密钥",
      },
      {
        key: "exa_api_key",
        displayName: "Exa API Key",
        category: SecretCategory.SEARCH,
        provider: "exa",
        isRequired: false,
        description: "Exa AI 搜索 API 密钥",
      },

      // 内容处理
      {
        key: "jina_api_key",
        displayName: "Jina API Key",
        category: SecretCategory.CONTENT,
        provider: "jina",
        isRequired: false,
        description: "Jina Reader 网页解析 API 密钥",
      },
      {
        key: "firecrawl_api_key",
        displayName: "Firecrawl API Key",
        category: SecretCategory.CONTENT,
        provider: "firecrawl",
        isRequired: false,
        description: "Firecrawl 网页爬取 API 密钥",
      },

      // MCP 服务器
      {
        key: "mcp_exa_api_key",
        displayName: "MCP Exa API Key",
        category: SecretCategory.MCP,
        provider: "exa",
        isRequired: false,
        description: "Exa MCP 服务器 API 密钥",
      },
      {
        key: "mcp_browserbase_api_key",
        displayName: "MCP Browserbase API Key",
        category: SecretCategory.MCP,
        provider: "browserbase",
        isRequired: false,
        description: "Browserbase MCP 服务器 API 密钥",
      },
      {
        key: "mcp_slack_token",
        displayName: "MCP Slack Token",
        category: SecretCategory.MCP,
        provider: "slack",
        isRequired: false,
        description: "Slack MCP 服务器 Token",
      },

      // 第三方集成
      {
        key: "notion_client_id",
        displayName: "Notion Client ID",
        category: SecretCategory.INTEGRATION,
        provider: "notion",
        isRequired: false,
        description: "Notion OAuth 应用 Client ID",
      },
      {
        key: "notion_client_secret",
        displayName: "Notion Client Secret",
        category: SecretCategory.INTEGRATION,
        provider: "notion",
        isRequired: false,
        description: "Notion OAuth 应用 Client Secret",
      },

      // 系统级 (只读)
      {
        key: "jwt_secret",
        displayName: "JWT Secret",
        category: SecretCategory.SYSTEM,
        provider: null,
        isRequired: true,
        isSystemManaged: true,
        description: "JWT 签名密钥 (系统管理)",
      },
      {
        key: "encryption_key",
        displayName: "Encryption Key",
        category: SecretCategory.SYSTEM,
        provider: null,
        isRequired: true,
        isSystemManaged: true,
        description: "数据加密主密钥 (系统管理)",
      },
    ];
  }
}
```

### 4.3 加密服务

```typescript
// secrets-crypto.service.ts
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

@Injectable()
export class SecretsCryptoService {
  private readonly algorithm = "aes-256-gcm";
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const encryptionKey = this.config.get<string>("SECRETS_ENCRYPTION_KEY");
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new Error("SECRETS_ENCRYPTION_KEY must be at least 32 characters");
    }
    // 使用 SHA-256 将任意长度密钥转换为 32 字节
    this.key = crypto.createHash("sha256").update(encryptionKey).digest();
  }

  /**
   * 加密
   * 返回格式: iv:encrypted:authTag (hex 编码)
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${encrypted}:${authTag.toString("hex")}`;
  }

  /**
   * 解密
   */
  decrypt(ciphertext: string): string {
    const [ivHex, encrypted, authTagHex] = ciphertext.split(":");

    if (!ivHex || !encrypted || !authTagHex) {
      throw new Error("Invalid ciphertext format");
    }

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }
}
```

### 4.4 REST API 控制器

```typescript
// secrets.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import { JwtAuthGuard } from "@/modules/ai-infra/auth/jwt-auth.guard";
import { AdminGuard } from "@/modules/ai-infra/auth/admin.guard";
import { SecretsService, SecretStatus } from "./secrets.service";
import { SecretCategory } from "@prisma/client";

@Controller("admin/secrets")
@UseGuards(JwtAuthGuard, AdminGuard)
export class SecretsController {
  constructor(private readonly secrets: SecretsService) {}

  /**
   * 获取所有密钥状态 (按分类)
   */
  @Get()
  async getAllSecrets(
    @Query("category") category?: SecretCategory,
  ): Promise<{ secrets: SecretStatus[]; stats: any }> {
    const secrets = await this.secrets.getSecretsByCategory(category);

    const stats = {
      total: secrets.length,
      configured: secrets.filter((s) => s.isConfigured).length,
      required: secrets.filter((s) => s.isRequired).length,
      requiredMissing: secrets.filter((s) => s.isRequired && !s.isConfigured)
        .length,
      byCategory: {} as Record<string, { total: number; configured: number }>,
    };

    for (const secret of secrets) {
      if (!stats.byCategory[secret.category]) {
        stats.byCategory[secret.category] = { total: 0, configured: 0 };
      }
      stats.byCategory[secret.category].total++;
      if (secret.isConfigured) {
        stats.byCategory[secret.category].configured++;
      }
    }

    return { secrets, stats };
  }

  /**
   * 获取单个密钥状态 (含掩码值)
   */
  @Get(":key")
  async getSecret(
    @Param("key") key: string,
  ): Promise<SecretStatus & { maskedValue: string | null }> {
    const status = await this.secrets.getSecretStatus(key);
    if (!status) {
      throw new Error("Secret not found");
    }

    const maskedValue = await this.secrets.getMaskedValue(key);
    return { ...status, maskedValue };
  }

  /**
   * 设置密钥
   */
  @Put(":key")
  async setSecret(
    @Param("key") key: string,
    @Body() body: { value: string; displayName?: string; description?: string },
    @Req() req: any,
  ): Promise<{ success: boolean }> {
    await this.secrets.setSecret(
      key,
      body.value,
      {
        displayName: body.displayName,
        description: body.description,
      },
      {
        actor: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
      },
    );

    return { success: true };
  }

  /**
   * 删除密钥
   */
  @Delete(":key")
  async deleteSecret(
    @Param("key") key: string,
    @Req() req: any,
  ): Promise<{ success: boolean }> {
    await this.secrets.deleteSecret(key, {
      actor: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return { success: true };
  }

  /**
   * 测试密钥
   */
  @Post(":key/test")
  async testSecret(
    @Param("key") key: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.secrets.testSecret(key);
  }

  /**
   * 获取审计日志
   */
  @Get(":key/audit-logs")
  async getAuditLogs(
    @Param("key") key: string,
    @Query("limit") limit = 50,
  ): Promise<any[]> {
    // 实现审计日志查询
    return [];
  }
}
```

---

## 5. 前端页面设计

### 5.1 页面结构

```
frontend/app/admin/
├── page.tsx                           # Admin 首页
├── external-api/
│   └── page.tsx                       # 外部 API 设置 (改造)
├── capabilities/
│   └── page.tsx                       # AI 能力管理 (改造)
└── secrets/                           # 🆕 密钥管理中心
    └── page.tsx
```

### 5.2 密钥管理中心 UI 设计

```
┌─────────────────────────────────────────────────────────────────┐
│  🔐 密钥管理中心                                    [刷新] [导出] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐  │
│  │ 全部(18)│ LLM(5)  │搜索(4)  │内容(2)  │ MCP(4)  │集成(3)  │  │
│  └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 📊 统计概览                                                 │ │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │ │
│  │ │ 总计 18  │ │ 已配置 8 │ │ 必需 3   │ │ 缺失 1   │       │ │
│  │ │          │ │ 44%      │ │ 2/3 已配置│ │ ⚠️       │       │ │
│  │ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 🔑 LLM 服务密钥                                             │ │
│  │ ┌──────────────────────────────────────────────────────┐   │ │
│  │ │ ┌────┐ OpenAI API Key                    ✅ 已配置    │   │ │
│  │ │ │ 🟢 │ sk-pr••••5678                     [测试][编辑] │   │ │
│  │ │ └────┘ 最后使用: 2 分钟前                             │   │ │
│  │ └──────────────────────────────────────────────────────┘   │ │
│  │ ┌──────────────────────────────────────────────────────┐   │ │
│  │ │ ┌────┐ Anthropic API Key                 ✅ 已配置    │   │ │
│  │ │ │ 🟢 │ sk-an••••1234                     [测试][编辑] │   │ │
│  │ │ └────┘ 最后使用: 1 小时前                             │   │ │
│  │ └──────────────────────────────────────────────────────┘   │ │
│  │ ┌──────────────────────────────────────────────────────┐   │ │
│  │ │ ┌────┐ xAI API Key                       ⚪ 未配置    │   │ │
│  │ │ │ ⚪ │                                   [配置]       │   │ │
│  │ │ └────┘ xAI Grok 模型 API 密钥                         │   │ │
│  │ └──────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 🔍 搜索服务密钥                                             │ │
│  │ ...                                                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 密钥编辑对话框

```
┌─────────────────────────────────────────────────────────────────┐
│  编辑密钥: OpenAI API Key                               [×]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  密钥标识                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ openai_api_key                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ℹ️ 用于在代码中引用此密钥                                       │
│                                                                  │
│  当前值                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ sk-pr••••••••5678                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  新密钥值                                                        │
│  ┌─────────────────────────────────────────────────────┐ 👁️    │
│  │ ••••••••••••••••••••••••                             │       │
│  └─────────────────────────────────────────────────────┘        │
│  ℹ️ 留空则保持原值不变                                           │
│                                                                  │
│  描述 (可选)                                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ OpenAI GPT 模型 API 密钥                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ⚠️ 安全提示                                               │   │
│  │ • 密钥将使用 AES-256-GCM 加密存储                         │   │
│  │ • 修改后原密钥将被覆盖，无法恢复                           │   │
│  │ • 建议定期轮换密钥以提高安全性                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│                              [取消]  [测试连接]  [保存]          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. 现有页面变更设计

### 6.1 External API Settings 页面变更

**变更前**:

- 每个提供商卡片直接显示 API Key 输入框
- 直接在页面内编辑和保存密钥

**变更后**:

- 每个提供商卡片显示密钥配置状态 (已配置/未配置)
- 显示掩码值 (如 `sk-pr••••5678`)
- 点击"配置密钥"跳转到密钥管理中心
- 保留"测试连接"功能 (调用密钥管理中心的测试 API)

```
┌─────────────────────────────────────────────────────────────────┐
│  外部 API 设置                                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ┌──────┐                                                   │ │
│  │ │OpenAI│  OpenAI                               ✅ 已配置   │ │
│  │ │ Logo │  GPT-4, GPT-4o, o1 系列模型                       │ │
│  │ └──────┘                                                   │ │
│  │                                                            │ │
│  │  API Key: sk-pr••••5678                                    │ │
│  │  状态: ✅ 连接正常                                          │ │
│  │  最后使用: 2 分钟前                                         │ │
│  │                                                            │ │
│  │  默认模型: [gpt-4o           ▼]                            │ │
│  │                                                            │ │
│  │  [测试连接]  [配置密钥 →]                [设为默认]         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ┌──────┐                                                   │ │
│  │ │Claude│  Anthropic                            ⚪ 未配置   │ │
│  │ │ Logo │  Claude 3.5 Sonnet, Claude 3 Opus                 │ │
│  │ └──────┘                                                   │ │
│  │                                                            │ │
│  │  API Key: 未配置                                           │ │
│  │                                                            │ │
│  │  [配置密钥 →]                                              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**代码变更**:

```typescript
// ExternalAPISettings.tsx 变更

// 1. 移除 API Key 输入组件
// 2. 添加密钥状态显示
// 3. 添加跳转按钮

function ProviderCard({ provider, secretStatus, onTest }) {
  const router = useRouter();

  return (
    <div className="rounded-xl border-2 bg-white shadow-sm">
      {/* 提供商信息 */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <ProviderLogo provider={provider.id} />
          <div>
            <h3>{provider.name}</h3>
            <p>{provider.description}</p>
          </div>
          <SecretStatusBadge configured={secretStatus?.isConfigured} />
        </div>
      </div>

      {/* 密钥状态 */}
      <div className="border-t px-4 py-3">
        <div className="text-sm text-gray-600">
          <span>API Key: </span>
          {secretStatus?.isConfigured ? (
            <span className="font-mono">{secretStatus.maskedValue}</span>
          ) : (
            <span className="text-gray-400">未配置</span>
          )}
        </div>
        {secretStatus?.lastUsedAt && (
          <div className="text-xs text-gray-400">
            最后使用: {formatRelativeTime(secretStatus.lastUsedAt)}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="border-t px-4 py-3 flex justify-between">
        <div className="flex gap-2">
          {secretStatus?.isConfigured && (
            <Button variant="outline" size="sm" onClick={onTest}>
              测试连接
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/admin/secrets?highlight=${provider.secretKey}`)}
          >
            配置密钥 →
          </Button>
        </div>
        {secretStatus?.isConfigured && (
          <Button variant="primary" size="sm">
            设为默认
          </Button>
        )}
      </div>
    </div>
  );
}
```

### 6.2 AI Capabilities Settings 页面变更

**变更前**:

- MCP 服务器卡片直接显示 API Key 输入框
- 直接在页面内编辑和保存密钥

**变更后**:

- MCP 服务器卡片显示密钥配置状态
- 显示掩码值
- 点击"配置密钥"跳转到密钥管理中心
- Tools 和 Skills 部分保持不变

```
┌─────────────────────────────────────────────────────────────────┐
│  AI 能力管理                                                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┬─────────┬─────────┐                                │
│  │  Tools  │ Skills  │   MCP   │                                │
│  └─────────┴─────────┴─────────┘                                │
│                                                                  │
│  [MCP Tab 选中时]                                                │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ┌──────┐                                                   │ │
│  │ │ Exa  │  Exa Search                           ✅ 已配置   │ │
│  │ │ Logo │  AI 驱动的搜索引擎 MCP 服务器                      │ │
│  │ └──────┘                                                   │ │
│  │                                                            │ │
│  │  状态: 🟢 已连接    API Key: exa-••••1234                  │ │
│  │                                                            │ │
│  │  功能: 🔍 搜索  📄 内容提取  🔗 相似查找                    │ │
│  │                                                            │ │
│  │  [配置密钥 →]  [测试连接]                     [启用/禁用]   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ┌──────┐                                                   │ │
│  │ │ BB   │  Browserbase                          ⚠️ 需配置   │ │
│  │ │ Logo │  云端浏览器自动化 MCP 服务器                       │ │
│  │ └──────┘                                                   │ │
│  │                                                            │ │
│  │  状态: ⚪ 未连接    API Key: 未配置                         │ │
│  │                                                            │ │
│  │  [配置密钥 →]                                              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**代码变更**:

```typescript
// AICapabilitiesSettings.tsx MCP 部分变更

function MCPServerCard({ server, secretStatus, onToggle }) {
  const router = useRouter();
  const secretKey = `mcp_${server.serverId}_api_key`;

  return (
    <div className="rounded-xl border-2 bg-white shadow-sm">
      {/* 服务器信息 */}
      <div className={`bg-gradient-to-r ${server.gradient} p-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ServerIcon icon={server.icon} />
            <div>
              <h3 className="text-white font-semibold">{server.name}</h3>
              <p className="text-white/80 text-sm">{server.description}</p>
            </div>
          </div>
          <SecretStatusBadge
            configured={secretStatus?.isConfigured}
            required={server.requiresApiKey}
          />
        </div>
      </div>

      {/* 状态信息 */}
      <div className="p-4">
        <div className="flex items-center gap-4 text-sm">
          <ConnectionStatus connected={server.connected} />
          {server.requiresApiKey && (
            <div>
              <span className="text-gray-500">API Key: </span>
              {secretStatus?.isConfigured ? (
                <span className="font-mono">{secretStatus.maskedValue}</span>
              ) : (
                <span className="text-amber-600">未配置</span>
              )}
            </div>
          )}
        </div>

        {/* 功能标签 */}
        <div className="mt-3 flex flex-wrap gap-2">
          {server.features?.map(feature => (
            <span key={feature} className="px-2 py-1 bg-gray-100 rounded text-xs">
              {feature}
            </span>
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="border-t px-4 py-3 flex justify-between">
        <div className="flex gap-2">
          {server.requiresApiKey && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/admin/secrets?highlight=${secretKey}`)}
            >
              配置密钥 →
            </Button>
          )}
          {secretStatus?.isConfigured && (
            <Button variant="outline" size="sm">
              测试连接
            </Button>
          )}
        </div>
        <Toggle enabled={server.enabled} onChange={onToggle} />
      </div>
    </div>
  );
}
```

---

## 7. 数据迁移方案

### 7.1 迁移步骤

```
Phase 1: 准备工作
├── 1.1 创建 secrets 表和相关索引
├── 1.2 初始化预定义密钥记录 (isConfigured=false)
└── 1.3 部署 SecretsService

Phase 2: 数据迁移
├── 2.1 从 AdminSettings 迁移 LLM 提供商密钥
├── 2.2 从 MCPServerConfigs 迁移 MCP 密钥
├── 2.3 从 .env 迁移可配置密钥 (首次启动时)
└── 2.4 验证迁移数据完整性

Phase 3: 代码切换
├── 3.1 修改 External API Settings 页面
├── 3.2 修改 AI Capabilities Settings 页面
├── 3.3 修改后端服务使用 SecretsService
└── 3.4 部署密钥管理中心页面

Phase 4: 清理
├── 4.1 标记旧表字段为 deprecated
├── 4.2 添加迁移完成标记
└── 4.3 下个版本移除旧字段
```

### 7.2 迁移脚本

```typescript
// secrets-migration.service.ts
@Injectable()
export class SecretsMigrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
  ) {}

  /**
   * 执行完整迁移
   */
  async migrate(): Promise<void> {
    this.logger.log("Starting secrets migration...");

    // 1. 初始化预定义密钥
    await this.secrets.initializeSecrets();

    // 2. 迁移 AdminSettings 中的 LLM 密钥
    await this.migrateFromAdminSettings();

    // 3. 迁移 MCPServerConfigs 中的密钥
    await this.migrateFromMCPConfigs();

    // 4. 迁移 .env 中的密钥 (如果数据库中未配置)
    await this.migrateFromEnv();

    this.logger.log("Secrets migration completed");
  }

  private async migrateFromAdminSettings(): Promise<void> {
    const adminSettings = await this.prisma.adminSettings.findFirst();
    if (!adminSettings?.settings) return;

    const settings = adminSettings.settings as any;
    const providers = settings.providers || {};

    const mapping = {
      openai: "openai_api_key",
      anthropic: "anthropic_api_key",
      xai: "xai_api_key",
      deepseek: "deepseek_api_key",
      google: "google_api_key",
    };

    for (const [provider, secretKey] of Object.entries(mapping)) {
      const apiKey = providers[provider]?.apiKey;
      if (apiKey) {
        await this.secrets.setSecret(
          secretKey,
          apiKey,
          {},
          {
            actor: "system",
            details: { migratedFrom: "AdminSettings" },
          },
        );
        this.logger.log(`Migrated ${secretKey} from AdminSettings`);
      }
    }
  }

  private async migrateFromMCPConfigs(): Promise<void> {
    const mcpConfigs = await this.prisma.mCPServerConfig.findMany({
      where: { apiKey: { not: null } },
    });

    for (const config of mcpConfigs) {
      if (config.apiKey) {
        const secretKey = `mcp_${config.serverId}_api_key`;
        await this.secrets.setSecret(
          secretKey,
          config.apiKey,
          {
            displayName: `MCP ${config.name} API Key`,
            category: SecretCategory.MCP,
            provider: config.serverId,
          },
          {
            actor: "system",
            details: { migratedFrom: "MCPServerConfigs" },
          },
        );
        this.logger.log(`Migrated ${secretKey} from MCPServerConfigs`);
      }
    }
  }

  private async migrateFromEnv(): Promise<void> {
    const envMapping = {
      TAVILY_API_KEY: "tavily_api_key",
      SERPER_API_KEY: "serper_api_key",
      PERPLEXITY_API_KEY: "perplexity_api_key",
      JINA_API_KEY: "jina_api_key",
      FIRECRAWL_API_KEY: "firecrawl_api_key",
    };

    for (const [envKey, secretKey] of Object.entries(envMapping)) {
      const value = process.env[envKey];
      if (value) {
        const isConfigured = await this.secrets.isConfigured(secretKey);
        if (!isConfigured) {
          await this.secrets.setSecret(
            secretKey,
            value,
            {},
            {
              actor: "system",
              details: { migratedFrom: "env" },
            },
          );
          this.logger.log(`Migrated ${secretKey} from .env`);
        }
      }
    }
  }
}
```

---

## 8. 安全考虑

### 8.1 加密存储

- 使用 AES-256-GCM 加密算法
- 每个密钥值使用随机 IV
- 加密密钥通过环境变量配置 (`SECRETS_ENCRYPTION_KEY`)
- 加密密钥本身不存储在数据库中

### 8.2 访问控制

- 所有密钥管理 API 需要管理员权限 (`AdminGuard`)
- 密钥读取操作记录审计日志
- 前端不直接获取明文值，只获取掩码

### 8.3 传输安全

- HTTPS 传输
- 设置密钥时使用 PUT 请求 (幂等)
- 响应不包含明文密钥值

### 8.4 审计追踪

- 记录所有密钥操作 (CREATE/READ/UPDATE/DELETE/TEST)
- 记录操作者、IP、时间
- 审计日志不可删除

---

## 9. 实施计划

### Phase 1: 基础设施 (第 1 周)

- [ ] 创建数据库迁移
- [ ] 实现 SecretsService
- [ ] 实现 SecretsCryptoService
- [ ] 实现 SecretsAuditService
- [ ] 编写单元测试

### Phase 2: API 开发 (第 1-2 周)

- [ ] 实现 SecretsController
- [ ] 实现迁移脚本
- [ ] 实现密钥测试功能
- [ ] API 文档

### Phase 3: 前端开发 (第 2 周)

- [ ] 开发密钥管理中心页面
- [ ] 改造 External API Settings 页面
- [ ] 改造 AI Capabilities Settings 页面
- [ ] 添加跳转和状态显示

### Phase 4: 测试和部署 (第 3 周)

- [ ] 集成测试
- [ ] 数据迁移测试
- [ ] 灰度发布
- [ ] 监控和告警

---

## 10. 附录

### 10.1 API 接口汇总

| 方法   | 路径                             | 描述             |
| ------ | -------------------------------- | ---------------- |
| GET    | `/admin/secrets`                 | 获取所有密钥状态 |
| GET    | `/admin/secrets/:key`            | 获取单个密钥状态 |
| PUT    | `/admin/secrets/:key`            | 设置密钥         |
| DELETE | `/admin/secrets/:key`            | 删除密钥         |
| POST   | `/admin/secrets/:key/test`       | 测试密钥         |
| GET    | `/admin/secrets/:key/audit-logs` | 获取审计日志     |

### 10.2 密钥标识命名规范

```
{category}_{provider}_{type}

示例:
- openai_api_key          (LLM)
- tavily_api_key          (Search)
- mcp_exa_api_key         (MCP)
- notion_client_id        (Integration)
- notion_client_secret    (Integration)
```

### 10.3 环境变量

```env
# 密钥加密主密钥 (必需，至少 32 字符)
SECRETS_ENCRYPTION_KEY=your-very-secure-encryption-key-at-least-32-chars

# 系统级密钥 (仍通过环境变量管理)
JWT_SECRET=your-jwt-secret
```

---

**文档版本**: v1.0
**创建日期**: 2026-01-12
**最后更新**: 2026-01-12
**作者**: Claude Code
