/**
 * PlaygroundRuntimeFlagService —— v5.1 R2-A 双轨 feature flag
 *
 * 决定每次 mission 启动时走 legacy（team.mission.ts）还是 pipeline-v1
 * （MissionPipelineOrchestrator + playground.config.ts）。
 *
 * 来源优先级（首先非空者生效）：
 *   1. 单 mission 强制 override（controller body 显式传 forceRuntime）
 *   2. 用户级灰度（PLAYGROUND_PIPELINE_V1_USER_IDS env 白名单）
 *   3. 全局 env：PLAYGROUND_RUNTIME = "legacy" | "pipeline-v1"
 *
 * 默认值切换历史：
 *   2026-05-04 R2-A.0 ~ A.13 期间：默认 "legacy"（新轨在搭建/wired 中）
 *   2026-05-04 R2-A.13 完成后：**默认切到 "pipeline-v1"**
 *     —— 全 14 stage wired 完毕，主干流量走新轨；
 *        紧急回滚：env PLAYGROUND_RUNTIME=legacy
 *
 * R2-B 1 周双轨观察：通过 metadata.runtime_version 对比新旧产物。
 * R2-C：删除 legacy 路径 + 删 PLAYGROUND_RUNTIME flag。
 */
import { Injectable, Logger } from "@nestjs/common";

export type PlaygroundRuntimeVersion = "legacy" | "pipeline-v1";

@Injectable()
export class PlaygroundRuntimeFlagService {
  private readonly log = new Logger(PlaygroundRuntimeFlagService.name);

  /**
   * 决定本次 mission 的 runtime version。
   *
   * @param userId 当前用户 id
   * @param forceRuntime 显式 override（dev / spec 用）；不传走 env 决定
   */
  resolve(args: {
    readonly userId?: string;
    readonly forceRuntime?: PlaygroundRuntimeVersion;
  }): PlaygroundRuntimeVersion {
    if (args.forceRuntime) {
      return this.validate(args.forceRuntime);
    }

    if (args.userId && this.userInPipelineV1Whitelist(args.userId)) {
      this.log.debug(
        `[runtime-flag] user ${args.userId} in pipeline-v1 whitelist`,
      );
      return "pipeline-v1";
    }

    const envValue = (process.env.PLAYGROUND_RUNTIME ?? "").trim();
    if (envValue === "pipeline-v1" || envValue === "legacy") {
      return envValue;
    }
    // ★ 2026-05-04 R2-A.13 完成后默认切到 pipeline-v1
    //   紧急回滚：Railway env 设 PLAYGROUND_RUNTIME=legacy
    return "pipeline-v1";
  }

  /**
   * spec / 监控用：当前进程默认 runtime（不考虑用户白名单）
   */
  defaultRuntime(): PlaygroundRuntimeVersion {
    const envValue = (process.env.PLAYGROUND_RUNTIME ?? "").trim();
    if (envValue === "legacy") return "legacy";
    return "pipeline-v1";
  }

  private userInPipelineV1Whitelist(userId: string): boolean {
    const csv = (process.env.PLAYGROUND_PIPELINE_V1_USER_IDS ?? "").trim();
    if (!csv) return false;
    return csv
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .includes(userId);
  }

  private validate(value: string): PlaygroundRuntimeVersion {
    if (value === "legacy" || value === "pipeline-v1") return value;
    this.log.warn(
      `[runtime-flag] forceRuntime="${value}" not in {"legacy","pipeline-v1"}, falling back to legacy`,
    );
    return "legacy";
  }
}
