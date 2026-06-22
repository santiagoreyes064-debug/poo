import { create } from 'zustand';
import { WsMessageType } from '@copy-trading/shared-types';
import { wsClient, type WsSigningRequestPayload } from '@/lib/websocket';

interface WebSocketState {
  isConnected: boolean;
  signingQueue: WsSigningRequestPayload[];

  connect: (token: string) => void;
  disconnect: () => void;
  removeFromQueue: (requestId: string) => void;
}

export const useWebSocketStore = create<WebSocketState>((set) => ({
  isConnected: false,
  signingQueue: [],

  connect: (token) => {
    wsClient.connect(token);

    wsClient.on(WsMessageType.CONNECTED, () => {
      set({ isConnected: true });
    });

    wsClient.on(WsMessageType.SIGNING_REQUEST, (message) => {
      const payload = message.payload as WsSigningRequestPayload;
      set((state) => ({
        signingQueue: [...state.signingQueue, payload],
      }));
    });

    wsClient.on(WsMessageType.PONG, () => {
      // Keep-alive acknowledged
    });
  },

  disconnect: () => {
    wsClient.disconnect();
    set({ isConnected: false, signingQueue: [] });
  },

  removeFromQueue: (requestId) => {
    set((state) => ({
      signingQueue: state.signingQueue.filter((r) => r.requestId !== requestId),
    }));
  },
}));
