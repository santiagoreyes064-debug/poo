FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY packages/ ./packages/
COPY apps/api-gateway/ ./apps/api-gateway/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @copy-trading/api-gateway build

FROM node:22-alpine AS runner

RUN adduser -u 1001 -D appuser
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api-gateway/dist ./dist
COPY --from=builder /app/apps/api-gateway/package.json ./package.json
COPY --from=builder /app/packages/ ./packages/

USER 1001

EXPOSE 3001

CMD ["node", "dist/index.js"]
