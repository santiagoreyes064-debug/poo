import { describe, it, expect, beforeEach } from 'vitest';
import { RiskEngine, RiskEngineDeps, RiskCheckInput } from '../index';
import { CopyMode } from '@copy-trading/shared-types';

function createMockDeps(overrides: Partial<RiskEngineDeps> = {}): RiskEngineDeps {
  return {
    balanceProvider: { getBalance: async () => 10 },
    dailyLossProvider: { getDailyLoss: async () => 0 },
    openPositionProvider: { getOpenPositionCount: async () => 0 },
    honeypotChecker: { isHoneypot: async () => false },
    liquidityProvider: { getLiquidity: async () => 100 },
    ...overrides,
  };
}

function createDefaultInput(overrides: Partial<RiskCheckInput> = {}): RiskCheckInput {
  return {
    userId: 'user-1',
    copyRelation: {
      enabled: true,
      copyMode: CopyMode.FIXED,
      fixedAmountSol: 0.5,
      maxTradeSizeSol: 2.0,
      maxDailyLossSol: 5.0,
      maxOpenPositions: 10,
      tokenBlacklist: [],
    },
    trade: {
      tokenOut: 'So11111111111111111111111111111111111111112',
    },
    ...overrides,
  };
}

describe('RiskEngine', () => {
  let engine: RiskEngine;

  beforeEach(() => {
    engine = new RiskEngine(createMockDeps());
  });

  it('should allow a valid trade', async () => {
    const result = await engine.evaluate(createDefaultInput());
    expect(result.allowed).toBe(true);
    expect(result.adjustedAmountSol).toBe(0.5);
  });

  it('should reject when copy relation is disabled', async () => {
    const input = createDefaultInput({
      copyRelation: {
        ...createDefaultInput().copyRelation,
        enabled: false,
      },
    });
    const result = await engine.evaluate(input);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('disabled');
  });

  it('should reject blacklisted tokens', async () => {
    const tokenOut = 'BlacklistedToken111111111111111111111111111';
    const input = createDefaultInput({
      copyRelation: {
        ...createDefaultInput().copyRelation,
        tokenBlacklist: [tokenOut],
      },
      trade: { tokenOut },
    });
    const result = await engine.evaluate(input);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('blacklisted');
  });

  it('should reject honeypot tokens', async () => {
    const deps = createMockDeps({
      honeypotChecker: { isHoneypot: async () => true },
    });
    engine = new RiskEngine(deps);
    const result = await engine.evaluate(createDefaultInput());
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('honeypot');
  });

  it('should reject when daily loss limit is reached', async () => {
    const deps = createMockDeps({
      dailyLossProvider: { getDailyLoss: async () => 5.0 },
    });
    engine = new RiskEngine(deps);
    const input = createDefaultInput({
      copyRelation: {
        ...createDefaultInput().copyRelation,
        maxDailyLossSol: 5.0,
      },
    });
    const result = await engine.evaluate(input);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily loss');
  });

  it('should cap trade size to maxTradeSizeSol', async () => {
    const input = createDefaultInput({
      copyRelation: {
        ...createDefaultInput().copyRelation,
        fixedAmountSol: 5.0,
        maxTradeSizeSol: 2.0,
      },
    });
    const result = await engine.evaluate(input);
    expect(result.allowed).toBe(true);
    expect(result.adjustedAmountSol).toBe(2.0);
  });

  it('should reject when user has insufficient balance', async () => {
    const deps = createMockDeps({
      balanceProvider: { getBalance: async () => 0.3 },
    });
    engine = new RiskEngine(deps);
    const input = createDefaultInput({
      copyRelation: {
        ...createDefaultInput().copyRelation,
        fixedAmountSol: 0.5,
        maxTradeSizeSol: 2.0,
      },
    });
    const result = await engine.evaluate(input);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Insufficient balance');
  });

  it('should reject when token liquidity is too low', async () => {
    const deps = createMockDeps({
      liquidityProvider: { getLiquidity: async () => 2 },
    });
    engine = new RiskEngine(deps);
    const result = await engine.evaluate(createDefaultInput());
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('liquidity');
  });

  it('should reject when max open positions is reached', async () => {
    const deps = createMockDeps({
      openPositionProvider: { getOpenPositionCount: async () => 10 },
    });
    engine = new RiskEngine(deps);
    const input = createDefaultInput({
      copyRelation: {
        ...createDefaultInput().copyRelation,
        maxOpenPositions: 10,
      },
    });
    const result = await engine.evaluate(input);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('open positions');
  });

  it('should calculate proportional position size correctly', async () => {
    const deps = createMockDeps({
      balanceProvider: { getBalance: async () => 20 },
    });
    engine = new RiskEngine(deps);
    const input = createDefaultInput({
      copyRelation: {
        ...createDefaultInput().copyRelation,
        copyMode: CopyMode.PROPORTIONAL,
        proportionPct: 10,
        maxTradeSizeSol: 5.0,
      },
    });
    const result = await engine.evaluate(input);
    expect(result.allowed).toBe(true);
    expect(result.adjustedAmountSol).toBe(2.0); // 20 * 10/100 = 2.0
  });
});
