import { NextRequest, NextResponse } from 'next/server';

// 后端 API URL - 内部服务通信
const BACKEND_API_URL = 'https://deepdive-engine.up.railway.app/api/v1';

/**
 * Parse user's natural language input to extract intent
 * Extracts URLs, visual styles, page counts, colors, etc.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { input } = body as { input: string };

    if (!input || typeof input !== 'string') {
      return NextResponse.json(
        { error: "Invalid input: 'input' field is required" },
        { status: 400 }
      );
    }

    // Forward to backend intent parser
    const response = await fetch(`${BACKEND_API_URL}/ai-office/parse-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input }),
    });

    if (!response.ok) {
      // If backend is not available, use fallback local parsing
      console.warn(
        `Backend parse-intent failed (${response.status}), using fallback`
      );
      const fallbackResult = parseIntentLocally(input);
      return NextResponse.json(fallbackResult);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Parse intent error:', error);
    // Use fallback local parsing on error
    try {
      const body = await request.clone().json();
      const fallbackResult = parseIntentLocally(body.input || '');
      return NextResponse.json(fallbackResult);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse intent' },
        { status: 500 }
      );
    }
  }
}

/**
 * Fallback local intent parser (when backend is unavailable)
 */
function parseIntentLocally(input: string) {
  // Extract URLs
  const urlRegex =
    /https?:\/\/[^\s\u4e00-\u9fa5，。！？、；：""''（）【】《》]+/gi;
  const urls: string[] = [];
  let textWithoutUrls = input;

  const matches = input.match(urlRegex);
  if (matches) {
    matches.forEach((url) => {
      const cleanUrl = url.replace(/[.,;:!?)\]}>]+$/, '');
      if (!urls.includes(cleanUrl)) {
        urls.push(cleanUrl);
      }
      textWithoutUrls = textWithoutUrls.replace(url, ' ');
    });
  }

  // Detect visual style
  const styleKeywords: Record<string, { keywords: string[]; name: string }> = {
    comic: { keywords: ['漫画', '漫画风', '卡通'], name: '漫画风' },
    doraemon: {
      keywords: ['机器猫', '哆啦A梦', '叮当猫'],
      name: '机器猫',
    },
    anime: { keywords: ['动漫', '二次元', '日漫'], name: '动漫风' },
    watercolor: { keywords: ['水彩', '水彩画'], name: '水彩风' },
    pixel: { keywords: ['像素', '复古游戏'], name: '像素风' },
    flat: { keywords: ['扁平', '扁平化'], name: '扁平化' },
    handdrawn: { keywords: ['手绘', '涂鸦'], name: '手绘风' },
    professional: { keywords: ['专业', '商务'], name: '专业商务' },
    tech: { keywords: ['科技', '未来'], name: '科技风' },
    minimal: { keywords: ['极简', '简洁'], name: '极简风' },
  };

  let visualStyle = 'default';
  let visualStyleName = '默认';
  const lowerInput = input.toLowerCase();

  for (const [styleId, styleInfo] of Object.entries(styleKeywords)) {
    for (const keyword of styleInfo.keywords) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        visualStyle = styleId;
        visualStyleName = styleInfo.name;
        break;
      }
    }
    if (visualStyle !== 'default') break;
  }

  // Detect page count
  let pageCount: number | null = null;
  const pagePatterns = [
    /(\d+)\s*页/i,
    /(\d+)\s*pages?/i,
    /(\d+)\s*张/i,
    /做\s*(\d+)\s*[个张页]/i,
    /生成\s*(\d+)\s*[页张]/i,
  ];

  for (const pattern of pagePatterns) {
    const match = input.match(pattern);
    if (match) {
      const count = parseInt(match[1], 10);
      if (count >= 1 && count <= 50) {
        pageCount = count;
        break;
      }
    }
  }

  // Clean prompt
  const cleanPrompt = textWithoutUrls
    .replace(/\s+/g, ' ')
    .replace(/[,，]{2,}/g, '，')
    .trim();

  return {
    cleanPrompt,
    urls,
    visualStyle,
    visualStyleName,
    pageCount,
    colorTheme: null,
    language: 'auto',
    includeImages: true,
    includeSpeakerNotes: false,
    confidence: 0.7,
    parseDetails: {
      urlsFound: urls.length,
      styleDetected: visualStyle !== 'default',
      pageCountDetected: pageCount !== null,
      colorThemeDetected: false,
    },
  };
}
