import { defineChain } from 'viem';
import { createConfig, http } from 'wagmi';
import { SUPPORTED_CHAINS } from './gateway';

const ARC_RPC_URLS = [
  'https://arc-testnet.g.alchemy.com/v2/Gkx-iZaHDN3Didmlr1ep3',
];

export const arcTestnet = defineChain({
  id: SUPPORTED_CHAINS['ARC-TESTNET'].chainId,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: ARC_RPC_URLS,
    },
    public: {
      http: ARC_RPC_URLS,
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

export const baseSepolia = defineChain({
  id: SUPPORTED_CHAINS['BASE-SEPOLIA'].chainId,
  name: 'Base Sepolia',
  nativeCurrency: {
    name: 'Sepolia Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://sepolia.base.org'],
    },
    public: {
      http: ['https://sepolia.base.org'],
    },
  },
  testnet: true,
  blockExplorers: {
    default: {
      name: 'BaseScan',
      url: 'https://sepolia.basescan.org',
    },
  },
});

export const ethereumSepolia = defineChain({
  id: SUPPORTED_CHAINS['ETH-SEPOLIA'].chainId,
  name: 'Ethereum Sepolia',
  nativeCurrency: {
    name: 'Sepolia Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://ethereum-sepolia-rpc.publicnode.com'],
    },
    public: {
      http: ['https://ethereum-sepolia-rpc.publicnode.com'],
    },
  },
  testnet: true,
  blockExplorers: {
    default: {
      name: 'Etherscan',
      url: 'https://sepolia.etherscan.io',
    },
  },
});

export const ARC_CHAIN_ID = arcTestnet.id;
export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;
export const USDC_ADDRESS = SUPPORTED_CHAINS['ARC-TESTNET'].usdc as `0x${string}`;

export const wagmiConfig = createConfig({
  chains: [arcTestnet, baseSepolia, ethereumSepolia],
  transports: {
    [arcTestnet.id]: http(),
    [baseSepolia.id]: http(),
    [ethereumSepolia.id]: http(),
  },
});

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
    privateCustomerRpcUrls: ['https://arc-testnet.g.alchemy.com/v2/Gkx-iZaHDN3Didmlr1ep3'],
    rpcUrls: ['https://arc-testnet.g.alchemy.com/v2/Gkx-iZaHDN3Didmlr1ep3'],
    vanityName: 'Arc Testnet',
  },
  {
    blockExplorerUrls: ['https://sepolia.basescan.org'],
    chainId: baseSepolia.id,
    name: 'Base Sepolia',
    iconUrls: [],
    nativeCurrency: {
      decimals: 18,
      name: 'Sepolia Ether',
      symbol: 'ETH',
    },
    networkId: baseSepolia.id,
    privateCustomerRpcUrls: ['https://sepolia.base.org'],
    rpcUrls: ['https://sepolia.base.org'],
    vanityName: 'Base Sepolia',
  },
  {
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
    chainId: ethereumSepolia.id,
    name: 'Ethereum Sepolia',
    iconUrls: [],
    nativeCurrency: {
      decimals: 18,
      name: 'Sepolia Ether',
      symbol: 'ETH',
    },
    networkId: ethereumSepolia.id,
    privateCustomerRpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
    rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
    vanityName: 'Ethereum Sepolia',
  },
];
