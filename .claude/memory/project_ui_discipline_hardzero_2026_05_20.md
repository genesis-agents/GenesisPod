---
name: project_ui_discipline_hardzero_2026_05_20
description: UI-discipline audit 全部规则焊死 HARD_ZERO + TOTAL=0 收口（2026-05-20）
metadata:
  node_type: memory
  type: project
  originSessionId: e234e058-6f7c-42f0-837c-b4394332c29f
---

`scripts/utils/audit-ui-discipline.ts` 2026-05-20 收口到真 0 并全部焊死（pushed `77acf2484`）。

- **TOTAL 562/历史 → 0**，R1–R11 全部进 `HARD_ZERO_RULES`（原仅 R8）。任一规则新增违规即 exit 1，pre-push 步骤4 拒推；正式退出 warn-only 灰度。
- **新增检测器（本会话）**：R7 Signal B（≥2 处 `xxxTab===字面量` + onClick，排除纯 state-holder 如 ExploreContext）；R9 DIY 环形 spinner（`animate-spin`+`rounded-full`+`border-N`，不碰内联图标 spinner）。
- **大迁移**：62 DIY spinner→LoadingState/LoadingInline、tab 栏→ui/tabs/Tabs、空态→EmptyState、错误→ErrorState、弹层→Modal（含 ai-radar）。
- **R11 基线改对**（非豁免）：通用基线 = `onEdit + onDelete`。可见性切换**不入通用基线**——全应用仅 Topic 有真可切换可见性（`TopicVisibility` enum）；plans/scenarios/KB/wiki 后端无可见性字段/接口，强制 toggle 只会造死开关。`R11_BESPOKE_OK` 清空。
- **bespoke allowlist（canonical 真不适配，逐源留痕）**：R4/R5/R6/R7/R9/R2/R3 各有 `R*_BESPOKE_OK`（按钮/装饰环、缩略图遮罩、布局骨架、命令面板、移动端导航、admin 内联告警、统计/CTA 卡、流水线表等）。
- **新 canonical**：`PageHeaderHero` 加可选 `onBack`（详情页复用）。

## 卡片设计系统标准化（2026-05-20，pushed `9235711bc`；用户要求"每类卡标准化"）

卡 canonical 中心 = `components/ui/cards/`（新卡 primitive 落 ui/；composite AssetCard 留 common/ 避 ui→common 倒置）。7 类卡 + 对应 canonical：

1. 资源/管理卡 → `common/asset-card/AssetCard`（TemplateCard 收编；ResourceCard=社交内容卡/Connector=配置/GoogleDriveFileCard=选择行，核验后不强迁）
2. 统计卡 → `ui/cards/StatCard`【新】（迁 CapabilityMeters/ComputeUsagePanel/ComputeUsageTab/AISkillsTab/TrendReport/MissionProgressPanel/StageTaskDrawer）
3. 消息卡 → `ui/cards/MessageCardShell`【新】（迁 message-cards/ 6 卡）
4. 简报卡 → radar `RadarBriefingCard` 家族（已内部一致，无需迁）
5. 内容展示卡 → `ui/cards/SectionPanelCard`【新，含 subtitle 槽】（迁 explore 3 + StructuredAISummary 5）
6. 配置卡 → `common/cards/SettingsSectionCard`（5 adopter + UserModelsManagement）
7. 引用卡 → `common/citations/CitationListItem`（explore/report + library/rag 迁完）

**规则焊死到 12 条 HARD_ZERO**：R1–R9 + R11 + R12（CitationListItem）+ R13（MessageCardShell，message-cards 目录精确检测）。
**未硬零（实事求是，精度不够会误拦）**：统计卡（text-2xl 噪声大）、内容卡（渐变头与 Modal/面板共用特征）→ 作"文档约定 + 已迁清晰用例"治理，不进 HARD_ZERO。

详见 [[feedback_ui_governance_no_fake_exceptions]]。多会话协作（exec 写 R11/R1/R2、radar 管 ai-radar 子树）见 [[feedback_lint_staged_stash_safety]]。
