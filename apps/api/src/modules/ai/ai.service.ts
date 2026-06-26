import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../config/db';
import { config } from '../../config/env';
import { contractEvents, deals, deposits, disputes, messages, votes } from '../../db/schema';
import { emitDealUpdate } from '../../socket/gateway';
import { getMessagesForAIContext, type AIContextMessage } from '../messages/messages.service';
import { trackAnalyticsEvent } from '../analytics/analytics.service';

export type DisputeRecommendation = 'PartyAWins' | 'PartyBWins' | 'Split';
export type DisputeConfidence = 'High' | 'Medium' | 'Low';
export type DisputeMode = 'OneSided' | 'MutualStake';
export type AISummaryStatus = 'Pending' | 'Generated' | 'Failed';

export interface DisputeAnalysisPayload {
  analysis: string;
  creatorSummary: string;
  counterpartySummary: string;
  creatorEvidenceScore: number;
  counterpartyEvidenceScore: number;
  recommendedOutcome: DisputeRecommendation;
  confidence: DisputeConfidence;
  reasoning: string;
  keyConsiderations: string[];
  warningFlags: string[];
  disputeMode: DisputeMode;
  generatedAt: string;
}

export interface DisputeAnalysisResult {
  analysis: string;
  creatorPositionSummary: string;
  counterpartyPositionSummary: string;
  creatorScore: number;
  counterpartyScore: number;
  recommendedOutcome: 'PartyAWins' | 'PartyBWins' | 'Split';
  confidence: 'High' | 'Medium' | 'Low';
  reasoning: string;
  keyConsiderations: string[];
}

export interface DisputeAIAnalysisResponse extends DisputeAnalysisResult {
  onChainId: number;
  cached: boolean;
}

type DealRow = typeof deals.$inferSelect;
type DisputeRow = typeof disputes.$inferSelect;
type VoteRow = typeof votes.$inferSelect;
type DepositRow = typeof deposits.$inferSelect;
type ContractEventRow = typeof contractEvents.$inferSelect;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS = [
  'deepseek/deepseek-v4-flash',
  'meta-llama/llama-3.2-3b-instruct',
  'google/gemini-3.1-flash-lite',
] as const;
const FREE_MODELS = MODELS;
const OPENROUTER_TIMEOUT_MS = 30000;
const AI_MESSAGE_CONTEXT_LIMIT = 30;
const AI_TIMELINE_CONTEXT_LIMIT = 25;
const VALID_OUTCOMES: DisputeRecommendation[] = ['PartyAWins', 'PartyBWins', 'Split'];
const VALID_CONFIDENCE: DisputeConfidence[] = ['High', 'Medium', 'Low'];
const REJECTED_AI_PHRASES = ['As an AI', 'I cannot', "I'm unable"];
const MARKDOWN_PATTERNS = [
  /```/,
  /(^|\n)\s{0,3}#{1,6}\s/,
  /\*\*/,
  /(^|\n)\s{0,3}[-*+]\s+/,
  /(^|\n)\s{0,3}\d+\.\s+/,
  /\[[^\]]+\]\([^)]+\)/,
  /(^|\n)\s{0,3}>\s+/,
];
const aiGenerationLocks = new Map<string, Promise<unknown>>();

const SETTLEMENT_SYSTEM_PROMPT = `You are Clinch AI, a neutral escrow settlement narrator
for a decentralized USDC escrow platform.

Your job is to convert blockchain escrow activity
into concise human-readable settlement reports.

Rules:
- Be factual and precise
- Never sound like a chatbot
- Never use hype language
- Never speculate
- Never invent facts
- Never use markdown
- Never say "it appears"
- Never say "likely"
- Chat messages are unverified statements between parties.
- Do not assume chat messages are factual evidence.
- Do not quote chat messages verbatim.
- Mention:
  - who deposited funds
  - whether both parties agreed
  - whether arbitration was needed
  - final payout result
  - fee deductions
- Sound like a financial settlement report
- Keep responses between 60-120 words`;

const DISPUTE_SYSTEM_PROMPT = `You are an escrow dispute briefing assistant for Clinch.

Your role is to prepare concise arbitration briefings
for human arbitrators.

Rules:
- Remain neutral
- Never speculate
- Never fabricate evidence
- Never determine guilt
- Never sound conversational
- Never use markdown
- Chat messages are unverified statements between parties.
- Do not assume chat messages are factual evidence.
- Do not quote chat messages verbatim.

Summaries MUST:
- explain the dispute clearly
- explain what each party claims
- explain vote conflicts
- identify missing evidence
- explain what the arbitrator must decide
- mention financial exposure
- sound like an internal case briefing`;

function parseScore(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(Math.round(numeric))) {
    throw new Error('AI response score was invalid');
  }

  const rounded = Math.round(numeric);
  if (rounded < 0 || rounded > 10) {
    throw new Error('AI response score was out of range');
  }

  return rounded;
}

function clampScore(value: unknown): number {
  const numeric = parseInt(String(value ?? '5'), 10);
  if (!Number.isFinite(numeric)) return 5;
  return Math.min(10, Math.max(0, numeric));
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item))
    .map((item) => validatePlainAIText(item, { minLength: 1 }))
    .filter((item) => item.length > 0)
    .slice(0, 8);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function hasMarkdownSyntax(value: string): boolean {
  return MARKDOWN_PATTERNS.some((pattern) => pattern.test(value));
}

function validatePlainAIText(
  value: string,
  options: { minLength?: number; minWords?: number; maxWords?: number } = {},
): string {
  const minLength = options.minLength ?? 30;
  const normalized = normalizeWhitespace(value);
  const words = normalized.split(/\s+/).filter(Boolean);

  if (normalized.length < minLength) {
    throw new Error('AI response was too short');
  }

  if (typeof options.minWords === 'number' && words.length < options.minWords) {
    throw new Error('AI response did not meet minimum word count');
  }

  if (typeof options.maxWords === 'number' && words.length > options.maxWords) {
    throw new Error('AI response exceeded maximum word count');
  }

  const lower = normalized.toLowerCase();
  for (const phrase of REJECTED_AI_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      throw new Error(`AI response contained rejected phrase: ${phrase}`);
    }
  }

  if (hasMarkdownSyntax(value)) {
    throw new Error('AI response contained markdown syntax');
  }

  return normalized;
}

function validateOpenRouterContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length < 30) {
    throw new Error('OpenRouter response was too short');
  }

  const lower = trimmed.toLowerCase();
  for (const phrase of REJECTED_AI_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      throw new Error(`OpenRouter response contained rejected phrase: ${phrase}`);
    }
  }

  if (/```/.test(trimmed)) {
    throw new Error('OpenRouter response contained a code fence');
  }

  return trimmed;
}

function extractJson(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('AI response was empty');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error('AI response did not include JSON');
    }

    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
}

function stripJsonMarkdown(content: string): string {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseDisputeAnalysisJson(content: string): Record<string, unknown> | null {
  const stripped = stripJsonMarkdown(content);

  try {
    const parsed = JSON.parse(stripped);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    const firstBrace = stripped.indexOf('{');
    const lastBrace = stripped.lastIndexOf('}');

    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      const parsed = JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
}

function normalizeDisputeAnalysisResult(parsed: Record<string, unknown>): DisputeAnalysisResult | null {
  const recommendedOutcome = asString(parsed.recommendedOutcome);
  const confidence = asString(parsed.confidence, 'Medium');
  const analysis = asString(parsed.analysis);

  if (!analysis || !recommendedOutcome) return null;
  if (!VALID_OUTCOMES.includes(recommendedOutcome as DisputeRecommendation)) return null;

  return {
    analysis,
    creatorPositionSummary: asString(parsed.creatorPositionSummary),
    counterpartyPositionSummary: asString(parsed.counterpartyPositionSummary),
    creatorScore: clampScore(parsed.creatorScore),
    counterpartyScore: clampScore(parsed.counterpartyScore),
    recommendedOutcome: recommendedOutcome as DisputeRecommendation,
    confidence: VALID_CONFIDENCE.includes(confidence as DisputeConfidence)
      ? confidence as DisputeConfidence
      : 'Medium',
    reasoning: asString(parsed.reasoning),
    keyConsiderations: Array.isArray(parsed.keyConsiderations)
      ? parsed.keyConsiderations.map((item) => asString(item)).filter(Boolean).slice(0, 8)
      : [],
  };
}

function normalizeAnalysis(
  raw: unknown,
  disputeMode: DisputeMode,
): DisputeAnalysisPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI response JSON was not an object');
  }

  const data = raw as Record<string, unknown>;
  const recommendedOutcome = asString(data.recommendedOutcome);
  const confidence = asString(data.confidence);

  if (!VALID_OUTCOMES.includes(recommendedOutcome as DisputeRecommendation)) {
    throw new Error('AI response recommendedOutcome was invalid');
  }

  if (!VALID_CONFIDENCE.includes(confidence as DisputeConfidence)) {
    throw new Error('AI response confidence was invalid');
  }

  const analysis = validatePlainAIText(asString(data.analysis));
  const creatorSummary = validatePlainAIText(asString(data.creatorSummary), { minLength: 20 });
  const counterpartySummary = validatePlainAIText(asString(data.counterpartySummary), { minLength: 20 });
  const reasoning = validatePlainAIText(asString(data.reasoning), { minLength: 20 });

  if (!analysis || !creatorSummary || !counterpartySummary || !reasoning) {
    throw new Error('AI response omitted required narrative fields');
  }

  return {
    analysis,
    creatorSummary,
    counterpartySummary,
    creatorEvidenceScore: parseScore(data.creatorEvidenceScore),
    counterpartyEvidenceScore: parseScore(data.counterpartyEvidenceScore),
    recommendedOutcome: recommendedOutcome as DisputeRecommendation,
    confidence: confidence as DisputeConfidence,
    reasoning,
    keyConsiderations: asStringArray(data.keyConsiderations),
    warningFlags: asStringArray(data.warningFlags),
    disputeMode,
    generatedAt: new Date().toISOString(),
  };
}

function serializeRows<T extends Record<string, unknown>>(rows: T[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const output: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      output[key] = value instanceof Date ? value.toISOString() : value;
    }

    return output;
  });
}

function parseUSDCAmount(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatUSDCAmount(value: number): string {
  return value.toFixed(2);
}

function safeRecordText(value: unknown, maxWords = 24): string {
  const normalized = normalizeWhitespace(
    asString(value, 'not recorded').replace(/[`*_#>\[\]()]/g, ''),
  );
  const words = normalized.split(/\s+/).filter(Boolean);

  if (words.length <= maxWords) {
    return normalized;
  }

  return `${words.slice(0, maxWords).join(' ')}...`;
}

function sanitizeTimelineText(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
      .replace(/[`*_#>\[\]()]/g, ''),
  );
}

function summarizeMessageForAI(message: AIContextMessage): string {
  return [
    message.isSystem ? 'system' : message.senderRole,
    message.createdAt,
    sanitizeTimelineText(message.content).slice(0, 300),
  ].join(' | ');
}

function summarizeTimelineEvent(row: ContractEventRow): string {
  const payload = row.rawPayload && typeof row.rawPayload === 'object'
    ? JSON.stringify(row.rawPayload)
    : 'unavailable';
  return `${row.eventName} | ${row.indexedAt.toISOString()} | ${sanitizeTimelineText(payload).slice(0, 300)}`;
}

function summarizeDepositContext(depositRows: DepositRow[], deal: DealRow): string[] {
  return depositRows.slice(0, 20).map((deposit) => {
    const partyLabel =
      deposit.party.toLowerCase() === deal.partyA.toLowerCase()
        ? 'partyA'
        : deposit.party.toLowerCase() === deal.partyB.toLowerCase()
          ? 'partyB'
          : 'other';
    return `${partyLabel} | ${deposit.amount} | ${deposit.depositedAt?.toISOString?.() ?? 'unknown'}`;
  });
}

async function getRecentTimelineContext(onChainId: number): Promise<ContractEventRow[]> {
  return db
    .select()
    .from(contractEvents)
    .where(eq(contractEvents.onChainId, onChainId))
    .orderBy(desc(contractEvents.indexedAt))
    .limit(AI_TIMELINE_CONTEXT_LIMIT);
}

function buildChatContext(messages: AIContextMessage[]): string[] {
  return messages.slice(-AI_MESSAGE_CONTEXT_LIMIT).map(summarizeMessageForAI);
}

function getDealTotal(deal: DealRow): number {
  return parseUSDCAmount(deal.amountA) + parseUSDCAmount(deal.amountB);
}

function getDepositBreakdown(
  deal: DealRow,
  depositRows: DepositRow[],
): { partyA: number; partyB: number; total: number } {
  const partyA = depositRows
    .filter((deposit) => deposit.party.toLowerCase() === deal.partyA.toLowerCase())
    .reduce((sum, deposit) => sum + parseUSDCAmount(deposit.amount), 0);
  const partyB = depositRows
    .filter((deposit) => deposit.party.toLowerCase() === deal.partyB.toLowerCase())
    .reduce((sum, deposit) => sum + parseUSDCAmount(deposit.amount), 0);
  const total = partyA + partyB;

  return {
    partyA: partyA || parseUSDCAmount(deal.amountA),
    partyB: partyB || parseUSDCAmount(deal.amountB),
    total: total || getDealTotal(deal),
  };
}

function outcomeFromDealAndVotes(
  deal: DealRow,
  dispute: DisputeRow | null,
  voteRows: VoteRow[],
): DisputeRecommendation {
  const partyAVote = voteRows.find((vote) => vote.party.toLowerCase() === deal.partyA.toLowerCase())?.outcome;
  const partyBVote = voteRows.find((vote) => vote.party.toLowerCase() === deal.partyB.toLowerCase())?.outcome;

  if (VALID_OUTCOMES.includes(dispute?.ruling as DisputeRecommendation)) {
    return dispute!.ruling as DisputeRecommendation;
  }

  if (VALID_OUTCOMES.includes(deal.winner as DisputeRecommendation)) {
    return deal.winner as DisputeRecommendation;
  }

  if (partyAVote && partyAVote === partyBVote && VALID_OUTCOMES.includes(partyAVote as DisputeRecommendation)) {
    return partyAVote as DisputeRecommendation;
  }

  if (partyAVote && VALID_OUTCOMES.includes(partyAVote as DisputeRecommendation)) {
    return partyAVote as DisputeRecommendation;
  }

  if (partyBVote && VALID_OUTCOMES.includes(partyBVote as DisputeRecommendation)) {
    return partyBVote as DisputeRecommendation;
  }

  return deal.dealType === 'OneSided' ? 'PartyAWins' : 'Split';
}

function arbitrationOccurred(deal: DealRow, dispute: DisputeRow | null): boolean {
  return (
    deal.status === 'Disputed' ||
    Boolean(dispute) ||
    Boolean(dispute?.ruling) ||
    Boolean(dispute?.ruledAt) ||
    Boolean(dispute?.resolvedAt)
  );
}

function describeOutcome(outcome: DisputeRecommendation, deal: DealRow): string {
  if (deal.dealType === 'OneSided') {
    if (outcome === 'PartyBWins') return 'funds released to the worker';
    if (outcome === 'PartyAWins') return 'funds returned to the client';
    return 'a split settlement was recorded';
  }

  if (outcome === 'PartyAWins') return 'party A received the pool';
  if (outcome === 'PartyBWins') return 'party B received the pool';
  return 'funds were split between both parties';
}

function buildSettlementEvidenceRecord(input: {
  deal: DealRow;
  dispute: DisputeRow | null;
  voteRows: VoteRow[];
  depositRows: DepositRow[];
}): Record<string, unknown> {
  const { deal, dispute, voteRows, depositRows } = input;
  const deposits = getDepositBreakdown(deal, depositRows);
  const outcome = outcomeFromDealAndVotes(deal, dispute, voteRows);
  const feePercent = parseUSDCAmount(deal.feePercent);
  const feeAmount = parseUSDCAmount(deal.platformFee) || (deposits.total * feePercent) / 10000;
  const winnerPayout = parseUSDCAmount(deal.winnerPayout) || Math.max(deposits.total - feeAmount, 0);

  return {
    onChainId: deal.onChainId,
    status: deal.status,
    dealType: deal.dealType,
    partyA: deal.partyA,
    partyB: deal.partyB,
    amountA: deal.amountA,
    amountB: deal.amountB,
    deposits: {
      partyA: formatUSDCAmount(deposits.partyA),
      partyB: formatUSDCAmount(deposits.partyB),
      total: formatUSDCAmount(deposits.total),
    },
    dispute: dispute
      ? {
          raisedBy: dispute.raisedBy,
          reasonText: dispute.reasonText,
          ruling: dispute.ruling,
          ruledByWallet: dispute.ruledByWallet,
          ruledAt: dispute.ruledAt?.toISOString(),
          resolvedAt: dispute.resolvedAt?.toISOString(),
        }
      : null,
    votes: serializeRows(voteRows),
    outcome,
    arbitrationOccurred: arbitrationOccurred(deal, dispute),
    feePercent,
    feeAmount: formatUSDCAmount(feeAmount),
    winnerPayout: formatUSDCAmount(winnerPayout),
    outcomeDescription: describeOutcome(outcome, deal),
  };
}

function buildDisputeEvidenceRecord(input: {
  deal: DealRow;
  dispute: DisputeRow | null;
  voteRows: VoteRow[];
  depositRows: DepositRow[];
  disputeMode: DisputeMode;
}): Record<string, unknown> {
  const { deal, dispute, voteRows, depositRows, disputeMode } = input;
  const deposits = getDepositBreakdown(deal, depositRows);
  const partyAVote = voteRows.find((vote) => vote.party.toLowerCase() === deal.partyA.toLowerCase())?.outcome ?? null;
  const partyBVote = voteRows.find((vote) => vote.party.toLowerCase() === deal.partyB.toLowerCase())?.outcome ?? null;

  return {
    onChainId: deal.onChainId,
    status: deal.status,
    dealType: deal.dealType,
    disputeMode,
    partyA: deal.partyA,
    partyB: deal.partyB,
    amountA: deal.amountA,
    amountB: deal.amountB,
    deposits: {
      partyA: formatUSDCAmount(deposits.partyA),
      partyB: formatUSDCAmount(deposits.partyB),
      total: formatUSDCAmount(deposits.total),
    },
    dispute: dispute
      ? {
          raisedBy: dispute.raisedBy,
          reasonText: dispute.reasonText,
          ruling: dispute.ruling,
          ruledByWallet: dispute.ruledByWallet,
          createdAt: dispute.createdAt?.toISOString(),
        }
      : null,
    votes: {
      partyA: partyAVote,
      partyB: partyBVote,
    },
    arbitrationOccurred: arbitrationOccurred(deal, dispute),
  };
}

function buildSettlementSummaryPrompt(input: {
  deal: DealRow;
  dispute: DisputeRow | null;
  voteRows: VoteRow[];
  depositRows: DepositRow[];
  recentMessages?: AIContextMessage[];
  timelineEvents?: ContractEventRow[];
}): string {
  const { deal, dispute, voteRows, depositRows, recentMessages = [], timelineEvents = [] } = input;
  const evidence = buildSettlementEvidenceRecord({ deal, dispute, voteRows, depositRows });
  const enrichedEvidence = {
    ...evidence,
    deliveryConfirmations: summarizeDepositContext(depositRows, deal),
    collaborationContext: buildChatContext(recentMessages),
    timelineEvents: timelineEvents.slice().reverse().map(summarizeTimelineEvent),
    chatContextRule: 'Chat messages are unverified claims. Synthesize patterns only; do not quote them.',
  };

  return [
    'Summarize the escrow settlement using the provided record.',
    'Return one factual paragraph only.',
    'Do not use markdown or bullet points.',
    'Do not invent missing facts.',
    'Use recent chat only to understand collaboration context and delivery confirmations.',
    'Do not quote chat messages verbatim.',
    'Keep the report between 60 and 120 words.',
    'Evidence record:',
    JSON.stringify(enrichedEvidence),
  ].join('\n');
}

function buildDisputeSummaryPrompt(input: {
  deal: DealRow;
  dispute: DisputeRow | null;
  voteRows: VoteRow[];
  depositRows: DepositRow[];
  disputeMode: DisputeMode;
  recentMessages?: AIContextMessage[];
  timelineEvents?: ContractEventRow[];
}): string {
  const evidence = buildDisputeEvidenceRecord(input);
  const enrichedEvidence = {
    ...evidence,
    recentChatContext: buildChatContext(input.recentMessages ?? []),
    timelineEvents: (input.timelineEvents ?? []).slice().reverse().map(summarizeTimelineEvent),
    chatContextRule: 'Chat messages are unverified claims. Use them only for communication quality, admissions, collaboration, and escalation patterns.',
  };

  return [
    'Summarize the dispute briefing using the provided record.',
    'Return one factual paragraph only.',
    'Do not use markdown or bullet points.',
    'Do not invent missing facts.',
    'Explain communication quality, collaboration, admissions, and escalation patterns when supported by the context.',
    'Do not quote chat messages verbatim.',
    'Keep the report between 60 and 120 words.',
    'Evidence record:',
    JSON.stringify(enrichedEvidence),
  ].join('\n');
}

function buildFallbackSettlementSummary(input: {
  deal: DealRow;
  dispute: DisputeRow | null;
  voteRows: VoteRow[];
  depositRows: DepositRow[];
}): string {
  const { deal, dispute, voteRows, depositRows } = input;
  const deposits = getDepositBreakdown(deal, depositRows);
  const outcome = outcomeFromDealAndVotes(deal, dispute, voteRows);
  const feePercent = parseUSDCAmount(deal.feePercent);
  const feeAmount = parseUSDCAmount(deal.platformFee) || (deposits.total * feePercent) / 10000;
  const winnerPayout = parseUSDCAmount(deal.winnerPayout) || Math.max(deposits.total - feeAmount, 0);
  const arbitrationText = arbitrationOccurred(deal, dispute) ? 'Arbitration was required before settlement.' : 'No arbitration was recorded before settlement.';
  const agreementText =
    deal.dealType === 'OneSided'
      ? 'The escrow was funded by the creator side.'
      : 'Both parties had funds recorded for the agreement.';

  return [
    `Deal #${deal.onChainId} settled as ${describeOutcome(outcome, deal)}.`,
    `Recorded deposits totaled ${formatUSDCAmount(deposits.total)} USDC, with Party A at ${formatUSDCAmount(deposits.partyA)} USDC and Party B at ${formatUSDCAmount(deposits.partyB)} USDC.`,
    `${agreementText} ${arbitrationText}`,
    `The recorded fee was ${formatUSDCAmount(feeAmount)} USDC, leaving a winner payout of ${formatUSDCAmount(winnerPayout)} USDC.`,
    'This summary is derived from indexed deal, deposit, vote, and ruling records only.',
  ].join(' ');
}

function buildFallbackDisputeSummary(input: {
  deal: DealRow;
  dispute: DisputeRow | null;
  voteRows: VoteRow[];
  depositRows: DepositRow[];
  disputeMode: DisputeMode;
}): string {
  const { deal, dispute, voteRows, depositRows, disputeMode } = input;
  const deposits = getDepositBreakdown(deal, depositRows);
  const partyAVote = voteRows.find((vote) => vote.party.toLowerCase() === deal.partyA.toLowerCase())?.outcome ?? 'None';
  const partyBVote = voteRows.find((vote) => vote.party.toLowerCase() === deal.partyB.toLowerCase())?.outcome ?? 'None';
  const arbitrationText = arbitrationOccurred(deal, dispute) ? 'Arbitration is active or has been recorded.' : 'Arbitration has not been recorded yet.';

  return [
    `Deal #${deal.onChainId} is in ${deal.status.toLowerCase()} status under a ${disputeMode === 'OneSided' ? 'one-sided escrow' : 'mutual stake'} structure.`,
    `Party A deposited ${formatUSDCAmount(deposits.partyA)} USDC and Party B deposited ${formatUSDCAmount(deposits.partyB)} USDC, for ${formatUSDCAmount(deposits.total)} USDC at stake.`,
    `Party A vote: ${partyAVote}. Party B vote: ${partyBVote}.`,
    dispute?.reasonText ? `Dispute record: ${safeRecordText(dispute.reasonText)}.` : 'No dispute note was recorded in the database.',
    `${arbitrationText} The arbitrator must decide whether the indexed vote conflict, deposit record, and available dispute text support Party A, Party B, or a split outcome.`,
    'This briefing is based only on the recorded escrow evidence and does not assign fault.',
  ].join(' ');
}

function buildFallbackDisputeAnalysis(input: {
  deal: DealRow;
  dispute: DisputeRow;
  voteRows: VoteRow[];
  depositRows: DepositRow[];
  disputeMode: DisputeMode;
}): DisputeAnalysisPayload {
  const { deal, dispute, voteRows, depositRows, disputeMode } = input;
  const deposits = getDepositBreakdown(deal, depositRows);
  const partyAVote = voteRows.find((vote) => vote.party.toLowerCase() === deal.partyA.toLowerCase())?.outcome ?? null;
  const partyBVote = voteRows.find((vote) => vote.party.toLowerCase() === deal.partyB.toLowerCase())?.outcome ?? null;
  const voteConflict = partyAVote && partyBVote && partyAVote !== partyBVote;
  const creatorEvidenceScore = Math.min(10, Math.max(1, (partyAVote ? 4 : 2) + (deposits.partyA > 0 ? 2 : 0) + (dispute.raisedBy.toLowerCase() === deal.partyA.toLowerCase() ? 1 : 0)));
  const counterpartyEvidenceScore = Math.min(10, Math.max(1, (partyBVote ? 4 : 2) + (deposits.partyB > 0 ? 2 : 0) + (dispute.raisedBy.toLowerCase() === deal.partyB.toLowerCase() ? 1 : 0)));
  const recommendedOutcome = outcomeFromDealAndVotes(deal, dispute, voteRows);
  const confidence: DisputeConfidence =
    voteConflict || !dispute.reasonText ? 'Low' : creatorEvidenceScore >= 7 || counterpartyEvidenceScore >= 7 ? 'Medium' : 'Low';

  return {
    analysis: [
      `Dispute briefing for deal #${deal.onChainId}.`,
      `Party A position: ${partyAVote || 'no vote recorded'}.`,
      `Party B position: ${partyBVote || 'no vote recorded'}.`,
      dispute.reasonText ? `Recorded dispute note: ${safeRecordText(dispute.reasonText)}.` : 'No dispute note was recorded.',
      voteConflict ? 'The vote record conflicts and requires human review.' : 'The current record does not show a direct vote conflict.',
      `Financial exposure is ${formatUSDCAmount(deposits.total)} USDC.`,
    ].join(' '),
    creatorSummary: [
      `Party A has ${formatUSDCAmount(deposits.partyA)} USDC recorded on the agreement.`,
      partyAVote ? `Party A vote: ${partyAVote}.` : 'No Party A vote is recorded.',
    ].join(' '),
    counterpartySummary: [
      `Party B has ${formatUSDCAmount(deposits.partyB)} USDC recorded on the agreement.`,
      partyBVote ? `Party B vote: ${partyBVote}.` : 'No Party B vote is recorded.',
    ].join(' '),
    creatorEvidenceScore,
    counterpartyEvidenceScore,
    recommendedOutcome,
    confidence,
    reasoning: voteConflict
      ? 'The record contains conflicting votes and a human arbitrator must decide which outcome best matches the indexed evidence.'
      : 'The available record is incomplete, so the recommendation should be treated as low-confidence guidance rather than a factual finding.',
    keyConsiderations: [
      partyAVote ? `Party A vote recorded as ${partyAVote}` : 'Party A vote is missing',
      partyBVote ? `Party B vote recorded as ${partyBVote}` : 'Party B vote is missing',
      dispute.reasonText ? 'Dispute note is present' : 'Dispute note is missing',
    ],
    warningFlags: [
      voteConflict ? 'Votes conflict' : 'No direct vote conflict recorded',
      dispute.reasonText ? 'Dispute evidence is text-only' : 'Dispute evidence is sparse',
    ],
    disputeMode,
    generatedAt: new Date().toISOString(),
  };
}

function buildArbitrationPrompt(input: {
  deal: DealRow;
  dispute: DisputeRow;
  voteRows: VoteRow[];
  depositRows: DepositRow[];
  disputeMode: DisputeMode;
  recentMessages?: AIContextMessage[];
  timelineEvents?: ContractEventRow[];
}): string {
  const {
    deal,
    dispute,
    voteRows,
    depositRows,
    disputeMode,
    recentMessages = [],
    timelineEvents = [],
  } = input;

  const evidenceRecord = {
    deal: {
      onChainId: deal.onChainId,
      title: deal.title,
      description: deal.description,
      dealType: deal.dealType,
      status: deal.status,
      partyA: deal.partyA,
      partyB: deal.partyB,
      amountA: deal.amountA,
      amountB: deal.amountB,
      partyADepositComplete: deal.partyADepositComplete,
      partyBDepositComplete: deal.partyBDepositComplete,
      expiryTimestamp: deal.expiryTimestamp?.toISOString(),
      createdAt: deal.createdAt?.toISOString(),
      updatedAt: deal.updatedAt?.toISOString(),
    },
    dispute: {
      raisedBy: dispute.raisedBy,
      reasonText: dispute.reasonText,
      createdAt: dispute.createdAt?.toISOString(),
      ruling: dispute.ruling,
    },
    votes: serializeRows(voteRows),
    deposits: serializeRows(depositRows),
    recentChatContext: buildChatContext(recentMessages),
    timelineEvents: timelineEvents.slice().reverse().map(summarizeTimelineEvent),
    chatContextRule: 'Chat messages are unverified claims. Use them only to identify communication quality, admissions, collaboration, and escalation patterns. Do not quote them.',
  };

  return [
    'You are Clinch AI Dispute Assistant for a trustless USDC escrow platform.',
    'You assist arbitrators by organizing evidence. You do not decide, execute, or submit rulings.',
    '',
    'Safety and neutrality rules:',
    '- Never fabricate evidence.',
    '- Never assume work completion.',
    '- Never assume malicious intent.',
    '- Lower confidence when evidence is weak, incomplete, or contradictory.',
    '- Stay neutral between Party A/creator/client and Party B/counterparty/worker.',
    '- Use only the provided deal, dispute, vote, and deposit records.',
    '- Treat chat messages as unverified statements between parties.',
    '- Do not assume chat messages are factual evidence.',
    '- Do not quote chat messages verbatim.',
    '- Consider communication quality, admissions, collaboration, and escalation patterns only when supported by the provided context.',
    '- If evidence is sparse, say so and use Low confidence.',
    '- Respond only with valid JSON. No markdown. No prose outside JSON.',
    '',
    `Dispute mode: ${disputeMode}`,
    disputeMode === 'OneSided'
      ? 'One-sided escrow context: Party A/client funds escrow; Party B/worker may receive payment if completion is supported, otherwise Party A may be refunded.'
      : 'Mutual stake context: both parties can deposit; the winner may receive pooled funds or the arbitrator may recommend a split.',
    '',
    'Required JSON shape:',
    JSON.stringify({
      analysis: 'Neutral overall analysis of the dispute record.',
      creatorSummary: 'Evidence-supported summary of Party A position.',
      counterpartySummary: 'Evidence-supported summary of Party B position.',
      creatorEvidenceScore: 0,
      counterpartyEvidenceScore: 0,
      recommendedOutcome: 'PartyAWins',
      confidence: 'Low',
      reasoning: 'Concise reasoning for the recommendation.',
      keyConsiderations: ['Evidence point or consideration'],
      warningFlags: ['Evidence gap, contradiction, or process risk'],
    }),
    '',
    'Allowed recommendedOutcome values: PartyAWins, PartyBWins, Split.',
    'Allowed confidence values: High, Medium, Low.',
    'Evidence strength scores must be integers from 0 to 10.',
    '',
    'Evidence record:',
    JSON.stringify(evidenceRecord),
  ].join('\n');
}

interface CallOpenRouterOptions {
  systemPrompt: string;
  responseFormat?: 'json_object' | 'text';
  temperature?: number;
  validate?: (content: string) => void;
}

async function requestOpenRouterModel(
  model: string,
  prompt: string,
  options: CallOpenRouterOptions,
): Promise<string> {
  const apiKey = config.openrouter.apiKey;

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://clinch-one.vercel.app',
        'X-Title': 'Clinch Escrow Settlement AI',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: options.systemPrompt,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: options.temperature ?? 0.2,
        ...(options.responseFormat === 'json_object'
          ? { response_format: { type: 'json_object' } }
          : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`OpenRouter request failed (${response.status}): ${body.slice(0, 240)}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter response did not include message content');
    }

    const validatedContent = validateOpenRouterContent(content);
    options.validate?.(validatedContent);
    return validatedContent;
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenRouterText(
  userPrompt: string,
  systemPrompt: string,
  options: {
    responseFormat?: 'json_object' | 'text';
    temperature?: number;
    validate?: (content: string) => void;
  } = {},
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY || config.openrouter.apiKey || '';

  if (!apiKey) {
    console.warn('[AI] OPENROUTER_API_KEY not set - skipping');
    return null;
  }

  for (const model of MODELS) {
    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 400,
      temperature: options.temperature ?? 0.2,
      ...(options.responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
    };

    try {
      let response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://clinch-one.vercel.app',
          'X-Title': 'Clinch Dispute AI',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok && options.responseFormat === 'json_object') {
        response = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://clinch-one.vercel.app',
            'X-Title': 'Clinch Dispute AI',
          },
          body: JSON.stringify({
            ...body,
            response_format: undefined,
          }),
        });
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.warn(`[AI] ${model} -> HTTP ${response.status}: ${errText.slice(0, 100)}`);
        continue;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data?.choices?.[0]?.message?.content?.trim();

      if (!content || content.length < 10) {
        console.warn(`[AI] ${model} -> empty content`);
        continue;
      }

      try {
        options.validate?.(content);
      } catch (err) {
        console.warn(`[AI] ${model} -> validation failed:`, err instanceof Error ? err.message : err);
        continue;
      }

      console.log(`[AI] Success with ${model}`);
      return content;
    } catch (err: any) {
      console.warn(`[AI] ${model} threw:`, err?.message);
      continue;
    }
  }

  console.error('[AI] All models failed');
  return null;
}

export async function callOpenRouter(prompt: string, options: CallOpenRouterOptions): Promise<string> {
  const content = await callOpenRouterText(prompt, options.systemPrompt, {
    responseFormat: options.responseFormat,
    temperature: options.temperature,
    validate: options.validate,
  });

  if (!content) {
    throw new Error('All OpenRouter models failed');
  }

  return content;
}

export function rowToDisputeAIAnalysis(
  dispute: DisputeRow | null | undefined,
): DisputeAIAnalysisResponse | null {
  if (!dispute?.aiAnalysis) return null;

  const payload = typeof dispute.aiAnalysis === 'string'
    ? { analysis: dispute.aiAnalysis }
    : dispute.aiAnalysis as Partial<DisputeAnalysisPayload & DisputeAnalysisResult>;

  if (!payload.analysis || !dispute.aiRecommendedOutcome) return null;

  const recommendedOutcome = dispute.aiRecommendedOutcome;
  const confidence = dispute.aiConfidence || payload.confidence || 'Medium';

  if (
    !VALID_OUTCOMES.includes(recommendedOutcome as DisputeRecommendation) ||
    !VALID_CONFIDENCE.includes(confidence as DisputeConfidence)
  ) {
    return null;
  }

  try {
    return {
      analysis: payload.analysis,
      creatorPositionSummary:
        payload.creatorPositionSummary ||
        payload.creatorSummary ||
        '',
      counterpartyPositionSummary:
        payload.counterpartyPositionSummary ||
        payload.counterpartySummary ||
        '',
      creatorScore: clampScore(dispute.aiCreatorScore ?? payload.creatorScore ?? payload.creatorEvidenceScore),
      counterpartyScore: clampScore(
        dispute.aiCounterpartyScore ?? payload.counterpartyScore ?? payload.counterpartyEvidenceScore,
      ),
      recommendedOutcome: recommendedOutcome as DisputeRecommendation,
      confidence: confidence as DisputeConfidence,
      reasoning: payload.reasoning || '',
      keyConsiderations: Array.isArray(payload.keyConsiderations) ? payload.keyConsiderations : [],
      onChainId: dispute.onChainId,
      cached: true,
    };
  } catch {
    return null;
  }
}

export async function getCachedDisputeAnalysis(
  onChainId: number,
): Promise<DisputeAIAnalysisResponse | null> {
  const dispute = await db.query.disputes.findFirst({
    where: eq(disputes.onChainId, onChainId),
  });

  return rowToDisputeAIAnalysis(dispute);
}

async function setDealAISummaryStatus(
  onChainId: number,
  status: AISummaryStatus,
): Promise<void> {
  await db
    .update(deals)
    .set({
      aiSummaryStatus: status,
      updatedAt: new Date(),
    })
    .where(eq(deals.onChainId, onChainId));
}

async function withAiGenerationLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = aiGenerationLocks.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const promise = task().finally(() => {
    aiGenerationLocks.delete(key);
  });

  aiGenerationLocks.set(key, promise);
  return promise;
}

async function saveDealAISummary(
  onChainId: number,
  summaryKind: 'settlement' | 'dispute',
  summary: string,
): Promise<void> {
  await db
    .update(deals)
    .set({
      ...(summaryKind === 'settlement'
        ? { aiSettlementSummary: summary }
        : { aiDisputeSummary: summary }),
      aiSummaryGeneratedAt: new Date(),
      aiSummaryStatus: 'Generated',
      updatedAt: new Date(),
    })
    .where(eq(deals.onChainId, onChainId));
}

export function generateFallbackSettlementSummary(input: {
  deal: DealRow;
  dispute: DisputeRow | null;
  voteRows: VoteRow[];
  depositRows: DepositRow[];
}): string {
  return validatePlainAIText(buildFallbackSettlementSummary(input), { minWords: 60, maxWords: 120 });
}

export function generateFallbackDisputeSummary(input: {
  deal: DealRow;
  dispute: DisputeRow | null;
  voteRows: VoteRow[];
  depositRows: DepositRow[];
  disputeMode: DisputeMode;
}): string {
  return validatePlainAIText(buildFallbackDisputeSummary(input), { minWords: 60, maxWords: 120 });
}

export async function generateSettlementSummary(onChainId: number): Promise<string> {
  return withAiGenerationLock(`settlement:${onChainId}`, async () => {
    const [deal, dispute, voteRows, depositRows, recentMessages, timelineEvents] = await Promise.all([
    db.query.deals.findFirst({
      where: eq(deals.onChainId, onChainId),
    }),
    db.query.disputes.findFirst({
      where: eq(disputes.onChainId, onChainId),
    }),
    db.select().from(votes).where(eq(votes.onChainId, onChainId)),
    db.select().from(deposits).where(eq(deposits.onChainId, onChainId)),
    getMessagesForAIContext(onChainId, AI_MESSAGE_CONTEXT_LIMIT),
    getRecentTimelineContext(onChainId),
    ]);

    if (!deal) {
      throw new Error('Deal not found');
    }

    if (deal.aiSettlementSummary && deal.aiSummaryStatus === 'Generated') {
      return deal.aiSettlementSummary;
    }

    await setDealAISummaryStatus(onChainId, 'Pending');

    let summary: string;
    try {
      const prompt = buildSettlementSummaryPrompt({
        deal,
        dispute: dispute ?? null,
        voteRows,
        depositRows,
        recentMessages,
        timelineEvents,
      });
      const content = await callOpenRouter(prompt, {
        systemPrompt: SETTLEMENT_SYSTEM_PROMPT,
        responseFormat: 'text',
        temperature: 0.15,
        validate: (value) => {
          validatePlainAIText(value, { minWords: 60, maxWords: 120 });
        },
      });
      summary = validatePlainAIText(content, { minWords: 60, maxWords: 120 });
    } catch (error) {
      console.warn('[AI] Settlement summary generation failed, using fallback:', error instanceof Error ? error.message : error);
      summary = generateFallbackSettlementSummary({
        deal,
        dispute: dispute ?? null,
        voteRows,
        depositRows,
      });
    }

    await saveDealAISummary(onChainId, 'settlement', summary);
    trackAnalyticsEvent({
      type: 'AI_ANALYSIS_GENERATED',
      dealId: onChainId,
      metadata: {
        summaryType: 'settlement',
      },
    });
    emitDealUpdate(onChainId, {
      type: 'AISummaryGenerated',
      summaryType: 'settlement',
      onChainId,
    });

    return summary;
  });
}

export async function generateDisputeSummary(onChainId: number): Promise<string> {
  return withAiGenerationLock(`dispute-summary:${onChainId}`, async () => {
    const [deal, dispute, voteRows, depositRows, recentMessages, timelineEvents] = await Promise.all([
    db.query.deals.findFirst({
      where: eq(deals.onChainId, onChainId),
    }),
    db.query.disputes.findFirst({
      where: eq(disputes.onChainId, onChainId),
    }),
    db.select().from(votes).where(eq(votes.onChainId, onChainId)),
    db.select().from(deposits).where(eq(deposits.onChainId, onChainId)),
    getMessagesForAIContext(onChainId, AI_MESSAGE_CONTEXT_LIMIT),
    getRecentTimelineContext(onChainId),
    ]);

    if (!deal) {
      throw new Error('Deal not found');
    }

    if (deal.aiDisputeSummary && deal.aiSummaryStatus === 'Generated') {
      return deal.aiDisputeSummary;
    }

    const disputeMode: DisputeMode = deal.dealType === 'OneSided' ? 'OneSided' : 'MutualStake';
    await setDealAISummaryStatus(onChainId, 'Pending');

    let summary: string;
    try {
      const prompt = buildDisputeSummaryPrompt({
        deal,
        dispute: dispute ?? null,
        voteRows,
        depositRows,
        disputeMode,
        recentMessages,
        timelineEvents,
      });
      const content = await callOpenRouter(prompt, {
        systemPrompt: DISPUTE_SYSTEM_PROMPT,
        responseFormat: 'text',
        temperature: 0.15,
        validate: (value) => {
          validatePlainAIText(value, { minWords: 60, maxWords: 120 });
        },
      });
      summary = validatePlainAIText(content, { minWords: 60, maxWords: 120 });
    } catch (error) {
      console.warn('[AI] Dispute summary generation failed, using fallback:', error instanceof Error ? error.message : error);
      summary = generateFallbackDisputeSummary({
        deal,
        dispute: dispute ?? null,
        voteRows,
        depositRows,
        disputeMode,
      });
    }

    await saveDealAISummary(onChainId, 'dispute', summary);
    trackAnalyticsEvent({
      type: 'AI_ANALYSIS_GENERATED',
      dealId: onChainId,
      metadata: {
        summaryType: 'dispute',
      },
    });
    emitDealUpdate(onChainId, {
      type: 'AISummaryGenerated',
      summaryType: 'dispute',
      onChainId,
    });

    return summary;
  });
}

export async function generateDisputeAnalysis(
  onChainId: number,
): Promise<DisputeAnalysisResult | null> {
  try {
    return await withAiGenerationLock(`dispute-analysis:${onChainId}`, async () => {
      const deal = await db.query.deals.findFirst({
        where: eq(deals.onChainId, onChainId),
      });

      if (!deal) return null;

      const dispute = await db.query.disputes.findFirst({
        where: eq(disputes.onChainId, onChainId),
      });

      if (!dispute) return null;

      const cached = rowToDisputeAIAnalysis(dispute);
      if (cached?.analysis && cached.recommendedOutcome) {
        console.log('[AI Dispute] Returning cached analysis for deal:', onChainId);
        return {
          analysis: cached.analysis,
          creatorPositionSummary: '',
          counterpartyPositionSummary: '',
          creatorScore: cached.creatorScore ?? 5,
          counterpartyScore: cached.counterpartyScore ?? 5,
          recommendedOutcome: cached.recommendedOutcome,
          confidence: cached.confidence ?? 'Medium',
          reasoning: '',
          keyConsiderations: [],
        };
      }

      const voteRows = await db.select().from(votes).where(eq(votes.onChainId, onChainId));
      const partyAVote = voteRows.find((vote) => vote.party.toLowerCase() === deal.partyA.toLowerCase());
      const partyBVote = voteRows.find((vote) => vote.party.toLowerCase() === deal.partyB.toLowerCase());

      const depositRows = await db.select().from(deposits).where(eq(deposits.onChainId, onChainId));
      const totalAtStake = depositRows.reduce(
        (sum, deposit) => sum + parseFloat(String(deposit.amount || '0')),
        0,
      );

      let chatContext = '';
      try {
        const recentMessages = await db
          .select()
          .from(messages)
          .where(and(
            eq(messages.onChainId, onChainId),
            eq(messages.isSystem, false),
            isNull(messages.deletedAt),
          ))
          .orderBy(desc(messages.createdAt))
          .limit(10);

        chatContext = recentMessages
          .slice()
          .reverse()
          .map((message) => `[${message.senderRole.toUpperCase()}]: ${message.content}`)
          .join('\n');
      } catch {
        chatContext = '';
      }

      const isOneSided = deal.dealType === 'OneSided';
      const dealTypeContext = isOneSided
        ? 'One-Sided Escrow: only the creator (client) deposited. The counterparty is a worker/service provider who receives payment if work is confirmed complete.'
        : 'Mutual Stake: both parties deposited USDC. Winner receives the full pot minus the 2% platform fee.';
      const systemPrompt = 'You are a neutral AI arbitrator assistant for Clinch, a trustless USDC escrow platform on Arc Network. Analyze escrow disputes and provide structured recommendations. You must respond with ONLY valid JSON - no markdown, no preamble, no explanation outside the JSON object. Your analysis must be strictly neutral. Base recommendations only on the evidence provided. If evidence is unclear or absent, reflect that with lower scores and Low confidence.';
      const userPrompt = `Analyze this escrow dispute and return valid JSON only.

DEAL CONTEXT:
Deal ID: #${onChainId}
Type: ${dealTypeContext}
Title: ${deal.title || 'No title provided'}
Description: ${deal.description || 'No description provided'}
Total USDC at stake: ${totalAtStake.toFixed(2)} USDC
Creator (${deal.partyA.slice(0, 6)}...${deal.partyA.slice(-4)}) voted: ${partyAVote?.outcome || 'did not vote'}
Counterparty (${deal.partyB.slice(0, 6)}...${deal.partyB.slice(-4)}) voted: ${partyBVote?.outcome || 'did not vote'}
${chatContext ? `\nRECENT CHAT BETWEEN PARTIES (evidence):\n${chatContext}` : '\nNo chat messages in this deal.'}

Return ONLY a JSON object with these exact fields:
analysis, creatorPositionSummary, counterpartyPositionSummary,
creatorScore (0-10), counterpartyScore (0-10),
recommendedOutcome (PartyAWins|PartyBWins|Split),
confidence (High|Medium|Low), reasoning, keyConsiderations (array)`;

      const content = await callOpenRouterText(userPrompt, systemPrompt, {
        responseFormat: 'json_object',
        temperature: 0.2,
        validate: (value) => {
          const parsed = parseDisputeAnalysisJson(value);
          if (!parsed || !normalizeDisputeAnalysisResult(parsed)) {
            throw new Error('Invalid dispute analysis JSON');
          }
        },
      });

      if (!content) return null;

      const parsed = parseDisputeAnalysisJson(content);
      if (!parsed) return null;

      const result = normalizeDisputeAnalysisResult(parsed);
      if (!result) return null;

      await db.update(disputes)
        .set({
          aiAnalysis: result.analysis,
          aiRecommendedOutcome: result.recommendedOutcome,
          aiConfidence: result.confidence || 'Medium',
          aiCreatorScore: result.creatorScore,
          aiCounterpartyScore: result.counterpartyScore,
        } as Partial<typeof disputes.$inferInsert>)
        .where(eq(disputes.onChainId, onChainId));

      console.log(
        '[AI Dispute] Analysis saved for deal:',
        onChainId,
        '| Recommendation:',
        result.recommendedOutcome,
        '| Confidence:',
        result.confidence,
      );

      trackAnalyticsEvent({
        type: 'AI_ANALYSIS_GENERATED',
        dealId: onChainId,
        metadata: {
          summaryType: 'dispute_analysis',
          recommendedOutcome: result.recommendedOutcome,
          confidence: result.confidence,
        },
      });

      emitDealUpdate(onChainId, {
        type: 'AIAnalysisReady',
        onChainId,
        recommendedOutcome: result.recommendedOutcome,
        confidence: result.confidence,
      });

      return result;
    });
  } catch (err) {
    console.warn('[AI Dispute] Generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
