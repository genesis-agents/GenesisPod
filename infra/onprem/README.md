# Genesis.ai - 客户离线部署（On-Prem）

源码不公开的客户本地部署方案。客户拿到的是预编译 Docker 镜像 tar 包 + 一份 compose 配置，看不到 TypeScript / Python 源码。

## 架构

```
客户机器:
  ┌──────────────────────────────────────────────┐
  │ docker network: genesis-network              │
  │                                              │
  │ [postgres]   [redis]   [flaresolverr]        │
  │     ↑           ↑           ↑                │
  │     └───────────┴───────────┘                │
  │              [backend:4000]    [ai-service]  │
  │                    ↑               ↑         │
  │                    └───────┬───────┘         │
  │                       [frontend:3000] ◀── 唯一对外端口
  └──────────────────────────────────────────────┘
                            ↑
                       浏览器 / 客户端
```

- **唯一对外端口**：frontend 容器的 3000，建议客户再套 nginx 加 TLS。
- **数据库不外露**：postgres / redis 仅 docker network 内可见，客户连不上 psql / redis-cli。
- **LLM 走 BYOK**：开发方的 OpenAI / Claude API key **不进镜像**，客户用管理员账号登录后录入自己的 key。

## 版本号策略

`build-bundle.sh` 自动按以下优先级决定 VERSION：

| 优先级 | 来源                                                     | 例子                          |
| ------ | -------------------------------------------------------- | ----------------------------- |
| 1      | 命令行参数                                               | `bash build-bundle.sh v1.0.0` |
| 2      | 当前 commit 的 git tag（`npm run release` 流程会打 tag） | `v40.12.0`                    |
| 3      | `package.json` version + git short SHA                   | `40.11.0-f51c60d`             |
| 4      | 兜底纯 git short SHA                                     | `f51c60d`                     |

## 发布渠道

镜像发布到 **GitHub Container Registry (ghcr.io)** 私有仓库，路径：

```
ghcr.io/junjie-duan/genesis-backend:<version>
ghcr.io/junjie-duan/genesis-frontend:<version>
ghcr.io/junjie-duan/genesis-ai-service:<version>
```

客户拿到的不是 3.4GB tar，而是一个 ~10KB 的 config bundle + GitHub PAT。

## 开发侧：发布流程

### 一次性：登录 ghcr.io

```bash
# 生成 PAT：GitHub → Settings → Developer settings → Tokens (classic)
#   勾 write:packages + read:packages + delete:packages
echo $GHCR_TOKEN | docker login ghcr.io -u junjie-duan --password-stdin
```

### 每次发布

```bash
# 在项目根目录跑（Windows 用 git bash）
npm run onprem:bundle                        # 自动 VERSION + push to ghcr
npm run onprem:release                       # standard-version bump + push + bundle

# 或直接调脚本（更多选项）
bash infra/onprem/scripts/build-bundle.sh v1.0.0
bash infra/onprem/scripts/build-bundle.sh v1.0.0 --skip-build  # 复用本地镜像
bash infra/onprem/scripts/build-bundle.sh v1.0.0 --no-push     # 仅 build/tag，不 push
```

产物：

- 3 个镜像 push 到 ghcr.io/junjie-duan/genesis-\*:vX.Y.Z
- `dist/onprem/genesis-config-<VERSION>.tar.gz`（~10KB，含 compose/env/install/upgrade/README/VERSION/IMAGES）

**交付给客户**：config bundle + GitHub PAT（fine-grained，只授 `read:packages` 给本仓库 packages）+ 软件许可协议（SLA/NDA）。

**首次发布前检查**：镜像在 GitHub Packages 默认是 Private（按 repo 可见性继承）；如 repo 是 public，需在 Packages 页面单独设为 Private。

## 客户侧：首次部署

前置条件：Docker 24+ + Docker Compose v2 + openssl + 联外网（可访问 ghcr.io）。

```bash
# 1. 用我们发的 PAT 登录 ghcr.io（一次性）
echo $GH_PAT | docker login ghcr.io -u <你的 github 用户名> --password-stdin

# 2. 解 config bundle
tar -xzf genesis-config-v1.0.0.tar.gz
cd genesis-config-v1.0.0

# 3. 一键安装（脚本自动 pull 镜像、生成密钥、交互问 admin、启动）
bash install.sh
```

`install.sh` 干了什么：

1. 校验环境（docker / openssl / compose v2 / ghcr 登录状态）
2. `docker pull` 三个镜像（从 ghcr.io，按 IMAGES 元数据文件）
3. 用 `openssl rand` 自动填 6 个随机密钥到 `.env.production`
4. 交互问：admin email / 密码 / 对外访问地址
5. `docker compose up -d`
6. 轮询 backend healthcheck（最长 30 分钟，含首次 Prisma migrate + seed）
7. 打印登录 URL 和后续操作提示

非交互模式（CI / 自动化）：`SKIP_PROMPTS=1 bash install.sh`，admin 用随机密码自动填，登录后必改。

## 升级流程

```bash
# 在原 install 目录里跑（含 .env.production / VERSION 的目录）
bash upgrade.sh /path/to/genesis-config-vNEW.tar.gz
```

`upgrade.sh` 干了什么：

1. 校验：同版本会询问 / 降级会要求输入版本号二次确认
2. 备份当前 `.env.production` → `.env.production.bak.<时间戳>`
3. `docker pull` 新镜像（从 ghcr.io，按 IMAGES 元数据）
4. 替换 `docker-compose.yml` / `install.sh` / `upgrade.sh` / `README.md` / `IMAGES`（保留 `.env.production`）
5. 更新 `.env.production` 里的镜像 tag 引用
6. `docker compose up -d --force-recreate --no-deps backend frontend ai-service`（保留 postgres / redis volume）
7. 轮询 healthy

强制跳过版本警告（自动化）：`FORCE=1 bash upgrade.sh ...`

## 备份建议

```bash
# 数据库备份
docker compose exec postgres pg_dump -U genesis genesis > backup-$(date +%F).sql

# Volume 备份（缩略图 + 导出文件）
docker run --rm -v genesis_backend_thumbnails:/data -v $(pwd):/backup alpine \
  tar czf /backup/thumbnails-$(date +%F).tar.gz -C /data .
```

## 故障排查

| 现象                   | 排查方向                                                                      |
| ---------------------- | ----------------------------------------------------------------------------- |
| backend 一直 unhealthy | `docker compose logs backend`，看 Prisma migrate 是否失败                     |
| 前端打开 500           | 检查 NEXT_PUBLIC_API_URL 是否和客户实际域名一致                               |
| LLM 调用全部 401       | 没在 admin 后台配 BYOK key，或者 key 失效                                     |
| postgres 启不来        | volume 残留 / 密码改过：`docker compose down -v` 重新初始化（**会清空数据**） |
