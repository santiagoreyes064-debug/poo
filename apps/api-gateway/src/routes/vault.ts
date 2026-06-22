import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@copy-trading/database';
import { writeAuditLog, AuditAction } from '../services/audit.js';

interface VaultParams {
  id?: string;
}

interface CreateVaultBody {
  walletId: string;
  publicKey: string;
  authority: string;
  maxTradeSizeSol?: number;
  maxDailyLossSol?: number;
  maxSlippageBps?: number;
  maxOpenPositions?: number;
  allowedDexs?: string[];
  tokenBlacklist?: string[];
}

interface DepositBody {
  amount: number;
  signature: string;
}

interface WithdrawBody {
  amount: number;
  signature: string;
}

interface VaultSettingsBody {
  maxTradeSizeSol?: number;
  maxDailyLossSol?: number;
  maxSlippageBps?: number;
  maxOpenPositions?: number;
  allowedDexs?: string[];
  tokenBlacklist?: string[];
}

interface TransactionsQuery {
  page?: number;
  perPage?: number;
  type?: string;
}

export async function vaultRoutes(app: FastifyInstance): Promise<void> {
  // All vault routes require authentication
  app.addHook('preHandler', app.authenticate);

  // POST /api/v1/vault/create - Create a new vault
  app.post<{ Body: CreateVaultBody }>('/create', async (request, reply) => {
    const user = request.user;
    const body = request.body;

    if (!body.walletId || !body.publicKey || !body.authority) {
      return reply.status(400).send({
        error: 'walletId, publicKey, and authority are required',
      });
    }

    // Check if user already has a vault
    const existing = await prisma.vault.findFirst({
      where: { userId: user.userId },
    });
    if (existing) {
      return reply.status(409).send({ error: 'User already has a vault' });
    }

    const vault = await prisma.vault.create({
      data: {
        userId: user.userId,
        walletId: body.walletId,
        publicKey: body.publicKey,
        authority: body.authority,
        maxTradeSizeSol: body.maxTradeSizeSol ?? 1.0,
        maxDailyLossSol: body.maxDailyLossSol ?? 5.0,
        maxSlippageBps: body.maxSlippageBps ?? 300,
        maxOpenPositions: body.maxOpenPositions ?? 5,
        allowedDexs: body.allowedDexs ?? ['JUPITER', 'RAYDIUM'],
        tokenBlacklist: body.tokenBlacklist ?? [],
        depositedSol: 0,
        availableSol: 0,
        isPaused: false,
      },
    });

    writeAuditLog({
      userId: user.userId,
      action: AuditAction.VAULT_CREATED,
      metadata: { vaultId: vault.id, publicKey: vault.publicKey },
      ipAddress: request.ip,
    });

    return reply.status(201).send({ vault });
  });

  // GET /api/v1/vault - Get user's vault
  app.get('/', async (request, reply) => {
    const user = request.user;
    const vault = await prisma.vault.findFirst({
      where: { userId: user.userId },
    });

    if (!vault) {
      return reply.status(404).send({ error: 'Vault not found' });
    }

    return reply.send({ vault });
  });

  // GET /api/v1/vault/balance - Get vault balance
  app.get('/balance', async (request, reply) => {
    const user = request.user;
    const vault = await prisma.vault.findFirst({
      where: { userId: user.userId },
    });

    if (!vault) {
      return reply.status(404).send({ error: 'Vault not found' });
    }

    return reply.send({
      depositedSol: vault.depositedSol,
      availableSol: vault.availableSol,
      lockedSol: vault.depositedSol - vault.availableSol,
    });
  });

  // POST /api/v1/vault/deposit - Record a deposit
  app.post<{ Body: DepositBody }>('/deposit', async (request, reply) => {
    const user = request.user;
    const { amount, signature } = request.body;

    if (!amount || amount <= 0) {
      return reply.status(400).send({ error: 'amount must be a positive number' });
    }

    if (!signature) {
      return reply.status(400).send({ error: 'signature is required' });
    }

    const vault = await prisma.vault.findFirst({
      where: { userId: user.userId },
    });
    if (!vault) {
      return reply.status(404).send({ error: 'Vault not found' });
    }

    const updatedVault = await prisma.vault.update({
      where: { id: vault.id },
      data: {
        depositedSol: vault.depositedSol + amount,
        availableSol: vault.availableSol + amount,
      },
    });

    const transaction = await prisma.vaultTransaction.create({
      data: {
        vaultId: vault.id,
        type: 'DEPOSIT',
        amount,
        signature,
        timestamp: new Date(),
      },
    });

    writeAuditLog({
      userId: user.userId,
      action: AuditAction.VAULT_DEPOSIT,
      metadata: { vaultId: vault.id, amount, signature },
      ipAddress: request.ip,
    });

    return reply.send({ vault: updatedVault, transaction });
  });

  // POST /api/v1/vault/withdraw - Record a withdrawal
  app.post<{ Body: WithdrawBody }>('/withdraw', async (request, reply) => {
    const user = request.user;
    const { amount, signature } = request.body;

    if (!amount || amount <= 0) {
      return reply.status(400).send({ error: 'amount must be a positive number' });
    }

    if (!signature) {
      return reply.status(400).send({ error: 'signature is required' });
    }

    const vault = await prisma.vault.findFirst({
      where: { userId: user.userId },
    });
    if (!vault) {
      return reply.status(404).send({ error: 'Vault not found' });
    }

    if (vault.availableSol < amount) {
      return reply.status(400).send({ error: 'Insufficient available balance' });
    }

    const updatedVault = await prisma.vault.update({
      where: { id: vault.id },
      data: {
        depositedSol: vault.depositedSol - amount,
        availableSol: vault.availableSol - amount,
      },
    });

    const transaction = await prisma.vaultTransaction.create({
      data: {
        vaultId: vault.id,
        type: 'WITHDRAWAL',
        amount,
        signature,
        timestamp: new Date(),
      },
    });

    writeAuditLog({
      userId: user.userId,
      action: AuditAction.VAULT_WITHDRAWAL,
      metadata: { vaultId: vault.id, amount, signature },
      ipAddress: request.ip,
    });

    return reply.send({ vault: updatedVault, transaction });
  });

  // PATCH /api/v1/vault/settings - Update vault risk parameters
  app.patch<{ Body: VaultSettingsBody }>('/settings', async (request, reply) => {
    const user = request.user;
    const body = request.body;

    const vault = await prisma.vault.findFirst({
      where: { userId: user.userId },
    });
    if (!vault) {
      return reply.status(404).send({ error: 'Vault not found' });
    }

    const updateData: Record<string, unknown> = {};
    if (body.maxTradeSizeSol !== undefined) updateData.maxTradeSizeSol = body.maxTradeSizeSol;
    if (body.maxDailyLossSol !== undefined) updateData.maxDailyLossSol = body.maxDailyLossSol;
    if (body.maxSlippageBps !== undefined) updateData.maxSlippageBps = body.maxSlippageBps;
    if (body.maxOpenPositions !== undefined) updateData.maxOpenPositions = body.maxOpenPositions;
    if (body.allowedDexs !== undefined) updateData.allowedDexs = body.allowedDexs;
    if (body.tokenBlacklist !== undefined) updateData.tokenBlacklist = body.tokenBlacklist;

    const updatedVault = await prisma.vault.update({
      where: { id: vault.id },
      data: updateData,
    });

    return reply.send({ vault: updatedVault });
  });

  // POST /api/v1/vault/pause - Pause vault
  app.post('/pause', async (request, reply) => {
    const user = request.user;

    const vault = await prisma.vault.findFirst({
      where: { userId: user.userId },
    });
    if (!vault) {
      return reply.status(404).send({ error: 'Vault not found' });
    }

    const updatedVault = await prisma.vault.update({
      where: { id: vault.id },
      data: { isPaused: true },
    });

    writeAuditLog({
      userId: user.userId,
      action: AuditAction.VAULT_PAUSED,
      metadata: { vaultId: vault.id },
      ipAddress: request.ip,
    });

    return reply.send({ vault: updatedVault });
  });

  // POST /api/v1/vault/resume - Resume vault
  app.post('/resume', async (request, reply) => {
    const user = request.user;

    const vault = await prisma.vault.findFirst({
      where: { userId: user.userId },
    });
    if (!vault) {
      return reply.status(404).send({ error: 'Vault not found' });
    }

    const updatedVault = await prisma.vault.update({
      where: { id: vault.id },
      data: { isPaused: false },
    });

    return reply.send({ vault: updatedVault });
  });

  // GET /api/v1/vault/transactions - Get vault transactions
  app.get<{ Querystring: TransactionsQuery }>('/transactions', async (request, reply) => {
    const user = request.user;
    const { page = 1, perPage = 20, type } = request.query;

    const vault = await prisma.vault.findFirst({
      where: { userId: user.userId },
    });
    if (!vault) {
      return reply.status(404).send({ error: 'Vault not found' });
    }

    const pageNum = Number(page);
    const perPageNum = Number(perPage);

    const where: Record<string, unknown> = { vaultId: vault.id };
    if (type) {
      where.type = type;
    }

    const [transactions, total] = await Promise.all([
      prisma.vaultTransaction.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (pageNum - 1) * perPageNum,
        take: perPageNum,
      }),
      prisma.vaultTransaction.count({ where }),
    ]);

    return reply.send({
      transactions,
      total,
      page: pageNum,
      perPage: perPageNum,
    });
  });
}
