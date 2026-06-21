/**
 * audit-storage-candidates.ts —— 全库存储治理候选扫描（一次性诊断，2026-06-20）
 *
 * 目的：把"还有哪些表该纳入 retention / offload"从逐张读 schema 的猜测，变成全库扫描的事实表。
 *
 * 做三件事：
 *   1. 从 Prisma DMMF 静态分类每张表：有无时间列、是否被别的表 FK 引用（load-bearing）、
 *      有无大 blob 列（Json / @db.Text）、是否审计/合规表。
 *   2. 交叉引用「已覆盖集合」——解析 data-retention.scheduler.ts + storage-offload.registry.ts
 *      里登记的 table 名，避免重复推荐。
 *   3. 若能连到 DB（--db-url 或 DATABASE_URL），join pg_total_relation_size + n_live_tup 给出真实体积。
 *
 * 输出：按体积排序的候选表 + 每张表的处理建议（RETENTION / OFFLOAD / KEEP-compliance / HOT / COVERED / skip）。
 *
 * 用法：
 *   tsx scripts/utils/audit-storage-candidates.ts                 # 纯 schema 分类（无体积）
 *   tsx scripts/utils/audit-storage-candidates.ts --db-url postgres://...   # 含真实体积
 *   DATABASE_URL=... tsx scripts/utils/audit-storage-candidates.ts --out report.md
 *
 * Railway 上跑（本地连不上内网 DB 时）：
 *   railway ssh -- 'cd backend && DATABASE_URL=$DATABASE_URL npx tsx ../scripts/utils/audit-storage-candidates.ts'
 *   （或把脚本拷进容器；关键是 @prisma/client 已 generate、DATABASE_URL 指向目标库）
 *
 * 注意：这是只读诊断，不删任何数据、不改 schema。建议只是建议，每张表仍需人工确认
 * 「是否 resume/计费/合规依赖」后再纳入。
 */

import * as fs from "fs";
import * as path from "path";

/* ----------------------------- 类型 ----------------------------- */

type Treatment =
  | "COVERED-retention"
  | "COVERED-offload"
  | "RETENTION"
  | "RETENTION-cascade"
  | "OFFLOAD"
  | "REVIEW"
  | "KEEP-compliance"
  | "HOT"
  | "skip-tiny";

interface TableInfo {
  model: string;
  table: string; // 物理表名（@@map 或模型名）
  dateCol: string | null;
  bigCols: string[]; // Json / Text 列（全部）
  contentCols: string[]; // 列名暗示大块内容的子集（真正的 offload 目标）
  referencedBy: number; // 有多少别的模型持 FK 指向它
  isCompliance: boolean;
  sizeBytes: number | null;
  rows: number | null;
  treatment: Treatment;
  reason: string;
}

/* ------------------------- 参数解析 ------------------------- */

function parseArgs(): { dbUrl?: string; out?: string; minMb: number } {
  const argv = process.argv.slice(2);
  const get = (k: string): string | undefined => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    dbUrl: get("db-url") ?? process.env.DATABASE_URL,
    out: get("out"),
    minMb: Number(get("min-mb") ?? "1"), // < minMb 且已知体积 → 标 skip-tiny
  };
}

/* ------------------- 已覆盖集合（解析源码，防漂移） ------------------- */

function extractTableNames(file: string): Set<string> {
  const out = new Set<string>();
  try {
    const text = fs.readFileSync(file, "utf8");
    const re = /table:\s*["'`]([a-z0-9_]+)["'`]/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) out.add(m[1]);
  } catch {
    // 文件不在预期路径时降级为空集（仍能跑，只是少了"已覆盖"标注）
  }
  return out;
}

/* ------------------- 时间列 / 合规 命名启发式 ------------------- */

const DATE_COL_PRIORITY = [
  "createdAt",
  "emittedAt",
  "takenAt",
  "timestamp",
  "recordedAt",
  "occurredAt",
  "startTime",
  "loggedAt",
  "at",
];

const COMPLIANCE_RE =
  /audit|secret_access|login_history|security|compliance|consent|billing|invoice|payment|credit|transaction/i;

// 表名是否为"append-only 遥测/日志流"——这才是按龄删除安全的真信号
// （仅"有 createdAt"不算：system_settings / brand_kits 也有 createdAt 但是业务态）。
const LOG_NAME_RE =
  /(^|_)(events?|logs?|metrics?|activit(y|ies)|traces?|spans?|histor(y|ies)|snapshots?|usages?|samples?|webhook_deliveries|deliveries)(_|$)/i;

// 大列名启发：列名暗示"大块内容"，offload 才划算（光是 Json metadata 列不算）。
const BIG_COL_NAME_RE =
  /(content|body|report|raw|full|payload|output|transcript|html|markdown|chunks?|items|result|snapshot|^text$|^data$)/i;

/* ----------------------------- 主流程 ----------------------------- */

async function main(): Promise<void> {
  const args = parseArgs();
  const repoRoot = path.resolve(__dirname, "..", "..");

  // 延迟 require，避免离线 / 无 prisma 时脚本无法被 type-check
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const prismaPkg = require("@prisma/client");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const models: any[] = prismaPkg?.Prisma?.dmmf?.datamodel?.models ?? [];
  if (models.length === 0) {
    console.error(
      "[storage-candidates] 无法读取 Prisma DMMF。请先在 backend 跑 `npx prisma generate`，" +
        "或在能解析到生成版 @prisma/client 的环境运行。",
    );
    process.exit(1);
  }

  // 已覆盖集合（三套机制：retention 删 / event-archive 归档 / offload 列搬）
  const govDir =
    "backend/src/modules/platform/storage/governance";
  const retentionCovered = new Set<string>([
    ...extractTableNames(
      path.join(repoRoot, `${govDir}/data-retention.scheduler.ts`),
    ),
    // event-archive 的 targets() 也用 `table:` 字面量 → 同一提取器覆盖；
    // 归档表已被无损处理，不应再误报为新 RETENTION 候选。
    ...extractTableNames(
      path.join(repoRoot, `${govDir}/event-archive.service.ts`),
    ),
  ]);
  const offloadCovered = extractTableNames(
    path.join(repoRoot, `${govDir}/storage-offload.registry.ts`),
  );

  // 计算"被引用"集合：某模型 M 被引用 = 有别的模型持 FK 指向 M
  const referencedCount = new Map<string, number>(); // modelName -> count
  for (const m of models) {
    for (const f of m.fields ?? []) {
      // 持 FK 的一侧：relationFromFields 非空，f.type 指向被引用模型
      if (
        f.kind === "object" &&
        Array.isArray(f.relationFromFields) &&
        f.relationFromFields.length > 0
      ) {
        referencedCount.set(f.type, (referencedCount.get(f.type) ?? 0) + 1);
      }
    }
  }

  // 静态分类
  const infos: TableInfo[] = [];
  for (const m of models) {
    const table: string = m.dbName ?? m.name;
    const fields: any[] = m.fields ?? [];

    // 时间列
    let dateCol: string | null = null;
    for (const cand of DATE_COL_PRIORITY) {
      const hit = fields.find(
        (f) => f.name === cand && f.type === "DateTime" && !f.isList,
      );
      if (hit) {
        dateCol = hit.name;
        break;
      }
    }

    // 大 blob 列：Json 或 @db.Text
    const bigCols: string[] = fields
      .filter((f) => {
        if (f.kind !== "scalar") return false;
        if (f.type === "Json") return true;
        const native = Array.isArray(f.nativeType) ? f.nativeType[0] : null;
        return native === "Text";
      })
      .map((f) => f.name);

    infos.push({
      model: m.name,
      table,
      dateCol,
      bigCols,
      contentCols: bigCols.filter((c) => BIG_COL_NAME_RE.test(c)),
      referencedBy: referencedCount.get(m.name) ?? 0,
      isCompliance: COMPLIANCE_RE.test(table),
      sizeBytes: null,
      rows: null,
      treatment: "HOT",
      reason: "",
    });
  }

  // 真实体积（可选）
  let dbConnected = false;
  if (args.dbUrl) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const prisma = new prismaPkg.PrismaClient({
        datasources: { db: { url: args.dbUrl } },
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const rows: Array<{ relname: string; rows: bigint; total_bytes: bigint }> =
        await prisma.$queryRawUnsafe(
          `SELECT c.relname,
                  COALESCE(s.n_live_tup,0)::bigint AS rows,
                  pg_total_relation_size(c.oid)::bigint AS total_bytes
           FROM pg_class c
           LEFT JOIN pg_stat_user_tables s ON s.relid=c.oid
           WHERE c.relkind='r'
             AND c.relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')`,
        );
      const byName = new Map(
        rows.map((r) => [
          r.relname,
          { bytes: Number(r.total_bytes), rows: Number(r.rows) },
        ]),
      );
      for (const info of infos) {
        const hit = byName.get(info.table);
        if (hit) {
          info.sizeBytes = hit.bytes;
          info.rows = hit.rows;
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      await prisma.$disconnect();
      dbConnected = true;
    } catch (e) {
      console.error(
        `[storage-candidates] DB 连接失败，降级为纯 schema 分类：${(e as Error).message}`,
      );
    }
  }

  // 分类决策
  for (const info of infos) {
    info.treatment = classify(info, retentionCovered, offloadCovered, args.minMb);
    info.reason = reasonFor(info);
  }

  report(infos, { dbConnected, out: args.out });
}

/* ------------------------- 分类决策 ------------------------- */

function classify(
  info: TableInfo,
  retentionCovered: Set<string>,
  offloadCovered: Set<string>,
  minMb: number,
): Treatment {
  if (retentionCovered.has(info.table)) return "COVERED-retention";
  if (offloadCovered.has(info.table)) return "COVERED-offload";

  const tiny =
    info.sizeBytes !== null && info.sizeBytes < minMb * 1024 * 1024;
  if (tiny) return "skip-tiny";

  if (info.isCompliance) return "KEEP-compliance";

  const isLogStream = LOG_NAME_RE.test(info.table);

  // 真·遥测/日志流 + 有时间列 → 按龄删行
  if (isLogStream && info.dateCol) {
    return info.referencedBy === 0 ? "RETENTION" : "RETENTION-cascade";
  }

  // 业务行要留，但有大块内容列 → 搬列不删行
  if (info.contentCols.length > 0) return "OFFLOAD";

  // 有时间列但不是日志命名 → 可能是业务数据也可能是漏命名的日志，交人判断
  if (info.dateCol) return "REVIEW";

  return "HOT";
}

function reasonFor(info: TableInfo): string {
  switch (info.treatment) {
    case "COVERED-retention":
      return "已在 retention 覆盖";
    case "COVERED-offload":
      return "已在 offload 覆盖";
    case "skip-tiny":
      return "体积小，暂不值得治理";
    case "KEEP-compliance":
      return "审计/合规/计费命名，需确认法定保留期，勿自动删";
    case "RETENTION":
      return `叶子日志（无人 FK 引用）+ 有时间列 ${info.dateCol} → 按龄删行`;
    case "RETENTION-cascade":
      return `有时间列 ${info.dateCol} 但被 ${info.referencedBy} 处引用 → 删前确认 cascade / resume 依赖`;
    case "OFFLOAD":
      return `大块内容列 [${info.contentCols.join(", ")}]（行要留，需 DB 确认列实际占比）→ 搬 R2`;
    case "REVIEW":
      return `有时间列 ${info.dateCol} 但非日志命名 → 人工判断是业务数据还是漏命名日志`;
    case "HOT":
    default:
      return "热业务态（无时间列或为引用源）→ 保留";
  }
}

/* ------------------------- 输出 ------------------------- */

function human(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)}K`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}M`;
  return `${(bytes / 1024 ** 3).toFixed(2)}G`;
}

function report(
  infos: TableInfo[],
  opts: { dbConnected: boolean; out?: string },
): void {
  // 排序：有体积按体积降序；无体积把候选（RETENTION/OFFLOAD）排前
  const rank: Record<Treatment, number> = {
    RETENTION: 0,
    OFFLOAD: 1,
    "RETENTION-cascade": 2,
    REVIEW: 3,
    "KEEP-compliance": 4,
    "COVERED-retention": 5,
    "COVERED-offload": 6,
    HOT: 7,
    "skip-tiny": 8,
  };
  const sorted = [...infos].sort((a, b) => {
    if (a.sizeBytes !== null && b.sizeBytes !== null)
      return b.sizeBytes - a.sizeBytes;
    return rank[a.treatment] - rank[b.treatment];
  });

  const newCandidates = sorted.filter(
    (i) =>
      i.treatment === "RETENTION" ||
      i.treatment === "OFFLOAD" ||
      i.treatment === "RETENTION-cascade",
  );

  const lines: string[] = [];
  lines.push("# 存储治理候选扫描");
  lines.push("");
  lines.push(
    `> 体积来源：${opts.dbConnected ? "实时 DB（pg_total_relation_size）" : "未连 DB（纯 schema 分类，无体积）"} · 共 ${infos.length} 表`,
  );
  lines.push("");
  lines.push("## 新增治理候选（建议优先处理）");
  lines.push("");
  lines.push("| 表 | 体积 | 行数 | 建议 | 时间列 | 被引用 | 大列 | 说明 |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const i of newCandidates) {
    lines.push(
      `| \`${i.table}\` | ${human(i.sizeBytes)} | ${
        i.rows?.toLocaleString() ?? "—"
      } | **${i.treatment}** | ${i.dateCol ?? "—"} | ${i.referencedBy} | ${
        i.contentCols.join(",") || "—"
      } | ${i.reason} |`,
    );
  }
  lines.push("");
  lines.push("## 全表分类（按体积降序）");
  lines.push("");
  lines.push("| 表 | 体积 | 行数 | 处理 | 说明 |");
  lines.push("|---|---|---|---|---|");
  for (const i of sorted) {
    lines.push(
      `| \`${i.table}\` | ${human(i.sizeBytes)} | ${
        i.rows?.toLocaleString() ?? "—"
      } | ${i.treatment} | ${i.reason} |`,
    );
  }

  const text = lines.join("\n");
  // 控制台精简版
  const counts = sorted.reduce<Record<string, number>>((acc, i) => {
    acc[i.treatment] = (acc[i.treatment] ?? 0) + 1;
    return acc;
  }, {});
  console.log("\n[storage-candidates] 分类汇总：");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  console.log(`\n新增候选 ${newCandidates.length} 张：`);
  for (const i of newCandidates.slice(0, 40)) {
    console.log(
      `  ${human(i.sizeBytes).padStart(7)}  ${i.treatment.padEnd(18)} ${i.table}  — ${i.reason}`,
    );
  }

  if (opts.out) {
    fs.writeFileSync(opts.out, text, "utf8");
    console.log(`\n完整报告已写入：${opts.out}`);
  } else {
    console.log(
      `\n（加 --out report.md 可写出完整 ${infos.length} 表的 Markdown 报告）`,
    );
  }
}

void main();
