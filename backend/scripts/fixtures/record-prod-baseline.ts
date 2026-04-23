/**
 * PR-0.4 预研脚本（Group L-3 产物）· 尚未执行
 *
 * 目的：在 Railway prod 上跑 2-5 个 mission，录制真 baseline fixtures，
 * 替换 mock-fixtures 的部分关键 tag。
 *
 * 运行方式（待人工触发）：
 *   TOPIC_INSIGHTS_RECORD_BASELINE=1 \
 *     tsx scripts/fixtures/record-prod-baseline.ts --topic <topicId> --depth standard
 *
 * 依赖：
 * - BaselineRecorderService（已实现）
 * - NestApplicationContext 完整启动（同 run-golden.ts 的 harness-context）
 * - Railway DB 连接（`.env.railway` 配置）
 *
 * ⚠️ 当前为**预研骨架**，未 run。实际使用前需：
 * 1. 确认 .env.railway 配置正确
 * 2. 选定 2-5 个 topic（建议复用 mock fixtures 的 topicId 列表）
 * 3. 估算成本（每 mission standard ≈ $2，thorough ≈ $5）
 * 4. 手动触发；不放入 CI / 自动化
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Logger, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { HttpModule } from "@nestjs/axios";
import { PrismaModule } from "../../src/common/prisma/prisma.module";
import { AiEngineModule } from "../../src/modules/ai-engine/ai-engine.module";
import { TopicInsightsModule } from "../../src/modules/ai-app/topic-insights/topic-insights.module";

const logger = new Logger("RecordProdBaselineCLI");

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ".env.railway" }),
    EventEmitterModule.forRoot({ global: true }),
    HttpModule,
    PrismaModule,
    AiEngineModule,
    TopicInsightsModule,
  ],
})
class RecordBaselineModule {}

interface Args {
  readonly topicIds: ReadonlyArray<string>;
  readonly depths: ReadonlyArray<"standard" | "thorough">;
  readonly dryRun: boolean;
}

function parseArgs(): Args {
  const out: {
    topicIds: string[];
    depths: Array<"standard" | "thorough">;
    dryRun: boolean;
  } = { topicIds: [], depths: ["standard"], dryRun: true };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--topic") out.topicIds.push(argv[++i] ?? "");
    else if (a === "--depth") {
      const d = argv[++i];
      if (d === "standard" || d === "thorough") out.depths = [d];
    } else if (a === "--execute") {
      out.dryRun = false;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.topicIds.length === 0) {
    logger.error("Usage: --topic <id> [--depth standard|thorough] [--execute]");
    process.exit(1);
  }
  if (process.env.TOPIC_INSIGHTS_RECORD_BASELINE !== "1") {
    logger.error(
      "TOPIC_INSIGHTS_RECORD_BASELINE=1 must be set to enable recorder",
    );
    process.exit(1);
  }

  logger.log(
    `args: topics=${args.topicIds.join(",")} depths=${args.depths.join(",")} dryRun=${args.dryRun}`,
  );

  if (args.dryRun) {
    logger.warn("DRY RUN — pass --execute to actually record");
    process.exit(0);
  }

  const app = await NestFactory.createApplicationContext(RecordBaselineModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    // 实际录制：循环 topics × depths，每次触发 mission-execution startExecution
    // 并等 BaselineRecorder 的 onMissionTerminal 落盘完成（通过 ResearchEventEmitter
    // MISSION_COMPLETED event 已在 recorder 里订阅）
    //
    // ⚠️ 下面是骨架 — 真实接入需要：
    // 1. 查 ResearchTopic 确认 topicId 存在
    // 2. create ResearchMission row（或复用已有）
    // 3. 调 MissionExecutionService.startExecution
    // 4. 等 mission:completed event（BaselineRecorder 已监听自动写 fixture）
    logger.log("TODO: 真实触发路径 — 当前为骨架");
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  logger.error(
    `unexpected: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
