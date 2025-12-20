/**
 * AI Image Service Constants
 *
 * This file contains all constants and configuration objects used by the AI Image Service
 */

/**
 * Style enhancements for different artistic styles
 */
export const STYLE_ENHANCEMENTS: Record<string, string> = {
  realistic: "photorealistic, 8k uhd, high quality, detailed",
  artistic: "artistic, painterly, vibrant colors, expressive",
  anime: "anime style, detailed, vibrant, studio quality",
  "3d": "3D render, octane render, unreal engine, highly detailed",
  sketch: "pencil sketch, detailed line art, artistic",
  watercolor: "watercolor painting, soft colors, artistic",
};

/**
 * Aspect ratio to dimensions mapping
 */
export const ASPECT_RATIO_DIMENSIONS: Record<
  string,
  { width: number; height: number }
> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1344, height: 768 },
  "9:16": { width: 768, height: 1344 },
  "4:3": { width: 1152, height: 896 },
};

/**
 * Enforced negative keywords for consulting-style infographics
 */
export const ENFORCED_NEGATIVE_KEYWORDS = [
  "ai art style",
  "neon glow",
  "lens flare",
  "3d render",
  "graffiti texture",
  "painterly brushstroke",
  "blurry text",
  "illegible typography",
  "photorealistic",
  "cinematic lighting",
  "depth of field",
  "bokeh",
  "motion blur",
  "dark moody",
  "futuristic sci-fi",
  "abstract art",
  "oil painting",
  "watercolor",
  "sketch style",
  "gradient mesh",
  "hyperrealistic",
  "dramatic shadows",
  "vignette",
  "film grain",
];

/**
 * Negative keywords specifically for ai_image mode
 */
export const AI_IMAGE_MODE_NEGATIVES = [
  "text",
  "letters",
  "words",
  "numbers",
  "typography",
  "infographic",
  "chart",
  "data visualization",
  "business card",
  "poster with text",
];

/**
 * Gemini models that support image generation
 */
export const GEMINI_IMAGE_MODELS = [
  "gemini-2.0-flash-exp",
  "gemini-2.0-flash-exp-image-generation",
];

/**
 * Minimum content length for extraction validation
 */
export const MIN_CONTENT_LENGTH = 50;

/**
 * Minimum prompt length for direct prompts
 */
export const MIN_PROMPT_LENGTH = 10;

/**
 * Content preview length for processing steps
 */
export const CONTENT_PREVIEW_LENGTH = 300;

/**
 * Long content preview length for URL content
 */
export const URL_CONTENT_PREVIEW_LENGTH = 500;

/**
 * Short visual prompt detection thresholds
 */
export const SHORT_VISUAL_PROMPT_THRESHOLDS = {
  maxCharacters: 30,
  maxWords: 10,
};

/**
 * Patterns for detecting comic/illustration content
 */
export const COMIC_ILLUSTRATION_PATTERN =
  /comic|manga|漫画|连环画|panel\s*\d|面板|第[一二三四五六七八九十\d]+[格幅张]|插画|illustration|watercolor|水彩|ink\s*style|水墨|油画|oil\s*painting|cartoon|anime|sketch|草图/i;

/**
 * Patterns for detecting structured content
 */
export const STRUCTURED_CONTENT_PATTERN =
  /\d+%|\d+\.\d+|第[一二三四五六七八九十]+|步骤|流程|对比|分析|报告|数据|统计|方案|计划/;

/**
 * Patterns for detecting list/ranking content
 */
export const LIST_CONTENT_PATTERN =
  /top\s*\d+|\d+\s*大|\d+\s*个|前\s*\d+|排行|排名|榜单|清单|列表|企业|公司|品牌|产品|技术/i;

/**
 * Quantity patterns for section count validation
 */
export const QUANTITY_PATTERNS = [
  { pattern: /三大|3大|三个|3个|三种|3种/, expected: 3 },
  { pattern: /四大|4大|四个|4个|四种|4种/, expected: 4 },
  { pattern: /五大|5大|五个|5个|五种|5种/, expected: 5 },
  { pattern: /六大|6大|六个|6个|六种|6种/, expected: 6 },
  { pattern: /七大|7大|七个|7个|七种|7种/, expected: 7 },
  { pattern: /八大|8大|八个|8个|八种|8种/, expected: 8 },
  { pattern: /九大|9大|九个|9个|九种|9种/, expected: 9 },
  { pattern: /十大|10大|十个|10个|十种|10种|TOP\s*10/i, expected: 10 },
];

/**
 * Default infographic prompt prefix for hybrid mode
 */
export const DEFAULT_INFOGRAPHIC_PREFIX =
  "Professional consulting-style infographic background";

/**
 * Infographic style keywords
 */
export const INFOGRAPHIC_STYLE_KEYWORDS = [
  "flat design",
  "modern minimalist",
  "clean geometric shapes",
  "subtle gradients",
  "business professional",
  "soft shadows",
  "elegant layout",
  "McKinsey/BCG style",
];

/**
 * Default fallback prompt for pure image generation
 */
export const DEFAULT_PURE_IMAGE_PROMPT = "A beautiful artistic image";

/**
 * Image URL validation pattern
 */
export const IMAGE_URL_PATTERN = /^(https?:\/\/\S+)(?:\s+(.*))?$/i;

/**
 * YouTube URL patterns
 */
export const YOUTUBE_URL_PATTERNS = ["youtube.com", "youtu.be"];

/**
 * Bilibili URL pattern
 */
export const BILIBILI_URL_PATTERN = "bilibili.com";
