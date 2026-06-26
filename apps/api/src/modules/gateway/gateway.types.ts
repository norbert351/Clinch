export type GatewayChainKey = 'ETH-SEPOLIA' | 'BASE-SEPOLIA' | 'ARC-TESTNET';

export type GatewayTransferStatus =
  | 'initiated'
  | 'attestation_requested'
  | 'attested'
  | 'mint_submitted'
  | 'mint_forwarded'
  | 'deposit_submitted'
  | 'deposit_finalized'
  | 'completed'
  | 'failed';

export type GatewayTimelineKey =
  | 'intent_signed'
  | 'gateway_attestation'
  | 'destination_mint'
  | 'circle_finality';

export interface GatewayTimelineItem {
  key: GatewayTimelineKey;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'failed';
  timestamp?: string;
  detail?: string;
}

export interface GatewayChainConfig {
  key: GatewayChainKey;
  chainId: number;
  domain: number;
  chainName: string;
  networkName: string;
  rpcUrl: string;
  blockExplorerUrl: string;
  isPrimarySettlement: boolean;
  walletContractAddress: string;
  minterContractAddress: string;
  usdcAddress: string;
  usdcDecimals: number;
  gatewayAvailable: boolean;
  circleChainCode: string;
}

export interface UnifiedBalanceChain extends GatewayChainConfig {
  balance: number | null;
  balanceRaw: string | null;
  syncing: boolean;
  pendingDepositAmount: number | null;
  pendingDepositCount: number;
}

export interface GatewayPendingDeposit {
  domain: number;
  depositor: string;
  amount: string;
  status: string;
  transactionHash: string | null;
  blockHeight?: string | null;
  blockHash?: string | null;
  blockTimestamp?: string | null;
}

export interface UnifiedBalanceResponse {
  walletAddress: string;
  token: 'USDC';
  totalBalance: number | null;
  totalBalanceRaw: string | null;
  status: 'available' | 'syncing' | 'unavailable';
  updatedAt: string;
  chains: UnifiedBalanceChain[];
  pendingDeposits: GatewayPendingDeposit[];
  pendingTransfers: GatewayTransferResponse[];
  recentTransfers: GatewayTransferResponse[];
}

export interface GatewayTransferResponse {
  id: string;
  walletAddress: string;
  sourceChainId: number;
  sourceDomain: number;
  sourceChainName: string;
  destinationChainId: number;
  destinationDomain: number;
  destinationChainName: string;
  amount: string;
  status: GatewayTransferStatus;
  sourceTxHash?: string | null;
  destinationTxHash?: string | null;
  gatewayTransferId?: string | null;
  transferSpecHash?: string | null;
  recipient?: string | null;
  attestation?: string | null;
  attestationSignature?: string | null;
  fees?: {
    total?: string;
    token?: 'USDC';
    perIntent?: Array<{
      transferSpecHash?: string;
      domain?: number;
      baseFee?: string;
      transferFee?: string;
    }>;
    forwardingFee?: string;
  } | null;
  expirationBlock?: string | null;
  timeline: GatewayTimelineItem[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface GatewayBurnIntentSpec {
  version: 1;
  sourceDomain: number;
  destinationDomain: number;
  sourceContract: `0x${string}`;
  destinationContract: `0x${string}`;
  sourceToken: `0x${string}`;
  destinationToken: `0x${string}`;
  sourceDepositor: `0x${string}`;
  destinationRecipient: `0x${string}`;
  sourceSigner: `0x${string}`;
  destinationCaller: `0x${string}`;
  value: string;
  salt: `0x${string}`;
  hookData: `0x${string}`;
}

export interface GatewayBurnIntent {
  maxBlockHeight: string;
  maxFee: string;
  spec: GatewayBurnIntentSpec;
}

export interface GatewayTypedData {
  domain: {
    name: 'GatewayWallet';
    version: '1';
  };
  types: {
    EIP712Domain: Array<{ name: string; type: string }>;
    TransferSpec: Array<{ name: string; type: string }>;
    BurnIntent: Array<{ name: string; type: string }>;
  };
  primaryType: 'BurnIntent';
  message: GatewayBurnIntent;
}
