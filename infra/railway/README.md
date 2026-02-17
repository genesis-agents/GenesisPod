# Railway Deployment Guide

## Overview

Genesis.ai 部署到 Railway 的完整指南。

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    Railway Project                   │
├─────────────┬─────────────┬─────────────┬───────────┤
│  Frontend   │   Backend   │  PostgreSQL │   Redis   │
│  (Next.js)  │  (NestJS)   │  (Database) │  (Cache)  │
│   :3000     │   :4000     │   :5432     │   :6379   │
└─────────────┴─────────────┴─────────────┴───────────┘
```

## 快速部署步骤

### 1. 安装 Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### 2. 创建项目

```bash
railway init
# 选择 "Empty Project"
```

### 3. 添加数据库服务

```bash
# 在 Railway Dashboard 中:
# 1. 点击 "New" -> "Database" -> "PostgreSQL"
# 2. 点击 "New" -> "Database" -> "Redis"
```

### 4. 部署 Backend

```bash
cd backend
railway link  # 选择你的项目
railway up
```

### 5. 部署 Frontend

```bash
cd frontend
railway link
railway up
```

### 6. 配置环境变量

在 Railway Dashboard 中为每个服务配置环境变量。

## 环境变量配置

### Backend Service

```env
# Database (Railway 自动注入)
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis (Railway 自动注入)
REDIS_URL=${{Redis.REDIS_URL}}

# App Config
NODE_ENV=production
PORT=4000

# JWT
JWT_SECRET=your-super-secret-jwt-key

# External APIs
OPENAI_API_KEY=your-openai-key
```

### Frontend Service

```env
NODE_ENV=production
NEXT_PUBLIC_API_URL=${{Backend.RAILWAY_PUBLIC_DOMAIN}}/api
```

## 费用估算

| 服务       | 预估费用/月 |
| ---------- | ----------- |
| Frontend   | ~$2-5       |
| Backend    | ~$3-8       |
| PostgreSQL | ~$5         |
| Redis      | ~$3         |
| **总计**   | **~$13-21** |

免费额度: $5/月 (Hobby plan trial)

## 自动部署

Railway 会自动监听 GitHub 仓库的 push 事件并部署。

配置分支:

- `main` -> Production
- `develop` -> Staging (可选)

## 常用命令

```bash
# 查看日志
railway logs

# 查看服务状态
railway status

# 打开 Dashboard
railway open

# 运行远程命令
railway run npm run db:migrate
```

## 故障排除

### 构建失败

```bash
# 查看构建日志
railway logs --build
```

### 数据库连接问题

确保 DATABASE_URL 环境变量正确引用:

```
${{Postgres.DATABASE_URL}}
```

### 内存不足

在 Railway Dashboard 中增加服务的资源限制。
