-- Manual Migration: Fix GitHub Secret Category and MCP Package Names
-- Run this SQL on your production database
-- Date: 2026-01-21

-- ============================================
-- 1. Fix GitHub secret category to DEV_TOOLS
-- ============================================
UPDATE "secrets"
SET category = 'DEV_TOOLS'
WHERE (LOWER(name) LIKE '%github%' OR LOWER(display_name) LIKE '%github%')
  AND category != 'DEV_TOOLS';

-- ============================================
-- 2. Fix MCP server package names
-- ============================================

-- Fix GitHub server package name
UPDATE "MCPServerConfig"
SET args = REPLACE(args::text, '@anthropics/mcp-server-github', '@modelcontextprotocol/server-github')::jsonb
WHERE args::text LIKE '%@anthropics/mcp-server-github%';

-- Fix DuckDuckGo server package name
UPDATE "MCPServerConfig"
SET args = REPLACE(args::text, '@anthropics/mcp-server-duckduckgo', '@modelcontextprotocol/server-ddg-search')::jsonb
WHERE args::text LIKE '%@anthropics/mcp-server-duckduckgo%';

-- Fix Filesystem server package name
UPDATE "MCPServerConfig"
SET args = REPLACE(args::text, '@anthropics/mcp-server-filesystem', '@modelcontextprotocol/server-filesystem')::jsonb
WHERE args::text LIKE '%@anthropics/mcp-server-filesystem%';

-- Fix any other @anthropics packages
UPDATE "MCPServerConfig"
SET args = REPLACE(args::text, '@anthropics/mcp-server-', '@modelcontextprotocol/server-')::jsonb
WHERE args::text LIKE '%@anthropics/mcp-server-%';

-- ============================================
-- Verification queries (run after migration)
-- ============================================

-- Check GitHub secrets
-- SELECT name, display_name, category FROM secrets WHERE LOWER(name) LIKE '%github%' OR LOWER(display_name) LIKE '%github%';

-- Check MCP server configs
-- SELECT server_id, name, args FROM "MCPServerConfig";
