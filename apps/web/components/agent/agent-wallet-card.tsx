'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { API_URL, getToken } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

interface AgentMetrics {
  disputesResolved: number;
  totalFeesEarned: string;
  totalComputeSpent: string;
  dealsAutonomouslyHandled: number;
  x402Revenue: string;
  uptime: string;
}

interface AgentWallet {
  walletId: string;
  address: string;
  balance: string;
}

export function AgentWalletCard() {
  const [wallet, setWallet] = useState<AgentWallet | null>(null);
  const [metrics, setMetrics] = useState<AgentMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const token = getToken();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = 'Bearer ' + token;
        }

        const [walletRes, metricsRes] = await Promise.all([
          fetch(API_URL + '/api/agent/wallet', { headers }),
          fetch(API_URL + '/api/agent/metrics', { headers }),
        ]);

        if (!walletRes.ok) throw new Error('Failed to fetch wallet');
        if (!metricsRes.ok) throw new Error('Failed to fetch metrics');

        const walletData = await walletRes.json();
        const metricsData = await metricsRes.json();

        setWallet(walletData.data);
        setMetrics(metricsData.data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load agent data';
        setError(message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle><Skeleton className="h-5 w-40" /></CardTitle>
          <CardDescription><Skeleton className="h-4 w-60" /></CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>🤖 Clinch Agent</CardTitle>
          <CardDescription>Autonomous dispute resolution agent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span>Agent wallet not configured. Set CIRCLE_API_KEY to enable.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            🤖 Clinch Agent
            <Badge variant="secondary" className="text-xs">{metrics?.uptime || 'Active'}</Badge>
          </CardTitle>
          <CardDescription>Autonomous AI dispute resolution agent</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Agent Wallet</p>
            <p className="text-sm font-mono">
              {wallet?.address ? wallet.address.slice(0, 6) + '...' + wallet.address.slice(-4) : 'N/A'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="text-sm font-medium">{wallet?.balance || '0'} USDC</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Disputes Resolved</p>
            <p className="text-sm font-medium">{metrics?.disputesResolved || 0}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Autonomous Handlings</p>
            <p className="text-sm font-medium">{metrics?.dealsAutonomouslyHandled || 0}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total Fees Earned</p>
            <p className="text-sm font-medium">{metrics?.totalFeesEarned || '0.00'} USDC</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Compute Spent</p>
            <p className="text-sm font-medium">{metrics?.totalComputeSpent || '0.00'} USDC</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-lg bg-muted p-3">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <p className="text-xs text-muted-foreground">
            Agent autonomously pays for AI compute via x402 nanopayments and earns from the 2% platform fee
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
