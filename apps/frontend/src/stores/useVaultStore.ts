import { create } from 'zustand';
import {
  vaultApi,
  type VaultResponse,
  type VaultTransactionResponse,
  type CreateVaultRequest,
  type UpdateRiskParamsRequest,
} from '@/lib/api';

export interface VaultMetadata {
  id: string;
  name: string;
  isFavorite: boolean;
  isArchived: boolean;
}

interface VaultState {
  vault: VaultResponse | null;
  transactions: VaultTransactionResponse[];
  isLoading: boolean;
  error: string | null;
  selectedVaultId: string | null;
  vaultMetadata: VaultMetadata[];

  fetchVault: (token: string) => Promise<void>;
  createVault: (token: string, data: CreateVaultRequest) => Promise<void>;
  deposit: (token: string, amount: number, signature: string) => Promise<void>;
  withdraw: (token: string, amount: number, signature: string) => Promise<void>;
  updateRiskParams: (token: string, data: UpdateRiskParamsRequest) => Promise<void>;
  pause: (token: string) => Promise<void>;
  resume: (token: string) => Promise<void>;
  fetchTransactions: (token: string) => Promise<void>;
  selectVault: (vaultId: string | null) => void;
  updateVaultMetadata: (vaultId: string, updates: Partial<Omit<VaultMetadata, 'id'>>) => void;
}

function loadMetadata(): VaultMetadata[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem('vault-metadata');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveMetadata(metadata: VaultMetadata[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('vault-metadata', JSON.stringify(metadata));
  } catch {
    // Silently fail
  }
}

export const useVaultStore = create<VaultState>((set, get) => ({
  vault: null,
  transactions: [],
  isLoading: false,
  error: null,
  selectedVaultId: null,
  vaultMetadata: loadMetadata(),

  fetchVault: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const vault = await vaultApi.get(token);
      // Ensure metadata exists for this vault
      const metadata = get().vaultMetadata;
      if (vault && !metadata.find((m) => m.id === vault.id)) {
        const updated = [...metadata, { id: vault.id, name: 'My Wallet', isFavorite: false, isArchived: false }];
        saveMetadata(updated);
        set({ vault, isLoading: false, vaultMetadata: updated });
      } else {
        set({ vault, isLoading: false });
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch vault', isLoading: false });
    }
  },

  createVault: async (token, data) => {
    set({ isLoading: true, error: null });
    try {
      const vault = await vaultApi.create(token, data);
      const metadata = get().vaultMetadata;
      const updated = [...metadata, { id: vault.id, name: 'My Wallet', isFavorite: false, isArchived: false }];
      saveMetadata(updated);
      set({ vault, isLoading: false, vaultMetadata: updated });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create vault', isLoading: false });
    }
  },

  deposit: async (token, amount, signature) => {
    set({ isLoading: true, error: null });
    try {
      const vault = await vaultApi.deposit(token, { amount, signature });
      set({ vault, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Deposit failed', isLoading: false });
    }
  },

  withdraw: async (token, amount, signature) => {
    set({ isLoading: true, error: null });
    try {
      const vault = await vaultApi.withdraw(token, { amount, signature });
      set({ vault, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Withdrawal failed', isLoading: false });
    }
  },

  updateRiskParams: async (token, data) => {
    set({ isLoading: true, error: null });
    try {
      const vault = await vaultApi.updateRiskParams(token, data);
      set({ vault, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Update failed', isLoading: false });
    }
  },

  pause: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const vault = await vaultApi.pause(token);
      set({ vault, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Pause failed', isLoading: false });
    }
  },

  resume: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const vault = await vaultApi.resume(token);
      set({ vault, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Resume failed', isLoading: false });
    }
  },

  fetchTransactions: async (token) => {
    try {
      const { transactions } = await vaultApi.getTransactions(token);
      set({ transactions });
    } catch {
      // Silently fail for tx history
    }
  },

  selectVault: (vaultId) => {
    set({ selectedVaultId: vaultId });
  },

  updateVaultMetadata: (vaultId, updates) => {
    const metadata = get().vaultMetadata;
    const index = metadata.findIndex((m) => m.id === vaultId);
    if (index === -1) return;
    const updated = [...metadata];
    updated[index] = { ...updated[index], ...updates };
    saveMetadata(updated);
    set({ vaultMetadata: updated });
  },
}));
