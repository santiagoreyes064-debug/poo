import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@copy-trading/database';

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
  channel: 'TELEGRAM' | 'DISCORD' | 'EMAIL' | 'WEBHOOK';
  target: string;
  enabled: boolean;
  onTradeExecuted: boolean;
  onTradeFailed: boolean;
  onDailyLoss: boolean;
  onTraderPaused: boolean;
}

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  // All dashboard routes require authentication
  app.addHook('preHandler', app.authenticate);

  // GET /api/v1/dashboard - Overview data
  app.get('/', async (request, reply) => {
    const user = request.user;

    const [activeCopies, vault, totalTrades] = await Promise.all([
      prisma.copyRelation.count({
        where: { userId: user.userId, enabled: true },
      }),
      prisma.vault.findFirst({
        where: { userId: user.userId },
        select: { availableSol: true, depositedSol: true },
      }),
      prisma.copyTrade.count({
        where: { userId: user.userId },
      }),
    ]);

    return reply.send({
      userId: user.userId,
      totalPnlSol: 0,
      totalPnlUsd: 0,
      totalTrades,
      winRate: 0,
      activeCopies,
      vaultBalance: vault?.availableSol ?? 0,
    });
  });

  // GET /api/v1/dashboard/trades - Recent trades
  app.get<{ Querystring: TradesQuery }>('/trades', async (request, reply) => {
    const user = request.user;
    const { page = 1, perPage = 20, status } = request.query;

    const pageNum = Number(page);
    const perPageNum = Number(perPage);

    const where: Record<string, unknown> = { userId: user.userId };
    if (status) {
      where.status = status;
    }

    const [trades, total] = await Promise.all([
      prisma.copyTrade.findMany({
        where,
        orderBy: { settledAt: 'desc' },
        skip: (pageNum - 1) * perPageNum,
        take: perPageNum,
        include: { originalTrade: true },
      }),
      prisma.copyTrade.count({ where }),
    ]);

    return reply.send({
      trades,
      total,
      page: pageNum,
      perPage: perPageNum,
    });
  });

  // GET /api/v1/dashboard/tokens - Token performance breakdown
  app.get<{ Querystring: TokensQuery }>('/tokens', async (request, reply) => {
    const user = request.user;
    const { page = 1, perPage = 20 } = request.query;

    const pageNum = Number(page);
    const perPageNum = Number(perPage);

    // Aggregate token performance from user's copy trades
    const trades = await prisma.copyTrade.findMany({
      where: { userId: user.userId, status: 'CONFIRMED' },
      include: { originalTrade: { select: { tokenOut: true } } },
    });

    // Group by tokenOut for a simple token breakdown
    const tokenMap = new Map<string, { count: number; totalPnl: number }>();
    for (const trade of trades) {
      const token = trade.originalTrade.tokenOut;
      const existing = tokenMap.get(token) || { count: 0, totalPnl: 0 };
      existing.count += 1;
      existing.totalPnl += trade.pnlSol ?? 0;
      tokenMap.set(token, existing);
    }

    const tokens = Array.from(tokenMap.entries())
      .map(([mint, data]) => ({ mint, ...data }))
      .sort((a, b) => b.count - a.count);

    const paginated = tokens.slice((pageNum - 1) * perPageNum, pageNum * perPageNum);

    return reply.send({
      tokens: paginated,
      total: tokens.length,
      page: pageNum,
      perPage: perPageNum,
    });
  });

  // PUT /api/v1/dashboard/notifications - Update notification preferences
  app.put<{ Body: { notifications: NotificationSettings[] } }>('/notifications', async (request, reply) => {
    const user = request.user;
    const { notifications } = request.body;

    if (!notifications || !Array.isArray(notifications)) {
      return reply.status(400).send({ error: 'notifications array is required' });
    }

    // Delete existing preferences and replace with new ones
    await prisma.notificationPreference.deleteMany({
      where: { userId: user.userId },
    });

    const created = await prisma.notificationPreference.createMany({
      data: notifications.map((n) => ({
        userId: user.userId,
        channel: n.channel,
        target: n.target,
        enabled: n.enabled,
        onTradeExecuted: n.onTradeExecuted,
        onTradeFailed: n.onTradeFailed,
        onDailyLoss: n.onDailyLoss,
        onTraderPaused: n.onTraderPaused,
      })),
    });

    const savedPrefs = await prisma.notificationPreference.findMany({
      where: { userId: user.userId },
    });

    return reply.send({
      notifications: savedPrefs,
    });
  });
}
