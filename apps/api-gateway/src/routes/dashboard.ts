import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { NotificationChannel } from '@copy-trading/shared-types';

interface TradesQuery {
  page?: number;
  perPage?: number;
  status?: string;
}

interface TokensQuery {
  page?: number;
  perPage?: number;
}

interface NotificationSettings {
  channel: NotificationChannel;
  target: string;
  enabled: boolean;
  onTradeExecuted: boolean;
  onTradeFailed: boolean;
  onDailyLoss: boolean;
  onTraderPaused: boolean;
}

// In-memory notification preferences
const notificationPrefs: Map<string, NotificationSettings[]> = new Map();

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  // All dashboard routes require authentication
  app.addHook('preHandler', app.authenticate);

  // GET /api/v1/dashboard - Overview data
  app.get('/', async (request, reply) => {
    const user = request.user;

    return reply.send({
      userId: user.userId,
      totalPnlSol: 0,
      totalPnlUsd: 0,
      totalTrades: 0,
      winRate: 0,
      activeCopies: 0,
      vaultBalance: 0,
    });
  });

  // GET /api/v1/dashboard/trades - Recent trades
  app.get<{ Querystring: TradesQuery }>('/trades', async (request, reply) => {
    const { page = 1, perPage = 20, status } = request.query;

    return reply.send({
      trades: [],
      total: 0,
      page: Number(page),
      perPage: Number(perPage),
    });
  });

  // GET /api/v1/dashboard/tokens - Token performance breakdown
  app.get<{ Querystring: TokensQuery }>('/tokens', async (request, reply) => {
    const { page = 1, perPage = 20 } = request.query;

    return reply.send({
      tokens: [],
      total: 0,
      page: Number(page),
      perPage: Number(perPage),
    });
  });

  // PUT /api/v1/dashboard/notifications - Update notification preferences
  app.put<{ Body: { notifications: NotificationSettings[] } }>('/notifications', async (request, reply) => {
    const user = request.user;
    const { notifications } = request.body;

    if (!notifications || !Array.isArray(notifications)) {
      return reply.status(400).send({ error: 'notifications array is required' });
    }

    notificationPrefs.set(user.userId, notifications);

    return reply.send({
      notifications: notificationPrefs.get(user.userId) || [],
    });
  });
}
