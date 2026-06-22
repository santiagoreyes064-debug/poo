import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RiskEngine, RiskEngineDeps } from '@copy-trading/risk-engine';
import {
  ParsedTradeEvent,
  DexName,
  CopyTradeStatus,
  CopyMode,
} from '@copy-trading/shared-types';

// Mock prisma
vi.mock('@copy-trading/database', () => ({
  prisma: {
    copyRelation: {
      findMany: vi.fn(),
    },
    copyTrade: {
      create: vi.fn().mockResolvedValue({ id: 'ct-1' }),
    },
    vault: {
      findFirst: vi.fn(),
    },
    copyTrade2: {
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    tokenMetadata: {
      findUnique: vi.fn(),
    },
  },
}));

// Import after mocks
import { prisma } from '@copy-trading/database';

function createMockRiskDeps(overrides: Partial<RiskEngineDeps> = {}): RiskEngineDeps {
  return {
    balanceProvider: {
      getBalance: vi.fn().mockResolvedValue(10),
    },
    dailyLossProvider: {
      getDailyLoss: vi.fn().mockResolvedValue(0),
    },
    openPositionProvider: {
      getOpenPositionCount: vi.fn().mockResolvedValue(0),
    },
    honeypotChecker: {
      isHoneypot: vi.fn().mockResolvedValue(false),
    },
    liquidityProvider: {
      getLiquidity: vi.fn().mockResolvedValue(100),
    },
    ...overrides,
  };
}

function createMockTradeEvent(): ParsedTradeEvent {
  return {
    traderId: 'trader-1',
    signature: 'sig-123',
    slot: 100000,
    timestamp: new Date(),
    tokenIn: 'So11111111111111111111111111111111111111112',
    tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    amountIn: '1000000000',
    amountOut: '50000000',
    dex: DexName.JUPITER,
  };
}

describe('Copy Engine Fan-out with Risk Checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows trade when all risk checks pass', async () => {
    const deps = createMockRiskDeps();
    const engine = new RiskEngine(deps);

    const result = await engine.evaluate({
      userId: 'user-1',
      copyRelation: {
        enabled: true,
        copyMode: CopyMode.FIXED,
        fixedAmountSol: 1.0,
        maxTradeSizeSol: 5.0,
        tokenBlacklist: [],
      },
      trade: { tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    });

    expect(result.allowed).toBe(true);
    expect(result.adjustedAmountSol).toBe(1.0);
  });

  it('rejects trade when relation is disabled', async () => {
    const deps = createMockRiskDeps();
    const engine = new RiskEngine(deps);

    const result = await engine.evaluate({
      userId: 'user-1',
      copyRelation: {
        enabled: false,
        copyMode: CopyMode.FIXED,
        fixedAmountSol: 1.0,
        maxTradeSizeSol: 5.0,
        tokenBlacklist: [],
      },
      trade: { tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('disabled');
  });

  it('rejects trade when token is blacklisted', async () => {
    const deps = createMockRiskDeps();
    const engine = new RiskEngine(deps);

    const result = await engine.evaluate({
      userId: 'user-1',
      copyRelation: {
        enabled: true,
        copyMode: CopyMode.FIXED,
        fixedAmountSol: 1.0,
        maxTradeSizeSol: 5.0,
        tokenBlacklist: ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],
      },
      trade: { tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('blacklisted');
  });

  it('rejects trade when token is honeypot', async () => {
    const deps = createMockRiskDeps({
      honeypotChecker: {
        isHoneypot: vi.fn().mockResolvedValue(true),
      },
    });
    const engine = new RiskEngine(deps);

    const result = await engine.evaluate({
      userId: 'user-1',
      copyRelation: {
        enabled: true,
        copyMode: CopyMode.FIXED,
        fixedAmountSol: 1.0,
        maxTradeSizeSol: 5.0,
        tokenBlacklist: [],
      },
      trade: { tokenOut: 'HoneypotToken111111111111111111111111111111' },
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('honeypot');
  });

  it('rejects trade when daily loss limit reached', async () => {
    const deps = createMockRiskDeps({
      dailyLossProvider: {
        getDailyLoss: vi.fn().mockResolvedValue(5.0),
      },
    });
    const engine = new RiskEngine(deps);

    const result = await engine.evaluate({
      userId: 'user-1',
      copyRelation: {
        enabled: true,
        copyMode: CopyMode.FIXED,
        fixedAmountSol: 1.0,
        maxTradeSizeSol: 5.0,
        maxDailyLossSol: 5.0,
        tokenBlacklist: [],
      },
      trade: { tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily loss limit');
  });

  it('rejects trade when max open positions reached', async () => {
    const deps = createMockRiskDeps({
      openPositionProvider: {
        getOpenPositionCount: vi.fn().mockResolvedValue(3),
      },
    });
    const engine = new RiskEngine(deps);

    const result = await engine.evaluate({
      userId: 'user-1',
      copyRelation: {
        enabled: true,
        copyMode: CopyMode.FIXED,
        fixedAmountSol: 1.0,
        maxTradeSizeSol: 5.0,
        maxOpenPositions: 3,
        tokenBlacklist: [],
      },
      trade: { tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Maximum open positions');
  });

  it('caps amount at maxTradeSizeSol', async () => {
    const deps = createMockRiskDeps();
    const engine = new RiskEngine(deps);

    const result = await engine.evaluate({
      userId: 'user-1',
      copyRelation: {
        enabled: true,
        copyMode: CopyMode.FIXED,
        fixedAmountSol: 10.0,
        maxTradeSizeSol: 2.0,
        tokenBlacklist: [],
      },
      trade: { tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    });

    expect(result.allowed).toBe(true);
    expect(result.adjustedAmountSol).toBe(2.0);
  });

  it('uses proportional mode correctly', async () => {
    const deps = createMockRiskDeps({
      balanceProvider: {
        getBalance: vi.fn().mockResolvedValue(20),
      },
    });
    const engine = new RiskEngine(deps);

    const result = await engine.evaluate({
      userId: 'user-1',
      copyRelation: {
        enabled: true,
        copyMode: CopyMode.PROPORTIONAL,
        proportionPct: 10,
        maxTradeSizeSol: 5.0,
        tokenBlacklist: [],
      },
      trade: { tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    });

    expect(result.allowed).toBe(true);
    expect(result.adjustedAmountSol).toBe(2.0); // 10% of 20 = 2
  });

  it('rejects trade below dust threshold', async () => {
    const deps = createMockRiskDeps();
    const engine = new RiskEngine(deps);

    const result = await engine.evaluate({
      userId: 'user-1',
      copyRelation: {
        enabled: true,
        copyMode: CopyMode.FIXED,
        fixedAmountSol: 0.001,
        maxTradeSizeSol: 5.0,
        tokenBlacklist: [],
      },
      trade: { tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('dust threshold');
  });

  it('rejects trade when insufficient balance', async () => {
    const deps = createMockRiskDeps({
      balanceProvider: {
        getBalance: vi.fn().mockResolvedValue(0.5),
      },
    });
    const engine = new RiskEngine(deps);

    const result = await engine.evaluate({
      userId: 'user-1',
      copyRelation: {
        enabled: true,
        copyMode: CopyMode.FIXED,
        fixedAmountSol: 1.0,
        maxTradeSizeSol: 5.0,
        tokenBlacklist: [],
      },
      trade: { tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Insufficient balance');
  });
});
