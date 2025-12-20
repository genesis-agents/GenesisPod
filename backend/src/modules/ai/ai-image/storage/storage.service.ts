/**
 * Image Storage Service
 *
 * This service handles image storage, persistence, and history management
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { R2StorageService } from "../../../core/storage/r2-storage.service";
import { GeneratedImageResult } from "../core/image.types";

@Injectable()
export class ImageStorageService {
  private readonly logger = new Logger(ImageStorageService.name);
  private readonly MAX_IMAGES_PER_USER = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2Storage: R2StorageService,
  ) {}

  /**
   * Upload image to R2 storage
   * If R2 is not configured, return the original base64 URL
   */
  async uploadImageToStorage(
    base64ImageUrl: string,
    userId?: string,
  ): Promise<string> {
    // If not base64 format, return directly (might already be a URL)
    if (!base64ImageUrl.startsWith("data:image")) {
      return base64ImageUrl;
    }

    // Try to upload to R2
    if (this.r2Storage.isEnabled()) {
      const prefix = userId ? `user/${userId}` : "anonymous";
      const result = await this.r2Storage.uploadBase64Image(
        base64ImageUrl,
        prefix,
      );

      if (result.success && result.url) {
        this.logger.log(`Image uploaded to R2: ${result.url}`);
        return result.url;
      } else {
        this.logger.warn(
          `Failed to upload to R2, using base64: ${result.error}`,
        );
      }
    }

    // R2 not configured or upload failed, return original base64
    return base64ImageUrl;
  }

  /**
   * Get user generation history
   * Logged in: return user's own images + legacy images
   * Not logged in: return nothing
   */
  async getHistory(userId?: string): Promise<GeneratedImageResult[]> {
    this.logger.log(`[getHistory] userId: ${userId || "not provided"}`);

    if (!userId) {
      // Not logged in: don't return images
      return [];
    }

    // Get all user's bookmarked images (unlimited)
    const bookmarkedImages = await this.prisma.generatedImage.findMany({
      where: {
        userId,
        isBookmarked: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Get user's latest 20 unbookmarked images
    const unbookmarkedImages = await this.prisma.generatedImage.findMany({
      where: {
        userId,
        isBookmarked: false,
      },
      orderBy: { createdAt: "desc" },
      take: this.MAX_IMAGES_PER_USER,
    });

    // Merge and sort by time
    const allImages = [...bookmarkedImages, ...unbookmarkedImages].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    this.logger.log(
      `[getHistory] Found ${bookmarkedImages.length} bookmarked + ${unbookmarkedImages.length} unbookmarked = ${allImages.length} images`,
    );

    return allImages.map((img) => ({
      id: img.id,
      imageUrl: img.imageUrl,
      prompt: img.prompt,
      enhancedPrompt: img.enhancedPrompt || undefined,
      width: img.width,
      height: img.height,
      isBookmarked: img.isBookmarked || false,
      createdAt: img.createdAt.toISOString(),
      textModelUsed: img.textModelUsed || undefined,
      imageModelUsed: img.imageModelUsed || undefined,
      processingSteps: (img.processingSteps as any) || undefined,
      promptInsights: (img.promptInsights as any) || undefined,
    }));
  }

  /**
   * Get single image
   */
  async getImage(id: string): Promise<GeneratedImageResult | null> {
    const image = await this.prisma.generatedImage.findUnique({
      where: { id },
    });

    if (!image) return null;

    return {
      id: image.id,
      imageUrl: image.imageUrl,
      prompt: image.prompt,
      enhancedPrompt: image.enhancedPrompt || undefined,
      width: image.width,
      height: image.height,
      createdAt: image.createdAt.toISOString(),
    };
  }

  /**
   * Delete image
   */
  async deleteImage(
    id: string,
    userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Verify image exists and belongs to user
      const image = await this.prisma.generatedImage.findUnique({
        where: { id },
      });

      if (!image) {
        return { success: false, message: "Image not found" };
      }

      if (userId && image.userId && image.userId !== userId) {
        return {
          success: false,
          message: "Not authorized to delete this image",
        };
      }

      await this.prisma.generatedImage.delete({
        where: { id },
      });

      this.logger.log(`Deleted image: ${id}`);
      return { success: true, message: "Image deleted successfully" };
    } catch (error) {
      this.logger.error(`Failed to delete image ${id}:`, error);
      return { success: false, message: "Failed to delete image" };
    }
  }

  /**
   * Get user's bookmarked images
   */
  async getBookmarkedImages(userId?: string) {
    try {
      const whereCondition = userId
        ? {
            OR: [
              { userId, isBookmarked: true }, // User's bookmarks
              { userId: null, isBookmarked: true }, // Legacy bookmarks
            ],
          }
        : { userId: null, isBookmarked: true }; // Not logged in: only legacy

      const images = await this.prisma.generatedImage.findMany({
        where: whereCondition,
        orderBy: { createdAt: "desc" },
      });

      return images.map((img) => ({
        id: img.id,
        prompt: img.prompt,
        enhancedPrompt: img.enhancedPrompt,
        imageUrl: img.imageUrl,
        width: img.width,
        height: img.height,
        createdAt: img.createdAt,
        isBookmarked: img.isBookmarked,
      }));
    } catch (error) {
      this.logger.error("Failed to get bookmarked images:", error);
      return [];
    }
  }

  /**
   * Add bookmark
   */
  async addBookmark(
    id: string,
    userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const image = await this.prisma.generatedImage.findUnique({
        where: { id },
      });

      if (!image) {
        return { success: false, message: "Image not found" };
      }

      // Verify ownership
      if (userId && image.userId && image.userId !== userId) {
        return {
          success: false,
          message: "Not authorized to bookmark this image",
        };
      }

      await this.prisma.generatedImage.update({
        where: { id },
        data: { isBookmarked: true },
      });

      this.logger.log(`Bookmarked image: ${id} by user: ${userId}`);
      return { success: true, message: "Image bookmarked" };
    } catch (error) {
      this.logger.error(`Failed to bookmark image ${id}:`, error);
      return { success: false, message: "Failed to bookmark image" };
    }
  }

  /**
   * Remove bookmark
   */
  async removeBookmark(
    id: string,
    userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const image = await this.prisma.generatedImage.findUnique({
        where: { id },
      });

      if (!image) {
        return { success: false, message: "Image not found" };
      }

      // Verify ownership
      if (userId && image.userId && image.userId !== userId) {
        return {
          success: false,
          message: "Not authorized to modify this image",
        };
      }

      await this.prisma.generatedImage.update({
        where: { id },
        data: { isBookmarked: false },
      });

      this.logger.log(`Removed bookmark from image: ${id} by user: ${userId}`);
      return { success: true, message: "Bookmark removed" };
    } catch (error) {
      this.logger.error(`Failed to remove bookmark from image ${id}:`, error);
      return { success: false, message: "Failed to remove bookmark" };
    }
  }

  /**
   * Cleanup old images for a user
   * Keep latest MAX_IMAGES_PER_USER images, delete the rest
   * Note: Bookmarked images are not deleted
   */
  async cleanupOldImages(userId: string | null): Promise<number> {
    if (!userId) return 0; // No limit for anonymous users

    try {
      // Get all user's unbookmarked images, sorted by creation time desc
      const allImages = await this.prisma.generatedImage.findMany({
        where: {
          userId,
          isBookmarked: false, // Only count unbookmarked images
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

      // If unbookmarked images exceed limit, delete oldest
      if (allImages.length > this.MAX_IMAGES_PER_USER) {
        const idsToDelete = allImages
          .slice(this.MAX_IMAGES_PER_USER)
          .map((img) => img.id);

        await this.prisma.generatedImage.deleteMany({
          where: {
            id: { in: idsToDelete },
          },
        });

        this.logger.log(
          `Cleaned up ${idsToDelete.length} old images for user ${userId}`,
        );
        return idsToDelete.length;
      }
      return 0;
    } catch (error) {
      // Cleanup failure should not affect main flow
      this.logger.warn(
        `Failed to cleanup old images for user ${userId}:`,
        error,
      );
      return 0;
    }
  }

  /**
   * Cleanup old images for all users (admin function)
   * Also cleanup images without userId (keep latest 20)
   */
  async cleanupAllUsersImages(): Promise<{
    totalDeleted: number;
    usersCleaned: number;
    orphanDeleted: number;
  }> {
    // Get all users with images
    const usersWithImages = await this.prisma.generatedImage.groupBy({
      by: ["userId"],
      where: {
        userId: { not: null },
      },
    });

    let totalDeleted = 0;
    let usersCleaned = 0;

    for (const { userId } of usersWithImages) {
      if (userId) {
        const deleted = await this.cleanupOldImages(userId);
        totalDeleted += deleted;
        if (deleted > 0) usersCleaned++;
      }
    }

    // Cleanup orphan images without userId (keep latest 20)
    const orphanImages = await this.prisma.generatedImage.findMany({
      where: {
        userId: null,
        isBookmarked: false,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    let orphanDeleted = 0;
    if (orphanImages.length > this.MAX_IMAGES_PER_USER) {
      const idsToDelete = orphanImages
        .slice(this.MAX_IMAGES_PER_USER)
        .map((img) => img.id);

      await this.prisma.generatedImage.deleteMany({
        where: {
          id: { in: idsToDelete },
        },
      });

      orphanDeleted = idsToDelete.length;
      totalDeleted += orphanDeleted;
    }

    this.logger.log(
      `Admin cleanup: deleted ${totalDeleted} images (${usersCleaned} users, ${orphanDeleted} orphan)`,
    );

    return { totalDeleted, usersCleaned, orphanDeleted };
  }

  /**
   * Get image statistics
   */
  async getImageStats() {
    const totalImages = await this.prisma.generatedImage.count();
    const bookmarkedImages = await this.prisma.generatedImage.count({
      where: { isBookmarked: true },
    });

    // Get unique user count
    const usersWithImages = await this.prisma.generatedImage.groupBy({
      by: ["userId"],
      where: {
        userId: { not: null },
      },
    });

    return {
      total: totalImages,
      bookmarked: bookmarkedImages,
      users: usersWithImages.length,
    };
  }

  /**
   * Delete all images (admin function)
   */
  async deleteAllImages(): Promise<number> {
    const result = await this.prisma.generatedImage.deleteMany({});
    this.logger.warn(`Deleted all ${result.count} images`);
    return result.count;
  }

  /**
   * Auto-tag images for a user
   */
  async autoTagImages(userId: string) {
    return this.prisma.generatedImage.findMany({
      where: { userId },
      select: { id: true, prompt: true },
      take: 100,
    });
  }

  /**
   * Analyze styles for a user
   */
  async analyzeStyles(userId: string) {
    return this.prisma.generatedImage.findMany({
      where: { userId },
      select: { id: true, enhancedPrompt: true },
      take: 100,
    });
  }

  /**
   * Cluster visual themes for a user
   */
  async clusterVisualThemes(userId: string) {
    return this.prisma.generatedImage.findMany({
      where: { userId },
      select: { id: true, imageUrl: true },
      take: 100,
    });
  }
}
