#!/usr/bin/env bash
# install.sh — Genesis.ai 客户首次部署一键脚本
#
# 用法（在解压后的 bundle 目录里跑）：
#   tar -xzf genesis-bundle-vX.Y.Z.tar.gz
#   cd genesis-bundle-vX.Y.Z
#   bash install.sh
#
# 环境变量（可选）：
#   INSTALL_DIR=/opt/genesis     默认安装目录
#   FRONTEND_PORT=3000           对外端口
#   SKIP_PROMPTS=1               全自动模式（用默认值，不交互）

set -euo pipefail

# ── 颜色 ──────────────────────────────────────────────────
if [ -t 1 ]; then
  C_BOLD=$'\033[1m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'; C_CYAN=$'\033[36m'; C_DIM=$'\033[2m'; C_RESET=$'\033[0m'
else
  C_BOLD=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_CYAN=''; C_DIM=''; C_RESET=''
fi
log()  { echo "${C_GREEN}==>${C_RESET} $*"; }
warn() { echo "${C_YELLOW}!! ${C_RESET} $*" >&2; }
die()  { echo "${C_RED}xx ${C_RESET} $*" >&2; exit 1; }

# ── 环境检查 ──────────────────────────────────────────────
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

VERSION="$(cat VERSION 2>/dev/null || echo unknown)"

echo
echo "${C_BOLD}Genesis.ai On-Prem Installer${C_RESET}  (version: ${C_CYAN}${VERSION}${C_RESET})"
echo

# 必备文件
for f in images.tar docker-compose.yml .env.production.example; do
  [ -f "$f" ] || die "缺少 $f；请确认在正确的 bundle 解压目录里运行此脚本"
done

# 必备命令
command -v docker  >/dev/null || die "需要 docker（建议 24+）；安装：https://docs.docker.com/engine/install/"
command -v openssl >/dev/null || die "需要 openssl"

# docker daemon
docker info >/dev/null 2>&1 || die "docker daemon 未运行（systemctl start docker 或重启 Docker Desktop）"

# docker compose v2 vs v1
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null; then
  DC=(docker-compose)
  warn "用的是 docker-compose v1，建议升级到 v2"
else
  die "需要 docker compose v2 或 docker-compose v1"
fi

# root 提示
if [ "$(id -u)" -eq 0 ]; then
  warn "你正在用 root 用户运行；建议把当前用户加入 docker 组后切换非 root"
fi

# ── docker load ───────────────────────────────────────────
log "加载 docker 镜像 (~3.4GB，~30-60s)..."
docker load -i images.tar

# ── .env.production 准备 ──────────────────────────────────
if [ -f .env.production ]; then
  warn ".env.production 已存在，跳过密钥生成（如需重置，请删除该文件后重跑）"
else
  log "生成 .env.production（自动填随机密钥）..."
  cp .env.production.example .env.production

  # 6 个 random key
  gen_key() { openssl rand -hex 32; }
  gen_pw()  { openssl rand -base64 32 | tr -d '+/=' | head -c 32; }

  # ensure_kv: 替换已有行 或 追加新行；防御 .env.example 维护漏字段
  ensure_kv() {
    local key="$1" val="$2"
    if grep -qE "^${key}=" .env.production; then
      awk -v k="$key" -v v="$val" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' \
        .env.production > .env.production.tmp && mv .env.production.tmp .env.production
    else
      echo "${key}=${val}" >> .env.production
    fi
  }

  ensure_kv POSTGRES_PASSWORD       "$(gen_pw)"
  ensure_kv REDIS_PASSWORD          "$(gen_pw)"
  ensure_kv JWT_SECRET              "$(gen_key)"
  ensure_kv JWT_REFRESH_SECRET      "$(gen_key)"
  ensure_kv SETTINGS_ENCRYPTION_KEY "$(gen_key)"
  ensure_kv STORAGE_ADMIN_KEY       "$(gen_key)"

  # 交互问 admin / domain
  if [ "${SKIP_PROMPTS:-0}" != "1" ]; then
    echo
    echo "${C_BOLD}请填写管理员账号信息${C_RESET}（首次启动后自动创建，登录后立即改密码）"
    read -r -p "  Admin email      : " ADMIN_EMAIL
    while [ -z "${ADMIN_EMAIL// }" ]; do
      read -r -p "  Admin email      : " ADMIN_EMAIL
    done
    # 密码不回显
    read -r -s -p "  Admin password   : " ADMIN_PW; echo
    while [ ${#ADMIN_PW} -lt 8 ]; do
      warn "密码至少 8 字符"
      read -r -s -p "  Admin password   : " ADMIN_PW; echo
    done

    echo
    echo "${C_BOLD}对外访问地址${C_RESET}（浏览器输入的 URL，例：https://genesis.example.com 或 http://192.168.1.100:3000）"
    echo "${C_DIM}留空 = 同源模式（适合 nginx 反代），跳过即可${C_RESET}"
    read -r -p "  Public base URL  : " PUBLIC_URL

    ensure_kv ADMIN_INITIAL_EMAIL    "$ADMIN_EMAIL"
    ensure_kv ADMIN_INITIAL_PASSWORD "$ADMIN_PW"
    ensure_kv ADMIN_EMAILS           "$ADMIN_EMAIL"
    ensure_kv PUBLIC_BASE_URL        "$PUBLIC_URL"
    ensure_kv FRONTEND_URL           "$PUBLIC_URL"
  else
    # 非交互模式：用 random 密码 + 默认 hello.junjie.duan@gmail.com；让 compose 能起，登录后必改
    AUTO_ADMIN_PW="$(gen_pw)"
    ensure_kv ADMIN_INITIAL_EMAIL    "hello.junjie.duan@gmail.com"
    ensure_kv ADMIN_INITIAL_PASSWORD "$AUTO_ADMIN_PW"
    ensure_kv ADMIN_EMAILS           "hello.junjie.duan@gmail.com"
    ensure_kv PUBLIC_BASE_URL        ""
    ensure_kv FRONTEND_URL           ""
    warn "SKIP_PROMPTS=1 模式：admin 已用随机密码自动填充"
    warn "  email    : hello.junjie.duan@gmail.com"
    warn "  password : ${AUTO_ADMIN_PW}"
    warn "  请记录上述凭据，登录后立即修改"
  fi

  chmod 600 .env.production
  log ".env.production 已生成（权限 600，仅 owner 可读）"
fi

# ── 启动 ──────────────────────────────────────────────────
log "启动服务（首次启动会跑数据库迁移 + seed，可能 3-5 分钟）..."
"${DC[@]}" --env-file .env.production up -d

# ── 等 backend healthy ────────────────────────────────────
log "等待 backend 健康检查通过（最长 30 分钟，含首次 prisma migrate 全量执行）..."
HEALTHY=0
for i in $(seq 1 180); do
  STATUS="$(docker inspect genesis-backend --format '{{.State.Health.Status}}' 2>/dev/null || echo unknown)"
  if [ "$STATUS" = "healthy" ]; then
    HEALTHY=1
    # backend healthy 后强制再 up 一次让 frontend / 其他 depends_on 启动
    "${DC[@]}" --env-file .env.production up -d >/dev/null 2>&1 || true
    break
  fi
  if [ $((i % 6)) -eq 0 ]; then
    LAST_MIG="$(docker logs genesis-backend --tail 100 2>&1 | grep -oE 'Migration [0-9_a-z]+' | tail -1 || echo '?')"
    echo "  ${C_DIM}已等待 $((i*10))s，状态: ${STATUS}, 进度: ${LAST_MIG}${C_RESET}"
  fi
  sleep 10
done

if [ "$HEALTHY" -ne 1 ]; then
  warn "backend 未在 10 分钟内 healthy；查看日志："
  warn "  ${DC[*]} logs backend"
  exit 1
fi

# ── 收尾报告 ──────────────────────────────────────────────
PORT="$(grep '^FRONTEND_PORT=' .env.production | cut -d= -f2 || echo 3000)"
PORT="${PORT:-3000}"

cat <<EOF

${C_BOLD}${C_GREEN}✓ Genesis.ai 部署完成${C_RESET}

  访问地址 : ${C_CYAN}http://$(hostname -I 2>/dev/null | awk '{print $1}'):${PORT}${C_RESET}
             ${C_DIM}（或你配置的 PUBLIC_BASE_URL）${C_RESET}

  下一步  :
    1. 浏览器打开上述地址
    2. 用你刚填的 admin email / password 登录
    3. ${C_BOLD}立即修改密码${C_RESET}
    4. 进入「系统 → AI → 模型 / 工具」，录入 LLM API key（BYOK）

  常用命令 :
    查看状态  : ${DC[*]} ps
    查看日志  : ${DC[*]} logs -f backend
    停止     : ${DC[*]} stop
    重启     : ${DC[*]} restart
    升级     : ${C_BOLD}bash upgrade.sh /path/to/new-bundle.tar.gz${C_RESET}

${C_DIM}配置文件位置：${SCRIPT_DIR}/.env.production
（含敏感密钥，权限 600；备份时务必加密）${C_RESET}
EOF
