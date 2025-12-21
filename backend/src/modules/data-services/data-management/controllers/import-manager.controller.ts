import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Logger,
} from "@nestjs/common";
import { ImportManagerService } from "../services/import-manager.service";
import { ImportTaskProcessorService } from "../services/import-task-processor.service";
import { SourceWhitelistService } from "../services/source-whitelist.service";
import { AiUrlClassifierService } from "../services/ai-url-classifier.service";
import { ResourceType } from "@prisma/client";

/**
 * Import Manager Controller
 * 提供导入管理、URL解析和数据质量指标的API端点
 */
@Controller("data-management")
export class ImportManagerController {
  private readonly logger = new Logger(ImportManagerController.name);

  constructor(
    private readonly importManagerService: ImportManagerService,
    private readonly importTaskProcessorService: ImportTaskProcessorService,
    private readonly whitelistService: SourceWhitelistService,
    private readonly aiClassifierService: AiUrlClassifierService,
  ) {}

  /**
   * 解析URL元数据
   * POST /api/v1/data-management/parse-url
   */
  @Post("parse-url")
  async parseUrl(
    @Body()
    body: {
      url: string;
      resourceType?: ResourceType;
    },
  ) {
    try {
      if (!body.url) {
        return {
          success: false,
          error: "Missing required field: url",
        };
      }

      // 如果提供了资源类型，验证URL是否在白名单中
      if (body.resourceType) {
        const whitelist = await this.whitelistService.getWhitelist(
          body.resourceType,
        );

        if (whitelist && whitelist.isActive) {
          const allowedDomains = Array.isArray(whitelist.allowedDomains)
            ? whitelist.allowedDomains.filter(
                (d): d is string => typeof d === "string",
              )
            : [];
          const isAllowed = this.validateDomain(body.url, allowedDomains);
          if (!isAllowed) {
            return {
              success: false,
              error: "URL domain not in whitelist for this resource type",
              code: "DOMAIN_NOT_WHITELISTED",
            };
          }
        }
      }

      const parseResult = await this.importManagerService.parseUrl(body.url);

      return {
        success: true,
        data: parseResult,
      };
    } catch (error) {
      this.logger.error(`Error parsing URL: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to parse URL",
      };
    }
  }

  /**
   * 提交导入请求
   * POST /api/v1/data-management/import
   */
  @Post("import")
  async submitImport(
    @Body()
    body: {
      resourceType: ResourceType;
      sourceUrl: string;
      title?: string;
      ruleId?: string;
    },
  ) {
    try {
      if (!body.resourceType || !body.sourceUrl) {
        return {
          success: false,
          error: "Missing required fields: resourceType, sourceUrl",
        };
      }

      // 验证URL在白名单中
      const whitelist = await this.whitelistService.getWhitelist(
        body.resourceType,
      );

      if (whitelist && whitelist.isActive) {
        const allowedDomains = Array.isArray(whitelist.allowedDomains)
          ? whitelist.allowedDomains.filter(
              (d): d is string => typeof d === "string",
            )
          : [];
        const isAllowed = this.validateDomain(body.sourceUrl, allowedDomains);

        if (!isAllowed) {
          return {
            success: false,
            error: "URL domain not in whitelist for this resource type",
            code: "DOMAIN_NOT_WHITELISTED",
          };
        }
      }

      // 创建导入任务
      const task = await this.importManagerService.createImportTask({
        resourceType: body.resourceType,
        sourceUrl: body.sourceUrl,
        title: body.title,
        ruleId: body.ruleId,
      });

      return {
        success: true,
        data: task,
        message: "Import task created successfully",
      };
    } catch (error) {
      this.logger.error(`Error submitting import: ${error}`);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to submit import",
      };
    }
  }

  /**
   * 获取导入任务列表
   * GET /api/v1/data-management/tasks
   */
  @Get("tasks")
  async getTasks(
    @Query("resourceType") resourceType?: ResourceType,
    @Query("status") status?: string,
    @Query("limit") limit: string = "50",
    @Query("offset") offset: string = "0",
  ) {
    try {
      const limitNum = Math.min(Math.max(1, parseInt(limit) || 50), 200);
      const offsetNum = Math.max(0, parseInt(offset) || 0);

      const result = await this.importManagerService.getImportTasks(
        resourceType,
        status as any,
        limitNum,
        offsetNum,
      );

      return {
        success: true,
        data: result.data,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.offset + result.limit < result.total,
        },
      };
    } catch (error) {
      this.logger.error(`Error fetching tasks: ${error}`);
      return {
        success: false,
        error: "Failed to fetch import tasks",
        data: [],
      };
    }
  }

  /**
   * 获取特定导入任务
   * GET /api/v1/data-management/tasks/:taskId
   */
  @Get("tasks/:taskId")
  async getTask(@Param("taskId") taskId: string) {
    try {
      const task = await this.importManagerService.getImportTask(taskId);

      if (!task) {
        return {
          success: false,
          error: "Import task not found",
        };
      }

      return {
        success: true,
        data: task,
      };
    } catch (error) {
      this.logger.error(`Error fetching task: ${error}`);
      return {
        success: false,
        error: "Failed to fetch import task",
      };
    }
  }

  /**
   * 获取数据质量指标
   * GET /api/v1/data-management/quality-metrics
   */
  @Get("quality-metrics")
  async getQualityMetrics(@Query("resourceType") resourceType?: ResourceType) {
    try {
      const result =
        await this.importManagerService.getDataQualityMetrics(resourceType);

      return {
        success: true,
        data: result.data,
        stats: result.stats,
      };
    } catch (error) {
      this.logger.error(`Error fetching quality metrics: ${error}`);
      return {
        success: false,
        error: "Failed to fetch quality metrics",
        data: [],
        stats: {
          totalItems: 0,
          duplicates: 0,
          avgQuality: 0,
          needsReview: 0,
        },
      };
    }
  }

  /**
   * 解析URL并提取完整的元数据（包含重复检测）
   * POST /api/v1/data-management/parse-url-full
   */
  @Post("parse-url-full")
  async parseUrlFull(
    @Body()
    body: {
      url: string;
      resourceType: ResourceType;
    },
  ) {
    try {
      if (!body.url || !body.resourceType) {
        return {
          success: false,
          error: "Missing required fields: url, resourceType",
        };
      }

      // 验证URL是否在白名单中
      const whitelist = await this.whitelistService.getWhitelist(
        body.resourceType,
      );

      if (!whitelist || !whitelist.isActive) {
        return {
          success: false,
          error: "Whitelist not found or inactive for this resource type",
        };
      }

      const allowedDomains = Array.isArray(whitelist.allowedDomains)
        ? whitelist.allowedDomains.filter(
            (d): d is string => typeof d === "string",
          )
        : [];

      const isAllowed = this.validateDomain(body.url, allowedDomains);
      if (!isAllowed) {
        return {
          success: false,
          error: "URL domain not in whitelist for this resource type",
          code: "DOMAIN_NOT_WHITELISTED",
        };
      }

      // 使用ImportManagerService的新方法
      const result = await this.importManagerService.parseUrlFull(
        body.url,
        body.resourceType,
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Error parsing URL full: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to parse URL",
      };
    }
  }

  /**
   * 导入带有编辑后的元数据
   * POST /api/v1/data-management/import-with-metadata
   */
  @Post("import-with-metadata")
  async importWithMetadata(
    @Body()
    body: {
      url: string;
      resourceType: ResourceType;
      metadata: any;
      skipDuplicateWarning?: boolean;
    },
  ) {
    try {
      if (!body.url || !body.resourceType || !body.metadata) {
        return {
          success: false,
          error: "Missing required fields: url, resourceType, metadata",
        };
      }

      // 验证URL是否在白名单中
      const whitelist = await this.whitelistService.getWhitelist(
        body.resourceType,
      );

      if (!whitelist || !whitelist.isActive) {
        return {
          success: false,
          error: "Whitelist not found or inactive for this resource type",
        };
      }

      const allowedDomains = Array.isArray(whitelist.allowedDomains)
        ? whitelist.allowedDomains.filter(
            (d): d is string => typeof d === "string",
          )
        : [];

      const isAllowed = this.validateDomain(body.url, allowedDomains);
      if (!isAllowed) {
        return {
          success: false,
          error: "URL domain not in whitelist for this resource type",
          code: "DOMAIN_NOT_WHITELISTED",
        };
      }

      // 使用ImportManagerService的新方法
      const importTask = await this.importManagerService.importWithMetadata(
        body.url,
        body.resourceType,
        body.metadata,
        body.skipDuplicateWarning,
      );

      return {
        success: true,
        data: {
          taskId: importTask.id,
          status: importTask.status,
          sourceUrl: importTask.sourceUrl,
        },
      };
    } catch (error) {
      this.logger.error(`Error importing with metadata: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to import",
      };
    }
  }

  /**
   * 处理所有待处理的导入任务
   * POST /api/v1/data-management/process-pending
   *
   * 将PENDING状态的ImportTask转换为实际的Resource记录
   */
  @Post("process-pending")
  async processPendingImports(@Query("limit") limit?: string) {
    try {
      const limitNum = limit ? parseInt(limit, 10) : 50;

      const result =
        await this.importTaskProcessorService.processPendingTasks(limitNum);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Error processing pending imports: ${error}`);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to process pending imports",
      };
    }
  }

  /**
   * 获取导入任务统计
   * GET /api/v1/data-management/task-stats
   *
   * 返回各种状态的ImportTask数量统计
   */
  @Get("task-stats")
  async getTaskStats() {
    try {
      const stats = await this.importTaskProcessorService.getTaskStats();

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error(`Error getting task stats: ${error}`);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get task stats",
      };
    }
  }

  /**
   * 验证域名是否在白名单中
   */
  private validateDomain(url: string, allowedDomains: string[]): boolean {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      return allowedDomains.some((allowed) => {
        // 1. 精确匹配：domain.com 匹配 domain.com
        if (domain === allowed) {
          return true;
        }

        // 2. 通配符匹配：*.domain.com 匹配 sub.domain.com
        if (allowed.startsWith("*.")) {
          const baseDomain = allowed.slice(2); // 移除 *.
          if (domain.endsWith("." + baseDomain)) {
            return true;
          }
        }

        // 3. 双通配符匹配：*.domain.* 匹配 sub.domain.com、sub.domain.org 等
        if (allowed.startsWith("*.") && allowed.endsWith(".*")) {
          const middle = allowed.slice(2, -2); // 提取中间部分，如 "alphaviv"
          // 检查域名是否包含该中间部分，如 "www.alphaviv.org"
          if (domain.includes("." + middle + ".")) {
            return true;
          }
          // 也支持 "alphaviv.org" 这样不带 www 的情况
          if (domain.startsWith(middle + ".")) {
            return true;
          }
        }

        // 4. 隐含的通配符：example.com 也应该匹配 sub.example.com
        // 这是常见的用法，用户通常期望父域名覆盖子域名
        if (!allowed.startsWith("*.") && !allowed.startsWith("/")) {
          if (domain.endsWith("." + allowed)) {
            return true;
          }
        }

        // 5. 正则表达式匹配：/^pattern$/ 支持正则表达式
        try {
          if (allowed.startsWith("/") && allowed.endsWith("/")) {
            const regexPattern = allowed.slice(1, -1);
            const regex = new RegExp(regexPattern);
            if (regex.test(domain)) {
              return true;
            }
          }
        } catch (error) {
          // 忽略无效的正则表达式
        }

        return false;
      });
    } catch {
      return false;
    }
  }

  /**
   * 使用AI自动分类URL
   * POST /api/v1/data-management/classify-url
   *
   * 替代静态白名单，使用AI自动识别URL类型
   */
  @Post("classify-url")
  async classifyUrl(
    @Body()
    body: {
      url: string;
    },
  ) {
    try {
      if (!body.url) {
        return {
          success: false,
          error: "Missing required field: url",
        };
      }

      const result = await this.aiClassifierService.classifyUrl(body.url);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`Error classifying URL: ${error}`);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to classify URL",
      };
    }
  }

  /**
   * 解析URL并使用AI自动分类（不需要预先选择资源类型）
   * POST /api/v1/data-management/parse-url-auto
   *
   * 这个端点会：
   * 1. 使用AI自动分类URL到正确的资源类型
   * 2. 解析URL元数据
   * 3. 检测重复
   * 4. 返回完整的导入预览
   *
   * 当直接获取URL失败（如403）时，使用AI分类结果作为fallback
   */
  @Post("parse-url-auto")
  async parseUrlAuto(
    @Body()
    body: {
      url: string;
    },
  ) {
    try {
      if (!body.url) {
        return {
          success: false,
          error: "Missing required field: url",
        };
      }

      // 1. 使用AI分类URL（这个调用本身就会使用LLM搜索获取信息）
      const classification = await this.aiClassifierService.classifyUrl(
        body.url,
      );

      // 2. 尝试解析URL元数据
      let parseResult;
      let metadataSource: "direct" | "ai" = "direct";

      try {
        parseResult = await this.importManagerService.parseUrlFull(
          body.url,
          classification.resourceType,
        );
      } catch (parseError) {
        // 如果直接获取失败（如403），使用AI分类结果构造基本元数据
        const errorMessage =
          parseError instanceof Error ? parseError.message : "";

        if (
          errorMessage.includes("403") ||
          errorMessage.includes("访问被拒绝")
        ) {
          this.logger.log(
            `Direct fetch failed for ${body.url}, using AI classification as fallback`,
          );

          // 使用AI分类结果中的extractedInfo构造元数据
          const extractedInfo = classification.extractedInfo;
          metadataSource = "ai";

          parseResult = {
            metadata: {
              url: body.url,
              domain: extractedInfo?.domain || new URL(body.url).hostname,
              title:
                extractedInfo?.title || this.generateTitleFromUrl(body.url),
              description:
                extractedInfo?.description || `${classification.reason}`,
              language: "en",
              contentType: extractedInfo?.contentType || "webpage",
            },
            validation: {
              isValid: true,
              warnings: ["元数据通过AI分析获取，可能不完整，建议手动补充"],
            },
            duplicateCheck: {
              isDuplicate: false,
              similarity: 0,
              matchedItems: [],
            },
          };
        } else {
          // 其他错误继续抛出
          throw parseError;
        }
      }

      return {
        success: true,
        data: {
          ...parseResult,
          metadataSource,
          classification: {
            resourceType: classification.resourceType,
            confidence: classification.confidence,
            reason: classification.reason,
            alternatives: classification.alternatives,
          },
        },
      };
    } catch (error) {
      this.logger.error(`Error parsing URL auto: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to parse URL",
      };
    }
  }

  /**
   * 从URL生成标题
   */
  private generateTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // 从路径中提取最后一部分作为标题
      const pathParts = urlObj.pathname.split("/").filter((p) => p);
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1];
        // 将连字符和下划线转换为空格，移除文件扩展名
        return lastPart
          .replace(/[-_]/g, " ")
          .replace(/\.(html?|php|aspx?)$/i, "")
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      }
      return urlObj.hostname;
    } catch {
      return "Untitled";
    }
  }

  /**
   * 导入URL（使用AI自动分类，不需要预先选择资源类型）
   * POST /api/v1/data-management/import-auto
   */
  @Post("import-auto")
  async importAuto(
    @Body()
    body: {
      url: string;
      resourceType?: ResourceType; // 可选：用户可以覆盖AI分类结果
      skipDuplicateWarning?: boolean;
    },
  ) {
    try {
      if (!body.url) {
        return {
          success: false,
          error: "Missing required field: url",
        };
      }

      // 如果用户没有提供资源类型，使用AI分类
      let resourceType = body.resourceType;
      let classification;

      if (!resourceType) {
        classification = await this.aiClassifierService.classifyUrl(body.url);
        resourceType = classification.resourceType;
        this.logger.log(
          `AI classified ${body.url} as ${resourceType} (confidence: ${classification.confidence})`,
        );
      }

      // 首先解析URL获取元数据
      const parseResult = await this.importManagerService.parseUrlFull(
        body.url,
        resourceType,
      );

      // 导入资源
      const importTask = await this.importManagerService.importWithMetadata(
        body.url,
        resourceType,
        parseResult.metadata,
        body.skipDuplicateWarning,
      );

      return {
        success: true,
        data: {
          taskId: importTask.id,
          status: importTask.status,
          sourceUrl: importTask.sourceUrl,
          resourceType: resourceType,
          classification: classification
            ? {
                confidence: classification.confidence,
                reason: classification.reason,
                alternatives: classification.alternatives,
              }
            : undefined,
        },
      };
    } catch (error) {
      this.logger.error(`Error importing auto: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to import",
      };
    }
  }

  /**
   * 获取所有支持的资源类型及其描述
   * GET /api/v1/data-management/resource-types
   */
  @Get("resource-types")
  async getResourceTypes() {
    const descriptions = this.aiClassifierService.getResourceTypeDescriptions();

    return {
      success: true,
      data: Object.entries(descriptions).map(([type, description]) => ({
        type,
        description,
      })),
    };
  }
}
