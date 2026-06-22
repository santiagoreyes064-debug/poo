'use client';

import { useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { useWebSocketStore } from '@/stores/useWebSocketStore';
import { wsClient } from '@/lib/websocket';
import type { WsSigningRequestPayload } from '@/lib/websocket';

export function useSigningRequests() {
  const { signTransaction } = useWallet();
  const { signingQueue, removeFromQueue } = useWebSocketStore();

  const processRequest = useCallback(
    async (request: WsSigningRequestPayload) => {
      if (!signTransaction) {
        wsClient.sendSigningResponse(request.requestId, '', false);
        removeFromQueue(request.requestId);
        return;
      }

      try {
        const txBuffer = Buffer.from(request.serializedTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(txBuffer);
        const signed = await signTransaction(transaction);
        const serialized = Buffer.from(signed.serialize()).toString('base64');

        wsClient.sendSigningResponse(request.requestId, serialized, true);
      } catch {
        wsClient.sendSigningResponse(request.requestId, '', false);
      } finally {
        removeFromQueue(request.requestId);
      }
    },
    [signTransaction, removeFromQueue],
  );

  const rejectRequest = useCallback(
    (requestId: string) => {
      wsClient.sendSigningResponse(requestId, '', false);
      removeFromQueue(requestId);
    },
    [removeFromQueue],
  );

  return {
    signingQueue,
    processRequest,
    rejectRequest,
    hasPendingRequests: signingQueue.length > 0,
  };
}
