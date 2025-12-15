// Constants for AI Image Generator

export const SUPPORTED_FILE_TYPES = [
  'text/plain',
  'text/markdown',
  'text/html',
  'application/json',
  'application/pdf',
  'text/vtt',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

export const SUPPORTED_FILE_EXTENSIONS = [
  '.txt',
  '.md',
  '.html',
  '.json',
  '.pdf',
  '.srt',
  '.vtt',
];

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3'] as const;

export const TEMPLATE_LAYOUTS = [
  'auto',
  'cards',
  'center_visual',
  'timeline',
  'comparison',
  'pyramid',
  'radial',
  'statistics',
  'checklist',
  'funnel',
  'matrix',
  'ranking',
] as const;

export const TEMPLATE_CAPACITY: Record<string, { max: number; type: string }> =
  {
    statistics: { max: 12, type: '指标' },
    cards: { max: 15, type: '卡片' },
    auto: { max: 15, type: '卡片' },
    timeline: { max: 5, type: '阶段' },
    ranking: { max: 15, type: '排名项' },
  };

export const FILE_ACCEPT_STRING = '.txt,.md,.html,.json,.pdf,.srt,.vtt,image/*';

export const ASPECT_RATIO_STORAGE_KEY = 'ai-image-aspect-ratio';
