"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import {
  CheckCircle2,
  FileText,
  Lock,
  CheckCircle,
  Shield,
  Code2,
  Scale,
  Trophy,
  Briefcase,
  ArrowLeftRight,
  Handshake,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/clinch/logo";
import { WalletProvider, useWallet } from "@/components/wallet-context";

function LandingNavbar() {
  const { isConnected, connect } = useWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <nav className="sticky top-0 z-50 h-16 border-b border-clinch-border-default bg-clinch-bg-page/80 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 md:px-6">
        <Logo />
        {!mounted ? (
          <Button className="bg-clinch-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-clinch-accent-hover">
            Connect Wallet
          </Button>
        ) : isConnected ? (
          <Link href="/dashboard">
            <Button className="bg-clinch-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-clinch-accent-hover">
              Go to Dashboard
            </Button>
          </Link>
        ) : (
          <Button
            onClick={connect}
            className="bg-clinch-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-clinch-accent-hover"
          >
            Connect Wallet
          </Button>
        )}
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* Subtle radial gradient overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_center,rgba(79,110,247,0.12)_0%,transparent_50%)]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-64px)] max-w-2xl flex-col items-center justify-center px-4 py-20 text-center">
        {/* Top label pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-clinch-border-default bg-clinch-bg-card px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-clinch-accent" />
          <span className="text-xs font-medium text-clinch-text-secondary">
            Trustless agreements on Arc Network
          </span>
        </div>

        {/* Headline */}
        <h1
          className="mt-8 text-4xl font-bold tracking-tight text-clinch-text-primary md:text-5xl"
          style={{ letterSpacing: "-0.03em" }}
        >
          <span className="text-balance">
            The trustless way to lock and <br className="hidden md:inline" />
            settle any deal
          </span>
        </h1>

        {/* Subheadline */}
        <p className="mt-5 mb-8 max-w-lg text-lg leading-relaxed text-clinch-text-secondary">
          Create on-chain agreements backed by USDC escrow. Funds release
          automatically when both parties agree or through structured
          arbitration.
        </p>

        {/* CTA row */}
        <div className="flex flex-row gap-3">
          <Link href="/deals/new">
            <Button
              size="lg"
              className="bg-clinch-accent px-6 py-3 text-base font-medium text-white hover:bg-clinch-accent-hover"
            >
              Create a deal
            </Button>
          </Link>

          <Button
            onClick={() => {
              document
                .getElementById("how-it-works")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            See how it works
          </Button>
        </div>

        {/* Social proof strip */}
        <div className="mt-12 flex flex-wrap justify-center gap-8">
          {["Non-custodial", "On-chain settlement", "Arbitration built-in"].map(
            (item) => (
              <div
                key={item}
                className="flex items-center gap-2 text-sm text-clinch-text-tertiary"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-clinch-accent" />
                {item}
              </div>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      number: "01",
      icon: FileText,
      title: "Define the agreement",
      description:
        "Set deal terms, deposit amounts, expiry date, and choose an arbitrator. Share an invite link with your counterparty.",
    },
    {
      number: "02",
      icon: Lock,
      title: "Both parties deposit",
      description:
        "Each party locks their USDC into the smart contract. No one controls the funds only the contract rules do.",
    },
    {
      number: "03",
      icon: CheckCircle,
      title: "Settle or arbitrate",
      description:
        "Submit your outcome vote. Matching votes auto-settle. Conflicting votes go to arbitration with a binding ruling.",
    },
  ];

  return (
    <section className="bg-clinch-bg-page pb-20 pt-24" id="how-it-works">
      <div className="mx-auto max-w-4xl px-4">
        <div className="text-center">
          <span className="text-micro text-clinch-accent">HOW IT WORKS</span>
          <h2 className="mt-3 mb-4 text-h2 text-clinch-text-primary">
            Three steps to a settled deal
          </h2>
          <p className="mb-14 text-clinch-text-secondary">
            Simple process, trustless execution
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.number}
              className="relative rounded-xl border border-clinch-border-default bg-clinch-bg-card p-7"
            >
              <span className="absolute right-5 top-5 text-xs font-bold tracking-wider text-clinch-border-default">
                {step.number}
              </span>
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-clinch-accent-muted">
                <step.icon className="h-4.5 w-4.5 text-clinch-accent" />
              </div>
              <h4 className="mb-2 text-h4 text-clinch-text-primary">
                {step.title}
              </h4>
              <p className="text-sm leading-relaxed text-clinch-text-secondary">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSignalsSection() {
  const signals = [
    {
      icon: Shield,
      title: "Non-custodial",
      text: "Your funds go directly into the smart contract. No platform wallet. No counterparty risk.",
    },
    {
      icon: Code2,
      title: "Verifiable on-chain",
      text: "The contract is deployed on Arc Network. Anyone can audit the settlement logic.",
    },
    {
      icon: Scale,
      title: "Structured arbitration",
      text: "Designate any wallet as arbitrator, or use the platform fallback. Disputes always have an exit.",
    },
  ];

  return (
    <section className="border-y border-clinch-border-default bg-[#0D1020] py-16">
      <div className="mx-auto grid max-w-5xl gap-10 px-4 md:grid-cols-3">
        {signals.map((signal) => (
          <div key={signal.title}>
            <signal.icon className="mb-4 h-5 w-5 text-clinch-accent" />
            <h4 className="mb-2 text-[15px] font-semibold text-clinch-text-primary">
              {signal.title}
            </h4>
            <p className="text-sm leading-relaxed text-clinch-text-secondary">
              {signal.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function UseCasesSection() {
  const useCases = [
    {
      icon: Trophy,
      title: "Betting",
      description:
        "Lock stakes before the match. Winner claims the pot automatically.",
    },
    {
      icon: Briefcase,
      title: "Freelance",
      description:
        "Client locks payment. Freelancer delivers. Funds release on confirm.",
    },
    {
      icon: ArrowLeftRight,
      title: "P2P trades",
      description: "Trade goods or services with an on-chain safety net.",
    },
    {
      icon: Handshake,
      title: "Business deals",
      description:
        "Formalize any agreement with on-chain collateral backing it.",
    },
  ];

  return (
    <section className="bg-clinch-bg-page py-20">
      <div className="mx-auto max-w-4xl px-4">
        <div className="text-center">
          <h2 className="mb-3 text-h2 text-clinch-text-primary">
            Built for any agreement
          </h2>
          <p className="mb-12 text-clinch-text-secondary">
            From casual bets to business contracts
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {useCases.map((useCase) => (
            <div
              key={useCase.title}
              className="rounded-xl border border-clinch-border-default bg-clinch-bg-card p-6"
            >
              <useCase.icon className="h-5.5 w-5.5 text-clinch-accent" />
              <h4 className="mt-3 mb-1 text-[15px] font-semibold text-clinch-text-primary">
                {useCase.title}
              </h4>
              <p className="text-[13px] text-clinch-text-secondary">
                {useCase.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTASection() {
  return (
    <section className="bg-clinch-bg-page py-24">
      <div className="mx-auto max-w-lg px-4 text-center">
        {/* Accent line */}
        <div className="mx-auto mb-8 h-16 w-px bg-clinch-accent" />

        <h2 className="text-h2 text-clinch-text-primary">
          Ready to lock your first deal?
        </h2>
        <p className="mt-3 mb-8 text-clinch-text-secondary">
          Connect your wallet and create an agreement in two minutes.
        </p>
        <Link href="/deals/new">
          <Button
            size="lg"
            className="bg-clinch-accent px-8 py-3 text-base font-medium text-white hover:bg-clinch-accent-hover"
          >
            Create a deal
          </Button>
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-clinch-border-default py-5">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 text-sm text-clinch-text-tertiary md:px-6">
        <span>Clinch</span>
        <span>Built on Arc Network</span>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <WalletProvider>
      <div className="min-h-screen bg-clinch-bg-page">
        <LandingNavbar />
        <main>
          <HeroSection />
          <HowItWorksSection />
          <TrustSignalsSection />
          <UseCasesSection />
          <FinalCTASection />
        </main>
        <Footer />
      </div>
    </WalletProvider>
  );
}
