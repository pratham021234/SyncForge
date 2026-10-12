# syntax=docker/dockerfile:1

# ------------------------------------------------------------------------------
# Stage 1: Dependencies & Build
# ------------------------------------------------------------------------------
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* tsconfig.base.json tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/sdk/package.json ./packages/sdk/
COPY apps/web/package.json ./apps/web/

RUN npm ci

COPY packages/shared ./packages/shared
COPY packages/sdk ./packages/sdk
COPY apps/web ./apps/web

RUN npm run build --workspace=@syncforge/shared
RUN npm run build --workspace=@syncforge/sdk
RUN npm run build --workspace=@syncforge/web

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime
# ------------------------------------------------------------------------------
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build and static assets
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json

USER nextjs

EXPOSE 3000

CMD ["node_modules/.bin/next", "start", "apps/web", "-p", "3000"]
