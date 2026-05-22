-- C4/G5 (2026-05-22): social_missions wall_time_ms 改名 elapsed_wall_time_ms
-- social 的该列是「实测耗时」。改成语义清晰的 elapsed_wall_time_ms(与 radar 的 cap 列对称)。
-- 无双写:单脚本原地 RENAME(数据随列保留)。
ALTER TABLE "social_missions" RENAME COLUMN "wall_time_ms" TO "elapsed_wall_time_ms";
