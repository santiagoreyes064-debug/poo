import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { authPlugin, verifyEd25519Signature, generateNonce } from '../plugins/auth.js';

// Mock Redis
vi.mock('../services/redis.js', () => {
  const nonceStore = new Map<string, string>();
  return {
    getRedisClient: () => ({
      get: async (key: string) => nonceStore.get(key) || null,
      set: async (key: string, value: string) => { nonceStore.set(key, value); },
      del: async (key: string) => { nonceStore.delete(key); },
      connect: async () => {},
      quit: async () => {},
    }),
    storeNonce: async (_redis: unknown, walletAddress: string, nonce: string) => {
      nonceStore.set(`nonce:${walletAddress}`, nonce);
    },
    getNonce: async (_redis: unknown, walletAddress: string) => {
      return nonceStore.get(`nonce:${walletAddress}`) || null;
    },
    deleteNonce: async (_redis: unknown, walletAddress: string) => {
      nonceStore.delete(`nonce:${walletAddress}`);
    },
    createRedisSubscriber: () => ({
      subscribe: async () => {},
      on: () => {},
      connect: async () => {},
      quit: async () => {},
    }),
    closeRedis: async () => {},
  };
});

// Mock @solana/web3.js PublicKey
vi.mock('@solana/web3.js', () => ({
  PublicKey: class PublicKey {
    constructor(key: string) {
      // Simple validation: base58, 32-44 chars
      if (!key || key.length < 32 || key.length > 44) {
        throw new Error('Invalid public key');
      }
    }
  },
}));

describe('Auth Plugin', () => {
  describe('generateNonce', () => {
    it('should generate a non-empty string nonce', () => {
      const nonce = generateNonce();
      expect(nonce).toBeTruthy();
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBeGreaterThan(10);
    });

    it('should generate unique nonces', () => {
      const nonce1 = generateNonce();
      const nonce2 = generateNonce();
      expect(nonce1).not.toBe(nonce2);
    });
  });

  describe('verifyEd25519Signature', () => {
    it('should verify a valid signature', () => {
      const keypair = nacl.sign.keyPair();
      const publicKeyBase58 = bs58.encode(keypair.publicKey);
      const message = 'test-nonce-123';
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
      const signatureBase58 = bs58.encode(signatureBytes);

      const result = verifyEd25519Signature(publicKeyBase58, signatureBase58, message);
      expect(result).toBe(true);
    });

    it('should verify a valid base64 signature', () => {
      const keypair = nacl.sign.keyPair();
      const publicKeyBase58 = bs58.encode(keypair.publicKey);
      const message = 'test-nonce-123';
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
      const signatureBase64 = Buffer.from(signatureBytes).toString('base64');

      const result = verifyEd25519Signature(publicKeyBase58, signatureBase64, message);
      expect(result).toBe(true);
    });

    it('should reject an invalid signature', () => {
      const keypair = nacl.sign.keyPair();
      const publicKeyBase58 = bs58.encode(keypair.publicKey);
      const message = 'test-nonce-123';
      const wrongMessage = 'wrong-nonce';
      const messageBytes = new TextEncoder().encode(wrongMessage);
      const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
      const signatureBase58 = bs58.encode(signatureBytes);

      const result = verifyEd25519Signature(publicKeyBase58, signatureBase58, message);
      expect(result).toBe(false);
    });

    it('should return false for malformed input', () => {
      const result = verifyEd25519Signature('invalid', 'invalid', 'message');
      expect(result).toBe(false);
    });
  });

  describe('authenticate decorator', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = Fastify();
      await app.register(fastifyJwt, { secret: 'test-secret' });
      await app.register(authPlugin);

      app.get('/protected', {
        preHandler: [app.authenticate],
      }, async (request) => {
        return { user: request.user };
      });

      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('should reject requests without JWT', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
    });

    it('should accept requests with valid JWT', async () => {
      const token = app.jwt.sign({ userId: 'user_123', walletAddress: 'testWallet123456789012345678901234' });

      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user.userId).toBe('user_123');
    });

    it('should reject requests with expired/invalid JWT', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
