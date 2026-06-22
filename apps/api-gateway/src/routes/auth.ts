import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import { generateNonce, verifyEd25519Signature } from '../plugins/auth.js';
import { getRedisClient, storeNonce, getNonce, deleteNonce } from '../services/redis.js';
import { writeAuditLog, AuditAction } from '../services/audit.js';

interface NonceBody {
  walletAddress: string;
}

interface VerifyBody {
  walletAddress: string;
  signature: string;
}

interface AddWalletBody {
  walletAddress: string;
  label?: string;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/auth/nonce - Generate a nonce for wallet authentication
  app.post<{ Body: NonceBody }>('/nonce', async (request, reply) => {
    const { walletAddress } = request.body;

    if (!walletAddress) {
      return reply.status(400).send({ error: 'walletAddress is required' });
    }

    // Validate wallet address format
    try {
      new PublicKey(walletAddress);
    } catch {
      return reply.status(400).send({ error: 'Invalid wallet address format' });
    }

    const nonce = generateNonce();
    const redis = getRedisClient();
    await storeNonce(redis, walletAddress, nonce);

    return reply.send({ nonce, expiresIn: 300 });
  });

  // POST /api/v1/auth/verify - Verify signature and return JWT
  app.post<{ Body: VerifyBody }>('/verify', async (request, reply) => {
    const { walletAddress, signature } = request.body;

    if (!walletAddress || !signature) {
      return reply.status(400).send({ error: 'walletAddress and signature are required' });
    }

    // Validate wallet address format
    try {
      new PublicKey(walletAddress);
    } catch {
      return reply.status(400).send({ error: 'Invalid wallet address format' });
    }

    const redis = getRedisClient();
    const nonce = await getNonce(redis, walletAddress);

    if (!nonce) {
      return reply.status(401).send({ error: 'Nonce expired or not found. Request a new nonce.' });
    }

    // Verify Ed25519 signature
    const isValid = verifyEd25519Signature(walletAddress, signature, nonce);

    if (!isValid) {
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    // Delete nonce after successful verification
    await deleteNonce(redis, walletAddress);

    // Upsert user and wallet (simplified - in production use database)
    const userId = `user_${walletAddress.slice(0, 8)}`;

    // Generate JWT
    const token = app.jwt.sign({
      userId,
      walletAddress,
    });

    writeAuditLog({
      userId,
      action: AuditAction.WALLET_CONNECTED,
      metadata: { walletAddress },
      ipAddress: request.ip,
    });

    return reply.send({
      token,
      user: {
        id: userId,
        walletAddress,
      },
    });
  });

  // POST /api/v1/auth/wallet - Add secondary wallet (requires auth)
  app.post<{ Body: AddWalletBody }>('/wallet', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const { walletAddress, label } = request.body;

    if (!walletAddress) {
      return reply.status(400).send({ error: 'walletAddress is required' });
    }

    // Validate wallet address format
    try {
      new PublicKey(walletAddress);
    } catch {
      return reply.status(400).send({ error: 'Invalid wallet address format' });
    }

    const user = request.user;

    writeAuditLog({
      userId: user.userId,
      action: AuditAction.WALLET_CONNECTED,
      metadata: { walletAddress, label, secondary: true },
      ipAddress: request.ip,
    });

    return reply.send({
      wallet: {
        publicKey: walletAddress,
        userId: user.userId,
        isDefault: false,
        label: label || null,
      },
    });
  });
}
