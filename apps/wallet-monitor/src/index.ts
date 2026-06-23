import 'dotenv/config';
import WebSocket from 'ws';
import Redis from 'ioredis';
import { prisma } from '@copy-trading/database';
import {
  publishToStream,
  STREAMS,
  WalletEvent,
} from '@copy-trading/shared-types';

export const SERVICE_NAME = 'wallet-monitor';

// ==================== Configuration ====================

const HELIUS_WS_URL = process.env.HELIUS_WS_URL ?? 'wss://atlas-mainnet.helius-rpc.com?api-key=YOUR_KEY';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const MONITOR_SUBSCRIBE_CHANNEL = 'monitor:subscribe';
const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

// ==================== State ====================

let ws: WebSocket | null = null;
let redis: Redis;
let subscriber: Redis;
let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
let isShuttingDown = false;
const monitoredWallets = new Set<string>();
let subscriptionIdMap = new Map<number, string>(); // rpc subscription id -> wallet address
let rpcId = 1;

// ==================== Helius WebSocket ====================

function getRpcId(): number {
  return rpcId++;
}

function subscribeToWallet(walletAddress: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const id = getRpcId();
  const subscribeMsg = {
    jsonrpc: '2.0',
    id,
    method: 'accountSubscribe',
    params: [
      walletAddress,
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ],
  };
  ws.send(JSON.stringify(subscribeMsg));
}

function handleWsMessage(raw: string): void {
  try {
    const msg = JSON.parse(raw);

    // Handle subscription confirmation
    if (msg.id && msg.result !== undefined) {
      // Store subscription id mapping if needed
      return;
    }

    // Handle account notification
    if (msg.method === 'accountNotification' && msg.params) {
      const { subscription } = msg.params;
      const walletAddress = subscriptionIdMap.get(subscription);

      // For Helius enhanced WebSocket, the notification includes transaction info
      const slot = msg.params.result?.context?.slot ?? 0;
      const signature = msg.params.result?.value?.signature ??
        `slot-${slot}-${Date.now()}`;

      if (walletAddress || monitoredWallets.size > 0) {
        const event: WalletEvent = {
          walletAddress: walletAddress ?? 'unknown',
          signature,
          slot,
          timestamp: new Date(),
        };

        publishToStream(redis, STREAMS.WALLET_EVENTS, {
          walletAddress: event.walletAddress,
          signature: event.signature,
          slot: String(event.slot),
          timestamp: event.timestamp.toISOString(),
        }).catch((err) => {
          console.error('[wallet-monitor] Failed to publish event:', err);
        });
      }
    }
  } catch (err) {
    console.error('[wallet-monitor] Failed to parse WebSocket message:', err);
  }
}

function connect(): void {
  if (isShuttingDown) return;

  console.log('[wallet-monitor] Connecting to Helius WebSocket...');
  ws = new WebSocket(HELIUS_WS_URL);

  ws.on('open', () => {
    console.log('[wallet-monitor] WebSocket connected');
    reconnectDelay = INITIAL_RECONNECT_DELAY_MS;

    // Re-subscribe all monitored wallets
    for (const wallet of monitoredWallets) {
      subscribeToWallet(wallet);
    }
  });

  ws.on('message', (data) => {
    handleWsMessage(data.toString());
  });

  ws.on('close', () => {
    if (isShuttingDown) return;
    console.log(`[wallet-monitor] WebSocket closed. Reconnecting in ${reconnectDelay}ms...`);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('[wallet-monitor] WebSocket error:', err.message);
    ws?.close();
  });
}

function scheduleReconnect(): void {
  if (isShuttingDown) return;

  setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
    connect();
  }, reconnectDelay);
}

// ==================== Dynamic Subscription Updates ====================

function handleSubscribeMessage(message: string): void {
  try {
    const { action, walletAddress } = JSON.parse(message);
    if (action === 'add' && walletAddress) {
      monitoredWallets.add(walletAddress);
      subscribeToWallet(walletAddress);
      console.log(`[wallet-monitor] Added wallet: ${walletAddress}`);
    } else if (action === 'remove' && walletAddress) {
      monitoredWallets.delete(walletAddress);
      console.log(`[wallet-monitor] Removed wallet: ${walletAddress}`);
    }
  } catch (err) {
    console.error('[wallet-monitor] Invalid subscribe message:', err);
  }
}

// ==================== Initialization ====================

async function loadMonitoredWallets(): Promise<void> {
  try {
    const traders = await prisma.trader.findMany({
      where: { status: { in: ['ACTIVE', 'PAUSED'] } },
      select: { walletAddress: true },
    });
    for (const trader of traders) {
      monitoredWallets.add(trader.walletAddress);
    }
    console.log(`[wallet-monitor] Loaded ${monitoredWallets.size} wallets from DB`);
  } catch (err) {
    console.error('[wallet-monitor] Failed to load wallets from DB:', err);
  }
}

export async function start(): Promise<void> {
  console.log('[wallet-monitor] Starting...');

  redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  subscriber = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

  // Load wallets from database
  await loadMonitoredWallets();

  // Subscribe to dynamic wallet updates
  await subscriber.subscribe(MONITOR_SUBSCRIBE_CHANNEL);
  subscriber.on('message', (_channel, message) => {
    handleSubscribeMessage(message);
  });

  // Connect WebSocket
  connect();
}

export async function shutdown(): Promise<void> {
  console.log('[wallet-monitor] Shutting down...');
  isShuttingDown = true;

  if (ws) {
    ws.close();
    ws = null;
  }

  await subscriber?.quit();
  await redis?.quit();
  await prisma.$disconnect();
}

// ==================== Main ====================

if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    console.error('[wallet-monitor] Fatal error:', err);
    process.exit(1);
  });

  process.on('SIGTERM', () => shutdown());
  process.on('SIGINT', () => shutdown());
}
