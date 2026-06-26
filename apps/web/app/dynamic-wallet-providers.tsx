'use client';

import { useMemo, type ReactNode } from 'react';
import {
  DynamicContextProvider,
  getAuthToken,
} from '@dynamic-labs/sdk-react-core';
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import type {
  DynamicContextProps,
  WalletOption,
} from '@dynamic-labs/sdk-react-core';
import { evmNetworks } from '@/lib/wagmi-config';
import { WalletProvider } from '@/components/wallet-context';
import { clearToken, exchangeDynamicToken, getAppUrl, setToken } from '@/lib/api';

const isDev = process.env.NODE_ENV === 'development';

function getRedirectUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return getAppUrl();
}

function withoutEmbeddedWallets(options: WalletOption[]): WalletOption[] {
  return options
    .map((option) => ({
      ...option,
      groupedWallets: option.groupedWallets
        ? withoutEmbeddedWallets(option.groupedWallets)
        : undefined,
    }))
    .filter((option) => {
      const key = option.key.toLowerCase();
      const name = option.name.toLowerCase();
      return !key.includes('embedded') && !name.includes('embedded');
    });
}

function resetPendingAuth(): void {
  clearToken();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('clinch:auth-reset'));
  }
}

export function DynamicWalletProviders({
  children,
  environmentId,
}: {
  children: ReactNode;
  environmentId: string;
}) {
  const settings = useMemo<DynamicContextProps['settings']>(
    () => ({
      environmentId,
      walletConnectors: [EthereumWalletConnectors],
      overrides: { evmNetworks },
      initialAuthenticationMode: isDev ? 'connect-only' : 'connect-and-sign',
      appName: 'Clinch',
      displaySiweStatement: !isDev,
      redirectUrl: getRedirectUrl(),
      ...(isDev
        ? {
            deviceRegistrationModal: { enabled: false },
            enableVisitTrackingOnConnectOnly: false,
            walletsFilter: withoutEmbeddedWallets,
          }
        : {
            siweStatement: 'Sign in with Ethereum to Clinch',
          }),
      events: {
        onAuthFlowCancel: () => {
          resetPendingAuth();
        },
        onAuthFailure: () => {
          resetPendingAuth();
        },
        onAuthSuccess: async ({ primaryWallet }) => {
          if (isDev) return;

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
          resetPendingAuth();
        },
      },
    }),
    [environmentId],
  );

  return (
    <DynamicContextProvider settings={settings}>
      <DynamicWagmiConnector>
        <WalletProvider>{children}</WalletProvider>
      </DynamicWagmiConnector>
    </DynamicContextProvider>
  );
}
