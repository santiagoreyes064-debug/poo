'use client';

import { useMemo, useEffect, useRef } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import { useAuthStore } from '@/stores/useAuthStore';

import '@solana/wallet-adapter-react-ui/styles.css';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { connected, publicKey, signMessage } = useWallet();
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasAttemptedAuth = useRef(false);

  useEffect(() => {
    if (connected && publicKey && signMessage && !isAuthenticated && !hasAttemptedAuth.current) {
      hasAttemptedAuth.current = true;
      login(publicKey.toBase58(), signMessage).catch((err) => {
        console.error('Auto-authentication failed:', err);
        hasAttemptedAuth.current = false;
      });
    }

    if (!connected) {
      hasAttemptedAuth.current = false;
      if (isAuthenticated) {
        logout();
      }
    }
  }, [connected, publicKey, signMessage, login, logout, isAuthenticated]);

  return <>{children}</>;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl('mainnet-beta'),
    [],
  );

  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AuthGate>{children}</AuthGate>
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
