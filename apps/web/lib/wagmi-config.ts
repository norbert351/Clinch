import { createConfig, http, createStorage } from 'wagmi';
import { mainnet, arbitrum, base, polygon } from 'wagmi/chains';
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  walletConnectWallet,
  coinbaseWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { defineChain } from 'viem';

const RPC_URLS = [
  'https://rpc.testnet.arc.network',
  'https://rpc.drpc.testnet.arc.network',
  'https://rpc.blockdaemon.testnet.arc.network',
];

export const arcTestnet = defineChain({
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: RPC_URLS,
    },
    public: {
      http: RPC_URLS,
    },
  },
  testnet: true,
  blockExplorers: {
    default: {
      name: 'Arc Explorer',
      url: 'https://explorer.arc.network',
    },
  },
});

if (!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID === 'your_walletconnect_project_id') {
  console.warn(
    'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set or is using placeholder value. ' +
    'WalletConnect will not work. ' +
    'Get a free project ID at https://cloud.walletconnect.com'
  );
}

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [metaMaskWallet, walletConnectWallet, coinbaseWallet],
    },
  ],
  {
    appName: 'Clinch',
    projectId: projectId,
  }
);

export const config = createConfig({
  chains: [arcTestnet, mainnet, arbitrum, base, polygon],
  connectors,
  transports: {
    [arcTestnet.id]: http('https://rpc.testnet.arc.network'),
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
    [polygon.id]: http(),
  },
  storage: createStorage({
    storage: typeof window !== 'undefined'
      ? window.localStorage
      : undefined,
  }),
});

export const ARC_CHAIN_ID = arcTestnet.id;
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000') as `0x${string}`;
export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x0000000000000000000000000000000000000') as `0x${string}`;
