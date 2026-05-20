# 前端组件索引（复用 SSOT）

> **复用优先**：写任何 UI 前先在本索引找 canonical 组件。规则见
> [standards/22-frontend-ui-component-governance.md](../../.claude/standards/22-frontend-ui-component-governance.md)
> 与 CLAUDE.md「前端 UI 组件复用优先」红线。**canonical 不适配 / 缺口 → 停下问用户，不要自写。**
>
> 机器校验：`npm run audit:ui-discipline`（R1–R6）+ `audit:ui-tokens`。

---

## 1. 速查：要做某种 UI → 用这个

| 你要做…             | 用 canonical                          | import                                                                  |
| ------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| 菜单主页骨架        | `AppShell` + `PageHeaderHero`         | `@/components/layout/AppShell` · `@/components/common/page-header-hero` |
| 列表卡片            | `AssetCard`                           | `@/components/common/asset-card`                                        |
| 设置/区块卡         | `SettingsSectionCard`                 | `@/components/common/cards`                                             |
| 通用容器卡          | `ResponsiveCard`                      | `@/components/ui`                                                       |
| 空态                | `EmptyState`                          | `@/components/ui`                                                       |
| 加载/骨架           | `LoadingState` / `LoadingSkeleton`    | `@/components/ui`                                                       |
| 错误态              | `ErrorState`                          | `@/components/ui`                                                       |
| 弹窗                | `Modal` / `ConfirmDialog`             | `@/components/ui`                                                       |
| 抽屉/侧滑           | `SideDrawer`                          | `@/components/common/drawers`                                           |
| mission 弹层        | `MissionDialogShell`                  | `@/components/common/dialogs`                                           |
| 按钮                | `Button`（variant/size）              | `@/components/ui`                                                       |
| 下拉/菜单           | `DropdownMenu`                        | `@/components/ui`                                                       |
| 开关                | `Switch`                              | `@/components/ui`                                                       |
| 提示气泡            | `Tooltip`                             | `@/components/ui/Tooltip`                                               |
| 全局 toast          | `Toast` / `useToast`                  | `@/components/ui`                                                       |
| 状态徽章(enum→tone) | `StatusBadge`                         | `@/components/ui/badges`                                                |
| 品牌/Tier 徽章      | `ModelBadge` / `TierBadge`            | `@/components/common/badges`                                            |
| 进度条              | `ProgressBar`                         | `@/components/ui/progress`                                              |
| 日期(防水合)        | `ClientDate`                          | `@/components/common/ClientDate`                                        |
| 模型选择            | `ModelSelect`                         | `@/components/common/ModelSelect`                                       |
| mission 详情骨架    | `MissionDetailFrame` + `StageStepper` | `@/components/common/mission-detail`                                    |
| mission 列表        | `MissionGalleryView`                  | `@/components/common/missions`                                          |
| Tab 页(横向)        | `Tabs`                                | `@/components/ui/tabs`                                                  |
| 表单 Input/Textarea | `Input` / `Textarea`                  | `@/components/ui/form`                                                  |
| 分页                | `Pagination`                          | `@/components/ui/pagination`                                            |

---

## 2. components/ui — 无业务 primitive

| 组件                                                   | 路径                              | 何时用                                                                                     |
| ------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------ |
| `Button`                                               | `ui/primitives/button.tsx`        | 所有按钮（variant: default/destructive/outline/secondary/ghost/link，size: sm/md/lg/icon） |
| `Switch`                                               | `ui/primitives/switch.tsx`        | 开关                                                                                       |
| `DropdownMenu`                                         | `ui/primitives/dropdown-menu.tsx` | 下拉/上下文菜单                                                                            |
| `Modal`                                                | `ui/dialogs/Modal.tsx`            | 通用弹窗（header/footer/size/ESC/遮罩关闭）                                                |
| `ConfirmDialog`                                        | `ui/dialogs/ConfirmDialog.tsx`    | 确认/危险操作弹窗                                                                          |
| `EmptyState`                                           | `ui/states/EmptyState.tsx`        | 空数据（default/search/noData/error）                                                      |
| `LoadingState` `LoadingSkeleton` `LoadingInline`       | `ui/states/LoadingState.tsx`      | 加载/骨架/内联 spinner                                                                     |
| `ErrorState` `ErrorInline`                             | `ui/states/ErrorState.tsx`        | 错误展示 + 重试                                                                            |
| `Toast` `useToast`                                     | `ui/Toast.tsx`                    | 全局通知                                                                                   |
| `Tooltip`                                              | `ui/Tooltip.tsx`                  | 悬浮提示                                                                                   |
| `ResponsiveCard`(+Header/Title/Content/Footer/Actions) | `ui/ResponsiveCard.tsx`           | 通用卡片容器                                                                               |
| `DateRangePicker`                                      | `ui/DateRangePicker.tsx`          | 日期区间选择                                                                               |
| `AIMessageRenderer`                                    | `ui/AIMessageRenderer.tsx`        | 渲染 AI markdown/代码                                                                      |
| `MermaidDiagram`                                       | `ui/MermaidDiagram.tsx`           | Mermaid 图                                                                                 |
| `TableOfContents`                                      | `ui/TableOfContents.tsx`          | 标题目录                                                                                   |
| viewers（PDF/HTML/Reader/PreviewFrame/Thumbnail）      | `ui/viewers/`                     | 文档/网页预览                                                                              |
| collapsible（Blockquote/Message/RagSources）           | `ui/collapsible/`                 | 折叠块                                                                                     |
| animations（FadeIn/SlideIn/AnimatedList）              | `ui/animations/`                  | 过渡动画                                                                                   |

## 3. components/common — 跨 feature 业务组件

| 组件                                                                                | 路径                                                                    | 何时用                                        |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------- |
| `AssetCard`                                                                         | `common/asset-card/`                                                    | 资产/内容列表卡（图标/徽章/可见性/统计/操作） |
| `SettingsSectionCard`                                                               | `common/cards/`                                                         | 设置页区块卡                                  |
| `PageHeaderHero`                                                                    | `common/page-header-hero/`                                              | 主页/列表页头部                               |
| `SideDrawer`                                                                        | `common/drawers/`                                                       | 右侧抽屉                                      |
| `MissionDialogShell`                                                                | `common/dialogs/`                                                       | mission 弹层外壳                              |
| `ShareModal` `SharePermissionModal`                                                 | `common/dialogs/`                                                       | 分享/权限                                     |
| `Import*Dialog` `UploadFileDialog` `ExportDialog`                                   | `common/dialogs/` · `common/ExportDialog.tsx`                           | 导入/导出                                     |
| `MissionDetailFrame` `StageStepper` `MissionActionGroup` `ModalShell` `DrawerShell` | `common/mission-detail/`                                                | mission 详情/执行（见标准 21）                |
| `MissionGalleryView`                                                                | `common/missions/`                                                      | mission 列表网格                              |
| `ModelBadge` `TierBadge`                                                            | `common/badges/`                                                        | 模型/等级徽章                                 |
| `ModelSelect` `ModelBadges`                                                         | `common/ModelSelect.tsx` · `ModelBadges.tsx`                            | 模型选择/展示                                 |
| `ClientDate`                                                                        | `common/ClientDate.tsx`                                                 | 防水合日期                                    |
| `ErrorBoundary`                                                                     | `common/ErrorBoundary.tsx`                                              | 错误边界                                      |
| `FilterPanel`                                                                       | `common/FilterPanel.tsx`                                                | 侧栏筛选                                      |
| `ViewToggle`                                                                        | `common/ViewToggle.tsx`                                                 | grid/list 切换                                |
| `MarkdownViewer` `MarkdownEditor` `ReportViewer`                                    | `common/markdown-viewer/` · `common/editors/` · `common/report-viewer/` | markdown/报告渲染                             |
| citations / comments / annotations                                                  | `common/citations/` `common/comments/` `common/annotations/`            | 引用/评论/批注                                |
| credits（CreditBadge/CheckinModal/InsufficientCreditsModal）                        | `common/credits/`                                                       | 积分                                          |
| byok（Banner/Guard/ErrorCard/GlobalErrorModal）                                     | `common/byok/` · `common/BYOKRequiredBanner.tsx`                        | BYOK                                          |
| team-topology（Canvas + 角色头像）                                                  | `common/team-topology/`                                                 | agent 团队拓扑                                |
| agent-inspector / leader-chat                                                       | `common/agent-inspector/` · `common/leader-chat/`                       | agent 调试/leader 对话                        |
| skills（AppSkillsPanel/SkillsModal）                                                | `common/skills/`                                                        | 技能面板                                      |
| chart-viewer（FigureRenderer/ReportChartRenderer）                                  | `common/chart-viewer/`                                                  | 图表                                          |

## 3.1 components/layout — 全局骨架

`AppShell`（页壳，主页必用）· `Sidebar` · `MobileNav` — `@/components/layout/`

---

## 4. 缺口（无 canonical — 必须先问用户再建/自写）

| Archetype                                   | 现状                                        | 计划                                |
| ------------------------------------------- | ------------------------------------------- | ----------------------------------- |
| ~~Tabs~~                                    | ✅ 已建 `ui/tabs/`（9 处已迁，余 ~37 待迁） | 迁调用方 + 加 audit R7              |
| ~~表单 Input/Textarea~~                     | ✅ 已建 `ui/form/`（Checkbox 待补）         | 迁调用方                            |
| ~~Pagination~~                              | ✅ 已建 `ui/pagination/`                    | 迁调用方                            |
| `Checkbox`                                  | 🔴 缺                                       | 补 `ui/form/Checkbox`               |
| 通用 `DataTable`（数据网格）                | 🔴 仅 admin 版，65 文件直写 `<table>`       | 上提 `common/tables/DataTable` + R8 |
| `ui/table`（展示原语）                      | 🔴 无，展示表全自写                         | 建 `ui/table/` + R8                 |
| `Alert`/`Banner` `StatCard` `ActionToolbar` | 🟡 高频自写                                 | 视需要建                            |

---

## 5. 导入约定 & 已知问题

- 优先从目录路径导入（如 `@/components/common/asset-card`）。
- ⚠️ **barrel 不全**：`components/ui/index.ts` 缺 `Tooltip`；`components/common/index.ts` 缺 `AssetCard`/`PageHeaderHero`/`SideDrawer`/`mission-detail`/`badges`/`ModelSelect` 等核心导出 → 当前必须用目录路径导入。补全 barrel 是 P1 待办（注意 Next 包体积，勿用 mega-barrel 全量 re-export）。
- 颜色/字号/间距走 `lib/design/tokens.ts` + globals.css 变量，禁任意值（见标准 22 §1.5）。

---

**维护**：新增 canonical 组件必须登记到本索引 + 标准 22。关联 [标准 21](../../.claude/standards/21-agent-teams-presentation.md) · [标准 22](../../.claude/standards/22-frontend-ui-component-governance.md)
