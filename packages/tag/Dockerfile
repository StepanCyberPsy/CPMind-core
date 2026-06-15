FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/tag/package.json ./packages/tag/

RUN pnpm install --frozen-lockfile --filter @cpmind/tag...

COPY tsconfig.base.json ./
COPY packages/tag ./packages/tag

RUN pnpm --filter @cpmind/tag build

FROM alpine:3.19 AS export
COPY --from=builder /app/packages/tag/dist/cpmind-tag.min.js /dist/cpmind-tag.min.js
CMD ["sh", "-c", "cp /dist/cpmind-tag.min.js /output/cpmind-tag.min.js"]