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

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
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
  createdAt: string;
  ruledAt?: string;
}

export interface WalletState {
  isConnected: boolean;
  address?: string;
  chainId?: number;
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
