# Stage 1: deps
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/media-worker/package.json ./packages/media-worker/

RUN pnpm install --frozen-lockfile --filter @cpmind/media-worker...

# Stage 2: builder
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate
WORKDIR /app

COPY --from=deps /app ./
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/media-worker ./packages/media-worker

RUN pnpm --filter @cpmind/shared build
RUN pnpm --filter @cpmind/media-worker build

# Stage 3: runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache ffmpeg

RUN addgroup -S cpmind && adduser -S cpmind -G cpmind
RUN mkdir -p /tmp/cpmind-worker && chown cpmind:cpmind /tmp/cpmind-worker

COPY --from=builder --chown=cpmind:cpmind /app/node_modules ./node_modules
COPY --from=builder --chown=cpmind:cpmind /app/packages/shared ./packages/shared
COPY --from=builder --chown=cpmind:cpmind /app/packages/media-worker/dist ./packages/media-worker/dist
COPY --from=builder --chown=cpmind:cpmind /app/packages/media-worker/node_modules ./packages/media-worker/node_modules
COPY --from=builder --chown=cpmind:cpmind /app/packages/media-worker/package.json ./packages/media-worker/package.json

USER cpmind

CMD ["node", "packages/media-worker/dist/index.js"]