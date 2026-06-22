import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; walletAddress: string };
    user: { userId: string; walletAddress: string };
  }
}

async function authPluginFn(app: FastifyInstance): Promise<void> {
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });
}

export const authPlugin = fp(authPluginFn, {
  name: 'auth-plugin',
  dependencies: ['@fastify/jwt'],
});

/**
 * Verify an Ed25519 signature from a Solana wallet.
 * The message is the nonce string encoded as UTF-8.
 */
export function verifyEd25519Signature(
  publicKeyBase58: string,
  signature: string,
  message: string
): boolean {
  try {
    const publicKeyBytes = bs58.decode(publicKeyBase58);
    const signatureBytes = bs58.decode(signature);
    const messageBytes = new TextEncoder().encode(message);

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

/**
 * Generate a random nonce for wallet authentication.
 */
export function generateNonce(): string {
  const randomBytes = nacl.randomBytes(32);
  return bs58.encode(randomBytes);
}
