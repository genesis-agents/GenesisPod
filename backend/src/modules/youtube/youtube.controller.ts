import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  BadRequestException,
  Logger,
  Res,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { YoutubeService } from "./youtube.service";
import {
  PdfGeneratorService,
  SubtitleExportOptions,
} from "./pdf-generator.service";

interface SubtitlesRequestDto {
  videoId: string;
  englishLang?: string;
  chineseLang?: string;
}

interface ExportPdfRequestDto {
  videoId: string;
  title?: string;
  englishSubtitles: Array<{ text: string; start: number; duration: number }>;
  chineseSubtitles: Array<{ text: string; start: number; duration: number }>;
  options: SubtitleExportOptions;
}

@Controller("youtube")
export class YoutubeController {
  private readonly logger = new Logger(YoutubeController.name);

  constructor(
    private readonly youtubeService: YoutubeService,
    private readonly pdfGeneratorService: PdfGeneratorService,
  ) {}

  @Get("transcript/:videoId")
  async getTranscript(@Param("videoId") videoId: string) {
    this.logger.log(`Received request for video transcript: ${videoId}`);

    if (!videoId || videoId.trim().length === 0) {
      throw new BadRequestException("Video ID is required");
    }

    const cleanVideoId = videoId.trim();
    return await this.youtubeService.getTranscript(cleanVideoId);
  }

  /**
   * Get bilingual subtitles (English + Chinese aligned)
   */
  @Post("subtitles")
  async getSubtitles(@Body() body: SubtitlesRequestDto) {
    const { videoId } = body;

    this.logger.log(`Fetching bilingual subtitles for video: ${videoId}`);

    if (!videoId || videoId.trim().length === 0) {
      throw new BadRequestException("Video ID is required");
    }

    const cleanVideoId = videoId.trim();

    try {
      // Fetch English subtitles
      const englishTranscript = await this.youtubeService.getTranscript(
        cleanVideoId,
        "en",
      );

      // Fetch Chinese subtitles
      let chineseTranscript;
      try {
        chineseTranscript = await this.youtubeService.getTranscript(
          cleanVideoId,
          "zh",
        );
      } catch (error) {
        this.logger.warn(
          `Chinese subtitles not available for ${cleanVideoId}, using empty array`,
        );
        chineseTranscript = {
          videoId: cleanVideoId,
          title: englishTranscript.title,
          transcript: [],
        };
      }

      // Align transcripts
      const aligned = this.pdfGeneratorService.alignTranscripts(
        englishTranscript.transcript,
        chineseTranscript.transcript,
      );

      return {
        videoId: cleanVideoId,
        title: englishTranscript.title,
        url: `https://www.youtube.com/watch?v=${cleanVideoId}`,
        english: aligned.english,
        chinese: aligned.chinese,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fetch bilingual subtitles for ${cleanVideoId}:`,
        error,
      );
      throw new BadRequestException(
        `Failed to fetch subtitles: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Export subtitles as PDF
   */
  @Post("export-pdf")
  async exportPdf(@Body() body: ExportPdfRequestDto, @Res() res: Response) {
    const { videoId, title, englishSubtitles, chineseSubtitles, options } =
      body;

    this.logger.log(`Exporting PDF for video: ${videoId}`);

    if (!videoId || videoId.trim().length === 0) {
      throw new BadRequestException("Video ID is required");
    }

    if (!englishSubtitles && !chineseSubtitles) {
      throw new BadRequestException(
        "At least one subtitle language is required",
      );
    }

    try {
      const metadata = {
        videoId,
        title: title || `YouTube Video ${videoId}`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        exportDate: new Date(),
      };

      const transcript = {
        english: englishSubtitles || [],
        chinese: chineseSubtitles || [],
      };

      const pdfStream = await this.pdfGeneratorService.generatePdf(
        transcript,
        metadata,
        options,
      );

      // Set response headers
      const filename = `youtube-subtitles-${videoId}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.status(HttpStatus.OK);

      // Pipe the PDF stream to response
      pdfStream.pipe(res);

      pdfStream.on("end", () => {
        this.logger.log(`PDF export completed for video: ${videoId}`);
      });

      pdfStream.on("error", (error) => {
        this.logger.error(`PDF generation error for video ${videoId}:`, error);
        if (!res.headersSent) {
          res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            message: "Failed to generate PDF",
            error: error.message,
          });
        }
      });
    } catch (error) {
      this.logger.error(`Failed to export PDF for ${videoId}:`, error);
      throw new BadRequestException(
        `Failed to export PDF: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
