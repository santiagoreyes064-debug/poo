import type { Redis } from 'ioredis';

export interface StreamMessage {
  id: string;
  data: Record<string, string>;
}

export interface ConsumerGroupOptions {
  stream: string;
  group: string;
  startId?: string;
}

export interface ReadGroupOptions {
  stream: string;
  group: string;
  consumer: string;
  count?: number;
  blockMs?: number;
}

/**
 * Create a consumer group for a stream. If the stream or group already exists,
 * this call is idempotent.
 */
export async function createConsumerGroup(
  redis: Redis,
  options: ConsumerGroupOptions,
): Promise<void> {
  const { stream, group, startId = '0' } = options;
  try {
    await redis.xgroup('CREATE', stream, group, startId, 'MKSTREAM');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('BUSYGROUP')) {
      throw err;
    }
    // Group already exists - this is fine
  }
}

/**
 * Read messages from a consumer group. Returns parsed messages or an empty array.
 */
export async function readFromStream(
  redis: Redis,
  options: ReadGroupOptions,
): Promise<StreamMessage[]> {
  const { stream, group, consumer, count = 10, blockMs = 2000 } = options;

  const result = await redis.xreadgroup(
    'GROUP',
    group,
    consumer,
    'COUNT',
    count,
    'BLOCK',
    blockMs,
    'STREAMS',
    stream,
    '>',
  ) as [string, [string, string[]][]][] | null;

  if (!result) {
    return [];
  }

  const messages: StreamMessage[] = [];

  for (const streamEntry of result) {
    const entries = streamEntry[1];
    for (const entry of entries) {
      const id = entry[0];
      const fields = entry[1];
      const data: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        data[fields[i]] = fields[i + 1];
      }
      messages.push({ id, data });
    }
  }

  return messages;
}

/**
 * Acknowledge a message in a consumer group.
 */
export async function acknowledgeMessage(
  redis: Redis,
  stream: string,
  group: string,
  messageId: string,
): Promise<void> {
  await redis.xack(stream, group, messageId);
}

/**
 * Publish a message to a Redis stream.
 */
export async function publishToStream(
  redis: Redis,
  stream: string,
  data: Record<string, string>,
  maxLen?: number,
): Promise<string> {
  const fields: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    fields.push(key, value);
  }

  let id: string | null;
  if (maxLen) {
    id = await redis.xadd(stream, 'MAXLEN', '~', String(maxLen), '*', ...fields);
  } else {
    id = await redis.xadd(stream, '*', ...fields);
  }

  return id ?? '';
}

/**
 * Stream names used across the platform.
 */
export const STREAMS = {
  WALLET_EVENTS: 'stream:wallet-events',
  PARSED_TRADES: 'stream:parsed-trades',
  COPY_ORDERS: 'stream:copy-orders',
  EXECUTION_RESULTS: 'execution:results',
} as const;

/**
 * Consumer group names.
 */
export const CONSUMER_GROUPS = {
  TX_PARSER: 'tx-parser-group',
  COPY_ENGINE: 'copy-engine-group',
  EXECUTION: 'execution-group',
  NOTIFICATION: 'notification-group',
} as const;
