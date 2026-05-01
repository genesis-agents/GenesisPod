/**
 * Phase 9 (2026-04-30): MissionOrphanDetectorService unit tests
 *
 * 覆盖：
 *   - 心跳新鲜 → 不视为 orphan
 *   - 心跳过期（> 120s）→ 视为 orphan，触发 markOrphanFailed
 *   - 没有心跳记录 → 视为 orphan
 *   - callbacks 未注册 → 不抛错（log + skip）
 *   - runtimeStore 未注入 → 完全跳过扫描
 */

import { MissionOrphanDetectorService } from "../mission-orphan-detector.service";
import {
  MissionRuntimeStateStore,
  type MissionHeartbeat,
} from "../mission-runtime-state.store";
import type { CacheService } from "../../../../../../common/cache/cache.service";

function makeStore(heartbeats: Record<string, MissionHeartbeat>): {
  store: MissionRuntimeStateStore;
  clearAllMock: jest.Mock;
} {
  const cacheStore = new Map<string, unknown>();
  for (const [missionId, beat] of Object.entries(heartbeats)) {
    cacheStore.set("mission:rt:hb:" + missionId, beat);
  }
  const clearAllMock = jest.fn();
  const cache = {
    get: jest.fn((key: string) => Promise.resolve(cacheStore.get(key))),
    set: jest.fn(),
    del: jest.fn((key: string) => {
      cacheStore.delete(key);
      return Promise.resolve();
    }),
  } as unknown as CacheService;
  const store = new MissionRuntimeStateStore(cache);
  // patch clearAll 以观察调用
  const original = store.clearAll.bind(store);
  store.clearAll = (id: string) => {
    clearAllMock(id);
    return original(id);
  };
  return { store, clearAllMock };
}

describe("MissionOrphanDetectorService", () => {
  describe("heartbeat 检查", () => {
    it("心跳新鲜 (< 120s) → 不视为 orphan", async () => {
      const now = Date.now();
      const { store } = makeStore({
        "m-fresh": {
          podId: "pod-A",
          lastBeatAt: now - 30_000,
          startedAt: now - 60_000,
        },
      });
      const detector = new MissionOrphanDetectorService(store);
      const markFailed = jest.fn();
      detector.registerCallbacks({
        fetchRunningMissions: () =>
          Promise.resolve([{ id: "m-fresh", userId: "u-1" }]),
        markOrphanFailed: markFailed,
      });

      const result = await detector.forceScan();
      expect(result.checked).toBe(1);
      expect(result.orphans).toBe(0);
      expect(markFailed).not.toHaveBeenCalled();
    });

    it("心跳过期 (> 120s) → 视为 orphan", async () => {
      const now = Date.now();
      const { store, clearAllMock } = makeStore({
        "m-stale": {
          podId: "pod-X",
          lastBeatAt: now - 200_000,
          startedAt: now - 600_000,
        },
      });
      const detector = new MissionOrphanDetectorService(store);
      const markFailed = jest.fn(() => Promise.resolve(undefined));
      detector.registerCallbacks({
        fetchRunningMissions: () =>
          Promise.resolve([{ id: "m-stale", userId: "u-2" }]),
        markOrphanFailed: markFailed,
      });

      const result = await detector.forceScan();
      expect(result.orphans).toBe(1);
      expect(markFailed).toHaveBeenCalledWith(
        "m-stale",
        "u-2",
        expect.stringContaining("Mission 进程在执行过程中被回收"),
      );
      expect(clearAllMock).toHaveBeenCalledWith("m-stale");
    });

    it("无心跳记录 → 视为 orphan", async () => {
      const { store } = makeStore({}); // 无任何 heartbeat
      const detector = new MissionOrphanDetectorService(store);
      const markFailed = jest.fn(() => Promise.resolve(undefined));
      detector.registerCallbacks({
        fetchRunningMissions: () =>
          Promise.resolve([{ id: "m-no-beat", userId: "u-3" }]),
        markOrphanFailed: markFailed,
      });

      const result = await detector.forceScan();
      expect(result.orphans).toBe(1);
      expect(markFailed).toHaveBeenCalledWith(
        "m-no-beat",
        "u-3",
        expect.any(String),
      );
    });

    it("混合：新鲜 + 过期 一起扫", async () => {
      const now = Date.now();
      const { store } = makeStore({
        "m-fresh": {
          podId: "A",
          lastBeatAt: now - 10_000,
          startedAt: now - 30_000,
        },
        "m-stale": {
          podId: "B",
          lastBeatAt: now - 300_000,
          startedAt: now - 500_000,
        },
      });
      const detector = new MissionOrphanDetectorService(store);
      const markFailed = jest.fn(() => Promise.resolve(undefined));
      detector.registerCallbacks({
        fetchRunningMissions: () =>
          Promise.resolve([
            { id: "m-fresh", userId: "u-1" },
            { id: "m-stale", userId: "u-2" },
          ]),
        markOrphanFailed: markFailed,
      });

      const result = await detector.forceScan();
      expect(result.checked).toBe(2);
      expect(result.orphans).toBe(1);
      expect(markFailed).toHaveBeenCalledTimes(1);
      expect(markFailed).toHaveBeenCalledWith(
        "m-stale",
        "u-2",
        expect.any(String),
      );
    });
  });

  describe("无 callbacks 注册", () => {
    it("不抛错，返回 0/0", async () => {
      const { store } = makeStore({});
      const detector = new MissionOrphanDetectorService(store);
      const result = await detector.forceScan();
      expect(result).toEqual({ checked: 0, orphans: 0 });
    });
  });

  describe("无 runtimeStore", () => {
    it("完全跳过扫描", async () => {
      const detector = new MissionOrphanDetectorService(undefined);
      const markFailed = jest.fn();
      detector.registerCallbacks({
        fetchRunningMissions: () =>
          Promise.resolve([{ id: "m-1", userId: "u-1" }]),
        markOrphanFailed: markFailed,
      });
      const result = await detector.forceScan();
      expect(result).toEqual({ checked: 0, orphans: 0 });
      expect(markFailed).not.toHaveBeenCalled();
    });
  });

  describe("fetchRunningMissions 抛错", () => {
    it("捕获并返回 0/0，不让 setInterval 崩", async () => {
      const { store } = makeStore({});
      const detector = new MissionOrphanDetectorService(store);
      detector.registerCallbacks({
        fetchRunningMissions: () => Promise.reject(new Error("DB down")),
        markOrphanFailed: jest.fn(),
      });
      await expect(detector.forceScan()).resolves.toEqual({
        checked: 0,
        orphans: 0,
      });
    });
  });
});
