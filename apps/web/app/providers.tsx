'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '@/lib/wagmi-config';
import { WalletProviderFallback } from '@/components/wallet-context';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from 'react-hot-toast';

type DynamicWalletProvidersComponent = ComponentType<{
  children: ReactNode;
  environmentId: string;
}>;

function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: '#121826',
          color: '#e4e7ec',
          border: '1px solid #243043',
        },
      }}
    />
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [DynamicWalletProviders, setDynamicWalletProviders] =
    useState<DynamicWalletProvidersComponent | null>(null);
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

  useEffect(() => {
    let active = true;
    setMounted(true);

    if (envId) {
      import('./dynamic-wallet-providers')
        .then((module) => {
          if (active) {
            setDynamicWalletProviders(() => module.DynamicWalletProviders);
          }
        })
        .catch((err) => {
          console.error('[Dynamic] Failed to load wallet providers:', err);
        });
    }

    return () => {
      active = false;
    };
  }, [envId]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          storageKey="clinch-theme"
        >
          {envId && mounted && DynamicWalletProviders ? (
            <DynamicWalletProviders environmentId={envId}>
              {children}
            </DynamicWalletProviders>
          ) : (
            <WalletProviderFallback>
              {children}
            </WalletProviderFallback>
          )}
          <AppToaster />
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
