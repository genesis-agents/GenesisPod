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
  // 尝试多种路径解析方式
  const possibleDirs = [
    path.join(__dirname, "migrations"),
    path.join(process.cwd(), "prisma", "migrations"),
    path.join(process.cwd(), "backend", "prisma", "migrations"),
    "/app/prisma/migrations",
  ];

  let migrationsDir = "";
  for (const dir of possibleDirs) {
    console.log(`   🔍 Checking: ${dir} - exists: ${fs.existsSync(dir)}`);
    if (fs.existsSync(dir)) {
      migrationsDir = dir;
      break;
    }
  }

  if (!migrationsDir) {
    console.error("   ❌ No migrations directory found!");
    console.log(`   📁 __dirname: ${__dirname}`);
    console.log(`   📁 cwd: ${process.cwd()}`);
    return [];
  }

  console.log(`   ✅ Using migrations directory: ${migrationsDir}`);

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
    "20251222_force_fix_columns", // Force fix - always runs
    "20251223_force_add_deep_research_sessions", // Force - ensure table exists
    "20251225_add_session_bookmark", // Add isBookmarked to ask_sessions
    "20251226_force_add_google_drive", // Add Google Drive tables
    "20251226_fix_google_drive_schema", // Fix Google Drive table structure
    "20251226_add_rag_knowledge_base", // RAG Knowledge Base with pgvector
    "20251226_extend_knowledge_base_system", // Extend KB with types, data sources, AI module associations
    "20251226_force_fix_knowledge_bases", // Force fix - ensure type column exists
    "20251227_emergency_fix_columns", // Emergency fix - add missing columns to Railway
  ];

  const migrations: string[] = [];

  for (const pattern of customMigrationPatterns) {
    const migrationPath = path.join(migrationsDir, pattern, "migration.sql");
    const exists = fs.existsSync(migrationPath);
    console.log(`   📄 ${pattern}: ${exists ? "✅ found" : "❌ not found"}`);
    if (exists) {
      migrations.push(migrationPath);
    }
  }

  console.log(`   📊 Total migrations found: ${migrations.length}`);
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

      // Force migrations always run (contains "force" in name)
      const isForce = migrationName.toLowerCase().includes("force");

      // 检查是否已执行 (skip check for force migrations)
      if (!isForce) {
        const executed = await isMigrationExecuted(migrationName);
        if (executed) {
          console.log(`   ⏭️ Skipping (already executed): ${migrationName}`);
          continue;
        }
      } else {
        console.log(`   🔄 Force migration: ${migrationName}`);
      }

      // 执行迁移
      const success = await executeSqlMigration(migrationPath, migrationName);

      if (success) {
        // 记录迁移完成 (for non-force migrations)
        if (!isForce) {
          await recordMigration(migrationName);
        }
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
  console.log("🔍 Step 5: Verifying critical tables...");
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
        'office_agent_tool_logs',
        'deep_research_sessions',
        'knowledge_bases',
        'knowledge_base_documents',
        'parent_chunks',
        'child_chunks',
        'child_embeddings',
        'user_data_sources',
        'knowledge_base_sources'
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
      "deep_research_sessions",
      "knowledge_bases",
      "knowledge_base_documents",
      "parent_chunks",
      "child_chunks",
      "child_embeddings",
      "user_data_sources",
      "knowledge_base_sources",
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
        'OfficeArtifactType',
        'KnowledgeBaseStatus',
        'KnowledgeBaseSourceType',
        'KnowledgeBaseType',
        'UserDataSourceType',
        'SearchPriority'
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
      "KnowledgeBaseStatus",
      "KnowledgeBaseSourceType",
      "KnowledgeBaseType",
      "UserDataSourceType",
      "SearchPriority",
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

  // Step 7: 紧急回退 - 确保 deep_research_sessions 表存在
  console.log("🔧 Step 7: Emergency fallback for deep_research_sessions...");
  try {
    const deepResearchExists = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'deep_research_sessions'
      )
    `;

    if (!deepResearchExists[0]?.exists) {
      console.log(
        "   ⚠️ deep_research_sessions table missing, creating directly...",
      );

      // 创建枚举类型
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "DeepResearchStatus" AS ENUM ('PLANNING', 'SEARCHING', 'REFLECTING', 'SYNTHESIZING', 'COMPLETED', 'FAILED');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // 创建表
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "deep_research_sessions" (
          "id" TEXT NOT NULL,
          "project_id" TEXT NOT NULL,
          "query" TEXT NOT NULL,
          "status" "DeepResearchStatus" NOT NULL DEFAULT 'PLANNING',
          "plan" JSONB,
          "search_rounds" JSONB[] DEFAULT ARRAY[]::JSONB[],
          "reflections" JSONB[] DEFAULT ARRAY[]::JSONB[],
          "thinking_chain" JSONB[] DEFAULT ARRAY[]::JSONB[],
          "report" JSONB,
          "sources_used" INTEGER NOT NULL DEFAULT 0,
          "tokens_used" INTEGER NOT NULL DEFAULT 0,
          "error" TEXT,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "completed_at" TIMESTAMP(3),
          CONSTRAINT "deep_research_sessions_pkey" PRIMARY KEY ("id")
        );
      `);

      // 创建索引
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "deep_research_sessions_project_id_idx" ON "deep_research_sessions"("project_id");`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "deep_research_sessions_status_idx" ON "deep_research_sessions"("status");`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "deep_research_sessions_created_at_idx" ON "deep_research_sessions"("created_at" DESC);`,
      );

      // 添加外键
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          ALTER TABLE "deep_research_sessions" ADD CONSTRAINT "deep_research_sessions_project_id_fkey"
          FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      console.log("   ✅ deep_research_sessions table created successfully!");
    } else {
      console.log("   ✅ deep_research_sessions table already exists");
    }
  } catch (error: any) {
    console.error(`   ❌ Emergency fallback failed: ${error.message}`);
  }

  // Step 8: 紧急回退 - 确保 Google Drive 表存在
  console.log("🔧 Step 8: Emergency fallback for Google Drive tables...");
  try {
    const googleDriveExists = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'google_drive_connections'
      )
    `;

    if (!googleDriveExists[0]?.exists) {
      console.log(
        "   ⚠️ google_drive_connections table missing, creating directly...",
      );

      // 创建枚举类型
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "GoogleDriveConnectionStatus" AS ENUM ('ACTIVE', 'ERROR', 'EXPIRED', 'DISCONNECTED');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      console.log("   ✅ GoogleDriveConnectionStatus enum created");

      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "GoogleDriveSyncType" AS ENUM ('FULL', 'INCREMENTAL', 'MANUAL');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      console.log("   ✅ GoogleDriveSyncType enum created");

      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "GoogleDriveSyncStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      console.log("   ✅ GoogleDriveSyncStatus enum created");

      // 创建 google_drive_connections 表 (列名必须与 Prisma schema 一致)
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "google_drive_connections" (
          "id" TEXT NOT NULL,
          "user_id" TEXT NOT NULL,
          "google_id" TEXT NOT NULL,
          "email" TEXT NOT NULL,
          "display_name" TEXT,
          "photo_url" TEXT,
          "access_token" TEXT NOT NULL,
          "refresh_token" TEXT NOT NULL,
          "token_expiry" TIMESTAMP(3) NOT NULL,
          "storage_limit" BIGINT,
          "storage_usage" BIGINT,
          "status" "GoogleDriveConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
          "last_error" TEXT,
          "last_sync_at" TIMESTAMP(3),
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "google_drive_connections_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "google_drive_connections_user_id_key" UNIQUE ("user_id")
        );
      `);
      console.log("   ✅ google_drive_connections table created");

      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "google_drive_connections_google_id_idx" ON "google_drive_connections"("google_id");`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "google_drive_connections_status_idx" ON "google_drive_connections"("user_id", "status");`,
      );

      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          ALTER TABLE "google_drive_connections" ADD CONSTRAINT "google_drive_connections_user_id_fkey"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      console.log(
        "   ✅ google_drive_connections indexes and foreign key created",
      );

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "google_drive_sync_history" (
          "id" TEXT NOT NULL,
          "connection_id" TEXT NOT NULL,
          "sync_type" "GoogleDriveSyncType" NOT NULL DEFAULT 'INCREMENTAL',
          "status" "GoogleDriveSyncStatus" NOT NULL DEFAULT 'PENDING',
          "files_processed" INTEGER NOT NULL DEFAULT 0,
          "files_imported" INTEGER NOT NULL DEFAULT 0,
          "files_updated" INTEGER NOT NULL DEFAULT 0,
          "files_failed" INTEGER NOT NULL DEFAULT 0,
          "error_message" TEXT,
          "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "completed_at" TIMESTAMP(3),
          CONSTRAINT "google_drive_sync_history_pkey" PRIMARY KEY ("id")
        );
      `);
      console.log("   ✅ google_drive_sync_history table created");

      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "google_drive_sync_history_connection_id_idx" ON "google_drive_sync_history"("connection_id", "started_at");`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "google_drive_sync_history_status_idx" ON "google_drive_sync_history"("status", "started_at");`,
      );
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          ALTER TABLE "google_drive_sync_history" ADD CONSTRAINT "google_drive_sync_history_connection_id_fkey"
          FOREIGN KEY ("connection_id") REFERENCES "google_drive_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      console.log(
        "   ✅ google_drive_sync_history indexes and foreign key created",
      );

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "google_drive_imported_files" (
          "id" TEXT NOT NULL,
          "connection_id" TEXT NOT NULL,
          "google_file_id" TEXT NOT NULL,
          "google_file_name" TEXT NOT NULL,
          "google_mime_type" TEXT NOT NULL,
          "resource_id" TEXT,
          "file_hash" TEXT,
          "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "google_drive_imported_files_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "google_drive_imported_files_connection_google_file_key" UNIQUE ("connection_id", "google_file_id")
        );
      `);
      console.log("   ✅ google_drive_imported_files table created");

      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "google_drive_imported_files_connection_idx" ON "google_drive_imported_files"("connection_id", "google_file_id");`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "google_drive_imported_files_resource_idx" ON "google_drive_imported_files"("resource_id");`,
      );
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          ALTER TABLE "google_drive_imported_files" ADD CONSTRAINT "google_drive_imported_files_connection_id_fkey"
          FOREIGN KEY ("connection_id") REFERENCES "google_drive_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      console.log(
        "   ✅ google_drive_imported_files indexes and foreign key created",
      );

      console.log("   ✅ All Google Drive tables created successfully!");
    } else {
      console.log(
        "   ⚠️ google_drive_connections table exists, checking column names...",
      );

      // 修复已存在表的错误列名
      try {
        // 修复 token_expires_at -> token_expiry
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_connections' AND column_name = 'token_expires_at'
            ) AND NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_connections' AND column_name = 'token_expiry'
            ) THEN
              ALTER TABLE "google_drive_connections" RENAME COLUMN "token_expires_at" TO "token_expiry";
              RAISE NOTICE 'Renamed token_expires_at to token_expiry';
            END IF;
          END $$;
        `);

        // 修复 storage_quota -> storage_limit
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_connections' AND column_name = 'storage_quota'
            ) AND NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_connections' AND column_name = 'storage_limit'
            ) THEN
              ALTER TABLE "google_drive_connections" RENAME COLUMN "storage_quota" TO "storage_limit";
              RAISE NOTICE 'Renamed storage_quota to storage_limit';
            END IF;
          END $$;
        `);

        // 添加 token_expiry 列（如果完全不存在）
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_connections' AND column_name = 'token_expiry'
            ) THEN
              ALTER TABLE "google_drive_connections" ADD COLUMN "token_expiry" TIMESTAMP(3) NOT NULL DEFAULT NOW();
              RAISE NOTICE 'Added token_expiry column';
            END IF;
          END $$;
        `);

        // 添加 storage_limit 列（如果完全不存在）
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_connections' AND column_name = 'storage_limit'
            ) THEN
              ALTER TABLE "google_drive_connections" ADD COLUMN "storage_limit" BIGINT;
              RAISE NOTICE 'Added storage_limit column';
            END IF;
          END $$;
        `);

        // 添加 storage_usage 列（如果不存在）
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_connections' AND column_name = 'storage_usage'
            ) THEN
              ALTER TABLE "google_drive_connections" ADD COLUMN "storage_usage" BIGINT;
              RAISE NOTICE 'Added storage_usage column';
            END IF;
          END $$;
        `);

        console.log("   ✅ Column names verified/fixed");
      } catch (fixError: any) {
        console.error(
          `   ⚠️ Column fix error (non-fatal): ${fixError.message}`,
        );
      }

      // 修复 google_drive_sync_history 表结构
      console.log("   🔧 Fixing google_drive_sync_history table structure...");
      try {
        // 创建 GoogleDriveSyncAction 枚举（如果不存在）
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            CREATE TYPE "GoogleDriveSyncAction" AS ENUM ('IMPORT', 'EXPORT');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
        `);

        // 添加 action 列（如果不存在）
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_sync_history' AND column_name = 'action'
            ) THEN
              ALTER TABLE "google_drive_sync_history" ADD COLUMN "action" "GoogleDriveSyncAction" NOT NULL DEFAULT 'IMPORT';
              RAISE NOTICE 'Added action column to google_drive_sync_history';
            END IF;
          END $$;
        `);

        // 添加 google_file_id 列（如果不存在）
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_sync_history' AND column_name = 'google_file_id'
            ) THEN
              ALTER TABLE "google_drive_sync_history" ADD COLUMN "google_file_id" TEXT;
              RAISE NOTICE 'Added google_file_id column to google_drive_sync_history';
            END IF;
          END $$;
        `);

        // 添加 google_file_name 列（如果不存在）
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_sync_history' AND column_name = 'google_file_name'
            ) THEN
              ALTER TABLE "google_drive_sync_history" ADD COLUMN "google_file_name" TEXT;
              RAISE NOTICE 'Added google_file_name column to google_drive_sync_history';
            END IF;
          END $$;
        `);

        // 添加 resource_id 列（如果不存在）
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_sync_history' AND column_name = 'resource_id'
            ) THEN
              ALTER TABLE "google_drive_sync_history" ADD COLUMN "resource_id" TEXT;
              RAISE NOTICE 'Added resource_id column to google_drive_sync_history';
            END IF;
          END $$;
        `);

        // 添加 error 列（如果不存在）
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_sync_history' AND column_name = 'error'
            ) THEN
              ALTER TABLE "google_drive_sync_history" ADD COLUMN "error" TEXT;
              RAISE NOTICE 'Added error column to google_drive_sync_history';
            END IF;
          END $$;
        `);

        // 添加 metadata 列（如果不存在）
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_sync_history' AND column_name = 'metadata'
            ) THEN
              ALTER TABLE "google_drive_sync_history" ADD COLUMN "metadata" JSONB;
              RAISE NOTICE 'Added metadata column to google_drive_sync_history';
            END IF;
          END $$;
        `);

        // 添加 export_format 列（如果不存在）
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_sync_history' AND column_name = 'export_format'
            ) THEN
              ALTER TABLE "google_drive_sync_history" ADD COLUMN "export_format" TEXT;
              RAISE NOTICE 'Added export_format column to google_drive_sync_history';
            END IF;
          END $$;
        `);

        // 添加 target_folder_id 列（如果不存在）
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_sync_history' AND column_name = 'target_folder_id'
            ) THEN
              ALTER TABLE "google_drive_sync_history" ADD COLUMN "target_folder_id" TEXT;
              RAISE NOTICE 'Added target_folder_id column to google_drive_sync_history';
            END IF;
          END $$;
        `);

        // 修复 google_drive_imported_files 表结构
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            -- Rename google_mime_type to mime_type if needed
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_imported_files' AND column_name = 'google_mime_type'
            ) AND NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_imported_files' AND column_name = 'mime_type'
            ) THEN
              ALTER TABLE "google_drive_imported_files" RENAME COLUMN "google_mime_type" TO "mime_type";
              RAISE NOTICE 'Renamed google_mime_type to mime_type';
            END IF;

            -- Add mime_type if neither exists
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_imported_files' AND column_name = 'mime_type'
            ) AND NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_imported_files' AND column_name = 'google_mime_type'
            ) THEN
              ALTER TABLE "google_drive_imported_files" ADD COLUMN "mime_type" TEXT NOT NULL DEFAULT 'application/octet-stream';
              RAISE NOTICE 'Added mime_type column';
            END IF;

            -- Add google_modified_time if missing
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'google_drive_imported_files' AND column_name = 'google_modified_time'
            ) THEN
              ALTER TABLE "google_drive_imported_files" ADD COLUMN "google_modified_time" TIMESTAMP(3) NOT NULL DEFAULT NOW();
              RAISE NOTICE 'Added google_modified_time column';
            END IF;
          END $$;
        `);

        console.log(
          "   ✅ google_drive_sync_history and google_drive_imported_files structure fixed",
        );
      } catch (syncHistoryError: any) {
        console.error(
          `   ⚠️ Sync history fix error: ${syncHistoryError.message}`,
        );
      }
    }
  } catch (error: any) {
    console.error(`   ❌ Google Drive fallback failed: ${error.message}`);
  }

  // Step 9: 紧急回退 - 确保 RAG 知识库表存在
  console.log("🔧 Step 9: Emergency fallback for RAG Knowledge Base tables...");
  try {
    const ragExists = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'knowledge_bases'
      )
    `;

    if (!ragExists[0]?.exists) {
      console.log("   ⚠️ knowledge_bases table missing, creating directly...");

      // 启用 pgvector 扩展
      try {
        await prisma.$executeRawUnsafe(
          `CREATE EXTENSION IF NOT EXISTS vector;`,
        );
        console.log("   ✅ pgvector extension enabled");
      } catch (e: any) {
        console.log(`   ⚠️ pgvector extension: ${e.message}`);
      }

      // 创建枚举类型
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "KnowledgeBaseStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'UPDATING', 'ERROR');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      console.log("   ✅ KnowledgeBaseStatus enum created");

      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "KnowledgeBaseSourceType" AS ENUM ('GOOGLE_DRIVE', 'MANUAL', 'URL');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      console.log("   ✅ KnowledgeBaseSourceType enum created");

      // 创建 knowledge_bases 表 (使用 TEXT 类型匹配 Prisma schema)
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "knowledge_bases" (
          "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
          "name" VARCHAR(255) NOT NULL,
          "description" TEXT,
          "source_type" "KnowledgeBaseSourceType" NOT NULL DEFAULT 'MANUAL',
          "status" "KnowledgeBaseStatus" NOT NULL DEFAULT 'PENDING',
          "user_id" TEXT NOT NULL,
          "google_drive_connection_id" TEXT,
          "google_drive_folder_ids" JSONB NOT NULL DEFAULT '[]',
          "last_synced_at" TIMESTAMP(3),
          "last_error" TEXT,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
        );
      `);
      console.log("   ✅ knowledge_bases table created");

      // 创建 knowledge_base_documents 表
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "knowledge_base_documents" (
          "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
          "knowledge_base_id" TEXT NOT NULL,
          "title" VARCHAR(500) NOT NULL,
          "source_type" VARCHAR(100) NOT NULL,
          "source_id" VARCHAR(255),
          "source_url" TEXT,
          "mime_type" VARCHAR(100),
          "raw_content" TEXT NOT NULL,
          "status" "KnowledgeBaseStatus" NOT NULL DEFAULT 'PENDING',
          "processed_at" TIMESTAMP(3),
          "chunk_count" INTEGER NOT NULL DEFAULT 0,
          "last_error" TEXT,
          "metadata" JSONB NOT NULL DEFAULT '{}',
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "knowledge_base_documents_pkey" PRIMARY KEY ("id")
        );
      `);
      console.log("   ✅ knowledge_base_documents table created");

      // 创建 parent_chunks 表
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "parent_chunks" (
          "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
          "document_id" TEXT NOT NULL,
          "content" TEXT NOT NULL,
          "token_count" INTEGER NOT NULL,
          "position" INTEGER NOT NULL,
          "page_start" INTEGER,
          "page_end" INTEGER,
          "section_title" VARCHAR(500),
          "metadata" JSONB NOT NULL DEFAULT '{}',
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "parent_chunks_pkey" PRIMARY KEY ("id")
        );
      `);
      console.log("   ✅ parent_chunks table created");

      // 创建 child_chunks 表
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "child_chunks" (
          "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
          "parent_chunk_id" TEXT NOT NULL,
          "document_id" TEXT,
          "content" TEXT NOT NULL,
          "token_count" INTEGER NOT NULL,
          "position" INTEGER NOT NULL,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "child_chunks_pkey" PRIMARY KEY ("id")
        );
      `);
      console.log("   ✅ child_chunks table created");

      // 添加 tsvector 列
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "child_chunks" ADD COLUMN IF NOT EXISTS "content_tsv" tsvector
        GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
      `);
      console.log("   ✅ child_chunks tsvector column added");

      // 创建 child_embeddings 表 (pgvector)
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "child_embeddings" (
          "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
          "child_chunk_id" TEXT NOT NULL,
          "embedding" vector(1536) NOT NULL,
          "model" VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-small',
          "dimensions" INTEGER NOT NULL DEFAULT 1536,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "child_embeddings_pkey" PRIMARY KEY ("id")
        );
      `);
      console.log("   ✅ child_embeddings table created");

      // 添加外键约束
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          ALTER TABLE "knowledge_base_documents" ADD CONSTRAINT "knowledge_base_documents_knowledge_base_id_fkey"
            FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          ALTER TABLE "parent_chunks" ADD CONSTRAINT "parent_chunks_document_id_fkey"
            FOREIGN KEY ("document_id") REFERENCES "knowledge_base_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          ALTER TABLE "child_chunks" ADD CONSTRAINT "child_chunks_parent_chunk_id_fkey"
            FOREIGN KEY ("parent_chunk_id") REFERENCES "parent_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          ALTER TABLE "child_embeddings" ADD CONSTRAINT "child_embeddings_child_chunk_id_fkey"
            FOREIGN KEY ("child_chunk_id") REFERENCES "child_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        EXCEPTION WHEN duplicate_object THEN null; END $$;
      `);
      console.log("   ✅ Foreign keys created");

      // 创建索引
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "knowledge_bases_user_id_idx" ON "knowledge_bases"("user_id");`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "knowledge_bases_status_idx" ON "knowledge_bases"("status");`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "knowledge_base_documents_knowledge_base_id_idx" ON "knowledge_base_documents"("knowledge_base_id");`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "parent_chunks_document_id_idx" ON "parent_chunks"("document_id");`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "child_chunks_parent_chunk_id_idx" ON "child_chunks"("parent_chunk_id");`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "child_chunks_document_id_idx" ON "child_chunks"("document_id");`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "child_embeddings_child_chunk_id_idx" ON "child_embeddings"("child_chunk_id");`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "child_chunks_content_tsv_idx" ON "child_chunks" USING GIN ("content_tsv");`,
      );
      console.log("   ✅ Indexes created");

      // 创建 vector 相似度索引 (IVFFlat)
      try {
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "child_embeddings_embedding_idx" ON "child_embeddings"
            USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
        `);
        console.log("   ✅ Vector similarity index created");
      } catch (e: any) {
        console.log(
          `   ⚠️ Vector index (will be created when data is added): ${e.message}`,
        );
      }

      console.log("   ✅ All RAG tables created successfully!");
    } else {
      console.log("   ✅ knowledge_bases table already exists");
    }
  } catch (error: any) {
    console.error(`   ❌ RAG tables fallback failed: ${error.message}`);
  }

  // Step 9.5: 链接 knowledge_bases 到 google_drive_connections
  console.log(
    "🔧 Step 9.5: Linking RAG to Google Drive (add FK if both tables exist)...",
  );
  try {
    // 检查两个表是否都存在
    const bothTablesExist = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename IN ('knowledge_bases', 'google_drive_connections')
    `;

    if (Number(bothTablesExist[0]?.count) === 2) {
      // 添加 FK 约束 (如果不存在)
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_google_drive_connection_id_fkey"
            FOREIGN KEY ("google_drive_connection_id") REFERENCES "google_drive_connections"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
      console.log(
        "   ✅ knowledge_bases -> google_drive_connections FK created",
      );
    } else {
      console.log(
        "   ⚠️ Skipping FK: not all required tables exist yet (knowledge_bases or google_drive_connections missing)",
      );
    }
  } catch (error: any) {
    console.log(`   ⚠️ FK creation skipped: ${error.message}`);
  }

  // Step 10: 紧急修复 - 确保 knowledge_bases.type 和 ai_models 必要列存在
  console.log(
    "🔧 Step 10: Emergency fix for knowledge_bases.type and ai_models columns...",
  );
  try {
    // 创建 KnowledgeBaseType 枚举（如果不存在）
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "KnowledgeBaseType" AS ENUM ('PERSONAL', 'TEAM');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log("   ✅ KnowledgeBaseType enum ensured");

    // 添加 knowledge_bases.type 列（如果不存在）
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'knowledge_bases' AND column_name = 'type'
        ) THEN
          ALTER TABLE "knowledge_bases" ADD COLUMN "type" "KnowledgeBaseType" NOT NULL DEFAULT 'PERSONAL';
          RAISE NOTICE 'Added type column to knowledge_bases';
        END IF;
      END $$;
    `);
    console.log("   ✅ knowledge_bases.type column ensured");

    // 添加 knowledge_bases.team_id 列（如果不存在）
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'knowledge_bases' AND column_name = 'team_id'
        ) THEN
          ALTER TABLE "knowledge_bases" ADD COLUMN "team_id" TEXT;
          RAISE NOTICE 'Added team_id column to knowledge_bases';
        END IF;
      END $$;
    `);
    console.log("   ✅ knowledge_bases.team_id column ensured");

    // 添加 ai_models.embedding_dimensions 列（如果不存在）
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ai_models' AND column_name = 'embedding_dimensions'
        ) THEN
          ALTER TABLE "ai_models" ADD COLUMN "embedding_dimensions" INTEGER;
          RAISE NOTICE 'Added embedding_dimensions column to ai_models';
        END IF;
      END $$;
    `);
    console.log("   ✅ ai_models.embedding_dimensions column ensured");

    // 添加 ai_models.max_input_tokens 列（如果不存在）
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ai_models' AND column_name = 'max_input_tokens'
        ) THEN
          ALTER TABLE "ai_models" ADD COLUMN "max_input_tokens" INTEGER;
          RAISE NOTICE 'Added max_input_tokens column to ai_models';
        END IF;
      END $$;
    `);
    console.log("   ✅ ai_models.max_input_tokens column ensured");

    // 创建索引（如果不存在）
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'knowledge_bases_type_idx') THEN
          CREATE INDEX "knowledge_bases_type_idx" ON "knowledge_bases"("type");
        END IF;
      END $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'knowledge_bases_team_id_idx') THEN
          CREATE INDEX "knowledge_bases_team_id_idx" ON "knowledge_bases"("team_id");
        END IF;
      END $$;
    `);
    console.log("   ✅ Indexes ensured");
  } catch (error: any) {
    console.error(`   ❌ Emergency fix failed: ${error.message}`);
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
