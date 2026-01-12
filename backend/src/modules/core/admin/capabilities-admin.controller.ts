import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Logger,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../common/guards/admin.guard";
import { CapabilitiesAdminService } from "./capabilities-admin.service";

/**
 * AI Agent 能力管理控制器
 * 管理 Tools、Skills 和 MCP 服务器
 */
@Controller("admin/capabilities")
@UseGuards(JwtAuthGuard, AdminGuard)
export class CapabilitiesAdminController {
  private readonly logger = new Logger(CapabilitiesAdminController.name);

  constructor(private readonly capabilitiesService: CapabilitiesAdminService) {}

  // ==================== Tools ====================

  /**
   * 获取所有工具配置
   * GET /api/v1/admin/capabilities/tools
   */
  @Get("tools")
  async getTools() {
    this.logger.log("Admin: Fetching tool configurations");
    return this.capabilitiesService.getToolConfigs();
  }

  /**
   * 更新工具配置
   * PATCH /api/v1/admin/capabilities/tools/:toolId
   */
  @Patch("tools/:toolId")
  async updateTool(
    @Param("toolId") toolId: string,
    @Body()
    body: {
      enabled?: boolean;
      displayName?: string;
      description?: string;
      config?: Record<string, unknown>;
    },
  ) {
    this.logger.log(`Admin: Updating tool ${toolId}`);
    return this.capabilitiesService.updateToolConfig(toolId, body);
  }

  /**
   * 测试工具
   * POST /api/v1/admin/capabilities/tools/:toolId/test
   */
  @Post("tools/:toolId/test")
  async testTool(
    @Param("toolId") toolId: string,
    @Body() body: { input?: Record<string, unknown> },
  ) {
    this.logger.log(`Admin: Testing tool ${toolId}`);
    return this.capabilitiesService.testTool(toolId, body.input);
  }

  // ==================== Skills ====================

  /**
   * 获取所有技能配置
   * GET /api/v1/admin/capabilities/skills
   */
  @Get("skills")
  async getSkills() {
    this.logger.log("Admin: Fetching skill configurations");
    return this.capabilitiesService.getSkillConfigs();
  }

  /**
   * 更新技能配置
   * PATCH /api/v1/admin/capabilities/skills/:skillId
   */
  @Patch("skills/:skillId")
  async updateSkill(
    @Param("skillId") skillId: string,
    @Body()
    body: {
      enabled?: boolean;
      displayName?: string;
      description?: string;
      config?: Record<string, unknown>;
    },
  ) {
    this.logger.log(`Admin: Updating skill ${skillId}`);
    return this.capabilitiesService.updateSkillConfig(skillId, body);
  }

  // ==================== MCP Servers ====================

  /**
   * 获取所有 MCP 服务器配置
   * GET /api/v1/admin/capabilities/mcp-servers
   */
  @Get("mcp-servers")
  async getMCPServers() {
    this.logger.log("Admin: Fetching MCP server configurations");
    return this.capabilitiesService.getMCPServerConfigs();
  }

  /**
   * 添加 MCP 服务器
   * POST /api/v1/admin/capabilities/mcp-servers
   */
  @Post("mcp-servers")
  async addMCPServer(
    @Body()
    body: {
      serverId: string;
      name: string;
      description?: string;
      transport: "stdio" | "sse";
      command?: string;
      args?: string[];
      url?: string;
      enabled?: boolean;
      autoConnect?: boolean;
      apiKey?: string;
    },
  ) {
    this.logger.log(`Admin: Adding MCP server ${body.serverId}`);
    return this.capabilitiesService.addMCPServer(body);
  }

  /**
   * 更新 MCP 服务器配置
   * PATCH /api/v1/admin/capabilities/mcp-servers/:serverId
   */
  @Patch("mcp-servers/:serverId")
  async updateMCPServer(
    @Param("serverId") serverId: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      enabled?: boolean;
      autoConnect?: boolean;
      command?: string;
      args?: string[];
      url?: string;
      apiKey?: string;
    },
  ) {
    this.logger.log(`Admin: Updating MCP server ${serverId}`);
    return this.capabilitiesService.updateMCPServer(serverId, body);
  }

  /**
   * 连接 MCP 服务器
   * POST /api/v1/admin/capabilities/mcp-servers/:serverId/connect
   */
  @Post("mcp-servers/:serverId/connect")
  async connectMCPServer(@Param("serverId") serverId: string) {
    this.logger.log(`Admin: Connecting MCP server ${serverId}`);
    return this.capabilitiesService.connectMCPServer(serverId);
  }

  /**
   * 断开 MCP 服务器
   * POST /api/v1/admin/capabilities/mcp-servers/:serverId/disconnect
   */
  @Post("mcp-servers/:serverId/disconnect")
  async disconnectMCPServer(@Param("serverId") serverId: string) {
    this.logger.log(`Admin: Disconnecting MCP server ${serverId}`);
    return this.capabilitiesService.disconnectMCPServer(serverId);
  }

  /**
   * 删除 MCP 服务器
   * DELETE /api/v1/admin/capabilities/mcp-servers/:serverId
   */
  @Delete("mcp-servers/:serverId")
  async deleteMCPServer(@Param("serverId") serverId: string) {
    this.logger.log(`Admin: Deleting MCP server ${serverId}`);
    return this.capabilitiesService.deleteMCPServer(serverId);
  }
}
