import 'dotenv/config';
import Redis from 'ioredis';
import { prisma } from '@copy-trading/database';

export const SERVICE_NAME = 'analytics';

// ==================== Configuration ====================

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const ANALYTICS_INTERVAL_MS = parseInt(process.env.ANALYTICS_INTERVAL_MS ?? '300000', 10); // 5 minutes
const WINDOWS = [1, 7, 30, 90]; // days

// ==================== State ====================

let redis: Redis;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let isShuttingDown = false;

// ==================== Analytics Calculations ====================

export function calculateWinRate(pnls: number[]): number {
  if (pnls.length === 0) return 0;
  const wins = pnls.filter((p) => p > 0).length;
  return wins / pnls.length;
}

export function calculateAvgHoldTimeSec(holdTimes: number[]): number {
  if (holdTimes.length === 0) return 0;
  const sum = holdTimes.reduce((a, b) => a + b, 0);
  return sum / holdTimes.length;
}

export function calculateSharpeRatio(returns: number[]): number {
  // Annualized Sharpe ratio. Returns 0 if fewer than 5 data points.
  if (returns.length < 5) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return 0;

  // Annualize assuming daily returns, ~252 trading days
  const annualizationFactor = Math.sqrt(252);
  return (mean / stdDev) * annualizationFactor;
}

export function calculateMaxDrawdown(returns: number[]): number {
  if (returns.length === 0) return 0;

  // Build cumulative return series
  let cumulative = 1;
  let peak = 1;
  let maxDrawdown = 0;

  for (const r of returns) {
    cumulative *= 1 + r;
    if (cumulative > peak) {
      peak = cumulative;
    }
    const drawdown = (peak - cumulative) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

// ==================== Main Analytics Job ====================

export async function runAnalytics(): Promise<void> {
  if (isShuttingDown) return;

  console.log('[analytics] Running analytics cycle...');

  try {
    // Get all ACTIVE/PAUSED traders
    const traders = await prisma.trader.findMany({
      where: { status: { in: ['ACTIVE', 'PAUSED'] } },
    });

    console.log(`[analytics] Processing ${traders.length} traders`);

    for (const trader of traders) {
      for (const windowDays of WINDOWS) {
        const since = new Date();
        since.setDate(since.getDate() - windowDays);

        // Fetch trades in window
        const trades = await prisma.trade.findMany({
          where: {
            traderId: trader.id,
            timestamp: { gte: since },
          },
          orderBy: { timestamp: 'asc' },
        });

        // Fetch copy trades that reference this trader's trades for PnL data
        const tradeSignatures = trades.map((t) => t.signature);
        const copyTrades = await prisma.copyTrade.findMany({
          where: {
            originalTradeId: { in: tradeSignatures },
            status: 'CONFIRMED',
            pnlSol: { not: null },
          },
        });

        // Calculate metrics
        const pnls = copyTrades
          .map((ct) => ct.pnlSol)
          .filter((p): p is number => p !== null);

        // For returns, normalize by trade size (simplified as pnl ratio)
        const returns = pnls.map((pnl) => pnl / (trader.totalTrades > 0 ? 1 : 1));

        // Calculate hold times (approximate from trade timestamps)
        const holdTimes: number[] = [];
        for (let i = 1; i < trades.length; i++) {
          const holdSec = (trades[i].timestamp.getTime() - trades[i - 1].timestamp.getTime()) / 1000;
          if (holdSec > 0 && holdSec < 86400 * 7) { // Cap at 7 days
            holdTimes.push(holdSec);
          }
        }

        const winRate = calculateWinRate(pnls);
        const avgHoldTimeSec = calculateAvgHoldTimeSec(holdTimes);
        const sharpeRatio = calculateSharpeRatio(returns);
        const maxDrawdown = calculateMaxDrawdown(returns);
        const realizedPnlSol = pnls.reduce((a, b) => a + b, 0);

        // Upsert TraderAnalytics row
        await prisma.traderAnalytics.upsert({
          where: {
            traderId_windowDays: {
              traderId: trader.id,
              windowDays,
            },
          },
          create: {
            traderId: trader.id,
            calculatedAt: new Date(),
            windowDays,
            roi: 0, // TODO: integrate Birdeye for token price data
            winRate,
            totalTrades: trades.length,
            avgHoldTimeSec,
            sharpeRatio,
            maxDrawdown,
            realizedPnlSol,
          },
          update: {
            calculatedAt: new Date(),
            roi: 0, // TODO: integrate Birdeye for token price data
            winRate,
            totalTrades: trades.length,
            avgHoldTimeSec,
            sharpeRatio,
            maxDrawdown,
            realizedPnlSol,
          },
        });
      }

      // Update cached fields on trader
      // Use 7-day window for the summary fields
      const sevenDayAnalytics = await prisma.traderAnalytics.findUnique({
        where: {
          traderId_windowDays: {
            traderId: trader.id,
            windowDays: 7,
          },
        },
      });

      const thirtyDayAnalytics = await prisma.traderAnalytics.findUnique({
        where: {
          traderId_windowDays: {
            traderId: trader.id,
            windowDays: 30,
          },
        },
      });

      if (sevenDayAnalytics || thirtyDayAnalytics) {
        await prisma.trader.update({
          where: { id: trader.id },
          data: {
            winRate: sevenDayAnalytics?.winRate ?? 0,
            sharpeRatio: sevenDayAnalytics?.sharpeRatio ?? 0,
            maxDrawdown: sevenDayAnalytics?.maxDrawdown ?? 0,
            avgHoldTime: sevenDayAnalytics?.avgHoldTimeSec ?? 0,
            roi7d: sevenDayAnalytics?.roi ?? 0,
            roi30d: thirtyDayAnalytics?.roi ?? 0,
          },
        });
      }
    }

    // Invalidate leaderboard cache keys
    const keys = await redis.keys('leaderboard:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    console.log('[analytics] Analytics cycle complete');
  } catch (err) {
    console.error('[analytics] Error during analytics cycle:', err);
  }
}

// ==================== Lifecycle ====================

export async function start(): Promise<void> {
  console.log(`[analytics] Starting (interval=${ANALYTICS_INTERVAL_MS}ms)...`);
  redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  // Run immediately on start
  await runAnalytics();

  // Schedule recurring runs
  intervalHandle = setInterval(() => {
    runAnalytics().catch((err) => {
      console.error('[analytics] Scheduled run failed:', err);
    });
  }, ANALYTICS_INTERVAL_MS);
}

export async function shutdown(): Promise<void> {
  console.log('[analytics] Shutting down...');
  isShuttingDown = true;
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  await redis?.quit();
  await prisma.$disconnect();
}

// ==================== Main ====================

if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    console.error('[analytics] Fatal error:', err);
    process.exit(1);
  });

  process.on('SIGTERM', () => shutdown());
  process.on('SIGINT', () => shutdown());
}
