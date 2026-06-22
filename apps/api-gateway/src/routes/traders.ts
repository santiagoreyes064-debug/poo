import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@copy-trading/database';
import { getRedisClient } from '../services/redis.js';

interface LeaderboardQuery {
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  perPage?: number;
  minTrades?: number;
}

interface SearchQuery {
  q?: string;
  page?: number;
  perPage?: number;
}

interface TraderParams {
  id: string;
}

interface AddTraderBody {
  walletAddress: string;
  label?: string;
}

export async function traderRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/traders/leaderboard (public - no auth required)
  app.get<{ Querystring: LeaderboardQuery }>('/leaderboard', async (request, reply) => {
    const {
      sort = 'roi7d',
      order = 'desc',
      page = 1,
      perPage = 20,
      minTrades = 0,
    } = request.query;

    // Check Redis cache
    const redis = getRedisClient();
    const cacheKey = `leaderboard:${sort}:${order}:${page}:${perPage}:${minTrades}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return reply.send(JSON.parse(cached));
    }

    const pageNum = Number(page);
    const perPageNum = Number(perPage);

    // Build orderBy dynamically based on sort field
    const allowedSortFields = ['roi7d', 'roi30d', 'winRate', 'sharpeRatio', 'maxDrawdown', 'totalTrades'];
    const sortField = allowedSortFields.includes(sort) ? sort : 'roi7d';
    const orderBy: Record<string, string> = { [sortField]: order === 'asc' ? 'asc' : 'desc' };

    const where = {
      totalTrades: { gte: Number(minTrades) },
    };

    const [traders, total] = await Promise.all([
      prisma.trader.findMany({
        where,
        orderBy,
        skip: (pageNum - 1) * perPageNum,
        take: perPageNum,
      }),
      prisma.trader.count({ where }),
    ]);

    const result = {
      traders,
      total,
      page: pageNum,
      perPage: perPageNum,
    };

    // Cache for 60 seconds
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 60);

    return reply.send(result);
  });

  // GET /api/v1/traders/search (public - no auth required)
  app.get<{ Querystring: SearchQuery }>('/search', async (request, reply) => {
    const { q = '', page = 1, perPage = 20 } = request.query;

    const pageNum = Number(page);
    const perPageNum = Number(perPage);

    const where = {
      OR: [
        { walletAddress: { contains: q, mode: 'insensitive' as const } },
        { label: { contains: q, mode: 'insensitive' as const } },
      ],
    };

    const [traders, total] = await Promise.all([
      prisma.trader.findMany({
        where,
        skip: (pageNum - 1) * perPageNum,
        take: perPageNum,
      }),
      prisma.trader.count({ where }),
    ]);

    return reply.send({
      traders,
      total,
      page: pageNum,
      perPage: perPageNum,
    });
  });

  // GET /api/v1/traders/:id
  app.get<{ Params: TraderParams }>('/:id', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const trader = await prisma.trader.findUnique({
      where: { id },
    });

    if (!trader) {
      return reply.status(404).send({ error: 'Trader not found' });
    }

    return reply.send({ trader });
  });

  // POST /api/v1/traders/add
  app.post<{ Body: AddTraderBody }>('/add', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { walletAddress, label } = request.body;

    if (!walletAddress) {
      return reply.status(400).send({ error: 'walletAddress is required' });
    }

    // Check if trader already exists
    const existing = await prisma.trader.findUnique({
      where: { walletAddress },
    });
    if (existing) {
      return reply.status(409).send({ error: 'Trader already tracked', trader: existing });
    }

    const newTrader = await prisma.trader.create({
      data: {
        walletAddress,
        label: label || null,
        status: 'ACTIVE',
      },
    });

    return reply.status(201).send({ trader: newTrader });
  });
}
