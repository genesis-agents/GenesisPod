# 数据库迁移技能 (Database Migration Skill)

> 本文档记录 DeepDive Engine 项目的数据库迁移系统使用方法和最佳实践。

---

## 快速参考

### 常用命令

| 命令                     | 用途               | 环境     |
| ------------------------ | ------------------ | -------- |
| `npm run db:migrate`     | 创建并应用迁移     | 本地开发 |
| `npm run deploy:migrate` | 仅部署迁移         | 生产环境 |
| `npm run prisma:studio`  | 打开数据库管理界面 | 本地开发 |
| `npm run diagnose`       | 诊断数据库连接     | 任意     |

### 迁移文件位置

```
backend/prisma/
├── schema.prisma          # Schema 定义 (单一真实来源)
├── migrations/            # 迁移文件目录
│   └── YYYYMMDD_name/
│       └── migration.sql
├── deploy-migrations.ts   # 生产部署脚本
├── diagnose-db.ts        # 诊断脚本
└── seed.ts               # 种子数据
```

---

## 创建新迁移的两种方式

### 方式一：标准流程（推荐，需要 DATABASE_URL）

```bash
# 1. 修改 schema.prisma
# 2. 生成迁移
cd backend
npx prisma migrate dev --name add_new_table

# 3. 验证生成的 SQL
cat prisma/migrations/<timestamp>_add_new_table/migration.sql

# 4. 提交
git add prisma/
git commit -m "feat(db): add new table"
```

### 方式二：手动创建（无 DATABASE_URL 时）

当本地没有 DATABASE_URL 环境变量时，可以手动创建迁移：

```bash
# 1. 创建迁移目录
mkdir backend/prisma/migrations/YYYYMMDD_description

# 2. 创建 migration.sql 文件
# 注意：SQL 必须是幂等的（使用 IF NOT EXISTS）
```

**手动迁移 SQL 模板**：

```sql
-- 创建枚举（如果不存在）
DO $$ BEGIN
    CREATE TYPE "MyEnumType" AS ENUM ('VALUE1', 'VALUE2');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 创建表（如果不存在）
CREATE TABLE IF NOT EXISTS "my_table" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "my_table_pkey" PRIMARY KEY ("id")
);

-- 创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS "my_table_name_idx" ON "my_table"("name");

-- 添加外键约束
ALTER TABLE "my_table"
ADD CONSTRAINT "my_table_parent_id_fkey"
FOREIGN KEY ("parent_id") REFERENCES "parent_table"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
```

---

## 迁移命名规范

### 允许的前缀

| 前缀      | 用途             | 示例                                   |
| --------- | ---------------- | -------------------------------------- |
| `add_`    | 添加新表/列      | `20260109_add_expression_memory_table` |
| `update_` | 修改现有结构     | `20260109_update_user_preferences`     |
| `remove_` | 删除过期项目     | `20260109_remove_legacy_columns`       |
| `fix_`    | 修复 schema 问题 | `20260109_fix_foreign_key`             |
| `seed_`   | 数据填充         | `20260109_seed_initial_data`           |

### 禁止的前缀

- ❌ `force_` - 表示绕过正常工作流
- ❌ `emergency_` - 表示紧急修复
- ❌ `hotfix_` - 使用 `fix_` 代替

---

## Schema 到 SQL 的映射

### Prisma 类型到 PostgreSQL 类型

| Prisma 类型             | PostgreSQL 类型 | 示例                                    |
| ----------------------- | --------------- | --------------------------------------- |
| `String`                | `TEXT`          | `"id" TEXT NOT NULL`                    |
| `String @db.VarChar(n)` | `VARCHAR(n)`    | `"name" VARCHAR(100)`                   |
| `Int`                   | `INTEGER`       | `"count" INTEGER`                       |
| `Boolean`               | `BOOLEAN`       | `"active" BOOLEAN DEFAULT false`        |
| `DateTime`              | `TIMESTAMP(3)`  | `"created_at" TIMESTAMP(3)`             |
| `Json`                  | `JSONB`         | `"data" JSONB`                          |
| `String[]`              | `TEXT[]`        | `"tags" TEXT[] DEFAULT ARRAY[]::TEXT[]` |

### 字段映射示例

```prisma
// Prisma Schema
model Example {
  id        String   @id @default(uuid())
  projectId String   @map("project_id")
  name      String   @db.VarChar(100)
  count     Int      @default(0)
  isActive  Boolean  @default(false) @map("is_active")
  data      Json?
  tags      String[] @default([])
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([projectId])
  @@map("examples")
}
```

```sql
-- 对应的 SQL
CREATE TABLE IF NOT EXISTS "examples" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "examples_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "examples_project_id_idx" ON "examples"("project_id");
```

---

## 生产环境部署流程

### Railway 部署

Railway 使用 `railway.toml` 配置，启动时自动执行：

```
1. npm run diagnose    # 诊断数据库连接
2. npm run deploy      # 执行迁移 + 种子数据
3. npm run start:prod  # 启动服务器
```

### deploy-migrations.ts 执行流程

```typescript
// 1. 检查失败的迁移
SELECT migration_name FROM "_prisma_migrations"
WHERE finished_at IS NULL AND rolled_back_at IS NULL

// 2. 解决失败的迁移
npx prisma migrate resolve --rolled-back "<migration_name>"

// 3. 部署迁移
npx prisma migrate deploy

// 4. 重新生成 Prisma Client
npx prisma generate

// 5. 验证关键表存在
```

---

## 故障排除

### 问题：Table does not exist

**原因**：Schema 中定义了模型，但迁移未创建/未执行

**解决方案**：

1. 检查是否有对应的迁移文件
2. 如没有，创建迁移（标准或手动方式）
3. 推送代码，等待 CI/CD 部署

### 问题：迁移失败

**解决方案**：

1. 查看 Railway 日志了解错误
2. **不要**添加紧急修复脚本
3. 修复 schema.prisma 并创建正确的迁移
4. 如需要，使用 Prisma Studio 手动修复数据

### 问题：类型不匹配

**原因**：外键类型与主键类型不一致

**解决方案**：

- 始终使用 `String @id @default(uuid())` 作为主键（生成 TEXT）
- 确保外键字段也是 `String` 类型

---

## 检查清单

### 创建迁移前

- [ ] Schema 修改是否正确？
- [ ] 是否使用了正确的命名前缀？
- [ ] 新表是否有 `created_at` 和 `updated_at`？
- [ ] 外键关系是否正确？

### 创建迁移后

- [ ] SQL 是否幂等（IF NOT EXISTS）？
- [ ] 索引名称是否有描述性？
- [ ] 是否有破坏性操作（DROP without backup）？
- [ ] 本地测试是否通过？

### 提交前

- [ ] `npm run type-check` 通过？
- [ ] `npm run test:quick` 通过？
- [ ] 迁移文件已添加到 git？

---

## 常见模式

### 添加新表（带外键）

```sql
-- 1. 创建枚举（如需要）
DO $$ BEGIN
    CREATE TYPE "StatusType" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. 创建表
CREATE TABLE IF NOT EXISTS "my_new_table" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "status" "StatusType" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "my_new_table_pkey" PRIMARY KEY ("id")
);

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS "my_new_table_project_id_idx"
ON "my_new_table"("project_id");

-- 4. 添加外键
ALTER TABLE "my_new_table"
ADD CONSTRAINT "my_new_table_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "writing_projects"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
```

### 添加列到现有表

```sql
-- 添加可空列
ALTER TABLE "existing_table"
ADD COLUMN IF NOT EXISTS "new_column" VARCHAR(100);

-- 添加带默认值的非空列
ALTER TABLE "existing_table"
ADD COLUMN IF NOT EXISTS "new_count" INTEGER NOT NULL DEFAULT 0;
```

### 创建唯一约束

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "my_table_field1_field2_key"
ON "my_table"("field1", "field2");
```

---

## 参考文档

- [Prisma Migrate 官方文档](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [项目迁移工作流文档](../../../../docs/architecture/migration-workflow.md)
- [数据库迁移重构方案](../../../../docs/architecture/database-migration-refactor-plan.md)

---

**最后更新**: 2025-01-15
**维护者**: Claude Code
