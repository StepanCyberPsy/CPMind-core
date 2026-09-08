# Stage 1: deps
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/

RUN pnpm install --frozen-lockfile --filter @cpmind/frontend...

# Stage 2: builder
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate
WORKDIR /app

COPY --from=deps /app ./
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend

ARG NEXT_PUBLIC_BACKEND_URL=""
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @cpmind/shared build
RUN pnpm --filter @cpmind/frontend build

# Stage 3: runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S cpmind && adduser -S cpmind -G cpmind

COPY --from=builder --chown=cpmind:cpmind /app/packages/frontend/.next/standalone/ ./
COPY --from=builder --chown=cpmind:cpmind /app/packages/frontend/.next/static ./packages/frontend/.next/static

RUN mkdir -p ./public && chown cpmind:cpmind ./public

USER cpmind

EXPOSE 3000

WORKDIR /app/packages/frontend
CMD ["node", "server.js"]