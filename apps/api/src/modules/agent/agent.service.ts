import { eq, and, desc, lt, isNull, sql } from 'drizzle-orm';
import { db } from '../../config/db';
import { config } from '../../config/env';
import { deals, disputes } from '../../db/schema';
import type { AgentWalletConfig, AgentMetrics, AgentTransaction, AutoDiscoveryResult } from './agent.types';

// Use require to avoid TypeScript module resolution issues with Circle SDK
// The SDK is installed in node_modules and works fine at runtime
const sdk = require('@circle-fin/developer-controlled-wallets') as {
  initiateDeveloperControlledWalletsClient: (opts: Record<string, string>) => any;
};

const { initiateDeveloperControlledWalletsClient } = sdk;

interface AgentState {
  wallet: AgentWalletConfig | null;
}

const state: AgentState = {
  wallet: null,
};

function getSdkClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: config.circle.apiKey || '',
    entitySecret: config.circle.entitySecret || '',
  });
}

function parseUsdc(raw: string | number | bigint | undefined | null): string {
  if (!raw) return '0';
  const num = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
  return isNaN(num) ? '0' : num.toFixed(2);
}

export async function getOrCreateAgentWallet(): Promise<AgentWalletConfig> {
  if (state.wallet) return state.wallet;

  const client = getSdkClient();

  // Try to find existing wallet by wallet set
  if (config.circle.walletSetId) {
    try {
      const walletsResponse = await client.getWalletsWithBalances({
        blockchain: 'ARC-TESTNET' as any,
        walletSetId: config.circle.walletSetId,
        pageSize: 1,
      });
      const existing = walletsResponse.data?.wallets?.[0];
      if (existing) {
        state.wallet = {
          walletId: existing.id,
          walletAddress: existing.address,
          balance: parseUsdc((existing as any).tokenBalances?.[0]?.amount),
          entitySecret: config.circle.entitySecret || '',
          walletSetId: config.circle.walletSetId,
        };
        console.log('[Clinch Agent] Found existing wallet:', state.wallet.walletAddress);
        return state.wallet;
      }
    } catch (err: any) {
      console.warn('[Clinch Agent] Could not fetch existing wallet, will create one');
    }
  }

  if (!config.circle.walletSetId) {
    throw new Error('CIRCLE_WALLET_SET_ID is required to create an agent wallet');
  }

  // Create a new wallet
  try {
    const created = await client.createWallets({
      walletSetId: config.circle.walletSetId,
      blockchains: ['ARC-TESTNET'],
      count: 1,
    });

    const wallet = created.data?.wallets?.[0];
    if (!wallet) throw new Error('No wallet returned from Circle');

    state.wallet = {
      walletId: wallet.id,
      walletAddress: wallet.address,
      balance: '0',
      entitySecret: config.circle.entitySecret || '',
      walletSetId: config.circle.walletSetId,
    };

    console.log('[Clinch Agent] Agent wallet created:', state.wallet.walletAddress);
    return state.wallet;
  } catch (err: any) {
    console.error('[Clinch Agent] Failed to create wallet:', err?.message || err);
    throw err;
  }
}

export async function getAgentWalletBalance(): Promise<string> {
  try {
    const wallet = await getOrCreateAgentWallet();
    const client = getSdkClient();
    const info = await client.getWalletTokenBalance({
      id: wallet.walletId,
    });
    const usdcBalance = info.data?.tokenBalances?.find((b: any) => b.token === 'USDC');
    return parseUsdc(usdcBalance?.amount);
  } catch (err) {
    console.warn('[Clinch Agent] Failed to fetch wallet balance:', err);
    return '0';
  }
}

export async function getAgentMetrics(): Promise<AgentMetrics> {
  const resolvedCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(disputes)
    .where(and(
      eq(disputes.ruling, 'PartyAWins'),
      eq(disputes.ruledByWallet, 'clinch_agent'),
    ))
    .then((r: Array<{ count: number }>) => Number(r[0]?.count || 0));

  const feeDeals = await db
    .select({ fee: deals.platformFee })
    .from(deals)
    .where(eq(deals.status, 'Resolved'))
    .limit(100);

  const totalFees = feeDeals.reduce((sum: number, d: { fee: string | null }) => sum + (parseFloat(d.fee || '0') || 0), 0);

  const autoHandled = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(disputes)
    .where(eq(disputes.ruledByWallet, 'clinch_agent'))
    .then((r: Array<{ count: number }>) => Number(r[0]?.count || 0));

  return {
    disputesResolved: resolvedCount,
    totalFeesEarned: totalFees.toFixed(2),
    totalComputeSpent: (totalFees * 0.02).toFixed(2),
    dealsAutonomouslyHandled: autoHandled,
    x402Revenue: '0.00',
    uptime: 'Active',
  };
}

export async function findStaleDeals(): Promise<AutoDiscoveryResult[]> {
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const results: AutoDiscoveryResult[] = [];

  const staleActiveDeals = await db
    .select({ onChainId: deals.onChainId })
    .from(deals)
    .where(
      and(
        eq(deals.status, 'Active'),
        lt(deals.createdAt, fortyEightHoursAgo),
      ),
    )
    .limit(20);

  for (const d of staleActiveDeals) results.push({
    dealId: Number(d.onChainId),
    action: 'notify' as const,
    reason: 'Deal has been active >48h without resolution',
  });

  const staleDisputedDeals = await db
    .select({ onChainId: disputes.onChainId })
    .from(disputes)
    .where(
      and(
        isNull(disputes.ruling),
        lt(disputes.createdAt, twentyFourHoursAgo),
        isNull(disputes.aiRecommendedOutcome),
      ),
    )
    .limit(20);

  for (const d of staleDisputedDeals) results.push({
    dealId: Number(d.onChainId),
    action: 'analyze' as const,
    reason: 'Dispute open >24h without AI analysis',
  });

  return results;
}

export async function generateAgentServiceManifest(): Promise<Record<string, unknown>> {
  let agentAddress = '0x0000000000000000000000000000000000000000';
  try {
    const wallet = await getOrCreateAgentWallet();
    agentAddress = wallet.walletAddress;
  } catch { /* use fallback address */ }

  return {
    name: 'Clinch Dispute AI Agent',
    description: 'Autonomous AI escrow dispute resolution agent on Arc Network',
    network: config.x402.network || 'eip155:5042002',
    wallet: { address: agentAddress, chain: 'ARC-TESTNET' },
    endpoints: [{
      path: '/api/disputes/:id/ai-analysis',
      method: 'POST',
      price: '$0.001',
      description: 'AI dispute analysis with recommended outcome',
      authentication: 'x402',
    }],
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
  };
}
