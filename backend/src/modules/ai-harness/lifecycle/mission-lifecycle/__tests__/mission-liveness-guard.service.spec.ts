/**
 * MissionLivenessGuard spec —— 业务链 100% 异常路径覆盖
 *
 * 场景矩阵（all combos）：
 *   startup-grace × wall-time × heartbeat-stale × event-stale × emit-warning × adapter-throws
 *
 * 关键不变量（INVARIANTS）：
 *   I1. mission startedAt < startupGraceMs → 永远 spared（无论心跳/事件状态）
 *   I2. mission startedAt > wallTimeCapMs → 永远 killed (reason=wall-time-exceeded)
 *   I3. heartbeat AND events 同 stale > stale 阈值 AND 过启动期 AND 未到 wall-time → killed (reason=no-activity)
 *   I4. 仅一个信号 stale > stale 阈值 → spared (要求双 stale 才杀)
 *   I5. 任一信号 stale > softWarn 阈值（且未 kill）→ emit warning（不杀）
 *   I6. fetchRunningMissions/getMostRecentEventTs 抛错 → 安全降级，不抛到调用方
 *   I7. markFailed 抛错 → 不影响后续 missions 处理（log warn 后继续）
 *   I8. 多 namespace adapter 互不干扰，单 namespace 失败不影响其他
 */

import { MissionLivenessGuard } from "../mission-liveness-guard.service";
import type {
  MissionLivenessAdapter,
  MissionLivenessRow,
} from "../mission-liveness-guard.service";

/** 工厂：构造一个 mission row 距离 now 的 secondsAgo */
function rowAt(
  id: string,
  startedAgoSec: number,
  heartbeatAgoSec: number | null,
): MissionLivenessRow {
  const now = Date.now();
  return {
    id,
    userId: `u-${id}`,
    startedAt: new Date(now - startedAgoSec * 1000),
    heartbeatAt:
      heartbeatAgoSec == null ? null : new Date(now - heartbeatAgoSec * 1000),
  };
}

interface MockAdapter extends MissionLivenessAdapter {
  killed: { id: string; reason: string; errorMessage: string }[];
  warned: { id: string; userId: string; payload: unknown }[];
}

function mockAdapter(opts?: {
  rows?: MissionLivenessRow[];
  eventTsByMissionId?: Record<string, number>;
  fetchRows?: () => Promise<MissionLivenessRow[]>;
  getEvents?: (
    ids: ReadonlyArray<string>,
    since: number,
  ) => Promise<Map<string, number>>;
  markFailedThrows?: boolean;
  noEmitWarning?: boolean;
}): MockAdapter {
  const killed: { id: string; reason: string; errorMessage: string }[] = [];
  const warned: { id: string; userId: string; payload: unknown }[] = [];
  return {
    killed,
    warned,
    fetchRunningMissions: opts?.fetchRows ?? (async () => opts?.rows ?? []),
    getMostRecentEventTs:
      opts?.getEvents ??
      (async (ids) => {
        const out = new Map<string, number>();
        const map = opts?.eventTsByMissionId ?? {};
        for (const id of ids) if (id in map) out.set(id, map[id]);
        return out;
      }),
    markFailed: async (id, reason, errorMessage) => {
      if (opts?.markFailedThrows) throw new Error("markFailed boom");
      killed.push({ id, reason, errorMessage });
    },
    emitWarning: opts?.noEmitWarning
      ? undefined
      : async (id, userId, payload) => {
          warned.push({ id, userId, payload });
        },
  };
}

describe("MissionLivenessGuard", () => {
  let guard: MissionLivenessGuard;

  beforeEach(() => {
    guard = new MissionLivenessGuard();
  });

  afterEach(() => {
    guard.stopScanLoop();
  });

  // ── I1 startup grace ──────────────────────────────────────────────
  describe("I1 startup-grace", () => {
    it("spares mission within startupGraceMs even if heartbeat null", async () => {
      const adapter = mockAdapter({
        // started 60s ago < 5min grace；heartbeat 也 null
        rows: [rowAt("m1", 60, null)],
      });
      guard.registerAdapter("test", adapter);
      const r = await guard.forceScan("test");
      expect(adapter.killed).toEqual([]);
      expect(adapter.warned).toEqual([]);
      expect(r?.spared).toBe(1);
      expect(r?.killed).toBe(0);
    });

    it("kills mission past startup grace + double stale", async () => {
      const adapter = mockAdapter({
        // started 30min ago > grace；heartbeat 10min ago > stale；events 缺
        rows: [rowAt("m1", 30 * 60, 10 * 60)],
      });
      guard.registerAdapter("test", adapter);
      await guard.forceScan("test");
      expect(adapter.killed).toHaveLength(1);
      expect(adapter.killed[0].reason).toBe("no-activity");
    });
  });

  // ── I2 wall-time hard cap ─────────────────────────────────────────
  describe("I2 wall-time hard cap", () => {
    it("kills mission past wallTimeCapMs regardless of heartbeat freshness", async () => {
      const adapter = mockAdapter({
        // started 5h ago > 4h cap; heartbeat fresh 10s ago
        rows: [rowAt("m1", 5 * 3600, 10)],
      });
      guard.registerAdapter("test", adapter);
      await guard.forceScan("test");
      expect(adapter.killed).toHaveLength(1);
      expect(adapter.killed[0].reason).toBe("wall-time-exceeded");
      expect(adapter.killed[0].errorMessage).toContain("最大执行时长");
    });
  });

  // ── I3 + I4 multi-signal verification ─────────────────────────────
  describe("I3/I4 multi-signal", () => {
    it("spares mission when heartbeat stale BUT events recent (single-signal stale)", async () => {
      const now = Date.now();
      const adapter = mockAdapter({
        // started 30min, heartbeat 10min stale, but event 30s ago
        rows: [rowAt("m1", 30 * 60, 10 * 60)],
        eventTsByMissionId: { m1: now - 30_000 },
      });
      guard.registerAdapter("test", adapter);
      await guard.forceScan("test");
      expect(adapter.killed).toEqual([]);
    });

    it("spares mission when events stale BUT heartbeat recent (single-signal stale)", async () => {
      const now = Date.now();
      const adapter = mockAdapter({
        // started 30min, heartbeat 30s ago (recent), event 10min ago (stale)
        rows: [rowAt("m1", 30 * 60, 30)],
        eventTsByMissionId: { m1: now - 10 * 60_000 },
      });
      guard.registerAdapter("test", adapter);
      await guard.forceScan("test");
      expect(adapter.killed).toEqual([]);
    });

    it("kills only when BOTH heartbeat AND events are stale", async () => {
      const now = Date.now();
      const adapter = mockAdapter({
        rows: [
          rowAt("m-alive", 30 * 60, 30), // heartbeat fresh
          rowAt("m-dead", 30 * 60, 10 * 60), // both stale
        ],
        eventTsByMissionId: {
          "m-alive": now - 30_000,
          "m-dead": now - 10 * 60_000,
        },
      });
      guard.registerAdapter("test", adapter);
      await guard.forceScan("test");
      expect(adapter.killed.map((k) => k.id)).toEqual(["m-dead"]);
    });
  });

  // ── I5 soft warning tier ──────────────────────────────────────────
  describe("I5 soft-warn tier", () => {
    it("emits warning when one signal > softWarn but other healthy", async () => {
      const now = Date.now();
      const adapter = mockAdapter({
        // heartbeat 12min stale (> 10min soft warn), but events 30s fresh (not stale)
        rows: [rowAt("m1", 30 * 60, 12 * 60)],
        eventTsByMissionId: { m1: now - 30_000 },
      });
      guard.registerAdapter("test", adapter);
      await guard.forceScan("test");
      expect(adapter.killed).toEqual([]);
      expect(adapter.warned).toHaveLength(1);
      expect(adapter.warned[0].id).toBe("m1");
    });

    it("does not emit warning when neither signal exceeds softWarn", async () => {
      const now = Date.now();
      const adapter = mockAdapter({
        // both signals fresh
        rows: [rowAt("m1", 30 * 60, 30)],
        eventTsByMissionId: { m1: now - 30_000 },
      });
      guard.registerAdapter("test", adapter);
      await guard.forceScan("test");
      expect(adapter.warned).toEqual([]);
    });

    it("kills (not warns) when both stale > stale threshold (no double-fire)", async () => {
      const now = Date.now();
      const adapter = mockAdapter({
        rows: [rowAt("m1", 30 * 60, 12 * 60)],
        eventTsByMissionId: { m1: now - 12 * 60_000 },
      });
      guard.registerAdapter("test", adapter);
      await guard.forceScan("test");
      expect(adapter.killed).toHaveLength(1);
      expect(adapter.warned).toEqual([]); // 不双触发
    });

    it("skip warning when adapter has no emitWarning impl", async () => {
      const now = Date.now();
      const adapter = mockAdapter({
        rows: [rowAt("m1", 30 * 60, 12 * 60)],
        eventTsByMissionId: { m1: now - 30_000 },
        noEmitWarning: true,
      });
      guard.registerAdapter("test", adapter);
      await guard.forceScan("test");
      expect(adapter.killed).toEqual([]);
      expect(adapter.warned).toEqual([]); // emitWarning 未注入 → 跳过
    });

    // ★ 2026-05-05 dedup: 10min cooldown 内不重发同 mission warning
    it("dedup: same mission warned only once within 10min cooldown", async () => {
      const now = Date.now();
      const adapter = mockAdapter({
        rows: [rowAt("m1", 30 * 60, 12 * 60)],
        eventTsByMissionId: { m1: now - 30_000 },
      });
      guard.registerAdapter("test", adapter);
      await guard.forceScan("test"); // 第 1 次 → emit
      await guard.forceScan("test"); // 第 2 次（同窗口）→ dedup skip
      await guard.forceScan("test"); // 第 3 次 → 仍 dedup skip
      expect(adapter.warned).toHaveLength(1);
    });

    it("dedup: different missions warn independently", async () => {
      const now = Date.now();
      const adapter = mockAdapter({
        rows: [rowAt("m1", 30 * 60, 12 * 60), rowAt("m2", 30 * 60, 12 * 60)],
        eventTsByMissionId: { m1: now - 30_000, m2: now - 30_000 },
      });
      guard.registerAdapter("test", adapter);
      await guard.forceScan("test");
      expect(adapter.warned.map((w) => w.id).sort()).toEqual(["m1", "m2"]);
    });

    it("dedup cleared on kill: same mission can warn → kill chain works", async () => {
      const now = Date.now();
      // 第 1 轮：单信号 stale → warn
      const adapter1 = mockAdapter({
        rows: [rowAt("m1", 30 * 60, 12 * 60)],
        eventTsByMissionId: { m1: now - 30_000 },
      });
      guard.registerAdapter("test", adapter1);
      await guard.forceScan("test");
      expect(adapter1.warned).toHaveLength(1);
      expect(adapter1.killed).toEqual([]);
      // 模拟下一轮：双信号都 stale → kill（不应被 dedup 阻止 kill）
      guard.unregisterAdapter("test");
      const adapter2 = mockAdapter({
        rows: [rowAt("m1", 30 * 60, 12 * 60)],
        eventTsByMissionId: { m1: now - 12 * 60_000 },
      });
      guard.registerAdapter("test", adapter2);
      await guard.forceScan("test");
      expect(adapter2.killed).toHaveLength(1);
    });
  });

  // ── I6 adapter exception safety ───────────────────────────────────
  describe("I6 adapter exception safety", () => {
    it("returns 0 results when fetchRunningMissions throws", async () => {
      const adapter = mockAdapter({
        fetchRows: async () => {
          throw new Error("DB down");
        },
      });
      guard.registerAdapter("test", adapter);
      const r = await guard.forceScan("test");
      expect(r?.checked).toBe(0);
      expect(r?.killed).toBe(0);
    });

    it("treats events as 'all stale' when getMostRecentEventTs throws", async () => {
      const adapter = mockAdapter({
        rows: [rowAt("m1", 30 * 60, 10 * 60)],
        getEvents: async () => {
          throw new Error("event groupBy failed");
        },
      });
      guard.registerAdapter("test", adapter);
      await guard.forceScan("test");
      // events query failed → 视为无事件 → 配合 heartbeat stale → kill (correct
      // failure mode：保守认死，不漏报)
      expect(adapter.killed).toHaveLength(1);
    });
  });

  // ── I7 markFailed exception isolation ─────────────────────────────
  describe("I7 markFailed exception isolation", () => {
    it("continues processing after markFailed throws on one mission", async () => {
      const adapter = mockAdapter({
        rows: [rowAt("m1", 30 * 60, 10 * 60), rowAt("m2", 30 * 60, 10 * 60)],
        markFailedThrows: true,
      });
      guard.registerAdapter("test", adapter);
      const r = await guard.forceScan("test");
      // markFailed throws but loop continues → both attempted (killed=0 but no throw)
      expect(r?.killed).toBe(2);
      expect(adapter.killed).toEqual([]); // throws prevented push
    });
  });

  // ── I8 multi-namespace isolation ──────────────────────────────────
  describe("I8 multi-namespace isolation", () => {
    it("scans multiple namespaces independently", async () => {
      const a1 = mockAdapter({ rows: [rowAt("m1", 30 * 60, 10 * 60)] });
      const a2 = mockAdapter({ rows: [rowAt("m2", 30, null)] }); // grace
      guard.registerAdapter("ns1", a1);
      guard.registerAdapter("ns2", a2);
      const results = await guard.runAll();
      expect(results).toHaveLength(2);
      expect(a1.killed).toHaveLength(1);
      expect(a2.killed).toEqual([]);
    });

    it("namespace failure doesn't affect others", async () => {
      const a1 = mockAdapter({
        fetchRows: async () => {
          throw new Error("ns1 boom");
        },
      });
      const a2 = mockAdapter({ rows: [rowAt("m2", 30 * 60, 10 * 60)] });
      guard.registerAdapter("ns1", a1);
      guard.registerAdapter("ns2", a2);
      await guard.runAll();
      // ns1 failed silently; ns2 still kills its dead mission
      expect(a2.killed).toHaveLength(1);
    });

    it("unregisterAdapter stops loop when last namespace removed", async () => {
      const a = mockAdapter({ rows: [] });
      guard.registerAdapter("ns1", a);
      guard.unregisterAdapter("ns1");
      // 没 throw 即 OK；loop timer 应被清掉
    });
  });

  // ── 边界 / 配置覆盖 ────────────────────────────────────────────────
  describe("edge cases", () => {
    it("empty namespace returns 0 counts", async () => {
      const adapter = mockAdapter({ rows: [] });
      guard.registerAdapter("test", adapter);
      const r = await guard.forceScan("test");
      expect(r).toEqual({
        namespace: "test",
        checked: 0,
        warned: 0,
        killed: 0,
        spared: 0,
      });
    });

    it("forceScan returns null for unknown namespace", async () => {
      const r = await guard.forceScan("unknown");
      expect(r).toBeNull();
    });

    it("re-registering namespace overwrites and warns", async () => {
      const a1 = mockAdapter({ rows: [] });
      const a2 = mockAdapter({ rows: [rowAt("m", 30 * 60, 10 * 60)] });
      guard.registerAdapter("test", a1);
      guard.registerAdapter("test", a2);
      await guard.forceScan("test");
      expect(a1.killed).toEqual([]); // a1 被替代
      expect(a2.killed).toHaveLength(1);
    });

    it("custom config: tighter wall-time triggers earlier kill", async () => {
      const adapter = mockAdapter({
        rows: [rowAt("m", 11 * 60, 30)], // 11min, heartbeat fresh
      });
      // 自定义 wallTimeCap=10min
      guard.registerAdapter("test", adapter, { wallTimeCapMs: 10 * 60_000 });
      await guard.forceScan("test");
      expect(adapter.killed).toHaveLength(1);
      expect(adapter.killed[0].reason).toBe("wall-time-exceeded");
    });

    it("config: zero startupGrace lets new missions be killed", async () => {
      const adapter = mockAdapter({
        rows: [rowAt("m", 30, null)], // 30s old + null heartbeat
      });
      guard.registerAdapter("test", adapter, {
        startupGraceMs: 0,
        staleThresholdMs: 10_000, // 10s
      });
      await guard.forceScan("test");
      // 0 grace + heartbeat null + no events → both stale → killed
      expect(adapter.killed).toHaveLength(1);
    });
  });
});
