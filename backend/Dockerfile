# Multi-stage build for production
# FORCE_REBUILD=2026-01-07-v3-revert-teams-direct-import
FROM node:20-slim AS builder

# Install dependencies for native modules (canvas requires cairo, pango, etc.)
# Also install Chromium dependencies for Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    pkg-config \
    bzip2 \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to skip downloading Chromium during npm install (we'll use system Chromium)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Copy package files
COPY package.json ./

# Copy Prisma schema
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for build)
RUN npm install --no-package-lock --legacy-peer-deps

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate --schema=prisma/schema

# Build the application
RUN npm run build

# Remove devDependencies for smaller production image
RUN npm prune --production --legacy-peer-deps

# Strip non-essential files from node_modules (~30-40% smaller)
RUN find node_modules -name "*.d.ts" -delete 2>/dev/null; \
    find node_modules -name "*.d.ts.map" -delete 2>/dev/null; \
    find node_modules -name "*.js.map" -delete 2>/dev/null; \
    find node_modules -name "*.ts" ! -name "*.d.ts" -path "*/src/*" -delete 2>/dev/null; \
    find node_modules \( -name "README*" -o -name "CHANGELOG*" -o -name "HISTORY*" \
      -o -name "CONTRIBUTING*" -o -name "SECURITY*" -o -name "AUTHORS*" \
      -o -name ".eslintrc*" -o -name ".prettierrc*" -o -name ".babelrc*" \
      -o -name "tsconfig*" -o -name ".npmignore" -o -name ".gitignore" \
      -o -name ".editorconfig" -o -name "Makefile" -o -name "Gruntfile*" \
      -o -name "Gulpfile*" -o -name ".travis.yml" -o -name "appveyor.yml" \
      -o -name ".DS_Store" -o -name "*.tsbuildinfo" \) -delete 2>/dev/null; \
    find node_modules -type d \( -name "test" -o -name "tests" -o -name "__tests__" \
      -o -name "__mocks__" -o -name "docs" -o -name "example" \
      -o -name "examples" -o -name ".github" -o -name "coverage" \
      -o -name "benchmark" -o -name "benchmarks" \) -exec rm -rf {} + 2>/dev/null; \
    true

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

# Install curl for healthcheck, OpenSSL for Prisma, runtime libs for canvas,
# Chromium for Puppeteer, and Chinese fonts for infographics
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    openssl \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libpixman-1-0 \
    # Chromium and dependencies for Puppeteer
    chromium \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    # Chinese fonts for infographic text rendering
    fonts-noto-cjk \
    fonts-wqy-zenhei \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer and Playwright to use system Chromium with --no-sandbox for non-root
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROMIUM_FLAGS="--no-sandbox --disable-setuid-sandbox"
# 生产环境标识 - 控制日志级别为 error/warn
ENV NODE_ENV=production

# Create non-root user for security
RUN groupadd --gid 1001 raven && \
    useradd --uid 1001 --gid raven --shell /bin/bash --create-home raven

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts

# Make entrypoint executable and set ownership
RUN chmod +x ./scripts/devops/docker-entrypoint.sh && \
    chown -R raven:raven /app

# Switch to non-root user
USER raven

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# Start command
CMD ["./scripts/devops/docker-entrypoint.sh"]
