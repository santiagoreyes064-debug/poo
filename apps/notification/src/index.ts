import 'dotenv/config';
import Redis from 'ioredis';
import { prisma } from '@copy-trading/database';
import {
  createConsumerGroup,
  readFromStream,
  acknowledgeMessage,
  STREAMS,
  CONSUMER_GROUPS,
  NotificationChannel,
  CopyTradeStatus,
} from '@copy-trading/shared-types';

export const SERVICE_NAME = 'notification';

// ==================== Configuration ====================

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const CONSUMER_NAME = process.env.CONSUMER_NAME ?? `notification-${process.pid}`;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL ?? '';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY ?? '';
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? 'noreply@copytrading.app';

// ==================== State ====================

let redis: Redis;
let isShuttingDown = false;

// ==================== Notification Event Types ====================

type NotificationEventType = 'onTradeExecuted' | 'onTradeFailed' | 'onDailyLoss' | 'onTraderPaused';

interface NotificationPayload {
  userId: string;
  eventType: NotificationEventType;
  title: string;
  message: string;
}

// ==================== Channel Senders ====================

export async function sendTelegram(chatId: string, message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('[notification] Telegram bot token not configured');
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram send failed: ${response.status} ${body}`);
  }
}

export async function sendDiscord(webhookUrl: string, message: string): Promise<void> {
  const url = webhookUrl || DISCORD_WEBHOOK_URL;
  if (!url) {
    console.warn('[notification] Discord webhook URL not configured');
    return;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord send failed: ${response.status} ${body}`);
  }
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  if (!SENDGRID_API_KEY) {
    console.warn('[notification] SendGrid API key not configured');
    return;
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: SENDGRID_FROM_EMAIL },
      subject,
      content: [{ type: 'text/plain', value: body }],
    }),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`SendGrid send failed: ${response.status} ${responseBody}`);
  }
}

// ==================== Notification Dispatch ====================

async function sendNotification(
  channel: NotificationChannel,
  target: string,
  payload: NotificationPayload,
): Promise<void> {
  switch (channel) {
    case NotificationChannel.TELEGRAM:
      await sendTelegram(target, `<b>${payload.title}</b>\n${payload.message}`);
      break;
    case NotificationChannel.DISCORD:
      await sendDiscord(target, `**${payload.title}**\n${payload.message}`);
      break;
    case NotificationChannel.EMAIL:
      await sendEmail(target, payload.title, payload.message);
      break;
    case NotificationChannel.WEBHOOK: {
      const response = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Webhook send failed: ${response.status}`);
      }
      break;
    }
  }
}

function determineEventType(status: string, errorMessage?: string): NotificationEventType {
  if (status === CopyTradeStatus.CONFIRMED) return 'onTradeExecuted';
  if (status === CopyTradeStatus.FAILED) return 'onTradeFailed';
  return 'onTradeFailed';
}

function formatTradeMessage(data: Record<string, string>): { title: string; message: string } {
  const status = data.status;
  const amountSol = data.amountSol;
  const signature = data.signature;
  const paperTrading = data.paperTrading === 'true';
  const latencyMs = data.latencyMs;

  if (status === CopyTradeStatus.CONFIRMED) {
    const mode = paperTrading ? ' [PAPER]' : '';
    return {
      title: `Trade Executed${mode}`,
      message: `Amount: ${amountSol} SOL\nSignature: ${signature?.slice(0, 16)}...\nLatency: ${latencyMs}ms`,
    };
  }

  return {
    title: 'Trade Failed',
    message: `Amount: ${amountSol} SOL\nError: ${data.errorMessage ?? 'Unknown error'}`,
  };
}

// ==================== Processing ====================

async function processExecutionResult(data: Record<string, string>): Promise<void> {
  const userId = data.userId;
  if (!userId) return;

  const eventType = determineEventType(data.status, data.errorMessage);
  const { title, message } = formatTradeMessage(data);

  // Look up user notification preferences
  const preferences = await prisma.notificationPreference.findMany({
    where: {
      userId,
      enabled: true,
      [eventType]: true,
    },
  });

  if (preferences.length === 0) {
    return;
  }

  const payload: NotificationPayload = {
    userId,
    eventType,
    title,
    message,
  };

  // Send to all configured channels
  for (const pref of preferences) {
    try {
      await sendNotification(
        pref.channel as NotificationChannel,
        pref.target,
        payload,
      );
      console.log(`[notification] Sent ${eventType} via ${pref.channel} to user ${userId}`);
    } catch (err) {
      console.error(
        `[notification] Failed to send via ${pref.channel} to ${pref.target}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

// ==================== Consumer Loop ====================

async function consumeLoop(): Promise<void> {
  await createConsumerGroup(redis, {
    stream: STREAMS.EXECUTION_RESULTS,
    group: CONSUMER_GROUPS.NOTIFICATION,
  });

  while (!isShuttingDown) {
    try {
      const messages = await readFromStream(redis, {
        stream: STREAMS.EXECUTION_RESULTS,
        group: CONSUMER_GROUPS.NOTIFICATION,
        consumer: CONSUMER_NAME,
        count: 10,
        blockMs: 2000,
      });

      for (const msg of messages) {
        try {
          await processExecutionResult(msg.data);
        } catch (err) {
          console.error(`[notification] Error processing message ${msg.id}:`, err);
        }

        await acknowledgeMessage(
          redis,
          STREAMS.EXECUTION_RESULTS,
          CONSUMER_GROUPS.NOTIFICATION,
          msg.id,
        );
      }
    } catch (err) {
      if (!isShuttingDown) {
        console.error('[notification] Consumer loop error:', err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}

// ==================== Lifecycle ====================

export async function start(): Promise<void> {
  console.log('[notification] Starting...');
  redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  await consumeLoop();
}

export async function shutdown(): Promise<void> {
  console.log('[notification] Shutting down...');
  isShuttingDown = true;
  await redis?.quit();
  await prisma.$disconnect();
}

// ==================== Main ====================

if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    console.error('[notification] Fatal error:', err);
    process.exit(1);
  });

  process.on('SIGTERM', () => shutdown());
  process.on('SIGINT', () => shutdown());
}
