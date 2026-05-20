# 前端 UI 组件复用治理标准

**版本：** 1.0
**强制级别：** 🔴 MUST
**状态：** 已采纳
**日期：** 2026-05-20

> **核心原则**：**可标准化的 UI 一律复用公共组件；自写 bespoke 或新建公共组件，必须先经用户批准。**
> 本文是"用什么组件 / 各类 UI 的格式要求 / 例外如何审批"的唯一权威。
> 分析背书见 [docs/guides/testing/frontend-ui-validation.md](../../docs/guides/testing/frontend-ui-validation.md)；机器执行见 `scripts/utils/audit-ui-discipline.ts`（R1–R8：R7=Tabs、R8=表格）+ `audit-ui-tokens.ts`。

---

## 1. 治理原则（MUST）

1. **复用优先**：写任何卡片/弹层/空态/加载/错误/页头/Tab/表格前，**先查本文 §3 的 canonical 组件**，有就必须用。
2. **不重复造**：现有公共组件复用率 < 10% 是治理问题不是工具问题（[validation 文档 TL;DR](../../docs/guides/testing/frontend-ui-validation.md)）。**不允许**在 feature 代码里内联 `rounded-xl border bg-white` 卡片、`fixed inset-0 z-50` 弹层、`animate-spin` 自写 spinner、自写 tab 条。
3. **例外须审批**：canonical 组件确实不适配时——**停下来问用户**，不要静默自写。获批后，把该次例外**记进基线**（`npm run audit:ui-baseline`，同 PR 附理由注释）= 审批留痕。基线增长 = 一次被批准的例外；**未经批准不得让基线上涨**。
4. **缺口先补 canonical 再用**：若某 archetype 没有 canonical 组件（见 §4），**先建公共组件**（需用户批准建在 `components/ui` 还是 `common`），不得各 feature 各写一份。
5. **Token 纪律**：颜色/字号/间距走 `frontend/lib/design/tokens.ts` + globals.css 变量，禁任意值 `text-[Npx]` / 硬编码 `#hex` / 主题色散落（spinner/focus ring 必须 `primary`，不准每页一个色）。

---

## 2. 各类 UI 的格式要求（回答"格式是什么"）

### 2.1 菜单主页（home page）

```
<AppShell>                                  ← R1 强制
  <PageHeaderHero icon title subtitle       ← 渐变图标 + 标题 + 副标题 + 右侧操作 + 内联搜索
                  actions search />
  [可选 Tabs]                                ← 用 canonical Tabs（见 §4 缺口）
  <main 内容区>
    grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4   ← 统一响应式
    {loading}  → <LoadingState/>            ← R5
    {empty}    → <EmptyState/>              ← R3
    {error}    → <ErrorState/>             ← R4
    {data.map} → <AssetCard/>              ← R2（+ 末尾"新建"虚线卡）
  </main>
  新建动作：右上角按钮 + Modal（不另开整页）
</AppShell>
```

mission 类功能的主页/详情另见 [21-agent-teams-presentation.md](21-agent-teams-presentation.md)。

### 2.2 卡片（card）

| 用途            | canonical             | 路径                               |
| --------------- | --------------------- | ---------------------------------- |
| 内容/资产列表项 | `AssetCard`           | `components/common/asset-card/`    |
| 设置/区块卡     | `SettingsSectionCard` | `components/common/cards/`         |
| 通用容器卡      | `ResponsiveCard`      | `components/ui/ResponsiveCard.tsx` |

禁止：feature 内联 `rounded-(xl\|lg\|2xl) + border + bg-white` 三件套（R2 拦截，≥3 处即违规）。

### 2.3 Tab 页

🔴 **当前缺口**：**无 canonical Tabs 组件**，全仓 42 处自写 `activeTab` + 按钮条。规则：

- 在 canonical Tabs 建成前，**新增 Tab UI 必须经用户批准**，不得再自写第 43 处。
- canonical 落地后（见 §4），统一用之，并加 audit R7 规则拦截自写。

### 2.4 表格（table）

🔴 **实测现状（2026-05-20，纠正旧版"非 admin 表格极少"的错误）**：全仓 **65 个文件直接写原生 `<table>`**——admin 41（26 组件 + 15 页）、**非 admin 24（22 组件 + 2 页）**。另有 ~10 个各自造的表格组件（admin 8 个 + `common/tables/MultiKeyTable`）。表格是高频自写重灾区，**不是**少数例外。

**表格分两层治理（勿一刀切）**：把 markdown 渲染、对比幻灯片硬塞进重型 DataTable = 过度抽象（Karpathy 反模式）。展示表只需统一**样式**，数据网格才需统一**行为**。

| 层                          | 是什么                            | 例子                                                                                                   | canonical                                                            | 何时用                            |
| --------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------- |
| ① **DataTable**（数据网格） | 可排序/分页/选择/行操作的交互列表 | admin 8 表、ai-social `TasksTab`/`ContentsTab`、me `models`/`keys`、custom-agents `MyAgentsTab`        | `components/common/tables/DataTable`（admin 留薄壳主题）             | 列表型、需排序/分页/搜索          |
| ② **ui/table**（展示原语）  | 纯展示、不交互                    | markdown 表、slides `ComparisonSlide`、`FactTablePanel`、`ComputeUsage*`、`CredibilityPanel`、消息渲染 | `components/ui/table/`（`Table/THead/TBody/Tr/Th/Td` 带 token 样式） | 静态展示，套 DataTable 是过度抽象 |

**禁止**：feature 代码直接写 `<table>` / `<thead>` / `<tbody>`（R8 拦截）。交互表用 `DataTable`，展示表用 `ui/table` 原语。例外仅限两个 canonical 实现本身 + admin 薄壳。

### 2.5 各类组件（states / 弹层 / 控件）

| Archetype    | canonical                        | 路径                                         | audit |
| ------------ | -------------------------------- | -------------------------------------------- | ----- |
| 空态         | `EmptyState`                     | `components/ui/states/`                      | R3    |
| 错误态       | `ErrorState`                     | `components/ui/states/`                      | R4    |
| 加载/骨架    | `LoadingState`/`LoadingSkeleton` | `components/ui/states/`                      | R5    |
| 弹窗         | `Modal`/`ConfirmDialog`          | `components/ui/dialogs/`                     | R6    |
| 抽屉         | `SideDrawer`                     | `components/common/drawers/`                 | R6    |
| mission 弹层 | `MissionDialogShell`             | `components/common/dialogs/`                 | R6    |
| 按钮         | `Button`(variants)               | `components/ui/primitives/button.tsx`        | —     |
| 下拉/菜单    | `DropdownMenu`                   | `components/ui/primitives/dropdown-menu.tsx` | —     |
| 开关         | `Switch`                         | `components/ui/primitives/switch.tsx`        | —     |
| 提示         | `Tooltip` / `Toast`              | `components/ui/`                             | —     |
| 徽章         | `ModelBadge`/`TierBadge`         | `components/common/badges/`                  | —     |

---

## 3. 例外审批流程（MUST）

```
需要一个 UI 块
   → §2 有 canonical？ ── 有 ──→ 必须用，结束
                        └─ 无/不适配 ──→ 停！向用户说明：缺口 / 为何不适配 / 建议方案
                                          ├─ 用户批准自写一次 → 写 + audit:ui-baseline 记录 + 注明理由
                                          └─ 用户批准建 canonical → 确认放 ui/ 还是 common/ → 建 + 加 audit 规则
```

**Agent 红线**：禁止在未问用户的情况下自写 canonical 已覆盖的 UI，或擅自新建公共组件。（同步见 CLAUDE.md 行为红线「前端 UI 组件复用优先」。）

---

## 4. 当前缺口（须先补 canonical，再加 audit 规则）

| Archetype                             | 状态                                  | 行动                                         |
| ------------------------------------- | ------------------------------------- | -------------------------------------------- |
| **Tabs / Tab 条**                     | 🔴 无 canonical，42 处自写            | 建 `components/ui/tabs/` + 加 audit R7       |
| 表单控件 Input/Textarea/Checkbox      | 🔴 缺（仅有 Switch/ModelSelect）      | 建 `components/ui/form/`                     |
| Pagination                            | 🔴 缺（逻辑藏在 AdminDataTable）      | 抽 `components/ui/pagination/`               |
| **通用 DataTable**（数据网格）        | 🔴 仅 admin 版，65 文件直写 `<table>` | 上提 `common/tables/DataTable` + 加 audit R8 |
| **ui/table**（展示原语）              | 🔴 无，展示表全自写                   | 建 `components/ui/table/` + 加 audit R8      |
| Alert/Banner、StatCard、ActionToolbar | 🟡 高频自写（validation §1.1）        | 视需要建                                     |

---

## 5. 执行与现状

- **机器执行**：`npm run audit:ui`（discipline R1–R8 + tokens）；`audit:ui-strict` 回归即 exit 1；`audit:ui-baseline` 更新基线（= 例外审批留痕）。
- **pre-push**：`.husky/pre-push` `[4/6]` 当前 **warn-only**。
- **现状（2026-05-20）**：精炼 R2/R3 检测器去伪阳后 discipline TOTAL ≈ 222（R3 空态 109、R6 弹层 75 为大头）；R7 Tabs 已建 canonical 并清零在范围内自写；R8 表格规则新增（65 文件直写 `<table>` 入基线，分批迁移压降）。
- 🔴 **建议（待批准执行）**：① pre-push `[4/6]` 由 warn-only 切 **strict**（新例外即阻断，逼出 §3 审批）；② 完成表格两层迁移后把 R8 基线压到 admin 薄壳 + 两个 canonical 实现本身。

---

**维护者**: Claude Code · 关联：[21-agent-teams-presentation.md](21-agent-teams-presentation.md) · [02-directory-structure.md](02-directory-structure.md) · [validation 分析](../../docs/guides/testing/frontend-ui-validation.md)
