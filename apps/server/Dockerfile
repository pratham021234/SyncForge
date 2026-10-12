# syntax=docker/dockerfile:1

# ------------------------------------------------------------------------------
# Stage 1: Build Stage
# ------------------------------------------------------------------------------
FROM node:24-alpine AS builder

WORKDIR /app

# Copy root configuration and manifests
COPY package.json package-lock.json* tsconfig.base.json tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/sdk/package.json ./packages/sdk/
COPY apps/server/package.json ./apps/server/

# Install all workspace dependencies
RUN npm ci

# Copy package and server source code
COPY packages/shared ./packages/shared
COPY packages/sdk ./packages/sdk
COPY apps/server ./apps/server

# Build shared package and server
RUN npm run build --workspace=@syncforge/shared
RUN npm run build --workspace=@syncforge/server

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime
# ------------------------------------------------------------------------------
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV SERVER_HOST=0.0.0.0
ENV SERVER_PORT=4000

# Install dumb-init for proper signal forwarding and zombie process reaping
RUN apk add --no-cache dumb-init

# Copy root manifests and production dependencies
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/dist ./packages/shared/dist
COPY apps/server/package.json ./apps/server/
COPY apps/server/dist ./apps/server/dist
COPY apps/server/src/infrastructure/migrations/*.sql ./apps/server/dist/infrastructure/migrations/

# Install only production dependencies
RUN npm ci --omit=dev

# Run as non-root user
USER node

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/healthz || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "apps/server/dist/server.js"]
