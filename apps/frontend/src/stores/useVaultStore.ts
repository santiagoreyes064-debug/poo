import { create } from 'zustand';
import {
  vaultApi,
  type VaultResponse,
  type VaultTransactionResponse,
  type CreateVaultRequest,
  type UpdateRiskParamsRequest,
} from '@/lib/api';

interface VaultState {
  vault: VaultResponse | null;
  transactions: VaultTransactionResponse[];
  isLoading: boolean;
  error: string | null;

  fetchVault: (token: string) => Promise<void>;
  createVault: (token: string, data: CreateVaultRequest) => Promise<void>;
  deposit: (token: string, amount: number, signature: string) => Promise<void>;
  withdraw: (token: string, amount: number, signature: string) => Promise<void>;
  updateRiskParams: (token: string, data: UpdateRiskParamsRequest) => Promise<void>;
  pause: (token: string) => Promise<void>;
  resume: (token: string) => Promise<void>;
  fetchTransactions: (token: string) => Promise<void>;
}

export const useVaultStore = create<VaultState>((set) => ({
  vault: null,
  transactions: [],
  isLoading: false,
  error: null,

  fetchVault: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const vault = await vaultApi.get(token);
      set({ vault, isLoading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch vault', isLoading: false });
    }
  },

  createVault: async (token, data) => {
    set({ isLoading: true, error: null });
    try {
      const vault = await vaultApi.create(token, data);
      set({ vault, isLoading: false });
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
}));
