'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Brain,
  ShieldCheck,
  Wallet,
  Zap,
} from 'lucide-react';
import { ClinchLogo } from '@/components/clinch/logo';
import { ThemeToggle } from '@/components/clinch/theme-toggle';
import { useWallet } from '@/components/wallet-context';
import { truncateAddress } from '@/lib/format';
import { getPublicPlatformStats } from '@/lib/api';
import type { PublicPlatformStats } from '@/lib/api';

function LandingNavbar() {
  const { isConnected, address, connect, hasSigned, isSigning, canConnect } = useWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-border-subtle bg-sidebar/95 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="group">
          <ClinchLogo size={32} showText textSize="text-xl" />
        </Link>

        <div className="hidden items-center gap-7 font-sans text-[13px] font-medium text-text-secondary lg:flex">
          <a href="#how-it-works" className="transition-colors hover:text-cyan">
            Workflow
          </a>
          <a href="#deal-types" className="transition-colors hover:text-cyan">
            Deal Types
          </a>
          <Link href="/activity" className="transition-colors hover:text-cyan">
            Activity
          </Link>
          <a href="#security" className="transition-colors hover:text-cyan">
            Trust
          </a>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/docs"
            className="inline-flex items-center gap-1.5 border border-border-subtle px-3 py-1.5 font-sans text-xs font-medium text-text-secondary hover:text-cyan transition-colors"
          >
            Docs
          </Link>
          <ThemeToggle />
          {mounted && isConnected && address ? (
            <Link
              href="/dashboard"
              className="inline-flex h-9 items-center gap-2 border border-border-subtle bg-elevated px-3 font-mono text-xs text-text-secondary transition-colors hover:border-cyan hover:text-text-primary"
            >
              <span className={hasSigned ? 'h-1.5 w-1.5 rounded-full bg-active pulse-dot' : 'h-1.5 w-1.5 rounded-full bg-pending'} />
              <span className="hidden sm:inline">
                {hasSigned ? 'Dashboard' : isSigning ? 'Signing' : 'SIWE pending'}
              </span>
              {truncateAddress(address)}
            </Link>
          ) : (
            <button
              onClick={connect}
              disabled={!mounted || !canConnect}
              className="btn-sharp inline-flex h-9 items-center gap-2 bg-usdc px-4 font-sans text-sm font-semibold text-white hover:bg-cyan disabled:opacity-50"
            >
              <Wallet className="h-4 w-4" />
              {mounted && canConnect ? 'Connect' : 'Loading'}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

function AmountStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-center gap-2 border border-border-subtle bg-elevated/50 px-4 py-2 backdrop-blur-sm">
      <span className="font-mono text-[13px] font-medium text-text-primary">{value}</span>
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-tertiary">
        {label}
      </span>
    </div>
  );
}

const steps = [
  {
    num: '01',
    title: 'Create',
    body: 'Both parties set terms, amounts, and the expiry date. An invite link is generated.',
    color: 'var(--accent-cyan)',
  },
  {
    num: '02',
    title: 'Lock',
    body: 'USDC is deposited on Arc Network. The smart contract holds funds - no intermediary.',
    color: 'var(--accent-blue)',
  },
  {
    num: '03',
    title: 'Settle',
    body: 'Both agree to release, or the AI arbitrator rules. Funds move on-chain in seconds.',
    color: 'var(--accent-violet)',
  },
];

const trustSignals = [
  {
    icon: ShieldCheck,
    label: 'Non-custodial',
    body: 'Your funds go directly into the smart contract. Clinch never holds your USDC.',
    color: 'var(--accent-cyan)',
  },
  {
    icon: Zap,
    label: 'On-chain settlement',
    body: 'Sub-second finality on Arc Network. Funds release the moment consensus is reached.',
    color: 'var(--accent-blue)',
  },
  {
    icon: Brain,
    label: 'AI arbitration',
    body: 'When parties disagree, an AI analyzes the evidence and the arbitrator rules on-chain.',
    color: 'var(--accent-violet)',
  },
];

export default function LandingPage() {
  const [stats, setStats] = useState<PublicPlatformStats | null>(null);

  useEffect(() => {
    getPublicPlatformStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-void text-text-primary">
      <LandingNavbar />
      <main>
        <section className="grid-texture relative min-h-screen overflow-hidden bg-void">
          <div className="hero-glow -left-25 -top-25 bg-cyan" />
          <div className="hero-glow -bottom-25 -right-25 bg-violet" />

          <div className="pointer-events-none absolute right-0 top-0 hidden h-full w-[50%] lg:block">
            <img
              src="/escrow.jpg"
              alt=""
              className="h-full w-full object-cover"
              style={{ opacity: 0.35 }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to right, var(--bg-void) 0%, transparent 60%)',
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to top, var(--bg-void) 0%, transparent 40%)',
              }}
            />
          </div>

          <div className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-32">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border-default bg-elevated/80 px-4 py-1.5 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan pulse-dot" />
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-cyan">
                Arc Network · USDC Settlement
              </span>
            </div>

            <h1 className="mb-6 max-w-2xl">
              <span className="block font-display text-[72px] font-bold leading-none tracking-tight text-text-primary">
                The contract that
              </span>
              <span
                className="block font-display text-[72px] font-bold italic leading-none tracking-tight"
                style={{
                  WebkitTextStroke: '1.5px #2775CA',
                  color: 'transparent',
                }}
              >
                enforces itself.
              </span>
            </h1>

            <p className="mb-10 max-w-lg font-sans text-[18px] font-light leading-relaxed text-text-secondary">
              Lock USDC on Arc Network. Both parties agree or an AI arbitrator rules. No lawyers. No trust required.
            </p>

            <div className="mb-12 flex flex-wrap items-center gap-4">
              <Link
                href="/deals/new"
                className="btn-sharp glow-blue bg-usdc px-8 py-3.5 font-sans text-[15px] font-semibold text-white hover:bg-cyan"
              >
                Create a Deal
              </Link>
              <Link
                href="/activity"
                className="btn-sharp border border-border-default px-8 py-3.5 font-sans text-[15px] font-medium text-text-secondary hover:border-cyan hover:text-text-primary"
              >
                View Live Escrows <ArrowRight className="inline h-4 w-4" />
              </Link>
            </div>

            <div className="flex flex-wrap gap-3">
              <AmountStat value={stats ? `$${stats.totalVolumeLocked}` : '$0'} label="Volume Locked" />
              <AmountStat value={stats ? String(stats.activeDeals) : '0'} label="Active Deals" />
              <AmountStat value="2%" label="Platform Fee" />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-t border-border-subtle bg-surface px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <p className="mb-12 font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-text-tertiary">
              How it works
            </p>
            <div className="grid grid-cols-1 gap-0 md:grid-cols-3">
              {steps.map((step, index) => (
                <div
                  key={step.num}
                  className="relative border-t-2 pb-8 pr-8 pt-8"
                  style={{ borderTopColor: step.color }}
                >
                  {index < 2 && (
                    <div
                      className="absolute right-0 -top-0.5 hidden h-0.5 w-8 md:block"
                      style={{
                        background: `linear-gradient(to right, ${step.color}, transparent)`,
                      }}
                    />
                  )}
                  <span
                    className="mb-4 block font-mono text-[56px] font-medium leading-none"
                    style={{ color: step.color, opacity: 0.25 }}
                  >
                    {step.num}
                  </span>
                  <h3 className="mb-3 font-sans text-[18px] font-semibold text-text-primary">
                    {step.title}
                  </h3>
                  <p className="font-sans text-[14px] font-light leading-relaxed text-text-secondary">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="deal-types" className="bg-void px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <p className="mb-12 font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-text-tertiary">
              Escrow types
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="border border-l-4 border-border-subtle border-l-usdc bg-surface p-8 transition-colors hover:border-l-cyan">
                <span className="mb-2 inline-block font-mono text-[10px] uppercase tracking-[0.12em] text-usdc">
                  Mutual Stake
                </span>
                <h3 className="mb-3 font-sans text-[20px] font-semibold text-text-primary">
                  Peer agreements
                </h3>
                <p className="font-sans text-[14px] font-light leading-relaxed text-text-secondary">
                  Both parties deposit USDC. Winner takes the full pot. Loser forfeits their stake. Maximum skin in the game.
                </p>
              </div>
              <div className="border border-l-4 border-border-subtle border-l-cyan bg-surface p-8 transition-colors hover:border-l-violet">
                <span className="mb-2 inline-block font-mono text-[10px] uppercase tracking-[0.12em] text-cyan">
                  One-Sided Escrow
                </span>
                <h3 className="mb-3 font-sans text-[20px] font-semibold text-text-primary">
                  Freelance & services
                </h3>
                <p className="font-sans text-[14px] font-light leading-relaxed text-text-secondary">
                  Client locks payment upfront. Worker gets paid when work is confirmed complete. No more unpaid invoices.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="security" className="border-t border-border-subtle bg-surface px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
              {trustSignals.map((item) => (
                <div key={item.label}>
                  <div
                    className="mb-4 flex h-10 w-10 items-center justify-center border"
                    style={{
                      borderColor: `${item.color}40`,
                      backgroundColor: `${item.color}10`,
                    }}
                  >
                    <item.icon className="h-5 w-5" style={{ color: item.color }} />
                  </div>
                  <h3 className="mb-2 font-sans text-[16px] font-semibold text-text-primary">
                    {item.label}
                  </h3>
                  <p className="font-sans text-[14px] font-light leading-relaxed text-text-secondary">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden border-t border-border-subtle bg-void px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-1 items-center gap-16 md:grid-cols-2">
              <div>
                <p className="mb-4 font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-text-tertiary">
                  Works everywhere
                </p>
                <h2 className="mb-4 font-sans text-[32px] font-semibold leading-tight text-text-primary">
                  Deal on any device.
                  <br />
                  Settle on-chain.
                </h2>
                <p className="font-sans text-[15px] font-light leading-relaxed text-text-secondary">
                  Clinch works in any browser. Your counterparty just needs a wallet. The contract does the rest.
                </p>
              </div>
              <div className="flex justify-center">
                <div
                  className="relative overflow-hidden border-[6px] border-elevated shadow-2xl"
                  style={{
                    borderRadius: '40px',
                    width: '240px',
                    aspectRatio: '9 / 19.5',
                    boxShadow: '0 40px 80px -20px rgba(0,0,0,0.8), 0 0 40px #2775CA20',
                  }}
                >
                  <img
                    src="/phone.jpg"
                    alt="Clinch on mobile"
                    className="h-full w-full object-cover"
                    style={{ opacity: 0.9 }}
                  />
                  <div className="absolute left-1/2 top-3 h-6 w-20 -translate-x-1/2 rounded-full bg-void" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle bg-sidebar px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6">
          <ClinchLogo size={28} showText textSize="text-base" />
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <span className="font-mono text-[11px] uppercase tracking-widest text-text-tertiary">
              Built on Arc Network · USDC Settlement
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
