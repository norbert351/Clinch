import { eq, and, desc, lt, isNull, sql } from 'drizzle-orm';
import { db } from '../../config/db';
import { config } from '../../config/env';
import { deals, disputes } from '../../db/schema';
import type { AgentWalletConfig, AgentMetrics, AgentTransaction, AutoDiscoveryResult } from './agent.types';

const CIRCLE_API_BASE = config.circle.environment === 'testnet'
  ? 'https://api-testnet.circle.com'
  : 'https://api.circle.com';

interface AgentState {
  wallet: AgentWalletConfig | null;
}

const state: AgentState = {
  wallet: null,
};

function buildAuthHeader(): Record<string, string> {
  const h: Record<string, string> = {};
  h['Content-Type'] = 'application/json';
  const key = config.circle.apiKey || '';
  h['Authorization'] = 'Bearer ' + key;
  return h;
}

function buildAuthHeaderGet(): Record<string, string> {
  const h: Record<string, string> = {};
  const key = config.circle.apiKey || '';
  h['Authorization'] = 'Bearer ' + key;
  return h;
}

async function circleApiPost<T>(path: string, body: unknown): Promise<T> {
  if (!config.circle.apiKey) {
    throw new Error('CIRCLE_API_KEY is not configured');
  }
  const response = await fetch(CIRCLE_API_BASE + path, {
    method: 'POST',
    headers: buildAuthHeader(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error('Circle API ' + path + ' returned ' + response.status + ': ' + detail);
  }
  return (await response.json()) as T;
}

async function circleApiGet<T>(path: string): Promise<T> {
  if (!config.circle.apiKey) {
    throw new Error('CIRCLE_API_KEY is not configured');
  }
  const response = await fetch(CIRCLE_API_BASE + path, {
    headers: buildAuthHeaderGet(),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error('Circle API ' + path + ' returned ' + response.status + ': ' + detail);
  }
  return (await response.json()) as T;
}

export async function getOrCreateAgentWallet(): Promise<AgentWalletConfig> {
  if (state.wallet) return state.wallet;

  if (config.circle.developerWalletId && config.circle.entitySecret) {
    try {
      const data = await circleApiGet<{
        data: { walletId: string; address: string; balances?: Array<{ amount: string }> };
      }>('/v1/wallets/' + config.circle.developerWalletId);
      state.wallet = {
        walletId: data.data.walletId,
        walletAddress: data.data.address,
        balance: data.data.balances?.[0]?.amount || '0',
        entitySecret: config.circle.entitySecret,
        walletSetId: config.circle.walletSetId || '',
      };
      return state.wallet;
    } catch {
      console.warn('[Clinch Agent] Could not fetch existing wallet, will create one');
    }
  }

  if (!config.circle.walletSetId) {
    throw new Error('CIRCLE_WALLET_SET_ID is required to create an agent wallet');
  }

  const created = await circleApiPost<{
    data: { walletId: string; address: string; blockchain: string };
  }>('/v1/wallets', {
    walletSetId: config.circle.walletSetId,
    blockchains: ['ARC-TESTNET'],
    count: 1,
  });

  state.wallet = {
    walletId: created.data.walletId,
    walletAddress: created.data.address,
    balance: '0',
    entitySecret: config.circle.entitySecret || '',
    walletSetId: config.circle.walletSetId,
  };

  console.log('[Clinch Agent] Agent wallet created:', state.wallet.walletAddress);
  return state.wallet;
}

export async function getAgentWalletBalance(): Promise<string> {
  try {
    const wallet = await getOrCreateAgentWallet();
    const info = await circleApiGet<{
      data: { balances?: Array<{ amount: string; token: string }> };
    }>('/v1/wallets/' + wallet.walletId + '/balances');
    const usdcBalance = info.data.balances?.find(b => b.token === 'USDC');
    const balance = usdcBalance?.amount || '0';
    state.wallet = { ...wallet, balance };
    return balance;
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
  const results: AutoDiscoveryResult[] = [];
  const now = new Date();

  const staleDepositDeals = await db
    .select()
    .from(deals)
    .where(and(
      eq(deals.status, 'AwaitingDeposit'),
      lt(deals.updatedAt, new Date(now.getTime() - 48 * 60 * 60 * 1000)),
    ))
    .limit(10);

  for (const deal of staleDepositDeals) {
    results.push({
      dealId: Number(deal.onChainId),
      action: 'notify',
      reason: 'Deal #' + deal.onChainId + ' has been awaiting deposit for > 48 hours',
    });
  }

  const staleDisputes = await db
    .select()
    .from(disputes)
    .innerJoin(deals, eq(disputes.onChainId, deals.onChainId))
    .where(and(
      eq(deals.status, 'Disputed'),
      isNull(disputes.ruling),
      lt(disputes.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
    ))
    .limit(10);

  for (const row of staleDisputes) {
    const d = row.disputes;
    results.push({
      dealId: Number(d.onChainId),
      action: 'analyze',
      reason: 'Dispute #' + d.onChainId + ' has been open for > 24 hours without a ruling',
    });
  }

  return results;
}

export async function generateAgentServiceManifest(): Promise<Record<string, unknown>> {
  const wallet = await getOrCreateAgentWallet();
  return {
    name: 'Clinch Dispute AI Agent',
    description: 'AI-powered dispute resolution for USDC escrow deals on Arc.',
    provider: {
      name: 'Clinch',
      website: 'https://clinch-one.vercel.app',
    },
    endpoints: [
      {
        method: 'POST',
        path: '/api/agent/arbitrate',
        contentType: 'application/json',
        price: '0.001',
        token: 'USDC',
        network: 'eip155:5042002',
        description: 'Submit deal context for AI dispute analysis.',
        request: {
          properties: {
            dealId: { type: 'integer' },
            dealContext: { type: 'string' },
            partyAStatement: { type: 'string' },
            partyBStatement: { type: 'string' },
          },
        },
        response: {
          properties: {
            analysis: { type: 'string' },
            recommendedOutcome: { type: 'string', enum: ['PartyAWins', 'PartyBWins', 'Split'] },
            confidence: { type: 'string', enum: ['High', 'Medium', 'Low'] },
          },
        },
      },
    ],
    wallet: {
      address: wallet.walletAddress,
      chain: 'ARC-TESTNET',
    },
  };
}
