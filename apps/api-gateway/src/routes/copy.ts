import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { CopyRelation, CopyMode } from '@copy-trading/shared-types';
import { writeAuditLog, AuditAction } from '../services/audit.js';

interface CopyParams {
  id: string;
}

interface SubscribeBody {
  traderId: string;
  copyMode: CopyMode;
  fixedAmountSol?: number;
  proportionPct?: number;
  maxTradeSizeSol: number;
  maxSlippageBps: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  maxDailyLossSol?: number;
  maxOpenPositions?: number;
  tokenBlacklist?: string[];
}

interface UpdateBody {
  maxTradeSizeSol?: number;
  maxSlippageBps?: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  maxDailyLossSol?: number;
  maxOpenPositions?: number;
  tokenBlacklist?: string[];
  copyMode?: CopyMode;
  fixedAmountSol?: number;
  proportionPct?: number;
}

interface TradesQuery {
  page?: number;
  perPage?: number;
}

// Whitelist of updatable fields
const UPDATABLE_FIELDS: (keyof UpdateBody)[] = [
  'maxTradeSizeSol',
  'maxSlippageBps',
  'stopLossPct',
  'takeProfitPct',
  'maxDailyLossSol',
  'maxOpenPositions',
  'tokenBlacklist',
  'copyMode',
  'fixedAmountSol',
  'proportionPct',
];

// In-memory store for development
const copyRelations: CopyRelation[] = [];

export async function copyRoutes(app: FastifyInstance): Promise<void> {
  // All copy routes require authentication
  app.addHook('preHandler', app.authenticate);

  // GET /api/v1/copy - List user's copy relations
  app.get('/', async (request, reply) => {
    const user = request.user;
    const userCopies = copyRelations.filter((c) => c.userId === user.userId);
    return reply.send({ copies: userCopies });
  });

  // POST /api/v1/copy/subscribe - Create a new copy relation
  app.post<{ Body: SubscribeBody }>('/subscribe', async (request, reply) => {
    const user = request.user;
    const body = request.body;

    if (!body.traderId) {
      return reply.status(400).send({ error: 'traderId is required' });
    }

    if (!body.copyMode) {
      return reply.status(400).send({ error: 'copyMode is required' });
    }

    if (!body.maxTradeSizeSol || !body.maxSlippageBps) {
      return reply.status(400).send({ error: 'maxTradeSizeSol and maxSlippageBps are required' });
    }

    // Check for duplicate subscription
    const existing = copyRelations.find(
      (c) => c.userId === user.userId && c.traderId === body.traderId
    );
    if (existing) {
      return reply.status(409).send({ error: 'Already subscribed to this trader' });
    }

    const newCopy: CopyRelation = {
      id: `copy_${Date.now()}`,
      userId: user.userId,
      traderId: body.traderId,
      enabled: true,
      copyMode: body.copyMode,
      fixedAmountSol: body.fixedAmountSol,
      proportionPct: body.proportionPct,
      maxTradeSizeSol: body.maxTradeSizeSol,
      maxSlippageBps: body.maxSlippageBps,
      stopLossPct: body.stopLossPct,
      takeProfitPct: body.takeProfitPct,
      maxDailyLossSol: body.maxDailyLossSol,
      maxOpenPositions: body.maxOpenPositions,
      tokenBlacklist: body.tokenBlacklist || [],
    };

    copyRelations.push(newCopy);

    writeAuditLog({
      userId: user.userId,
      action: AuditAction.COPY_SUBSCRIBED,
      metadata: { traderId: body.traderId, copyMode: body.copyMode },
      ipAddress: request.ip,
    });

    return reply.status(201).send({ copy: newCopy });
  });

  // PATCH /api/v1/copy/:id - Update copy relation (whitelisted fields only)
  app.patch<{ Params: CopyParams; Body: UpdateBody }>('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params;
    const body = request.body;

    const copy = copyRelations.find((c) => c.id === id && c.userId === user.userId);
    if (!copy) {
      return reply.status(404).send({ error: 'Copy relation not found' });
    }

    // Only update whitelisted fields
    for (const field of UPDATABLE_FIELDS) {
      if (body[field] !== undefined) {
        (copy as unknown as Record<string, unknown>)[field] = body[field];
      }
    }

    writeAuditLog({
      userId: user.userId,
      action: AuditAction.COPY_SETTINGS_UPDATED,
      metadata: { copyId: id, updatedFields: Object.keys(body) },
      ipAddress: request.ip,
    });

    return reply.send({ copy });
  });

  // DELETE /api/v1/copy/:id - Remove copy relation
  app.delete<{ Params: CopyParams }>('/:id', async (request, reply) => {
    const user = request.user;
    const { id } = request.params;

    const index = copyRelations.findIndex((c) => c.id === id && c.userId === user.userId);
    if (index === -1) {
      return reply.status(404).send({ error: 'Copy relation not found' });
    }

    copyRelations.splice(index, 1);

    writeAuditLog({
      userId: user.userId,
      action: AuditAction.COPY_UNSUBSCRIBED,
      metadata: { copyId: id },
      ipAddress: request.ip,
    });

    return reply.send({ success: true });
  });

  // POST /api/v1/copy/:id/pause - Pause copy relation
  app.post<{ Params: CopyParams }>('/:id/pause', async (request, reply) => {
    const user = request.user;
    const { id } = request.params;

    const copy = copyRelations.find((c) => c.id === id && c.userId === user.userId);
    if (!copy) {
      return reply.status(404).send({ error: 'Copy relation not found' });
    }

    copy.enabled = false;
    copy.pausedAt = new Date();
    copy.pauseReason = 'User paused';

    return reply.send({ copy });
  });

  // POST /api/v1/copy/:id/resume - Resume copy relation
  app.post<{ Params: CopyParams }>('/:id/resume', async (request, reply) => {
    const user = request.user;
    const { id } = request.params;

    const copy = copyRelations.find((c) => c.id === id && c.userId === user.userId);
    if (!copy) {
      return reply.status(404).send({ error: 'Copy relation not found' });
    }

    copy.enabled = true;
    copy.pausedAt = undefined;
    copy.pauseReason = undefined;

    return reply.send({ copy });
  });

  // GET /api/v1/copy/:id/trades - Get trades for a copy relation
  app.get<{ Params: CopyParams; Querystring: TradesQuery }>('/:id/trades', async (request, reply) => {
    const user = request.user;
    const { id } = request.params;
    const { page = 1, perPage = 20 } = request.query;

    const copy = copyRelations.find((c) => c.id === id && c.userId === user.userId);
    if (!copy) {
      return reply.status(404).send({ error: 'Copy relation not found' });
    }

    // In production, query CopyTrade table filtered by this relation
    return reply.send({
      trades: [],
      total: 0,
      page: Number(page),
      perPage: Number(perPage),
    });
  });
}
