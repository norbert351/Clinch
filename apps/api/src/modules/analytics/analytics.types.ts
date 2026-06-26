export const ANALYTICS_EVENT_TYPES = [
  'USER_CONNECTED',
  'DEAL_CREATED',
  'DEPOSIT_COMPLETED',
  'DEAL_ACTIVATED',
  'DISPUTE_OPENED',
  'DEAL_RESOLVED',
  'MESSAGE_SENT',
  'AI_ANALYSIS_GENERATED',
  'USER_RETURNED',
  'INVITE_ACCEPTED',
  'GATEWAY_DEPOSIT_FINALIZED',
  'GATEWAY_TRANSFER_COMPLETED',
] as const;

export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export interface AnalyticsEventInput {
  type: AnalyticsEventType;
  wallet?: string | null;
  dealId?: number | null;
  amount?: number | string | null;
  metadata?: Record<string, unknown> | null;
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
  type: AnalyticsEventType | string;
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
