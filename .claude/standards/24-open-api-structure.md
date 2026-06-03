# Open API 目录结构规范（L4 系统/对外 API 网关）

**版本：** 1.0
**强制级别：** MUST
**生效日期：** 2026-06-03
**维护者：** Claude Code
**看护：** `backend/src/__tests__/architecture/layer-4-vocabulary/open-api-structure.spec.ts`（进 `verify:arch`）

> 本规范定义 `modules/open-api/`（L4）的子目录划分与命名。与 [16-ai-engine-harness-structure.md](16-ai-engine-harness-structure.md) §一·补·二「App vs System」配套：HTTP 入口只属 L4 open-api 与 L3 ai-app；engine/harness/platform 不开 HTTP（见标准 16 HTTP 看护）。

---

## 一、定位

`open-api` = **系统 / 对外 API 网关**。它是**薄 HTTP 层**：controller 只做 HTTP 适配 + 鉴权 + 委派下层 service，**不含业务逻辑**（业务逻辑在 ai-app / ai-engine / ai-harness / platform 的 service 里）。

## 二、子目录 = API 面（按"谁用 / 什么权限 / 什么范围"划分）

| 目录                            | 放什么                       | 判别                                    | 鉴权信号                         |
| ------------------------------- | ---------------------------- | --------------------------------------- | -------------------------------- |
| **admin/**                      | 运维 / 管理端点              | **操作员管平台 / 他人资源**             | `AdminGuard` + `/admin/*` 路由   |
| **system/**                     | 一方用户的系统服务           | **登录用户管自己**的账户级系统能力      | 用户 `JwtAuthGuard`，非 admin    |
| **public/**                     | 公开 / 匿名端点              | **任何人可访问**（unsubscribe、公共 AI）| `@Public` / RateLimit            |
| **a2a/** · **mcp/**             | 机器协议端点                 | **agent / 机器间标准协议**，非人类      | API-key / 协议鉴权               |
| **agents/ skills/ teams/ ai/**  | 程序化 SDK API               | **第三方 / SDK** 调的资源 API           | API-key / SDK token              |
| **webhooks/**                   | 入站回调                     | 外部系统**推**进来的事件                | 签名校验                         |

### 三个消歧问句

1. **admin 还是 system？** —— "操作员管别人/平台，还是用户管自己？" 管别人 + AdminGuard + `/admin/*` → **admin/**；管自己 + 用户 jwt → **system/**。
   （同一资源的管理面与用户面要**拆成两个 controller 类**分别归位，如 `AdminCreditsController`→admin/、`CreditsController`→system/。）
2. **system 还是 public？** —— "要不要登录？" 要 → system/；匿名 → public/。
3. **system/admin 还是 sdk？** —— "消费方是浏览器里的人，还是程序/合作方？" 人(jwt) → system/admin；程序(API-key) → agents/skills/teams/ai。

## 三、铁律（MUST，spec 看护）

1. **所有 `/admin/*` 路由唯一收在 `open-api/admin/`** —— 禁止散落在 byok-admin / mcp-admin / mcp-server / system 等。
2. **顶层目录名 = API 面语义，禁冗余后缀** —— 去 `-api` / `-admin` / `-server` / `-core`（open-api 已隐含）。顶层目录 ∈ `{admin, system, public, a2a, mcp, agents, skills, teams, ai, webhooks}`。
3. **协议族用子目录分面** —— `mcp/{server,admin}`、`a2a/{rpc,server,discovery}`，不平级散开。
4. **薄网关** —— open-api controller 禁止内嵌业务逻辑（重 service / 直接 Prisma 操作应下沉至 ai-app/ai-engine/ai-harness/platform 的 service）。
5. **目录名 ↔ 主路由前缀对齐**（agents 对 `/agents`，admin/byok 对 `/admin/byok/*`）。

## 四、整改进度（收缩 ALLOWLIST）

spec 用收缩 allowlist 跟踪存量违规，搬一个删一行，清空即硬焊：

- **admin 散落（违律 1）**：`mcp-admin/`、`mcp-server/mcp-server-admin`、`system/credits`(AdminCredits) —— 待收编 admin/mcp、admin/credits。
- **冗余后缀（违律 2）**：`ai-core`(→ai 待定命名)、`mcp-admin`+`mcp-server`(→mcp/{server,admin})、`teams-api`(→teams)。
- **逻辑泄漏 / admin 臃肿（违律 4，Wave C）**：`admin/services/`(7 个业务 service)、`admin/dashboard`(OpsDashboardService)、`admin/{ai,quota,teams}` 各 1 service、根 `admin.service.ts`、**9 个 controller 直接注入 `PrismaService`** —— 业务逻辑应下沉 platform/ai-app/ai-engine/ai-harness 的 service，open-api 只留薄 controller。

## 五、参考

- [16-ai-engine-harness-structure.md](16-ai-engine-harness-structure.md) §一·补·二 App vs System、§三·补 HTTP 接口面
- 整改三波：Wave A 去后缀（已合）· Wave B admin 收编（进行中）· Wave C 业务逻辑下沉（独立）
