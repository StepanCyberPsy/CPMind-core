# Stage 1: deps
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/embed/package.json ./packages/embed/
COPY packages/display-runtime/package.json ./packages/display-runtime/
COPY packages/player/package.json ./packages/player/
COPY packages/omid/package.json ./packages/omid/
COPY packages/creative-bridge/package.json ./packages/creative-bridge/
COPY packages/runtime-publisher/package.json ./packages/runtime-publisher/

RUN pnpm install --frozen-lockfile \
    --filter @cpmind/shared... \
    --filter @cpmind/sdk... \
    --filter @cpmind/embed... \
    --filter @cpmind/display-runtime... \
    --filter @cpmind/player... \
    --filter @cpmind/omid... \
    --filter @cpmind/creative-bridge... \
    --filter @cpmind/runtime-publisher...

# Stage 2: builder
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate
WORKDIR /app

COPY --from=deps /app ./
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/sdk ./packages/sdk
COPY packages/embed ./packages/embed
COPY packages/display-runtime ./packages/display-runtime
COPY packages/player ./packages/player
COPY packages/omid ./packages/omid
COPY packages/creative-bridge ./packages/creative-bridge
COPY packages/runtime-publisher ./packages/runtime-publisher

ARG CDN_BASE_URL
ARG CDN_HOSTNAME
ARG LOADER_RUNTIME_VERSION
ARG DISPLAY_RUNTIME_VERSION
ARG PLAYER_RUNTIME_VERSION
ARG OMID_RUNTIME_VERSION
ARG BRIDGE_VERSION

ENV CDN_BASE_URL=$CDN_BASE_URL
ENV CDN_HOSTNAME=$CDN_HOSTNAME
ENV LOADER_RUNTIME_VERSION=$LOADER_RUNTIME_VERSION
ENV DISPLAY_RUNTIME_VERSION=$DISPLAY_RUNTIME_VERSION
ENV PLAYER_RUNTIME_VERSION=$PLAYER_RUNTIME_VERSION
ENV OMID_RUNTIME_VERSION=$OMID_RUNTIME_VERSION
ENV BRIDGE_VERSION=$BRIDGE_VERSION

RUN pnpm --filter @cpmind/shared build
RUN pnpm --filter @cpmind/sdk build
RUN pnpm --filter @cpmind/embed build
RUN pnpm --filter @cpmind/display-runtime build
RUN pnpm --filter @cpmind/player build
RUN pnpm --filter @cpmind/omid build
RUN pnpm --filter @cpmind/creative-bridge build
RUN pnpm --filter @cpmind/runtime-publisher build

RUN mkdir -p /runtime-dist \
    && cp packages/embed/dist/*.min.js /runtime-dist/ \
    && cp packages/display-runtime/dist/*.min.js /runtime-dist/ \
    && cp packages/player/dist/*.min.js /runtime-dist/ \
    && cp packages/omid/dist/*.min.js /runtime-dist/ \
    && cp packages/creative-bridge/dist/*.min.js /runtime-dist/

# Stage 3: runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV RUNTIME_DIST_DIR=/app/runtime-dist

RUN addgroup -S cpmind && adduser -S cpmind -G cpmind

COPY --from=builder --chown=cpmind:cpmind /app/node_modules ./node_modules
COPY --from=builder --chown=cpmind:cpmind /app/packages/runtime-publisher/dist ./packages/runtime-publisher/dist
COPY --from=builder --chown=cpmind:cpmind /app/packages/runtime-publisher/node_modules ./packages/runtime-publisher/node_modules
COPY --from=builder --chown=cpmind:cpmind /app/packages/runtime-publisher/package.json ./packages/runtime-publisher/package.json
COPY --from=builder --chown=cpmind:cpmind /runtime-dist ./runtime-dist

USER cpmind

CMD ["node", "packages/runtime-publisher/dist/publish.js"]