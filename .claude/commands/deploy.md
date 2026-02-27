# Deploy

部署和运维操作。

**操作**: $ARGUMENTS

## 部署平台

- **Backend**: Railway (NestJS)
- **Frontend**: Vercel (Next.js)
- **Database**: Railway PostgreSQL 16 (统一数据库)

## Railway 常用命令

```bash
# 登录
railway login

# 链接项目
railway link

# 查看日志
railway logs --tail 100
railway logs --follow
railway logs --filter error

# 查看环境变量
railway variables

# 部署
railway up
```

## 部署检查清单

### 前置检查

- [ ] 所有测试通过: `npm run verify:full`
- [ ] 类型检查通过: `npm run type-check`
- [ ] 无敏感信息提交
- [ ] 环境变量已配置
- [ ] 数据库迁移已执行

### 部署后验证

- [ ] API 健康检查正常
- [ ] 关键功能可用
- [ ] 日志无异常错误
- [ ] 性能指标正常

## 环境配置

### Backend 必需变量

```env
DATABASE_URL=postgresql://...
MONGODB_URI=mongodb://...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
NEXTAUTH_SECRET=...
```

### Frontend 必需变量

```env
NEXT_PUBLIC_API_URL=https://api.example.com
NEXTAUTH_URL=https://app.example.com
```

## 回滚操作

```bash
# 查看部署历史
railway deployments

# 回滚到指定版本
railway rollback <deployment-id>
```

## 监控

```bash
# 实时日志
railway logs --follow

# 过滤错误
railway logs --filter error --since 1h

# 查看资源使用
railway status
```

## 故障排查

### 常见问题

1. **部署失败**
   - 检查构建日志
   - 验证依赖版本
   - 检查环境变量

2. **启动失败**
   - 检查数据库连接
   - 验证端口配置
   - 检查健康检查路径

3. **性能问题**
   - 检查数据库查询
   - 查看内存使用
   - 分析请求延迟

## 我会帮助你

- 执行部署操作
- 排查部署问题
- 配置环境变量
- 监控运行状态
