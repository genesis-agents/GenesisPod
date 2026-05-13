#!/usr/bin/env bash
# upgrade.sh — Genesis.ai 客户升级脚本
#
# 用法（在原 install.sh 所在目录里跑）：
#   bash upgrade.sh /path/to/genesis-bundle-vNEW.tar.gz
#
# 流程：
#   1. 解新 bundle 到临时目录
#   2. 版本对比（同版本警告 / 降级警告 / 正常升级）
#   3. 备份 .env.production → .env.production.bak.<ts>
#   4. docker pull 新镜像（从 ghcr.io，依赖 IMAGES 元数据文件）
#   5. 替换 docker-compose.yml + install.sh + upgrade.sh + IMAGES（保留 .env.production / VERSION 更新）
#   6. 更新 .env.production 里的镜像 tag
#   7. docker compose up -d --force-recreate（保留 volume）
#   8. 等 healthy
#
# 环境变量：
#   FORCE=1   跳过同版本 / 降级警告

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

# ── 参数 ──────────────────────────────────────────────────
BUNDLE="${1:-}"
[ -n "$BUNDLE" ] || die "用法：bash upgrade.sh /path/to/genesis-bundle-vX.Y.Z.tar.gz"
[ -f "$BUNDLE" ] || die "找不到 bundle 文件：$BUNDLE"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# ── 必备文件 ──────────────────────────────────────────────
[ -f .env.production ] || die "当前目录无 .env.production；请先在原 install 目录里运行此脚本"
[ -f VERSION ]         || die "当前目录无 VERSION 文件；目录布局有问题"

OLD_VERSION="$(cat VERSION)"

# ── 解新 bundle 到临时目录 ────────────────────────────────
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

log "解包新 bundle 到临时目录..."
tar -xzf "$BUNDLE" -C "$TMP"

# bundle 顶层目录名形如 genesis-bundle-vX.Y.Z
NEW_DIR="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)"
[ -d "$NEW_DIR" ] || die "bundle 结构异常，找不到顶层目录"
[ -f "${NEW_DIR}/VERSION" ] || die "新 bundle 里没有 VERSION 文件"

NEW_VERSION="$(cat "${NEW_DIR}/VERSION")"

# ── 版本对比 ──────────────────────────────────────────────
echo
echo "  当前版本: ${C_DIM}${OLD_VERSION}${C_RESET}"
echo "  目标版本: ${C_BOLD}${NEW_VERSION}${C_RESET}"
echo

if [ "$OLD_VERSION" = "$NEW_VERSION" ]; then
  if [ "${FORCE:-0}" != "1" ]; then
    warn "新版本与当前版本相同（${OLD_VERSION}）"
    read -r -p "  仍要继续重装吗? [y/N] " ANS
    case "${ANS:-N}" in [yY]*) ;; *) die "已取消"; esac
  fi
fi

# 简易 semver 对比（剥掉 v 前缀，纯数字 part 对比；非 semver 跳过对比）
ver_compare() {
  local a="${1#v}" b="${2#v}"
  # 截掉 prerelease 部分（- 后）
  a="${a%%-*}"; b="${b%%-*}"
  printf '%s\n%s\n' "$a" "$b" | sort -V -C 2>/dev/null && echo lt && return
  printf '%s\n%s\n' "$b" "$a" | sort -V -C 2>/dev/null && echo gt && return
  echo eq
}

if [ "$OLD_VERSION" != "$NEW_VERSION" ]; then
  CMP="$(ver_compare "$OLD_VERSION" "$NEW_VERSION")"
  if [ "$CMP" = "gt" ]; then
    warn "目标版本 ${NEW_VERSION} 比当前 ${OLD_VERSION} ${C_BOLD}低${C_RESET}（降级）"
    warn "降级可能导致数据库 schema 不兼容，造成启动失败甚至数据损坏"
    if [ "${FORCE:-0}" != "1" ]; then
      read -r -p "  确认降级? 输入版本号 [${NEW_VERSION}] 以继续: " ANS
      [ "$ANS" = "$NEW_VERSION" ] || die "已取消"
    fi
  fi
fi

# ── docker compose v2 / v1 ────────────────────────────────
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null; then
  DC=(docker-compose)
else
  die "需要 docker compose v2 或 docker-compose v1"
fi

# ── 备份 .env.production ──────────────────────────────────
TS="$(date +%Y%m%d_%H%M%S)"
BACKUP=".env.production.bak.${TS}"
cp .env.production "$BACKUP"
chmod 600 "$BACKUP"
log "已备份 .env.production → ${BACKUP}"

# ── 从 ghcr.io 拉新镜像 ──────────────────────────────────
# 检查 ghcr.io 登录
if ! grep -q "ghcr.io" "${HOME}/.docker/config.json" 2>/dev/null; then
  die "未检测到 ghcr.io 登录凭据；请先 docker login ghcr.io（用最新 PAT）"
fi

[ -f "${NEW_DIR}/IMAGES" ] || die "新 bundle 里没有 IMAGES 元数据文件"

log "从 ghcr.io 拉取新镜像 (~几分钟，看带宽)..."
while IFS= read -r img; do
  [ -z "$img" ] && continue
  log "  pulling $img"
  docker pull "$img" || die "拉取失败：$img"
done < "${NEW_DIR}/IMAGES"

# ── 替换 compose / install / upgrade / README / VERSION / IMAGES ──
log "更新部署配置（保留 .env.production）..."
cp "${NEW_DIR}/docker-compose.yml" ./docker-compose.yml
cp "${NEW_DIR}/install.sh"         ./install.sh
cp "${NEW_DIR}/upgrade.sh"         ./upgrade.sh
cp "${NEW_DIR}/README.md"          ./README.md 2>/dev/null || true
cp "${NEW_DIR}/VERSION"            ./VERSION
cp "${NEW_DIR}/IMAGES"             ./IMAGES
chmod +x install.sh upgrade.sh

# .env.production.example 也更新（参考用，但不覆盖客户已填的 .env.production）
cp "${NEW_DIR}/.env.production.example" ./.env.production.example

# ── 更新 .env.production 里的镜像 tag（从 IMAGES 文件读 ghcr 完整路径）
log "更新镜像 tag 引用..."
NEW_BACKEND_IMG="$(sed -n '1p' "${NEW_DIR}/IMAGES")"
NEW_FRONTEND_IMG="$(sed -n '2p' "${NEW_DIR}/IMAGES")"
NEW_AI_SERVICE_IMG="$(sed -n '3p' "${NEW_DIR}/IMAGES")"

sed -i.upgradebak \
  -e "s|^BACKEND_IMAGE=.*|BACKEND_IMAGE=${NEW_BACKEND_IMG}|" \
  -e "s|^FRONTEND_IMAGE=.*|FRONTEND_IMAGE=${NEW_FRONTEND_IMG}|" \
  -e "s|^AI_SERVICE_IMAGE=.*|AI_SERVICE_IMAGE=${NEW_AI_SERVICE_IMG}|" \
  .env.production
rm -f .env.production.upgradebak

# ── 滚动重启 ──────────────────────────────────────────────
log "滚动重启容器（保留 postgres / redis volume）..."
"${DC[@]}" --env-file .env.production up -d --force-recreate --no-deps backend frontend ai-service

# ── 等 healthy ────────────────────────────────────────────
log "等待 backend 健康检查通过（含 prisma migrate deploy，最长 10 分钟）..."
HEALTHY=0
for i in $(seq 1 60); do
  STATUS="$(docker inspect genesis-backend --format '{{.State.Health.Status}}' 2>/dev/null || echo unknown)"
  if [ "$STATUS" = "healthy" ]; then
    HEALTHY=1
    break
  fi
  if [ $((i % 6)) -eq 0 ]; then
    echo "  ${C_DIM}已等待 $((i*10))s，当前状态: ${STATUS}${C_RESET}"
  fi
  sleep 10
done

if [ "$HEALTHY" -ne 1 ]; then
  warn "backend 未在 10 分钟内 healthy；可能 prisma migrate 失败"
  warn "查看日志：${DC[*]} logs backend"
  warn "如需回滚：编辑 .env.production 把 *_IMAGE 改回 ${OLD_VERSION}，再 ${DC[*]} up -d --force-recreate"
  exit 1
fi

# ── 报告 ──────────────────────────────────────────────────
cat <<EOF

${C_BOLD}${C_GREEN}✓ 升级完成${C_RESET}

  ${OLD_VERSION} ${C_DIM}→${C_RESET} ${C_BOLD}${NEW_VERSION}${C_RESET}

  .env.production 备份: ${BACKUP}
  ${C_DIM}（确认新版本稳定后可手动删除备份）${C_RESET}

${C_DIM}回滚方法（万一）：
  从 .env.production.bak.${TS} 恢复 .env.production，然后:
    ${DC[*]} --env-file .env.production up -d --force-recreate
  （docker pull 旧版本镜像走 ghcr，前提是旧 tag 没在 ghcr 被删）
  注意：DB schema 已迁移到新版本，回滚可能因 schema 不兼容失败。${C_RESET}
EOF
