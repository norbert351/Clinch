import { eq, and, desc, lt, isNull, sql } from 'drizzle-orm';
import { db } from '../../config/db';
import { config } from '../../config/env';
import { deals, disputes } from '../../db/schema';
import type { AgentWalletConfig, AgentMetrics, AgentTransaction, AutoDiscoveryResult } from './agent.types';

interface AgentState {
  wallet: AgentWalletConfig | null;
}

const state: AgentState = {
  wallet: null,
};

function apiHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  h['Content-Type'] = 'application/json';
  h['Authorization'] = 'Bearer ' + (config.circle.apiKey || '');
  const es = config.circle.entitySecret || '';
  if (es) h['X-Entity-Secret-Ciphertext'] = es;
  return h;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch('https://api.circle.com' + path, {
    method: 'POST', headers: apiHeaders(), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('Circle API ' + path + ' ' + r.status + ': ' + await r.text().catch(() => ''));
  return r.json() as Promise<T>;
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch('https://api.circle.com' + path, { headers: apiHeaders() });
  if (!r.ok) throw new Error('Circle API ' + path + ' ' + r.status + ': ' + await r.text().catch(() => ''));
  return r.json() as Promise<T>;
}

function parseUsdc(raw: string | number | bigint | undefined | null): string {
  if (!raw) return '0';
  const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
  return isNaN(n) ? '0' : n.toFixed(2);
}

export async function getOrCreateAgentWallet(): Promise<AgentWalletConfig> {
  if (state.wallet) return state.wallet;

  if (config.circle.developerWalletId && config.circle.entitySecret) {
    try {
      const data = await apiGet<{ data: { id: string; address: string } }>('/v1/wallets/' + config.circle.developerWalletId);
      state.wallet = {
        walletId: data.data.id, walletAddress: data.data.address, balance: '0',
        entitySecret: config.circle.entitySecret as string, walletSetId: config.circle.walletSetId || '',
      };
      console.log('[Clinch Agent] Found existing wallet:', state.wallet.walletAddress);
      return state.wallet;
    } catch {
      console.warn('[Clinch Agent] Could not fetch existing wallet, will create one');
    }
  }
  if (!config.circle.walletSetId) throw new Error('CIRCLE_WALLET_SET_ID is required');
  try {
    const created = await apiPost<{ data: { wallets: Array<{ id: string; address: string }> } }>('/v1/wallets', {
      walletSetId: config.circle.walletSetId, blockchains: ['ARC-TESTNET'], count: 1,
    });
    const w = created.data.wallets[0];
    if (!w) throw new Error('No wallet returned');
    state.wallet = { walletId: w.id, walletAddress: w.address, balance: '0',
      entitySecret: config.circle.entitySecret as string, walletSetId: config.circle.walletSetId };
    console.log('[Clinch Agent] Agent wallet created:', state.wallet.walletAddress);
    return state.wallet;
  } catch (err: any) {
    console.error('[Clinch Agent] Failed:', err?.message || err); throw err;
  }
}

export async function getAgentWalletBalance(): Promise<string> {
  try {
    const wallet = await getOrCreateAgentWallet();
    const data = await apiGet<{ data: { tokenBalances?: Array<{ token: string; amount: string }> } }>('/v1/wallets/' + wallet.walletId + '/balances');
    const usdc = data.data.tokenBalances?.find(b => b.token === 'USDC');
    return parseUsdc(usdc?.amount);
  } catch { return '0'; }
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
