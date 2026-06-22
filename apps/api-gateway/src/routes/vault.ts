import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Vault, VaultTransaction, VaultTransactionType } from '@copy-trading/shared-types';
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

// In-memory store for development
const vaults: Vault[] = [];
const vaultTransactions: VaultTransaction[] = [];

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
    const existing = vaults.find((v) => v.userId === user.userId);
    if (existing) {
      return reply.status(409).send({ error: 'User already has a vault' });
    }

    const vault: Vault = {
      id: `vault_${Date.now()}`,
      userId: user.userId,
      walletId: body.walletId,
      publicKey: body.publicKey,
      authority: body.authority,
      maxTradeSizeSol: body.maxTradeSizeSol || 1.0,
      maxDailyLossSol: body.maxDailyLossSol || 5.0,
      maxSlippageBps: body.maxSlippageBps || 300,
      maxOpenPositions: body.maxOpenPositions || 5,
      allowedDexs: body.allowedDexs || ['JUPITER', 'RAYDIUM'],
      tokenBlacklist: body.tokenBlacklist || [],
      depositedSol: 0,
      availableSol: 0,
      isPaused: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vaults.push(vault);

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
    const vault = vaults.find((v) => v.userId === user.userId);

    if (!vault) {
      return reply.status(404).send({ error: 'Vault not found' });
    }

    return reply.send({ vault });
  });

  // GET /api/v1/vault/balance - Get vault balance
  app.get('/balance', async (request, reply) => {
    const user = request.user;
    const vault = vaults.find((v) => v.userId === user.userId);

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

    const vault = vaults.find((v) => v.userId === user.userId);
    if (!vault) {
      return reply.status(404).send({ error: 'Vault not found' });
    }

    vault.depositedSol += amount;
    vault.availableSol += amount;
    vault.updatedAt = new Date();

    const transaction: VaultTransaction = {
      id: `vtx_${Date.now()}`,
      vaultId: vault.id,
      type: 'DEPOSIT' as VaultTransactionType,
      amount,
      signature,
      timestamp: new Date(),
    };

    vaultTransactions.push(transaction);

    writeAuditLog({
      userId: user.userId,
      action: AuditAction.VAULT_DEPOSIT,
      metadata: { vaultId: vault.id, amount, signature },
      ipAddress: request.ip,
    });

    return reply.send({ vault, transaction });
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

    const vault = vaults.find((v) => v.userId === user.userId);
    if (!vault) {
      return reply.status(404).send({ error: 'Vault not found' });
    }

    if (vault.availableSol < amount) {
      return reply.status(400).send({ error: 'Insufficient available balance' });
    }

    vault.depositedSol -= amount;
    vault.availableSol -= amount;
    vault.updatedAt = new Date();

    const transaction: VaultTransaction = {
      id: `vtx_${Date.now()}`,
      vaultId: vault.id,
      type: 'WITHDRAWAL' as VaultTransactionType,
      amount,
      signature,
      timestamp: new Date(),
    };

    vaultTransactions.push(transaction);

    writeAuditLog({
      userId: user.userId,
      action: AuditAction.VAULT_WITHDRAWAL,
      metadata: { vaultId: vault.id, amount, signature },
      ipAddress: request.ip,
    });

    return reply.send({ vault, transaction });
  });

  // PATCH /api/v1/vault/settings - Update vault risk parameters
  app.patch<{ Body: VaultSettingsBody }>('/settings', async (request, reply) => {
    const user = request.user;
    const body = request.body;

    const vault = vaults.find((v) => v.userId === user.userId);
    if (!vault) {
      return reply.status(404).send({ error: 'Vault not found' });
    }

    if (body.maxTradeSizeSol !== undefined) vault.maxTradeSizeSol = body.maxTradeSizeSol;
    if (body.maxDailyLossSol !== undefined) vault.maxDailyLossSol = body.maxDailyLossSol;
    if (body.maxSlippageBps !== undefined) vault.maxSlippageBps = body.maxSlippageBps;
    if (body.maxOpenPositions !== undefined) vault.maxOpenPositions = body.maxOpenPositions;
    if (body.allowedDexs !== undefined) vault.allowedDexs = body.allowedDexs;
    if (body.tokenBlacklist !== undefined) vault.tokenBlacklist = body.tokenBlacklist;
    vault.updatedAt = new Date();

    return reply.send({ vault });
  });

  // POST /api/v1/vault/pause - Pause vault
  app.post('/pause', async (request, reply) => {
    const user = request.user;

    const vault = vaults.find((v) => v.userId === user.userId);
    if (!vault) {
      return reply.status(404).send({ error: 'Vault not found' });
    }

    vault.isPaused = true;
    vault.updatedAt = new Date();

    writeAuditLog({
      userId: user.userId,
      action: AuditAction.VAULT_PAUSED,
      metadata: { vaultId: vault.id },
      ipAddress: request.ip,
    });

    return reply.send({ vault });
  });

  // POST /api/v1/vault/resume - Resume vault
  app.post('/resume', async (request, reply) => {
    const user = request.user;

    const vault = vaults.find((v) => v.userId === user.userId);
    if (!vault) {
      return reply.status(404).send({ error: 'Vault not found' });
    }

    vault.isPaused = false;
    vault.updatedAt = new Date();

    return reply.send({ vault });
  });

  // GET /api/v1/vault/transactions - Get vault transactions
  app.get<{ Querystring: TransactionsQuery }>('/transactions', async (request, reply) => {
    const user = request.user;
    const { page = 1, perPage = 20, type } = request.query;

    const vault = vaults.find((v) => v.userId === user.userId);
    if (!vault) {
      return reply.status(404).send({ error: 'Vault not found' });
    }

    let transactions = vaultTransactions.filter((t) => t.vaultId === vault.id);

    if (type) {
      transactions = transactions.filter((t) => t.type === type);
    }

    const pageNum = Number(page);
    const perPageNum = Number(perPage);
    const start = (pageNum - 1) * perPageNum;
    const paginated = transactions.slice(start, start + perPageNum);

    return reply.send({
      transactions: paginated,
      total: transactions.length,
      page: pageNum,
      perPage: perPageNum,
    });
  });
}
