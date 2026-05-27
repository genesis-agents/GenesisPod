# 架构看护规则 (Architecture Guard Rules)

> 本目录用 jest spec 落地 [ARCHITECTURE_RULES.md](../../../../docs/architecture/ARCHITECTURE_RULES.md)
> 的 6 层 + 8 硬规则。任何架构违规先被 spec 接住；改不掉只能登记
> [EXCEPTIONS.md](../../../../docs/architecture/EXCEPTIONS.md)。

---

## 1. 子目录组织（6 层 → 子目录）

| 子目录                 | 对应规则                                 | 干嘛                                                                  |
| ---------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `layer-1-topology/`    | 第 1-2 层 拓扑 + 依赖方向                | ai-app → harness → engine → infra 单向 / facade 穿透 / DI 边界        |
| `layer-3-authority/`   | 第 3 层 权威（canonical truth）          | mission view 单一真相、event 契约、agent-team facade                  |
| `layer-4-vocabulary/`  | 第 4 层 词汇纯净 + 硬规则 #2/#3          | harness/engine 不出现 app-specific 业务词                             |
| `layer-6-durability/`  | 第 6 层 持久 + 可观察 + 硬规则 #6        | projector 是纯函数、replay 幂等                                       |
| `layer-7-uplift-gate/` | 上提门 + 硬规则 #7                       | harness 新文件必须 ≥2 mission app consumer                            |
| `model-capability/`    | 横向：model / capability / safety domain | aimodelconfig 单源、provider chain shape、pricing、seed governance 等 |
| `runtime-contracts/`   | 横向：runtime / plugin / protection-net  | snapshot contract、plugin 系统、protection-net、consistency           |

> 第 5 层（前端封闭）→ 实际 spec 在 `frontend/__tests__/` 下，不放本目录。
> 第 8 层（例外登记）→ `docs/architecture/EXCEPTIONS.md`，不是 spec。

每个子目录可放一个本地 `README.md` 说明该层规则细节（可选）。

---

## 2. 命名规范

| 命名段               | 用途                                          | 示例                                           |
| -------------------- | --------------------------------------------- | ---------------------------------------------- |
| `*.spec.ts`          | 普通架构断言（永久守护）                      | `vocab-purity.spec.ts`                         |
| `*.contract.spec.ts` | 现状契约快照（随路线图阶段更新/删除）         | `aimodelconfig-single-source.contract.spec.ts` |
| `*-baseline.spec.ts` | 含 baseline 的过渡态 spec（注入 EXEMPT 列表） | `harness-uplift-gate.spec.ts`                  |

> contract spec 单独有 [CONTRACT_README.md](./CONTRACT_README.md) 流程文档，看 baseline 更新约定。

---

## 3. 增 / 改 spec 的流程

### 增 spec（新的架构规则）

1. **先改 [ARCHITECTURE_RULES.md](../../../../docs/architecture/ARCHITECTURE_RULES.md)** —— 明确规则属于哪一层、什么 check、什么时候 fail
2. **决定子目录** —— 按上面 6 层表选位置；落不进 6 层就开新子目录（先在 PR 讨论）
3. **写 spec** —— 路径常量必须用相对 `__dirname`：
   ```typescript
   // architecture/layer-X/foo.spec.ts → backend/
   const PROJECT_ROOT = path.join(__dirname, "..", "..", "..", "..");
   ```
4. **跑 spec** —— 通常会 fail（存量违规）。两条路：
   - (a) 修代码让 spec 过
   - (b) 在 [EXCEPTIONS.md](../../../../docs/architecture/EXCEPTIONS.md) 登记例外 + spec 内加 `EXEMPT_PATHS`
5. **PR description 标 `[arch-rule-added]`**

### 改 spec（放松 / 收紧 / 移除）

| 动作                | PR description 标          | 强制内容                                |
| ------------------- | -------------------------- | --------------------------------------- |
| 放松 / 移除某个断言 | `[arch-rule-loosened]`     | 必须解释为什么不再需要 + 是否有替代规则 |
| 加严某个断言        | `[arch-rule-strengthened]` | 必须列出可能受影响的代码 + 修复方案     |
| 加例外条目          | `[arch-exception]`         | 5 字段必填（见 EXCEPTIONS.md）          |
| 删例外              | `[arch-exception-removed]` | 必须先实际修了，再删例外                |

---

## 4. 例外（EXEMPT_PATHS）规范

> 例外不是"灰名单"——是已登记、有移除期限、有责任人的合法偏离。

- **spec 内** 用 `EXEMPT_PATHS: ReadonlySet<string>` 维护例外
- **EXCEPTIONS.md** 同步必须有对应 E### 条目（5 字段：位置 / 违反规则 / 为什么允许 / 负责人 / 移除截止）
- spec 加例外的 PR 必须同时改 EXCEPTIONS.md，否则 reviewer 直接 reject
- 自动审计：未来可加 `architecture-exceptions-consistency.spec.ts` 比对 spec 内 EXEMPT_PATHS 与 EXCEPTIONS.md 引用一致

---

## 5. 存量 spec 迁移计划（flat → 6-layer 子目录）

下表是当前平铺的 spec 与目标子目录的映射。**新 spec 必须按此结构归位**，存量 spec
**逐个 PR 渐进迁移**（每次 PR 只挪 2-3 个，连带更新 `__dirname` 路径）。

| 现状（flat）                                          | 目标子目录            | 备注                      |
| ----------------------------------------------------- | --------------------- | ------------------------- |
| `layer-boundaries.spec.ts`                            | `layer-1-topology/`   | 主入口，谨慎挪，CI 引用多 |
| `no-app-cross-coupling.spec.ts`                       | `layer-1-topology/`   |                           |
| `module-di-wiring.spec.ts`                            | `layer-1-topology/`   |                           |
| `canonical-view-pattern.spec.ts`                      | `layer-3-authority/`  |                           |
| `mission-contract-guards.spec.ts`                     | `layer-3-authority/`  |                           |
| `mission-app-conformance.spec.ts`                     | `layer-3-authority/`  |                           |
| `playground-event-contract.spec.ts`                   | `layer-3-authority/`  |                           |
| `playground-frontend-contract.spec.ts`                | `layer-3-authority/`  |                           |
| `agent-team-facade-contract.spec.ts`                  | `layer-3-authority/`  |                           |
| `agent-team-layout.spec.ts`                           | `layer-3-authority/`  |                           |
| `infer-is-reasoning-callers.contract.spec.ts`         | `layer-4-vocabulary/` | 跟随 vocab-purity         |
| `aimodelconfig-single-source.contract.spec.ts`        | `model-capability/`   |                           |
| `audit-capability-anti-patterns.spec.ts`              | `model-capability/`   |                           |
| `capability-provider-string-match.contract.spec.ts`   | `model-capability/`   |                           |
| `evidence-budget-contract.spec.ts`                    | `model-capability/`   |                           |
| `model-capability-catalog-shape.contract.spec.ts`     | `model-capability/`   |                           |
| `model-policy-funnel.spec.ts`                         | `model-capability/`   |                           |
| `no-hardcoded-pricing.spec.ts`                        | `model-capability/`   |                           |
| `provider-default-chains-shape.contract.spec.ts`      | `model-capability/`   |                           |
| `seed-governance.spec.ts`                             | `model-capability/`   |                           |
| `structured-output-strategy-readers.contract.spec.ts` | `model-capability/`   |                           |
| `c5-c6-snapshot-contract.spec.ts`                     | `runtime-contracts/`  |                           |
| `consistency.spec.ts`                                 | `runtime-contracts/`  |                           |
| `plugin-system.spec.ts`                               | `runtime-contracts/`  |                           |
| `protection-net.spec.ts`                              | `runtime-contracts/`  |                           |

迁移 spec 的检查清单（每次 PR）：

1. `git mv` 进目标子目录
2. 修复 `__dirname` 相对路径（`"..", "..", ".."` → `"..", "..", "..", ".."`）
3. 跑 `npx jest --testPathPattern=<spec-name>` 验证仍通过
4. 如果 spec 在 `package.json` script、`verify:arch` 或 CI 配置里被显式引用，同步更新引用

---

## 6. 自动化（未来）

待补：

- `architecture-exceptions-consistency.spec.ts` —— 比对 `EXEMPT_PATHS` 与 `EXCEPTIONS.md` 条目
- `architecture-rules-coverage.spec.ts` —— 比对 `ARCHITECTURE_RULES.md` 每条规则是否有对应 spec
- pre-push hook：`npm run verify:arch` 跑全部 `__tests__/architecture/**/*.spec.ts`

---

**最后更新**：2026-05-27
**关联文档**：[ARCHITECTURE_RULES.md](../../../../docs/architecture/ARCHITECTURE_RULES.md) · [EXCEPTIONS.md](../../../../docs/architecture/EXCEPTIONS.md) · [CONTRACT_README.md](./CONTRACT_README.md)
