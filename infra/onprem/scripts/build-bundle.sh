#!/usr/bin/env bash
# build-bundle.sh — 开发侧打包，输出可交付给客户的 tar.gz
#
# 用法：
#   bash infra/onprem/scripts/build-bundle.sh [VERSION] [--skip-build]
#
# 示例：
#   bash infra/onprem/scripts/build-bundle.sh                 # 用 git short SHA
#   bash infra/onprem/scripts/build-bundle.sh v1.0.0          # 显式版本
#   bash infra/onprem/scripts/build-bundle.sh v1.0.0 --skip-build  # 复用现有镜像，只打包
#
# 产物：dist/onprem/genesis-bundle-<VERSION>.tar.gz

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
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)
      grep '^#' "$0" | head -20
      exit 0
      ;;
    *) VERSION="$arg" ;;
  esac
done

if [ -z "$VERSION" ]; then
  # 优先级 2: 当前 commit 是否有 git tag（release 流程下 standard-version 会打 tag）
  if TAG="$(git -C "$PROJECT_ROOT" describe --tags --exact-match HEAD 2>/dev/null)"; then
    VERSION="$TAG"
    log "VERSION 未指定，使用当前 commit 的 git tag: ${C_BOLD}${VERSION}${C_RESET}"
  # 优先级 3: package.json version + git short SHA（开发/测试 build）
  elif [ -f "${PROJECT_ROOT}/package.json" ] \
       && SHA="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null)" \
       && command -v node >/dev/null; then
    PKG_VER="$(node -p "require('${PROJECT_ROOT}/package.json').version" 2>/dev/null || echo "")"
    if [ -n "$PKG_VER" ]; then
      VERSION="${PKG_VER}-${SHA}"
      log "VERSION 未指定，使用 package.json version + git SHA: ${C_BOLD}${VERSION}${C_RESET}"
    fi
  fi
  # 优先级 4: 兜底纯 git SHA
  if [ -z "$VERSION" ]; then
    if SHA="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null)"; then
      VERSION="$SHA"
      log "VERSION 未指定，使用 git short SHA: ${C_BOLD}${VERSION}${C_RESET}"
    else
      die "VERSION 未指定，且既不在 git 仓库也无 package.json"
    fi
  fi
fi

# ── 环境检查 ──────────────────────────────────────────────
command -v docker >/dev/null || die "需要 docker"
docker info >/dev/null 2>&1 || die "docker daemon 未运行"
command -v tar    >/dev/null || die "需要 tar"

BACKEND_IMAGE="genesis/backend:${VERSION}"
FRONTEND_IMAGE="genesis/frontend:${VERSION}"
AI_SERVICE_IMAGE="genesis/ai-service:${VERSION}"

# ── Build 镜像 ────────────────────────────────────────────
if [ "$SKIP_BUILD" -eq 0 ]; then
  log "Building backend (这一步最慢，~10 分钟)..."
  docker build -t "$BACKEND_IMAGE" "${PROJECT_ROOT}/backend"

  log "Building frontend..."
  docker build -t "$FRONTEND_IMAGE" "${PROJECT_ROOT}/frontend"

  log "Building ai-service..."
  docker build -t "$AI_SERVICE_IMAGE" "${PROJECT_ROOT}/ai-service"
else
  warn "--skip-build 模式：假定 ${VERSION} 三个镜像已经在本地"
  for img in "$BACKEND_IMAGE" "$FRONTEND_IMAGE" "$AI_SERVICE_IMAGE"; do
    docker image inspect "$img" >/dev/null 2>&1 \
      || die "镜像 $img 不存在，请去掉 --skip-build 或先 build"
  done
fi

# ── Staging ───────────────────────────────────────────────
OUTPUT_DIR="${PROJECT_ROOT}/dist/onprem"
BUNDLE_NAME="genesis-bundle-${VERSION}"
STAGING="${OUTPUT_DIR}/${BUNDLE_NAME}"

mkdir -p "$STAGING"
rm -rf "$STAGING"/*

log "导出镜像到 images.tar (~3.4GB)..."
docker save \
  "$BACKEND_IMAGE" \
  "$FRONTEND_IMAGE" \
  "$AI_SERVICE_IMAGE" \
  -o "${STAGING}/images.tar"

log "拷贝部署配置文件..."
cp "${ONPREM_DIR}/docker-compose.yml"            "${STAGING}/"
cp "${ONPREM_DIR}/.env.production.example"       "${STAGING}/"
cp "${ONPREM_DIR}/README.md"                     "${STAGING}/"
cp "${ONPREM_DIR}/scripts/install.sh"            "${STAGING}/"
cp "${ONPREM_DIR}/scripts/upgrade.sh"            "${STAGING}/"

# 把镜像 tag 注入到 .env.production.example 默认值
sed -i.bak \
  -e "s|^BACKEND_IMAGE=.*|BACKEND_IMAGE=${BACKEND_IMAGE}|" \
  -e "s|^FRONTEND_IMAGE=.*|FRONTEND_IMAGE=${FRONTEND_IMAGE}|" \
  -e "s|^AI_SERVICE_IMAGE=.*|AI_SERVICE_IMAGE=${AI_SERVICE_IMAGE}|" \
  "${STAGING}/.env.production.example"
rm -f "${STAGING}/.env.production.example.bak"

# 写 VERSION 文件供 install.sh / upgrade.sh 读取
echo "$VERSION" > "${STAGING}/VERSION"

chmod +x "${STAGING}/install.sh" "${STAGING}/upgrade.sh"

# ── 打 tar.gz ─────────────────────────────────────────────
log "打 tar.gz..."
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

# ── 清理 staging（tar.gz 已含全部内容） ──────────────────
rm -rf "$STAGING"

# ── 报告 ──────────────────────────────────────────────────
cat <<EOF

${C_BOLD}${C_GREEN}✓ Bundle 打包完成${C_RESET}

  Version  : ${C_BOLD}${VERSION}${C_RESET}
  Tarball  : ${TARBALL}
  Size     : ${SIZE}
  SHA-256  : ${SHA}

${C_DIM}下一步：${C_RESET}
  1. 把 ${BUNDLE_NAME}.tar.gz 通过私有渠道发给客户（SFTP/U 盘/私有 registry）
  2. 把 SHA-256 通过另一个渠道发给客户做校验
  3. 客户在服务器跑：
     ${C_BOLD}bash <(tar -xzOf ${BUNDLE_NAME}.tar.gz ${BUNDLE_NAME}/install.sh) ${BUNDLE_NAME}.tar.gz${C_RESET}
     或先解压再跑：
     ${C_BOLD}tar -xzf ${BUNDLE_NAME}.tar.gz && bash ${BUNDLE_NAME}/install.sh ${BUNDLE_NAME}.tar.gz${C_RESET}
EOF
