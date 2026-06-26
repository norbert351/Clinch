export type DBDealStatus =
  | 'Active'
  | 'Disputed'
  | 'Resolved'
  | 'Cancelled'
  | 'Expired';

export type DealStatus =
  | 'Active'
  | 'Pending'
  | 'Confirmed'
  | 'Disputed'
  | 'Resolved'
  | 'Cancelled'
  | 'Expired';

export type DealStatusDisplay =
  | 'active'
  | 'pending'
  | 'disputed'
  | 'resolved'
  | 'cancelled'
  | 'expired';

export type DealType = 'MutualStake' | 'OneSided';
export type OutcomeVote = 'None' | 'PartyAWins' | 'PartyBWins' | 'Split';
export type DisputeRecommendedOutcome = Exclude<OutcomeVote, 'None'>;

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PublicMetrics {
  totalDeals: number;
  activeDeals: number;
  disputedDeals: number;
  resolvedDeals: number;
  totalEscrowedUSDC: number;
  avgSettlementTime: number | null;
  recentSettlementCount: number;
  recentSettlementWindowDays: number;
}

export interface PublicActivityItem {
  onChainId: number;
  agreementLabel: string;
  status: string;
  settlementState: string;
  amountUSDC: number;
  depositedUSDC: number;
  dealType: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicActivityResponse {
  items: PublicActivityItem[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface User {
  id: string;
  walletAddress: string;
  email?: string;
  displayName?: string;
  emailNotifications?: boolean;
  createdAt: string;
}

export interface Deal {
  id: string;
  onChainId: number;
  partyA: string;
  partyB: string;
  dealType: DealType;
  status: DealStatus;
  amountA: string;
  amountB: string;
  arbitratorWallet?: string;
  title?: string;
  description?: string;
  aiAnalysis?: string | null;
  aiRecommendedOutcome?: string | null;
  aiConfidence?: string | null;
  aiCreatorScore?: number | null;
  aiCounterpartyScore?: number | null;
  aiSettlementSummary?: string | null;
  aiDisputeSummary?: string | null;
  aiSummaryGeneratedAt?: string | null;
  aiSummaryStatus?: 'Pending' | 'Generated' | 'Failed' | null;
  inviteToken?: string;
  feePercent: string;
  expiryTimestamp: string;
  createdAt: string;
  updatedAt: string;
  creator: {
    address: string;
    depositAmount: number;
    hasDeposited: boolean;
    hasVoted: boolean;
    vote?: OutcomeVote;
  };
  counterparty: {
    address: string;
    depositAmount: number;
    hasDeposited: boolean;
    hasVoted: boolean;
    vote?: OutcomeVote;
  };
  arbitrator?: string;
  platformFee: number;
  expiresAt: Date;
  type: 'mutual' | 'one-sided';
  partyADeposited?: boolean;
  partyBDeposited?: boolean;
}

export type MessageSenderRole =
  | 'creator'
  | 'counterparty'
  | 'client'
  | 'worker'
  | 'arbitrator'
  | 'system';

export type MessageDeliveryStatus = 'sending' | 'sent' | 'failed';

export interface Message {
  id: string;
  onChainId: number;
  senderAddress: string;
  senderRole: MessageSenderRole;
  content: string;
  isSystem: boolean;
  editedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  status?: MessageDeliveryStatus;
}

export interface MessagePage {
  items: Message[];
  nextBefore: string | null;
  hasMore: boolean;
}

export interface UnreadCounts {
  [onChainId: number]: number;
}

export type DealWithDeposits = Deal & {
  depositList?: Deposit[];
  partyADeposited?: boolean;
  partyBDeposited?: boolean;
  partyAVoted?: boolean;
  partyBVoted?: boolean;
  partyAVoteOutcome?: string | null;
  partyBVoteOutcome?: string | null;
  voteList?: Vote[];
  computedStatus?: string;
};

export interface Deposit {
  id: string;
  onChainId: number;
  party: string;
  amount: string;
  txHash: string;
  createdAt: string;
}

export interface Vote {
  id: string;
  onChainId: number;
  party: string;
  outcome: OutcomeVote;
  txHash: string;
  createdAt: string;
}

export interface Dispute {
  id: string;
  onChainId: number;
  raisedBy: string;
  reasonText?: string;
  ruling?: OutcomeVote;
  ruledByWallet?: string;
  aiAnalysis?: string | null;
  aiRecommendedOutcome?: string | null;
  aiConfidence?: string | null;
  aiCreatorScore?: number | null;
  aiCounterpartyScore?: number | null;
  createdAt: string;
  ruledAt?: string;
  resolvedAt?: string;
}

export interface DisputeAIAnalysis {
  analysis: string;
  recommendedOutcome: 'PartyAWins' | 'PartyBWins' | 'Split';
  confidence: 'High' | 'Medium' | 'Low';
  creatorScore: number;
  counterpartyScore: number;
  cached: boolean;
  creatorPositionSummary?: string;
  counterpartyPositionSummary?: string;
  reasoning?: string;
  keyConsiderations?: string[];
}

export interface DisputeWithDeal extends Dispute {
  deal?: Deal;
}

export interface WalletState {
  isConnected: boolean;
  address?: string;
  chainId?: number;
  isWalletClientReady?: boolean;
  isWalletClientLoading?: boolean;
}

export interface TimelineEvent {
  id: string;
  type: 'deal_created' | 'deposited' | 'vote_submitted' | 'disputed' | 'resolved' | 'cancelled' | 'expired';
  address?: string;
  amount?: number;
  outcome?: string;
  timestamp: Date;
  description: string;
}

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

export interface GatewayChain {
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

export interface UnifiedBalanceChain extends GatewayChain {
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

export interface GatewayTimelineItem {
  key: 'intent_signed' | 'gateway_attestation' | 'destination_mint' | 'circle_finality';
  label: string;
  status: 'pending' | 'active' | 'complete' | 'failed';
  timestamp?: string;
  detail?: string;
}

export interface GatewayTransfer {
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

export interface UnifiedBalance {
  walletAddress: string;
  token: 'USDC';
  totalBalance: number | null;
  totalBalanceRaw: string | null;
  status: 'available' | 'syncing' | 'unavailable';
  updatedAt: string;
  chains: UnifiedBalanceChain[];
  pendingDeposits: GatewayPendingDeposit[];
  pendingTransfers: GatewayTransfer[];
  recentTransfers: GatewayTransfer[];
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

export interface GatewayDepositIntent {
  transfer: GatewayTransfer;
  deposit: {
    sourceChain: GatewayChain;
    amountRaw: string;
    gatewayWalletAddress: string;
    usdcAddress: string;
  };
}

export interface GatewayTransferIntent {
  transfer: GatewayTransfer;
  typedData: GatewayTypedData;
  burnIntent: GatewayBurnIntent;
  amountRaw: string;
}

export interface GatewayTransferAttestation {
  transfer: GatewayTransfer;
  mint: {
    destinationChain: GatewayChain;
    gatewayMinterAddress: string;
    attestation: string;
    signature: string;
  };
}

export interface UserAnalyticsStats {
  totalDeals: number;
  activeDeals: number;
  pendingDeals: number;
  disputedDeals: number;
  resolvedDeals: number;
  closedDeals: number;
  completedDeals: number;
  totalLockedUSDC: number;
  totalUSDCLocked: number;
  totalEarned: number;
  totalPaid: number;
  totalRefunded: number;
  totalFeesPaid: number;
  personalTransferVolume?: number;
  personalDisputes?: number;
  totalMessages: number;
  unreadMessages: number;
  activeConversations: number;
  completionRate: number;
  disputeRate: number;
  successRate: number;
  dealStatus: {
    total: number;
    active: number;
    pending: number;
    disputed: number;
    resolved: number;
    closed: number;
  };
  financial: {
    totalLockedUSDC: number;
    personalTransferVolume?: number;
    totalEarned: number;
    totalPaid: number;
    totalRefunded: number;
    totalFeesPaid: number;
  };
  engagement: {
    totalMessages: number;
    unreadMessages: number;
    activeConversations: number;
    personalDisputes?: number;
  };
  reputation: {
    completionRate: number;
    disputeRate: number;
    successRate: number;
  };
}

export interface AdminMetricSummary {
  totalUsers: number;
  activeUsers24h: number;
  activeUsers7d: number;
  newUsers24h?: number;
  newUsers7d?: number;
  totalDeals: number;
  activeDeals: number;
  disputedDeals: number;
  resolvedDeals: number;
  closedDeals?: number;
  totalVolume: number;
  totalUnifiedBalanceVolume?: number;
  dailyActiveWallets?: number;
  depositsPerChain?: Record<string, number>;
  transfersPerChain?: Record<string, number>;
  totalDisputes?: number;
  settlementSuccessRate?: number;
  growthRate?: number;
  totalFees: number;
}

export interface AdminChartPoint {
  date: string;
  value?: number;
  count?: number;
  total?: number;
  volume?: number;
  revenue?: number;
  activeUsers?: number;
  returningUsers?: number;
  retentionRate?: number;
}

export interface AdminStatusDistributionPoint {
  status: string;
  count: number;
}

export interface AdminRecentUser {
  id: string;
  walletAddress: string;
  displayName: string | null;
  email: string | null;
  createdAt: string;
  eventCount: number;
}

export interface AdminDealRow {
  id: string;
  onChainId: number;
  partyA: string;
  partyB: string;
  dealType: string;
  status: string;
  amountUSDC: number;
  depositedUSDC: number;
  platformFeeUSDC: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDisputeRow {
  id: string;
  onChainId: number;
  raisedBy: string;
  ruling: string | null;
  dealStatus: string | null;
  amountUSDC: number;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminActiveUserRow {
  walletAddress: string;
  eventCount: number;
  messageCount: number;
  dealCount: number;
  lastSeenAt: string | null;
}

export interface AdminActivityEvent {
  id: string;
  type: string;
  wallet: string | null;
  dealId: number | null;
  amount: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminAnalyticsOverview {
  metrics: AdminMetricSummary;
  charts: {
    userGrowth: AdminChartPoint[];
    dealVolume: AdminChartPoint[];
    revenue: AdminChartPoint[];
    dealStatusDistribution: AdminStatusDistributionPoint[];
    disputeFrequency: AdminChartPoint[];
    retention: AdminChartPoint[];
  };
  tables: {
    recentUsers: AdminRecentUser[];
    recentDeals: AdminDealRow[];
    recentDisputes: AdminDisputeRow[];
    highestValueDeals: AdminDealRow[];
    mostActiveUsers: AdminActiveUserRow[];
  };
  activity: AdminActivityEvent[];
  generatedAt: string;
}
