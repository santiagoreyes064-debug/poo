import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Trader, TraderStatus } from '@copy-trading/shared-types';
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

// In-memory store for development (replace with database in production)
const traders: Trader[] = [];

export async function traderRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/traders/leaderboard
  app.get<{ Querystring: LeaderboardQuery }>('/leaderboard', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
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

    // Filter by minimum trades
    let filtered = traders.filter((t) => t.totalTrades >= Number(minTrades));

    // Sort
    const sortField = sort as keyof Trader;
    filtered.sort((a, b) => {
      const aVal = a[sortField] as number;
      const bVal = b[sortField] as number;
      return order === 'desc' ? bVal - aVal : aVal - bVal;
    });

    // Paginate
    const pageNum = Number(page);
    const perPageNum = Number(perPage);
    const start = (pageNum - 1) * perPageNum;
    const paginated = filtered.slice(start, start + perPageNum);

    const result = {
      traders: paginated,
      total: filtered.length,
      page: pageNum,
      perPage: perPageNum,
    };

    // Cache for 60 seconds
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 60);

    return reply.send(result);
  });

  // GET /api/v1/traders/search
  app.get<{ Querystring: SearchQuery }>('/search', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { q = '', page = 1, perPage = 20 } = request.query;

    const query = q.toLowerCase();
    const filtered = traders.filter(
      (t) =>
        t.walletAddress.toLowerCase().includes(query) ||
        (t.label && t.label.toLowerCase().includes(query))
    );

    const pageNum = Number(page);
    const perPageNum = Number(perPage);
    const start = (pageNum - 1) * perPageNum;
    const paginated = filtered.slice(start, start + perPageNum);

    return reply.send({
      traders: paginated,
      total: filtered.length,
      page: pageNum,
      perPage: perPageNum,
    });
  });

  // GET /api/v1/traders/:id
  app.get<{ Params: TraderParams }>('/:id', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const trader = traders.find((t) => t.id === id);

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
    const existing = traders.find((t) => t.walletAddress === walletAddress);
    if (existing) {
      return reply.status(409).send({ error: 'Trader already tracked', trader: existing });
    }

    const newTrader: Trader = {
      id: `trader_${Date.now()}`,
      walletAddress,
      label: label || undefined,
      status: 'ACTIVE' as TraderStatus,
      roi7d: 0,
      roi30d: 0,
      winRate: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      avgHoldTime: 0,
      totalTrades: 0,
      lastTradeAt: undefined,
    };

    traders.push(newTrader);

    return reply.status(201).send({ trader: newTrader });
  });
}
