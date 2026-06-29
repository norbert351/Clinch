import { eq, and, desc, lt, isNull, sql } from 'drizzle-orm';
import { db } from '../../config/db';
import { config } from '../../config/env';
import { deals, disputes } from '../../db/schema';
import type { AgentWalletConfig, AgentMetrics, AgentTransaction, AutoDiscoveryResult } from './agent.types';

const AGENT_WALLET_ADDRESS = '0x35251024a8407e8f5d79b97fe12160578177b559';

interface AgentState {
  wallet: AgentWalletConfig | null;
}

const state: AgentState = {
  wallet: {
    walletId: 'agent-wallet',
    walletAddress: AGENT_WALLET_ADDRESS,
    balance: '0',
    entitySecret: config.circle.entitySecret || '',
    walletSetId: config.circle.walletSetId || '',
  },
};

export async function getOrCreateAgentWallet(): Promise<AgentWalletConfig> {
  return state.wallet || (state.wallet = {
    walletId: 'agent-wallet',
    walletAddress: AGENT_WALLET_ADDRESS,
    balance: '0',
    entitySecret: config.circle.entitySecret || '',
    walletSetId: config.circle.walletSetId || '',
  });
}

function parseUsdc(raw: string | number | bigint | undefined | null): string {
  if (!raw) return '0';
  const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
  return isNaN(n) ? '0' : n.toFixed(2);
}

export async function getAgentWalletBalance(): Promise<string> {
  return '0';
}

export async function getAgentMetrics(): Promise<AgentMetrics> {
  const resolvedCount = await db.select({ count: sql<number>`count(*)::int` }).from(disputes)
    .where(and(eq(disputes.ruling, 'PartyAWins'), eq(disputes.ruledByWallet, 'clinch_agent')))
    .then(r => Number(r[0]?.count || 0));
  const feeDeals = await db.select({ fee: deals.platformFee }).from(deals).where(eq(deals.status, 'Resolved')).limit(100);
  const totalFees = feeDeals.reduce((s, d) => s + (parseFloat(d.fee || '0') || 0), 0);
  const autoHandled = await db.select({ count: sql<number>`count(*)::int` }).from(disputes)
    .where(eq(disputes.ruledByWallet, 'clinch_agent')).then(r => Number(r[0]?.count || 0));
  return {
    disputesResolved: resolvedCount, totalFeesEarned: totalFees.toFixed(2),
    totalComputeSpent: (totalFees * 0.02).toFixed(2), dealsAutonomouslyHandled: autoHandled,
    x402Revenue: '0.00', uptime: 'Active',
  };
}

export async function findStaleDeals(): Promise<AutoDiscoveryResult[]> {
  const results: AutoDiscoveryResult[] = [];
  (await db.select({ onChainId: deals.onChainId }).from(deals)
    .where(and(eq(deals.status, 'Active'), lt(deals.createdAt, new Date(Date.now() - 48 * 60 * 60 * 1000)))).limit(20))
    .forEach(d => results.push({ dealId: Number(d.onChainId), action: 'notify' as const, reason: 'Active >48h without resolution' }));
  (await db.select({ onChainId: disputes.onChainId }).from(disputes)
    .where(and(isNull(disputes.ruling), lt(disputes.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)), isNull(disputes.aiRecommendedOutcome))).limit(20))
    .forEach(d => results.push({ dealId: Number(d.onChainId), action: 'analyze' as const, reason: 'Dispute >24h without AI analysis' }));
  return results;
}

export async function generateAgentServiceManifest(): Promise<Record<string, unknown>> {
  let agentAddress = '0x0000000000000000000000000000000000000000';
  try { const w = await getOrCreateAgentWallet(); agentAddress = w.walletAddress; } catch {}
  return {
    name: 'Clinch Dispute AI Agent', description: 'Autonomous AI escrow dispute resolution agent on Arc Network',
    network: config.x402.network || 'eip155:5042002', wallet: { address: agentAddress, chain: 'ARC-TESTNET' },
    endpoints: [{ path: '/api/disputes/:id/ai-analysis', method: 'POST', price: '$0.001', description: 'AI dispute analysis', authentication: 'x402' }],
    version: '1.0.0', updatedAt: new Date().toISOString(),
  };
}
