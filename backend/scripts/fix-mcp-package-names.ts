/**
 * Fix MCP Server Package Names
 *
 * This script fixes incorrect package names in the MCPServerConfig table.
 * Changes: @anthropics/mcp-server-* -> @modelcontextprotocol/server-*
 *
 * Usage: npx ts-node scripts/fix-mcp-package-names.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixMCPPackageNames() {
  console.log("========================================");
  console.log("  Fix MCP Server Package Names");
  console.log("========================================\n");

  try {
    // Show current state
    console.log("1. Current MCP server configurations:");
    const before = await prisma.mCPServerConfig.findMany({
      select: { serverId: true, name: true, args: true },
    });

    for (const config of before) {
      console.log(
        `   - ${config.name} (${config.serverId}): ${JSON.stringify(config.args)}`,
      );
    }
    console.log("");

    // Fix GitHub server package name
    console.log("2. Fixing package names...");

    const githubFixed = await prisma.$executeRaw`
      UPDATE "MCPServerConfig"
      SET args = REPLACE(args::text, '@anthropics/mcp-server-github', '@modelcontextprotocol/server-github')::jsonb
      WHERE args::text LIKE '%@anthropics/mcp-server-github%'
    `;
    if (githubFixed > 0) {
      console.log(`   Fixed ${githubFixed} GitHub MCP server(s)`);
    }

    // Fix DuckDuckGo server package name
    const ddgFixed = await prisma.$executeRaw`
      UPDATE "MCPServerConfig"
      SET args = REPLACE(args::text, '@anthropics/mcp-server-duckduckgo', '@modelcontextprotocol/server-ddg-search')::jsonb
      WHERE args::text LIKE '%@anthropics/mcp-server-duckduckgo%'
    `;
    if (ddgFixed > 0) {
      console.log(`   Fixed ${ddgFixed} DuckDuckGo MCP server(s)`);
    }

    // Fix Filesystem server package name
    const fsFixed = await prisma.$executeRaw`
      UPDATE "MCPServerConfig"
      SET args = REPLACE(args::text, '@anthropics/mcp-server-filesystem', '@modelcontextprotocol/server-filesystem')::jsonb
      WHERE args::text LIKE '%@anthropics/mcp-server-filesystem%'
    `;
    if (fsFixed > 0) {
      console.log(`   Fixed ${fsFixed} Filesystem MCP server(s)`);
    }

    // Fix any other @anthropics packages
    const otherFixed = await prisma.$executeRaw`
      UPDATE "MCPServerConfig"
      SET args = REPLACE(args::text, '@anthropics/mcp-server-', '@modelcontextprotocol/server-')::jsonb
      WHERE args::text LIKE '%@anthropics/mcp-server-%'
    `;
    if (otherFixed > 0) {
      console.log(`   Fixed ${otherFixed} other MCP server(s)`);
    }

    const totalFixed =
      Number(githubFixed) +
      Number(ddgFixed) +
      Number(fsFixed) +
      Number(otherFixed);
    if (totalFixed === 0) {
      console.log("   No MCP servers needed fixing");
    }
    console.log("");

    // Show updated state
    console.log("3. Updated MCP server configurations:");
    const after = await prisma.mCPServerConfig.findMany({
      select: { serverId: true, name: true, args: true },
    });

    for (const config of after) {
      console.log(
        `   - ${config.name} (${config.serverId}): ${JSON.stringify(config.args)}`,
      );
    }

    console.log("\n========================================");
    console.log("  Fix completed successfully!");
    console.log("========================================\n");
    console.log("Please restart the backend server to apply changes.");
  } catch (error) {
    console.error("\n========================================");
    console.error("  Fix FAILED");
    console.error("========================================");
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run fix
fixMCPPackageNames();
