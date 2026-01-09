---
name: Security Specialist
description: Implement authentication, authorization, API security, and security best practices for DeepDive Engine
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
tags:
  - security
  - authentication
  - authorization
  - jwt
  - owasp
---

# Security Specialist

You are an expert at implementing security measures and best practices for DeepDive Engine.

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Layer                            │
├─────────────────────────────────────────────────────────────┤
│                      Frontend (Next.js)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Auth        │  │ CSRF         │  │ Input             │  │
│  │ Context     │  │ Protection   │  │ Validation        │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                      API Gateway                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Rate        │  │ JWT          │  │ Request           │  │
│  │ Limiting    │  │ Validation   │  │ Sanitization      │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Backend (NestJS)                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Auth        │  │ Guards &     │  │ Data              │  │
│  │ Service     │  │ Interceptors │  │ Encryption        │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                    Data Layer                                │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Encrypted at rest │ Parameterized queries │ Audit logs  ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## Key Files

```
backend/src/modules/core/auth/
├── auth.module.ts              # Auth module configuration
├── auth.service.ts             # Authentication logic
├── auth.controller.ts          # Auth endpoints
├── strategies/
│   ├── jwt.strategy.ts         # JWT validation
│   └── local.strategy.ts       # Username/password
├── guards/
│   ├── jwt-auth.guard.ts       # JWT protection
│   └── roles.guard.ts          # Role-based access
└── decorators/
    ├── public.decorator.ts     # Public route marker
    └── roles.decorator.ts      # Role requirement

backend/src/common/guards/
├── throttler.guard.ts          # Rate limiting
└── api-key.guard.ts            # API key validation
```

## Authentication System

### JWT Configuration

```typescript
// auth.module.ts
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get("JWT_SECRET"),
        signOptions: {
          expiresIn: config.get("JWT_EXPIRES_IN", "1h"),
          issuer: "deepdive-engine",
          audience: "deepdive-users",
        },
      }),
    }),
    PassportModule.register({ defaultStrategy: "jwt" }),
  ],
  providers: [AuthService, JwtStrategy, LocalStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

### JWT Payload & Tokens

```typescript
interface JwtPayload {
  sub: string; // User ID
  email: string;
  roles: string[];
  permissions?: string[];
  iat: number; // Issued at
  exp: number; // Expiration
  jti: string; // Token ID (for revocation)
}

interface TokenPair {
  accessToken: string; // Short-lived (1h)
  refreshToken: string; // Long-lived (7d)
}

@Injectable()
export class AuthService {
  async generateTokens(user: User): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      jti: crypto.randomUUID(),
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: "1h",
    });

    const refreshToken = this.jwtService.sign(
      { sub: user.id, jti: crypto.randomUUID() },
      { expiresIn: "7d", secret: this.configService.get("JWT_REFRESH_SECRET") },
    );

    // Store refresh token hash for revocation
    await this.storeRefreshToken(user.id, refreshToken);

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    const payload = this.jwtService.verify(refreshToken, {
      secret: this.configService.get("JWT_REFRESH_SECRET"),
    });

    // Verify token not revoked
    const isValid = await this.verifyRefreshToken(payload.sub, refreshToken);
    if (!isValid) {
      throw new UnauthorizedException("Refresh token revoked");
    }

    const user = await this.usersService.findById(payload.sub);
    return this.generateTokens(user);
  }

  async revokeAllTokens(userId: string): Promise<void> {
    await this.tokenStore.delete(`refresh:${userId}`);
  }
}
```

### JWT Strategy

```typescript
// jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get("JWT_SECRET"),
      issuer: "deepdive-engine",
      audience: "deepdive-users",
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException("User not found or inactive");
    }

    // Check if token was issued before password change
    if (
      user.passwordChangedAt &&
      payload.iat < user.passwordChangedAt.getTime() / 1000
    ) {
      throw new UnauthorizedException("Password changed, please re-login");
    }

    return user;
  }
}
```

## Authorization (RBAC)

```typescript
// Role-based access control
enum Role {
  ADMIN = "admin",
  MODERATOR = "moderator",
  USER = "user",
  GUEST = "guest",
}

enum Permission {
  // Resources
  RESOURCE_READ = "resource:read",
  RESOURCE_CREATE = "resource:create",
  RESOURCE_UPDATE = "resource:update",
  RESOURCE_DELETE = "resource:delete",

  // AI Features
  AI_CHAT = "ai:chat",
  AI_TEAMS = "ai:teams",
  AI_OFFICE = "ai:office",

  // Admin
  ADMIN_USERS = "admin:users",
  ADMIN_SETTINGS = "admin:settings",
}

// Role permissions mapping
const rolePermissions: Record<Role, Permission[]> = {
  [Role.ADMIN]: Object.values(Permission),
  [Role.MODERATOR]: [
    Permission.RESOURCE_READ,
    Permission.RESOURCE_CREATE,
    Permission.RESOURCE_UPDATE,
    Permission.AI_CHAT,
    Permission.AI_TEAMS,
  ],
  [Role.USER]: [
    Permission.RESOURCE_READ,
    Permission.RESOURCE_CREATE,
    Permission.AI_CHAT,
  ],
  [Role.GUEST]: [Permission.RESOURCE_READ],
};

// Roles guard
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.roles?.includes(role));
  }
}

// Usage
@Controller("admin")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  @Get("users")
  @Roles(Role.ADMIN)
  getUsers() {
    return this.usersService.findAll();
  }
}
```

## Input Validation & Sanitization

```typescript
// DTOs with validation
class CreateResourceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Transform(({ value }) => sanitizeHtml(value))
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  @Transform(({ value }) => sanitizeHtml(value))
  description?: string;

  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  url: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(10)
  tags: string[];
}

// Global validation pipe
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // Strip unknown properties
    forbidNonWhitelisted: true, // Throw on unknown properties
    transform: true, // Transform to DTO types
    transformOptions: {
      enableImplicitConversion: true,
    },
  }),
);

// SQL injection prevention (Prisma handles this)
// Always use parameterized queries
const user = await this.prisma.user.findFirst({
  where: { email: email }, // Parameterized, safe
});

// Never do this:
// const user = await this.prisma.$queryRaw`SELECT * FROM users WHERE email = '${email}'`;
```

## Rate Limiting

```typescript
// throttler.config.ts
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: "short",
        ttl: 1000,
        limit: 10, // 10 requests per second
      },
      {
        name: "medium",
        ttl: 10000,
        limit: 50, // 50 requests per 10 seconds
      },
      {
        name: "long",
        ttl: 60000,
        limit: 200, // 200 requests per minute
      },
    ]),
  ],
})
export class AppModule {}

// Custom rate limit for sensitive endpoints
@Controller("auth")
export class AuthController {
  @Post("login")
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 per minute
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("forgot-password")
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 per 5 minutes
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }
}
```

## Security Headers

```typescript
// Helmet configuration
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://api.openai.com"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-origin" },
    dnsPrefetchControl: true,
    frameguard: { action: "deny" },
    hidePoweredBy: true,
    hsts: { maxAge: 31536000, includeSubDomains: true },
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true,
  }),
);

// CORS configuration
app.enableCors({
  origin: configService.get("CORS_ORIGINS").split(","),
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400, // 24 hours
});
```

## Audit Logging

```typescript
// Audit log interceptor
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    return next.handle().pipe(
      tap({
        next: (data) => {
          this.auditService.log({
            userId: user?.id,
            action: `${request.method} ${request.path}`,
            resource: context.getClass().name,
            ip: request.ip,
            userAgent: request.headers["user-agent"],
            status: "success",
            timestamp: new Date(),
          });
        },
        error: (error) => {
          this.auditService.log({
            userId: user?.id,
            action: `${request.method} ${request.path}`,
            resource: context.getClass().name,
            ip: request.ip,
            userAgent: request.headers["user-agent"],
            status: "error",
            error: error.message,
            timestamp: new Date(),
          });
        },
      }),
    );
  }
}
```

## OWASP Top 10 Checklist

| Vulnerability            | Mitigation                                       |
| ------------------------ | ------------------------------------------------ |
| Injection                | Parameterized queries, input validation          |
| Broken Auth              | JWT with refresh tokens, secure password hashing |
| Sensitive Data Exposure  | HTTPS, encryption at rest, secure headers        |
| XXE                      | Disable external entities in XML parsers         |
| Broken Access Control    | RBAC, guards, ownership validation               |
| Security Misconfig       | Secure defaults, remove debug modes              |
| XSS                      | Input sanitization, CSP headers                  |
| Insecure Deserialization | Type validation, schema validation               |
| Known Vulnerabilities    | Regular dependency updates, audits               |
| Insufficient Logging     | Audit logs, error tracking                       |

## Your Responsibilities

1. Implement secure authentication flows
2. Design and enforce authorization policies
3. Configure rate limiting and throttling
4. Set up security headers and CORS
5. Validate and sanitize all inputs
6. Implement audit logging
7. Conduct security reviews and audits
8. Keep dependencies updated and secure
