# 🚀 DeepDive Engine - 访问指南

## 📍 访问地址

### 🎨 前端界面（用户界面）

```
http://localhost:3000
```

**状态**: ✅ 正在运行
**框架**: Next.js 14
**功能**: 浏览内容、查看Feed、搜索资源

---

### 🔧 后端API（开发者接口）

```
http://localhost:4000
```

**状态**: ✅ 正在运行
**框架**: NestJS
**基础路径**: `/api/v1`

---

## 🎯 推荐体验路径

### 1️⃣ 首页浏览（必看）

访问前端主页查看已采集的内容：

```
👉 http://localhost:3000
```

**你将看到**：

- ✅ 64条精选内容（论文、项目、新闻）
- ✅ 实时数据流（arXiv论文、GitHub项目、HackerNews热门）
- ✅ 智能分类和标签

---

### 2️⃣ 测试数据采集（展示修复成果）

#### 采集arXiv最新论文

```bash
curl -X POST http://localhost:4000/api/v1/crawler/arxiv/latest \
  -H "Content-Type: application/json" \
  -d '{"maxResults": 5}'
```

#### 采集GitHub趋势项目

```bash
curl -X POST "http://localhost:4000/api/v1/crawler/github/trending?language=typescript&since=daily"
```

#### 采集HackerNews热门

```bash
curl -X POST "http://localhost:4000/api/v1/crawler/hackernews/top?max=10"
```

---

### 3️⃣ 查看API数据

#### 获取所有资源列表

```bash
curl http://localhost:4000/api/v1/resources
```

#### 搜索资源

```bash
curl "http://localhost:4000/api/v1/feed/search?q=AI&limit=10"
```

#### 获取Feed

```bash
curl "http://localhost:4000/api/v1/feed?limit=20"
```

#### 查看统计信息

```bash
curl http://localhost:4000/api/v1/resources/stats/summary
```

---

## 📚 主要功能展示

### ✅ 已验证功能

#### 1. 数据采集

- **arXiv论文采集**: 完整字段（title, authors, categories, pdfUrl）
- **GitHub项目采集**: 完整字段（readme, languages, contributors）
- **HackerNews新闻**: 完整字段（score, descendants, comments）

#### 2. 数据完整性

- **MongoDB**: 64条原始数据，100%有resourceId
- **PostgreSQL**: 64条结构化数据，100%有rawDataId
- **双向引用**: 完全建立

#### 3. 数据质量

- **去重**: 0条重复数据
- **有效性**: 100%数据完整
- **引用完整性**: 100%

---

## 🔍 完整API端点列表

### 健康检查

```bash
GET  http://localhost:4000/api/v1/health
```

### 数据采集 (Crawler)

```bash
POST http://localhost:4000/api/v1/crawler/arxiv/latest
POST http://localhost:4000/api/v1/crawler/arxiv/search
POST http://localhost:4000/api/v1/crawler/github/trending
POST http://localhost:4000/api/v1/crawler/github/search
POST http://localhost:4000/api/v1/crawler/hackernews/top
POST http://localhost:4000/api/v1/crawler/hackernews/new
POST http://localhost:4000/api/v1/crawler/hackernews/best
POST http://localhost:4000/api/v1/crawler/fetch-all
```

### 资源管理 (Resources)

```bash
GET    http://localhost:4000/api/v1/resources
GET    http://localhost:4000/api/v1/resources/:id
POST   http://localhost:4000/api/v1/resources
PATCH  http://localhost:4000/api/v1/resources/:id
DELETE http://localhost:4000/api/v1/resources/:id
POST   http://localhost:4000/api/v1/resources/:id/enrich
GET    http://localhost:4000/api/v1/resources/stats/summary
```

### Feed流 (Feed)

```bash
GET http://localhost:4000/api/v1/feed
GET http://localhost:4000/api/v1/feed/search
GET http://localhost:4000/api/v1/feed/trending
GET http://localhost:4000/api/v1/feed/related/:id
```

### 知识图谱 (Knowledge Graph)

```bash
POST http://localhost:4000/api/v1/knowledge-graph/build/:id
POST http://localhost:4000/api/v1/knowledge-graph/build-all
GET  http://localhost:4000/api/v1/knowledge-graph/resource/:id
GET  http://localhost:4000/api/v1/knowledge-graph/overview
```

### 推荐系统 (Recommendations)

```bash
GET http://localhost:4000/api/v1/recommendations/personalized
GET http://localhost:4000/api/v1/recommendations/content/:id
GET http://localhost:4000/api/v1/recommendations/cold-start
GET http://localhost:4000/api/v1/recommendations/explore
```

---

## 💡 体验建议

### 🎬 场景1: 快速浏览内容

1. 访问 `http://localhost:3000`
2. 浏览首页的论文、项目、新闻
3. 点击卡片查看详情

### 🔬 场景2: 测试数据采集（验证修复）

1. 打开终端
2. 运行采集命令（见上方示例）
3. 刷新前端页面查看新内容
4. 观察MongoDB和PostgreSQL数据变化

### 📊 场景3: API开发者体验

1. 使用Postman或curl测试API
2. 查看JSON响应格式
3. 验证数据完整性

---

## 🗄️ 数据库访问

### MongoDB（原始数据）

```bash
# 连接MongoDB
docker exec -it deepdive-mongo mongosh -u deepdive -p mongo_dev_password --authenticationDatabase admin deepdive

# 查看集合
show collections

# 查看数据
db.data_collection_raw_data.find().limit(5)
```

### PostgreSQL（结构化数据）

```bash
# 连接PostgreSQL
docker exec -it deepdive-postgres psql -U deepdive -d deepdive

# 查看表
\dt

# 查看数据
SELECT * FROM resources LIMIT 10;
```

### Neo4j（知识图谱）

浏览器访问: `http://localhost:7474`

- 用户名: `neo4j`
- 密码: `neo4j_dev_password`

---

## 🔑 当前数据概览

### 已采集数据

```
总计: 64条

├─ 论文 (PAPER): 10条
│  └─ 来源: arXiv
│  └─ 完整字段: title, authors, categories, pdfUrl
│
├─ 项目 (PROJECT): 16条
│  └─ 来源: GitHub
│  └─ 完整字段: readme, languages, contributors
│
└─ 新闻 (NEWS): 38条
   └─ 来源: HackerNews
   └─ 完整字段: score, descendants, comments
```

### 数据质量

- ✅ 完整性: 100% (64/64)
- ✅ 引用完整性: 100%
- ✅ 去重: 无重复
- ✅ 有效性: 所有数据字段完整

---

## 📝 使用提示

### 性能优化

- 首次加载可能需要几秒（Next.js编译）
- API响应时间通常 < 100ms
- 数据采集需要3-5秒（取决于外部API）

### 已知限制

- ⚠️ GitHub Token未配置（API限流60次/小时）
- ⚠️ AI功能需要配置API密钥（Grok/OpenAI）
- ℹ️ 前端某些高级功能还在开发中

### 故障排查

如果遇到问题：

1. 检查所有Docker容器是否运行: `docker-compose ps`
2. 检查后端日志: 查看终端输出
3. 检查前端日志: 浏览器控制台
4. 重启服务: `Ctrl+C` 然后重新启动

---

## 🎯 验证清单

使用以下命令验证系统正常运行：

```bash
# 1. 健康检查
curl http://localhost:4000/api/v1/health

# 2. 获取资源数量
curl http://localhost:4000/api/v1/resources/stats/summary

# 3. 测试采集（应返回success:true）
curl -X POST http://localhost:4000/api/v1/crawler/hackernews/top?max=3

# 4. 访问前端
curl -s http://localhost:3000 | head -10
```

---

## 📞 获取帮助

- **项目文档**: 查看 `PRD.md`, `architecture.md`
- **验证报告**: 查看 `VERIFICATION_REPORT.md`
- **技术规范**: 查看 `project-rules.md`

---

**祝您体验愉快！** 🎉
