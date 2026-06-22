import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

const register = new Registry();

collectDefaultMetrics({ register });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

export function registerMetrics(app: FastifyInstance): void {
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const route = request.routeOptions?.url || request.url;
    httpRequestsTotal.inc({
      method: request.method,
      route,
      status_code: reply.statusCode,
    });
    httpRequestDuration.observe(
      { method: request.method, route },
      reply.elapsedTime / 1000
    );
  });
}

export async function metricsHandler(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const metrics = await register.metrics();
  reply.header('Content-Type', register.contentType);
  reply.send(metrics);
}
