import { describe, it, expect, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import { getConnections, broadcastToUser, removeConnection } from '../ws/handler.js';

describe('WebSocket Handler', () => {
  beforeEach(() => {
    // Clear connections
    const connections = getConnections();
    connections.clear();
  });

  describe('Connection Management', () => {
    it('should track connections per user', () => {
      const connections = getConnections();
      const mockWs1 = { readyState: WebSocket.OPEN, send: () => {} } as unknown as WebSocket;
      const mockWs2 = { readyState: WebSocket.OPEN, send: () => {} } as unknown as WebSocket;

      // Add connections
      connections.set('user_1', new Set([mockWs1]));
      connections.get('user_1')!.add(mockWs2);

      expect(connections.get('user_1')!.size).toBe(2);
    });

    it('should support multi-tab connections', () => {
      const connections = getConnections();
      const mockWs1 = { readyState: WebSocket.OPEN, send: () => {} } as unknown as WebSocket;
      const mockWs2 = { readyState: WebSocket.OPEN, send: () => {} } as unknown as WebSocket;
      const mockWs3 = { readyState: WebSocket.OPEN, send: () => {} } as unknown as WebSocket;

      connections.set('user_1', new Set([mockWs1, mockWs2]));
      connections.set('user_2', new Set([mockWs3]));

      expect(connections.get('user_1')!.size).toBe(2);
      expect(connections.get('user_2')!.size).toBe(1);
    });

    it('should remove individual connections', () => {
      const connections = getConnections();
      const mockWs1 = { readyState: WebSocket.OPEN, send: () => {} } as unknown as WebSocket;
      const mockWs2 = { readyState: WebSocket.OPEN, send: () => {} } as unknown as WebSocket;

      connections.set('user_1', new Set([mockWs1, mockWs2]));

      removeConnection('user_1', mockWs1);

      expect(connections.get('user_1')!.size).toBe(1);
      expect(connections.get('user_1')!.has(mockWs2)).toBe(true);
    });

    it('should clean up user entry when all connections removed', () => {
      const connections = getConnections();
      const mockWs1 = { readyState: WebSocket.OPEN, send: () => {} } as unknown as WebSocket;

      connections.set('user_1', new Set([mockWs1]));
      removeConnection('user_1', mockWs1);

      expect(connections.has('user_1')).toBe(false);
    });
  });

  describe('Broadcasting', () => {
    it('should broadcast message to all user connections', () => {
      const connections = getConnections();
      const sentMessages: string[] = [];
      const mockWs1 = {
        readyState: WebSocket.OPEN,
        send: (data: string) => sentMessages.push(data),
      } as unknown as WebSocket;
      const mockWs2 = {
        readyState: WebSocket.OPEN,
        send: (data: string) => sentMessages.push(data),
      } as unknown as WebSocket;

      connections.set('user_1', new Set([mockWs1, mockWs2]));

      broadcastToUser('user_1', {
        type: 'TRADE_UPDATE' as any,
        payload: { tradeId: 'trade_123' },
        timestamp: Date.now(),
      });

      expect(sentMessages.length).toBe(2);
      const parsed = JSON.parse(sentMessages[0]);
      expect(parsed.type).toBe('TRADE_UPDATE');
      expect(parsed.payload.tradeId).toBe('trade_123');
    });

    it('should skip closed connections when broadcasting', () => {
      const connections = getConnections();
      const sentMessages: string[] = [];
      const mockWsOpen = {
        readyState: WebSocket.OPEN,
        send: (data: string) => sentMessages.push(data),
      } as unknown as WebSocket;
      const mockWsClosed = {
        readyState: WebSocket.CLOSED,
        send: (data: string) => sentMessages.push(data),
      } as unknown as WebSocket;

      connections.set('user_1', new Set([mockWsOpen, mockWsClosed]));

      broadcastToUser('user_1', {
        type: 'PONG' as any,
        payload: {},
        timestamp: Date.now(),
      });

      expect(sentMessages.length).toBe(1);
    });

    it('should handle broadcast to non-existent user gracefully', () => {
      expect(() => {
        broadcastToUser('non_existent_user', {
          type: 'PONG' as any,
          payload: {},
          timestamp: Date.now(),
        });
      }).not.toThrow();
    });
  });
});
