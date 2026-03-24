import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { ConsciousnessStatus, AIModelType } from "@prisma/client";
import { ConsciousnessRepository } from "./consciousness.repository";
import {
  AiChatService,
  type TaskProfile,
} from "../../ai-engine/facade";
import {
  CreditsService,
  InsufficientCreditsException,
  BillingContext,
} from "../../ai-infra/facade";
import {
  CreateProfileDto,
  UpdateProfileDto,
  AddDataSourceDto,
  SendConsciousnessMessageDto,
  CreateConversationDto,
  ShareProfileDto,
} from "./dto";
import {
  CONSCIOUSNESS_ANALYSIS_PROMPT,
  buildAvatarSystemPrompt,
} from "./prompts/consciousness-avatar.prompt";

interface AnalysisResult {
  personalityModel: Record<string, number>;
  writingStyle: Record<string, string>;
  knowledgeDomains: Array<{ domain: string; confidence: number }>;
  memories: Array<{
    category: string;
    topic: string;
    content: string;
    importance: number;
    confidence: number;
  }>;
}

@Injectable()
export class ConsciousnessService {
  private readonly logger = new Logger(ConsciousnessService.name);

  constructor(
    private readonly repo: ConsciousnessRepository,
    private readonly aiChatService: AiChatService,
    private readonly creditsService: CreditsService,
  ) {}

  // ─── Profile Management ───

  async createProfile(userId: string, dto: CreateProfileDto) {
    this.logger.log(`Creating consciousness profile for user ${userId}`);
    return this.repo.createProfile(userId, dto);
  }

  async getProfiles(userId: string) {
    return this.repo.getProfiles(userId);
  }

  async getProfile(id: string, userId: string) {
    const profile = await this.repo.getProfile(id, userId);
    if (!profile) {
      throw new NotFoundException("Consciousness profile not found");
    }
    return profile;
  }

  async updateProfile(id: string, userId: string, dto: UpdateProfileDto) {
    await this.getProfile(id, userId);
    return this.repo.updateProfile(id, userId, dto);
  }

  async deleteProfile(id: string, userId: string) {
    await this.getProfile(id, userId);
    return this.repo.deleteProfile(id, userId);
  }

  // ─── Data Source Management ───

  async addDataSource(profileId: string, userId: string, dto: AddDataSourceDto) {
    const profile = await this.getProfile(profileId, userId);

    if (profile.status === ConsciousnessStatus.ARCHIVED) {
      throw new BadRequestException("Cannot add data to an archived profile");
    }

    const source = await this.repo.addDataSource(profileId, dto);

    // Update status to COLLECTING if still DRAFT
    if (profile.status === ConsciousnessStatus.DRAFT) {
      await this.repo.updateProfile(profileId, userId, {
        status: ConsciousnessStatus.COLLECTING,
      });
    }

    return source;
  }

  async deleteDataSource(
    profileId: string,
    sourceId: string,
    userId: string,
  ) {
    await this.getProfile(profileId, userId);
    return this.repo.deleteDataSource(sourceId, profileId);
  }

  // ─── Consciousness Analysis (Core Feature) ───

  async analyzeProfile(profileId: string, userId: string) {
    const profile = await this.getProfile(profileId, userId);

    // Check credits
    const billingCtx = new BillingContext(userId, "consciousness", "analyze");
    const hasCredits = await this.creditsService.checkCredits(billingCtx, 50);
    if (!hasCredits) {
      throw new InsufficientCreditsException(50);
    }

    // Get unprocessed sources BEFORE changing status
    const sources = await this.repo.getUnprocessedSources(profileId);

    if (sources.length === 0) {
      throw new BadRequestException(
        "No unprocessed data sources to analyze",
      );
    }

    // Update status only after confirming there are sources
    await this.repo.updateProfile(profileId, userId, {
      status: ConsciousnessStatus.ANALYZING,
    });

    try {

      // Analyze each source
      const allMemories: Array<{
        category: string;
        topic: string;
        content: string;
        importance: number;
        confidence: number;
        sourceId: string;
      }> = [];

      let mergedPersonality: Record<string, number[]> = {};
      let mergedWritingStyle: Record<string, string[]> = {};
      const mergedDomains: Array<{ domain: string; confidence: number }> = [];

      for (const source of sources) {
        const contentToAnalyze = source.content || `[File: ${source.name}]`;

        const taskProfile: TaskProfile = {
          creativity: "low" as const,
          outputLength: "long" as const,
        };

        const response = await this.aiChatService.chat({
          messages: [
            { role: "system", content: CONSCIOUSNESS_ANALYSIS_PROMPT },
            {
              role: "user",
              content: `Content from "${source.name}" (type: ${source.type}):\n\n${contentToAnalyze}`,
            },
          ],
          modelType: AIModelType.REASONING,
          taskProfile,
          responseFormat: "json",
        });

        const analysisText = String(
          typeof response === "string" ? response : (response && typeof response === "object" && "content" in response) ? (response as Record<string, unknown>).content : response ?? "",
        );

        let analysis: AnalysisResult;
        try {
          analysis = JSON.parse(analysisText);
        } catch {
          this.logger.warn(
            `Failed to parse analysis for source ${source.id}, skipping`,
          );
          await this.repo.markSourceProcessed(source.id, {
            error: "parse_failed",
          });
          continue;
        }

        // Accumulate personality traits
        if (analysis.personalityModel) {
          for (const [trait, value] of Object.entries(
            analysis.personalityModel,
          )) {
            if (!mergedPersonality[trait]) mergedPersonality[trait] = [];
            mergedPersonality[trait].push(value);
          }
        }

        // Accumulate writing style
        if (analysis.writingStyle) {
          for (const [key, value] of Object.entries(analysis.writingStyle)) {
            if (!mergedWritingStyle[key]) mergedWritingStyle[key] = [];
            mergedWritingStyle[key].push(value);
          }
        }

        // Accumulate domains
        if (analysis.knowledgeDomains) {
          mergedDomains.push(...analysis.knowledgeDomains);
        }

        // Collect memories
        if (analysis.memories) {
          allMemories.push(
            ...analysis.memories.map((m) => ({
              ...m,
              sourceId: source.id,
            })),
          );
        }

        await this.repo.markSourceProcessed(source.id, analysis);
      }

      // Average personality traits
      const finalPersonality: Record<string, number> = {};
      for (const [trait, values] of Object.entries(mergedPersonality)) {
        finalPersonality[trait] =
          values.reduce((a, b) => a + b, 0) / values.length;
      }

      // Deduplicate domains
      const domainMap = new Map<string, number>();
      for (const d of mergedDomains) {
        const existing = domainMap.get(d.domain) ?? 0;
        domainMap.set(d.domain, Math.max(existing, d.confidence));
      }
      const finalDomains = Array.from(domainMap.entries()).map(
        ([domain, confidence]) => ({ domain, confidence }),
      );

      // Most common writing style values
      const finalWritingStyle: Record<string, string> = {};
      for (const [key, values] of Object.entries(mergedWritingStyle)) {
        const counts = new Map<string, number>();
        for (const v of values) {
          counts.set(v, (counts.get(v) ?? 0) + 1);
        }
        let maxCount = 0;
        let maxVal = values[0];
        for (const [v, c] of counts) {
          if (c > maxCount) {
            maxCount = c;
            maxVal = v;
          }
        }
        finalWritingStyle[key] = maxVal;
      }

      // Save memories
      if (allMemories.length > 0) {
        await this.repo.createMemories(profileId, allMemories);
      }

      // Update profile with analysis results
      // Note: totalMemories is already incremented by repo.createMemories()
      await this.repo.updateProfile(profileId, userId, {
        status: ConsciousnessStatus.READY,
        personalityModel: finalPersonality,
        writingStyle: finalWritingStyle,
        knowledgeDomains: finalDomains,
        analyzedAt: new Date(),
      });

      // Deduct credits
      await this.creditsService.deductCredits(billingCtx, sources.length * 10);

      this.logger.log(
        `Analysis complete for profile ${profileId}: ${allMemories.length} memories extracted`,
      );

      return {
        memoriesExtracted: allMemories.length,
        sourcesProcessed: sources.length,
        personalityModel: finalPersonality,
        knowledgeDomains: finalDomains,
      };
    } catch (error) {
      // Revert status on failure (for all error types)
      await this.repo.updateProfile(profileId, userId, {
        status: ConsciousnessStatus.COLLECTING,
      });
      throw error;
    }
  }

  // ─── Memories ───

  async getMemories(
    profileId: string,
    userId: string,
    category?: string,
  ) {
    await this.getProfile(profileId, userId);
    return this.repo.searchMemories(profileId, { category, limit: 100 });
  }

  // ─── Avatar Conversation ───

  async createConversation(
    profileId: string,
    userId: string,
    dto: CreateConversationDto,
  ) {
    // Check profile exists and is accessible
    await this.ensureProfileAccess(profileId, userId);
    return this.repo.createConversation(profileId, userId, dto.title);
  }

  async getConversations(profileId: string, userId: string) {
    await this.ensureProfileAccess(profileId, userId);
    return this.repo.getConversations(profileId, userId);
  }

  async getConversation(conversationId: string, userId: string) {
    const conversation = await this.repo.getConversation(conversationId);
    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    // Check access: owner of profile or shared user
    await this.ensureProfileAccess(
      conversation.profileId,
      userId,
    );

    return conversation;
  }

  async sendMessage(
    conversationId: string,
    userId: string,
    dto: SendConsciousnessMessageDto,
  ) {
    const conversation = await this.getConversation(conversationId, userId);

    // Guard: only READY profiles can chat
    if (conversation.profile.status !== ConsciousnessStatus.READY) {
      throw new BadRequestException(
        "Profile must be analyzed before chatting with the avatar",
      );
    }

    // Create billing context once and reuse
    const billingCtx = new BillingContext(userId, "consciousness", "chat");

    if (conversation.profile.userId === userId) {
      const hasCredits = await this.creditsService.checkCredits(
        billingCtx,
        5,
      );
      if (!hasCredits) {
        throw new InsufficientCreditsException(5);
      }
    }

    // Save user message
    await this.repo.addMessage(conversationId, {
      role: "user",
      content: dto.content,
    });

    // Retrieve relevant memories
    const memories = await this.repo.searchMemories(
      conversation.profileId,
      { limit: 15 },
    );

    // Build avatar system prompt
    const systemPrompt = buildAvatarSystemPrompt(
      conversation.profile,
      memories,
    );

    // Build conversation history
    const historyMessages = conversation.messages.slice(-20).map((m) => ({
      role: m.role === "avatar" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

    // Add current message
    historyMessages.push({ role: "user" as const, content: dto.content });

    const taskProfile: TaskProfile = {
      creativity: "medium" as const,
      outputLength: "medium" as const,
    };

    // Call LLM
    const response = await this.aiChatService.chat({
      messages: [
        { role: "system", content: systemPrompt },
        ...historyMessages,
      ],
      modelType: AIModelType.CHAT,
      taskProfile,
    });

    const avatarContent = String(
      typeof response === "string" ? response : (response && typeof response === "object" && "content" in response) ? (response as Record<string, unknown>).content : response ?? "",
    );

    // Save avatar response
    const avatarMessage = await this.repo.addMessage(conversationId, {
      role: "avatar",
      content: avatarContent,
      memoriesUsed: memories.map((m) => ({
        id: m.id,
        topic: m.topic,
      })),
    });

    // Deduct credits
    if (conversation.profile.userId === userId) {
      await this.creditsService.deductCredits(billingCtx, 2);
    }

    return avatarMessage;
  }

  // ─── Sharing ───

  async shareProfile(profileId: string, userId: string, dto: ShareProfileDto) {
    await this.getProfile(profileId, userId);

    if (dto.sharedWithUserId === userId) {
      throw new BadRequestException("Cannot share with yourself");
    }

    return this.repo.shareProfile(profileId, dto.sharedWithUserId, {
      canChat: dto.canChat,
      canViewMemories: dto.canViewMemories,
    });
  }

  async getSharedProfiles(userId: string) {
    return this.repo.getSharedProfiles(userId);
  }

  async removeShare(
    profileId: string,
    sharedWithUserId: string,
    userId: string,
  ) {
    await this.getProfile(profileId, userId);
    return this.repo.removeShare(profileId, sharedWithUserId);
  }

  // ─── Helpers ───

  private async ensureProfileAccess(
    profileId: string,
    userId: string,
  ): Promise<void> {
    const profile = await this.repo.getProfile(profileId);
    if (!profile) {
      throw new NotFoundException("Consciousness profile not found");
    }

    // Owner always has access
    if (profile.userId === userId) return;

    // Check share permission
    const share = await this.repo.getSharePermission(profileId, userId);
    if (!share || !share.canChat) {
      throw new ForbiddenException(
        "You do not have access to this consciousness profile",
      );
    }
  }
}
