/**
 * Database Migration Deployment Script
 *
 * Simplified script for Railway deployment.
 * Uses standard Prisma migrate workflow.
 *
 * Usage:
 * - Railway: Set as Build Command or Start Command
 * - Local: npx tsx prisma/deploy-migrations.ts
 *
 * IMPORTANT:
 * - All schema changes should go through Prisma migrations
 * - Do NOT add "fallback" CREATE TABLE / ALTER TABLE here
 * - Do NOT use DO $$ EXCEPTION wrapper for ALTER TYPE ADD VALUE in migrations
 *   (EXCEPTION creates a subtransaction; ALTER TYPE ADD VALUE fails in subtransactions)
 * - Use direct: ALTER TYPE "X" ADD VALUE IF NOT EXISTS 'Y';
 * - See .claude/skills/development/database-migration/SKILL.md for guidelines
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "fs";
import { join } from "path";

const prisma = new PrismaClient();

// Critical tables that must exist after migration
const CRITICAL_TABLES = [
  "users",
  "resources",
  "knowledge_bases",
  "knowledge_base_documents",
  "parent_chunks",
  "child_chunks",
  "child_embeddings",
];

/**
 * Migrations that are KNOWN to "fail" under Prisma's transactional runner because
 * they wrap `ALTER TYPE ADD VALUE` in a DO $$/EXCEPTION subtransaction. Their only
 * effect is adding enum values, which Step 4.5 re-applies from the schema (DMMF) —
 * so auto-resolving them as "applied" is safe.
 *
 * Anything NOT in this set that ends up in a failed state is an UNEXPECTED failure
 * (a genuinely broken migration whose DDL never landed) and must fail the deploy
 * loudly instead of being silently marked applied — see Step 2.
 *
 * Keep in sync with the frozen baseline in
 * `src/__tests__/architecture/migration-hygiene/no-alter-type-in-exception.spec.ts`.
 * That spec prevents NEW EXCEPTION-wrapped enum migrations, so this list is closed.
 */
const KNOWN_AUTO_RESOLVABLE_MIGRATIONS: ReadonlySet<string> = new Set([
  "20251123_add_data_collection_tables",
  "20251126_add_all_ai_mention_type",
  "20260101_add_wechat_data_source",
  "20260103_add_mission_export_source",
  "20260113180000_ensure_research_tables",
  "20260113_fix_enum_values",
  "20260114000000_add_phase3_optimization",
  "20260126_add_slides_v5_tables",
  "20260213_add_export_source_types",
  "20260213_add_export_topic_report_type",
  "20260217_add_finance_secret_category",
  "20260221_add_ai_planning_credit_type",
  "20260227_add_explore_credit_type",
  "20260303_add_code_model_type",
  "20260308_add_academic_weather_secret_categories",
  "20260313_add_image_search_secret_category",
  "20260509a_llm_wiki_init",
  "20260513_wiki_multi_pass_config",
]);

const ROOT_MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");
const SCHEMA_MIGRATIONS_DIR = join(
  process.cwd(),
  "prisma",
  "schema",
  "migrations",
);

function getLocalMigrationNames(): string[] {
  if (!existsSync(ROOT_MIGRATIONS_DIR)) {
    return [];
  }

  return readdirSync(ROOT_MIGRATIONS_DIR)
    .filter((entry) => statSync(join(ROOT_MIGRATIONS_DIR, entry)).isDirectory())
    .filter((entry) => !entry.startsWith("."))
    .filter((entry) => entry !== "manual")
    .sort();
}

function prepareSchemaMigrationDirectory(): boolean {
  if (existsSync(SCHEMA_MIGRATIONS_DIR)) {
    return false;
  }

  mkdirSync(SCHEMA_MIGRATIONS_DIR, { recursive: true });

  const migrationLockFile = join(ROOT_MIGRATIONS_DIR, "migration_lock.toml");
  if (existsSync(migrationLockFile)) {
    cpSync(
      migrationLockFile,
      join(SCHEMA_MIGRATIONS_DIR, "migration_lock.toml"),
    );
  }

  for (const migrationName of getLocalMigrationNames()) {
    cpSync(
      join(ROOT_MIGRATIONS_DIR, migrationName),
      join(SCHEMA_MIGRATIONS_DIR, migrationName),
      { recursive: true },
    );
  }

  console.log(
    "   Prepared prisma/schema/migrations for Prisma CLI compatibility",
  );
  return true;
}

function cleanupSchemaMigrationDirectory(wasCreated: boolean): void {
  if (!wasCreated) {
    return;
  }

  rmSync(SCHEMA_MIGRATIONS_DIR, { recursive: true, force: true });
  console.log("   Removed temporary prisma/schema/migrations directory");
}

async function markAllMigrationsApplied(): Promise<void> {
  const migrationNames = getLocalMigrationNames();
  for (const migrationName of migrationNames) {
    execSync(
      `npx prisma migrate resolve --schema=prisma/schema --applied "${migrationName}"`,
      {
        stdio: "inherit",
        env: process.env,
      },
    );
  }
}

async function bootstrapFreshDatabase(): Promise<void> {
  // ★ 2026-05-29 真根因 fix（onprem 冷启动从未成功）：
  //   迁移链不完整——schema.prisma 有 279 张表，迁移链只建了 ~255 张（缺 47 张，含
  //   knowledge_bases / child_chunks 等 CRITICAL 表）+ 21 个枚举类型 + 25 个枚举缺值。
  //   团队长期用 `prisma db push` 演进 schema，迁移只零散补，链早已无法在空库重放出
  //   完整 schema（`migrate deploy` 在前向引用处必崩，且就算修过崩点也少 47 张表）。
  //
  //   2026-05-27 曾从 `db push` 改成 `migrate deploy`，理由是 db push 不跑 migration
  //   里的 INSERT 种子（ai_providers/ai_models 丢失）。本次修复保留 db push（唯一能产出
  //   完整正确 schema 的方式），并显式补种子（seed-catalog.sql）堵上那个坑。
  //
  //   ⚠️ 仅 fresh 库走此分支（isFreshDatabase=true）。现存库（有 _prisma_migrations /
  //   表）永远不进这里，继续走 Step 3 的增量 migrate deploy，完全不受影响。
  console.log(
    "   Fresh database detected; bootstrapping full schema from schema.prisma (db push)...",
  );
  execSync(
    "npx prisma db push --schema=prisma/schema --skip-generate --accept-data-loss",
    { stdio: "inherit", env: process.env },
  );

  console.log(
    "   Schema pushed. Marking all migrations as applied (so future incremental deploys work)...",
  );
  await markAllMigrationsApplied();

  // db push 不执行 migration 里的 INSERT，故显式补 AI provider/model 目录种子。
  // seed-catalog.sql 全部 ON CONFLICT DO NOTHING，幂等。
  console.log(
    "   Seeding AI provider/model catalog (migration INSERTs are not run under db push)...",
  );
  execSync(
    "npx prisma db execute --schema=prisma/schema --file prisma/seed-catalog.sql",
    { stdio: "inherit", env: process.env },
  );

  console.log(
    "   Fresh database bootstrap completed (full schema from schema.prisma + catalog seeded)\n",
  );
}

async function deploy(): Promise<void> {
  console.log("========================================");
  console.log("  Database Migration Deployment");
  console.log("========================================\n");

  try {
    // Step 1: Verify database connection (with retry for Railway private networking)
    console.log("1. Connecting to database...");
    const MAX_RETRIES = 10;
    const RETRY_DELAY_MS = 3000;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await prisma.$connect();
        console.log(`   Connected successfully (attempt ${attempt})\n`);
        break;
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          throw err;
        }
        console.log(
          `   Connection attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${RETRY_DELAY_MS / 1000}s...`,
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }

    const schemaMigrationsPrepared = prepareSchemaMigrationDirectory();

    try {
      const [migrationTable] = await prisma.$queryRaw<
        Array<{ exists: boolean }>
      >`SELECT to_regclass('public._prisma_migrations') IS NOT NULL as exists`;
      const hasPrismaMigrationsTable = migrationTable?.exists === true;
      const [publicTableCountResult] = await prisma.$queryRaw<
        Array<{ count: bigint }>
      >`
        SELECT COUNT(*)::bigint as count
        FROM pg_tables
        WHERE schemaname = 'public'
      `;
      const existingCriticalTables = await prisma.$queryRaw<
        Array<{ tablename: string }>
      >`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = ANY(${CRITICAL_TABLES}::text[])
      `;
      const isFreshDatabase =
        !hasPrismaMigrationsTable &&
        Number(publicTableCountResult?.count ?? 0) === 0 &&
        existingCriticalTables.length === 0;

      if (isFreshDatabase) {
        await bootstrapFreshDatabase();
      }

      // Step 2: Resolve KNOWN-safe failed migrations; fail loudly on the rest.
      //
      // Only the historical DO $$/EXCEPTION enum migrations (see
      // KNOWN_AUTO_RESOLVABLE_MIGRATIONS) may be auto-resolved as "applied": their
      // sole effect is adding enum values, which Step 4.5 re-applies from the schema.
      //
      // Any OTHER failed migration means a genuinely broken migration whose DDL never
      // landed. Previously these were silently marked applied (only a console.warn),
      // so schema changes were lost with a green deploy. Now we abort loudly so an
      // operator can inspect — never silently swallow an unknown failure.
      console.log("2. Checking for failed migrations...");
      if (!hasPrismaMigrationsTable && !isFreshDatabase) {
        console.log(
          '   "_prisma_migrations" does not exist yet (fresh database), skipping pre-checks\n',
        );
      }

      const failedMigrations =
        hasPrismaMigrationsTable || isFreshDatabase
          ? await prisma.$queryRaw<Array<{ migration_name: string }>>`
            SELECT migration_name FROM "_prisma_migrations"
            WHERE finished_at IS NULL AND rolled_back_at IS NULL
          `
          : [];

      if (failedMigrations.length > 0) {
        const unexpected = failedMigrations.filter(
          (m) => !KNOWN_AUTO_RESOLVABLE_MIGRATIONS.has(m.migration_name),
        );

        if (unexpected.length > 0) {
          console.error(
            `   ERROR: ${unexpected.length} migration(s) failed and are NOT in the known-safe allowlist:`,
          );
          for (const m of unexpected) {
            console.error(`   - ${m.migration_name}`);
          }
          console.error(
            "\n   These migrations failed and their SQL did NOT fully apply. Auto-resolving\n" +
              "   them as applied would lose schema changes behind a green deploy. Aborting.\n" +
              "   Inspect the migration, apply/fix it manually, then either:\n" +
              "     - `npx prisma migrate resolve --applied <name>` if it is truly applied, or\n" +
              "     - `npx prisma migrate resolve --rolled-back <name>` to let it re-run, or\n" +
              "     - add it to KNOWN_AUTO_RESOLVABLE_MIGRATIONS only if it is a compensated\n" +
              "       DO $$/EXCEPTION enum migration.",
          );
          throw new Error(
            `Unexpected failed migration(s): ${unexpected
              .map((m) => m.migration_name)
              .join(", ")}`,
          );
        }

        console.log(
          `   Found ${failedMigrations.length} known-safe failed migration(s) (compensated enums); resolving:`,
        );
        for (const m of failedMigrations) {
          console.log(`   - Auto-resolving as applied: ${m.migration_name}`);
          try {
            execSync(
              `npx prisma migrate resolve --schema=prisma/schema --applied "${m.migration_name}"`,
              { stdio: "inherit", env: process.env },
            );
          } catch {
            console.log(`     (already resolved or not found locally)`);
          }
        }
        console.log("");
      } else {
        console.log("   No failed migrations found\n");
      }

      // Step 2.5: Clean up rolled-back migrations
      console.log("2.5. Cleaning up rolled-back migrations...");
      const rolledBackMigrations =
        hasPrismaMigrationsTable || isFreshDatabase
          ? await prisma.$queryRaw<Array<{ migration_name: string }>>`
            SELECT DISTINCT migration_name FROM "_prisma_migrations"
            WHERE rolled_back_at IS NOT NULL
          `
          : [];

      if (rolledBackMigrations.length > 0) {
        console.log(
          `   Found ${rolledBackMigrations.length} unique rolled-back migration(s):`,
        );
        for (const m of rolledBackMigrations) {
          console.log(`   - ${m.migration_name}`);
        }

        const deleteResult = await prisma.$executeRaw`
          DELETE FROM "_prisma_migrations"
          WHERE rolled_back_at IS NOT NULL
        `;
        console.log(`   Deleted ${deleteResult} rolled-back records`);
        console.log("   These migrations will be re-run by migrate deploy\n");
      } else {
        console.log("   No rolled-back migrations found\n");
      }

      // Step 3: Run Prisma migrate deploy
      console.log("3. Running Prisma migrate deploy...");
      execSync("npx prisma migrate deploy --schema=prisma/schema", {
        stdio: "inherit",
        env: process.env,
      });
      console.log("   Migrations deployed\n");

      // Step 4: Generate Prisma Client
      console.log("4. Generating Prisma Client...");
      execSync("npx prisma generate --schema=prisma/schema", {
        stdio: "inherit",
        env: process.env,
      });
      console.log("   Client generated\n");

      // Step 4.5: Ensure all schema enum values exist (schema-derived).
      // WHY: historical migrations wrapped `ALTER TYPE ADD VALUE` in DO $$/EXCEPTION,
      // which fails inside a subtransaction; those migrations were auto-resolved as
      // applied (Step 2) but the enum values were never added. A hand-maintained
      // compensation list drifted — 11 EXCEPTION-wrapped enums were left uncovered
      // (e.g. MentionType.ALL_AI), risking runtime "invalid input value for enum".
      // Instead, derive EVERY enum + value from the Prisma schema (DMMF) and add any
      // missing one. Idempotent and self-maintaining: new enums/values are covered
      // automatically, so this never drifts again.
      console.log("4.5. Ensuring enum values from schema (DMMF-derived)...");

      // Existing (type, label) pairs — one query, then only add what is missing.
      const existingEnumPairs = await prisma.$queryRaw<
        Array<{ typname: string; enumlabel: string }>
      >`
        SELECT t.typname, e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
      `;
      const existingEnumSet = new Set(
        existingEnumPairs.map((r) => `${r.typname} ${r.enumlabel}`),
      );

      let enumValuesAdded = 0;
      for (const enumDef of Prisma.dmmf.datamodel.enums) {
        const typeName = enumDef.dbName ?? enumDef.name;
        for (const value of enumDef.values) {
          if (existingEnumSet.has(`${typeName} ${value.name}`)) {
            continue;
          }
          try {
            // ALTER TYPE ADD VALUE cannot run inside a (sub)transaction;
            // $executeRawUnsafe runs it in autocommit. IF NOT EXISTS guards races.
            await prisma.$executeRawUnsafe(
              `ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS '${value.name.replace(/'/g, "''")}'`,
            );
            enumValuesAdded++;
            console.log(`   Added ${typeName}.${value.name}`);
          } catch (error: unknown) {
            const message =
              error instanceof Error ? error.message : String(error);
            if (message.includes("already exists")) {
              continue;
            }
            console.warn(
              `   Warning: could not add ${typeName}.${value.name}: ${message}`,
            );
          }
        }
      }
      console.log(
        `   Enum check complete (${enumValuesAdded} added, ${existingEnumSet.size} already present)\n`,
      );
      // Step 4.6: Data migrations (idempotent)
      console.log("4.6. Running data migrations...");

      // Fix MCP server package names (from @anthropics to @modelcontextprotocol)
      try {
        const githubFixed = await prisma.$executeRaw`
        UPDATE "mcp_server_configs"
        SET args = array_replace(args, '@anthropics/mcp-server-github', '@modelcontextprotocol/server-github')
        WHERE '@anthropics/mcp-server-github' = ANY(args)
      `;
        const ddgFixed = await prisma.$executeRaw`
        UPDATE "mcp_server_configs"
        SET args = array_replace(args, '@anthropics/mcp-server-duckduckgo', '@modelcontextprotocol/server-ddg-search')
        WHERE '@anthropics/mcp-server-duckduckgo' = ANY(args)
      `;
        const fsFixed = await prisma.$executeRaw`
        UPDATE "mcp_server_configs"
        SET args = array_replace(args, '@anthropics/mcp-server-filesystem', '@modelcontextprotocol/server-filesystem')
        WHERE '@anthropics/mcp-server-filesystem' = ANY(args)
      `;
        const totalFixed = githubFixed + ddgFixed + fsFixed;
        if (totalFixed > 0) {
          console.log(`   Fixed ${totalFixed} MCP server package name(s)`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`   Warning: Could not fix MCP package names: ${message}`);
      }

      // Fix secret categories for known secrets
      try {
        const githubSecretsFixed = await prisma.$executeRaw`
        UPDATE "secrets"
        SET category = 'DEV_TOOLS'
        WHERE (LOWER(name) LIKE '%github%' OR LOWER(display_name) LIKE '%github%')
          AND category != 'DEV_TOOLS'
      `;
        if (githubSecretsFixed > 0) {
          console.log(
            `   Fixed ${githubSecretsFixed} GitHub secret(s) category`,
          );
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`   Warning: Could not fix secret categories: ${message}`);
      }
      console.log("   Data migrations completed\n");

      // Step 5: Verify critical tables
      console.log("5. Verifying critical tables...");
      const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = ANY(${CRITICAL_TABLES}::text[])
      `;

      const foundTables = new Set(tables.map((t) => t.tablename));
      let allFound = true;

      for (const table of CRITICAL_TABLES) {
        const exists = foundTables.has(table);
        console.log(`   ${exists ? "OK" : "MISSING"} ${table}`);
        if (!exists) allFound = false;
      }

      if (!allFound) {
        console.warn("\n   Warning: Some critical tables are missing!\n");
      }

      console.log("\n========================================");
      console.log("  Migration deployment completed!");
      console.log("========================================\n");
    } finally {
      cleanupSchemaMigrationDirectory(schemaMigrationsPrepared);
    }
  } catch (error) {
    console.error("\n========================================");
    console.error("  Migration deployment FAILED");
    console.error("========================================");
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run deployment
deploy();
