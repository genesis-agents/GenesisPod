FROM node:20-alpine AS builder

# 设置 UTF-8 编码环境
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# 接收构建时参数 - Railway 会自动传递同名环境变量作为 build args
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AI_URL

# 设置为环境变量供 npm run build 使用
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AI_URL=$NEXT_PUBLIC_AI_URL

# ★ 2026-05-27 onprem 部署支持: 强制 next.config.js rewrites 烤一个占位符进
#   routes-manifest.json (而不是默认的 https://api.gens.team), 容器启动时由
#   entrypoint sed 把占位符替换成运行时 API_INTERNAL_URL。否则 routes-manifest
#   被烤死 → onprem 客户跑本地容器时 API 请求仍路由到 Railway prod。
ENV API_INTERNAL_URL=__GENESIS_API_URL_PLACEHOLDER__

RUN apk add --no-cache git

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm install

COPY . .
RUN npm run build

# ── Runtime stage (standalone mode) ──────────────────────────────
FROM node:20-alpine

ENV NODE_ENV=production
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

WORKDIR /app

RUN apk add --no-cache dumb-init

# standalone 模式只需复制三个目录，无需 npm install
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# ★ 2026-05-27 onprem entrypoint: 启动前把 routes-manifest.json 里 baked 的
#   __GENESIS_API_URL_PLACEHOLDER__ 替换为运行时 API_INTERNAL_URL (默认空字符串
#   = 用 Railway 公网 api.gens.team)。
COPY <<'EOF' /app/entrypoint.sh
#!/bin/sh
set -e
TARGET="/app/.next/routes-manifest.json"
if [ -f "$TARGET" ]; then
  API_URL="${API_INTERNAL_URL:-https://api.gens.team}"
  if [ "$API_URL" != "__GENESIS_API_URL_PLACEHOLDER__" ]; then
    sed -i "s|__GENESIS_API_URL_PLACEHOLDER__|${API_URL}|g" "$TARGET"
    echo "[entrypoint] rewrites routes-manifest API URL -> ${API_URL}"
  fi
fi
exec node --insecure-http-parser server.js
EOF

RUN chmod +x /app/entrypoint.sh

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
RUN chown -R nextjs:nodejs /app
USER nextjs

# Railway 会动态设置 PORT，不硬编码
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["/app/entrypoint.sh"]
