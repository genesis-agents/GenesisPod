#!/usr/bin/env tsx
/**
 * UI Discipline Audit — 9 条结构强制规则
 *
 * 检测前端主页面是否绕过公共组件自写实现。
 * 配套方案文档：docs/guides/testing/frontend-ui-validation.md
 * 基线日期：2026-05-18（首次扫描）
 *
 * 9 条规则（仅作用于 frontend/app/** 和 frontend/components/{ai-*,library,explore,me,profile}/**）：
 *   R1  AI app 主页（app/{ai-*,library,explore}/page.tsx）必须 import AppShell
 *   R2  列表型 .map 渲染卡片的页面必须 import AssetCard（不准自写 rounded-(xl|lg|2xl) + border 卡片）
 *   R3  含 list.length === 0 / data?.length === 0 分支必须 import EmptyState
 *   R4  含 error state 渲染分支必须 import ErrorState
 *   R5  含 isLoading skeleton 渲染必须 import LoadingState/LoadingSkeleton
 *   R6  弹层（role="dialog" 或 fixed inset-0 backdrop）必须 import MissionDialogShell/SideDrawer/Modal/ConfirmDialog
 *   R7  自写横向 tab 栏（A: onClick→tab setter；B: ≥2 处 activeTab===字面量 + 可点击）必须 import ui/tabs/Tabs
 *   R8  feature 代码禁止直写原生 <table>（交互用 common/tables/DataTable，展示用 ui/table）
 *   R9  自写 DIY 环形 spinner（animate-spin + rounded-full + border-N）必须改用 LoadingState（不碰内联图标 spinner）
 *
 * 报告模式：默认 exit 0（warn-only 基线期），传 --strict 后违规超基线即 exit 1。
 *
 * 用法：
 *   npm run audit:ui-discipline
 *   tsx scripts/audit-ui-discipline.ts --strict
 *   tsx scripts/audit-ui-discipline.ts --baseline docs/_archive/ui-baseline.json
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const FRONTEND_ROOT = join(process.cwd(), "frontend");
const ARGS = new Set(process.argv.slice(2));
const STRICT = ARGS.has("--strict");
const RATCHET = ARGS.has("--ratchet");
// 硬零规则：违规必须为 0，任何出现即拒（不比基线、不分模式）。某规则迁到 0 后毕业至此。
const HARD_ZERO_RULES = new Set<string>(["R8-Table-Component-Required"]);
const BASELINE_PATH = (() => {
  const idx = process.argv.indexOf("--baseline");
  return idx > 0
    ? process.argv[idx + 1]
    : "docs/_archive/ui-discipline-baseline.json";
})();

interface Violation {
  rule: string;
  file: string;
  line: number;
  snippet: string;
}

const EXCLUDE_PATTERNS = [
  "node_modules",
  ".next",
  "components/admin/", // admin 自成设计系统
  "components/ai-office/slides/", // slides 自成域
  "components/playground-design/", // playground 自成 token 系统
  "components/ui/", // 公共 UI primitives 自身（Modal/Dialog/Toolbar/LoadingState 实现）
  "components/common/", // 公共组件自身（AssetCard/EmptyState/SideDrawer 实现）
  "components/profile/UserApiKeyDrawer.tsx", // 老式自定义 Drawer，已记入重构清单
  "__tests__",
  ".test.",
  ".spec.",
  ".stories.",
];

function shouldSkip(file: string): boolean {
  const norm = file.split(sep).join("/");
  return EXCLUDE_PATTERNS.some((p) => norm.includes(p));
}

async function walkDir(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!/\.(tsx|jsx)$/.test(e.name)) continue;
    const full = join(e.parentPath ?? dir, e.name);
    if (shouldSkip(full)) continue;
    out.push(full);
  }
  return out;
}

function hasImport(src: string, symbol: string): boolean {
  // 简化版：检查 import { ... Symbol ... } 或 import Symbol
  const re = new RegExp(
    `import\\s+(?:[^;]*\\{[^}]*\\b${symbol}\\b[^}]*\\}|\\b${symbol}\\b)[^;]*from`,
    "m",
  );
  return re.test(src);
}

function findLine(src: string, marker: string | RegExp): number {
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (
      typeof marker === "string"
        ? lines[i].includes(marker)
        : marker.test(lines[i])
    ) {
      return i + 1;
    }
  }
  return 0;
}

function snippet(src: string, line: number): string {
  if (!line) return "";
  const l = src.split("\n")[line - 1] ?? "";
  return l.trim().slice(0, 120);
}

// 页面是否被祖先 layout.tsx 提供的 AppShell 包裹（App Router 标准模式：
// 外壳放 route layout，子 page 不必各自 import）。从 page 目录向上走到 app/，
// 任一 layout.tsx import 了 AppShell 即视为已覆盖。
function coveredByAppShellLayout(file: string): boolean {
  let dir = dirname(file);
  for (let i = 0; i < 12; i++) {
    const layout = join(dir, "layout.tsx");
    if (existsSync(layout)) {
      try {
        if (hasImport(readFileSync(layout, "utf8"), "AppShell")) return true;
      } catch {
        /* ignore unreadable layout */
      }
    }
    const norm = dir.split(sep).join("/");
    if (norm.endsWith("/app") || norm.endsWith("/frontend")) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

// 纯 redirect 桩页（只 redirect()、无 JSX 渲染）不需要外壳。
function isRedirectStub(src: string): boolean {
  return /\bredirect\s*\(/.test(src) && !/<[A-Za-z]/.test(src);
}

// R1: AI app 主页必须用 AppShell
function checkR1AppShell(file: string, src: string): Violation[] {
  const norm = file.split(sep).join("/");
  const isMainPage =
    /\/frontend\/app\/(ai-[a-z-]+|library|explore|knowledge-graph|custom-agents|notifications|credits|me|profile|feedback|changelog)\/(page\.tsx|\[[^\]]+\]\/page\.tsx)$/.test(
      norm,
    );
  if (!isMainPage) return [];
  if (hasImport(src, "AppShell")) return [];
  // App Router：外壳常由 route layout.tsx 提供，redirect 桩页无 UI —— 均非缺壳
  if (isRedirectStub(src)) return [];
  if (coveredByAppShellLayout(file)) return [];

  return [
    {
      rule: "R1-AppShell-Required",
      file: relative(process.cwd(), file),
      line: findLine(src, /export\s+default/),
      snippet: snippet(src, findLine(src, /export\s+default/)),
    },
  ];
}

// R2: 列表 .map 渲染卡片必须用 AssetCard，不许自写 rounded-(xl|lg|2xl) + border
// R2 已审批 bespoke 例外（2026-05-20，用户批准，careful per-case 逐源确认）：命中但
// 并非「资产/资源列表卡」——AssetCard（title/desc/icon/可见性/owner/编辑删除/分享语义）
// 不适配。类型：3 列统计卡网格（检测器误触内层 chip .map）、admin 层配置卡（admin 自成
// 设计系统，非 app 用户资源语义）。
const R2_BESPOKE_OK = [
  "components/ai-research/discussion/TrendReport.tsx", // 3 列统计卡(图标+计数+chips)，非资产列表
  "app/admin/system/notifications/content.tsx", // 统计卡 + admin 广播表单面板
  "app/admin/system/mcp-server/content.tsx", // admin MCP server 配置卡(admin 自成设计系统)
];

function checkR2AssetCard(file: string, src: string): Violation[] {
  // 检测自写卡片：className 含 rounded-(xl|lg|2xl) + border + bg-white 三件套
  const cardPattern =
    /className\s*=\s*[`"'][^`"']*\brounded-(xl|lg|2xl|3xl)\b[^`"']*\bborder\b[^`"']*\bbg-white\b[^`"']*[`"']/g;
  const allMatches = [...src.matchAll(cardPattern)];
  if (allMatches.length === 0) return [];
  if (hasImport(src, "AssetCard")) return [];
  const norm = file.split(sep).join("/");
  if (R2_BESPOKE_OK.some((p) => norm.endsWith(p))) return [];

  // 仅计「列表 map 渲染的卡片」：card className 出现在某个 .map( 之后 ~600 字符内。
  // 排除设置卡 / 容器卡 / 统计卡等静态卡片（非 asset 列表）的假阳性。
  const matches = allMatches.filter((m) => {
    const idx = m.index ?? 0;
    return /\.map\s*\(/.test(src.slice(Math.max(0, idx - 600), idx));
  });
  if (matches.length < 3) return []; // 非列表 / 单次自写 = 合理特殊容器

  const violations: Violation[] = [];
  for (const m of matches.slice(0, 5)) {
    const idx = m.index ?? 0;
    const line = src.slice(0, idx).split("\n").length;
    violations.push({
      rule: "R2-AssetCard-Required",
      file: relative(process.cwd(), file),
      line,
      snippet: snippet(src, line),
    });
  }
  return violations;
}

// R3: 「空态被渲染为 JSX」时必须用 EmptyState
// 仅当 .length===0 / .length<1 / isEmpty / !x.length 紧接 JSX 渲染（&& ( / ? ( /
// && < / ? <）时计违规——排除 `if (x.length===0) return []`、`? null :` 等逻辑判断假阳性。
const EMPTY_RENDER =
  /(?:\.length\s*===\s*0|\.length\s*<\s*1|\bisEmpty\b|!\s*\w+\??\.length)\s*(?:&&|\?)\s*[(<]/;

// R3 已审批例外：length===0 渲染的是「富欢迎/对话起始页」（登录引导 / 功能介绍 /
// 建议问题按钮），非「空数据」空态——EmptyState 不适配，保留自写（标准 22 §3 留痕）。
const R3_WELCOME_OK = [
  "app/ai-ask/page.tsx", // 未登录欢迎页 + 功能 chips + 建议 prompts
  "app/library/knowledge-graph/page.tsx", // 对话起始 + 建议问题按钮
];

// R3 已审批 bespoke 例外（2026-05-20，用户批准）：`.length===0` 命中但渲染的并非
// 「空数据占位」——逐源确认，EmptyState 不适配。类型：首跑引导、对话欢迎、守卫
// (return null)、下拉/标签内联文案、<select> 兜底 option、上下文告警、死代码分支。
const R3_BESPOKE_OK = [
  "app/ai-office/slides/page.tsx", // 首跑引导（"输入内容，AI团队开始生成"）
  "app/ai-simulation/run/[id]/page.tsx", // return null 守卫 + 加载中状态文案
  "components/ai-insights/research-control/ResearchSettingsModal.tsx", // 搜索下拉内联提示 + 标签 toggle
  "components/ai-office/core/PromptBar.tsx", // 死代码（外层已被 length>0 守卫）
  "components/ai-social/ContentDetailDrawer.tsx", // 上下文 amber 告警 + 跳连接设置链接
  "components/library/knowledge-base/TeamKnowledgeBaseTab.tsx", // 团队 KB 功能介绍引导卡
  "components/library/resources/BatchActionBar.tsx", // if(selectedCount===0) return null 守卫
  "components/library/wiki/WikiQueryDrawer.tsx", // 聊天式 UI 的欢迎 prompt
  "components/me/models/UserModelConfigModal.tsx", // <select> 内兜底 <option>
  "components/me/sections/PersonalizationSection.tsx", // 内联状态 <span> 标签
];

function checkR3EmptyState(file: string, src: string): Violation[] {
  if (!EMPTY_RENDER.test(src)) return [];
  if (hasImport(src, "EmptyState")) return [];
  const norm = file.split(sep).join("/");
  if (R3_WELCOME_OK.some((p) => norm.endsWith(p))) return [];
  if (R3_BESPOKE_OK.some((p) => norm.endsWith(p))) return [];

  const line = findLine(src, EMPTY_RENDER);
  return [
    {
      rule: "R3-EmptyState-Required",
      file: relative(process.cwd(), file),
      line,
      snippet: snippet(src, line),
    },
  ];
}

// R4: 含 error 分支渲染必须用 ErrorState
function checkR4ErrorState(file: string, src: string): Violation[] {
  // 启发式：JSX 中包含 error 渲染分支
  const errorRender =
    /\{\s*error\s*&&|\bif\s*\(\s*error\s*\)|\berror\s*\?\s*\(/;
  if (!errorRender.test(src)) return [];
  if (hasImport(src, "ErrorState")) return [];
  // 进一步检查是否真的有 JSX 错误展示（avoid 误报 try-catch 中的 error）
  if (!/<\w+[^>]*\b(error|Error)\b/.test(src)) return [];

  const line = findLine(src, errorRender);
  return [
    {
      rule: "R4-ErrorState-Required",
      file: relative(process.cwd(), file),
      line,
      snippet: snippet(src, line),
    },
  ];
}

// R5 已审批 bespoke 例外（2026-05-20，用户批准）：`animate-pulse bg-gray-100/200` 命中但
// 是「布局专属骨架」或非骨架——逐源确认，generic LoadingSkeleton（h-4 直线条）不适配，
// 强迁会视觉劣化。类型：卡片/表格/缩略图/页面形态骨架、单条内联占位、混在 spinner 块里。
const R5_BESPOKE_OK = [
  "app/admin/ai/eval/content.tsx", // h-20 卡片行占位，非细文本条
  "app/ai-social/mission/[taskId]/loading.tsx", // 整页布局骨架（头部+侧栏+内容卡）
  "app/ai-teams/[topicId]/page.tsx", // 图片加载占位 + 状态点，非骨架块
  "components/ai-image/components/ControlBar.tsx", // 单条 h-7 内联占位（模型选择器）
  "components/library/knowledge-base/KnowledgeBaseDetailDialog.tsx", // 单条标题占位 + flex-row spinner
  "components/ai-social/skeletons/ConnectionCardSkeleton.tsx", // 卡片骨架（头像圈+名称+状态+按钮）
  "components/ai-social/skeletons/ContentTableSkeleton.tsx", // 表格骨架（表头+多列行）
  "components/explore/resources/ResourceThumbnail.tsx", // 缩略图宽高比占位盒
];

// R5: 含 isLoading skeleton 渲染必须用 LoadingState/LoadingSkeleton
function checkR5LoadingState(file: string, src: string): Violation[] {
  // 检测自写 animate-pulse skeleton
  const customSkeleton =
    /\banimate-pulse\b.*?\bbg-(gray|slate|neutral)-(100|200)\b/;
  if (!customSkeleton.test(src)) return [];
  if (hasImport(src, "LoadingState") || hasImport(src, "LoadingSkeleton"))
    return [];
  const norm = file.split(sep).join("/");
  if (R5_BESPOKE_OK.some((p) => norm.endsWith(p))) return [];

  const line = findLine(src, customSkeleton);
  return [
    {
      rule: "R5-LoadingState-Required",
      file: relative(process.cwd(), file),
      line,
      snippet: snippet(src, line),
    },
  ];
}

// R6 已审批 bespoke 例外（2026-05-20，用户批准）：`fixed inset-0 z-*` 命中但
// 本质不是「居中内容弹层」——逐个读源确认，canonical Modal/SideDrawer 不模型化。
// 类型：点击遮罩(click-away)、进度/加载遮罩、悬浮工具条、移动端导航/侧栏遮罩、
// 全屏画布/图谱/iframe 阅读器、角落浮层、命令面板(顶部锚定+自带搜索头+键盘环)。
const R6_BESPOKE_OK = [
  "components/library/wiki/WikiChromeHeader.tsx", // KB 切换下拉的 click-away 遮罩
  "components/library/wiki/WikiGraphModal.tsx", // 交互式 pan/zoom SVG 图谱（全幅）
  "components/ai-office/core/ProgressTracker.tsx", // 进度遮罩
  "components/ai-office/document/GenerationProgress.tsx", // 生成进度遮罩
  "components/ai-bar/GlobalAIBar.tsx", // 全局悬浮 AI 条
  "components/ai-teams/MessageSelectionToolbar.tsx", // 选择工具条
  "components/ai-teams/TeamCanvasModal.tsx", // 全幅 SVG 画布 drag/pan/zoom（embedded 模式）
  "components/layout/MobileNav.tsx", // 移动端导航抽屉（入口文件）
  "components/explore/youtube/subtitle-export-button.tsx", // 加载 spinner + 错误 toast
  "components/ai-research/discussion/DemosPanel.tsx", // 全屏 iframe 演示查看器
  "components/ai-research/discussion/CommandPalette.tsx", // 命令面板（顶部锚定+搜索头+键盘环）
  "components/ai-insights/reports/ReportEditor.tsx", // fixed right-4 top-20 角落浮层（编辑+预览并排）
  "app/share/topic/[id]/page.tsx", // 移动端侧栏 dismiss 遮罩
  "app/share/writing/[id]/page.tsx", // 移动端 TOC 侧栏遮罩 + 阅读进度条
];

// R6: 弹层必须用 MissionDialogShell/SideDrawer/Modal/ConfirmDialog
function checkR6Dialog(file: string, src: string): Violation[] {
  // 检测自写 dialog/modal/drawer：fixed inset-0 + z-* + backdrop
  const customDialog =
    /className\s*=\s*[`"'][^`"']*\bfixed\b[^`"']*\binset-0\b[^`"']*\bz-\d+/;
  if (!customDialog.test(src)) return [];
  const knownDialogs = [
    "MissionDialogShell",
    "SideDrawer",
    "Modal",
    "ConfirmDialog",
    "AdminDrawer",
    "AdminModal",
  ];
  if (knownDialogs.some((s) => hasImport(src, s))) return [];
  const norm = file.split(sep).join("/");
  if (R6_BESPOKE_OK.some((p) => norm.endsWith(p))) return [];

  const line = findLine(src, customDialog);
  return [
    {
      rule: "R6-Dialog-Component-Required",
      file: relative(process.cwd(), file),
      line,
      snippet: snippet(src, line),
    },
  ];
}

// R7: 自写横向 tab 栏必须用 ui/tabs/Tabs
// 检测「tab 按钮 render」——即 onClick 直接调用 tab setter 的可点击元素。
// 比旧版逐行 button 样式（border-b-2+px+font-medium 同行）更可靠（漏 bg/pill/跨行），
// 又比纯 `activeTab===` 状态信号更精准（排除只持有/消费状态、不渲染 bar 的
// state holder / consumer / 委托组件，如 ExploreContext / ExploreContent）。
const SELF_TAB =
  /onClick=\{[^}]*\b(?:setActiveTab|onTabChange|setTab|setActiveKey|setSelectedTab|handleTabChange|switchTab|changeTab|selectTab)\s*\(/;

// R7 已审批 bespoke 例外（2026-05-20，用户批准）：canonical Tabs 不适配的非标准 tab。
// 标准 22 §3 例外审批留痕——这些保留自写，不算违规。
const R7_BESPOKE_OK = [
  // 主导航：每 tab 品牌色 + 响应式隐藏 label + 布局入口，canonical underline/pill 不模型化
  "components/layout/ResponsiveNav.tsx",
  // 资源详情：图标方块工具栏（h-10 w-10 渐变 + 角标），非文本 tab 栏
  "app/explore/resource/[id]/page.tsx",
];

// R7 Signal B：tab 栏的另一种形态——同一类状态变量上 ≥2 处 `xxxTab === '字面量'`
// 条件样式 + 文件渲染可点击元素（onClick）。要求 ≥2 个不同字面量，排除只读单一
// 状态的 state holder / context provider（如 ExploreContext 仅 1 处 activeTab==='youtube'，
// 及其 consumer ExploreContent）——正是旧版纯 activeTab=== 信号会误报的对象。
const TAB_LITERAL_G =
  /(?<![.\w])(?:activeTab|selectedTab|currentTab|activeKey|activeSection|activeView|activeMode|tab)\s*===\s*['"][a-z][\w-]*['"]/gi;
const TAB_LITERAL =
  /(?<![.\w])(?:activeTab|selectedTab|currentTab|activeKey|activeSection|activeView|activeMode|tab)\s*===\s*['"][a-z][\w-]*['"]/i;

function distinctTabLiterals(src: string): number {
  const set = new Set<string>();
  for (const m of src.matchAll(TAB_LITERAL_G)) set.add(m[0].replace(/\s+/g, ""));
  return set.size;
}

function checkR7Tabs(file: string, src: string): Violation[] {
  const sigA = SELF_TAB.test(src);
  // Signal B：≥2 个不同 tab 字面量比较 + 有可点击元素（真渲染 tab 栏，非纯状态持有/消费）
  const sigB = distinctTabLiterals(src) >= 2 && /onClick=\{/.test(src);
  if (!sigA && !sigB) return [];
  // 已用 tab 组件的不算自写：canonical Tabs，或 admin 设计系统 AdminTabs
  // （AdminTabs→Tabs 属迷你设计系统统一，另册，不在 R7「自写」范畴）。
  if (hasImport(src, "Tabs") || hasImport(src, "AdminTabs")) return [];
  const norm = file.split(sep).join("/");
  if (R7_BESPOKE_OK.some((p) => norm.endsWith(p))) return [];

  const line = sigA ? findLine(src, SELF_TAB) : findLine(src, TAB_LITERAL);
  return [
    {
      rule: "R7-Tabs-Required",
      file: relative(process.cwd(), file),
      line,
      snippet: snippet(src, line),
    },
  ];
}

// R8: feature 代码禁止直写原生 <table>（标准 22 §2.4 两层模型）。
// 交互数据网格用 common/tables/DataTable，纯展示表用 ui/table 原语。
// canonical 实现自身（components/ui/ · components/common/ · components/admin/）
// 已被 EXCLUDE_PATTERNS 排除；用 DataTable/ui/table 的文件渲染 <DataTable>/<Table>
// 而非原生 <table>，故"在范围内仍出现原生 <table>"即违规。
function checkR8Table(file: string, src: string): Violation[] {
  const NATIVE_TABLE = /<table[\s/>]/;
  if (!NATIVE_TABLE.test(src)) return [];

  const line = findLine(src, NATIVE_TABLE);
  return [
    {
      rule: "R8-Table-Component-Required",
      file: relative(process.cwd(), file),
      line,
      snippet: snippet(src, line),
    },
  ];
}

// R9: 自写 DIY 环形 spinner 必须改用 LoadingState（canonical 已渲染标准 spinner）。
// 仅命中"自造整块加载态"环形 loader（animate-spin + rounded-full + border-N 同一
// className，即手搓 CSS 圆环）；不碰 <Loader2/RefreshCw className="animate-spin"/>
// 这类合法内联图标 spinner（按钮 loading / 状态位）——与 R5(animate-pulse 骨架) 对称。
const DIY_SPINNER =
  /className\s*=\s*[`"'][^`"']*(?:\banimate-spin\b[^`"']*\brounded-full\b[^`"']*\bborder-\d|\brounded-full\b[^`"']*\bborder-\d[^`"']*\banimate-spin\b)/;

function checkR9Spinner(file: string, src: string): Violation[] {
  if (!DIY_SPINNER.test(src)) return [];
  if (hasImport(src, "LoadingState") || hasImport(src, "LoadingSkeleton"))
    return [];

  const line = findLine(src, DIY_SPINNER);
  return [
    {
      rule: "R9-Spinner-LoadingState-Required",
      file: relative(process.cwd(), file),
      line,
      snippet: snippet(src, line),
    },
  ];
}

// TODO(R10): ProgressBar 强制规则待补——需更精准的检测器避免误报
//   R10 进度条：`overflow-hidden rounded-full bg-gray-200` + width 填充需区分于头像/胶囊

async function main() {
  console.log("[audit:ui-discipline] 扫描 frontend/ 公共组件强制复用规则...");

  const files = await walkDir(FRONTEND_ROOT);
  console.log(`  扫描文件数：${files.length}`);

  const allViolations: Violation[] = [];
  for (const file of files) {
    let src: string;
    try {
      src = await readFile(file, "utf8");
    } catch {
      continue;
    }
    allViolations.push(...checkR1AppShell(file, src));
    allViolations.push(...checkR2AssetCard(file, src));
    allViolations.push(...checkR3EmptyState(file, src));
    allViolations.push(...checkR4ErrorState(file, src));
    allViolations.push(...checkR5LoadingState(file, src));
    allViolations.push(...checkR6Dialog(file, src));
    allViolations.push(...checkR7Tabs(file, src));
    allViolations.push(...checkR8Table(file, src));
    allViolations.push(...checkR9Spinner(file, src));
  }

  // 按 rule 聚合
  const byRule = new Map<string, Violation[]>();
  for (const v of allViolations) {
    if (!byRule.has(v.rule)) byRule.set(v.rule, []);
    byRule.get(v.rule)!.push(v);
  }

  console.log("");
  console.log("── 违规汇总 ──");
  const summary: Record<string, number> = {};
  for (const [rule, list] of [...byRule.entries()].sort()) {
    summary[rule] = list.length;
    console.log(`  ${rule}: ${list.length}`);
  }
  console.log(`  TOTAL: ${allViolations.length}`);
  console.log("");

  // 打印前 N 条样本
  if (allViolations.length > 0) {
    console.log("── 样本（每规则最多 3 条）──");
    for (const [rule, list] of [...byRule.entries()].sort()) {
      console.log(`\n  [${rule}]`);
      for (const v of list.slice(0, 3)) {
        console.log(`    ${v.file}:${v.line}`);
        if (v.snippet) console.log(`      | ${v.snippet}`);
      }
    }
    console.log("");
  }

  // 基线对比
  let baseline: Record<string, number> | null = null;
  if (existsSync(BASELINE_PATH)) {
    try {
      baseline = JSON.parse(await readFile(BASELINE_PATH, "utf8")) as Record<
        string,
        number
      >;
    } catch {
      baseline = null;
    }
  }

  let regressions: string[] = [];
  if (baseline) {
    console.log("── 与基线对比 ──");
    for (const rule of Object.keys({ ...summary, ...baseline })) {
      const cur = summary[rule] ?? 0;
      const base = baseline[rule] ?? 0;
      const delta = cur - base;
      const tag = delta > 0 ? "↑" : delta < 0 ? "↓" : "·";
      console.log(
        `  ${tag} ${rule}: ${base} → ${cur} (${delta >= 0 ? "+" : ""}${delta})`,
      );
      if (delta > 0) regressions.push(`${rule}: ${base} → ${cur} (+${delta})`);
    }
    console.log("");
  } else {
    console.log(`(无基线文件 ${BASELINE_PATH}，本次为首次扫描)`);
    console.log("");
  }

  // 写基线：--update-baseline 全量重写；--ratchet 只锁低（不劣化"焊死下限"：current<baseline 即降，永不回升）
  if (ARGS.has("--update-baseline") || RATCHET) {
    const next: Record<string, number> = { ...(baseline ?? {}) };
    const keys = new Set([
      ...Object.keys(summary),
      ...Object.keys(baseline ?? {}),
    ]);
    for (const rule of keys) {
      const cur = summary[rule] ?? 0;
      next[rule] = ARGS.has("--update-baseline")
        ? cur
        : Math.min(next[rule] ?? cur, cur);
    }
    await writeFile(BASELINE_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
    console.log(
      `✓ 基线已${ARGS.has("--update-baseline") ? "全量重写" : "棘轮锁低"}：${BASELINE_PATH}`,
    );
  }

  // ① 硬零规则：违规数必须为 0，任何出现即拒（不分 strict/warn）。规则迁到 0 后毕业至此。
  const hardZeroHit = [...HARD_ZERO_RULES].filter((r) => (summary[r] ?? 0) > 0);
  if (hardZeroHit.length > 0) {
    console.error("✗ 硬零规则违规（必须为 0，出现即拒）：");
    for (const r of hardZeroHit) console.error(`  ${r}: ${summary[r]}`);
    process.exit(1);
  }

  // ② strict 模式（灰度全量切换后启用）：任何"劣化"（超基线）即拒
  if (STRICT && regressions.length > 0) {
    console.error("✗ UI discipline 劣化（strict 不劣化模式）：");
    for (const r of regressions) console.error(`  ${r}`);
    process.exit(1);
  }

  console.log(
    `✓ 硬零通过（${[...HARD_ZERO_RULES].join(", ")} = 0）` +
      (STRICT ? " + 无劣化" : "；非硬零规则 warn-only（灰度期）"),
  );
}

main().catch((err) => {
  console.error("audit-ui-discipline failed:", err);
  process.exit(2);
});
