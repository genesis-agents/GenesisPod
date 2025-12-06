import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../common/prisma/prisma.service";
import * as bcrypt from "bcrypt";

/**
 * 认证服务
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * 用户注册
   */
  async register(email: string, username: string, password: string) {
    // 检查用户是否已存在
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      throw new ConflictException("Email or username already exists");
    }

    // 密码加密
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        passwordHash: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
      },
    });

    // 生成 tokens
    const tokens = this.generateTokens(user.id, user.email);

    this.logger.log(`New user registered: ${user.username}`);

    return {
      user,
      ...tokens,
    };
  }

  /**
   * 用户登录
   */
  async login(email: string, password: string) {
    // 查找用户
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(
      password,
      user.passwordHash ?? "",
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // 生成 tokens
    const tokens = this.generateTokens(user.id, user.email);

    // 更新最后登录时间
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        isActive: true,
      },
    });

    this.logger.log(`User logged in: ${user.username}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt,
      },
      ...tokens,
    };
  }

  /**
   * 刷新 token
   */
  async refreshToken(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    if (!user.email) {
      throw new UnauthorizedException("User email is required");
    }

    return this.generateTokens(user.id, user.email);
  }

  /**
   * 生成 access token 和 refresh token
   */
  private generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: "30d" });

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * 验证用户
   */
  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
      },
    });

    return user;
  }

  /**
   * Google OAuth - 查找或创建用户
   */
  async findOrCreateGoogleUser(profile: {
    id: string;
    email: string;
    displayName: string;
    picture?: string;
  }) {
    // 先尝试通过email查找用户
    let user = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (!user) {
      // 用户不存在，创建新用户
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          username: profile.displayName || profile.email.split("@")[0],
          oauthProvider: "google",
          oauthId: profile.id,
          avatarUrl: profile.picture,
          // Google OAuth用户不需要密码
          passwordHash: null,
          isVerified: true, // Google账户已验证
        },
      });

      this.logger.log(`New Google user created: ${user.username}`);
    } else if (!user.oauthId || user.oauthProvider !== "google") {
      // 用户存在但没有关联Google ID，更新用户
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          oauthProvider: "google",
          oauthId: profile.id,
          avatarUrl: profile.picture || user.avatarUrl,
          isVerified: true,
        },
      });

      this.logger.log(`Existing user linked with Google: ${user.username}`);
    }

    // 更新最后登录时间
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        isActive: true,
      },
    });

    // 生成tokens
    if (!user.email) {
      throw new UnauthorizedException("User email is required");
    }

    const tokens = this.generateTokens(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
      ...tokens,
    };
  }

  /**
   * 更新用户个人信息
   */
  async updateProfile(
    userId: string,
    updateData: { username?: string; bio?: string; interests?: string[] },
  ) {
    // 如果要更新username，检查是否已存在
    if (updateData.username) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          username: updateData.username,
          NOT: { id: userId },
        },
      });

      if (existingUser) {
        throw new ConflictException("Username already exists");
      }
    }

    // 处理interests更新
    if (updateData.interests !== undefined) {
      // 删除旧的interests
      await this.prisma.userInterest.deleteMany({
        where: { userId },
      });

      // 创建新的interests
      if (updateData.interests.length > 0) {
        await this.prisma.userInterest.createMany({
          data: updateData.interests.map((tag) => ({
            userId,
            tag,
            source: "manual",
          })),
        });
      }
    }

    // 更新用户基本信息（不包括interests，因为已单独处理）
    const { interests: _, ...updateFields } = updateData;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateFields,
      select: {
        id: true,
        email: true,
        username: true,
        bio: true,
        interests: {
          select: {
            tag: true,
          },
        },
        avatarUrl: true,
        createdAt: true,
      },
    });

    this.logger.log(`User profile updated: ${user.username}`);

    // 转换interests为string数组
    return {
      ...user,
      interests: user.interests.map((i) => i.tag),
    };
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    // Count bookmarked/saved resources (user_activities with type SAVE)
    const bookmarkedCount = await this.prisma.userActivity.count({
      where: {
        userId,
        activityType: "SAVE",
      },
    });

    // Count viewed/read resources
    const viewedCount = await this.prisma.userActivity.count({
      where: {
        userId,
        activityType: "VIEW",
      },
    });

    // Count comments made by user
    const commentsCount = await this.prisma.comment.count({
      where: { userId },
    });

    // Count notes made by user
    const notesCount = await this.prisma.note.count({
      where: { userId },
    });

    // Count reports created
    const reportsCount = await this.prisma.report.count({
      where: { userId },
    });

    // Count AI chat sessions
    const chatSessionsCount = await this.prisma.askSession.count({
      where: { userId },
    });

    // Count AI Group topics participated (as creator or member)
    const topicsCreatedCount = await this.prisma.topic.count({
      where: { createdById: userId },
    });

    // Count generated images
    const imagesCount = await this.prisma.generatedImage.count({
      where: { userId },
    });

    // Get activity breakdown by type
    const activityBreakdown = await this.prisma.userActivity.groupBy({
      by: ["activityType"],
      where: { userId },
      _count: true,
    });

    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentActivityCount = await this.prisma.userActivity.count({
      where: {
        userId,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    return {
      userId: user.id,
      memberSince: user.createdAt,
      stats: {
        bookmarked: bookmarkedCount,
        viewed: viewedCount,
        comments: commentsCount,
        notes: notesCount,
        reports: reportsCount,
        chatSessions: chatSessionsCount,
        topicsCreated: topicsCreatedCount,
        imagesGenerated: imagesCount,
      },
      activity: {
        recentActivityCount,
        breakdown: activityBreakdown.map((a) => ({
          type: a.activityType,
          count: a._count,
        })),
      },
    };
  }
}
