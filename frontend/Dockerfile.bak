FROM node:20-alpine AS builder

# 接收构建时参数 - Railway 会自动传递同名环境变量作为 build args
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AI_URL

# 设置为环境变量供 npm run build 使用
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AI_URL=$NEXT_PUBLIC_AI_URL

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache dumb-init

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs

EXPOSE 3000
ENV PORT=3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
