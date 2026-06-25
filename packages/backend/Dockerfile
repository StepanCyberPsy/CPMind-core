# Stage 1: deps
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
COPY packages/tag/package.json ./packages/tag/

RUN pnpm install --frozen-lockfile --filter @cpmind/backend... --filter @cpmind/tag

# Stage 2: builder
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate
WORKDIR /app

COPY --from=deps /app ./
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
COPY packages/tag ./packages/tag

RUN pnpm --filter @cpmind/shared build
RUN pnpm --filter @cpmind/backend build

# Stage 3: runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S cpmind && adduser -S cpmind -G cpmind
RUN mkdir -p /tag_dist && chown cpmind:cpmind /tag_dist

COPY --from=builder --chown=cpmind:cpmind /app/node_modules ./node_modules
COPY --from=builder --chown=cpmind:cpmind /app/packages/shared ./packages/shared
COPY --from=builder --chown=cpmind:cpmind /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder --chown=cpmind:cpmind /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=builder --chown=cpmind:cpmind /app/packages/backend/drizzle ./packages/backend/drizzle
COPY --from=builder --chown=cpmind:cpmind /app/packages/backend/package.json ./packages/backend/package.json
COPY --from=builder --chown=cpmind:cpmind /app/packages/tag/src ./packages/tag/src
COPY --from=builder --chown=cpmind:cpmind /app/packages/tag/node_modules ./packages/tag/node_modules

USER cpmind

EXPOSE 3001

CMD ["node", "packages/backend/dist/index.js"]
