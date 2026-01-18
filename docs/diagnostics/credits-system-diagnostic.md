# 积分系统诊断报告

> DeepDive Engine 积分系统全面诊断分析
>
> **诊断日期**: 2026-01-18
> **完成度评估**: 55-60%
> **状态**: 部分实现，关键集成缺失

---

## 执行摘要

DeepDive Engine 的积分系统处于**部分实现状态**，核心后端功能已完成，但前端展示和 AI 模块集成存在多个缺陷。整体完成度约 **55-60%**。

**关键发现**: 所有 AI 模块都声明了导入 CreditsService，但**都没有实现实际的消费逻辑**，导致积分系统形同虚设。

---

## 1. 系统架构分析

### 1.1 后端架构完整性

#### 已实现的核心模块

| 模块                   | 文件路径                                                       | 完整度 | 状态        |
| ---------------------- | -------------------------------------------------------------- | ------ | ----------- |
| **CreditsService**     | `backend/src/modules/credits/credits.service.ts`               | 95%    | ✅ 完整     |
| **CreditsController**  | `backend/src/modules/credits/credits.controller.ts`            | 90%    | ✅ 完整     |
| **CreditRulesService** | `backend/src/modules/credits/services/credit-rules.service.ts` | 70%    | ⚠️ 部分     |
| **CheckinService**     | `backend/src/modules/credits/services/checkin.service.ts`      | 85%    | ✅ 基本完整 |
| **数据库模型**         | `backend/prisma/schema/models.prisma`                          | 100%   | ✅ 完整     |

#### 数据库模型概览

**CreditAccount 表** (14 个字段)：

- 基础字段：`userId`, `balance`, `totalEarned`, `totalSpent`
- 赠送积分：`giftBalance`, `giftExpiresAt`
- 账户状态：`isActive`, `isFrozen`
- 每日统计：`todaySpent`, `todayDate`
- 时间戳：`createdAt`, `updatedAt`
- **缺失字段**：`subscriptionBalance`, `subscriptionExpiresAt` (PRD 中定义但未实现)

**CreditTransaction 表** (14 个字段)：

- 交易信息：`type`, `amount`, `balanceAfter`
- 模块追踪：`moduleType`, `operationType`, `referenceId`
- AI 详情：`tokenCount`, `modelName`
- **问题**：缺少 `modelType` 字段(PRD 定义有)，缺少 `orderId`, `paymentAmount` (支付字段)

**CreditRule 表** (10 个字段)：

- 规则配置：`moduleType`, `operationType`, `baseCredits`, `tokenMultiplier`
- 模型系数：`modelMultipliers` (JSON)
- **缺失字段**：`maxCreditsPerOperation` (上限控制)，`description`

**DailyCheckin 表** (6 个字段)：

- 签到信息：`userId`, `checkinDate`, `creditsEarned`
- 连续统计：`streakDays`
- **问题**：无外键关联 CreditAccount，直接关联 User；缺少 IP 追踪字段

---

### 1.2 前端架构完整性

#### 已实现的前端组件

| 组件                         | 文件路径                                                   | 完整度 | 状态        |
| ---------------------------- | ---------------------------------------------------------- | ------ | ----------- |
| **creditsStore**             | `frontend/stores/creditsStore.ts`                          | 80%    | ✅ 基本完整 |
| **useCredits Hook**          | `frontend/hooks/domain/useCredits.ts`                      | 85%    | ✅ 基本完整 |
| **CreditBadge**              | `frontend/components/credits/CreditBadge.tsx`              | -      | 待评估      |
| **CheckinModal**             | `frontend/components/credits/CheckinModal.tsx`             | -      | 待评估      |
| **InsufficientCreditsModal** | `frontend/components/credits/InsufficientCreditsModal.tsx` | -      | 待评估      |
| **CreditsPage**              | `frontend/app/credits/page.tsx`                            | 60%    | ⚠️ 部分     |

#### Store 和 Hook 功能完整性

**creditsStore 中实现的功能：**

- ✅ `fetchBalance()` - 轻量级余额查询
- ✅ `fetchAccount()` - 完整账户信息
- ✅ `fetchCheckinStatus()` - 签到状态
- ✅ `performCheckin()` - 执行签到
- ✅ `updateBalance()` - 本地余额更新
- ✅ 弹窗状态管理（积分不足、签到成功）

**useCredits Hook 中实现的功能：**

- ✅ 账户信息和余额
- ✅ 签到相关操作
- ✅ 弹窗控制
- ✅ 刷新操作
- ⚠️ **缺失**：预估积分消耗检查前端集成

---

### 1.3 AI 模块集成现状

#### 已有积分导入声明的模块

| 模块               | 文件                             | 导入 CreditsService | 调用 consumeCredits | 状态            |
| ------------------ | -------------------------------- | ------------------- | ------------------- | --------------- |
| **AI Ask**         | `ai-ask.service.ts`              | ✅ 第 19 行         | ❌ 未找到调用       | ⚠️ 导入但未使用 |
| **Topic Research** | `topic-research.service.ts`      | ✅ 第 52 行         | ❌ 未找到调用       | ⚠️ 导入但未使用 |
| **AI Teams**       | `ai-response.service.ts`         | ✅ 导入             | ❌ 未找到调用       | ⚠️ 导入但未使用 |
| **Deep Research**  | `deep-research-agent.service.ts` | ✅ 导入             | ❌ 未找到调用       | ⚠️ 导入但未使用 |

---

## 2. 功能完整性分析

### 2.1 积分获取方式

| 获取方式          | 状态      | 实现位置                    | 完整度 |
| ----------------- | --------- | --------------------------- | ------ |
| 初始赠送 (10,000) | ✅ 已实现 | `credits.service.ts:72-102` | 100%   |
| 每日签到          | ✅ 已实现 | `checkin.service.ts`        | 85%    |
| 连续签到奖励      | ✅ 已实现 | `checkin.service.ts:10-15`  | 85%    |
| 邀请奖励          | ❌ 未实现 | -                           | 0%     |
| 任务完成奖励      | ❌ 未实现 | -                           | 0%     |
| 充值购买          | ❌ 未实现 | -                           | 0%     |
| 订阅系统          | ❌ 未实现 | -                           | 0%     |

**签到具体实现分析：**

- 基础奖励：50 积分/天 (`CHECKIN_REWARDS.base = 50`)
- 7 天奖励：+100 积分 (`CHECKIN_REWARDS.streak7 = 100`)
- 30 天奖励：+300 积分 (`CHECKIN_REWARDS.streak30 = 300`)
- 防刷机制：新账户 24 小时限制、同 IP 限制 3 个账户

---

### 2.2 积分消费方式

#### 后端积分规则配置 (DEFAULT_RULES)

| 模块               | 操作类型          | 基础积分 | 状态    |
| ------------------ | ----------------- | -------- | ------- |
| **AI Ask**         | chat              | 10       | ✅ 配置 |
| **AI Ask**         | rag-chat          | 15       | ✅ 配置 |
| **AI Studio**      | research-quick    | 200      | ✅ 配置 |
| **AI Studio**      | research-standard | 500      | ✅ 配置 |
| **AI Studio**      | research-deep     | 1,000    | ✅ 配置 |
| **Topic Research** | refresh           | 2,000    | ✅ 配置 |
| **AI Teams**       | ai-reply          | 30       | ✅ 配置 |
| **AI Teams**       | debate            | 50       | ✅ 配置 |
| **AI Office**      | generate-ppt      | 300      | ✅ 配置 |
| **AI Office**      | generate-doc      | 200      | ✅ 配置 |
| **AI Office**      | generate-image    | 100      | ✅ 配置 |
| **AI Coding**      | code-generate     | 50       | ✅ 配置 |
| **AI Coding**      | code-review       | 30       | ✅ 配置 |

**关键问题**：

- ❌ 规则定义与实际服务调用**完全脱离**
- ❌ AI 模块虽导入 CreditsService，但**未调用 consumeCredits()**
- ❌ 没有"预估 → 检查 → 扣费"的完整流程
- ❌ 流式响应的积分处理逻辑未实现

---

### 2.3 积分查询和展示

#### 后端 API 端点

| 端点                             | 方法 | 实现                    | 状态 |
| -------------------------------- | ---- | ----------------------- | ---- |
| `/api/credits`                   | GET  | ✅ `getAccount()`       | 100% |
| `/api/credits/balance`           | GET  | ✅ `getBalance()`       | 100% |
| `/api/credits/stats`             | GET  | ✅ `getCreditsStats()`  | 100% |
| `/api/credits/transactions`      | GET  | ✅ `getTransactions()`  | 100% |
| `/api/credits/checkin/status`    | GET  | ✅ `getCheckinStatus()` | 100% |
| `/api/credits/checkin`           | POST | ✅ `performCheckin()`   | 85%  |
| `/api/credits/rules`             | GET  | ✅ `getAllRules()`      | 100% |
| `/api/credits/estimate`          | GET  | ✅ `estimateCredits()`  | 70%  |
| `/admin/credits/grant`           | POST | ✅                      | 100% |
| `/admin/credits/account/:userId` | GET  | ✅                      | 100% |

**API 完整性：后端 API 基本完整，但只是"孤岛"——没有 AI 模块调用。**

#### 前端显示页面

| 页面            | 文件                           | 实现    | 状态   |
| --------------- | ------------------------------ | ------- | ------ |
| 积分中心        | `/app/credits/page.tsx`        | ✅ 部分 | 60%    |
| 签到弹窗        | `CheckinModal.tsx`             | ✅      | 待确认 |
| 余额不足弹窗    | `InsufficientCreditsModal.tsx` | ✅      | 待确认 |
| Header 积分徽章 | `CreditBadge.tsx`              | ✅      | 待确认 |

**缺失的前端功能：**

- ❌ 每日消耗统计图表 (按模块分布)
- ❌ 消耗趋势折线图
- ❌ 交易记录详细筛选
- ❌ 积分不足时的充值入口
- ❌ 积分过期提醒
- ❌ 管理后台规则管理页面

---

## 3. 问题识别

### 3.1 功能缺失 (Critical)

#### P0 级别问题

| 问题                      | 影响                            | 严重度   | 位置                 |
| ------------------------- | ------------------------------- | -------- | -------------------- |
| **AI 模块未集成消费逻辑** | 用户可无限调用 AI，积分形同虚设 | Critical | 所有 AI 模块         |
| **流式响应积分处理缺失**  | 无法准确计费，可能无法收费      | Critical | `credits.service.ts` |
| **支付系统未实现**        | 用户无法充值，无商业模式        | Critical | 整个系统             |
| **订阅系统未实现**        | PRD 规划的周期积分失效          | Critical | 整个系统             |

#### P1 级别问题

| 问题                   | 影响                      | 位置                 |
| ---------------------- | ------------------------- | -------------------- |
| **邀请奖励未实现**     | 无法激励用户邀请          | `credits.service.ts` |
| **积分过期处理缺失**   | 赠送积分无法到期扣除      | 整个系统             |
| **每日消耗重置未实现** | todaySpent 无法自动重置   | 定时任务缺失         |
| **防刷机制不完整**     | DailyCheckin 表无 IP 字段 | `schema.prisma`      |
| **管理后台页面缺失**   | 无法进行手工运营          | 前端                 |

---

### 3.2 代码质量问题

#### 数据库设计问题

**问题 1：CreditTransaction 表缺少关键字段**

```
缺失：modelType (CHAT_FAST, CHAT, CHAT_ADVANCED)
缺失：orderId, paymentAmount (支付相关)
缺失：status (未来支持待处理交易)
```

**问题 2：DailyCheckin 表设计缺陷**

```prisma
model DailyCheckin {
  id     String @id
  userId String   // ❌ 直接关联 User，而不是 CreditAccount
  // ❌ 缺少 ip_address 字段用于防刷
  // ❌ 缺少 device_fingerprint 字段
  // ❌ 缺少 user_agent 字段
}
```

**问题 3：CreditAccount 表缺少字段**

```
缺失：subscriptionBalance, subscriptionExpiresAt (订阅字段)
缺失：version (乐观锁版本号)
缺失：lastActivityAt (最后活动时间)
```

---

#### 服务层问题

**问题 4：CreditsService.consumeCredits() 的缺陷**

位置：`backend/src/modules/credits/credits.service.ts:215-327`

```typescript
// ❌ 缺陷1：没有预扣机制
// ❌ 缺陷2：流式响应无法正确处理
// ❌ 缺陷3：没有 token 计数接口抽象
// ❌ 缺陷4：没有"预估 → 检查 → 扣费"的完整流程
```

**问题 5：CreditRulesService 不完整**

位置：`backend/src/modules/credits/services/credit-rules.service.ts:1-93`

```typescript
// ✅ 有 DEFAULT_RULES 配置
// ❌ 缺失：缓存机制
// ❌ 缺失：动态规则更新后的缓存失效
// ❌ 缺失：规则热加载
// ❌ 缺失：模型系数的灵活配置
```

**问题 6：CheckinService 防刷不足**

位置：`backend/src/modules/credits/services/checkin.service.ts`

```typescript
// ✅ 有新账户 24 小时限制
// ✅ 有同 IP 限制
// ❌ 缺失：设备指纹检测
// ❌ 缺失：黑名单 IP 机制
// ❌ 缺失：异常行为检测 (连续不同 IP 签到)
```

---

#### 前端问题

**问题 7：积分 Store 缺少数据同步**

位置：`frontend/stores/creditsStore.ts`

```typescript
// ❌ fetchBalance() 中没有错误重试机制
// ❌ 401 错误被静默忽略（第 145-148 行）
// ❌ 没有自动刷新机制（定时轮询）
// ❌ updateBalance() 直接修改，无版本校验
// ❌ 没有离线支持
```

**问题 8：useCredits Hook 初始化逻辑不足**

位置：`frontend/hooks/domain/useCredits.ts:49-54`

```typescript
// ❌ 只在 !store.account 时加载
// ❌ 没有定时刷新逻辑
// ❌ 没有页面可见性检测（标签页切换时刷新）
// ❌ 没有错误恢复机制
```

**问题 9：CreditsPage 页面显示缺陷**

位置：`frontend/app/credits/page.tsx`

```typescript
// ✅ 显示基本余额和签到
// ❌ 缺少使用统计图表
// ❌ 缺少每日消耗折线图
// ❌ 缺少按模块分布饼图
// ❌ 缺少交易记录的详细筛选和导出
// ❌ 缺少积分过期提醒
```

---

### 3.3 集成问题

#### P0 级别：AI 模块集成断裂

| 模块           | 导入状态  | 调用状态  | 实现进度 |
| -------------- | --------- | --------- | -------- |
| AI Ask         | ✅ 导入   | ❌ 未调用 | 0% 实现  |
| Topic Research | ✅ 导入   | ❌ 未调用 | 0% 实现  |
| AI Teams       | ✅ 导入   | ❌ 未调用 | 0% 实现  |
| Deep Research  | ✅ 导入   | ❌ 未调用 | 0% 实现  |
| AI Office      | ❌ 未导入 | ❌ 未调用 | 0% 实现  |
| AI Simulation  | ❌ 未导入 | ❌ 未调用 | 0% 实现  |

**根本原因**：AI 模块只导入了 CreditsService，但从未在业务逻辑中调用 `consumeCredits()`。

**用户影响**：

- 用户可以无限制使用所有 AI 功能
- 没有成本控制
- 无法实现付费转化

---

### 3.4 性能问题

**问题 10：缓存机制缺失**

```
PRD 规划的缓存（§5.5）：
  - credits:balance:{userId} (TTL: 60s)
  - credits:account:{userId} (TTL: 300s)
  - credits:rules:{moduleType} (TTL: 3600s)

实现现状：❌ 完全未实现
```

后果：

- 高频 `getBalance()` 调用会直接 hit 数据库
- 余额查询可能成为热点瓶颈
- 无法支撑高并发

---

**问题 11：并发安全性**

文件：`backend/src/modules/credits/credits.service.ts:256-320`

```typescript
// ✅ 使用了事务 (tx)
// ✅ 使用了 FOR UPDATE (隐式)
// ❌ 隔离级别设置不明确
// ❌ 没有乐观锁备选方案 (version 字段)
// ❌ 超额扣费 (-500 限制) 的处理逻辑过于宽松
```

---

### 3.5 监控和运维问题

**问题 12：缺少定时任务**

PRD 中规划的定时任务（§10.2）：

- ❌ 积分过期处理 (每日 01:00)
- ❌ 每日消耗重置 (每日 00:00)
- ❌ 连续签到重置 (每日 00:05)
- ❌ 异常消费检测 (每 10 分钟)
- ❌ 缓存预热 (每 5 分钟)
- ❌ 统计报表生成 (每日 02:00)

---

## 4. 改进建议

### 优先级排序

#### Phase 0：关键修复 (1-2 周)

1. **AI 模块积分消费集成** - 在所有 AI 模块中添加 `consumeCredits()` 调用
2. **流式响应处理** - 实现"预扣 + 结算"的流式积分计费
3. **前端积分检查** - 在 AI 操作前显示积分不足弹窗

#### Phase 1：功能完善 (2-3 周)

4. 实现支付/充值系统
5. 添加定时任务（过期、重置、检测）
6. 完善管理后台

#### Phase 2：性能优化 (1-2 周)

7. 实现 Redis 缓存层
8. 添加监控和告警

---

### 具体修复建议

**修复 1：在 AI Ask 中集成积分消费**

```typescript
// backend/src/modules/ai-app/ask/ai-ask.service.ts

async sendMessage(userId: string, message: string) {
  // 1. 预估积分
  const estimate = await this.creditsService.estimateCredits({
    moduleType: "ai-ask",
    operationType: "chat",
    tokenCount: this.estimateTokens(message),
  });

  // 2. 检查余额
  const check = await this.creditsService.checkBalance(userId, estimate);
  if (!check.sufficient) {
    throw new InsufficientCreditsException(estimate, check.balance);
  }

  // 3. 执行 AI 调用
  const response = await this.aiService.chat(message);

  // 4. 扣费
  await this.creditsService.consumeCredits({
    userId,
    moduleType: "ai-ask",
    operationType: "chat",
    tokenCount: response.usage.totalTokens,
    referenceId: response.sessionId,
  });

  return response;
}
```

---

**修复 2：完善 CreditTransaction 表**

```prisma
model CreditTransaction {
  // ... 现有字段 ...

  // 新增字段
  modelType     String? @map("model_type")
  orderId       String? @map("order_id")
  paymentAmount Decimal? @map("payment_amount") @db.Decimal(10, 2)
  status        String? @default("completed")

  @@index([status, createdAt(sort: Desc)])
}
```

---

**修复 3：实现 Redis 缓存层**

```typescript
@Injectable()
export class CreditsCacheService {
  constructor(private redis: RedisService) {}

  async getBalance(userId: string): Promise<number> {
    const cached = await this.redis.get(`credits:balance:${userId}`);
    if (cached !== null) return parseInt(cached);

    const balance = await this.fetchFromDB(userId);
    await this.redis.setex(`credits:balance:${userId}`, 60, balance.toString());
    return balance;
  }

  async invalidate(userId: string): Promise<void> {
    await this.redis.del(`credits:balance:${userId}`);
    await this.redis.del(`credits:account:${userId}`);
  }
}
```

---

**修复 4：添加定时任务**

```typescript
@Injectable()
export class CreditsTasksService {
  @Cron("0 1 * * *") // 每日凌晨 1 点
  async processExpirations() {
    // 处理过期赠送积分
  }

  @Cron("0 0 * * *") // 每日凌晨 0 点
  async resetDailySpent() {
    // 重置 todaySpent 为 0
  }

  @Cron("*/10 * * * *") // 每 10 分钟
  async detectAnomalies() {
    // 检测异常消费
  }
}
```

---

## 5. 关键文件清单

### 核心后端文件

| 文件                                                           | 行数       | 完整度 | 问题                   |
| -------------------------------------------------------------- | ---------- | ------ | ---------------------- |
| `backend/src/modules/credits/credits.service.ts`               | 743        | 95%    | 流式响应处理、缓存缺失 |
| `backend/src/modules/credits/credits.controller.ts`            | 342        | 90%    | 权限控制不足           |
| `backend/src/modules/credits/services/credit-rules.service.ts` | 150+       | 70%    | 缓存机制缺失           |
| `backend/src/modules/credits/services/checkin.service.ts`      | 200+       | 85%    | 防刷机制不完整         |
| `backend/prisma/schema/models.prisma`                          | (相关部分) | 85%    | 字段缺失、关联设计缺陷 |

### 前端文件

| 文件                                  | 完整度 | 问题                   |
| ------------------------------------- | ------ | ---------------------- |
| `frontend/stores/creditsStore.ts`     | 80%    | 缓存同步、重试机制缺失 |
| `frontend/hooks/domain/useCredits.ts` | 85%    | 初始化逻辑不足         |
| `frontend/app/credits/page.tsx`       | 60%    | UI 展示不完整          |

### AI 模块文件（需要集成）

| 文件                                                                           | 积分集成 | 优先级 |
| ------------------------------------------------------------------------------ | -------- | ------ |
| `backend/src/modules/ai-app/ask/ai-ask.service.ts`                             | ❌ 缺失  | P0     |
| `backend/src/modules/ai-app/research/topic-research/topic-research.service.ts` | ❌ 缺失  | P0     |
| `backend/src/modules/ai-app/teams/services/ai/ai-response.service.ts`          | ❌ 缺失  | P0     |
| `backend/src/modules/ai-app/office/ai-office.module.ts`                        | ❌ 缺失  | P0     |

---

## 6. 总体评估

### 完成度统计

```
后端实现：       65%
  ├─ Service 层: 95%
  ├─ Controller: 90%
  ├─ DAO 层:     85%
  ├─ 数据库:     85%
  └─ 集成:       0% ❌

前端实现：       50%
  ├─ Store:      80%
  ├─ Hooks:      85%
  ├─ 页面:       60%
  └─ 组件:       待评

AI 模块集成：    0% ❌

整体完成度：     55-60%
```

---

### 阻塞因素

| 问题                           | 影响         | 是否阻塞 |
| ------------------------------ | ------------ | -------- |
| AI 模块未调用 consumeCredits() | 核心功能失效 | 严重     |
| 流式响应积分处理缺失           | 无法准确计费 | 严重     |
| 支付系统未实现                 | 无商业模式   | 严重     |
| 前端 UI 不完整                 | 用户体验差   | 中等     |
| 缓存和监控缺失                 | 性能和运维   | 中等     |

---

## 总结

DeepDive Engine 的积分系统有**完整的后端架构**，但存在**关键集成缺陷**：AI 模块虽导入了 CreditsService，但**从未调用消费逻辑**，导致积分系统形同虚设。这是一个**"孤岛"问题**——系统本身可用，但与业务流程脱离。

**最优先的修复**是在所有 AI 模块中补充消费调用，这将大幅提升系统价值。

---

**最后更新**: 2026-01-18
**诊断人**: Claude Code
