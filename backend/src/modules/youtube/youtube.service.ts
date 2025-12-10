import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";

type YoutubeModule = typeof import("youtubei.js");
type YoutubeClient = Awaited<ReturnType<YoutubeModule["Innertube"]["create"]>>;

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface TranscriptResponse {
  videoId: string;
  title: string;
  transcript: TranscriptSegment[];
}

// Supadata API response types
interface SupadataTranscriptChunk {
  text: string;
  offset: number;
  duration: number;
}

interface SupadataResponse {
  content: SupadataTranscriptChunk[] | string;
  lang: string;
  availableLangs: string[];
}

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);
  private youtube: YoutubeClient | null = null;
  private readonly SUPADATA_API_KEY = process.env.SUPADATA_API_KEY || "";
  private readonly SUPADATA_ENABLED = !!process.env.SUPADATA_API_KEY;

  async onModuleInit() {
    try {
      await this.ensureClient();
      this.logger.log("YouTube client initialized successfully");
      if (this.SUPADATA_ENABLED) {
        this.logger.log("Supadata API enabled as primary transcript provider");
      } else {
        this.logger.warn(
          "SUPADATA_API_KEY not set - using fallback transcript methods only",
        );
      }
    } catch (error) {
      this.logger.error("Failed to initialize YouTube client:", error);
    }
  }

  /**
   * Fetch YouTube video transcript
   * Uses Supadata API as primary provider (cloud-friendly, no IP blocking)
   * Falls back to other methods if Supadata is unavailable
   *
   * @param videoId YouTube video ID
   * @param lang Language code (default: 'en')
   * @returns Transcript data
   */
  async getTranscript(
    videoId: string,
    lang: string = "en",
  ): Promise<TranscriptResponse> {
    this.logger.log(
      `Fetching transcript for video: ${videoId} (lang: ${lang})`,
    );

    // Strategy 1: Try Supadata API first (recommended for cloud deployments)
    if (this.SUPADATA_ENABLED) {
      const supadataResult = await this.fetchTranscriptSupadata(videoId, lang);
      if (supadataResult) {
        this.logger.log(
          `Successfully fetched transcript via Supadata API for ${videoId}`,
        );
        return supadataResult;
      }
      this.logger.warn(
        `Supadata API failed for ${videoId}, falling back to other methods`,
      );
    }

    // Strategy 2: Try local methods (may fail on cloud due to IP blocking)
    let transcriptSegments: TranscriptSegment[] = [];
    let title: string | null = null;

    try {
      // If requesting Chinese, skip youtubei.js and go directly to fallback methods
      if (lang.startsWith("zh")) {
        this.logger.log(
          `Requesting Chinese transcript, using fallback methods`,
        );
        throw new Error("Force fallback for Chinese");
      }

      await this.ensureClient();
      const info = await this.youtube!.getInfo(videoId);

      if (!info) {
        throw new NotFoundException("Video not found");
      }

      title = info.basic_info.title ?? null;

      // Get transcript
      const transcriptData = await info.getTranscript();

      if (!transcriptData?.transcript) {
        throw new NotFoundException(
          "Transcript not available for this video. The video may not have captions enabled.",
        );
      }

      // Transform transcript data
      if (!transcriptData.transcript.content?.body) {
        throw new NotFoundException("Invalid transcript data structure");
      }

      const transcript: TranscriptSegment[] =
        transcriptData.transcript.content.body.initial_segments
          .filter((segment: any) => segment.snippet?.text) // Filter out segments without text
          .map((segment: any) => ({
            text: segment.snippet.text,
            start: segment.start_ms / 1000, // Convert milliseconds to seconds
            duration: segment.end_ms / 1000 - segment.start_ms / 1000,
          }));

      transcriptSegments = transcript;
      this.logger.log(
        `Successfully fetched ${transcript.length} transcript segments for "${title ?? videoId}"`,
      );
    } catch (error: unknown) {
      const parserMismatch = this.isYoutubeParserMismatch(error);
      if (parserMismatch) {
        this.logger.warn(
          `youtubei parser mismatch while fetching ${videoId}; falling back to alternate transcript providers`,
        );
      } else {
        this.logger.debug(
          `Primary method failed for ${videoId} (lang: ${lang}): ${error}`,
        );
      }

      // Try youtube-transcript library first
      const npmTranscript = await this.fetchTranscriptNpm(videoId, lang);
      if (npmTranscript) {
        transcriptSegments = npmTranscript.segments;
        title = title ?? npmTranscript.title;
        this.logger.log(
          `Used youtube-transcript npm package for ${videoId} (lang: ${lang}), segments=${transcriptSegments.length}`,
        );
      } else {
        // Try external API fallback
        const fallback = await this.fetchTranscriptFallback(videoId, lang);
        if (fallback) {
          transcriptSegments = fallback.segments;
          title = title ?? fallback.title;
          this.logger.warn(
            `Used fallback transcript provider for ${videoId} (lang: ${lang}), segments=${transcriptSegments.length}`,
          );
        } else {
          if (error instanceof NotFoundException) {
            throw error;
          }

          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";

          if (errorMessage.includes("not found")) {
            throw new NotFoundException(
              "Video not found or transcript not available",
            );
          }

          if (errorMessage.includes("Invalid")) {
            throw new BadRequestException("Invalid YouTube video ID");
          }

          throw new BadRequestException(
            `Failed to fetch transcript: ${errorMessage}. YouTube may be blocking requests from this server. Consider setting SUPADATA_API_KEY for reliable transcript access.`,
          );
        }
      }
    }

    if (transcriptSegments.length === 0) {
      throw new NotFoundException(
        "Transcript not available for this video. YouTube may be blocking requests from cloud servers.",
      );
    }

    const finalTitle =
      title ??
      (await this.fetchVideoTitle(videoId)) ??
      `YouTube Video ${videoId}`;

    return {
      videoId,
      title: finalTitle,
      transcript: transcriptSegments,
    };
  }

  /**
   * Fetch transcript using Supadata API (recommended for cloud deployments)
   * Supadata handles proxy/IP blocking issues automatically
   *
   * @see https://docs.supadata.ai/get-transcript
   */
  private async fetchTranscriptSupadata(
    videoId: string,
    preferredLang: string = "en",
  ): Promise<TranscriptResponse | null> {
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const params = new URLSearchParams({
        url: videoUrl,
        text: "false", // Get timestamped chunks instead of plain text
        mode: "native", // Only fetch native transcripts (1 credit), not AI-generated
      });

      if (preferredLang) {
        params.set("lang", preferredLang);
      }

      const response = await fetch(
        `https://api.supadata.ai/v1/transcript?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "x-api-key": this.SUPADATA_API_KEY,
            Accept: "application/json",
          },
        },
      );

      // Handle async job (HTTP 202)
      if (response.status === 202) {
        const jobData = (await response.json()) as { jobId: string };
        this.logger.log(
          `Supadata returned job ID ${jobData.jobId}, polling for result...`,
        );
        return await this.pollSupadataJob(jobData.jobId, videoId);
      }

      if (!response.ok) {
        this.logger.warn(
          `Supadata API returned ${response.status}: ${response.statusText}`,
        );
        return null;
      }

      const data = (await response.json()) as SupadataResponse;

      // Handle plain text response
      if (typeof data.content === "string") {
        // If we got plain text, create a single segment
        return {
          videoId,
          title:
            (await this.fetchVideoTitle(videoId)) ?? `YouTube Video ${videoId}`,
          transcript: [
            {
              text: data.content,
              start: 0,
              duration: 0,
            },
          ],
        };
      }

      // Handle chunked response
      const segments: TranscriptSegment[] = data.content.map((chunk) => ({
        text: chunk.text,
        start: chunk.offset / 1000, // Convert ms to seconds
        duration: chunk.duration / 1000,
      }));

      const title =
        (await this.fetchVideoTitle(videoId)) ?? `YouTube Video ${videoId}`;

      this.logger.log(
        `Supadata returned ${segments.length} segments (lang: ${data.lang}) for ${videoId}`,
      );

      return {
        videoId,
        title,
        transcript: segments,
      };
    } catch (error) {
      this.logger.error(`Supadata API error: ${String(error)}`);
      return null;
    }
  }

  /**
   * Poll Supadata job until completion (for large videos)
   */
  private async pollSupadataJob(
    jobId: string,
    videoId: string,
    maxAttempts: number = 30,
    intervalMs: number = 2000,
  ): Promise<TranscriptResponse | null> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      try {
        const response = await fetch(
          `https://api.supadata.ai/v1/transcript/${jobId}`,
          {
            method: "GET",
            headers: {
              "x-api-key": this.SUPADATA_API_KEY,
              Accept: "application/json",
            },
          },
        );

        if (response.status === 202) {
          // Still processing
          this.logger.debug(
            `Supadata job ${jobId} still processing (attempt ${attempt + 1}/${maxAttempts})`,
          );
          continue;
        }

        if (!response.ok) {
          this.logger.warn(`Supadata job ${jobId} failed: ${response.status}`);
          return null;
        }

        const data = (await response.json()) as SupadataResponse;

        if (typeof data.content === "string") {
          return {
            videoId,
            title:
              (await this.fetchVideoTitle(videoId)) ??
              `YouTube Video ${videoId}`,
            transcript: [{ text: data.content, start: 0, duration: 0 }],
          };
        }

        const segments: TranscriptSegment[] = data.content.map((chunk) => ({
          text: chunk.text,
          start: chunk.offset / 1000,
          duration: chunk.duration / 1000,
        }));

        return {
          videoId,
          title:
            (await this.fetchVideoTitle(videoId)) ?? `YouTube Video ${videoId}`,
          transcript: segments,
        };
      } catch (error) {
        this.logger.warn(`Error polling Supadata job ${jobId}: ${error}`);
      }
    }

    this.logger.warn(
      `Supadata job ${jobId} timed out after ${maxAttempts} attempts`,
    );
    return null;
  }

  /**
   * Extract video ID from various YouTube URL formats
   * @param url YouTube URL
   * @returns Video ID
   */
  extractVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  }

  private async ensureClient() {
    if (!this.youtube) {
      // Use Function constructor to force true dynamic import at runtime
      // This prevents TypeScript from converting import() to require() in CommonJS
      const importDynamic = new Function(
        "modulePath",
        "return import(modulePath)",
      );
      const youtubeModule = (await importDynamic(
        "youtubei.js",
      )) as YoutubeModule;
      const { Innertube } = youtubeModule;
      this.youtube = await Innertube.create();
    }
  }

  private async fetchVideoTitle(videoId: string): Promise<string | null> {
    try {
      const response = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      );
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as { title?: string };
      return data.title ?? null;
    } catch (error) {
      this.logger.warn(
        `Failed to fetch video title via oEmbed: ${String(error)}`,
      );
      return null;
    }
  }

  private async fetchTranscriptNpm(
    videoId: string,
    preferredLang: string = "en",
  ): Promise<{
    segments: TranscriptSegment[];
    title: string | null;
  } | null> {
    try {
      const { YoutubeTranscript } = await import("youtube-transcript");

      // Build comprehensive language list - include all common variants
      // zh-Hans is commonly used for Simplified Chinese on YouTube
      let languages: string[];
      if (preferredLang.startsWith("zh")) {
        languages = [
          "zh-Hans",
          "zh-Hant",
          "zh-CN",
          "zh-TW",
          "zh",
          "en",
          "ja",
          "ko",
        ];
      } else {
        languages = [
          preferredLang,
          "en",
          "zh-Hans", // Simplified Chinese - most common
          "zh-Hant", // Traditional Chinese
          "zh-CN",
          "zh-TW",
          "zh",
          "ja",
          "ko",
        ];
      }

      for (const lang of languages) {
        try {
          const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
            lang: lang,
          });

          if (transcript && transcript.length > 0) {
            const segments: TranscriptSegment[] = transcript.map(
              (item: any) => ({
                text: item.text || "",
                start: item.offset / 1000, // Convert milliseconds to seconds
                duration: item.duration / 1000, // Convert milliseconds to seconds
              }),
            );

            this.logger.log(
              `Successfully fetched transcript using youtube-transcript (lang: ${lang}) for ${videoId}`,
            );
            return { segments, title: null };
          }
        } catch (langError) {
          this.logger.debug(
            `youtube-transcript failed for lang ${lang}: ${String(langError)}`,
          );
          continue;
        }
      }

      this.logger.warn(
        `All youtube-transcript language attempts failed for ${videoId}`,
      );
      return null;
    } catch (error) {
      this.logger.warn(`youtube-transcript library failed: ${String(error)}`);
      return null;
    }
  }

  private async fetchTranscriptFallback(
    videoId: string,
    preferredLang: string = "en",
  ): Promise<{
    segments: TranscriptSegment[];
    title: string | null;
  } | null> {
    // Try multiple language codes with preferred language first
    // Include zh-Hans which is commonly used by YouTube for Simplified Chinese
    let languages: string[];
    if (preferredLang.startsWith("zh")) {
      languages = [
        "zh-Hans",
        "zh-Hant",
        "zh",
        "zh-CN",
        "zh-TW",
        "en",
        "ja",
        "ko",
      ];
    } else {
      languages = [
        preferredLang,
        "en",
        "zh-Hans", // Add zh-Hans as it's commonly used
        "zh-Hant",
        "zh",
        "zh-CN",
        "zh-TW",
        "ja",
        "ko",
      ];
    }

    for (const lang of languages) {
      try {
        const endpoint = `https://youtubetranscript.com/?lang=${lang}&server_vid2=${videoId}`;
        const response = await fetch(endpoint, {
          headers: {
            Accept: "application/json, text/plain, */*",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
          },
        });

        if (!response.ok) {
          this.logger.debug(
            `Fallback transcript service responded with ${response.status} for video ${videoId} (lang: ${lang})`,
          );
          continue;
        }

        // Check first character to determine format
        const text = await response.text();

        // Skip if response is XML (starts with <?xml or <)
        if (text.trim().startsWith("<?xml") || text.trim().startsWith("<")) {
          this.logger.debug(
            `Fallback service returned XML instead of JSON for ${videoId} (lang: ${lang}), trying XML parse`,
          );
          // Try to parse as transcript XML
          const xmlSegments = this.parseTranscriptXml(text);
          if (xmlSegments.length > 0) {
            this.logger.log(
              `Successfully parsed XML transcript from fallback (lang: ${lang}) for ${videoId}`,
            );
            return { segments: xmlSegments, title: null };
          }
          continue;
        }

        let raw: any;
        try {
          raw = JSON.parse(text);
        } catch {
          this.logger.debug(
            `Failed to parse JSON from fallback service for ${videoId} (lang: ${lang})`,
          );
          continue;
        }
        const items: Array<Record<string, any>> = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.transcripts)
            ? raw.transcripts
            : Array.isArray(raw?.data)
              ? raw.data
              : [];

        const segments: TranscriptSegment[] = items
          .map((item) => {
            const text = item.text ?? item.caption ?? "";
            const startValue = Number.parseFloat(
              item.start ?? item.start_offset ?? item.offset ?? "0",
            );
            const durationValue = Number.parseFloat(
              item.dur ?? item.duration ?? item.length ?? "0",
            );

            return {
              text: typeof text === "string" ? text : "",
              start: Number.isFinite(startValue) ? startValue : 0,
              duration: Number.isFinite(durationValue) ? durationValue : 0,
            };
          })
          .filter((segment) => segment.text.trim().length > 0);

        if (segments.length === 0) {
          continue;
        }

        const title =
          typeof raw?.title === "string"
            ? raw.title
            : typeof raw?.video_title === "string"
              ? raw.video_title
              : null;

        this.logger.log(
          `Successfully fetched transcript using fallback (lang: ${lang}) for ${videoId}`,
        );
        return { segments, title };
      } catch (error) {
        this.logger.debug(
          `Fallback transcript fetch failed for lang ${lang}: ${String(error)}`,
        );
        continue;
      }
    }

    this.logger.warn(`All fallback transcript attempts failed for ${videoId}`);

    // Try YouTube's timedtext API as final fallback
    const timedTextResult = await this.fetchTranscriptTimedText(
      videoId,
      preferredLang,
    );
    if (timedTextResult) {
      return timedTextResult;
    }

    return null;
  }

  /**
   * Fetch transcript using YouTube's timedtext API (XML format)
   */
  private async fetchTranscriptTimedText(
    videoId: string,
    preferredLang: string = "en",
  ): Promise<{
    segments: TranscriptSegment[];
    title: string | null;
  } | null> {
    const languages = preferredLang.startsWith("zh")
      ? ["zh-Hans", "zh-Hant", "zh-CN", "zh-TW", "zh", "en"]
      : [preferredLang, "en", "zh-Hans", "zh-Hant", "zh"];

    for (const lang of languages) {
      try {
        // Try to get caption track URL from video page
        const videoPageResponse = await fetch(
          `https://www.youtube.com/watch?v=${videoId}`,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
              "Accept-Language": "en-US,en;q=0.9",
            },
          },
        );

        if (!videoPageResponse.ok) {
          continue;
        }

        const html = await videoPageResponse.text();

        // Extract caption tracks from ytInitialPlayerResponse
        const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/);
        if (!captionMatch) {
          this.logger.debug(
            `No caption tracks found in video page for ${videoId}`,
          );
          continue;
        }

        let captionTracks: Array<{ baseUrl: string; languageCode: string }>;
        try {
          captionTracks = JSON.parse(captionMatch[1]);
        } catch {
          this.logger.debug(`Failed to parse caption tracks for ${videoId}`);
          continue;
        }

        // Find matching language track
        const track = captionTracks.find(
          (t) =>
            t.languageCode === lang ||
            t.languageCode.startsWith(lang.split("-")[0]),
        );

        if (!track?.baseUrl) {
          this.logger.debug(`No ${lang} caption track found for ${videoId}`);
          continue;
        }

        // Fetch the caption XML
        const captionResponse = await fetch(track.baseUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });

        if (!captionResponse.ok) {
          continue;
        }

        const xml = await captionResponse.text();

        // Parse XML transcript
        const segments = this.parseTranscriptXml(xml);

        if (segments.length > 0) {
          this.logger.log(
            `Successfully fetched transcript using timedtext API (lang: ${lang}) for ${videoId}, segments=${segments.length}`,
          );
          return { segments, title: null };
        }
      } catch (error) {
        this.logger.debug(
          `Timedtext API failed for lang ${lang}: ${String(error)}`,
        );
        continue;
      }
    }

    this.logger.warn(`Timedtext API fallback failed for ${videoId}`);
    return null;
  }

  /**
   * Parse YouTube transcript XML format
   * Supports multiple XML formats from different YouTube APIs
   */
  private parseTranscriptXml(xml: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];

    // Try multiple regex patterns to handle different XML formats
    const patterns = [
      // Standard format: <text start="..." dur="...">content</text>
      /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([^<]*)<\/text>/g,
      // Alternative format with different attribute order
      /<text\s+dur="([^"]+)"\s+start="([^"]+)"[^>]*>([^<]*)<\/text>/g,
      // Format with CDATA or nested content
      /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g,
      // Transcript format from youtubetranscript.com
      /<transcript>[\s\S]*?<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g,
    ];

    for (const regex of patterns) {
      let match;
      regex.lastIndex = 0; // Reset regex state

      while ((match = regex.exec(xml)) !== null) {
        let start: number, duration: number, text: string;

        // Handle different capture group orders
        if (regex.source.includes('dur="([^"]+)"\\s+start=')) {
          // dur comes before start
          duration = parseFloat(match[1]);
          start = parseFloat(match[2]);
          text = match[3];
        } else {
          start = parseFloat(match[1]);
          duration = parseFloat(match[2]);
          text = match[3];
        }

        // Decode HTML entities
        const decodedText = text
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#(\d+);/g, (_, code) =>
            String.fromCharCode(parseInt(code)),
          )
          .replace(/<[^>]+>/g, "") // Remove any nested HTML tags
          .replace(/\n/g, " ")
          .trim();

        if (decodedText && !isNaN(start) && !isNaN(duration)) {
          segments.push({ text: decodedText, start, duration });
        }
      }

      // If we found segments with this pattern, stop trying others
      if (segments.length > 0) {
        this.logger.debug(
          `XML parsed successfully with pattern, found ${segments.length} segments`,
        );
        break;
      }
    }

    // If no segments found, try a more lenient approach
    if (segments.length === 0) {
      this.logger.debug(`Standard patterns failed, trying lenient parsing`);

      // Try to extract any text with start/dur attributes
      const lenientRegex =
        /<text[^>]*start=["']?([0-9.]+)["']?[^>]*dur=["']?([0-9.]+)["']?[^>]*>([\s\S]*?)<\/text>/gi;
      let match;

      while ((match = lenientRegex.exec(xml)) !== null) {
        const start = parseFloat(match[1]);
        const duration = parseFloat(match[2]);
        const text = match[3]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/<[^>]+>/g, "")
          .replace(/\n/g, " ")
          .trim();

        if (text && !isNaN(start) && !isNaN(duration)) {
          segments.push({ text, start, duration });
        }
      }
    }

    this.logger.debug(`XML parsing result: ${segments.length} segments`);
    return segments;
  }

  private isYoutubeParserMismatch(error: unknown): boolean {
    if (error instanceof Error) {
      if (error.name === "ParsingError") {
        return true;
      }
      if (error.message.includes("Type mismatch, got")) {
        return true;
      }
    }
    if (typeof error === "object" && error !== null) {
      const maybeError = error as Record<string, unknown>;
      const name = maybeError.name;
      const message = maybeError.message;
      if (typeof name === "string" && name === "ParsingError") {
        return true;
      }
      if (
        typeof message === "string" &&
        message.includes("Type mismatch, got")
      ) {
        return true;
      }
    }
    return false;
  }
}
