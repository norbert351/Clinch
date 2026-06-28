'use client';

import { useEffect, useState } from 'react';
import { Bot, Wallet, Activity, BarChart3, ExternalLink, Copy, Check } from 'lucide-react';

interface AgentWallet {
  walletId: string;
  address: string;
  balance: string;
}

interface AgentMetrics {
  disputesResolved: number;
  totalFeesEarned: string;
  totalComputeSpent: string;
  dealsAutonomouslyHandled: number;
  x402Revenue: string;
  uptime: string;
}

const API = 'https://clinch-mi27.onrender.com';

export default function AgentPage() {
  const [wallet, setWallet] = useState<AgentWallet | null>(null);
  const [metrics, setMetrics] = useState<AgentMetrics | null>(null);
  const [manifest, setManifest] = useState<Record<string, any> | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(API + '/api/agent/wallet').then(r => r.json()),
      fetch(API + '/api/agent/metrics').then(r => r.json()),
      fetch(API + '/api/agent/manifest').then(r => r.json()),
    ]).then(([w, m, mn]) => {
      if (w.success) setWallet(w.data);
      if (m.success) setMetrics(m.data);
      if (mn.success) setManifest(mn.data);
    }).catch(() => {});
  }, []);

  const copyAddress = async () => {
    if (wallet?.address) {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16 pt-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 font-sans text-[28px] font-semibold text-[var(--text-primary)]">
          <Bot className="h-7 w-7" />
          Clinch Agent
        </h1>
        <p className="mt-1 font-sans text-[13px] text-[var(--text-secondary)]">
          Autonomous AI dispute resolution agent with its own wallet on Arc Testnet
        </p>
      </div>

      {!wallet && !metrics ? (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center">
          <Bot className="mx-auto mb-3 h-10 w-10 text-[var(--text-tertiary)]" />
          <p className="font-sans text-[14px] text-[var(--text-secondary)]">Agent wallet not configured.</p>
          <p className="mt-1 font-sans text-[12px] text-[var(--text-tertiary)]">Set CIRCLE_API_KEY and CIRCLE_WALLET_SET_ID in environment.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-3">
            {/* Wallet Card */}
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-[var(--accent-cyan)]" />
                  <span className="font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Agent Wallet</span>
                </div>
                <span className="rounded border border-[var(--accent-cyan-dim)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--accent-cyan)]">Circle Wallet</span>
              </div>
              <p className="mb-1 font-mono text-[34px] leading-none text-[var(--text-primary)]">{wallet?.balance || '0'}<span className="ml-2 text-[16px] text-[var(--text-secondary)]">USDC</span></p>
              <div className="mt-3 flex items-center gap-2">
                <span className="font-mono text-[12px] text-[var(--text-tertiary)]">
                  {wallet?.address ? wallet.address.slice(0, 6) + '...' + wallet.address.slice(-4) : 'N/A'}
                </span>
                {wallet?.address && (
                  <button onClick={copyAddress} className="text-[var(--text-tertiary)] hover:text-[var(--accent-cyan)]">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
              {wallet?.address && (
                <a href={`https://explorer.arc.network/address/${wallet.address}`} target="_blank" rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1 font-sans text-[12px] text-[var(--accent-cyan)] hover:underline">
                  View on Arc Explorer <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* Metrics Card */}
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[var(--accent-cyan)]" />
                <span className="font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Agent Metrics</span>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Disputes Resolved', value: metrics?.disputesResolved || 0, suffix: '' },
                  { label: 'Autonomous Handlings', value: metrics?.dealsAutonomouslyHandled || 0, suffix: '' },
                  { label: 'Total Fees Earned', value: metrics?.totalFeesEarned || '0.00', suffix: 'USDC' },
                  { label: 'Compute Spent', value: metrics?.totalComputeSpent || '0.00', suffix: 'USDC' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 last:border-0">
                    <span className="font-sans text-[12px] text-[var(--text-secondary)]">{item.label}</span>
                    <span className="font-mono text-[13px] text-[var(--text-primary)]">
                      {item.value} {item.suffix && <span className="text-[11px] text-[var(--text-tertiary)]">{item.suffix}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity Card */}
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
              <div className="mb-4 flex items-center gap-2">
                <Activity className="h-4 w-4 text-[var(--accent-cyan)]" />
                <span className="font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Service Status</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-elevated)] p-3">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-sans text-[13px] text-[var(--text-primary)]">{metrics?.uptime || 'Active'}</span>
              </div>
              {manifest && (
                <div className="mt-4">
                  <p className="mb-2 font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--text-tertiary)]">x402 Service</p>
                  <div className="rounded-lg bg-[var(--bg-elevated)] p-3">
                    <p className="font-sans text-[12px] text-[var(--text-secondary)]">{manifest.name}</p>
                    <p className="mt-1 font-mono text-[11px] text-[var(--accent-cyan)]">
                      {manifest.endpoints?.[0]?.price} USDC per call
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* x402 Manifest Section */}
          {manifest && (
            <div className="mt-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
              <h2 className="mb-4 font-sans text-[16px] font-semibold text-[var(--text-primary)]">x402 Service Manifest</h2>
              <p className="mb-3 font-sans text-[13px] text-[var(--text-secondary)]">
                Other AI agents on Arc can hire the Clinch Agent for dispute resolution via nanopayments.
                Register this service in the Circle Agent Marketplace:
              </p>
              <pre className="overflow-x-auto rounded-lg bg-[var(--bg-elevated)] p-4 font-mono text-[12px] text-[var(--text-primary)]">
{JSON.stringify(manifest, null, 2)}</pre>
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-[var(--bg-elevated)] p-3">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="font-sans text-[12px] text-[var(--text-secondary)]">
                  Other agents can call <code className="rounded bg-[var(--bg-void)] px-1 py-0.5 font-mono text-[11px]">POST /api/agent/arbitrate</code> with x402 payment for AI dispute analysis.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
