import 'dotenv/config';
import Redis from 'ioredis';
import { prisma } from '@copy-trading/database';
import { DexAdapterRegistry } from '@copy-trading/dex-adapters';
import {
  createConsumerGroup,
  readFromStream,
  acknowledgeMessage,
  publishToStream,
  STREAMS,
  CONSUMER_GROUPS,
  TransactionWithMeta,
  ParsedTradeEvent,
} from '@copy-trading/shared-types';

export const SERVICE_NAME = 'tx-parser';

// ==================== Configuration ====================

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL ?? 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY';
const CONSUMER_NAME = process.env.CONSUMER_NAME ?? `tx-parser-${process.pid}`;

// ==================== State ====================

let redis: Redis;
let isShuttingDown = false;
const dexRegistry = new DexAdapterRegistry();

// ==================== Transaction Fetching ====================

export async function fetchTransaction(signature: string): Promise<TransactionWithMeta | null> {
  const response = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
    }),
  });

  const json = await response.json() as { result?: TransactionWithMeta };
  return json.result ?? null;
}

// ==================== DEX Detection & Parsing ====================

export function detectDex(tx: TransactionWithMeta): string {
  const adapter = dexRegistry.findAdapter(tx);
  return adapter?.name ?? 'UNKNOWN';
}

export async function parseTransaction(
  tx: TransactionWithMeta,
  traderId: string,
): Promise<ParsedTradeEvent | null> {
  return dexRegistry.parse(tx, traderId);
}

// ==================== Processing Loop ====================

async function processMessage(
  walletAddress: string,
  signature: string,
  slot: number,
  timestamp: string,
): Promise<void> {
  // Fetch full transaction
  const tx = await fetchTransaction(signature);
  if (!tx) {
    console.warn(`[tx-parser] Transaction not found: ${signature}`);
    return;
  }

  // Skip failed transactions
  if (tx.meta?.err) {
    console.log(`[tx-parser] Skipping failed tx: ${signature}`);
    return;
  }

  // Look up trader by wallet address
  const trader = await prisma.trader.findUnique({
    where: { walletAddress },
  });
  if (!trader) {
    console.warn(`[tx-parser] Unknown trader wallet: ${walletAddress}`);
    return;
  }

  // Parse trade using DEX adapters
  const parsed = await parseTransaction(tx, trader.id);
  if (!parsed) {
    console.log(`[tx-parser] No DEX trade detected in tx: ${signature}`);
    return;
  }

  // Store Trade row in DB
  await prisma.trade.create({
    data: {
      traderId: trader.id,
      signature: parsed.signature,
      slot: BigInt(parsed.slot),
      timestamp: new Date(parsed.timestamp),
      tokenIn: parsed.tokenIn,
      tokenOut: parsed.tokenOut,
      amountIn: parsed.amountIn,
      amountOut: parsed.amountOut,
      dex: parsed.dex,
      priceImpactBps: parsed.priceImpactBps,
      feeSol: parsed.feeSol,
    },
  });

  // Push ParsedTradeEvent to stream
  await publishToStream(redis, STREAMS.PARSED_TRADES, {
    traderId: parsed.traderId,
    signature: parsed.signature,
    slot: String(parsed.slot),
    timestamp: new Date(parsed.timestamp).toISOString(),
    tokenIn: parsed.tokenIn,
    tokenOut: parsed.tokenOut,
    amountIn: parsed.amountIn,
    amountOut: parsed.amountOut,
    dex: parsed.dex,
    priceImpactBps: String(parsed.priceImpactBps ?? ''),
    feeSol: parsed.feeSol ?? '',
  });

  console.log(`[tx-parser] Parsed trade: ${signature} on ${parsed.dex}`);
}

async function consumeLoop(): Promise<void> {
  await createConsumerGroup(redis, {
    stream: STREAMS.WALLET_EVENTS,
    group: CONSUMER_GROUPS.TX_PARSER,
  });

  while (!isShuttingDown) {
    try {
      const messages = await readFromStream(redis, {
        stream: STREAMS.WALLET_EVENTS,
        group: CONSUMER_GROUPS.TX_PARSER,
        consumer: CONSUMER_NAME,
        count: 5,
        blockMs: 2000,
      });

      for (const msg of messages) {
        try {
          await processMessage(
            msg.data.walletAddress,
            msg.data.signature,
            parseInt(msg.data.slot, 10),
            msg.data.timestamp,
          );
        } catch (err) {
          console.error(`[tx-parser] Error processing message ${msg.id}:`, err);
        }

        await acknowledgeMessage(
          redis,
          STREAMS.WALLET_EVENTS,
          CONSUMER_GROUPS.TX_PARSER,
          msg.id,
        );
      }
    } catch (err) {
      if (!isShuttingDown) {
        console.error('[tx-parser] Consumer loop error:', err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}

// ==================== Lifecycle ====================

export async function start(): Promise<void> {
  console.log('[tx-parser] Starting...');
  redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  await consumeLoop();
}

export async function shutdown(): Promise<void> {
  console.log('[tx-parser] Shutting down...');
  isShuttingDown = true;
  await redis?.quit();
  await prisma.$disconnect();
}

// ==================== Main ====================

if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    console.error('[tx-parser] Fatal error:', err);
    process.exit(1);
  });

  process.on('SIGTERM', () => shutdown());
  process.on('SIGINT', () => shutdown());
}
