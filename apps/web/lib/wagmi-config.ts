import { defineChain } from 'viem';
import { createConfig, http } from 'wagmi';

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

export const ARC_CHAIN_ID = arcTestnet.id;
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000') as `0x${string}`;
export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x0000000000000000000000000000000000000') as `0x${string}`;

// Static wagmi config used as fallback during prerendering/SSR.
// At runtime, DynamicWagmiConnector overrides this with its own config.
export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(),
  },
});

// Networks configuration for Dynamic.xyz
export const evmNetworks = [
  {
    blockExplorerUrls: ['https://explorer.arc.network'],
    chainId: ARC_CHAIN_ID,
    name: 'Arc Network Testnet',
    iconUrls: [],
    nativeCurrency: {
      decimals: 6,
      name: 'USD Coin',
      symbol: 'USDC',
    },
    networkId: ARC_CHAIN_ID,
    privateCustomerRpcUrls: ['https://rpc.testnet.arc.network'],
    rpcUrls: ['https://rpc.testnet.arc.network'],
    vanityName: 'Arc Testnet',
  },
];
