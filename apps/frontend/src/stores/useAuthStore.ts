import { create } from 'zustand';
import { authApi } from '@/lib/api';

interface AuthState {
  token: string | null;
  user: { id: string; walletAddress: string } | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (walletAddress: string, signMessage: (message: Uint8Array) => Promise<Uint8Array>) => Promise<void>;
  logout: () => void;
  setToken: (token: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,

  login: async (walletAddress, signMessage) => {
    set({ isLoading: true });
    try {
      const { nonce } = await authApi.getNonce(walletAddress);
      const message = new TextEncoder().encode(
        `Sign this message to authenticate with SCT.\nNonce: ${nonce}`,
      );
      const signatureBytes = await signMessage(message);
      const signature = Buffer.from(signatureBytes).toString('base64');

      const { token, user } = await authApi.verify(walletAddress, signature, nonce);

      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
      throw new Error('Authentication failed');
    }
  },

  logout: () => {
    set({
      token: null,
      user: null,
      isAuthenticated: false,
    });
  },

  setToken: (token) => {
    set({ token, isAuthenticated: true });
  },
}));
