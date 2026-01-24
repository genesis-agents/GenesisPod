---
paths:
  - "backend/src/**"
  - "frontend/src/**"
---

# 安全规则

## 输入验证

```typescript
// 所有外部输入必须验证
@Post()
async create(@Body() dto: CreateUserDto) {
  // class-validator 自动验证
}

// DTO 必须使用验证装饰器
class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsEmail()
  email: string;
}
```

## SQL 注入防护

```typescript
// 正确：使用 Prisma ORM
const user = await prisma.user.findFirst({
  where: { email },
});

// 禁止：字符串拼接
// const query = `SELECT * FROM users WHERE email = '${email}'`;
```

## XSS 防护

```typescript
// React 默认转义，但要注意：
// 禁止使用 dangerouslySetInnerHTML
// 如必须使用，必须先 sanitize
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(userInput);
```

## 敏感数据

- 禁止硬编码密钥、密码、Token
- 使用环境变量或 Secrets Manager
- 日志中禁止打印敏感信息
- API 响应中禁止返回密码等敏感字段

## 认证授权

```typescript
// 所有 API 必须有认证
@UseGuards(JwtAuthGuard)
@Controller('api/users')
export class UserController {}

// 敏感操作需要额外授权
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Delete(':id')
async delete(@Param('id') id: string) {}
```
