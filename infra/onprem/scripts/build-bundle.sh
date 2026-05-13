#!/usr/bin/env bash
# build-bundle.sh — 开发侧：build 镜像 + push 到 ghcr.io + 打 config bundle
#
# 用法：
#   bash infra/onprem/scripts/build-bundle.sh [VERSION] [选项]
#
# 选项：
#   --skip-build         跳过 docker build（复用本地已有镜像）
#   --no-push            只 build/tag，不 push 到 ghcr（本地验证用）
#   --owner <name>       覆盖 GHCR_OWNER（默认从 git remote 解析）
#
# 示例：
#   bash build-bundle.sh                              # 自动版本号 + push
#   bash build-bundle.sh v1.0.0                       # 显式版本 + push
#   bash build-bundle.sh v1.0.0 --skip-build          # 复用本地镜像 + push
#   bash build-bundle.sh v1.0.0 --no-push             # 只 build，不 push
#
# 前置条件：
#   docker login ghcr.io 已登录（PAT 含 write:packages）
#
# 产物：
#   - 镜像 push 到 ghcr.io/<owner>/genesis-{backend,frontend,ai-service}:<version>
#   - dist/onprem/genesis-config-<version>.tar.gz（~10KB，含 compose/env/install/upgrade/README/VERSION）

set -euo pipefail

# ── 颜色（仅 TTY） ────────────────────────────────────────
if [ -t 1 ]; then
  C_BOLD=$'\033[1m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'; C_DIM=$'\033[2m'; C_RESET=$'\033[0m'
else
  C_BOLD=''; C_GREEN=''; C_YELLOW=''; C_RED=''; C_DIM=''; C_RESET=''
fi
log()  { echo "${C_GREEN}==>${C_RESET} $*"; }
warn() { echo "${C_YELLOW}!! ${C_RESET} $*" >&2; }
die()  { echo "${C_RED}xx ${C_RESET} $*" >&2; exit 1; }

# ── 路径解析 ──────────────────────────────────────────────
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ONPREM_DIR="$( cd "${SCRIPT_DIR}/.." && pwd )"
PROJECT_ROOT="$( cd "${ONPREM_DIR}/../.." && pwd )"

# ── 参数解析 ──────────────────────────────────────────────
VERSION=""
SKIP_BUILD=0
PUSH=1
GHCR_OWNER_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1 ;;
    --no-push)    PUSH=0 ;;
    --owner)      shift; GHCR_OWNER_ARG="$1" ;;
    -h|--help)
      grep '^#' "$0" | head -25
      exit 0
      ;;
    *) VERSION="$1" ;;
  esac
  shift
done

# ── VERSION 自动检测（CLI > git tag > package.json + SHA > 纯 SHA）
if [ -z "$VERSION" ]; then
  if TAG="$(git -C "$PROJECT_ROOT" describe --tags --exact-match HEAD 2>/dev/null)"; then
    VERSION="$TAG"
    log "VERSION 未指定，使用当前 commit 的 git tag: ${C_BOLD}${VERSION}${C_RESET}"
  elif [ -f "${PROJECT_ROOT}/package.json" ] \
       && SHA="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null)" \
       && command -v node >/dev/null; then
    PKG_VER="$(node -p "require('${PROJECT_ROOT}/package.json').version" 2>/dev/null || echo "")"
    if [ -n "$PKG_VER" ]; then
      VERSION="${PKG_VER}-${SHA}"
      log "VERSION 未指定，使用 package.json version + git SHA: ${C_BOLD}${VERSION}${C_RESET}"
    fi
  fi
  if [ -z "$VERSION" ]; then
    if SHA="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null)"; then
      VERSION="$SHA"
      log "VERSION 未指定，使用 git short SHA: ${C_BOLD}${VERSION}${C_RESET}"
    else
      die "VERSION 未指定，且既不在 git 仓库也无 package.json"
    fi
  fi
fi

# ── GHCR_OWNER 自动检测 ───────────────────────────────────
# 优先级：--owner CLI > GHCR_OWNER env > git remote origin url 解析
GHCR_OWNER="${GHCR_OWNER_ARG:-${GHCR_OWNER:-}}"
if [ -z "$GHCR_OWNER" ]; then
  REMOTE_URL="$(git -C "$PROJECT_ROOT" config --get remote.origin.url 2>/dev/null || true)"
  if [[ "$REMOTE_URL" =~ github\.com[:/]+([^/]+)/ ]]; then
    GHCR_OWNER="$(echo "${BASH_REMATCH[1]}" | tr '[:upper:]' '[:lower:]')"
    log "GHCR_OWNER 自动解析为: ${C_BOLD}${GHCR_OWNER}${C_RESET}（来自 git remote，已转小写）"
  else
    die "无法自动检测 GHCR_OWNER；请用 --owner 或 export GHCR_OWNER=<github-username>"
  fi
fi

# ── 环境检查 ──────────────────────────────────────────────
command -v docker >/dev/null || die "需要 docker"
docker info >/dev/null 2>&1 || die "docker daemon 未运行"
command -v tar    >/dev/null || die "需要 tar"

if [ "$PUSH" -eq 1 ]; then
  # 验证 docker login ghcr.io
  if ! docker info 2>/dev/null | grep -q "ghcr.io"; then
    # 通过 ~/.docker/config.json 间接验
    if ! grep -q "ghcr.io" "${HOME}/.docker/config.json" 2>/dev/null; then
      warn "未检测到 ghcr.io 登录凭据"
      warn "请先跑：${C_BOLD}echo \$GHCR_TOKEN | docker login ghcr.io -u <github-username> --password-stdin${C_RESET}"
      warn "（PAT 需要 write:packages 权限）"
      die "登录后重试，或加 --no-push 跳过 push"
    fi
  fi
fi

# ── 镜像命名 ──────────────────────────────────────────────
GHCR_BACKEND="ghcr.io/${GHCR_OWNER}/genesis-backend:${VERSION}"
GHCR_FRONTEND="ghcr.io/${GHCR_OWNER}/genesis-frontend:${VERSION}"
GHCR_AI_SERVICE="ghcr.io/${GHCR_OWNER}/genesis-ai-service:${VERSION}"

# ── Build 镜像 ────────────────────────────────────────────
if [ "$SKIP_BUILD" -eq 0 ]; then
  log "Building backend (这一步最慢，~10 分钟)..."
  docker build -t "$GHCR_BACKEND" "${PROJECT_ROOT}/backend"

  log "Building frontend..."
  docker build -t "$GHCR_FRONTEND" "${PROJECT_ROOT}/frontend"

  log "Building ai-service..."
  docker build -t "$GHCR_AI_SERVICE" "${PROJECT_ROOT}/ai-service"
else
  warn "--skip-build 模式：检查或 tag 现有镜像到 ghcr 命名..."
  # 如果只本地有 genesis/backend:VERSION（旧命名），自动 tag 到 ghcr 命名
  for pair in "genesis/backend:${VERSION}|${GHCR_BACKEND}" \
              "genesis/frontend:${VERSION}|${GHCR_FRONTEND}" \
              "genesis/ai-service:${VERSION}|${GHCR_AI_SERVICE}"; do
    OLD="${pair%|*}"; NEW="${pair#*|}"
    if docker image inspect "$NEW" >/dev/null 2>&1; then
      :  # 已存在 ghcr 命名
    elif docker image inspect "$OLD" >/dev/null 2>&1; then
      log "tag $OLD → $NEW"
      docker tag "$OLD" "$NEW"
    else
      die "镜像 $NEW 或 $OLD 都不存在；请去掉 --skip-build 或先 build"
    fi
  done
fi

# ── Push 到 ghcr ──────────────────────────────────────────
if [ "$PUSH" -eq 1 ]; then
  for img in "$GHCR_BACKEND" "$GHCR_FRONTEND" "$GHCR_AI_SERVICE"; do
    log "Pushing $img..."
    docker push "$img"
  done
else
  warn "--no-push 模式：跳过 docker push"
fi

# ── Staging：只打包配置 + 脚本（无 images.tar） ───────────
OUTPUT_DIR="${PROJECT_ROOT}/dist/onprem"
BUNDLE_NAME="genesis-config-${VERSION}"
STAGING="${OUTPUT_DIR}/${BUNDLE_NAME}"

mkdir -p "$STAGING"
rm -rf "$STAGING"/*

log "打包客户配置 bundle..."
cp "${ONPREM_DIR}/docker-compose.yml"            "${STAGING}/"
cp "${ONPREM_DIR}/.env.production.example"       "${STAGING}/"
cp "${ONPREM_DIR}/README.md"                     "${STAGING}/"
cp "${ONPREM_DIR}/scripts/install.sh"            "${STAGING}/"
cp "${ONPREM_DIR}/scripts/upgrade.sh"            "${STAGING}/"

# 把镜像 tag 注入到 .env.production.example 默认值
sed -i.bak \
  -e "s|^BACKEND_IMAGE=.*|BACKEND_IMAGE=${GHCR_BACKEND}|" \
  -e "s|^FRONTEND_IMAGE=.*|FRONTEND_IMAGE=${GHCR_FRONTEND}|" \
  -e "s|^AI_SERVICE_IMAGE=.*|AI_SERVICE_IMAGE=${GHCR_AI_SERVICE}|" \
  "${STAGING}/.env.production.example"
rm -f "${STAGING}/.env.production.example.bak"

# 写 VERSION 文件供 install.sh / upgrade.sh 读取
echo "$VERSION" > "${STAGING}/VERSION"

# 写 IMAGES 元数据文件供 install.sh / upgrade.sh 知道 pull 什么
cat > "${STAGING}/IMAGES" <<EOF
${GHCR_BACKEND}
${GHCR_FRONTEND}
${GHCR_AI_SERVICE}
EOF

chmod +x "${STAGING}/install.sh" "${STAGING}/upgrade.sh"

# ── 打 tar.gz（10KB 量级） ───────────────────────────────
log "压缩 config bundle..."
TARBALL="${OUTPUT_DIR}/${BUNDLE_NAME}.tar.gz"
tar -C "$OUTPUT_DIR" -czf "$TARBALL" "$BUNDLE_NAME"

# 校验和
if command -v sha256sum >/dev/null; then
  SHA="$(sha256sum "$TARBALL" | awk '{print $1}')"
elif command -v shasum >/dev/null; then
  SHA="$(shasum -a 256 "$TARBALL" | awk '{print $1}')"
else
  SHA="(skipped, no sha256sum)"
fi

SIZE="$(du -h "$TARBALL" | awk '{print $1}')"

# 清理 staging
rm -rf "$STAGING"

# ── 报告 ──────────────────────────────────────────────────
cat <<EOF

${C_BOLD}${C_GREEN}✓ 发布完成${C_RESET}

  Version       : ${C_BOLD}${VERSION}${C_RESET}
  Config bundle : ${TARBALL}
  Size          : ${SIZE}
  SHA-256       : ${SHA}

  Images on ghcr.io:
    ${GHCR_BACKEND}
    ${GHCR_FRONTEND}
    ${GHCR_AI_SERVICE}

${C_DIM}给客户的部署指引：${C_RESET}
  1. 把 ${BUNDLE_NAME}.tar.gz 发给客户
  2. 给客户一个 GitHub PAT（fine-grained，只授 read:packages 给本仓库 packages）
  3. 客户在服务器跑：
     ${C_BOLD}echo \$GH_PAT | docker login ghcr.io -u <github-username> --password-stdin${C_RESET}
     ${C_BOLD}tar -xzf ${BUNDLE_NAME}.tar.gz && cd ${BUNDLE_NAME} && bash install.sh${C_RESET}

${C_DIM}首次发布前请检查：${C_RESET}
  - GitHub 个人 Packages 页面把三个镜像设为 Private（默认私有，但确认一下）
  - https://github.com/${GHCR_OWNER}?tab=packages
EOF
