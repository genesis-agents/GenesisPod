# DeepDive Engine 改进任务清单

> 基于代码审计的完整改进方案
> 部署环境: Railway | 数据库: PostgreSQL (单一)
> 生成日期: 2025-12-15

---

## 执行摘要

| 类别 | 任务数 | 预估总工时 |
|------|--------|-----------|
| P0 - 紧急 | 12 | ~20h |
| P1 - 重要 | 18 | ~60h |
| P2 - 改进 | 15 | ~50h |
| P3 - 优化 | 10 | ~40h |
| **总计** | **55** | **~170h** |

---

## P0 - 紧急任务 (本周完成)

### 架构清理

| # | 任务 | 文件/位置 | 工时 | 说明 |
|---|------|----------|------|------|
| 1 | 精简 docker-compose.yml | `/docker-compose.yml` | 0.5h | 移除 neo4j, mongo, qdrant 服务定义 |
| 2 | 清理环境变量模板 | `/.env.example`, `/backend/.env.example` | 0.5h | 移除 NEO4J_*, MONGO_*, QDRANT_* 变量 |
| 3 | 添加启动配置验证 | `/backend/src/main.ts` | 2h | 启动时验证必需环境变量，失败则拒绝启动 |

### 安全修复

| # | 任务 | 文件/位置 | 工时 | 说明 |
|---|------|----------|------|------|
| 4 | 移除硬编码 Admin 邮箱 | `/backend/src/common/guards/admin.guard.ts:8` | 1h | 迁移到环境变量 ADMIN_EMAILS |
| 5 | 移除硬编码 Admin 邮箱 (重复) | `/backend/src/modules/core/admin/admin.service.ts` | 0.5h | 统一使用 ConfigService |
| 6 | 移除硬编码 Storage Key | `/backend/src/modules/core/storage/storage.controller.ts` | 0.5h | ADMIN_KEY 迁移到环境变量 |

### 用户体验修复

| # | 任务 | 文件/位置 | 工时 | 说明 |
|---|------|----------|------|------|
| 7 | 隐藏/移除 Dark Mode 开关 | `/frontend/app/labs/page.tsx` | 0.5h | 功能未实现，开关造成困惑 |
| 8 | 隐藏 "Coming Soon" 按钮 | 多个文件 | 1h | Text-to-Image, Similar Resources 等 |
| 9 | 添加全局错误 Toast | `/frontend/components/` | 3h | API 调用失败时显示友好提示 |
| 10 | 修复知识图谱 Unlink API | `/backend/src/modules/` | 3h | 实现取消资源关联功能 |

### CI/CD 修复

| # | 任务 | 文件/位置 | 工时 | 说明 |
|---|------|----------|------|------|
| 11 | 启用测试覆盖率上报 | `/.github/workflows/ci.yml:95,125` | 1h | 取消注释 codecov 上传步骤 |
| 12 | 设置覆盖率基线 | `/backend/jest.config.js` | 0.5h | 当前 50% 阈值，逐步提升 |

---

## P1 - 重要任务 (2周内完成)

### 神类拆分 (代码可维护性)

| # | 任务 | 文件 | 当前行数 | 目标 | 工时 |
|---|------|------|---------|------|------|
| 13 | 拆分 ai-image.service.ts | `/backend/src/modules/ai/ai-image/ai-image.service.ts` | 4,879 | <1000/文件 | 8h |
| 14 | 拆分 ExploreContent.tsx | `/frontend/components/explore/ExploreContent.tsx` | 4,207 | <500/文件 | 6h |
| 15 | 拆分 ai-simulation 页面 | `/frontend/app/ai-simulation/page.tsx` | 4,376 | <500/文件 | 6h |
| 16 | 拆分 ai-teams.service.ts | `/backend/src/modules/ai/ai-teams/ai-teams.service.ts` | 3,409 | <1000/文件 | 6h |
| 17 | 拆分 ImageGenerator.tsx | `/frontend/components/ai-image/ImageGenerator.tsx` | 3,182 | <500/文件 | 4h |

**拆分策略示例 (ai-image.service.ts):**
```
ai-image/
├── ai-image.service.ts          (~800行, 协调层)
├── image-generation.service.ts  (~800行, 生成逻辑)
├── prompt-engineering.service.ts(~600行, 提示词)
├── template-rendering.service.ts(~1000行, 模板渲染)
├── style-preset.service.ts      (~500行, 样式预设)
└── image-export.service.ts      (~400行, 导出)
```

### 性能优化

| # | 任务 | 位置 | 工时 | 说明 |
|---|------|------|------|------|
| 18 | 添加 Promise 并发限制 | 后端 39 处 Promise.all | 4h | 使用 p-limit 限制并发数为 5-10 |
| 19 | 前端 React.memo 优化 | 大型列表组件 | 4h | ResourceCard, ExploreGrid 等 |
| 20 | 添加 useMemo/useCallback | 复杂计算/事件处理 | 4h | 减少不必要重渲染 |
| 21 | 实现代码分割 | `/frontend/app/` | 4h | 路由级别 lazy loading |

### 数据库优化 (PostgreSQL)

| # | 任务 | 位置 | 工时 | 说明 |
|---|------|------|------|------|
| 22 | 添加 JSONB GIN 索引 | Prisma migration | 2h | RawData.data 字段索引 |
| 23 | 添加复合索引 | Prisma schema | 2h | userId+createdAt 等常用查询 |
| 24 | 修复 N+1 查询 | collections.service.ts 等 | 4h | 使用 select/include 优化 |
| 25 | 添加分页限制 | 所有 findMany 查询 | 3h | 默认 limit 100，防止 OOM |

### 类型安全

| # | 任务 | 位置 | 工时 | 说明 |
|---|------|------|------|------|
| 26 | 修复 `any` 类型 | 213 处 | 6h | 替换为正确类型 |
| 27 | 移除 console.log | 249 处 | 2h | 保留 error/warn，移除 log |
| 28 | 修复 DTO 验证 | `/backend/src/**/dto/` | 3h | 添加 @MaxLength, @MinLength 等 |

### 功能完善

| # | 任务 | 位置 | 工时 | 说明 |
|---|------|------|------|------|
| 29 | 完成 PPT 导出功能 | `/backend/src/modules/ai/ai-office/ppt/` | 6h | TODO 标记的导出功能 |
| 30 | 完成 PPT 单页更新 | 同上 | 4h | TODO 标记的更新功能 |

---

## P2 - 改进任务 (1个月内)

### 测试覆盖

| # | 任务 | 位置 | 工时 | 说明 |
|---|------|------|------|------|
| 31 | ai-orchestration 单元测试 | `/backend/src/common/ai-orchestration/` | 6h | 当前 57% → 90% |
| 32 | ai-teams 单元测试 | `/backend/src/modules/ai/ai-teams/` | 8h | 当前 0% → 70% |
| 33 | ai-core 单元测试 | `/backend/src/modules/ai/ai-core/` | 6h | 当前 25% → 70% |
| 34 | 前端组件测试 | `/frontend/components/` | 8h | 关键组件集成测试 |
| 35 | E2E 测试框架搭建 | `/e2e/` | 6h | Playwright 基础设施 |

### 可观测性

| # | 任务 | 位置 | 工时 | 说明 |
|---|------|------|------|------|
| 36 | 添加结构化日志 | 全局 | 4h | 统一日志格式，添加 traceId |
| 37 | 添加请求追踪 ID | `/backend/src/common/middleware/` | 3h | 请求全链路追踪 |
| 38 | 集成 Sentry | `/backend/src/common/filters/` | 3h | 错误监控 (TODO 已标记) |
| 39 | 添加性能监控 | `/backend/src/` | 4h | 慢查询、API 响应时间 |

### API 改进

| # | 任务 | 位置 | 工时 | 说明 |
|---|------|------|------|------|
| 40 | 添加 Swagger 文档 | `/backend/src/main.ts` | 4h | OpenAPI 自动生成 |
| 41 | 统一响应格式 | 所有 Controller | 4h | 标准化 success/error 结构 |
| 42 | 添加 API 版本控制 | `/backend/src/` | 2h | /api/v1/, /api/v2/ |

### 用户体验

| # | 任务 | 位置 | 工时 | 说明 |
|---|------|------|------|------|
| 43 | 新用户引导流程 | `/frontend/components/onboarding/` | 6h | 3-5 步骤引导 |
| 44 | 添加 ARIA 无障碍 | 全前端 | 4h | aria-label, role 属性 |
| 45 | 表单验证改进 | `/frontend/components/` | 4h | 使用 Zod + react-hook-form |

---

## P3 - 优化任务 (长期)

### 架构优化

| # | 任务 | 位置 | 工时 | 说明 |
|---|------|------|------|------|
| 46 | 添加 Redis 缓存 | Railway Redis | 6h | 替代内存缓存，支持多实例 |
| 47 | 实现缓存预热 | `/backend/src/` | 4h | 启动时加载热点数据 |
| 48 | 添加断路器模式 | AI 服务调用 | 4h | 防止级联故障 |

### 安全加固

| # | 任务 | 位置 | 工时 | 说明 |
|---|------|------|------|------|
| 49 | 添加 SSRF 防护 | web-scraper.service.ts | 3h | URL 白名单验证 |
| 50 | 敏感端点限流 | auth endpoints | 2h | 5次/分钟登录尝试限制 |
| 51 | API Key 加密存储 | 数据库 | 4h | 加密第三方 API 密钥 |

### CI/CD 增强

| # | 任务 | 位置 | 工时 | 说明 |
|---|------|------|------|------|
| 52 | 添加安全扫描 | `.github/workflows/` | 3h | Trivy + OWASP 依赖检查 |
| 53 | 添加性能回归测试 | `.github/workflows/` | 4h | Lighthouse CI |
| 54 | 添加迁移干跑 | `.github/workflows/` | 2h | PR 时验证 Prisma 迁移 |

### 文档完善

| # | 任务 | 位置 | 工时 | 说明 |
|---|------|------|------|------|
| 55 | 用户操作指南 | `/docs/user-guide/` | 8h | 功能使用说明 |

---

## TODO/FIXME 清理清单

以下是代码中标记的 37 个 TODO/FIXME，需逐一处理：

### 高优先级 TODO

| 文件 | 行号 | 内容 | 建议 |
|------|------|------|------|
| `ai-office/chat/route.ts` | 338 | VerificationAgent 后处理 | 实现或移除 |
| `ppt-generation.controller.ts` | 427 | 单页内容更新 | 实现 |
| `ppt-generation.controller.ts` | 438 | 导出功能 | 实现 |
| `ppt-generation.controller.ts` | 449 | 删除功能 | 实现 |
| `ppt-generation.controller.ts` | 468 | 列表功能 | 实现 |
| `office-document.service.ts` | 517 | AI 模型生成描述 | 实现 |
| `data-source.service.ts` | 206 | 连接测试逻辑 | 实现 |

### 中优先级 TODO

| 文件 | 行号 | 内容 | 建议 |
|------|------|------|------|
| `ExploreContent.tsx` | - | userId: 'current-user' | 使用真实用户 ID |
| `DocumentEditor.tsx` | - | userId: 'current_user' | 使用真实用户 ID |
| `DesignerTab.tsx` | - | 模板选择实现 | 实现或移除 UI |
| `SystemSettings.tsx` | - | 保存逻辑实现 | 实现 |
| `DocsTab.tsx` | 201 | 模板选择实现 | 实现 |
| `resource/[id]/page.tsx` | 140 | 书签切换 | 实现 |

### 低优先级 TODO

| 文件 | 行号 | 内容 | 建议 |
|------|------|------|------|
| `all-exceptions.filter.ts` | 209 | Sentry 集成 | P2 任务 #38 |
| `quality.service.ts` | 68 | 从 resource 表获取标题 | 实现 |
| `blog-collection.service.ts` | 78 | 数据库实现 | 评估是否需要 |

---

## 质量指标目标

| 指标 | 当前值 | 1个月目标 | 3个月目标 |
|------|--------|----------|----------|
| 测试覆盖率 (后端) | 6.7% | 40% | 70% |
| 测试覆盖率 (前端) | ~0% | 20% | 50% |
| 神类数量 (>1000行) | 28 | 15 | <5 |
| TypeScript `any` | 213 | 100 | 0 |
| console.log | 249 | 50 | 0 |
| TODO/FIXME | 37 | 20 | 0 |
| ARIA 覆盖率 | 0% | 50% | 90% |

---

## 执行建议

### 第 1 周
```
重点: P0 全部完成
- Day 1-2: 架构清理 (#1-3)
- Day 3: 安全修复 (#4-6)
- Day 4: 用户体验 (#7-9)
- Day 5: CI/CD + 知识图谱 (#10-12)
```

### 第 2-3 周
```
重点: P1 神类拆分 + 性能优化
- Week 2: #13-17 神类拆分
- Week 3: #18-25 性能 + 数据库
```

### 第 4 周
```
重点: P1 类型安全 + 功能完善
- #26-30 类型修复 + PPT 功能
```

### 第 5-8 周
```
重点: P2 测试 + 可观测性
- 逐步提升测试覆盖率
- 添加监控和追踪
```

---

## 相关文档

- [数据采集 API 文档](/docs/api/data-collection-api.md)
- [AI Office PRD](/docs/features/ai-office-prd-v2.0.md)
- [架构决策记录](/docs/architecture/)
- [部署指南](/docs/guides/)

---

*此文档应随项目进展持续更新*
