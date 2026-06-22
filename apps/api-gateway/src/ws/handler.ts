import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import type { WsMessage, WsMessageType, SigningResponse } from '@copy-trading/shared-types';

// Multi-tab support: Map<userId, Set<WebSocket>>
const connections: Map<string, Set<WebSocket>> = new Map();

// Heartbeat interval in ms
const HEARTBEAT_INTERVAL = 30000;

export function getConnections(): Map<string, Set<WebSocket>> {
  return connections;
}

export function broadcastToUser(userId: string, message: WsMessage): void {
  const userSockets = connections.get(userId);
  if (!userSockets) return;

  const data = JSON.stringify(message);
  for (const ws of userSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

export function removeConnection(userId: string, ws: WebSocket): void {
  const userSockets = connections.get(userId);
  if (userSockets) {
    userSockets.delete(ws);
    if (userSockets.size === 0) {
      connections.delete(userId);
    }
  }
}

export async function wsHandler(app: FastifyInstance): Promise<void> {
  app.get('/ws', { websocket: true }, (socket, request) => {
    const ws = socket as unknown as WebSocket;

    // Authenticate via query param token
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Missing authentication token');
      return;
    }

    let user: { userId: string; walletAddress: string };
    try {
      user = app.jwt.verify<{ userId: string; walletAddress: string }>(token);
    } catch {
      ws.close(4001, 'Invalid authentication token');
      return;
    }

    const userId = user.userId;

    // Register connection (multi-tab support)
    if (!connections.has(userId)) {
      connections.set(userId, new Set());
    }
    connections.get(userId)!.add(ws);

    // Send connected message
    const connectedMsg: WsMessage = {
      type: 'CONNECTED' as WsMessageType,
      payload: { sessionId: `session_${Date.now()}` },
      timestamp: Date.now(),
    };
    ws.send(JSON.stringify(connectedMsg));

    // Heartbeat
    const heartbeatInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, HEARTBEAT_INTERVAL);

    // Handle incoming messages
    ws.on('message', (data: Buffer | string) => {
      try {
        const message: WsMessage = JSON.parse(data.toString());

        switch (message.type) {
          case 'PING' as WsMessageType: {
            const pongMsg: WsMessage = {
              type: 'PONG' as WsMessageType,
              payload: {},
              timestamp: Date.now(),
            };
            ws.send(JSON.stringify(pongMsg));
            break;
          }

          case 'SIGNING_RESPONSE' as WsMessageType: {
            // Forward signing response to the execution service via Redis
            const signingResponse = message.payload as SigningResponse;
            handleSigningResponse(userId, signingResponse);
            break;
          }

          default:
            // Unknown message type - ignore
            break;
        }
      } catch {
        // Invalid JSON - ignore
      }
    });

    // Handle connection close
    ws.on('close', () => {
      clearInterval(heartbeatInterval);
      removeConnection(userId, ws);
    });

    ws.on('error', () => {
      clearInterval(heartbeatInterval);
      removeConnection(userId, ws);
    });
  });
}

/**
 * Handle signing response from the client.
 * In production, this publishes to Redis for the execution service to pick up.
 */
function handleSigningResponse(userId: string, response: SigningResponse): void {
  // In production: publish to Redis channel `signing:responses:{userId}`
  // For now, just log it
  void userId;
  void response;
}

/**
 * Forward a signing request to the user via WebSocket.
 * Called when a message is received from Redis pub/sub on `signing:requests:{userId}`.
 */
export function forwardSigningRequest(userId: string, request: unknown): void {
  const message: WsMessage = {
    type: 'SIGNING_REQUEST' as WsMessageType,
    payload: request,
    timestamp: Date.now(),
  };
  broadcastToUser(userId, message);
}
