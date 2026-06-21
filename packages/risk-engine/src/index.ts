import { CopyMode, RiskCheckResult } from '@copy-trading/shared-types';

// ==================== Dependency Injection Interfaces ====================

export interface IUserBalanceProvider {
  getBalance(userId: string): Promise<number>;
}

export interface IDailyLossProvider {
  getDailyLoss(userId: string): Promise<number>;
}

export interface IOpenPositionProvider {
  getOpenPositionCount(userId: string): Promise<number>;
}

export interface IHoneypotChecker {
  isHoneypot(mintAddress: string): Promise<boolean>;
}

export interface ITokenLiquidityProvider {
  getLiquidity(mintAddress: string): Promise<number>;
}

// ==================== Input Types ====================

export interface RiskCheckInput {
  userId: string;
  copyRelation: {
    enabled: boolean;
    copyMode: CopyMode;
    fixedAmountSol?: number;
    proportionPct?: number;
    maxTradeSizeSol: number;
    maxDailyLossSol?: number;
    maxOpenPositions?: number;
    tokenBlacklist: string[];
  };
  trade: {
    tokenOut: string;
  };
}

export interface RiskEngineDeps {
  balanceProvider: IUserBalanceProvider;
  dailyLossProvider: IDailyLossProvider;
  openPositionProvider: IOpenPositionProvider;
  honeypotChecker: IHoneypotChecker;
  liquidityProvider: ITokenLiquidityProvider;
}

// ==================== Constants ====================

const MIN_LIQUIDITY_SOL = 5;
const DUST_THRESHOLD_SOL = 0.01;
const FEE_RESERVE_SOL = 0.005;

// ==================== Risk Engine ====================

export class RiskEngine {
  private deps: RiskEngineDeps;

  constructor(deps: RiskEngineDeps) {
    this.deps = deps;
  }

  async evaluate(input: RiskCheckInput): Promise<RiskCheckResult> {
    const { userId, copyRelation, trade } = input;

    // Check 1: Is copyRelation enabled?
    if (!copyRelation.enabled) {
      return { allowed: false, reason: 'Copy relation is disabled' };
    }

    // Check 2: Is token in user's blacklist?
    if (copyRelation.tokenBlacklist.includes(trade.tokenOut)) {
      return { allowed: false, reason: 'Token is blacklisted by user' };
    }

    // Check 3: Is token a honeypot?
    const isHoneypot = await this.deps.honeypotChecker.isHoneypot(trade.tokenOut);
    if (isHoneypot) {
      return { allowed: false, reason: 'Token is flagged as honeypot' };
    }

    // Check 4: Is token liquidity above minimum?
    const liquidity = await this.deps.liquidityProvider.getLiquidity(trade.tokenOut);
    if (liquidity < MIN_LIQUIDITY_SOL) {
      return { allowed: false, reason: `Token liquidity ${liquidity} SOL is below minimum ${MIN_LIQUIDITY_SOL} SOL` };
    }

    // Check 5: Has user hit maxDailyLossSol?
    if (copyRelation.maxDailyLossSol !== undefined) {
      const dailyLoss = await this.deps.dailyLossProvider.getDailyLoss(userId);
      if (dailyLoss >= copyRelation.maxDailyLossSol) {
        return { allowed: false, reason: 'Daily loss limit reached' };
      }
    }

    // Check 6: Has user hit maxOpenPositions?
    if (copyRelation.maxOpenPositions !== undefined) {
      const openPositions = await this.deps.openPositionProvider.getOpenPositionCount(userId);
      if (openPositions >= copyRelation.maxOpenPositions) {
        return { allowed: false, reason: 'Maximum open positions reached' };
      }
    }

    // Check 7: Calculate position size
    let amountSol: number;
    if (copyRelation.copyMode === CopyMode.FIXED) {
      amountSol = copyRelation.fixedAmountSol ?? 0;
    } else {
      const balance = await this.deps.balanceProvider.getBalance(userId);
      amountSol = balance * (copyRelation.proportionPct ?? 0) / 100;
    }

    // Check 8: Cap at maxTradeSizeSol
    amountSol = Math.min(amountSol, copyRelation.maxTradeSizeSol);

    // Check 9: Is amount above dust threshold?
    if (amountSol < DUST_THRESHOLD_SOL) {
      return { allowed: false, reason: `Trade amount ${amountSol} SOL is below dust threshold` };
    }

    // Check 10: Does user have enough balance?
    const balance = await this.deps.balanceProvider.getBalance(userId);
    if (balance < amountSol + FEE_RESERVE_SOL) {
      return { allowed: false, reason: 'Insufficient balance (including fee reserve)' };
    }

    return { allowed: true, adjustedAmountSol: amountSol };
  }
}
