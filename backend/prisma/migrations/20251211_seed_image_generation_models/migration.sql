-- Seed IMAGE_GENERATION AI models for PPT image generation
-- These models are required for AI Office PPT slides to include images
--
-- IMPORTANT: After running this migration, you MUST set the API key for at least one model:
-- Option 1: Via Railway environment variables (recommended)
-- Option 2: Via admin UI at /admin/settings
-- Option 3: Direct database update:
--   UPDATE ai_models SET api_key = 'your-google-api-key' WHERE id = 'imagen-3-default';

-- Google Imagen 3 (primary image generation model)
-- Uses the same API key as Gemini (GOOGLE_API_KEY)
INSERT INTO "ai_models" (
  "id",
  "name",
  "display_name",
  "provider",
  "model_id",
  "model_type",
  "icon",
  "color",
  "api_endpoint",
  "api_key",
  "max_tokens",
  "temperature",
  "is_enabled",
  "is_default",
  "priority",
  "created_at",
  "updated_at"
) VALUES (
  'imagen-3-default',
  'imagen-3',
  'Google Imagen 3',
  'Google',
  'imagen-3.0-generate-002',
  'IMAGE_GENERATION',
  '🎨',
  'from-purple-500 to-pink-500',
  'https://generativelanguage.googleapis.com/v1beta',
  NULL,  -- API key should be set via admin UI or direct DB update
  1024,
  0.7,
  true,
  true,  -- Set as default image generation model
  10,
  NOW(),
  NOW()
) ON CONFLICT ("id") DO UPDATE SET
  "display_name" = EXCLUDED."display_name",
  "model_id" = EXCLUDED."model_id",
  "model_type" = EXCLUDED."model_type",
  "is_enabled" = EXCLUDED."is_enabled",
  "is_default" = EXCLUDED."is_default",
  "updated_at" = NOW();

-- OpenAI DALL-E 3 (alternative image generation model)
INSERT INTO "ai_models" (
  "id",
  "name",
  "display_name",
  "provider",
  "model_id",
  "model_type",
  "icon",
  "color",
  "api_endpoint",
  "api_key",
  "max_tokens",
  "temperature",
  "is_enabled",
  "is_default",
  "priority",
  "created_at",
  "updated_at"
) VALUES (
  'dall-e-3-default',
  'dall-e-3',
  'OpenAI DALL-E 3',
  'OpenAI',
  'dall-e-3',
  'IMAGE_GENERATION',
  '🖼️',
  'from-green-500 to-teal-500',
  'https://api.openai.com/v1',
  NULL,  -- API key should be set via admin UI if needed
  1024,
  0.7,
  false,  -- Disabled by default, enable if you have OpenAI API key
  false,
  20,
  NOW(),
  NOW()
) ON CONFLICT ("id") DO UPDATE SET
  "display_name" = EXCLUDED."display_name",
  "model_id" = EXCLUDED."model_id",
  "model_type" = EXCLUDED."model_type",
  "updated_at" = NOW();
