/**
 * BYOK 凭据加固 PR-4 backfill（一次性，可重放）。
 *
 * 作用：
 *  1) secrets 中 user_id 非空的「工具/其它类」用户 BYOK 行 → 迁入 user_credentials
 *     （decryptForUser 解密 → encryptEnvelope 重加密 v2 → 源行软删）。
 *  2) secrets(系统) / user_api_keys / secret_keys / secret_versions 中 enc_version!=2
 *     的 legacy 行 → 原地升 v2（decrypt master → encryptEnvelope）。
 *
 * 安全：
 *  - 默认 DRY-RUN（只统计不写）；加 --apply 才真正写库。
 *  - 解密失败的行跳过并计入 errors（绝不写坏行 / 不删源行）。
 *  - 幂等：只处理 enc_version!=2 的行；重跑安全。
 *  - ★ 运行前务必先做数据库快照（方案 §7 回滚点）。
 *
 * 用法：
 *   tsx scripts/backfill-byok-credential-hardening.ts            # dry-run
 *   tsx scripts/backfill-byok-credential-hardening.ts --apply    # 实际执行
 */
import { PrismaClient } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { EncryptionService } from "../src/modules/ai-infra/encryption/encryption.service";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();
const encryption = new EncryptionService({
  get: (key: string) => process.env[key],
} as unknown as ConfigService);

interface Stats {
  scanned: number;
  upgraded: number;
  skipped: number;
  errors: number;
}
const newStats = (): Stats => ({
  scanned: 0,
  upgraded: 0,
  skipped: 0,
  errors: 0,
});

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}

/** secrets 用户工具行 → user_credentials（结构性分离 Sep-A）。 */
async function migrateUserSecretsToCredentials(): Promise<Stats> {
  const stats = newStats();
  const rows = await prisma.secret.findMany({
    where: { userId: { not: null }, deletedAt: null },
  });
  for (const row of rows) {
    stats.scanned++;
    // 2026-05-29 W4c：USER_DONATED 已退役（remap→OTHER），无需再跳过捐赠行。
    const userId = row.userId as string;
    const plain = await encryption.decryptAny(row, { userId });
    if (plain === null) {
      // 兜底再试 master（少数历史行可能用 master 加密）
      const alt = await encryption.decryptAny(row);
      if (alt === null) {
        log(`  [secrets→cred] decrypt FAILED id=${row.id} name=${row.name}`);
        stats.errors++;
        continue;
      }
    }
    const value = plain ?? (await encryption.decryptAny(row));
    if (value === null) {
      stats.errors++;
      continue;
    }
    if (!APPLY) {
      stats.upgraded++;
      continue;
    }
    const env = await encryption.encryptEnvelope(value);
    await prisma.$transaction(async (tx) => {
      await tx.userCredential.upsert({
        where: { userId_name: { userId, name: row.name } },
        create: {
          userId,
          name: row.name,
          displayName: row.displayName,
          category: row.category,
          provider: row.provider,
          description: row.description,
          encryptedValue: env.encryptedValue,
          iv: env.iv,
          authTag: env.authTag,
          wrappedDek: env.wrappedDek,
          encVersion: env.encVersion,
          kekVersion: env.kekVersion,
          keyHint: row.keyHint ?? encryption.createKeyHint(value),
          isActive: row.isActive,
          expiresAt: row.expiresAt,
        },
        update: {
          encryptedValue: env.encryptedValue,
          iv: env.iv,
          authTag: env.authTag,
          wrappedDek: env.wrappedDek,
          encVersion: env.encVersion,
          kekVersion: env.kekVersion,
          keyHint: row.keyHint ?? encryption.createKeyHint(value),
          deletedAt: null,
          deletedBy: null,
        },
      });
      await tx.secret.update({
        where: { id: row.id },
        data: { deletedAt: new Date(), deletedBy: "backfill-pr4" },
      });
    });
    stats.upgraded++;
  }
  return stats;
}

/** 原地把 legacy v1 行升 v2（master 解密 → 信封重加密）。 */
async function upgradeTable(
  table: "secret" | "userApiKey" | "secretKey" | "secretVersion",
): Promise<Stats> {
  const stats = newStats();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (prisma as any)[table];
  const rows: Array<{
    id: string;
    encryptedValue: string;
    iv: string;
    encVersion: number | null;
    userId?: string | null;
  }> = await model.findMany({ where: { encVersion: { not: 2 } } });

  for (const row of rows) {
    stats.scanned++;
    // secrets 系统行 userId=null 走 master；用户行已在上一步迁走，这里跳过残留用户行
    if (table === "secret" && row.userId) {
      stats.skipped++;
      continue;
    }
    const value = await encryption.decryptAny(row);
    if (value === null) {
      log(`  [${table}] decrypt FAILED id=${row.id}`);
      stats.errors++;
      continue;
    }
    if (!APPLY) {
      stats.upgraded++;
      continue;
    }
    const env = await encryption.encryptEnvelope(value);
    await model.update({
      where: { id: row.id },
      data: {
        encryptedValue: env.encryptedValue,
        iv: env.iv,
        authTag: env.authTag,
        wrappedDek: env.wrappedDek,
        encVersion: env.encVersion,
        kekVersion: env.kekVersion,
      },
    });
    stats.upgraded++;
  }
  return stats;
}

async function main(): Promise<void> {
  log(
    `=== BYOK credential hardening backfill (${APPLY ? "APPLY" : "DRY-RUN"}) ===`,
  );
  if (!APPLY) {
    log("DRY-RUN：仅统计，不写库。加 --apply 实际执行（务必先做 DB 快照）。");
  }

  const migrated = await migrateUserSecretsToCredentials();
  log(
    `[1] secrets(user)→user_credentials: scanned=${migrated.scanned} upgraded=${migrated.upgraded} skipped=${migrated.skipped} errors=${migrated.errors}`,
  );

  for (const t of [
    "secret",
    "userApiKey",
    "secretKey",
    "secretVersion",
  ] as const) {
    const s = await upgradeTable(t);
    log(
      `[2] ${t} v1→v2: scanned=${s.scanned} upgraded=${s.upgraded} skipped=${s.skipped} errors=${s.errors}`,
    );
  }

  log("=== done ===");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error("backfill failed:", e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
