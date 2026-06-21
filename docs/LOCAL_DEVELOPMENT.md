# Local Development Guide

This guide walks you through setting up the Solana Copy Trading platform for local development.

## Prerequisites

- **Node.js** v22 or later
- **pnpm** v10 or later (`npm install -g pnpm`)
- **Docker** and Docker Compose (for PostgreSQL and Redis)
- **Git**

## Initial Setup

### 1. Clone the Repository

```bash
git clone <repo-url>
cd solana-copy-trading
```

### 2. Install Dependencies

```bash
pnpm install
```

This will install all dependencies across the monorepo (apps and packages).

### 3. Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and fill in the required values:

- `DATABASE_URL` - PostgreSQL connection string (default works with Docker setup)
- `REDIS_URL` - Redis connection string (default works with Docker setup)
- `JWT_SECRET` - Any random string for JWT signing
- `HELIUS_API_KEY` - Get one at https://helius.dev
- `JITO_BLOCK_ENGINE_URL` - Jito block engine endpoint
- `JITO_AUTH_TOKEN` - Jito authentication token

### 4. Start Infrastructure

```bash
docker compose up postgres redis -d
```

This starts PostgreSQL on port 5432 and Redis on port 6379.

### 5. Set Up the Database

Generate the Prisma client and run migrations:

```bash
pnpm --filter database prisma generate
pnpm --filter database prisma migrate deploy
```

### 6. Build All Packages

```bash
pnpm build
```

### 7. Start Development Servers

```bash
pnpm dev
```

This starts all services in development mode with hot reload.

## Common Tasks

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @copy-trading/risk-engine test
```

### Linting and Formatting

```bash
# Lint all packages
pnpm lint

# Format all files
pnpm format
```

### Database Operations

```bash
# Validate the Prisma schema
pnpm --filter database prisma validate

# Create a new migration
pnpm --filter database prisma migrate dev --name <migration-name>

# Reset the database
pnpm --filter database prisma migrate reset
```

### Adding a Dependency

```bash
# Add to a specific package
pnpm --filter @copy-trading/api-gateway add express

# Add a dev dependency to root
pnpm add -D some-tool -w
```

## Service Ports (Development)

| Service         | Port |
|----------------|------|
| API Gateway    | 4000 |
| Frontend       | 3000 |
| PostgreSQL     | 5432 |
| Redis          | 6379 |

## Troubleshooting

### Prisma client not found

Run `pnpm --filter database prisma generate` to regenerate the Prisma client.

### Port already in use

Check if another process is using the port: `lsof -i :<port>` and kill it.

### pnpm install fails

Make sure you are using pnpm v10+. Check with `pnpm --version`.
