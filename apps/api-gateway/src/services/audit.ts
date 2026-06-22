import { prisma } from '@copy-trading/database';

export enum AuditAction {
  WALLET_CONNECTED = 'wallet.connected',
  COPY_SUBSCRIBED = 'copy.subscribed',
  COPY_SETTINGS_UPDATED = 'copy.settings_updated',
  COPY_UNSUBSCRIBED = 'copy.unsubscribed',
  VAULT_CREATED = 'vault.created',
  VAULT_DEPOSIT = 'vault.deposit',
  VAULT_WITHDRAWAL = 'vault.withdrawal',
  VAULT_PAUSED = 'vault.paused',
}

export interface AuditEntry {
  userId: string;
  action: AuditAction;
  metadata: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Write an audit log entry to the database.
 * This is fire-and-forget to avoid slowing down request handling.
 */
export function writeAuditLog(entry: AuditEntry): void {
  // Fire and forget - don't await to avoid blocking the request
  prisma.auditLog
    .create({
      data: {
        userId: entry.userId,
        action: entry.action,
        metadata: entry.metadata as object,
        ipAddress: entry.ipAddress || null,
      },
    })
    .catch((err) => {
      console.error('[audit] Failed to write audit log:', err);
    });
}

/**
 * Retrieve audit logs, optionally filtered by userId.
 */
export async function getAuditLogs(userId?: string) {
  const where = userId ? { userId } : {};
  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}
