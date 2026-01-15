# DeepDive Engine - 项目规则与开发规范

> **版本**: v2.1
> **更新日期**: 2025-11-15
> **适用范围**: 所有开发人员和AI助手
> **最新变更**: 添加文件名小写强制规范

---

## ⚠️ 重要：规范体系升级

本项目已采用系统化的开发规范体系，详细规范文档位于 `.claude/standards/` 目录。

### 📚 快速导航

| 文档          | 描述                       | 链接                                                                                       |
| ------------- | -------------------------- | ------------------------------------------------------------------------------------------ |
| **总览**      | 规范体系架构和使用指南     | [.claude/standards/00-overview.md](.claude/standards/00-overview.md)                       |
| **目录结构**  | Monorepo 项目组织规范      | [.claude/standards/02-directory-structure.md](.claude/standards/02-directory-structure.md) |
| **Git工作流** | 分支策略、提交规范、PR流程 | [.claude/standards/08-git-workflow.md](.claude/standards/08-git-workflow.md)               |
| **快速参考**  | 常用命令和检查清单         | [.claude/standards/99-quick-reference.md](.claude/standards/99-quick-reference.md)         |

### 🚀 新开发者快速上手

```bash
# 1. 阅读规范总览
cat .claude/standards/00-overview.md

# 2. 查看快速参考
cat .claude/standards/99-quick-reference.md

# 3. 开始开发
git checkout -b feature/001-your-feature
```

**推荐阅读顺序：**

1. [00-overview.md](.claude/standards/00-overview.md) - 了解整体规范体系
2. [99-quick-reference.md](.claude/standards/99-quick-reference.md) - 快速参考手册
3. [08-git-workflow.md](.claude/standards/08-git-workflow.md) - Git工作流
4. [02-directory-structure.md](.claude/standards/02-directory-structure.md) - 项目结构

---

## 📖 本文档说明

本文档（project-rules.md）包含项目的详细开发规范和最佳实践。

对于日常开发，建议优先查阅 `.claude/standards/` 目录下的规范文档，它们更加系统化和易于查找。本文档作为补充参考和历史记录保留。

---

## 1. 文件与目录命名规范 ⚠️

### 1.1 核心原则

**所有文件名和目录名必须使用小写字母**

这是项目的强制规范，适用于所有文件类型（除了极少数例外）。

### 1.2 命名规则详解

#### 文档文件（.md）

```bash
✅ 正确示例
docs/readme.md
docs/architecture/overview.md
docs/api/readme.md
docs/guides/deployment-guide.md
docs/features/ai-office/product-spec.md

❌ 错误示例
docs/readme.md                    # 不使用大写
docs/Architecture/Overview.md     # 目录和文件都不应大写
docs/API/README.MD                # 扩展名也应小写
docs/guides/Deployment_Guide.md   # 不使用下划线，使用连字符
docs/features/AI Office/产品.md   # 避免空格和中文文件名
```

#### TypeScript/JavaScript 文件

```bash
✅ 正确示例
# 组件文件：PascalCase（唯一例外）
components/UserProfile.tsx
components/ResourceCard.tsx

# 工具函数：kebab-case
utils/api-client.ts
lib/date-utils.ts
services/auth-service.ts

# 配置文件：kebab-case
config/database-config.ts
config/redis-config.ts

❌ 错误示例
utils/API_Client.ts               # 不使用大写和下划线
lib/dateUtils.ts                  # 使用kebab-case而非camelCase
services/AuthService.ts           # 非组件文件不使用PascalCase
```

#### 目录命名

```bash
✅ 正确示例
docs/
docs/architecture/
docs/features/ai-office/
backend/src/modules/
frontend/components/

❌ 错误示例
docs/Architecture/                # 不使用大写
docs/features/AI_Office/          # 不使用下划线
backend/src/Modules/              # 不使用大写
```

#### Python 文件

```bash
✅ 正确示例
services/grok_client.py
utils/embedding_utils.py
config/settings.py

❌ 错误示例
services/GrokClient.py            # 使用snake_case
utils/EmbeddingUtils.py           # 使用snake_case
```

### 1.3 例外情况

**仅以下文件允许使用大写：**

1. `readme.md` - 项目根目录（约定俗成）
2. `LICENSE` - 许可证文件
3. `CHANGELOG.md` - 变更日志
4. `CONTRIBUTING.md` - 贡献指南
5. React组件文件（`.tsx`）

**重要**：即使是例外情况，在 `docs/` 目录下也建议全部使用小写以保持一致性。

### 1.4 迁移指南

如果发现不符合规范的文件名：

```bash
# 1. 重命名文件
mv docs/readme.md docs/readme.md
mv docs/Architecture/Overview.md docs/architecture/overview.md

# 2. 更新所有引用该文件的链接
# 使用IDE全局搜索替换或手动更新

# 3. Git提交
git add -A
git commit -m "refactor: rename files to lowercase for consistency"
```

### 1.5 检查命令

```bash
# 检查docs目录是否有大写文件
find docs -name "*.md" | grep -E "[A-Z]"

# 如果有输出，说明存在需要修复的文件
```

---

## 2. 项目结构规范

### 1.1 根目录结构

```
deepdive-engine/
├── docs/                    # 文档目录
│   ├── prd.md              # 产品需求文档
│   ├── architecture.md     # 技术架构文档
│   └── API.md              # API文档
│
├── frontend/               # 前端应用
│   ├── app/               # Next.js App Router
│   ├── components/        # React组件
│   ├── lib/               # 工具函数
│   ├── styles/            # 样式文件
│   ├── public/            # 静态资源
│   ├── package.json
│   └── tsconfig.json
│
├── backend/                # 后端应用
│   ├── src/
│   │   ├── modules/       # 功能模块
│   │   ├── common/        # 共享代码
│   │   ├── config/        # 配置
│   │   └── main.ts        # 入口文件
│   ├── prisma/            # Prisma ORM
│   ├── test/              # 测试文件
│   ├── package.json
│   └── tsconfig.json
│
├── ai-service/             # AI服务（Python）
│   ├── services/
│   │   ├── grok_client.py
│   │   ├── openai_client.py
│   │   └── embedding.py
│   ├── config/
│   ├── requirements.txt
│   └── main.py
│
├── crawler/                # 数据采集服务
│   ├── src/
│   │   ├── crawlers/
│   │   │   ├── arxiv.ts
│   │   │   ├── github.ts
│   │   │   └── hackernews.ts
│   │   └── utils/
│   └── package.json
│
├── scripts/                # 脚本工具
│   ├── setup-db.sh
│   ├── seed-data.sh
│   └── deploy.sh
│
├── .env.example            # 环境变量示例
├── .gitignore
├── docker-compose.yml      # 本地开发环境
├── readme.md
├── project-rules.md        # 本文档
└── package.json            # Monorepo配置
```

---

## 2. 代码规范

### 2.1 TypeScript/JavaScript规范

#### 命名规范

```typescript
// ✅ 好的命名
// 组件：PascalCase
export const UserProfile: React.FC = () => {};

// 函数：camelCase，动词开头
export function getUserById(id: string) {}
export async function fetchRecommendations() {}

// 常量：UPPER_SNAKE_CASE
export const API_BASE_URL = 'https://api.example.com';
export const MAX_RETRIES = 3;

// 接口/类型：PascalCase
export interface User {
  id: string;
  email: string;
}

export type ResourceType = 'paper' | 'project' | 'news';

// 文件名
// 组件文件：PascalCase
UserProfile.tsx
ResourceCard.tsx

// 工具函数文件：kebab-case
user-utils.ts
api-client.ts

// 文档文件：全部小写 + kebab-case
// ✅ 好的文档命名
architecture/overview.md
api/readme.md
guides/deployment-guide.md
features/ai-office/product-spec.md

// ❌ 避免的文档命名
Architecture/Overview.md        // 目录不应大写
api/readme.md                   // 文件名不应大写
guides/Deployment_Guide.md      // 不使用下划线或大写
features/AI Office/产品方案.md  // 避免空格和中文文件名

// ❌ 避免的命名
const data = {};  // 太模糊
function do() {}  // 保留字
const temp = 1;   // 无意义
```

#### 函数规范

```typescript
// ✅ 好的函数设计

// 1. 单一职责
async function fetchUserById(id: string): Promise<User> {
  const response = await apiClient.get(`/users/${id}`);
  return response.data;
}

// 2. 参数不超过3个，超过使用对象
// ❌ 不好
function createResource(title, content, author, type, tags, url) {}

// ✅ 好
interface CreateResourceParams {
  title: string;
  content: string;
  author: string;
  type: ResourceType;
  tags: string[];
  url: string;
}

function createResource(params: CreateResourceParams) {}

// 3. 使用类型注解
// ❌ 不好
function process(data) {
  return data.map((item) => item.value);
}

// ✅ 好
function process(data: Array<{ value: number }>): number[] {
  return data.map((item) => item.value);
}

// 4. 错误处理
// ❌ 不好
async function fetchData() {
  return await api.get("/data");
}

// ✅ 好
async function fetchData(): Promise<Data> {
  try {
    const response = await api.get("/data");
    return response.data;
  } catch (error) {
    logger.error("Failed to fetch data", error);
    throw new ApiError("Data fetch failed", error);
  }
}
```

#### 组件规范（React）

```tsx
// ✅ 好的组件设计

// 1. 使用函数组件 + TypeScript
interface ResourceCardProps {
  resource: Resource;
  onSave?: (id: string) => void;
  className?: string;
}

export const ResourceCard: React.FC<ResourceCardProps> = ({
  resource,
  onSave,
  className,
}) => {
  // 2. 逻辑与UI分离
  const { title, abstract, aiSummary } = resource;
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = useCallback(() => {
    setIsSaved(true);
    onSave?.(resource.id);
  }, [resource.id, onSave]);

  // 3. 提取复杂逻辑到自定义Hook
  const { recommendations } = useRecommendations(resource.id);

  return (
    <div className={cn("resource-card", className)}>
      <h3>{title}</h3>
      <p>{aiSummary}</p>
      <button onClick={handleSave}>{isSaved ? "Saved" : "Save"}</button>
    </div>
  );
};

// 4. 导出组件的同时导出类型
export type { ResourceCardProps };
```

---

### 2.2 Python规范（AI服务）

```python
# PEP 8 标准

# 1. 命名
# 函数/变量：snake_case
def generate_summary(content: str) -> str:
    pass

# 类：PascalCase
class GrokClient:
    pass

# 常量：UPPER_SNAKE_CASE
MAX_TOKENS = 1000
API_TIMEOUT = 30

# 2. 类型注解
from typing import List, Dict, Optional

def process_papers(
    papers: List[Dict[str, str]],
    use_grok: bool = True
) -> List[Dict[str, str]]:
    """
    处理论文数据，生成AI摘要

    Args:
        papers: 论文数据列表
        use_grok: 是否使用Grok（默认True，失败时fallback到OpenAI）

    Returns:
        处理后的论文数据（包含AI摘要）
    """
    pass

# 3. 错误处理
try:
    summary = grok_client.generate_summary(text)
except GrokAPIError as e:
    logger.warning(f"Grok API failed, falling back to OpenAI: {e}")
    summary = openai_client.generate_summary(text)
except Exception as e:
    logger.error(f"Unexpected error: {e}")
    raise

# 4. 文档字符串
def calculate_similarity(vec1: List[float], vec2: List[float]) -> float:
    """
    计算两个向量的余弦相似度

    Args:
        vec1: 第一个向量
        vec2: 第二个向量

    Returns:
        相似度分数 (0-1)

    Raises:
        ValueError: 如果向量维度不匹配
    """
    pass
```

---

## 3. Git工作流

### 3.1 分支策略

```
main (生产环境)
├── develop (开发主分支)
│   ├── feature/user-auth
│   ├── feature/knowledge-graph
│   └── feature/ai-summary
├── hotfix/fix-login-bug
```

**分支命名规范**:

- `feature/*` - 新功能
- `bugfix/*` - Bug修复
- `hotfix/*` - 紧急修复
- `refactor/*` - 重构
- `docs/*` - 文档更新

### 3.2 Commit规范

**格式**: `<type>(<scope>): <subject>`

**Type类型**:

- `feat`: 新功能
- `fix`: Bug修复
- `docs`: 文档
- `style`: 格式（不影响代码运行）
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

**示例**:

```bash
git commit -m "feat(auth): add JWT authentication"
git commit -m "fix(crawler): handle arXiv API timeout"
git commit -m "docs(readme): update setup instructions"
git commit -m "refactor(kg): optimize graph traversal algorithm"
```

### 3.3 Pull Request规范

**PR标题**: 同Commit规范

**PR描述模板**:

```markdown
## 变更内容

简要描述这个PR做了什么

## 变更类型

- [ ] 新功能
- [ ] Bug修复
- [ ] 重构
- [ ] 文档更新

## 测试

描述如何测试这个变更

## 截图（如适用）

添加截图

## Checklist

- [ ] 代码遵循项目规范
- [ ] 添加了必要的测试
- [ ] 更新了相关文档
- [ ] 通过了所有测试
```

---

## 4. AI服务使用规范

### 4.1 AI提供商优先级

```
1. Grok (首选)
   ├─ 速度快，成本低
   ├─ 用于：摘要生成、概念抽取、日常任务
   └─ Fallback: OpenAI

2. OpenAI (备用)
   ├─ 质量高，成本高
   ├─ 用于：复杂推理、深度分析、趋势报告
   └─ 仅在Grok失败时使用
```

### 4.2 AI客户端实现规范

```python
# ai-service/services/ai_client.py

from abc import ABC, abstractmethod
from typing import Optional
import logging

logger = logging.getLogger(__name__)

class AIClient(ABC):
    """AI客户端基类"""

    @abstractmethod
    async def generate_summary(self, text: str) -> str:
        pass

    @abstractmethod
    async def extract_concepts(self, text: str) -> list[str]:
        pass

class GrokClient(AIClient):
    """Grok AI客户端（首选）"""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.x.ai/v1"

    async def generate_summary(self, text: str) -> str:
        try:
            response = await self._call_api("summarize", text)
            return response['summary']
        except Exception as e:
            logger.error(f"Grok API error: {e}")
            raise GrokAPIError(str(e))

class OpenAIClient(AIClient):
    """OpenAI客户端（备用）"""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = OpenAI(api_key=api_key)

    async def generate_summary(self, text: str) -> str:
        response = await self.client.chat.completions.create(
            model="gpt-4-turbo",
            messages=[{
                "role": "user",
                "content": f"Summarize in 3 sentences:\n\n{text}"
            }]
        )
        return response.choices[0].message.content

class AIService:
    """AI服务（自动Fallback）"""

    def __init__(self, grok_key: str, openai_key: str):
        self.grok = GrokClient(grok_key)
        self.openai = OpenAIClient(openai_key)
        self.grok_failures = 0
        self.GROK_FAILURE_THRESHOLD = 5

    async def generate_summary(
        self,
        text: str,
        force_openai: bool = False
    ) -> str:
        """
        生成摘要，优先使用Grok

        Args:
            text: 输入文本
            force_openai: 强制使用OpenAI（用于深度分析）
        """
        if force_openai or self.grok_failures >= self.GROK_FAILURE_THRESHOLD:
            logger.info("Using OpenAI for summary generation")
            return await self.openai.generate_summary(text)

        try:
            summary = await self.grok.generate_summary(text)
            self.grok_failures = 0  # 重置失败计数
            return summary
        except GrokAPIError:
            logger.warning("Grok failed, falling back to OpenAI")
            self.grok_failures += 1
            return await self.openai.generate_summary(text)
```

**使用示例**:

```python
# 常规任务：使用Grok
summary = await ai_service.generate_summary(paper.abstract)

# 深度分析：强制使用OpenAI
trend_report = await ai_service.generate_trend_report(
    papers=recent_papers,
    force_openai=True  # 质量优先
)
```

---

## 5. 密钥管理规范

### 5.1 SecretManager配置

**禁止**:

- ❌ 硬编码API密钥
- ❌ 提交`.env`文件到Git
- ❌ 在日志中打印密钥

**必须**:

- ✅ 所有密钥存储在secretManager
- ✅ 使用环境变量注入
- ✅ 提供`.env.example`示例

### 5.2 环境变量规范

**.env.example** (提交到Git):

```bash
# AI服务
GROK_API_KEY=<从secretManager获取>
OPENAI_API_KEY=<从secretManager获取>

# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/deepdive
NEO4J_URL=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<从secretManager获取>

# Redis
REDIS_URL=redis://localhost:6379

# 向量数据库
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=<从secretManager获取>

# 其他
NODE_ENV=development
JWT_SECRET=<从secretManager获取>
```

**实际.env文件** (不提交到Git):

```bash
# 从secretManager获取后填充
GROK_API_KEY=grok-xxx-actual-key
OPENAI_API_KEY=sk-xxx-actual-key
# ...
```

### 5.3 密钥加载代码

```typescript
// backend/src/config/secrets.ts

import * as dotenv from "dotenv";

// 加载环境变量
dotenv.config();

interface Secrets {
  grokApiKey: string;
  openaiApiKey: string;
  jwtSecret: string;
  neo4jPassword: string;
}

function loadSecrets(): Secrets {
  const required = [
    "GROK_API_KEY",
    "OPENAI_API_KEY",
    "JWT_SECRET",
    "NEO4J_PASSWORD",
  ];

  // 验证必需的密钥
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required secret: ${key}`);
    }
  }

  return {
    grokApiKey: process.env.GROK_API_KEY!,
    openaiApiKey: process.env.OPENAI_API_KEY!,
    jwtSecret: process.env.JWT_SECRET!,
    neo4jPassword: process.env.NEO4J_PASSWORD!,
  };
}

export const secrets = loadSecrets();

// ✅ 使用
import { secrets } from "./config/secrets";
const grokClient = new GrokClient(secrets.grokApiKey);

// ❌ 禁止
const apiKey = "sk-xxx-hardcoded"; // 永远不要这样做！
```

---

## 6. 测试规范

### 6.1 测试层级

```
单元测试 (Unit Tests)
├─ 覆盖率目标: 80%+
├─ 工具: Jest, Vitest
└─ 位置: 与源文件同目录，.test.ts结尾

集成测试 (Integration Tests)
├─ API测试
├─ 数据库交互测试
└─ 位置: backend/test/integration/

端到端测试 (E2E Tests)
├─ 用户流程测试
├─ 工具: Playwright
└─ 位置: frontend/e2e/
```

### 6.2 测试示例

```typescript
// backend/src/modules/resources/resources.service.test.ts

import { Test } from "@nestjs/testing";
import { ResourcesService } from "./resources.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("ResourcesService", () => {
  let service: ResourcesService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ResourcesService, PrismaService],
    }).compile();

    service = module.get<ResourcesService>(ResourcesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe("findById", () => {
    it("should return a resource by ID", async () => {
      const mockResource = {
        id: "123",
        title: "Test Paper",
        type: "paper",
      };

      jest.spyOn(prisma.resource, "findUnique").mockResolvedValue(mockResource);

      const result = await service.findById("123");

      expect(result).toEqual(mockResource);
      expect(prisma.resource.findUnique).toHaveBeenCalledWith({
        where: { id: "123" },
      });
    });

    it("should throw error if resource not found", async () => {
      jest.spyOn(prisma.resource, "findUnique").mockResolvedValue(null);

      await expect(service.findById("999")).rejects.toThrow(
        "Resource not found",
      );
    });
  });
});
```

---

## 7. 数据库规范

### 7.1 Prisma Schema规范

```prisma
// backend/prisma/schema.prisma

// 1. 命名：使用单数形式，PascalCase
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  // 关系
  collections Collection[]
  activities  UserActivity[]

  @@map("users")  // 表名使用复数
}

// 2. 字段顺序：id → 核心字段 → 关系字段 → 时间戳
model Resource {
  id          String       @id @default(uuid())
  type        ResourceType
  title       String       @db.VarChar(1000)
  abstract    String?      @db.Text
  aiSummary   String?      @map("ai_summary") @db.Text

  // 关系
  savedBy     Collection[]

  // 时间戳
  publishedAt DateTime?    @map("published_at")
  createdAt   DateTime     @default(now()) @map("created_at")
  updatedAt   DateTime     @updatedAt @map("updated_at")

  @@index([type, publishedAt(sort: Desc)])
  @@index([createdAt(sort: Desc)])
  @@map("resources")
}

enum ResourceType {
  PAPER
  PROJECT
  NEWS
  EVENT
}
```

### 7.2 数据库迁移

```bash
# 创建迁移
npx prisma migrate dev --name add_ai_summary_field

# 生产环境部署
npx prisma migrate deploy

# 重置数据库（仅开发）
npx prisma migrate reset
```

---

## 8. 性能规范

### 8.1 后端性能

```typescript
// ✅ 好的做法

// 1. 使用数据库索引
// 见上方Prisma Schema的@@index定义

// 2. 分页查询
async function getResources(page: number, limit: number) {
  const skip = (page - 1) * limit;

  return await prisma.resource.findMany({
    skip,
    take: limit,
    orderBy: { createdAt: "desc" },
  });
}

// 3. 缓存频繁查询
import { redisClient } from "./redis";

async function getTrendingResources() {
  const cacheKey = "trending:resources";

  // 先查缓存
  const cached = await redisClient.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // 查数据库
  const resources = await prisma.resource.findMany({
    orderBy: { trendingScore: "desc" },
    take: 20,
  });

  // 写缓存（10分钟）
  await redisClient.setex(cacheKey, 600, JSON.stringify(resources));

  return resources;
}

// 4. 批量操作
// ❌ 不好：N+1查询
for (const userId of userIds) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
}

// ✅ 好：批量查询
const users = await prisma.user.findMany({
  where: { id: { in: userIds } },
});
```

### 8.2 前端性能

```tsx
// 1. 代码分割
import { lazy, Suspense } from "react";

const KnowledgeGraph = lazy(() => import("./KnowledgeGraph"));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <KnowledgeGraph />
    </Suspense>
  );
}

// 2. 虚拟滚动（大列表）
import { useVirtualizer } from "@tanstack/react-virtual";

function FeedList({ items }) {
  const parentRef = useRef();
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 300,
  });

  return (
    <div ref={parentRef} style={{ height: "100vh", overflow: "auto" }}>
      {virtualizer.getVirtualItems().map((virtualItem) => (
        <ResourceCard key={items[virtualItem.index].id} />
      ))}
    </div>
  );
}

// 3. 图片懒加载
<img loading="lazy" src={url} alt={title} />;
```

---

## 9. 安全规范

### 9.1 输入验证

```typescript
// 使用Zod进行数据验证

import { z } from 'zod';

const CreateResourceSchema = z.object({
  title: z.string().min(1).max(1000),
  abstract: z.string().optional(),
  type: z.enum(['paper', 'project', 'news', 'event']),
  sourceUrl: z.string().url(),
});

// API端点
@Post()
async createResource(@Body() body: unknown) {
  // 验证输入
  const data = CreateResourceSchema.parse(body);

  // 处理业务逻辑
  return await this.resourcesService.create(data);
}
```

### 9.2 SQL注入防护

```typescript
// ✅ 使用Prisma（自动防护）
await prisma.user.findMany({
  where: { email: userInput }, // 安全
});

// ❌ 永远不要拼接SQL
const query = `SELECT * FROM users WHERE email = '${userInput}'`; // 危险！
```

### 9.3 XSS防护

```tsx
// React默认转义，但小心dangerouslySetInnerHTML

// ❌ 危险
<div dangerouslySetInnerHTML={{ __html: userInput }} />;

// ✅ 如果必须使用，先消毒
import DOMPurify from "dompurify";

<div
  dangerouslySetInnerHTML={{
    __html: DOMPurify.sanitize(userInput),
  }}
/>;
```

---

## 10. 文档规范

### 10.1 代码注释

```typescript
/**
 * 生成个性化推荐列表
 *
 * 算法：
 * 1. 获取用户知识图谱
 * 2. 找到认知边界节点
 * 3. 从边界出发游走收集候选
 * 4. 综合评分排序
 *
 * @param userId - 用户ID
 * @param limit - 返回数量限制
 * @returns 推荐资源列表
 *
 * @example
 * const recommendations = await generateRecommendations('user-123', 20);
 */
export async function generateRecommendations(
  userId: string,
  limit: number = 20,
): Promise<Resource[]> {
  // 实现...
}
```

### 10.2 README规范

每个子项目（frontend, backend等）都应有readme.md，包含：

```markdown
# 项目名称

简要描述

## 技术栈

- 列出主要技术

## 快速开始

### 前置要求

- Node.js 20+
- PostgreSQL 16+

### 安装

\`\`\`bash
npm install
\`\`\`

### 运行

\`\`\`bash
npm run dev
\`\`\`

## 项目结构

简要说明目录结构

## 相关文档

- [API文档](../docs/API.md)
- [架构文档](../docs/architecture.md)
```

---

## 11. 日志规范

### 11.1 日志级别

```typescript
import { Logger } from "@nestjs/common";

const logger = new Logger("ResourcesService");

// ERROR - 错误，需要立即处理
logger.error("Failed to create resource", error.stack);

// WARN - 警告，但不影响核心功能
logger.warn(`Grok API slow response: ${duration}ms`);

// INFO - 重要信息
logger.log("Resource created successfully", { id: resource.id });

// DEBUG - 调试信息（生产环境关闭）
logger.debug("Processing resource", { data });

// VERBOSE - 详细日志（开发环境）
logger.verbose("API request received", { params });
```

### 11.2 日志格式

```
[Nest] 12345  - 2025-11-07 10:30:45  LOG [ResourcesService] Resource created successfully {"id":"abc-123"}
[Nest] 12345  - 2025-11-07 10:30:46  ERROR [AIService] Grok API failed: Connection timeout
```

---

## 12. 发布规范

### 12.1 版本号

遵循语义化版本(Semver): `MAJOR.MINOR.PATCH`

- MAJOR: 不兼容的API变更
- MINOR: 向后兼容的功能新增
- PATCH: 向后兼容的Bug修复

示例:

- `1.0.0` - 首次正式发布
- `1.1.0` - 新增学习路径功能
- `1.1.1` - 修复推荐算法Bug
- `2.0.0` - 重构API（不兼容1.x）

### 12.2 发布Checklist

- [ ] 所有测试通过
- [ ] 代码Review完成
- [ ] 更新CHANGELOG.md
- [ ] 更新版本号（package.json）
- [ ] 打Tag: `git tag v1.0.0`
- [ ] 推送到远程: `git push --tags`

---

## 13. 开发流程

### 13.1 开始新功能

```bash
# 1. 从develop创建feature分支
git checkout develop
git pull origin develop
git checkout -b feature/knowledge-graph

# 2. 开发功能
# ...编写代码...

# 3. 提交代码
git add .
git commit -m "feat(kg): implement knowledge graph visualization"

# 4. 推送并创建PR
git push origin feature/knowledge-graph
# 在GitHub创建PR: feature/knowledge-graph -> develop
```

### 13.2 Code Review要点

**Review清单**:

- [ ] 代码符合规范
- [ ] 有足够的测试
- [ ] 没有硬编码的密钥
- [ ] 性能考虑（N+1查询、缓存等）
- [ ] 错误处理完善
- [ ] 日志充分但不过度
- [ ] 文档更新（如需要）

---

## 14. 常见问题

### Q: Grok API密钥从哪里获取？

A: 从secretManager获取，参见第5章密钥管理规范

### Q: 如何切换AI提供商？

A: 使用`force_openai=True`参数强制使用OpenAI，见第4章

### Q: 数据库迁移失败怎么办？

A:

1. 检查迁移文件是否正确
2. 确认数据库连接
3. 开发环境可使用`prisma migrate reset`重置

### Q: 性能优化从哪里入手？

A:

1. 检查是否有N+1查询
2. 添加数据库索引
3. 使用Redis缓存
4. 前端使用虚拟滚动

---

## 附录

### A. 有用的命令

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 运行测试
npm test

# 代码检查
npm run lint

# 格式化代码
npm run format

# 构建生产版本
npm run build

# 数据库迁移
npx prisma migrate dev
npx prisma migrate deploy

# 生成Prisma Client
npx prisma generate

# 查看数据库
npx prisma studio
```

### B. 推荐的VSCode扩展

- ESLint
- Prettier
- Prisma
- GitLens
- TypeScript Error Translator
- Tailwind CSS IntelliSense

---

**文档版本**: v1.0
**最后更新**: 2025-11-07
**维护者**: DeepDive Team

**注意**: 所有开发人员和AI助手必须严格遵守本规范！
