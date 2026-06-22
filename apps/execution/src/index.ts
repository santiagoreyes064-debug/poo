import Redis from 'ioredis';
import { prisma } from '@copy-trading/database';
import {
  createConsumerGroup,
  readFromStream,
  acknowledgeMessage,
  publishToStream,
  STREAMS,
  CONSUMER_GROUPS,
  CopyTradeStatus,
} from '@copy-trading/shared-types';

export const SERVICE_NAME = 'execution';

// ==================== Configuration ====================

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CONSUMER_NAME = process.env.CONSUMER_NAME ?? `execution-${process.pid}`;
const JUPITER_QUOTE_URL = process.env.JUPITER_QUOTE_URL ?? 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_URL = process.env.JUPITER_SWAP_URL ?? 'https://quote-api.jup.ag/v6/swap';
const JITO_BLOCK_ENGINE_URL = process.env.JITO_BLOCK_ENGINE_URL ?? 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL ?? 'https://mainnet.helius-rpc.com/?api-key=YOUR_KEY';
const PAPER_TRADING = process.env.PAPER_TRADING === 'true';
const ORDER_DEADLINE_MS = 3000; // Discard orders older than 3 seconds

// ==================== State ====================

let redis: Redis;
let isShuttingDown = false;

// ==================== Jupiter API ====================

export interface JupiterQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  routePlan: unknown[];
}

export interface JupiterSwapResponse {
  swapTransaction: string; // base64 serialized versioned transaction
}

export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
  slippageBps: number,
): Promise<JupiterQuoteResponse> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps: String(slippageBps),
  });

  const response = await fetch(`${JUPITER_QUOTE_URL}?${params}`);
  if (!response.ok) {
    throw new Error(`Jupiter quote failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<JupiterQuoteResponse>;
}

export async function getJupiterSwap(
  quoteResponse: JupiterQuoteResponse,
  userPublicKey: string,
): Promise<JupiterSwapResponse> {
  const response = await fetch(JUPITER_SWAP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`Jupiter swap failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<JupiterSwapResponse>;
}

// ==================== Transaction Submission ====================

export async function submitViaJito(serializedTx: string): Promise<string> {
  const response = await fetch(JITO_BLOCK_ENGINE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendBundle',
      params: [[serializedTx]],
    }),
  });

  if (!response.ok) {
    throw new Error(`Jito submission failed: ${response.status}`);
  }

  const result = await response.json() as { result?: string };
  return result.result ?? '';
}

export async function submitViaRpc(serializedTx: string): Promise<string> {
  const response = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [serializedTx, { encoding: 'base64', skipPreflight: false }],
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC submission failed: ${response.status}`);
  }

  const result = await response.json() as { result?: string; error?: { message: string } };
  if (result.error) {
    throw new Error(`RPC error: ${result.error.message}`);
  }
  return result.result ?? '';
}

// ==================== Paper Trading ====================

export function generatePaperResult(
  tokenIn: string,
  tokenOut: string,
  amountSol: number,
): { signature: string; amountOut: string; latencyMs: number } {
  const syntheticSignature = `paper_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  // Simulate a realistic output amount with small slippage
  const slippageMultiplier = 0.995 + Math.random() * 0.008; // 0.3% avg slippage
  const simulatedOut = (amountSol * slippageMultiplier * 1e9).toFixed(0);
  const simulatedLatency = Math.floor(50 + Math.random() * 200); // 50-250ms

  return {
    signature: syntheticSignature,
    amountOut: simulatedOut,
    latencyMs: simulatedLatency,
  };
}

// ==================== Order Processing ====================

export async function processOrder(
  redis: Redis,
  data: Record<string, string>,
): Promise<void> {
  const copyTradeId = data.copyTradeId;
  const userId = data.userId;
  const tokenIn = data.tokenIn;
  const tokenOut = data.tokenOut;
  const amountSol = parseFloat(data.amountSol);
  const maxSlippageBps = parseInt(data.maxSlippageBps, 10);
  const orderTimestamp = new Date(data.timestamp).getTime();

  // Check deadline - discard if order is too old
  const ageMs = Date.now() - orderTimestamp;
  if (ageMs > ORDER_DEADLINE_MS) {
    console.log(`[execution] Order ${copyTradeId} expired (${ageMs}ms old), discarding`);
    await prisma.copyTrade.update({
      where: { id: copyTradeId },
      data: {
        status: CopyTradeStatus.FAILED,
        errorMessage: `Order expired: ${ageMs}ms > ${ORDER_DEADLINE_MS}ms deadline`,
      },
    });
    return;
  }

  const startTime = Date.now();

  try {
    // Update status to SUBMITTED
    await prisma.copyTrade.update({
      where: { id: copyTradeId },
      data: { status: CopyTradeStatus.SUBMITTED },
    });

    if (PAPER_TRADING) {
      // Paper trading mode - simulate execution
      const result = generatePaperResult(tokenIn, tokenOut, amountSol);

      await prisma.copyTrade.update({
        where: { id: copyTradeId },
        data: {
          status: CopyTradeStatus.CONFIRMED,
          copiedSignature: result.signature,
          amountOut: result.amountOut,
          executionLatencyMs: result.latencyMs,
          settledAt: new Date(),
        },
      });

      // Publish execution result
      await publishToStream(redis, STREAMS.EXECUTION_RESULTS, {
        copyTradeId,
        userId,
        status: CopyTradeStatus.CONFIRMED,
        signature: result.signature,
        amountSol: String(amountSol),
        amountOut: result.amountOut,
        latencyMs: String(result.latencyMs),
        paperTrading: 'true',
        timestamp: new Date().toISOString(),
      });

      console.log(`[execution] Paper trade executed: ${copyTradeId} (${result.latencyMs}ms)`);
      return;
    }

    // Real execution: Jupiter quote -> swap -> submit
    const amountLamports = Math.floor(amountSol * 1e9).toString();
    const quote = await getJupiterQuote(tokenIn, tokenOut, amountLamports, maxSlippageBps);

    // Get vault public key for the user
    const vault = await prisma.vault.findFirst({
      where: { userId, isPaused: false },
      select: { publicKey: true },
    });

    if (!vault) {
      throw new Error('No active vault found for user');
    }

    const swap = await getJupiterSwap(quote, vault.publicKey);
    const serializedTx = swap.swapTransaction;

    // Try Jito first, fallback to Helius RPC
    let signature: string;
    let jitoBundleId: string | undefined;

    try {
      jitoBundleId = await submitViaJito(serializedTx);
      signature = jitoBundleId;
    } catch (jitoErr) {
      console.warn(`[execution] Jito failed, falling back to RPC:`, jitoErr);
      signature = await submitViaRpc(serializedTx);
    }

    const latencyMs = Date.now() - startTime;

    await prisma.copyTrade.update({
      where: { id: copyTradeId },
      data: {
        status: CopyTradeStatus.CONFIRMED,
        copiedSignature: signature,
        amountOut: quote.outAmount,
        executionLatencyMs: latencyMs,
        jitoBundleId,
        settledAt: new Date(),
      },
    });

    // Publish execution result
    await publishToStream(redis, STREAMS.EXECUTION_RESULTS, {
      copyTradeId,
      userId,
      status: CopyTradeStatus.CONFIRMED,
      signature,
      amountSol: String(amountSol),
      amountOut: quote.outAmount,
      latencyMs: String(latencyMs),
      paperTrading: 'false',
      timestamp: new Date().toISOString(),
    });

    console.log(`[execution] Trade confirmed: ${copyTradeId} sig=${signature} (${latencyMs}ms)`);
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);

    await prisma.copyTrade.update({
      where: { id: copyTradeId },
      data: {
        status: CopyTradeStatus.FAILED,
        errorMessage,
        executionLatencyMs: latencyMs,
      },
    });

    // Publish failure result
    await publishToStream(redis, STREAMS.EXECUTION_RESULTS, {
      copyTradeId,
      userId,
      status: CopyTradeStatus.FAILED,
      signature: '',
      amountSol: String(amountSol),
      amountOut: '0',
      latencyMs: String(latencyMs),
      paperTrading: String(PAPER_TRADING),
      errorMessage,
      timestamp: new Date().toISOString(),
    });

    console.error(`[execution] Trade failed: ${copyTradeId}: ${errorMessage}`);
  }
}

// ==================== Consumer Loop ====================

async function consumeLoop(): Promise<void> {
  await createConsumerGroup(redis, {
    stream: STREAMS.COPY_ORDERS,
    group: CONSUMER_GROUPS.EXECUTION,
  });

  while (!isShuttingDown) {
    try {
      const messages = await readFromStream(redis, {
        stream: STREAMS.COPY_ORDERS,
        group: CONSUMER_GROUPS.EXECUTION,
        consumer: CONSUMER_NAME,
        count: 1, // Process one at a time for latency sensitivity
        blockMs: 1000,
      });

      for (const msg of messages) {
        try {
          await processOrder(redis, msg.data);
        } catch (err) {
          console.error(`[execution] Error processing message ${msg.id}:`, err);
        }

        await acknowledgeMessage(
          redis,
          STREAMS.COPY_ORDERS,
          CONSUMER_GROUPS.EXECUTION,
          msg.id,
        );
      }
    } catch (err) {
      if (!isShuttingDown) {
        console.error('[execution] Consumer loop error:', err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}

// ==================== Lifecycle ====================

export async function start(): Promise<void> {
  console.log(`[execution] Starting... (paper_trading=${PAPER_TRADING})`);
  redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  await consumeLoop();
}

export async function shutdown(): Promise<void> {
  console.log('[execution] Shutting down...');
  isShuttingDown = true;
  await redis?.quit();
  await prisma.$disconnect();
}

// ==================== Main ====================

if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    console.error('[execution] Fatal error:', err);
    process.exit(1);
  });

  process.on('SIGTERM', () => shutdown());
  process.on('SIGINT', () => shutdown());
}
