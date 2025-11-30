import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AIModelType } from "@prisma/client";

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  // 管理员邮箱列表
  private readonly adminEmails = ["hello.junjie.duan@gmail.com"];

  constructor(private prisma: PrismaService) {}

  /**
   * 获取所有用户列表
   */
  async getAllUsers(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { username: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          avatarUrl: true,
          isActive: true,
          isVerified: true,
          oauthProvider: true,
          subscriptionTier: true,
          createdAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              notes: true,
              comments: true,
              collections: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // 标记管理员
    const usersWithAdminFlag = users.map(
      (user: {
        email: string;
        role: string;
        id: string;
        username: string | null;
        avatarUrl: string | null;
        isActive: boolean;
        isVerified: boolean;
        oauthProvider: string | null;
        subscriptionTier: string;
        createdAt: Date;
        lastLoginAt: Date | null;
        _count: { notes: number; comments: number; collections: number };
      }) => ({
        ...user,
        isAdmin: user.role === "ADMIN" || this.adminEmails.includes(user.email),
      }),
    );

    return {
      users: usersWithAdminFlag,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 删除资源
   */
  async deleteResource(resourceId: string) {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException(`Resource ${resourceId} not found`);
    }

    await this.prisma.resource.delete({
      where: { id: resourceId },
    });

    this.logger.log(`Resource deleted: ${resourceId} (${resource.title})`);

    return { success: true, message: "Resource deleted successfully" };
  }

  /**
   * 批量删除资源
   */
  async deleteResources(resourceIds: string[]) {
    const result = await this.prisma.resource.deleteMany({
      where: { id: { in: resourceIds } },
    });

    this.logger.log(`Deleted ${result.count} resources`);

    return {
      success: true,
      message: `Deleted ${result.count} resources`,
      count: result.count,
    };
  }

  /**
   * 更新用户角色
   */
  async updateUserRole(userId: string, role: "USER" | "ADMIN") {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
      },
    });

    this.logger.log(`User ${userId} role updated to ${role}`);

    return updatedUser;
  }

  /**
   * 禁用/启用用户
   */
  async toggleUserStatus(userId: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: {
        id: true,
        email: true,
        username: true,
        isActive: true,
      },
    });

    this.logger.log(
      `User ${userId} status updated to ${isActive ? "active" : "inactive"}`,
    );

    return updatedUser;
  }

  /**
   * 获取系统统计信息
   */
  async getSystemStats() {
    const [
      totalUsers,
      activeUsers,
      totalResources,
      resourcesByType,
      recentUsers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.resource.count(),
      this.prisma.resource.groupBy({
        by: ["type"],
        _count: { type: true },
      }),
      this.prisma.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        newLast7Days: recentUsers,
      },
      resources: {
        total: totalResources,
        byType: resourcesByType.reduce(
          (
            acc: Record<string, number>,
            item: { type: string; _count: { type: number } },
          ) => {
            acc[item.type] = item._count.type;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
    };
  }

  /**
   * 检查用户是否是管理员
   */
  async isUserAdmin(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true },
    });

    if (!user) return false;

    return user.role === "ADMIN" || this.adminEmails.includes(user.email);
  }

  // ============ AI Model Management ============

  /**
   * 获取所有AI模型配置
   */
  async getAllAIModels() {
    const models = await this.prisma.aIModel.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    // 返回掩码的API Key，显示前4位和后4位
    return models.map((model) => ({
      ...model,
      apiKey: model.apiKey ? this.maskApiKey(model.apiKey) : null,
      hasApiKey: !!model.apiKey,
    }));
  }

  /**
   * 获取单个AI模型
   * @param id 模型ID
   * @param includeFullApiKey 是否返回完整的 API Key（用于编辑模式）
   */
  async getAIModel(id: string, includeFullApiKey: boolean = false) {
    const model = await this.prisma.aIModel.findUnique({
      where: { id },
    });

    if (!model) {
      throw new NotFoundException(`AI Model ${id} not found`);
    }

    // 编辑模式返回完整 API Key，否则返回掩码
    return {
      ...model,
      apiKey: model.apiKey
        ? includeFullApiKey
          ? model.apiKey
          : this.maskApiKey(model.apiKey)
        : null,
      hasApiKey: !!model.apiKey,
    };
  }

  /**
   * 掩码 API Key，显示前4位和后4位
   */
  private maskApiKey(apiKey: string): string {
    if (apiKey.length <= 12) {
      return "****" + apiKey.slice(-4);
    }
    return apiKey.slice(0, 4) + "****" + apiKey.slice(-4);
  }

  /**
   * 创建或更新AI模型 (upsert)
   * 根据 modelId 判断：
   * - 如果相同 modelId 已存在，则更新该模型
   * - 如果 modelId 不同，则创建新模型（即使是同一个 provider/name）
   */
  async createAIModel(data: {
    name: string;
    displayName: string;
    provider: string;
    modelId: string;
    modelType?: AIModelType;
    icon: string;
    color: string;
    apiEndpoint: string;
    apiKey?: string;
    maxTokens?: number;
    temperature?: number;
    description?: string;
  }) {
    // Trim apiKey to remove any whitespace from copy-paste
    const apiKey = data.apiKey?.trim() || null;

    this.logger.log(
      `createAIModel called: name=${data.name}, modelId=${data.modelId}, apiKeyProvided=${!!apiKey}, apiKeyLength=${apiKey?.length || 0}`,
    );

    // 根据 modelId 检查是否存在相同的模型
    const existingByModelId = await this.prisma.aIModel.findFirst({
      where: { modelId: { equals: data.modelId, mode: "insensitive" } },
    });

    if (existingByModelId) {
      // 如果存在相同 modelId，则更新
      this.logger.log(
        `AI Model with modelId=${data.modelId} already exists (id=${existingByModelId.id}), updating`,
      );

      // 准备更新数据 - 只有提供了有效的 apiKey 才更新
      const updateData: any = {
        name: data.name,
        displayName: data.displayName,
        provider: data.provider,
        modelType: data.modelType ?? existingByModelId.modelType,
        icon: data.icon,
        color: data.color,
        apiEndpoint: data.apiEndpoint,
        maxTokens: data.maxTokens ?? existingByModelId.maxTokens,
        temperature: data.temperature ?? existingByModelId.temperature,
        description: data.description,
      };

      // 只有当提供了有效的 API Key（非空、非掩码格式）才更新
      if (apiKey && !apiKey.includes("****")) {
        updateData.apiKey = apiKey;
        this.logger.log(
          `Updating API key for modelId=${data.modelId}: length=${apiKey.length}, prefix=${apiKey.substring(0, 8)}...`,
        );
      } else {
        this.logger.log(
          `Keeping existing API key for modelId=${data.modelId} (new key not provided or is masked)`,
        );
      }

      const updated = await this.prisma.aIModel.update({
        where: { id: existingByModelId.id },
        data: updateData,
      });

      this.logger.log(
        `AI Model updated: ${updated.name} (${updated.displayName}), modelId=${updated.modelId}`,
      );

      return {
        ...updated,
        apiKey: updated.apiKey ? this.maskApiKey(updated.apiKey) : null,
        hasApiKey: !!updated.apiKey,
        isUpdate: true, // 标记这是更新操作
      };
    }

    // modelId 不存在，创建新模型
    const model = await this.prisma.aIModel.create({
      data: {
        name: data.name,
        displayName: data.displayName,
        provider: data.provider,
        modelId: data.modelId,
        modelType: data.modelType ?? "CHAT",
        icon: data.icon,
        color: data.color,
        apiEndpoint: data.apiEndpoint,
        apiKey: apiKey,
        maxTokens: data.maxTokens ?? 4096,
        temperature: data.temperature ?? 0.7,
        description: data.description,
        isEnabled: true,
        isDefault: false,
      },
    });

    this.logger.log(
      `AI Model created: ${model.name} (${model.displayName}), modelId=${model.modelId}`,
    );

    return {
      ...model,
      apiKey: model.apiKey ? this.maskApiKey(model.apiKey) : null,
      hasApiKey: !!model.apiKey,
      isUpdate: false, // 标记这是创建操作
    };
  }

  /**
   * 更新AI模型
   */
  async updateAIModel(
    id: string,
    data: {
      displayName?: string;
      provider?: string;
      modelId?: string;
      modelType?: AIModelType;
      icon?: string;
      color?: string;
      apiEndpoint?: string;
      apiKey?: string;
      maxTokens?: number;
      temperature?: number;
      description?: string;
      isEnabled?: boolean;
    },
  ) {
    const model = await this.prisma.aIModel.findUnique({
      where: { id },
    });

    if (!model) {
      throw new NotFoundException(`AI Model ${id} not found`);
    }

    // 如果apiKey为空字符串，设为null；如果是掩码格式（包含****）则保持不变
    // 同时对apiKey进行trim处理，防止复制时带入空格
    let apiKeyUpdate = undefined;
    if (data.apiKey !== undefined) {
      const trimmedKey =
        typeof data.apiKey === "string" ? data.apiKey.trim() : data.apiKey;
      this.logger.log(
        `API Key update: received="${data.apiKey?.substring(0, 10)}...", trimmed="${trimmedKey?.substring(0, 10)}...", length=${trimmedKey?.length || 0}`,
      );
      if (trimmedKey === "" || trimmedKey === null) {
        apiKeyUpdate = null;
        this.logger.log("API Key update: setting to null (empty)");
      } else if (trimmedKey.includes("****")) {
        // 掩码格式，保持不变
        this.logger.log("API Key update: keeping existing (masked format)");
      } else {
        apiKeyUpdate = trimmedKey;
        this.logger.log(
          `API Key update: setting new key (length=${trimmedKey.length})`,
        );
      }
    }

    const updated = await this.prisma.aIModel.update({
      where: { id },
      data: {
        displayName: data.displayName,
        provider: data.provider,
        modelId: data.modelId,
        modelType: data.modelType,
        icon: data.icon,
        color: data.color,
        apiEndpoint: data.apiEndpoint,
        apiKey: apiKeyUpdate,
        maxTokens: data.maxTokens,
        temperature: data.temperature,
        description: data.description,
        isEnabled: data.isEnabled,
      },
    });

    this.logger.log(
      `AI Model updated: ${updated.name}, hasApiKey=${!!updated.apiKey}, apiKeyLength=${updated.apiKey?.length || 0}`,
    );

    return {
      ...updated,
      apiKey: updated.apiKey ? this.maskApiKey(updated.apiKey) : null,
      hasApiKey: !!updated.apiKey,
    };
  }

  /**
   * 设置默认AI模型
   */
  async setDefaultAIModel(id: string) {
    const model = await this.prisma.aIModel.findUnique({
      where: { id },
    });

    if (!model) {
      throw new NotFoundException(`AI Model ${id} not found`);
    }

    // 先将所有模型设为非默认
    await this.prisma.aIModel.updateMany({
      data: { isDefault: false },
    });

    // 设置当前模型为默认
    const updated = await this.prisma.aIModel.update({
      where: { id },
      data: { isDefault: true },
    });

    this.logger.log(`AI Model ${updated.name} set as default`);

    return {
      ...updated,
      apiKey: updated.apiKey ? this.maskApiKey(updated.apiKey) : null,
      hasApiKey: !!updated.apiKey,
    };
  }

  /**
   * 删除AI模型
   */
  async deleteAIModel(id: string) {
    const model = await this.prisma.aIModel.findUnique({
      where: { id },
    });

    if (!model) {
      throw new NotFoundException(`AI Model ${id} not found`);
    }

    // 不允许删除默认模型
    if (model.isDefault) {
      throw new Error("Cannot delete the default AI model");
    }

    await this.prisma.aIModel.delete({
      where: { id },
    });

    this.logger.log(`AI Model deleted: ${model.name}`);

    return { success: true, message: "AI Model deleted successfully" };
  }

  /**
   * 获取AI模型的API Key（仅用于测试连接）
   */
  async getAIModelApiKey(id: string): Promise<string | null> {
    const model = await this.prisma.aIModel.findUnique({
      where: { id },
      select: { apiKey: true },
    });

    return model?.apiKey || null;
  }

  // ============ System Settings Management ============

  /**
   * 获取系统设置（按分类）
   */
  async getSettings(category?: string) {
    const where = category ? { category } : {};

    const settings = await this.prisma.systemSetting.findMany({
      where,
      orderBy: { key: "asc" },
    });

    // 将设置转换为键值对格式
    const result: Record<string, any> = {};
    for (const setting of settings) {
      try {
        result[setting.key] = JSON.parse(setting.value);
      } catch {
        result[setting.key] = setting.value;
      }
    }

    return result;
  }

  /**
   * 获取单个设置
   */
  async getSetting(key: string) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      return null;
    }

    try {
      return JSON.parse(setting.value);
    } catch {
      return setting.value;
    }
  }

  /**
   * 更新或创建设置
   */
  async setSetting(
    key: string,
    value: any,
    options?: { description?: string; category?: string },
  ) {
    const stringValue =
      typeof value === "string" ? value : JSON.stringify(value);

    const setting = await this.prisma.systemSetting.upsert({
      where: { key },
      update: {
        value: stringValue,
        description: options?.description,
        category: options?.category,
      },
      create: {
        key,
        value: stringValue,
        description: options?.description,
        category: options?.category ?? "general",
      },
    });

    this.logger.log(`System setting updated: ${key}`);

    return setting;
  }

  /**
   * 批量更新设置
   */
  async setSettings(
    settings: Array<{
      key: string;
      value: any;
      description?: string;
      category?: string;
    }>,
  ) {
    const results = await Promise.all(
      settings.map((s) =>
        this.setSetting(s.key, s.value, {
          description: s.description,
          category: s.category,
        }),
      ),
    );

    this.logger.log(`Updated ${results.length} system settings`);

    return results;
  }

  /**
   * 删除设置
   */
  async deleteSetting(key: string) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundException(`Setting ${key} not found`);
    }

    await this.prisma.systemSetting.delete({
      where: { key },
    });

    this.logger.log(`System setting deleted: ${key}`);

    return { success: true, message: "Setting deleted successfully" };
  }

  /**
   * 获取搜索API配置
   */
  async getSearchConfig() {
    const provider = await this.getSetting("search.provider");
    const tavilyKey = await this.getSetting("search.tavily.apiKey");
    const serperKey = await this.getSetting("search.serper.apiKey");
    const enabled = await this.getSetting("search.enabled");

    return {
      provider: provider || "tavily",
      enabled: enabled !== false,
      tavily: {
        apiKey: tavilyKey ? "***configured***" : null,
        hasApiKey: !!tavilyKey,
      },
      serper: {
        apiKey: serperKey ? "***configured***" : null,
        hasApiKey: !!serperKey,
      },
    };
  }

  /**
   * 更新搜索API配置
   */
  async updateSearchConfig(config: {
    provider?: string;
    enabled?: boolean;
    tavilyApiKey?: string;
    serperApiKey?: string;
  }) {
    const updates: Array<{
      key: string;
      value: any;
      description?: string;
      category: string;
    }> = [];

    if (config.provider !== undefined) {
      updates.push({
        key: "search.provider",
        value: config.provider,
        description: "Search API provider (tavily or serper)",
        category: "search",
      });
    }

    if (config.enabled !== undefined) {
      updates.push({
        key: "search.enabled",
        value: config.enabled,
        description: "Enable or disable search functionality",
        category: "search",
      });
    }

    // Only update API keys if they are provided and not the masked value
    if (
      config.tavilyApiKey &&
      config.tavilyApiKey !== "***configured***" &&
      config.tavilyApiKey.trim() !== ""
    ) {
      updates.push({
        key: "search.tavily.apiKey",
        value: config.tavilyApiKey.trim(),
        description: "Tavily API Key",
        category: "search",
      });
    }

    if (
      config.serperApiKey &&
      config.serperApiKey !== "***configured***" &&
      config.serperApiKey.trim() !== ""
    ) {
      updates.push({
        key: "search.serper.apiKey",
        value: config.serperApiKey.trim(),
        description: "Serper API Key",
        category: "search",
      });
    }

    if (updates.length > 0) {
      await this.setSettings(updates);
    }

    return this.getSearchConfig();
  }

  /**
   * 获取搜索API Key（内部使用，返回实际值）
   */
  async getSearchApiKey(provider: string): Promise<string | null> {
    if (provider === "tavily") {
      return this.getSetting("search.tavily.apiKey");
    } else if (provider === "serper") {
      return this.getSetting("search.serper.apiKey");
    }
    return null;
  }

  /**
   * 诊断AI模型配置
   * 返回所有模型的配置状态，用于调试
   */
  async diagnoseAIModels() {
    const models = await this.prisma.aIModel.findMany({
      orderBy: { name: "asc" },
    });

    return models.map((model) => ({
      id: model.id,
      name: model.name,
      displayName: model.displayName,
      provider: model.provider,
      modelId: model.modelId,
      modelType: model.modelType,
      apiEndpoint: model.apiEndpoint,
      isEnabled: model.isEnabled,
      isDefault: model.isDefault,
      hasApiKey: !!model.apiKey,
      apiKeyLength: model.apiKey?.length || 0,
      apiKeyPrefix: model.apiKey ? model.apiKey.substring(0, 8) + "..." : null,
      maxTokens: model.maxTokens,
      temperature: model.temperature,
      updatedAt: model.updatedAt,
    }));
  }

  // ============ AI Model Type-based Selection ============

  /**
   * 获取指定类型的所有启用模型
   */
  async getAIModelsByType(modelType: AIModelType) {
    const models = await this.prisma.aIModel.findMany({
      where: {
        modelType,
        isEnabled: true,
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return models.map((model) => ({
      ...model,
      apiKey: model.apiKey ? this.maskApiKey(model.apiKey) : null,
      hasApiKey: !!model.apiKey,
    }));
  }

  /**
   * 获取指定类型的默认模型
   * 如果没有设置默认，则返回该类型中的第一个启用模型
   */
  async getDefaultModelByType(modelType: AIModelType) {
    // 先找该类型的默认模型
    let model = await this.prisma.aIModel.findFirst({
      where: {
        modelType,
        isEnabled: true,
        isDefault: true,
      },
    });

    // 如果没有默认模型，返回该类型中的第一个启用模型
    if (!model) {
      model = await this.prisma.aIModel.findFirst({
        where: {
          modelType,
          isEnabled: true,
        },
        orderBy: { createdAt: "asc" },
      });
    }

    if (!model) {
      return null;
    }

    return {
      ...model,
      apiKey: model.apiKey ? this.maskApiKey(model.apiKey) : null,
      hasApiKey: !!model.apiKey,
    };
  }

  /**
   * 获取指定类型的默认模型（返回完整配置，包括 API Key）
   * 供内部服务使用
   */
  async getDefaultModelByTypeInternal(modelType: AIModelType) {
    // 先找该类型的默认模型
    let model = await this.prisma.aIModel.findFirst({
      where: {
        modelType,
        isEnabled: true,
        isDefault: true,
      },
    });

    // 如果没有默认模型，返回该类型中的第一个启用模型
    if (!model) {
      model = await this.prisma.aIModel.findFirst({
        where: {
          modelType,
          isEnabled: true,
        },
        orderBy: { createdAt: "asc" },
      });
    }

    return model;
  }

  /**
   * 设置某个模型为其类型的默认模型
   * 只影响同类型的模型
   */
  async setDefaultAIModelForType(id: string) {
    const model = await this.prisma.aIModel.findUnique({
      where: { id },
    });

    if (!model) {
      throw new NotFoundException(`AI Model ${id} not found`);
    }

    // 先将同类型的所有模型设为非默认
    await this.prisma.aIModel.updateMany({
      where: { modelType: model.modelType },
      data: { isDefault: false },
    });

    // 设置当前模型为默认
    const updated = await this.prisma.aIModel.update({
      where: { id },
      data: { isDefault: true },
    });

    this.logger.log(
      `AI Model ${updated.name} set as default for type ${updated.modelType}`,
    );

    return {
      ...updated,
      apiKey: updated.apiKey ? this.maskApiKey(updated.apiKey) : null,
      hasApiKey: !!updated.apiKey,
    };
  }

  /**
   * 获取所有类型及其默认模型
   */
  async getAllModelTypeDefaults() {
    const types: AIModelType[] = [
      "CHAT",
      "IMAGE_GENERATION",
      "IMAGE_EDITING",
      "MULTIMODAL",
    ];

    const result: Record<
      string,
      { defaultModel: any; availableModels: number }
    > = {};

    for (const type of types) {
      const defaultModel = await this.getDefaultModelByType(type);
      const count = await this.prisma.aIModel.count({
        where: { modelType: type, isEnabled: true },
      });

      result[type] = {
        defaultModel: defaultModel
          ? {
              id: defaultModel.id,
              name: defaultModel.name,
              displayName: defaultModel.displayName,
              modelId: defaultModel.modelId,
              provider: defaultModel.provider,
            }
          : null,
        availableModels: count,
      };
    }

    return result;
  }
}
