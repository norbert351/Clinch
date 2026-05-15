'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DynamicContextProvider, getAuthToken } from '@dynamic-labs/sdk-react-core';
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { useState, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { evmNetworks, wagmiConfig } from '@/lib/wagmi-config';
import { WalletProvider } from '@/components/wallet-context';
import { exchangeDynamicToken, setToken, clearToken } from '@/lib/api';
import { Toaster } from 'react-hot-toast';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const envId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;

  // During build/prerendering the env var may not be set.
  // Dynamic requires it at runtime; provide a fallback so the build passes.
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {envId ? (
          <DynamicContextProvider
            settings={{
              environmentId: envId,
              walletConnectors: [EthereumWalletConnectors],
              overrides: { evmNetworks },
              initialAuthenticationMode: 'connect-and-sign',
              appName: 'Clinch',
              siweStatement: 'Sign in with Ethereum to Clinch',
              events: {
                onAuthSuccess: async ({ primaryWallet }) => {
                  const dynamicToken = getAuthToken();
                  if (!dynamicToken || !primaryWallet?.address) return;
                  try {
                    const { token } = await exchangeDynamicToken(
                      dynamicToken,
                      primaryWallet.address,
                    );
                    setToken(token);
                  } catch (err) {
                    console.error('[Dynamic] Token exchange failed:', err);
                  }
                },
                onLogout: () => {
                  clearToken();
                },
              },
            }}
          >
            <DynamicWagmiConnector>
              <WalletProvider>
                {children}
                <Toaster
                  position="bottom-right"
                  toastOptions={{
                    style: {
                      background: '#1a1d26',
                      color: '#e4e7ec',
                      border: '1px solid #2a2e3a',
                    },
                  }}
                />
              </WalletProvider>
            </DynamicWagmiConnector>
          </DynamicContextProvider>
        ) : (
          <WalletProvider>
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: '#1a1d26',
                  color: '#e4e7ec',
                  border: '1px solid #2a2e3a',
                },
              }}
            />
          </WalletProvider>
        )}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
