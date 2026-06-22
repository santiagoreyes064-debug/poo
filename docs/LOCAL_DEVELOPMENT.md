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

## Docker Compose Usage

### Running the Full Stack

To run all services including the application containers:

```bash
docker compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)
- All microservices (api-gateway on port 3001, frontend on port 3000)
- Prometheus (port 9090)
- Grafana (port 3002)

### Running Individual Services

You can start specific services and their dependencies:

```bash
# Start only the API gateway and its dependencies
docker compose up api-gateway -d

# Start only the copy engine pipeline
docker compose up wallet-monitor tx-parser copy-engine execution -d

# Start only infrastructure (database + cache)
docker compose up postgres redis -d
```

### Rebuilding Services

After making code changes, rebuild the affected service:

```bash
# Rebuild a specific service
docker compose build api-gateway

# Rebuild and restart
docker compose up api-gateway -d --build

# Rebuild all services
docker compose build
```

### Viewing Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api-gateway

# Last 100 lines
docker compose logs --tail=100 copy-engine
```

### Stopping Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (resets all data)
docker compose down -v
```

## Monitoring and Metrics

### Prometheus

Prometheus is available at http://localhost:9090. It scrapes metrics from all services on their `/metrics` endpoint every 15 seconds.

To query metrics:
1. Open http://localhost:9090 in your browser
2. Use PromQL to query (e.g., `rate(http_requests_total[5m])`)

### Grafana

Grafana is available at http://localhost:3002. Default credentials:
- Username: `admin`
- Password: `admin` (or the value of `GF_SECURITY_ADMIN_PASSWORD` in your `.env`)

A pre-configured dashboard ("Solana Copy Trading") is provisioned automatically with panels for:
- Request rate per service
- Error rate per service
- Trade execution latency (p50 and p95)
- Active WebSocket connections

The Prometheus datasource is configured automatically.

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

## Service Ports

| Service         | Port | Description              |
|----------------|------|--------------------------|
| Frontend       | 3000 | Next.js web application  |
| API Gateway    | 3001 | REST API + WebSocket     |
| PostgreSQL     | 5432 | Database                 |
| Redis          | 6379 | Cache and message broker |
| Prometheus     | 9090 | Metrics collection       |
| Grafana        | 3002 | Metrics dashboards       |

## Troubleshooting

### Prisma client not found

Run `pnpm --filter database prisma generate` to regenerate the Prisma client.

### Port already in use

Check if another process is using the port:

```bash
lsof -i :<port>
```

Kill the process or stop the conflicting service.

### pnpm install fails

Make sure you are using pnpm v10+. Check with `pnpm --version`.

### Docker containers fail to start

Check container logs for errors:

```bash
docker compose logs <service-name>
```

Common issues:
- Port conflicts: another service is using the same port
- Missing environment variables: make sure `.env` is properly configured
- Database not ready: the `migrate` service handles waiting for postgres, but if running manually, wait for the healthcheck to pass

### Database connection refused

Ensure PostgreSQL is running and healthy:

```bash
docker compose ps postgres
```

If the status does not show "healthy", check the logs:

```bash
docker compose logs postgres
```

### Redis connection refused

Ensure Redis is running and healthy:

```bash
docker compose ps redis
```

### Services crash on startup

1. Check that all environment variables are set in `.env`
2. Ensure database migrations have been applied
3. Check service logs: `docker compose logs <service>`

### Build fails

Clear the build cache and rebuild:

```bash
# Clean all dist directories
rm -rf apps/*/dist packages/*/dist

# Rebuild
pnpm build
```

### Docker build cache issues

Force a clean rebuild of Docker images:

```bash
docker compose build --no-cache
```
