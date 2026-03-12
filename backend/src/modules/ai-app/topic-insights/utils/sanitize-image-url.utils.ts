/**
 * Sanitize image URLs to prevent base64 data from being injected into LLM prompts.
 * Base64 images can be 100KB-500KB+, causing massive token inflation.
 *
 * @param url The image URL to sanitize
 * @param placeholder The replacement string for base64 URLs (default: "[base64-image]")
 * @returns The original URL or the placeholder if it's a base64 data URL
 */
export function sanitizeImageUrl(
  url: string | undefined | null,
  placeholder = "[base64-image]",
): string {
  if (!url) return "";
  return url.startsWith("data:") ? placeholder : url;
}
