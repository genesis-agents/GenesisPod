/**
 * 紧急数据库清理脚本
 * 直接使用 pg 库连接，不依赖 Prisma
 */

const { Client } = require("pg");

const DATABASE_URL =
  "postgresql://postgres:flonLvuXDfPNCFOVYdYnVgFsrwiCUUiB@gondola.proxy.rlwy.net:54900/railway";

async function main() {
  console.log("========== 紧急数据库清理 ==========\n");

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

    console.log("\n🗑️ 开始清理数据...\n");

    // 1. 清理 generated_images
    console.log("删除 generated_images...");
    const r1 = await client.query("DELETE FROM generated_images");
    console.log(`  ✅ 删除了 ${r1.rowCount} 条记录`);

    // 2. 清理 office_document_resource_refs
    console.log("删除 office_document_resource_refs...");
    const r2 = await client.query("DELETE FROM office_document_resource_refs");
    console.log(`  ✅ 删除了 ${r2.rowCount} 条记录`);

    // 3. 清理 office_document_versions
    console.log("删除 office_document_versions...");
    const r3 = await client.query("DELETE FROM office_document_versions");
    console.log(`  ✅ 删除了 ${r3.rowCount} 条记录`);

    // 4. 清理 office_documents
    console.log("删除 office_documents...");
    const r4 = await client.query("DELETE FROM office_documents");
    console.log(`  ✅ 删除了 ${r4.rowCount} 条记录`);

    // 5. 清理 raw_data
    console.log("删除 raw_data...");
    const r5 = await client.query("DELETE FROM raw_data");
    console.log(`  ✅ 删除了 ${r5.rowCount} 条记录`);

    // 6. 清理 deduplication_records
    console.log("删除 deduplication_records...");
    const r6 = await client.query("DELETE FROM deduplication_records");
    console.log(`  ✅ 删除了 ${r6.rowCount} 条记录`);

    // 7. VACUUM
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
