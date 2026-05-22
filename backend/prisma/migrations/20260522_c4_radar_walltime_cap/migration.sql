-- C4/G5 (2026-05-22): radar_runs wall_time_ms 改名 wall_time_cap_ms
-- 消二义:wallTimeMs 在 radar 是「配置上限」、在 social/playground 是「实测耗时」。
-- radar 的「实测耗时」已是 duration_ms(不二义,保留)。本次仅把 radar 的「上限」列
-- 改成语义清晰的 wall_time_cap_ms。无双写:单脚本原地 RENAME(数据随列保留)。
ALTER TABLE "radar_runs" RENAME COLUMN "wall_time_ms" TO "wall_time_cap_ms";
