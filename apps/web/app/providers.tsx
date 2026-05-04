'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { useState, type ReactNode } from 'react';
import { config } from '@/lib/wagmi-config';
import { WalletProvider } from '@/components/wallet-context';
import { Toaster } from 'react-hot-toast';
import '@rainbow-me/rainbowkit/styles.css';

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

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({
          accentColor: '#4f6ef7',
          accentColorForeground: 'white',
          borderRadius: 'medium',
          fontStack: 'system',
        })}>
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
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
