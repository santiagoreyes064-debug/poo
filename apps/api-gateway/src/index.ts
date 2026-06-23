import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import fastifyWebsocket from '@fastify/websocket';
import { registerMetrics, metricsHandler } from './plugins/metrics.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { traderRoutes } from './routes/traders.js';
import { copyRoutes } from './routes/copy.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { vaultRoutes } from './routes/vault.js';
import { wsHandler } from './ws/handler.js';

export const SERVICE_NAME = 'api-gateway';

export async function buildApp(opts: {
  jwtSecret?: string;
  redisUrl?: string;
  disableRateLimit?: boolean;
} = {}) {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  // Resolve JWT secret with production safety check
  const jwtSecret = opts.jwtSecret || process.env.JWT_SECRET || 'dev-secret-change-in-production';
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    const insecureValues = ['dev-secret-change-in-production', 'dev-jwt-secret'];
    if (!process.env.JWT_SECRET || insecureValues.includes(jwtSecret)) {
      throw new Error(
        'FATAL: JWT_SECRET must be set to a secure value in production. ' +
        'Cannot use default/dev secret values.'
      );
    }
  }

  // CORS
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Rate limiting
  if (!opts.disableRateLimit) {
    await app.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });
  }

  // JWT
  await app.register(fastifyJwt, {
    secret: jwtSecret,
    sign: {
      expiresIn: '7d',
    },
  });

  // WebSocket
  await app.register(fastifyWebsocket);

  // Auth plugin (decorators)
  await app.register(authPlugin);

  // Prometheus metrics
  registerMetrics(app);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', service: SERVICE_NAME, timestamp: new Date().toISOString() };
  });

  // Metrics endpoint
  app.get('/metrics', metricsHandler);

  // API routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(traderRoutes, { prefix: '/api/v1/traders' });
  await app.register(copyRoutes, { prefix: '/api/v1/copy' });
  await app.register(dashboardRoutes, { prefix: '/api/v1/dashboard' });
  await app.register(vaultRoutes, { prefix: '/api/v1/vault' });

  // WebSocket
  await app.register(wsHandler);

  return app;
}

// Start server if run directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const port = parseInt(process.env.PORT || '3001', 10);
  const host = process.env.HOST || '0.0.0.0';

  const app = await buildApp();
  try {
    await app.listen({ port, host });
    console.log(`${SERVICE_NAME} listening on ${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
