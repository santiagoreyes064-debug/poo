import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Mock Redis
vi.mock('../services/redis.js', () => {
  const nonceStore = new Map<string, string>();
  return {
    getRedisClient: () => ({
      get: async (key: string) => nonceStore.get(key) || null,
      set: async (key: string, value: string) => { nonceStore.set(key, value); },
      del: async (key: string) => { nonceStore.delete(key); },
      connect: async () => {},
      quit: async () => {},
    }),
    storeNonce: async (_redis: unknown, walletAddress: string, nonce: string) => {
      nonceStore.set(`nonce:${walletAddress}`, nonce);
    },
    getNonce: async (_redis: unknown, walletAddress: string) => {
      return nonceStore.get(`nonce:${walletAddress}`) || null;
    },
    deleteNonce: async (_redis: unknown, walletAddress: string) => {
      nonceStore.delete(`nonce:${walletAddress}`);
    },
    createRedisSubscriber: () => ({
      subscribe: async () => {},
      on: () => {},
      connect: async () => {},
      quit: async () => {},
    }),
    closeRedis: async () => {},
  };
});

// Mock @solana/web3.js PublicKey
vi.mock('@solana/web3.js', () => ({
  PublicKey: class PublicKey {
    constructor(key: string) {
      if (!key || key.length < 32 || key.length > 44) {
        throw new Error('Invalid public key');
      }
    }
  },
}));

// Mock @fastify/websocket to avoid WebSocket.Server constructor issue in tests
vi.mock('@fastify/websocket', () => ({
  default: async function fastifyWebsocket() {
    // no-op in tests
  },
}));

// Mock ws handler registration (no actual ws in route tests)
vi.mock('../ws/handler.js', () => ({
  wsHandler: async function wsHandler() {
    // no-op in tests
  },
}));

// In-memory stores for Prisma mock
const vaultsDb: Record<string, any>[] = [];
const vaultTransactionsDb: Record<string, any>[] = [];
const tradersDb: Record<string, any>[] = [];
const copyRelationsDb: Record<string, any>[] = [];
const copyTradesDb: Record<string, any>[] = [];
const notificationPrefsDb: Record<string, any>[] = [];
const auditLogsDb: Record<string, any>[] = [];
const usersDb: Record<string, any>[] = [];
const connectedWalletsDb: Record<string, any>[] = [];

// Mock Prisma
vi.mock('@copy-trading/database', () => ({
  prisma: {
    user: {
      upsert: async ({ where, create, update }: any) => {
        const existing = usersDb.find((u) => u.id === where.id);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const user = { ...create, createdAt: new Date() };
        usersDb.push(user);
        return user;
      },
      findUnique: async ({ where }: any) => {
        return usersDb.find((u) => u.id === where.id) || null;
      },
    },
    connectedWallet: {
      upsert: async ({ where, create, update }: any) => {
        const existing = connectedWalletsDb.find((w) => w.publicKey === where.publicKey);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const wallet = { id: `wallet_${Date.now()}_${Math.random().toString(36).slice(2)}`, ...create };
        connectedWalletsDb.push(wallet);
        return wallet;
      },
      findFirst: async ({ where }: any) => {
        return connectedWalletsDb.find((w) => {
          if (where.userId && w.userId !== where.userId) return false;
          if (where.isDefault !== undefined && w.isDefault !== where.isDefault) return false;
          return true;
        }) || null;
      },
    },
    vault: {
      findFirst: async ({ where }: any) => {
        return vaultsDb.find((v) => {
          if (where.userId && v.userId !== where.userId) return false;
          if (where.isPaused !== undefined && v.isPaused !== where.isPaused) return false;
          return true;
        }) || null;
      },
      create: async ({ data }: any) => {
        const vault = { id: `vault_${Date.now()}_${Math.random().toString(36).slice(2)}`, ...data, createdAt: new Date(), updatedAt: new Date() };
        vaultsDb.push(vault);
        return vault;
      },
      update: async ({ where, data }: any) => {
        const idx = vaultsDb.findIndex((v) => v.id === where.id);
        if (idx >= 0) {
          Object.assign(vaultsDb[idx], data, { updatedAt: new Date() });
          return vaultsDb[idx];
        }
        return null;
      },
    },
    vaultTransaction: {
      create: async ({ data }: any) => {
        const tx = { id: `vtx_${Date.now()}_${Math.random().toString(36).slice(2)}`, ...data };
        vaultTransactionsDb.push(tx);
        return tx;
      },
      findMany: async ({ where, orderBy, skip, take }: any) => {
        let results = vaultTransactionsDb.filter((t) => {
          if (where.vaultId && t.vaultId !== where.vaultId) return false;
          if (where.type && t.type !== where.type) return false;
          return true;
        });
        return results.slice(skip || 0, (skip || 0) + (take || 20));
      },
      count: async ({ where }: any) => {
        return vaultTransactionsDb.filter((t) => {
          if (where.vaultId && t.vaultId !== where.vaultId) return false;
          if (where.type && t.type !== where.type) return false;
          return true;
        }).length;
      },
    },
    trader: {
      findMany: async ({ where, orderBy, skip, take }: any) => {
        let results = [...tradersDb];
        if (where?.totalTrades?.gte !== undefined) {
          results = results.filter((t) => t.totalTrades >= where.totalTrades.gte);
        }
        if (where?.OR) {
          results = results.filter((t) => {
            return where.OR.some((cond: any) => {
              if (cond.walletAddress?.contains) {
                return t.walletAddress.toLowerCase().includes(cond.walletAddress.contains.toLowerCase());
              }
              if (cond.label?.contains && t.label) {
                return t.label.toLowerCase().includes(cond.label.contains.toLowerCase());
              }
              return false;
            });
          });
        }
        return results.slice(skip || 0, (skip || 0) + (take || 20));
      },
      findUnique: async ({ where }: any) => {
        if (where.id) return tradersDb.find((t) => t.id === where.id) || null;
        if (where.walletAddress) return tradersDb.find((t) => t.walletAddress === where.walletAddress) || null;
        return null;
      },
      count: async ({ where }: any) => {
        let results = [...tradersDb];
        if (where?.totalTrades?.gte !== undefined) {
          results = results.filter((t) => t.totalTrades >= where.totalTrades.gte);
        }
        if (where?.OR) {
          results = results.filter((t) => {
            return where.OR.some((cond: any) => {
              if (cond.walletAddress?.contains) {
                return t.walletAddress.toLowerCase().includes(cond.walletAddress.contains.toLowerCase());
              }
              if (cond.label?.contains && t.label) {
                return t.label.toLowerCase().includes(cond.label.contains.toLowerCase());
              }
              return false;
            });
          });
        }
        return results.length;
      },
      create: async ({ data }: any) => {
        const trader = {
          id: `trader_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          ...data,
          roi7d: 0,
          roi30d: 0,
          winRate: 0,
          sharpeRatio: 0,
          maxDrawdown: 0,
          avgHoldTime: 0,
          totalTrades: 0,
          lastTradeAt: null,
        };
        tradersDb.push(trader);
        return trader;
      },
    },
    copyRelation: {
      findMany: async ({ where, include }: any) => {
        let results = copyRelationsDb.filter((c) => {
          if (where.userId && c.userId !== where.userId) return false;
          if (where.enabled !== undefined && c.enabled !== where.enabled) return false;
          return true;
        });
        if (include?.trader) {
          results = results.map((c) => ({
            ...c,
            trader: tradersDb.find((t) => t.id === c.traderId) || { id: c.traderId, walletAddress: 'unknown', label: null },
          }));
        }
        return results;
      },
      findFirst: async ({ where }: any) => {
        return copyRelationsDb.find((c) => {
          if (where.id && c.id !== where.id) return false;
          if (where.userId && c.userId !== where.userId) return false;
          if (where.traderId && c.traderId !== where.traderId) return false;
          return true;
        }) || null;
      },
      create: async ({ data, include }: any) => {
        const copy = { id: `copy_${Date.now()}_${Math.random().toString(36).slice(2)}`, ...data };
        copyRelationsDb.push(copy);
        if (include?.trader) {
          return {
            ...copy,
            trader: tradersDb.find((t) => t.id === data.traderId) || { id: data.traderId, walletAddress: 'unknown', label: null },
          };
        }
        return copy;
      },
      update: async ({ where, data, include }: any) => {
        const idx = copyRelationsDb.findIndex((c) => c.id === where.id);
        if (idx >= 0) {
          Object.assign(copyRelationsDb[idx], data);
          if (include?.trader) {
            return {
              ...copyRelationsDb[idx],
              trader: tradersDb.find((t) => t.id === copyRelationsDb[idx].traderId) || { id: copyRelationsDb[idx].traderId, walletAddress: 'unknown', label: null },
            };
          }
          return copyRelationsDb[idx];
        }
        return null;
      },
      delete: async ({ where }: any) => {
        const idx = copyRelationsDb.findIndex((c) => c.id === where.id);
        if (idx >= 0) {
          copyRelationsDb.splice(idx, 1);
        }
      },
      count: async ({ where }: any) => {
        return copyRelationsDb.filter((c) => {
          if (where.userId && c.userId !== where.userId) return false;
          if (where.enabled !== undefined && c.enabled !== where.enabled) return false;
          return true;
        }).length;
      },
    },
    copyTrade: {
      findMany: async ({ where, orderBy, skip, take, include }: any) => {
        return [];
      },
      count: async ({ where }: any) => {
        return 0;
      },
    },
    notificationPreference: {
      deleteMany: async ({ where }: any) => {},
      createMany: async ({ data }: any) => {
        for (const item of data) {
          notificationPrefsDb.push({ id: `np_${Date.now()}_${Math.random().toString(36).slice(2)}`, ...item });
        }
        return { count: data.length };
      },
      findMany: async ({ where }: any) => {
        return notificationPrefsDb.filter((p) => p.userId === where.userId);
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        const log = { id: `al_${Date.now()}`, ...data, createdAt: new Date() };
        auditLogsDb.push(log);
        return log;
      },
      findMany: async ({ where, orderBy, take }: any) => {
        let results = [...auditLogsDb];
        if (where?.userId) {
          results = results.filter((l) => l.userId === where.userId);
        }
        return results.slice(0, take || 100);
      },
    },
  },
}));

// Dynamic import after mocks are set up
const { buildApp } = await import('../index.js');

describe('API Routes', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeAll(async () => {
    app = await buildApp({
      jwtSecret: 'test-secret',
      disableRateLimit: true,
    });
    await app.ready();

    // Generate a valid JWT for authenticated tests
    authToken = app.jwt.sign({
      userId: 'user_test123',
      walletAddress: 'TestWallet123456789012345678901234',
    });

    // Seed test user and connected wallet for vault tests
    usersDb.push({ id: 'user_test123', createdAt: new Date() });
    connectedWalletsDb.push({
      id: 'wallet_test123',
      publicKey: 'TestWallet123456789012345678901234',
      userId: 'user_test123',
      isDefault: true,
      label: null,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Health Check', () => {
    it('GET /health should return ok', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.service).toBe('api-gateway');
    });
  });

  describe('Metrics', () => {
    it('GET /metrics should return Prometheus metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
    });
  });

  describe('Auth Routes', () => {
    it('POST /api/v1/auth/nonce should generate a nonce', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/nonce',
        payload: { walletAddress: 'TestWallet123456789012345678901234' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.nonce).toBeTruthy();
      expect(body.expiresIn).toBe(300);
    });

    it('POST /api/v1/auth/nonce should reject invalid wallet address', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/nonce',
        payload: { walletAddress: 'short' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('POST /api/v1/auth/nonce should reject missing wallet address', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/nonce',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('POST /api/v1/auth/verify should reject missing fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify',
        payload: { walletAddress: 'TestWallet123456789012345678901234' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('POST /api/v1/auth/wallet should require auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/wallet',
        payload: { walletAddress: 'TestWallet123456789012345678901234' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('POST /api/v1/auth/wallet should accept with valid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/wallet',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { walletAddress: 'NewWallet1234567890123456789012345' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.wallet.publicKey).toBe('NewWallet1234567890123456789012345');
    });
  });

  describe('Trader Routes', () => {
    it('GET /api/v1/traders/leaderboard should be public (no auth required)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/traders/leaderboard',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.traders).toBeDefined();
    });

    it('GET /api/v1/traders/leaderboard should return paginated results', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/traders/leaderboard?page=1&perPage=10',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.traders).toBeDefined();
      expect(body.page).toBe(1);
      expect(body.perPage).toBe(10);
    });

    it('POST /api/v1/traders/add should create a trader', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/traders/add',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { walletAddress: 'TraderWallet12345678901234567890123', label: 'Test Trader' },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.trader.walletAddress).toBe('TraderWallet12345678901234567890123');
      expect(body.trader.label).toBe('Test Trader');
    });

    it('GET /api/v1/traders/search should search traders', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/traders/search?q=Test',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.traders).toBeDefined();
    });
  });

  describe('Copy Routes', () => {
    it('GET /api/v1/copy should require auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/copy',
      });

      expect(response.statusCode).toBe(401);
    });

    it('GET /api/v1/copy should return user copies', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/copy',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.copies).toBeDefined();
    });

    it('POST /api/v1/copy/subscribe should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/copy/subscribe',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('POST /api/v1/copy/subscribe should create a copy relation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/copy/subscribe',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          traderId: 'trader_123',
          copyMode: 'FIXED',
          fixedAmountSol: 0.5,
          maxTradeSizeSol: 1.0,
          maxSlippageBps: 300,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.copy.traderId).toBe('trader_123');
      expect(body.copy.enabled).toBe(true);
    });
  });

  describe('Dashboard Routes', () => {
    it('GET /api/v1/dashboard should require auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard',
      });

      expect(response.statusCode).toBe(401);
    });

    it('GET /api/v1/dashboard should return overview', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.userId).toBe('user_test123');
    });

    it('GET /api/v1/dashboard/trades should return paginated trades', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/trades',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.trades).toBeDefined();
    });
  });

  describe('Vault Routes', () => {
    it('POST /api/v1/vault/create should require auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/vault/create',
        payload: {},
      });

      expect(response.statusCode).toBe(401);
    });

    it('POST /api/v1/vault/create should return error when no connected wallet', async () => {
      // Create a token for a user with no connected wallet
      const noWalletToken = app.jwt.sign({
        userId: 'user_no_wallet',
        walletAddress: 'NoWalletUser12345678901234567890123',
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/vault/create',
        headers: { authorization: `Bearer ${noWalletToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('POST /api/v1/vault/create should create a vault', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/vault/create',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          maxTradeSizeSol: 1.0,
          maxDailyLossSol: 5.0,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.vault.userId).toBe('user_test123');
      expect(body.vault.isPaused).toBe(false);
    });

    it('GET /api/v1/vault should return user vault', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/vault',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.vault).toBeDefined();
    });

    it('GET /api/v1/vault/balance should return vault balance', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/vault/balance',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.depositedSol).toBeDefined();
      expect(body.availableSol).toBeDefined();
    });

    it('POST /api/v1/vault/deposit should validate amount', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/vault/deposit',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { amount: -1, signature: 'sig123' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('POST /api/v1/vault/deposit should deposit funds', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/vault/deposit',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { amount: 5.0, signature: 'deposit_sig_123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.vault.depositedSol).toBe(5.0);
      expect(body.transaction.type).toBe('DEPOSIT');
    });

    it('POST /api/v1/vault/withdraw should prevent overdraft', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/vault/withdraw',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { amount: 100.0, signature: 'withdraw_sig_123' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Insufficient');
    });

    it('POST /api/v1/vault/withdraw should withdraw funds', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/vault/withdraw',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { amount: 2.0, signature: 'withdraw_sig_456' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.vault.depositedSol).toBe(3.0);
      expect(body.transaction.type).toBe('WITHDRAWAL');
    });

    it('PATCH /api/v1/vault/settings should update settings', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/vault/settings',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { maxTradeSizeSol: 2.0, maxSlippageBps: 500 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.vault.maxTradeSizeSol).toBe(2.0);
      expect(body.vault.maxSlippageBps).toBe(500);
    });

    it('POST /api/v1/vault/pause should pause the vault', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/vault/pause',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.vault.isPaused).toBe(true);
    });

    it('POST /api/v1/vault/resume should resume the vault', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/vault/resume',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.vault.isPaused).toBe(false);
    });

    it('GET /api/v1/vault/transactions should return paginated transactions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/vault/transactions',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.transactions).toBeDefined();
      expect(body.total).toBeGreaterThanOrEqual(0);
    });
  });
});
