-- Fix MCP server package names from @anthropics to @modelcontextprotocol
-- This migration corrects the npm package names for MCP servers

-- Fix GitHub server
UPDATE "MCPServerConfig"
SET args = REPLACE(args::text, '@anthropics/mcp-server-github', '@modelcontextprotocol/server-github')::jsonb
WHERE args::text LIKE '%@anthropics/mcp-server-github%';

-- Fix DuckDuckGo server
UPDATE "MCPServerConfig"
SET args = REPLACE(args::text, '@anthropics/mcp-server-duckduckgo', '@modelcontextprotocol/server-ddg-search')::jsonb
WHERE args::text LIKE '%@anthropics/mcp-server-duckduckgo%';

-- Fix Filesystem server
UPDATE "MCPServerConfig"
SET args = REPLACE(args::text, '@anthropics/mcp-server-filesystem', '@modelcontextprotocol/server-filesystem')::jsonb
WHERE args::text LIKE '%@anthropics/mcp-server-filesystem%';

-- Fix any other @anthropics packages to @modelcontextprotocol
UPDATE "MCPServerConfig"
SET args = REPLACE(args::text, '@anthropics/mcp-server-', '@modelcontextprotocol/server-')::jsonb
WHERE args::text LIKE '%@anthropics/mcp-server-%';
