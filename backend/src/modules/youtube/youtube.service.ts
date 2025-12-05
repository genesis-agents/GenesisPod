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

export interface CommentAuthor {
  name: string;
  channelId: string;
  thumbnailUrl?: string;
}

export interface Comment {
  id: string;
  text: string;
  author: CommentAuthor;
  likeCount: number;
  publishedAt: string;
  replyCount: number;
  replies?: Comment[];
}

export interface CommentsResponse {
  videoId: string;
  comments: Comment[];
  totalCount: number;
  nextPageToken?: string;
}

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);
  private youtube: YoutubeClient | null = null;

  async onModuleInit() {
    try {
      await this.ensureClient();
      this.logger.log("YouTube client initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize YouTube client:", error);
    }
  }

  /**
   * Fetch YouTube video transcript
   * @param videoId YouTube video ID
   * @param lang Language code (default: 'en')
   * @returns Transcript data
   */
  async getTranscript(
    videoId: string,
    lang: string = "en",
  ): Promise<TranscriptResponse> {
    let transcriptSegments: TranscriptSegment[] = [];
    let title: string | null = null;
    try {
      this.logger.log(
        `Fetching transcript for video: ${videoId} (lang: ${lang})`,
      );

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
        this.logger.error(
          `Failed to fetch transcript for ${videoId} (lang: ${lang}):`,
          error,
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
            `Failed to fetch transcript: ${errorMessage}`,
          );
        }
      }
    }

    if (transcriptSegments.length === 0) {
      throw new NotFoundException("Transcript not available for this video.");
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

      // Build language list with preferred language first
      let languages: string[];
      if (preferredLang.startsWith("zh")) {
        languages = ["zh-Hans", "zh-Hant", "zh", "en", "ja", "ko"];
      } else {
        languages = [
          preferredLang,
          "en",
          "zh-Hans",
          "zh-Hant",
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
    let languages: string[];
    if (preferredLang.startsWith("zh")) {
      languages = ["zh", "zh-CN", "zh-TW", "en", "ja", "ko"];
    } else {
      languages = [preferredLang, "en", "zh", "zh-CN", "zh-TW", "ja", "ko"];
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
   */
  private parseTranscriptXml(xml: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];

    // Match <text start="..." dur="...">content</text> patterns
    const textRegex =
      /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([^<]*)<\/text>/g;
    let match;

    while ((match = textRegex.exec(xml)) !== null) {
      const start = parseFloat(match[1]);
      const duration = parseFloat(match[2]);
      // Decode HTML entities
      const text = match[3]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n/g, " ")
        .trim();

      if (text && !isNaN(start) && !isNaN(duration)) {
        segments.push({ text, start, duration });
      }
    }

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

  /**
   * Fetch YouTube video comments
   * @param videoId YouTube video ID
   * @param sortBy Sort order: 'top' (most relevant) or 'new' (newest first)
   * @param limit Maximum number of comments to fetch
   * @returns Comments data
   */
  async getComments(
    videoId: string,
    sortBy: "top" | "new" = "top",
    limit: number = 50,
  ): Promise<CommentsResponse> {
    this.logger.log(
      `Fetching comments for video: ${videoId} (sort: ${sortBy}, limit: ${limit})`,
    );

    try {
      await this.ensureClient();
      const info = await this.youtube!.getInfo(videoId);

      if (!info) {
        throw new NotFoundException("Video not found");
      }

      // Get comments thread
      const commentsThread = await info.getComments();

      if (!commentsThread) {
        this.logger.warn(`Comments not available for video: ${videoId}`);
        return {
          videoId,
          comments: [],
          totalCount: 0,
        };
      }

      const comments: Comment[] = [];
      let totalCount = 0;

      // Try to get total count from header
      if (commentsThread.header) {
        const headerAny = commentsThread.header as any;
        if (headerAny?.count?.text) {
          const countText = headerAny.count.text as string;
          const countMatch = countText.match(/[\d,]+/);
          if (countMatch) {
            totalCount = parseInt(countMatch[0].replace(/,/g, ""), 10);
          }
        }
      }

      // Process comments
      if (commentsThread.contents) {
        for (const item of commentsThread.contents) {
          if (comments.length >= limit) break;

          const comment = this.parseComment(item);
          if (comment) {
            comments.push(comment);
          }
        }
      }

      // If we need more comments and there's a continuation
      let continuation = commentsThread;
      while (comments.length < limit && continuation?.has_continuation) {
        try {
          continuation = await continuation.getContinuation();
          if (continuation?.contents) {
            for (const item of continuation.contents) {
              if (comments.length >= limit) break;
              const comment = this.parseComment(item);
              if (comment) {
                comments.push(comment);
              }
            }
          }
        } catch (continueError) {
          this.logger.debug(
            `Failed to get comment continuation: ${String(continueError)}`,
          );
          break;
        }
      }

      this.logger.log(
        `Successfully fetched ${comments.length} comments for video: ${videoId}`,
      );

      return {
        videoId,
        comments,
        totalCount: totalCount || comments.length,
      };
    } catch (error) {
      // Check for parser mismatch errors
      if (this.isYoutubeParserMismatch(error)) {
        this.logger.warn(
          `Parser mismatch when fetching comments for ${videoId}, falling back to empty`,
        );
        return {
          videoId,
          comments: [],
          totalCount: 0,
        };
      }

      this.logger.error(`Failed to fetch comments for ${videoId}:`, error);
      throw new BadRequestException(
        `Failed to fetch comments: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Parse a comment from the YouTube API response
   */
  private parseComment(item: any): Comment | null {
    try {
      // Handle CommentThread structure
      const commentData = item?.comment || item;
      if (!commentData) return null;

      // Get author info
      const authorName =
        commentData.author?.name ||
        commentData.author_name ||
        commentData.author?.text ||
        "Unknown";

      const authorChannelId =
        commentData.author?.id ||
        commentData.author_id ||
        commentData.author?.channel_id ||
        "";

      const authorThumbnail =
        commentData.author?.thumbnails?.[0]?.url ||
        commentData.author_thumbnail?.url ||
        "";

      // Get comment text
      const text =
        commentData.content?.text ||
        commentData.text ||
        commentData.content ||
        "";

      if (!text) return null;

      // Get like count
      let likeCount = 0;
      if (typeof commentData.vote_count === "number") {
        likeCount = commentData.vote_count;
      } else if (commentData.vote_count?.text) {
        const likeText = commentData.vote_count.text as string;
        const likeMatch = likeText.match(/[\d.]+[KMkm]?/);
        if (likeMatch) {
          likeCount = this.parseCount(likeMatch[0]);
        }
      } else if (typeof commentData.likes === "number") {
        likeCount = commentData.likes;
      }

      // Get published time
      const publishedAt =
        commentData.published?.text ||
        commentData.published_time ||
        commentData.time_text ||
        "";

      // Get reply count
      let replyCount = 0;
      if (typeof commentData.reply_count === "number") {
        replyCount = commentData.reply_count;
      } else if (item?.comment_replies_data?.replies?.length) {
        replyCount = item.comment_replies_data.replies.length;
      }

      return {
        id: commentData.id || `comment-${Date.now()}-${Math.random()}`,
        text,
        author: {
          name: authorName,
          channelId: authorChannelId,
          thumbnailUrl: authorThumbnail,
        },
        likeCount,
        publishedAt,
        replyCount,
      };
    } catch (error) {
      this.logger.debug(`Failed to parse comment: ${String(error)}`);
      return null;
    }
  }

  /**
   * Parse count strings like "1.2K" or "5M" to numbers
   */
  private parseCount(countStr: string): number {
    const normalized = countStr.toUpperCase();
    const num = parseFloat(normalized.replace(/[^0-9.]/g, ""));

    if (normalized.includes("K")) {
      return Math.round(num * 1000);
    } else if (normalized.includes("M")) {
      return Math.round(num * 1000000);
    }
    return Math.round(num);
  }
}
