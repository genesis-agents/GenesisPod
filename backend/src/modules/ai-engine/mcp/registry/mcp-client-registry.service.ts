/**
 * MCP Client Registry Service
 *
 * Manages connections to external MCP servers.
 * Persists server configs in the database and coordinates
 * with MCPManager for actual connections.
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { MCPManager } from "../manager/mcp-manager";
import { MCPTransportType } from "../abstractions/mcp.interface";

export interface ConnectionStatus {
  status: "connected" | "disconnected" | "error";
  error?: string;
  connectedAt?: Date;
}

@Injectable()
export class MCPClientRegistryService implements OnModuleInit {
  private readonly logger = new Logger(MCPClientRegistryService.name);
  private readonly connectionStatus = new Map<string, ConnectionStatus>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mcpManager: MCPManager,
  ) {}

  async onModuleInit() {
    await this.autoConnectServers();
  }

  /**
   * Auto-connect all enabled servers with autoConnect=true
   */
  private async autoConnectServers(): Promise<void> {
    try {
      const servers = await this.prisma.mCPServerConfig.findMany({
        where: { enabled: true, autoConnect: true },
      });

      if (servers.length === 0) {
        this.logger.log("No external MCP servers configured for auto-connect");
        return;
      }

      this.logger.log(
        `Auto-connecting to ${servers.length} external MCP server(s)...`,
      );

      for (const server of servers) {
        try {
          await this.connectServer(server.serverId);
          this.logger.log(
            `Auto-connected to external MCP server: ${server.name} (${server.serverId})`,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to auto-connect to ${server.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to auto-connect external MCP servers: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Connect to a specific external server
   */
  async connectServer(serverId: string): Promise<void> {
    const serverConfig = await this.prisma.mCPServerConfig.findUnique({
      where: { serverId },
    });

    if (!serverConfig) {
      throw new Error(`Server config not found for serverId: ${serverId}`);
    }

    if (!serverConfig.url) {
      throw new Error(
        `Server ${serverId} has no URL configured. URL is required for external MCP connections.`,
      );
    }

    try {
      // Register or update the server config in MCPManager
      await this.mcpManager.registerOrUpdateServer({
        id: serverConfig.serverId,
        name: serverConfig.name,
        transport: serverConfig.transport as MCPTransportType,
        url: serverConfig.url,
        autoReconnect: serverConfig.autoConnect,
      });

      // Connect via MCPManager
      await this.mcpManager.connect(serverConfig.serverId);

      this.connectionStatus.set(serverId, {
        status: "connected",
        connectedAt: new Date(),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.connectionStatus.set(serverId, {
        status: "error",
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Disconnect from a server
   */
  async disconnectServer(serverId: string): Promise<void> {
    try {
      await this.mcpManager.disconnect(serverId);
    } catch (error) {
      this.logger.warn(
        `Error disconnecting from ${serverId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.connectionStatus.set(serverId, { status: "disconnected" });
  }

  /**
   * Discover tools from a connected server
   */
  async discoverTools(serverId: string) {
    const client = this.mcpManager.getClient(serverId);
    if (!client) {
      throw new Error(`No connected client for server ${serverId}`);
    }

    if (!client.connected) {
      throw new Error(
        `Client for server ${serverId} is not connected. Connect first.`,
      );
    }

    return client.listTools();
  }

  /**
   * Get connection statuses for all servers
   */
  async getConnectionStatuses() {
    const servers = await this.prisma.mCPServerConfig.findMany({
      orderBy: { name: "asc" },
    });

    return servers.map((server) => ({
      ...server,
      connectionStatus: this.connectionStatus.get(server.serverId) ?? {
        status: "disconnected" as const,
      },
    }));
  }

  /**
   * Get connection status for a specific server
   */
  getConnectionStatus(serverId: string): ConnectionStatus {
    return (
      this.connectionStatus.get(serverId) ?? {
        status: "disconnected" as const,
      }
    );
  }

  /**
   * Find a server by its database id
   */
  async findById(id: string) {
    return this.prisma.mCPServerConfig.findUnique({ where: { id } });
  }

  /**
   * Add a new external MCP server config
   */
  async addServer(data: {
    serverId: string;
    name: string;
    description?: string;
    transport: string;
    url: string;
    enabled?: boolean;
    autoConnect?: boolean;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.mCPServerConfig.create({
      data: {
        serverId: data.serverId,
        name: data.name,
        description: data.description,
        transport: data.transport,
        url: data.url,
        enabled: data.enabled ?? true,
        autoConnect: data.autoConnect ?? false,
        metadata: data.metadata,
      },
    });
  }

  /**
   * Update an external MCP server config
   */
  async updateServer(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      transport: string;
      url: string;
      enabled: boolean;
      autoConnect: boolean;
      metadata: Prisma.InputJsonValue;
    }>,
  ) {
    return this.prisma.mCPServerConfig.update({
      where: { id },
      data: data as Prisma.MCPServerConfigUpdateInput,
    });
  }

  /**
   * Remove an external MCP server
   * Disconnects if connected, then removes from DB
   */
  async removeServer(id: string) {
    const server = await this.prisma.mCPServerConfig.findUnique({
      where: { id },
    });

    if (server) {
      // Try to disconnect and unregister from MCPManager
      try {
        await this.mcpManager.unregisterServer(server.serverId);
      } catch {
        // Ignore errors during cleanup
      }
      this.connectionStatus.delete(server.serverId);
    }

    return this.prisma.mCPServerConfig.delete({ where: { id } });
  }
}
