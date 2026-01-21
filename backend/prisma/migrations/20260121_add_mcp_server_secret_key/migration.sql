-- Add secret_key column to mcp_server_configs table
-- This allows MCP servers to reference API keys from the Secret Manager
-- instead of storing them directly in the apiKey field

-- Add the secret_key column if it doesn't exist
ALTER TABLE "mcp_server_configs"
ADD COLUMN IF NOT EXISTS "secret_key" TEXT;

-- Comment: The secret_key field stores the name of the Secret in the secrets table
-- When the MCP server needs an API key, it will look up the secret by this name
-- This is the recommended approach over storing API keys directly in api_key field
