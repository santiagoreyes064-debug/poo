# Solana Copy Trading Platform

A non-custodial, on-chain vault-based copy trading platform for Solana. Users can follow top traders and automatically copy their trades through custom vault programs without ever sharing private keys.

## Architecture

```
+------------------+     +------------------+     +------------------+
|   Frontend       |     |   API Gateway    |     |  Wallet Monitor  |
|   (Next.js)      |<--->|   (REST + WS)    |     |  (Helius WS)    |
+------------------+     +------------------+     +------------------+
                                |                         |
                                v                         v
+------------------+     +------------------+     +------------------+
|   Analytics      |     |   Copy Engine    |<----|   TX Parser      |
|   (Cron)         |     |   (Consumer)     |     |   (Consumer)     |
+------------------+     +------------------+     +------------------+
                                |                         |
                                v                         |
+------------------+     +------------------+            |
|   Notification   |     |   Execution      |            |
|   (Consumer)     |     |   (Jito Bundle)  |            |
+------------------+     +------------------+            |
                                |                         |
                                v                         v
+------------------+     +------------------+     +------------------+
|   PostgreSQL     |     |   Redis Streams  |     |  Solana RPC      |
+------------------+     +------------------+     +------------------+
                                                         |
                                                         v
                                                  +------------------+
                                                  |  On-Chain Vault  |
                                                  |  (Anchor Program)|
                                                  +------------------+
```

## Key Design Decisions

- **Non-custodial**: Users maintain full control of funds via on-chain vaults
- **Vault pattern**: Deposits, risk parameters, and authorization are all on-chain
- **No per-trade signing**: The vault program allows execution within user-defined parameters
- **Jito bundles**: Copy trades execute via Jito for MEV protection and speed
- **Redis Streams**: Event-driven microservice communication with consumer groups
- **Risk engine**: Pure, testable function that validates every trade before execution

## Quickstart

```bash
# 1. Clone the repository
git clone <repo-url>
cd poo

# 2. Install dependencies
pnpm install

# 3. Copy environment variables
cp .env.example .env

# 4. Start infrastructure
docker compose up -d postgres redis

# 5. Start all services in development
pnpm dev
```

> **Note:** The `pnpm dev` command will automatically generate the Prisma client and run any pending migrations in development mode. For production, use `docker compose up -d` to run the full stack including the migration service.

## Project Structure

```
apps/
  api-gateway/       # REST API + WebSocket server
  wallet-monitor/    # Monitors trader wallets via Helius
  tx-parser/         # Parses swap transactions from monitored wallets
  copy-engine/       # Decides whether to copy a trade (risk checks)
  execution/         # Executes copy trades via Jito bundles
  analytics/         # Computes trader performance metrics
  notification/      # Sends notifications (Telegram, Discord, Email)
  frontend/          # Next.js web application

packages/
  shared-types/      # TypeScript interfaces and enums
  database/          # Prisma schema and client
  risk-engine/       # Pure risk check engine
  dex-adapters/      # DEX transaction parsers (Jupiter, Raydium, Orca, Meteora)
```

## Documentation

- [Local Development Guide](docs/LOCAL_DEVELOPMENT.md)
