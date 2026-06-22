import { WsMessageType } from '@copy-trading/shared-types';
import type { WsMessage, WsConnectedPayload, WsTradeUpdatePayload } from '@copy-trading/shared-types';

export type WsSigningRequestPayload = {
  requestId: string;
  serializedTransaction: string;
  purpose: string;
  expiresAt: string;
};

export type MessageHandler = (message: WsMessage) => void;

const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3002';
const PING_INTERVAL_MS = 30_000;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30_000;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private handlers: Map<WsMessageType, MessageHandler[]> = new Map();
  private isConnecting = false;
  private shouldReconnect = true;

  connect(token: string): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.token = token;
    this.isConnecting = true;
    this.shouldReconnect = true;

    try {
      this.ws = new WebSocket(`${WS_BASE_URL}?token=${encodeURIComponent(token)}`);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startPingInterval();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WsMessage = JSON.parse(event.data);
          this.dispatchMessage(message);
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.stopPingInterval();
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
      };
    } catch {
      this.isConnecting = false;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.stopPingInterval();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: WsMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendSigningResponse(requestId: string, signature: string, approved: boolean): void {
    this.send({
      type: WsMessageType.SIGNING_RESPONSE,
      payload: { requestId, signature, approved },
      timestamp: Date.now(),
    });
  }

  on(type: WsMessageType, handler: MessageHandler): () => void {
    const handlers = this.handlers.get(type) || [];
    handlers.push(handler);
    this.handlers.set(type, handlers);

    return () => {
      const current = this.handlers.get(type) || [];
      this.handlers.set(
        type,
        current.filter((h) => h !== handler),
      );
    };
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private dispatchMessage(message: WsMessage): void {
    const handlers = this.handlers.get(message.type) || [];
    for (const handler of handlers) {
      handler(message);
    }
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      this.send({
        type: WsMessageType.PING,
        payload: {},
        timestamp: Date.now(),
      });
    }, PING_INTERVAL_MS);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY_MS,
    );
    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      if (this.token && this.shouldReconnect) {
        this.connect(this.token);
      }
    }, delay);
  }
}

export const wsClient = new WebSocketClient();

export type { WsMessage, WsConnectedPayload, WsTradeUpdatePayload };
