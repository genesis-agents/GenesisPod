import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

/**
 * 管理员守卫
 *
 * 检查当前用户是否为管理员
 * 必须在JwtAuthGuard之后使用
 */
@Injectable()
export class AdminGuard implements CanActivate {
  // 管理员邮箱列表（从环境变量读取）
  private readonly adminEmails: string[];

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const emails = this.configService.get<string>("ADMIN_EMAILS", "");
    this.adminEmails = emails
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException("Authentication required");
    }

    // 检查用户是否为管理员（通过role字段或邮箱白名单）
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, email: true },
    });

    if (!dbUser) {
      throw new ForbiddenException("User not found");
    }

    // 检查role字段或邮箱白名单
    const isAdmin =
      dbUser.role === "ADMIN" || this.adminEmails.includes(dbUser.email);

    if (!isAdmin) {
      throw new ForbiddenException("Admin access required");
    }

    // 将isAdmin标记添加到请求中
    request.isAdmin = true;

    return true;
  }
}
