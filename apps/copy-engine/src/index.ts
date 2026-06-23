import 'dotenv/config';
import Redis from 'ioredis';
import { prisma } from '@copy-trading/database';
import {
  RiskEngine,
  RiskCheckInput,
  RiskEngineDeps,
} from '@copy-trading/risk-engine';
import {
  createConsumerGroup,
  readFromStream,
  acknowledgeMessage,
  publishToStream,
  STREAMS,
  CONSUMER_GROUPS,
  CopyOrderEvent,
  ParsedTradeEvent,
  DexName,
  CopyTradeStatus,
  CopyMode,
} from '@copy-trading/shared-types';

export const SERVICE_NAME = 'copy-engine';

// ==================== Configuration ====================

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CONSUMER_NAME = process.env.CONSUMER_NAME ?? `copy-engine-${process.pid}`;

// ==================== State ====================

let redis: Redis;
let isShuttingDown = false;

// ==================== Risk Engine Dependencies ====================

function createRiskEngineDeps(): RiskEngineDeps {
  return {
    balanceProvider: {
      async getBalance(userId: string): Promise<number> {
        const vault = await prisma.vault.findFirst({
          where: { userId, isPaused: false },
          select: { availableSol: true },
        });
        return vault?.availableSol ?? 0;
      },
    },
    dailyLossProvider: {
      async getDailyLoss(userId: string): Promise<number> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const result = await prisma.copyTrade.aggregate({
          where: {
            userId,
            status: 'CONFIRMED',
            settledAt: { gte: today },
            pnlSol: { lt: 0 },
          },
          _sum: { pnlSol: true },
        });
        return Math.abs(result._sum.pnlSol ?? 0);
      },
    },
    openPositionProvider: {
      async getOpenPositionCount(userId: string): Promise<number> {
        return prisma.copyTrade.count({
          where: {
            userId,
            status: { in: ['PENDING', 'SUBMITTED'] },
          },
        });
      },
    },
    honeypotChecker: {
      async isHoneypot(mintAddress: string): Promise<boolean> {
        const token = await prisma.tokenMetadata.findUnique({
          where: { mintAddress },
          select: { isHoneypot: true },
        });
        return token?.isHoneypot ?? false;
      },
    },
    liquidityProvider: {
      async getLiquidity(mintAddress: string): Promise<number> {
        // In production, fetch from Birdeye or similar API
        // For now, return a reasonable default based on token metadata
        const token = await prisma.tokenMetadata.findUnique({
          where: { mintAddress },
          select: { verified: true },
        });
        // Verified tokens assumed to have decent liquidity
        return token?.verified ? 100 : 10;
      },
    },
  };
}

// ==================== Fan-out Processing ====================

export async function processParsedTrade(
  redis: Redis,
  riskEngine: RiskEngine,
  tradeEvent: ParsedTradeEvent,
): Promise<void> {
  // Query all enabled CopyRelations for this trader
  const copyRelations = await prisma.copyRelation.findMany({
    where: {
      traderId: tradeEvent.traderId,
      enabled: true,
    },
  });

  if (copyRelations.length === 0) {
    console.log(`[copy-engine] No active copy relations for trader ${tradeEvent.traderId}`);
    return;
  }

  console.log(`[copy-engine] Processing trade ${tradeEvent.signature} for ${copyRelations.length} subscribers`);

  for (const relation of copyRelations) {
    const riskInput: RiskCheckInput = {
      userId: relation.userId,
      copyRelation: {
        enabled: relation.enabled,
        copyMode: relation.copyMode as CopyMode,
        fixedAmountSol: relation.fixedAmountSol ?? undefined,
        proportionPct: relation.proportionPct ?? undefined,
        maxTradeSizeSol: relation.maxTradeSizeSol,
        maxDailyLossSol: relation.maxDailyLossSol ?? undefined,
        maxOpenPositions: relation.maxOpenPositions ?? undefined,
        tokenBlacklist: relation.tokenBlacklist,
      },
      trade: {
        tokenOut: tradeEvent.tokenOut,
      },
    };

    const result = await riskEngine.evaluate(riskInput);

    if (!result.allowed) {
      // Create SKIPPED CopyTrade row
      await prisma.copyTrade.create({
        data: {
          userId: relation.userId,
          walletId: relation.id, // Use relation id as reference
          originalTradeId: tradeEvent.signature,
          status: CopyTradeStatus.SKIPPED,
          skipReason: result.reason,
        },
      });
      console.log(`[copy-engine] Skipped for user ${relation.userId}: ${result.reason}`);
      continue;
    }

    // Create PENDING CopyTrade row
    const copyTrade = await prisma.copyTrade.create({
      data: {
        userId: relation.userId,
        walletId: relation.id,
        originalTradeId: tradeEvent.signature,
        status: CopyTradeStatus.PENDING,
        amountIn: String(result.adjustedAmountSol),
      },
    });

    // Push CopyOrderEvent to stream
    const orderEvent: CopyOrderEvent = {
      userId: relation.userId,
      copyRelationId: relation.id,
      originalTrade: tradeEvent,
      amountSol: result.adjustedAmountSol!,
      maxSlippageBps: relation.maxSlippageBps,
    };

    await publishToStream(redis, STREAMS.COPY_ORDERS, {
      copyTradeId: copyTrade.id,
      userId: orderEvent.userId,
      copyRelationId: orderEvent.copyRelationId,
      traderId: tradeEvent.traderId,
      signature: tradeEvent.signature,
      tokenIn: tradeEvent.tokenIn,
      tokenOut: tradeEvent.tokenOut,
      amountIn: tradeEvent.amountIn,
      amountOut: tradeEvent.amountOut,
      dex: tradeEvent.dex,
      amountSol: String(orderEvent.amountSol),
      maxSlippageBps: String(orderEvent.maxSlippageBps),
      timestamp: new Date().toISOString(),
    });

    console.log(`[copy-engine] Created copy order for user ${relation.userId}: ${result.adjustedAmountSol} SOL`);
  }
}

// ==================== Consumer Loop ====================

async function consumeLoop(): Promise<void> {
  const riskEngine = new RiskEngine(createRiskEngineDeps());

  await createConsumerGroup(redis, {
    stream: STREAMS.PARSED_TRADES,
    group: CONSUMER_GROUPS.COPY_ENGINE,
  });

  while (!isShuttingDown) {
    try {
      const messages = await readFromStream(redis, {
        stream: STREAMS.PARSED_TRADES,
        group: CONSUMER_GROUPS.COPY_ENGINE,
        consumer: CONSUMER_NAME,
        count: 5,
        blockMs: 2000,
      });

      for (const msg of messages) {
        try {
          const tradeEvent: ParsedTradeEvent = {
            traderId: msg.data.traderId,
            signature: msg.data.signature,
            slot: parseInt(msg.data.slot, 10),
            timestamp: new Date(msg.data.timestamp),
            tokenIn: msg.data.tokenIn,
            tokenOut: msg.data.tokenOut,
            amountIn: msg.data.amountIn,
            amountOut: msg.data.amountOut,
            dex: msg.data.dex as DexName,
            priceImpactBps: msg.data.priceImpactBps ? parseInt(msg.data.priceImpactBps, 10) : undefined,
            feeSol: msg.data.feeSol || undefined,
          };

          await processParsedTrade(redis, riskEngine, tradeEvent);
        } catch (err) {
          console.error(`[copy-engine] Error processing message ${msg.id}:`, err);
        }

        await acknowledgeMessage(
          redis,
          STREAMS.PARSED_TRADES,
          CONSUMER_GROUPS.COPY_ENGINE,
          msg.id,
        );
      }
    } catch (err) {
      if (!isShuttingDown) {
        console.error('[copy-engine] Consumer loop error:', err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}

// ==================== Lifecycle ====================

export async function start(): Promise<void> {
  console.log('[copy-engine] Starting...');
  redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  await consumeLoop();
}

export async function shutdown(): Promise<void> {
  console.log('[copy-engine] Shutting down...');
  isShuttingDown = true;
  await redis?.quit();
  await prisma.$disconnect();
}

// ==================== Main ====================

if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    console.error('[copy-engine] Fatal error:', err);
    process.exit(1);
  });

  process.on('SIGTERM', () => shutdown());
  process.on('SIGINT', () => shutdown());
}
