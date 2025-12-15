import { INestApplication } from "@nestjs/common";

/**
 * Swagger API 文档配置
 *
 * 使用方法:
 * 1. 安装依赖: npm install @nestjs/swagger swagger-ui-express
 * 2. 在 main.ts 中调用 setupSwagger(app)
 *
 * 访问地址: /api/docs
 */
export async function setupSwagger(app: INestApplication): Promise<void> {
  try {
    // 动态导入 Swagger 模块（如果未安装则跳过）
    const { DocumentBuilder, SwaggerModule } = await import("@nestjs/swagger");

    const config = new DocumentBuilder()
      .setTitle("DeepDive Engine API")
      .setDescription(
        `
## DeepDive Engine Backend API

### 功能模块

- **AI Studio** - 专题研究项目管理
- **AI Office** - 智能文档生成 (PPT/Word/Excel)
- **AI Teams** - 多人多AI协作讨论
- **AI Ask** - AI对话助手
- **AI Image** - AI图像生成
- **Explore** - 资源发现与管理
- **Library** - 个人收藏管理
- **Admin** - 系统管理

### 认证方式

所有需要认证的接口都需要在 Header 中携带 Bearer Token:
\`\`\`
Authorization: Bearer <access_token>
\`\`\`

### 错误响应格式

\`\`\`json
{
  "statusCode": 400,
  "message": "错误描述",
  "error": "Bad Request"
}
\`\`\`
      `,
      )
      .setVersion("1.0")
      .addBearerAuth(
        {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          name: "Authorization",
          description: "输入 JWT access token",
          in: "header",
        },
        "access-token",
      )
      .addTag("auth", "用户认证相关接口")
      .addTag("ai-studio", "AI Studio 专题研究")
      .addTag("ai-office", "AI Office 文档生成")
      .addTag("ai-teams", "AI Teams 协作讨论")
      .addTag("ai-ask", "AI Ask 对话助手")
      .addTag("ai-image", "AI Image 图像生成")
      .addTag("explore", "资源发现")
      .addTag("library", "个人收藏")
      .addTag("notes", "笔记管理")
      .addTag("admin", "系统管理")
      .build();

    const document = SwaggerModule.createDocument(app, config, {
      // 深度扫描所有模块
      deepScanRoutes: true,
    });

    SwaggerModule.setup("api/docs", app, document, {
      customSiteTitle: "DeepDive Engine API Docs",
      customfavIcon: "/favicon.ico",
      customCss: `
        .swagger-ui .topbar { display: none }
        .swagger-ui .info { margin: 20px 0 }
        .swagger-ui .info .title { font-size: 28px }
      `,
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: "none",
        filter: true,
        showRequestDuration: true,
      },
    });

    console.log("📚 Swagger API docs available at /api/docs");
  } catch {
    console.log(
      "⚠️  Swagger not available (install: npm install @nestjs/swagger swagger-ui-express)",
    );
  }
}
