/**
 * GitHub OAuth Service - GitHub OAuth 认证服务
 *
 * 处理 GitHub OAuth 流程和令牌管理
 */

import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import axios from "axios";

export interface GithubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface GithubUser {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
  name: string | null;
}

@Injectable()
export class GithubOAuthService {
  private readonly logger = new Logger(GithubOAuthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.clientId = this.configService.get("GITHUB_CLIENT_ID") || "";
    this.clientSecret = this.configService.get("GITHUB_CLIENT_SECRET") || "";
    this.callbackUrl =
      this.configService.get("GITHUB_CALLBACK_URL") ||
      "http://localhost:3000/api/v1/ai-coding/github/callback";

    if (!this.clientId || !this.clientSecret) {
      this.logger.warn(
        "GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
      );
    }
  }

  /**
   * 检查是否已配置 GitHub OAuth
   */
  isConfigured(): boolean {
    return !!this.clientId && !!this.clientSecret;
  }

  /**
   * 生成 OAuth 授权 URL
   */
  getAuthorizationUrl(state: string): string {
    if (!this.isConfigured()) {
      throw new Error("GitHub OAuth not configured");
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      scope: "repo user:email",
      state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * 交换授权码获取访问令牌
   */
  async exchangeCodeForToken(code: string): Promise<GithubTokenResponse> {
    if (!this.isConfigured()) {
      throw new Error("GitHub OAuth not configured");
    }

    try {
      const response = await axios.post(
        "https://github.com/login/oauth/access_token",
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: this.callbackUrl,
        },
        {
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (response.data.error) {
        throw new UnauthorizedException(
          response.data.error_description || "OAuth failed",
        );
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new UnauthorizedException(
          error.response?.data?.error_description || "OAuth failed",
        );
      }
      throw error;
    }
  }

  /**
   * 获取 GitHub 用户信息
   */
  async getGithubUser(accessToken: string): Promise<GithubUser> {
    try {
      const response = await axios.get("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      // 如果 email 不公开，尝试获取主要 email
      if (!response.data.email) {
        try {
          const emailsResponse = await axios.get(
            "https://api.github.com/user/emails",
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
              },
            },
          );
          const primaryEmail = emailsResponse.data.find(
            (e: { primary: boolean; verified: boolean; email: string }) =>
              e.primary && e.verified,
          );
          if (primaryEmail) {
            response.data.email = primaryEmail.email;
          }
        } catch {
          // 忽略 email 获取失败
        }
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        throw new UnauthorizedException("Invalid GitHub token");
      }
      throw error;
    }
  }

  /**
   * 保存或更新用户的 GitHub 连接
   */
  async saveConnection(
    userId: string,
    tokenData: GithubTokenResponse,
    userData: GithubUser,
  ) {
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    this.logger.log(`Saving GitHub connection for user ${userId}`);

    return this.prisma.githubConnection.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenType: tokenData.token_type,
        scope: tokenData.scope,
        githubId: userData.id,
        githubLogin: userData.login,
        githubEmail: userData.email,
        avatarUrl: userData.avatar_url,
        expiresAt,
      },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenType: tokenData.token_type,
        scope: tokenData.scope,
        githubId: userData.id,
        githubLogin: userData.login,
        githubEmail: userData.email,
        avatarUrl: userData.avatar_url,
        expiresAt,
        lastUsedAt: new Date(),
      },
    });
  }

  /**
   * 获取用户的 GitHub 连接
   */
  async getConnection(userId: string) {
    return this.prisma.githubConnection.findUnique({
      where: { userId },
    });
  }

  /**
   * 检查用户是否有有效的 GitHub 连接
   */
  async hasValidConnection(userId: string): Promise<boolean> {
    const connection = await this.getConnection(userId);
    if (!connection) return false;

    // 检查令牌是否过期
    if (connection.expiresAt && connection.expiresAt < new Date()) {
      return false;
    }

    return true;
  }

  /**
   * 获取用户的访问令牌（如需要则刷新）
   */
  async getAccessToken(userId: string): Promise<string> {
    const connection = await this.getConnection(userId);
    if (!connection) {
      throw new UnauthorizedException("GitHub not connected");
    }

    // TODO: 实现令牌刷新逻辑

    // 更新最后使用时间
    await this.prisma.githubConnection.update({
      where: { userId },
      data: { lastUsedAt: new Date() },
    });

    return connection.accessToken;
  }

  /**
   * 断开 GitHub 连接
   */
  async disconnect(userId: string) {
    const connection = await this.getConnection(userId);
    if (!connection) {
      throw new UnauthorizedException("GitHub not connected");
    }

    this.logger.log(`Disconnecting GitHub for user ${userId}`);

    return this.prisma.githubConnection.delete({
      where: { userId },
    });
  }

  /**
   * 获取 GitHub 连接状态
   */
  async getStatus(userId: string) {
    const connection = await this.getConnection(userId);

    if (!connection) {
      return {
        connected: false,
        configured: this.isConfigured(),
      };
    }

    return {
      connected: true,
      configured: this.isConfigured(),
      githubLogin: connection.githubLogin,
      githubEmail: connection.githubEmail,
      avatarUrl: connection.avatarUrl,
      connectedAt: connection.createdAt,
      lastUsedAt: connection.lastUsedAt,
    };
  }
}
