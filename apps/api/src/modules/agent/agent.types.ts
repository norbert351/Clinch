export interface AgentWalletConfig {
  walletId: string;
  walletAddress: string;
  balance: string;
  entitySecret: string;
  walletSetId: string;
}

export interface AgentTransaction {
  id: string;
  type: 'fee_earned' | 'compute_paid' | 'x402_received' | 'x402_paid';
  amount: string;
  token: 'USDC';
  counterparty: string;
  timestamp: string;
  description: string;
  txHash?: string;
}

export interface AgentMetrics {
  disputesResolved: number;
  totalFeesEarned: string;
  totalComputeSpent: string;
  dealsAutonomouslyHandled: number;
  x402Revenue: string;
  uptime: string;
}

export interface AutoDiscoveryResult {
  dealId: number;
  action: 'alert' | 'analyze' | 'notify';
  reason: string;
}
