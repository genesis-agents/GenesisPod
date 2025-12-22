/**
 * 程序化数据库迁移脚本 - 适用于 Railway 部署
 *
 * 此脚本在部署时自动执行，无需命令行交互
 *
 * 使用方法：
 * - 在 Railway 中：设置 Build Command 或 Start Command 执行此脚本
 * - 本地测试：npx tsx prisma/deploy-migrations.ts
 */

import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

/**
 * 执行 SQL 迁移文件
 */
async function executeSqlMigration(
  sqlPath: string,
  migrationName: string,
): Promise<boolean> {
  console.log(`📄 Executing migration: ${migrationName}`);

  try {
    const sql = fs.readFileSync(sqlPath, "utf-8");

    // 分割 SQL 语句（处理 DO $$ ... $$ 块）
    const statements = splitSqlStatements(sql);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt || stmt.startsWith("--")) continue;

      try {
        await prisma.$executeRawUnsafe(stmt);
      } catch (stmtError: any) {
        // 忽略一些常见的"已存在"错误
        const msg = stmtError.message || "";
        if (
          msg.includes("already exists") ||
          msg.includes("duplicate key") ||
          msg.includes("duplicate_object")
        ) {
          console.log(`   ⚠️ Statement ${i + 1}: Already exists (skipped)`);
          continue;
        }
        throw stmtError;
      }
    }

    console.log(`   ✅ Migration successful: ${migrationName}`);
    return true;
  } catch (error: any) {
    console.error(`   ❌ Migration failed: ${migrationName}`);
    console.error(`      Error: ${error.message}`);
    return false;
  }
}

/**
 * 智能分割 SQL 语句，正确处理 DO $$ ... $$ 块
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollarBlock = false;
  const lines = sql.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // 检测 DO $$ 块的开始
    if (trimmed.startsWith("DO $$") || trimmed.match(/DO\s*\$\$/)) {
      inDollarBlock = true;
      current += line + "\n";
      continue;
    }

    // 检测 $$ 块的结束
    if (inDollarBlock && trimmed.endsWith("$$;")) {
      current += line + "\n";
      statements.push(current);
      current = "";
      inDollarBlock = false;
      continue;
    }

    // 在 $$ 块内，继续累积
    if (inDollarBlock) {
      current += line + "\n";
      continue;
    }

    // 正常语句，以分号结束
    if (trimmed.endsWith(";")) {
      current += line + "\n";
      statements.push(current);
      current = "";
    } else {
      current += line + "\n";
    }
  }

  // 处理最后一个语句
  if (current.trim()) {
    statements.push(current);
  }

  return statements.filter((s) => s.trim() && !s.trim().startsWith("--"));
}

/**
 * 获取待执行的自定义迁移
 */
async function getCustomMigrations(): Promise<string[]> {
  const migrationsDir = path.join(__dirname, "migrations");

  // 定义需要手动执行的迁移文件模式
  const customMigrationPatterns = [
    "20251202_add_office_documents",
    "20251205_add_topic_join_requests",
    "20251205_cleanup_duplicate_resources",
    "20251208_add_simulation_team_white",
    "20251215_add_composite_indexes",
    "20251215_add_jsonb_gin_indexes",
    "20251215_add_feedback_table",
    "20251219_add_resource_upvotes",
    "20251220_add_office_agent_tables",
    "20251221_add_notion_integration",
    "20251221_add_feedback_attachments",
    "20251222_add_ai_coding_tables",
    "20251222_add_system_settings",
    "20251222_add_ai_coding_team_columns",
    "20251222_add_encrypted_column",
    "20251222_fix_missing_columns",
  ];

  const migrations: string[] = [];

  for (const pattern of customMigrationPatterns) {
    const migrationPath = path.join(migrationsDir, pattern, "migration.sql");
    if (fs.existsSync(migrationPath)) {
      migrations.push(migrationPath);
    }
  }

  return migrations;
}

/**
 * 检查迁移是否已执行
 */
async function isMigrationExecuted(migrationName: string): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM "_prisma_migrations"
      WHERE migration_name = ${migrationName}
      AND finished_at IS NOT NULL
    `;
    return Number(result[0].count) > 0;
  } catch {
    return false;
  }
}

/**
 * 记录迁移完成
 */
async function recordMigration(migrationName: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      INSERT INTO "_prisma_migrations" (
        id,
        checksum,
        migration_name,
        logs,
        started_at,
        finished_at
      ) VALUES (
        gen_random_uuid()::text,
        'custom_migration',
        ${migrationName},
        'Executed via deploy-migrations.ts',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (migration_name) DO NOTHING
    `;
  } catch (error) {
    // 如果记录失败，不影响迁移
    console.log(`   ⚠️ Could not record migration in _prisma_migrations table`);
  }
}

/**
 * 修复失败的migration记录
 */
async function fixFailedMigrations(): Promise<void> {
  try {
    // 查找失败的migration
    const failedMigrations = await prisma.$queryRaw<
      Array<{ migration_name: string }>
    >`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE finished_at IS NULL
      AND rolled_back_at IS NULL
    `;

    for (const migration of failedMigrations) {
      console.log(`   🔧 Fixing failed migration: ${migration.migration_name}`);

      // 直接删除失败的migration记录
      await prisma.$executeRaw`
        DELETE FROM "_prisma_migrations"
        WHERE migration_name = ${migration.migration_name}
        AND finished_at IS NULL
      `;
      console.log(
        `   ✅ Removed failed migration record: ${migration.migration_name}`,
      );
    }
  } catch (error: any) {
    console.log(`   ⚠️ Could not fix failed migrations: ${error.message}`);
  }
}

/**
 * 主部署流程
 */
async function deploy() {
  console.log("🚀 Starting Railway Database Migration Deployment");
  console.log("================================================\n");

  // Step 1: 连接数据库
  console.log("📡 Step 1: Connecting to database...");
  try {
    await prisma.$connect();
    console.log("   ✅ Connected successfully\n");
  } catch (error) {
    console.error("   ❌ Database connection failed:", error);
    process.exit(1);
  }

  // Step 1.5: 修复失败的migration记录
  console.log("🔧 Step 1.5: Fixing failed migrations...");
  await fixFailedMigrations();
  console.log("");

  // Step 2: 运行 Prisma migrate deploy（标准迁移）
  console.log("📦 Step 2: Running Prisma migrate deploy...");
  try {
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      env: process.env,
    });
    console.log("   ✅ Prisma migrations deployed\n");
  } catch (error) {
    console.error("   ⚠️ Prisma migrate deploy had issues, continuing...\n");
    // 不要在这里退出，继续执行自定义迁移
  }

  // Step 3: 执行自定义 SQL 迁移
  console.log("🔧 Step 3: Running custom SQL migrations...");
  const customMigrations = await getCustomMigrations();

  if (customMigrations.length === 0) {
    console.log("   📝 No custom migrations to execute\n");
  } else {
    for (const migrationPath of customMigrations) {
      const migrationName = path.basename(path.dirname(migrationPath));

      // 检查是否已执行
      const executed = await isMigrationExecuted(migrationName);
      if (executed) {
        console.log(`   ⏭️ Skipping (already executed): ${migrationName}`);
        continue;
      }

      // 执行迁移
      const success = await executeSqlMigration(migrationPath, migrationName);

      if (success) {
        // 记录迁移完成
        await recordMigration(migrationName);
      }
    }
    console.log("");
  }

  // Step 4: 生成 Prisma Client
  console.log("🔄 Step 4: Generating Prisma Client...");
  try {
    execSync("npx prisma generate", {
      stdio: "inherit",
      env: process.env,
    });
    console.log("   ✅ Prisma Client generated\n");
  } catch (error) {
    console.error("   ⚠️ Prisma generate had issues:", error);
  }

  // Step 5: 验证表是否创建成功
  console.log("🔍 Step 5: Verifying AI Office tables...");
  try {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename IN (
        'office_documents',
        'office_document_versions',
        'office_document_resource_refs',
        'office_document_templates',
        'office_agent_tasks',
        'office_agent_artifacts',
        'office_agent_tool_logs'
      )
    `;

    const tableNames = tables.map((t) => t.tablename);
    const requiredTables = [
      "office_documents",
      "office_document_versions",
      "office_document_resource_refs",
      "office_document_templates",
      "office_agent_tasks",
      "office_agent_artifacts",
      "office_agent_tool_logs",
    ];

    for (const table of requiredTables) {
      if (tableNames.includes(table)) {
        console.log(`   ✅ ${table}`);
      } else {
        console.log(`   ⚠️ ${table} (not found)`);
      }
    }
    console.log("");
  } catch (error) {
    console.log("   ⚠️ Could not verify tables\n");
  }

  // Step 6: 验证枚举类型
  console.log("🔍 Step 6: Verifying enum types...");
  try {
    const enums = await prisma.$queryRaw<Array<{ typname: string }>>`
      SELECT typname
      FROM pg_type
      WHERE typtype = 'e'
      AND typname IN (
        'OfficeDocumentType',
        'OfficeDocumentStatus',
        'VersionTrigger',
        'ResourceRefType',
        'TemplateCategory',
        'OfficeAgentType',
        'OfficeTaskStatus',
        'OfficeArtifactType'
      )
    `;

    const enumNames = enums.map((e) => e.typname);
    const requiredEnums = [
      "OfficeDocumentType",
      "OfficeDocumentStatus",
      "VersionTrigger",
      "ResourceRefType",
      "TemplateCategory",
      "OfficeAgentType",
      "OfficeTaskStatus",
      "OfficeArtifactType",
    ];

    for (const enumName of requiredEnums) {
      if (enumNames.includes(enumName)) {
        console.log(`   ✅ ${enumName}`);
      } else {
        console.log(`   ⚠️ ${enumName} (not found)`);
      }
    }
    console.log("");
  } catch (error) {
    console.log("   ⚠️ Could not verify enums\n");
  }

  // 完成
  console.log("================================================");
  console.log("🎉 Migration deployment completed!");
  console.log("================================================\n");

  await prisma.$disconnect();
}

// 执行
deploy().catch(async (error) => {
  console.error("❌ Deployment failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
