import { defineChain } from 'viem';
import type { GatewayChain, GatewayChainKey } from './types';

export const GATEWAY_WALLET_ADDRESS = '0x0077777d7EBA4688BDeF3E311b846F25870A19B9';
export const GATEWAY_MINTER_ADDRESS = '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B';

export const SUPPORTED_CHAINS = {
  'ETH-SEPOLIA': {
    domain: 0,
    chainId: 11155111,
    name: 'Ethereum Sepolia',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
  'BASE-SEPOLIA': {
    domain: 6,
    chainId: 84532,
    name: 'Base Sepolia',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  'ARC-TESTNET': {
    domain: 26,
    chainId: 5042002,
    name: 'Arc Testnet',
    usdc: '0x3600000000000000000000000000000000000000',
  },
} as const;

export const GATEWAY_WALLET_ABI = [
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export const GATEWAY_MINTER_ABI = [
  {
    inputs: [
      { name: 'attestation', type: 'bytes' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'gatewayMint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export const ERC20_APPROVAL_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export const fallbackGatewayChains: GatewayChain[] = [
  {
    key: 'ETH-SEPOLIA',
    chainId: SUPPORTED_CHAINS['ETH-SEPOLIA'].chainId,
    domain: SUPPORTED_CHAINS['ETH-SEPOLIA'].domain,
    chainName: SUPPORTED_CHAINS['ETH-SEPOLIA'].name,
    networkName: 'Ethereum',
    rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    blockExplorerUrl: 'https://sepolia.etherscan.io',
    isPrimarySettlement: false,
    walletContractAddress: GATEWAY_WALLET_ADDRESS,
    minterContractAddress: GATEWAY_MINTER_ADDRESS,
    usdcAddress: SUPPORTED_CHAINS['ETH-SEPOLIA'].usdc,
    usdcDecimals: 6,
    gatewayAvailable: true,
    circleChainCode: 'ETH-SEPOLIA',
  },
  {
    key: 'BASE-SEPOLIA',
    chainId: SUPPORTED_CHAINS['BASE-SEPOLIA'].chainId,
    domain: SUPPORTED_CHAINS['BASE-SEPOLIA'].domain,
    chainName: SUPPORTED_CHAINS['BASE-SEPOLIA'].name,
    networkName: 'Base',
    rpcUrl: 'https://sepolia.base.org',
    blockExplorerUrl: 'https://sepolia.basescan.org',
    isPrimarySettlement: false,
    walletContractAddress: GATEWAY_WALLET_ADDRESS,
    minterContractAddress: GATEWAY_MINTER_ADDRESS,
    usdcAddress: SUPPORTED_CHAINS['BASE-SEPOLIA'].usdc,
    usdcDecimals: 6,
    gatewayAvailable: true,
    circleChainCode: 'BASE-SEPOLIA',
  },
  {
    key: 'ARC-TESTNET',
    chainId: SUPPORTED_CHAINS['ARC-TESTNET'].chainId,
    domain: SUPPORTED_CHAINS['ARC-TESTNET'].domain,
    chainName: SUPPORTED_CHAINS['ARC-TESTNET'].name,
    networkName: 'Arc',
    rpcUrl: 'https://arc-testnet.g.alchemy.com/v2/Gkx-iZaHDN3Didmlr1ep3',
    blockExplorerUrl: 'https://explorer.arc.network',
    isPrimarySettlement: true,
    walletContractAddress: GATEWAY_WALLET_ADDRESS,
    minterContractAddress: GATEWAY_MINTER_ADDRESS,
    usdcAddress: SUPPORTED_CHAINS['ARC-TESTNET'].usdc,
    usdcDecimals: 6,
    gatewayAvailable: true,
    circleChainCode: 'ARC-TESTNET',
  },
];

export function getFallbackGatewayChain(key: GatewayChainKey): GatewayChain {
  return fallbackGatewayChains.find((chain) => chain.key === key) ?? fallbackGatewayChains[0];
}

export function createGatewayWagmiChain(chain: GatewayChain) {
  return defineChain({
    id: chain.chainId,
    name: chain.chainName,
      nativeCurrency: {
        name: chain.key === 'ARC-TESTNET' ? 'USD Coin' : 'Testnet Ether',
        symbol: chain.key === 'ARC-TESTNET' ? 'USDC' : 'ETH',
        decimals: chain.key === 'ARC-TESTNET' ? 6 : 18,
      },
    rpcUrls: {
      default: {
        http: [chain.rpcUrl],
      },
      public: {
        http: [chain.rpcUrl],
      },
    },
    blockExplorers: {
      default: {
        name: `${chain.networkName} Explorer`,
        url: chain.blockExplorerUrl,
      },
    },
    testnet: true,
  });
}

export function formatGatewayStatus(status: string): string {
  if (status === 'attestation_requested') return 'Attestation requested';
  if (status === 'mint_submitted') return 'Mint submitted';
  if (status === 'mint_forwarded') return 'Mint forwarded';
  if (status === 'deposit_submitted') return 'Deposit submitted';
  if (status === 'deposit_finalized') return 'Deposit finalized';
  return status.charAt(0).toUpperCase() + status.slice(1);
}
