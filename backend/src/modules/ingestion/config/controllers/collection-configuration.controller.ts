import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Logger,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { CollectionConfigurationService } from "../services/collection-configuration.service";
import { ResourceType } from "@prisma/client";

/**
 * Collection Configuration Controller
 * 提供采集配置管理API端点
 */
@Controller("data-management/collection-configurations")
export class CollectionConfigurationController {
  private readonly logger = new Logger(CollectionConfigurationController.name);

  constructor(
    private readonly collectionConfigService: CollectionConfigurationService,
  ) {}

  /**
   * 创建采集配置
   * POST /api/v1/data-management/collection-configurations
   */
  @Post()
  async createConfig(
    @Body()
    body: {
      resourceType: ResourceType;
      name: string;
      description?: string;
      keywords?: string[];
      excludeKeywords?: string[];
      urlPatterns?: string[];
      cronExpression?: string;
      maxConcurrent?: number;
      timeout?: number;
      isActive?: boolean;
    },
  ) {
    try {
      if (!body.resourceType || !body.name) {
        throw new HttpException(
          "Missing required fields: resourceType, name",
          HttpStatus.BAD_REQUEST,
        );
      }

      const config = await this.collectionConfigService.createConfig(body);

      return {
        success: true,
        data: config,
        message: "Collection configuration created successfully",
      };
    } catch (error) {
      this.logger.error(`Error creating config: ${error}`);
      throw error;
    }
  }

  /**
   * 获取特定资源类型的所有配置
   * GET /api/v1/data-management/collection-configurations?resourceType=PAPER
   */
  @Get()
  async getConfigs(@Query("resourceType") resourceType?: ResourceType) {
    try {
      let configs;

      if (resourceType) {
        configs =
          await this.collectionConfigService.getConfigsByResourceType(
            resourceType,
          );
      } else {
        configs = await this.collectionConfigService.getActiveConfigs();
      }

      return {
        success: true,
        data: configs,
      };
    } catch (error) {
      this.logger.error(`Error fetching configs: ${error}`);
      throw error;
    }
  }

  /**
   * 获取特定配置
   * GET /api/v1/data-management/collection-configurations/:configId
   */
  @Get(":configId")
  async getConfig(@Param("configId") configId: string) {
    try {
      const config = await this.collectionConfigService.getConfig(configId);

      if (!config) {
        throw new HttpException(
          "Collection configuration not found",
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        data: config,
      };
    } catch (error) {
      this.logger.error(`Error fetching config: ${error}`);
      throw error;
    }
  }

  /**
   * 更新采集配置
   * PUT /api/v1/data-management/collection-configurations/:configId
   */
  @Put(":configId")
  async updateConfig(
    @Param("configId") configId: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      keywords?: string[];
      excludeKeywords?: string[];
      urlPatterns?: string[];
      cronExpression?: string;
      maxConcurrent?: number;
      timeout?: number;
      isActive?: boolean;
    },
  ) {
    try {
      const config = await this.collectionConfigService.updateConfig(
        configId,
        body,
      );

      return {
        success: true,
        data: config,
        message: "Collection configuration updated successfully",
      };
    } catch (error) {
      this.logger.error(`Error updating config: ${error}`);
      throw error;
    }
  }

  /**
   * 删除采集配置
   * DELETE /api/v1/data-management/collection-configurations/:configId
   */
  @Delete(":configId")
  async deleteConfig(@Param("configId") configId: string) {
    try {
      await this.collectionConfigService.deleteConfig(configId);

      return {
        success: true,
        message: "Collection configuration deleted successfully",
      };
    } catch (error) {
      this.logger.error(`Error deleting config: ${error}`);
      throw error;
    }
  }

  /**
   * 启用配置
   * POST /api/v1/data-management/collection-configurations/:configId/enable
   */
  @Post(":configId/enable")
  async enableConfig(@Param("configId") configId: string) {
    try {
      const config = await this.collectionConfigService.enableConfig(configId);

      return {
        success: true,
        data: config,
        message: "Collection configuration enabled successfully",
      };
    } catch (error) {
      this.logger.error(`Error enabling config: ${error}`);
      throw error;
    }
  }

  /**
   * 禁用配置
   * POST /api/v1/data-management/collection-configurations/:configId/disable
   */
  @Post(":configId/disable")
  async disableConfig(@Param("configId") configId: string) {
    try {
      const config = await this.collectionConfigService.disableConfig(configId);

      return {
        success: true,
        data: config,
        message: "Collection configuration disabled successfully",
      };
    } catch (error) {
      this.logger.error(`Error disabling config: ${error}`);
      throw error;
    }
  }

  /**
   * 验证URL和内容是否匹配配置
   * POST /api/v1/data-management/collection-configurations/:configId/validate
   */
  @Post(":configId/validate")
  async validateContent(
    @Param("configId") configId: string,
    @Body()
    body: {
      url: string;
      content: string;
    },
  ) {
    try {
      const config = await this.collectionConfigService.getConfig(configId);

      if (!config) {
        throw new HttpException(
          "Collection configuration not found",
          HttpStatus.NOT_FOUND,
        );
      }

      const urlPatterns = (config.urlPatterns as string[]) || [];
      const keywords = (config.keywords as string[]) || [];
      const excludeKeywords = (config.excludeKeywords as string[]) || [];

      const urlMatches = this.collectionConfigService.matchesUrlPatterns(
        body.url,
        urlPatterns,
      );
      const contentMatches = this.collectionConfigService.matchesKeywords(
        body.content,
        keywords,
        excludeKeywords,
      );

      return {
        success: true,
        data: {
          urlMatches,
          contentMatches,
          overallMatch: urlMatches && contentMatches,
        },
      };
    } catch (error) {
      this.logger.error(`Error validating content: ${error}`);
      throw error;
    }
  }
}
