# Multi-stage build for production
# FORCE_REBUILD=2026-01-07-v2-ai-writing-teams-fix
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
RUN npx prisma generate

# Build the application
RUN npm run build

# Remove devDependencies for smaller production image
RUN npm prune --production --legacy-peer-deps

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

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts

# Make entrypoint executable
RUN chmod +x ./scripts/docker-entrypoint.sh

# Note: Running as root for Chromium compatibility in containers
# Chromium requires certain permissions that non-root users may not have

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# Start command
CMD ["./scripts/docker-entrypoint.sh"]
