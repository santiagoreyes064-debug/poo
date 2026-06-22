FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY packages/ ./packages/
COPY apps/execution/ ./apps/execution/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @copy-trading/execution build

FROM node:22-alpine AS runner

RUN adduser -u 1001 -D appuser
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/execution/dist ./dist
COPY --from=builder /app/apps/execution/package.json ./package.json
COPY --from=builder /app/packages/ ./packages/

USER 1001

CMD ["node", "dist/index.js"]
