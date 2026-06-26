'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { AppKit } from '@circle-fin/app-kit';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import { ArcTestnet, BaseSepolia, EthereumSepolia } from '@circle-fin/app-kit/chains';
import type { EIP1193Provider } from 'viem';
import { createPublicClient, http, erc20Abi } from 'viem';
import { defineChain } from 'viem';
import { baseSepolia, sepolia } from 'viem/chains';
import type {
  GetBalancesResult,
  SpendResult,
  DepositResult,
} from '@circle-fin/app-kit';

let appKitSingleton: AppKit | null = null;

function getAppKit(): AppKit {
  if (!appKitSingleton) {
    appKitSingleton = new AppKit({ disableErrorReporting: true });
  }
  return appKitSingleton;
}

const arcTestnetRpc = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
  rpcUrls: {
    default: { http: ['https://arc-testnet.g.alchemy.com/v2/Gkx-iZaHDN3Didmlr1ep3'] },
    public: { http: ['https://arc-testnet.g.alchemy.com/v2/Gkx-iZaHDN3Didmlr1ep3'] },
  },
  testnet: true,
});

const USDC_ADDRESSES: Record<number, `0x${string}`> = {
  5042002: '0x3600000000000000000000000000000000000000',
  84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
};

function getClient(chainId: number) {
  const configs: Record<number, { chain: any; url: string }> = {
    5042002: { chain: arcTestnetRpc, url: 'https://arc-testnet.g.alchemy.com/v2/Gkx-iZaHDN3Didmlr1ep3' },
    84532: { chain: baseSepolia, url: 'https://sepolia.base.org' },
    11155111: { chain: sepolia, url: 'https://rpc.sepolia.org' },
  };
  const config = configs[chainId];
  if (!config) return null;
  return createPublicClient({
    chain: config.chain,
    transport: http(config.url, {
      timeout: 10_000,
      retryCount: 2,
      retryDelay: 1000,
    }),
  });
}

const CHAIN_CONFIG = [
  { chainId: 5042002, key: 'ARC-TESTNET', chainName: 'Arc Testnet', isPrimarySettlement: true },
  { chainId: 84532, key: 'BASE-SEPOLIA', chainName: 'Base Sepolia', isPrimarySettlement: false },
  { chainId: 11155111, key: 'ETH-SEPOLIA', chainName: 'Ethereum Sepolia', isPrimarySettlement: false },
];

export interface UnifiedChainInfo {
  key: string;
  chainName: string;
  balance: number | null;
  isPrimarySettlement: boolean;
}

export interface UnifiedBalanceData {
  totalBalance: number | null;
  chains: UnifiedChainInfo[];
  raw: GetBalancesResult | null;
}

async function fetchUSDCBalance(
  address: `0x${string}`,
  chainId: number,
): Promise<number> {
  const client = getClient(chainId);
  const usdcAddress = USDC_ADDRESSES[chainId];

  if (!client || !usdcAddress) {
    console.warn('[Balance] No client or USDC address for chainId:', chainId);
    return 0;
  }

  try {
    let decimals = 6;
    try {
      const contractDecimals = await client.readContract({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: 'decimals',
        args: [],
      });
      decimals = Number(contractDecimals);
    } catch (decErr) {
      console.warn(
        `[Balance] Could not read decimals for chain ${chainId}, using 6:`,
        decErr,
      );
    }

    const rawBalance = await client.readContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    });

    console.log(
      `[Balance] Chain ${chainId} raw: ${rawBalance.toString()}, decimals: ${decimals}`,
    );

    return Number(rawBalance) / Math.pow(10, decimals);
  } catch (err: any) {
    console.error(
      `[Balance] Failed to fetch USDC balance on chain ${chainId}:`,
      err?.message || err,
    );
    return 0;
  }
}

export function useUnifiedBalance(enabled: boolean, _address?: string) {
  const { address: wagmiAddress, isConnected, connector } = useAccount();
  const address = _address || wagmiAddress;
  const adapterCache = useRef<ReturnType<typeof createViemAdapterFromProvider> | null>(null);

  useEffect(() => {
    adapterCache.current = null;
  }, [connector]);

  const getAdapter = useCallback(async () => {
    if (!connector || !isConnected) throw new Error('Wallet not connected');
    if (!adapterCache.current) {
      const provider = await connector.getProvider() as EIP1193Provider;
      adapterCache.current = createViemAdapterFromProvider({
        provider,
        capabilities: {
          addressContext: 'user-controlled',
          supportedChains: [ArcTestnet, BaseSepolia, EthereumSepolia],
        },
      });
    }
    return adapterCache.current;
  }, [connector, isConnected]);

  const query = useQuery({
    queryKey: ['unified-balance', address],
    queryFn: async () => {
      if (!address) {
        return {
          totalBalance: null,
          chains: CHAIN_CONFIG.map(c => ({ ...c, balance: null })),
          raw: null,
        };
      }

      const addr = address as `0x${string}`;

      const results = await Promise.allSettled(
        CHAIN_CONFIG.map(c => fetchUSDCBalance(addr, c.chainId)),
      );

      const chains: UnifiedChainInfo[] = CHAIN_CONFIG.map((config, i) => {
        const result = results[i];
        const balance = result.status === 'fulfilled' ? result.value : null;

        if (result.status === 'rejected') {
          console.error(
            `[Balance] Chain ${config.chainName} failed:`,
            (results[i] as PromiseRejectedResult).reason,
          );
        }

        return {
          key: config.key,
          chainName: config.chainName,
          balance,
          isPrimarySettlement: config.isPrimarySettlement,
        };
      });

      const totalBalance = chains.reduce(
        (sum, c) => sum + (c.balance ?? 0),
        0,
      );

      return {
        totalBalance,
        chains,
        raw: null as GetBalancesResult | null,
      };
    },
    enabled: enabled && !!address,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: 2000,
  });

  const deposit = useCallback(
    async (sourceChain: 'Base_Sepolia' | 'Ethereum_Sepolia', amount: string): Promise<DepositResult> => {
      const kit = getAppKit();
      const adapter = await getAdapter();
      return kit.unifiedBalance.deposit({
        from: { adapter, chain: sourceChain },
        amount,
        token: 'USDC',
        allowanceStrategy: 'approve',
      });
    },
    [getAdapter],
  );

  const spend = useCallback(
    async (
      sourceChain: 'Base_Sepolia' | 'Ethereum_Sepolia',
      amount: string,
      recipientAddress?: string,
    ): Promise<SpendResult> => {
      const kit = getAppKit();
      const adapter = await getAdapter();
      return kit.unifiedBalance.spend({
        from: {
          adapter,
          allocations: [{ amount, chain: sourceChain }],
        },
        to: {
          adapter,
          chain: 'Arc_Testnet',
          ...(recipientAddress ? { recipientAddress } : {}),
        },
        amount,
        token: 'USDC',
      });
    },
    [getAdapter],
  );

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    getAdapter,
    deposit,
    spend,
  };
}
