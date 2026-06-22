import type { AuditLog } from '@copy-trading/shared-types';

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

// In-memory audit log store (replace with database persistence in production)
const auditLogs: AuditEntry[] = [];

export function writeAuditLog(entry: AuditEntry): void {
  auditLogs.push({
    ...entry,
  });
}

export function getAuditLogs(userId?: string): AuditEntry[] {
  if (userId) {
    return auditLogs.filter((log) => log.userId === userId);
  }
  return [...auditLogs];
}

export function clearAuditLogs(): void {
  auditLogs.length = 0;
}
