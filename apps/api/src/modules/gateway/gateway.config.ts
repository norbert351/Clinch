import { config } from '../../config/env';
import type { GatewayChainConfig, GatewayChainKey } from './gateway.types';

export const GATEWAY_API_URL = 'https://gateway-api-testnet.circle.com';
export const CIRCLE_API_URL = 'https://api.circle.com';
export const GATEWAY_WALLET_ADDRESS =
  (process.env.GATEWAY_WALLET_ADDRESS || '0x0077777d7EBA4688BDeF3E311b846F25870A19B9') as `0x${string}`;
export const GATEWAY_MINTER_ADDRESS =
  (process.env.GATEWAY_MINTER_ADDRESS || '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B') as `0x${string}`;
export const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY || '';
export const CIRCLE_ENTITY_SECRET = config.circle.entitySecret;
export const CIRCLE_WALLET_SET_ID = config.circle.walletSetId;
export const CIRCLE_DEVELOPER_WALLET_ID = config.circle.developerWalletId;
export const CIRCLE_ENVIRONMENT = config.circle.environment;

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

export const supportedGatewayChains: GatewayChainConfig[] = [
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
    rpcUrl: 'https://rpc.testnet.arc.network',
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

export const primaryGatewayChain = supportedGatewayChains.find((chain) => chain.key === 'ARC-TESTNET')!;

export function getGatewayChainByKey(key: GatewayChainKey): GatewayChainConfig | undefined {
  return supportedGatewayChains.find((chain) => chain.key === key);
}

export function getGatewayChainById(chainId: number): GatewayChainConfig | undefined {
  return supportedGatewayChains.find((chain) => chain.chainId === chainId);
}

export function getGatewayChainByDomain(domain: number): GatewayChainConfig | undefined {
  return supportedGatewayChains.find((chain) => chain.domain === domain);
}

export function getGatewayChainByCode(code: string): GatewayChainConfig | undefined {
  return supportedGatewayChains.find((chain) => chain.circleChainCode === code);
}
