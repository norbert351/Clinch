'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Copy, Check, ChevronDown, ChevronRight, ExternalLink, Menu, X } from 'lucide-react';
import { Logo } from '@/components/clinch/logo';

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'quickstart', label: 'Quickstart' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'api', label: 'API Reference' },
  { id: 'deals', label: 'Deals' },
  { id: 'disputes', label: 'Disputes & AI' },
  { id: 'webhooks', label: 'Webhooks' },
  { id: 'agent', label: 'Agent Wallet' },
  { id: 'sdk', label: 'SDK & Libraries' },
  { id: 'examples', label: 'Examples' },
];

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative my-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">{language}</span>
        <button onClick={copy} className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--accent-cyan)] transition-colors">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-[var(--text-primary)]">{code}</pre>
    </div>
  );
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-16 scroll-mt-20">
      {children}
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-4 mt-8 font-sans text-[18px] font-semibold text-[var(--text-primary)]">{children}</h3>;
}

function Para({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 font-sans text-[14px] leading-relaxed text-[var(--text-secondary)]">{children}</p>;
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--accent-cyan)]">{children}</code>;
}

function ApiEndpoint({ method, path, description }: { method: string; path: string; description: string }) {
  const colorMap: Record<string, string> = { GET: 'text-emerald-400', POST: 'text-blue-400', DELETE: 'text-rose-400' };
  return (
    <div className="flex items-start gap-3 border-b border-[var(--border-subtle)] py-3 last:border-0">
      <span className={`min-w-[60px] font-mono text-[12px] font-bold uppercase tracking-wider ${colorMap[method] || 'text-[var(--text-secondary)]'}`}>{method}</span>
      <div className="min-w-0 flex-1">
        <span className="font-mono text-[13px] text-[var(--text-primary)]">{path}</span>
        <p className="mt-0.5 font-sans text-[12px] text-[var(--text-tertiary)]">{description}</p>
      </div>
    </div>
  );
}

export default function DocsPage() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--bg-void)]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--text-tertiary)]">Docs</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="font-sans text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent-cyan)] transition-colors">← Back to App</Link>
            <button onClick={() => setMobileNavOpen(!mobileNavOpen)} className="md:hidden text-[var(--text-secondary)]">
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px]">
        {/* Sidebar */}
        <nav className={`${mobileNavOpen ? 'block' : 'hidden'} md:block w-64 shrink-0 border-r border-[var(--border-subtle)] p-6`}>
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-tertiary)]">Developer Docs</p>
          <ul className="space-y-1">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} onClick={() => setMobileNavOpen(false)}
                  className="block rounded px-3 py-1.5 font-sans text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main Content */}
        <main className="min-w-0 flex-1 px-6 py-10 md:px-12">
          <h1 className="mb-2 font-sans text-[32px] font-bold text-[var(--text-primary)]">Developer Documentation</h1>
          <p className="mb-10 font-sans text-[15px] text-[var(--text-secondary)]">Build escrow-powered products with Clinch's API, AI dispute analysis, and agent wallet.</p>

          <Section id="overview">
            <h2 className="mb-4 font-sans text-[24px] font-semibold text-[var(--text-primary)]">Overview</h2>
            <Para>
              Clinch is a trustless USDC escrow platform on Arc Network. Our API lets you embed escrow deals,
              AI dispute resolution, and automated fee collection directly into your product.
            </Para>
            <Para>
              <strong>Key features:</strong>
            </Para>
            <ul className="mb-6 list-disc space-y-1.5 pl-5 font-sans text-[14px] text-[var(--text-secondary)]">
              <li>Peer-to-peer USDC escrow on Arc Testnet</li>
              <li>AI-powered dispute analysis via OpenRouter (DeepSeek → Llama → Gemini)</li>
              <li>x402 nanopayments — pay $0.001 per AI analysis</li>
              <li>Autonomous agent wallet — fees flow to your agent, not a middleman</li>
              <li>Real-time webhooks for deal state changes</li>
            </ul>
          </Section>

          <Section id="quickstart">
            <h2 className="mb-4 font-sans text-[24px] font-semibold text-[var(--text-primary)]">Quickstart</h2>
            <Para>Get an API key and make your first API call in under 2 minutes.</Para>
            <SubHeading>1. Register for an API key</SubHeading>
            <CodeBlock code={`curl -X POST https://clinch-one.vercel.app/api/dev/register \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "My App", "email": "dev@myapp.com"}'`} />
            <Para>Save the returned <InlineCode>apiKey</InlineCode> — you won't see it again.</Para>
            <SubHeading>2. Get platform metrics (no auth needed)</SubHeading>
            <CodeBlock code={`curl https://clinch-one.vercel.app/api/public/metrics`} />
            <SubHeading>3. Create an escrow deal</SubHeading>
            <CodeBlock code={`curl -X POST https://clinch-one.vercel.app/api/external/deals \\\n  -H "X-API-Key: *** \\\n  -H "Content-Type: application/json" \\\n  -d '{"partyB": "0x...", "amountA": "100", "dealType": "OneSided", "title": "Freelance Payment"}'`} />
          </Section>

          <Section id="authentication">
            <h2 className="mb-4 font-sans text-[24px] font-semibold text-[var(--text-primary)]">Authentication</h2>
            <Para>All API requests (except public endpoints and registration) require an API key passed via the <InlineCode>X-API-Key</InlineCode> header.</Para>
            <CodeBlock code={`curl -H "X-API-Key: *** https://clinch-one.vercel.app/api/external/deals/1`} />
            <Para>You can also pass the key as a query parameter:</Para>
            <CodeBlock code={`curl "https://clinch-one.vercel.app/api/external/deals/1?api_key=***`} />
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="font-sans text-[13px] text-amber-400"><strong>⚠️ Security Note:</strong> Always use the header in production. Query parameters may be logged by proxies.</p>
            </div>
          </Section>

          <Section id="api">
            <h2 className="mb-4 font-sans text-[24px] font-semibold text-[var(--text-primary)]">API Reference</h2>
            <Para>Base URL: <InlineCode>https://clinch-one.vercel.app</InlineCode></Para>
            <SubHeading>Public Endpoints</SubHeading>
            <ApiEndpoint method="GET" path="/api/public/metrics" description="Platform-wide stats: total deals, active, disputed, resolved, USDC locked" />
            <ApiEndpoint method="GET" path="/api/public/activity" description="Recent platform activity feed" />
            <SubHeading>Developer Endpoints</SubHeading>
            <ApiEndpoint method="POST" path="/api/dev/register" description="Register for an API key. Body: { name, email }" />
            <ApiEndpoint method="POST" path="/api/dev/revoke" description="Revoke an API key. Body: { apiKey }" />
            <ApiEndpoint method="POST" path="/api/dev/webhooks" description="Register a webhook URL. Auth: X-API-Key. Body: { url, events[] }" />
            <ApiEndpoint method="DELETE" path="/api/dev/webhooks" description="Remove a webhook. Auth: X-API-Key. Body: { url }" />
            <ApiEndpoint method="GET" path="/api/dev/me" description="Get developer profile + webhook configs. Auth: X-API-Key" />
            <SubHeading>External API (authenticated)</SubHeading>
            <ApiEndpoint method="POST" path="/api/external/deals" description="Create an escrow deal. Auth: X-API-Key" />
            <ApiEndpoint method="GET" path="/api/external/deals/:id" description="Get deal status and details" />
            <ApiEndpoint method="GET" path="/api/external/deals/:id/analysis" description="Get AI dispute analysis for a disputed deal" />
            <SubHeading>Agent Endpoints</SubHeading>
            <ApiEndpoint method="GET" path="/api/agent/wallet" description="Get agent wallet address and balance. Auth: JWT" />
            <ApiEndpoint method="GET" path="/api/agent/metrics" description="Agent performance metrics. Auth: JWT" />
            <ApiEndpoint method="GET" path="/api/agent/manifest" description="x402 service manifest for Circle Agent Marketplace (no auth)" />
          </Section>

          <Section id="deals">
            <h2 className="mb-4 font-sans text-[24px] font-semibold text-[var(--text-primary)]">Deals</h2>
            <Para>
              A deal represents an escrow agreement between two parties. Deals can be <InlineCode>MutualStake</InlineCode> (both parties deposit)
              or <InlineCode>OneSided</InlineCode> (only the client deposits, the worker is paid on completion).
            </Para>
            <SubHeading>Deal lifecycle</SubHeading>
            <div className="mb-6 space-y-2 font-sans text-[13px] text-[var(--text-secondary)]">
              <p><strong className="text-[var(--text-primary)]">Active</strong> → Parties fund the escrow</p>
              <p><strong className="text-[var(--text-primary)]">In Review</strong> → Votes submitted, awaiting consensus</p>
              <p><strong className="text-[var(--text-primary)]">Disputed</strong> → Parties disagree, AI analysis available</p>
              <p><strong className="text-[var(--text-primary)]">Resolved</strong> → Funds distributed, 0.25% platform fee to Agent Wallet</p>
            </div>
            <Para>
              When a deal is created, resolved, or disputed, all configured webhooks receive a real-time event.
              See the <a href="#webhooks" className="text-[var(--accent-cyan)] hover:underline">Webhooks section</a> for payload schemas.
            </Para>
          </Section>

          <Section id="disputes">
            <h2 className="mb-4 font-sans text-[24px] font-semibold text-[var(--text-primary)]">Disputes &amp; AI Analysis</h2>
            <Para>
              When deal parties disagree on the outcome, either party can raise a dispute. Clinch's AI assistant
              analyzes chat history, deal context, and vote data to recommend a fair settlement.
            </Para>
            <SubHeading>AI Analysis endpoint (x402 protected)</SubHeading>
            <Para>The <InlineCode>POST /api/disputes/:id/ai-analysis</InlineCode> endpoint requires a <InlineCode>$0.001 USDC</InlineCode> payment via the x402 protocol on Arc Testnet.</Para>
            <CodeBlock code={`// The frontend SDK handles x402 payment automatically\n// Manual curl equivalent requires x402 headers:\ncurl -X POST https://clinch-one.vercel.app/api/disputes/1/ai-analysis \\\n  -H "X-API-Key: *** \\\n  -H "Content-Type: application/json" \\\n  -H "PAYMENT-SIGNATURE: ..."    # Generated by x402 client`} />
          </Section>

          <Section id="webhooks">
            <h2 className="mb-4 font-sans text-[24px] font-semibold text-[var(--text-primary)]">Webhooks</h2>
            <Para>
              Webhooks notify your backend in real-time when deal states change. Register a URL and select which events to receive.
              Each payload is signed with an HMAC-SHA256 signature so you can verify authenticity.
            </Para>
            <SubHeading>Register a webhook</SubHeading>
            <CodeBlock code={`curl -X POST https://clinch-one.vercel.app/api/dev/webhooks \\\n  -H "X-API-Key: *** \\\n  -H "Content-Type: application/json" \\\n  -d '{"url": "https://myapp.com/webhooks/clinch", "events": ["deal.created", "deal.resolved", "dispute.raised"]}'`} />
            <SubHeading>Verify a webhook signature</SubHeading>
            <CodeBlock code={`// Node.js example\nconst crypto = require("crypto");\nconst signature = req.headers["x-clinch-signature"];\nconst payload = JSON.stringify(req.body);\nconst expected = crypto\n  .createHmac("sha256", WEBHOOK_SECRET)\n  .update(payload)\n  .digest("hex");\nif (signature !== expected) throw new Error("Invalid signature");`} />
            <SubHeading>Event payloads</SubHeading>
            <Para><strong>deal.created</strong></Para>
            <CodeBlock code={`{\n  "event": "deal.created",\n  "timestamp": "2026-07-01T12:00:00Z",\n  "data": {\n    "onChainId": 42,\n    "partyA": "0x...",\n    "partyB": "0x...",\n    "amountA": "100.00",\n    "amountB": "0.00",\n    "dealType": "OneSided"\n  }\n}`} language="json" />
            <Para><strong>deal.resolved</strong></Para>
            <CodeBlock code={`{\n  "event": "deal.resolved",\n  "timestamp": "2026-07-01T12:30:00Z",\n  "data": {\n    "onChainId": 42,\n    "winner": "PartyAWins",\n    "winnerPayout": 99.75,\n    "platformFee": 0.25\n  }\n}`} language="json" />
            <Para><strong>dispute.raised</strong></Para>
            <CodeBlock code={`{\n  "event": "dispute.raised",\n  "timestamp": "2026-07-01T12:15:00Z",\n  "data": {\n    "onChainId": 42,\n    "raisedBy": "0x...",\n    "arbitrator": "0x..."\n  }\n}`} language="json" />
          </Section>

          <Section id="agent">
            <h2 className="mb-4 font-sans text-[24px] font-semibold text-[var(--text-primary)]">Agent Wallet</h2>
            <Para>
              The Clinch Agent is an autonomous AI entity with its own Circle Programmable Wallet on Arc Testnet.
              All platform fees (0.25% per deal, 2% for disputed deals) flow directly into the agent's wallet.
            </Para>
            <SubHeading>Agent capabilities</SubHeading>
            <ul className="mb-6 list-disc space-y-1.5 pl-5 font-sans text-[14px] text-[var(--text-secondary)]">
              <li><strong>Self-funding:</strong> The agent pays for its own AI compute via x402 nanopayments</li>
              <li><strong>Auto-dispute handling:</strong> Detects stale deals and notifies admins</li>
              <li><strong>x402 service:</strong> Registered on Circle Agent Marketplace — other agents can hire it via nanopayments</li>
              <li><strong>Transparent:</strong> Wallet balance and activity visible on the dashboard</li>
            </ul>
            <SubHeading>Get agent status</SubHeading>
            <CodeBlock code={`curl -H "Authorization: Bearer *** https://clinch-one.vercel.app/api/agent/wallet\ncurl -H "Authorization: Bearer *** https://clinch-one.vercel.app/api/agent/metrics`} />
            <SubHeading>x402 service manifest</SubHeading>
            <CodeBlock code={`curl https://clinch-one.vercel.app/api/agent/manifest`} />
          </Section>

          <Section id="sdk">
            <h2 className="mb-4 font-sans text-[24px] font-semibold text-[var(--text-primary)]">SDK &amp; Libraries</h2>
            <Para>
              The <InlineCode>@clinch/sdk</InlineCode> JavaScript SDK wraps the Clinch API for Node.js and browser environments.
            </Para>
            <SubHeading>Installation</SubHeading>
            <CodeBlock code={`npm install @clinch/sdk`} language="bash" />
            <SubHeading>Usage</SubHeading>
            <CodeBlock code={`import Clinch from "@clinch/sdk";\n\nconst clinch = new Clinch({ apiKey: "*** });\n\n// Get platform metrics\nconst metrics = await clinch.getMetrics();\n\n// Create a deal\nconst deal = await clinch.createDeal({\n  partyB: "0x...",\n  amountA: "100",\n  dealType: "OneSided",\n  title: "Freelance Payment",\n});\n\n// Get AI dispute analysis\nconst analysis = await clinch.getDisputeAnalysis(deal.onChainId);\nconsole.log(analysis.recommendedOutcome); // "PartyAWins"\n\n// Get agent wallet balance\nconst agent = await clinch.getAgentWallet();\nconsole.log(agent.balance); // "0.25"`} language="javascript" />
          </Section>

          <Section id="examples">
            <h2 className="mb-4 font-sans text-[24px] font-semibold text-[var(--text-primary)]">Examples</h2>
            <SubHeading>Automated freelancer escrow</SubHeading>
            <Para>
              A platform that connects freelancers with clients can use Clinch to hold payments in escrow.
              When the work is delivered and both parties agree, funds are released. If disputed, the AI arbitrator
              analyzes chat history and recommends a settlement.
            </Para>
            <SubHeading>Agent-to-agent arbitration</SubHeading>
            <Para>
              Two AI agents on Arc can agree to use Clinch as their dispute resolver. Each agent calls
              <InlineCode>POST /api/external/deals/:id/analysis</InlineCode> via x402 — paying $0.001 USDC
              from their own wallets for the AI analysis.
            </Para>
            <SubHeading>Supply chain milestone payments</SubHeading>
            <Para>
              Use OneSided escrows for milestone-based payments. The client deposits the full amount,
              and each milestone completion triggers a partial release. The agent wallet collects the platform fee
              on each release.
            </Para>
          </Section>

          <div className="mt-16 border-t border-[var(--border-subtle)] py-8 text-center">
            <p className="font-sans text-[13px] text-[var(--text-tertiary)]">
              Questions? Join the{' '}
              <a href="https://discord.gg/rsVfYutFZg" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-cyan)] hover:underline">
                Canteen Discord
              </a>
              {' '}or check the{' '}
              <a href="https://developers.circle.com/agent-stack" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-cyan)] hover:underline">
                Circle Agent Stack docs
              </a>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
