# Stage 1: deps
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

RUN pnpm install --frozen-lockfile --filter @cpmind/backend...

# Stage 2: builder
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate
WORKDIR /app

COPY --from=deps /app ./
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

RUN pnpm --filter @cpmind/shared build
RUN pnpm --filter @cpmind/backend build
RUN pnpm --filter @cpmind/backend deploy --prod /app/deploy

# Stage 3: runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S cpmind && adduser -S cpmind -G cpmind

COPY --from=builder --chown=cpmind:cpmind /app/deploy/node_modules ./node_modules
COPY --from=builder --chown=cpmind:cpmind /app/packages/backend/dist ./dist
COPY --from=builder --chown=cpmind:cpmind /app/packages/backend/drizzle ./drizzle
COPY --from=builder --chown=cpmind:cpmind /app/packages/backend/package.json ./

USER cpmind

EXPOSE 3001

CMD ["node", "dist/index.js"]
