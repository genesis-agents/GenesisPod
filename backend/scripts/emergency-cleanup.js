/**
 * 紧急数据库清理脚本
 * 直接使用 pg 库连接，不依赖 Prisma
 *
 * 使用方式：
 *   cd backend && node scripts/emergency-cleanup.js          # 清理所有
 *   cd backend && node scripts/emergency-cleanup.js ppt      # 只清理 PPT
 *   cd backend && node scripts/emergency-cleanup.js images   # 只清理图片
 */

const { Client } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is required");
  process.exit(1);
}

const MODE = process.argv[2] || "all"; // all | ppt | images

async function main() {
  console.log(`========== 紧急数据库清理 (模式: ${MODE}) ==========\n`);

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log("正在连接数据库...");
    await client.connect();
    console.log("✅ 连接成功!\n");

    // 查看表大小
    console.log("📊 查看表大小...\n");
    const sizeResult = await client.query(`
      SELECT
        schemaname,
        relname as table_name,
        pg_size_pretty(pg_total_relation_size(relid)) as total_size,
        pg_total_relation_size(relid) as size_bytes
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 15;
    `);

    console.log("表大小排行:");
    for (const row of sizeResult.rows) {
      console.log(`  ${row.table_name}: ${row.total_size}`);
    }

    // 查看记录数
    console.log("\n📊 记录数统计...\n");
    const countQueries = [
      { name: "office_documents", table: "office_documents" },
      { name: "office_document_versions", table: "office_document_versions" },
      { name: "generated_images", table: "generated_images" },
      { name: "raw_data", table: "raw_data" },
    ];

    for (const q of countQueries) {
      try {
        const r = await client.query(`SELECT COUNT(*) FROM ${q.table}`);
        console.log(`  ${q.name}: ${r.rows[0].count} 条`);
      } catch {
        console.log(`  ${q.name}: 表不存在`);
      }
    }

    console.log("\n🗑️ 开始清理数据...\n");

    // PPT 相关清理
    if (MODE === "all" || MODE === "ppt") {
      console.log("【清理 PPT 数据】");

      // 清理 office_document_resource_refs
      console.log("  删除 office_document_resource_refs...");
      try {
        const r2 = await client.query(
          "DELETE FROM office_document_resource_refs",
        );
        console.log(`    ✅ 删除了 ${r2.rowCount} 条记录`);
      } catch (e) {
        console.log(`    ⚠️ 跳过: ${e.message}`);
      }

      // 清理 office_document_versions
      console.log("  删除 office_document_versions...");
      try {
        const r3 = await client.query("DELETE FROM office_document_versions");
        console.log(`    ✅ 删除了 ${r3.rowCount} 条记录`);
      } catch (e) {
        console.log(`    ⚠️ 跳过: ${e.message}`);
      }

      // 清理 office_documents
      console.log("  删除 office_documents...");
      try {
        const r4 = await client.query("DELETE FROM office_documents");
        console.log(`    ✅ 删除了 ${r4.rowCount} 条记录`);
      } catch (e) {
        console.log(`    ⚠️ 跳过: ${e.message}`);
      }
    }

    // 图片相关清理
    if (MODE === "all" || MODE === "images") {
      console.log("【清理图片数据】");

      console.log("  删除 generated_images...");
      try {
        const r1 = await client.query("DELETE FROM generated_images");
        console.log(`    ✅ 删除了 ${r1.rowCount} 条记录`);
      } catch (e) {
        console.log(`    ⚠️ 跳过: ${e.message}`);
      }
    }

    // 其他数据清理
    if (MODE === "all") {
      console.log("【清理其他数据】");

      console.log("  删除 raw_data...");
      try {
        const r5 = await client.query("DELETE FROM raw_data");
        console.log(`    ✅ 删除了 ${r5.rowCount} 条记录`);
      } catch (e) {
        console.log(`    ⚠️ 跳过: ${e.message}`);
      }

      console.log("  删除 deduplication_records...");
      try {
        const r6 = await client.query("DELETE FROM deduplication_records");
        console.log(`    ✅ 删除了 ${r6.rowCount} 条记录`);
      } catch (e) {
        console.log(`    ⚠️ 跳过: ${e.message}`);
      }
    }

    // VACUUM
    console.log("\n执行 VACUUM 回收空间...");
    await client.query("VACUUM");
    console.log("  ✅ VACUUM 完成");

    // 再次查看表大小
    console.log("\n📊 清理后表大小...\n");
    const sizeResult2 = await client.query(`
      SELECT
        schemaname,
        relname as table_name,
        pg_size_pretty(pg_total_relation_size(relid)) as total_size
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY pg_total_relation_size(relid) DESC
      LIMIT 10;
    `);

    for (const row of sizeResult2.rows) {
      console.log(`  ${row.table_name}: ${row.total_size}`);
    }

    console.log("\n========== 清理完成 ==========");
  } catch (error) {
    console.error("❌ 错误:", error.message);
  } finally {
    await client.end();
  }
}

main();
