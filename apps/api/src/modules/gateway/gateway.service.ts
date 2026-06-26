import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { db } from '../../config/db';
import { gatewayTransfers } from '../../db/schema';
import { emitToUser } from '../../socket/gateway';
import { trackAnalyticsEvent } from '../analytics/analytics.service';
import {
  CIRCLE_API_KEY,
  CIRCLE_API_URL,
  GATEWAY_API_URL,
  GATEWAY_MINTER_ADDRESS,
  GATEWAY_WALLET_ADDRESS,
  getGatewayChainByDomain,
  getGatewayChainById,
  getGatewayChainByKey,
  supportedGatewayChains,
} from './gateway.config';
import type {
  GatewayBurnIntent,
  GatewayBurnIntentSpec,
  GatewayChainConfig,
  GatewayChainKey,
  GatewayPendingDeposit,
  GatewayTimelineItem,
  GatewayTransferResponse,
  GatewayTransferStatus,
  GatewayTypedData,
  UnifiedBalanceChain,
  UnifiedBalanceResponse,
} from './gateway.types';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HEX_32_RE = /^0x[a-fA-F0-9]{64}$/;
const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const SIGNATURE_RE = /^0x[a-fA-F0-9]+$/;
const USDC_DECIMALS = 6;
const BALANCE_CACHE_MS = 10_000;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ACTIVE_TRANSFER_STATUSES: GatewayTransferStatus[] = [
  'initiated',
  'attestation_requested',
  'attested',
  'mint_submitted',
  'mint_forwarded',
  'deposit_submitted',
];

type GatewayTransferRow = typeof gatewayTransfers.$inferSelect;

type GatewayOperation = 'transfer' | 'deposit';

interface GatewayTransferMetadata {
  operation?: GatewayOperation;
  recipient?: string | null;
  sourceTxHash?: string | null;
  destinationTxHash?: string | null;
  burnIntent?: GatewayBurnIntent;
  typedData?: GatewayTypedData;
  signature?: string;
  attestation?: string;
  attestationSignature?: string;
  transferSpecHash?: string;
  fees?: GatewayTransferResponse['fees'];
  expirationBlock?: string;
  webhookEvents?: Array<Record<string, unknown>>;
  error?: string;
  [key: string]: unknown;
}

interface CircleGatewayBalanceItem {
  domain?: number | string;
  depositor?: string;
  balance?: string;
}

interface CircleGatewayBalancesResponse {
  token?: string;
  balances?: CircleGatewayBalanceItem[];
}

interface CircleGatewayPendingDepositItem {
  domain?: number | string;
  depositor?: string;
  amount?: string;
  status?: string;
  transactionHash?: string;
  txHash?: string;
  blockHeight?: string | number;
  blockHash?: string;
  blockTimestamp?: string;
}

interface CircleGatewayDepositsResponse {
  deposits?: CircleGatewayPendingDepositItem[];
}

interface CircleGatewayEstimateResponse {
  fees?: GatewayTransferResponse['fees'];
  body?: Array<{
    burnIntent?: GatewayBurnIntent;
    fees?: GatewayTransferResponse['fees'];
    transferSpecHash?: string;
  }>;
}

interface CircleGatewayTransferResponse {
  attestation?: string;
  signature?: string;
  transferId?: string;
  id?: string;
  fees?: GatewayTransferResponse['fees'];
  expirationBlock?: string;
  burnIntents?: Array<{
    transferSpecHash?: string;
    maxBlockHeight?: string;
    maxFee?: string;
  }>;
  success?: boolean;
  message?: string;
}

interface BalanceCacheEntry {
  expiresAt: number;
  response: UnifiedBalanceResponse;
}

interface GatewaySource {
  domain: number;
  depositor: string;
}

interface BalanceFetchResult {
  balances: Map<number, bigint | null>;
  partialFailure: boolean;
  allFailed: boolean;
}

interface PendingDepositGroup {
  rawAmount: bigint;
  count: number;
}

const balanceCache = new Map<string, BalanceCacheEntry>();

function assertAddress(address: string): string {
  const normalized = address.trim().toLowerCase();
  if (!ADDRESS_RE.test(normalized)) {
    throw new Error('Invalid wallet address');
  }
  return normalized;
}

function assertHex32(value: string, label: string): `0x${string}` {
  if (!HEX_32_RE.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value.toLowerCase() as `0x${string}`;
}

function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function roundUSDC(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function addressToBytes32(address: string): `0x${string}` {
  const normalized = assertAddress(address);
  return `0x${normalized.slice(2).padStart(64, '0')}` as `0x${string}`;
}

function randomBytes32(): `0x${string}` {
  return `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
}

function parseUsdcToRaw(value: string | number): bigint {
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,6})?$/.test(text)) {
    throw new Error('Amount must be a positive USDC value with at most 6 decimals');
  }

  const [whole, fraction = ''] = text.split('.');
  const raw = `${whole}${fraction.padEnd(USDC_DECIMALS, '0')}`.replace(/^0+(?=\d)/, '');
  const amount = BigInt(raw || '0');
  if (amount <= 0n) {
    throw new Error('Amount must be greater than zero');
  }
  return amount;
}

function decimalStringToRaw(value: string | number | null | undefined): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();

  if (/^\d+(\.\d{1,6})?$/.test(text)) {
    const [whole, fraction = ''] = text.split('.');
    const normalized = `${whole}${fraction.padEnd(USDC_DECIMALS, '0')}`.replace(/^0+(?=\d)/, '');
    return BigInt(normalized || '0');
  }

  return null;
}

function rawToUsdc(raw: bigint | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const value = typeof raw === 'bigint' ? raw : BigInt(raw);
  const divisor = 10n ** BigInt(USDC_DECIMALS);
  const whole = value / divisor;
  const fraction = value % divisor;
  return Number(`${whole}.${fraction.toString().padStart(USDC_DECIMALS, '0')}`);
}

function stringifyGatewayBody(value: unknown): string {
  return JSON.stringify(value, (_key, entry) =>
    typeof entry === 'bigint' ? entry.toString() : entry,
  );
}

async function gatewayPost<T>(path: string, body: unknown): Promise<T> {
  if (!CIRCLE_API_KEY) {
    throw new Error('CIRCLE_API_KEY is not configured. Add CIRCLE_API_KEY to your environment variables.');
  }

  const response = await fetch(`${GATEWAY_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CIRCLE_API_KEY}`,
    },
    body: stringifyGatewayBody(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Circle Gateway ${path} returned ${response.status}: ${detail || response.statusText}`);
  }

  return (await response.json()) as T;
}

function gatewaySources(walletAddress: string): GatewaySource[] {
  return supportedGatewayChains.map((chain) => ({
    domain: chain.domain,
    depositor: walletAddress,
  }));
}

function normalizeDomain(value: unknown, fallback?: number): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isInteger(Number(value))) {
    return Number(value);
  }
  return fallback ?? null;
}

function parseBalancesResponse(
  response: CircleGatewayBalancesResponse,
  sources: GatewaySource[],
): BalanceFetchResult {
  const balances = new Map<number, bigint | null>();
  let partialFailure = false;

  (response.balances ?? []).forEach((item, index) => {
    const source = sources[index];
    const domain = normalizeDomain(item.domain, source?.domain);
    if (domain === null) {
      partialFailure = true;
      return;
    }

    const raw = decimalStringToRaw(item.balance);
    if (raw === null) {
      partialFailure = true;
    }
    balances.set(domain, raw);
  });

  for (const source of sources) {
    if (!balances.has(source.domain)) {
      balances.set(source.domain, null);
      partialFailure = true;
    }
  }

  const allFailed = Array.from(balances.values()).every((raw) => raw === null);
  return { balances, partialFailure, allFailed };
}

async function getCircleBalancesRaw(walletAddress: string): Promise<BalanceFetchResult> {
  const sources = gatewaySources(walletAddress);

  try {
    const response = await gatewayPost<CircleGatewayBalancesResponse>('/v1/balances', {
      token: 'USDC',
      sources,
    });
    return parseBalancesResponse(response, sources);
  } catch (error) {
    console.warn('[Gateway] bulk balance fetch failed, retrying by source:', error instanceof Error ? error.message : error);
  }

  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const response = await gatewayPost<CircleGatewayBalancesResponse>('/v1/balances', {
        token: 'USDC',
        sources: [source],
      });
      return parseBalancesResponse(response, [source]);
    }),
  );

  const balances = new Map<number, bigint | null>();
  let partialFailure = false;

  settled.forEach((result, index) => {
    const domain = sources[index].domain;
    if (result.status === 'fulfilled') {
      const raw = result.value.balances.get(domain) ?? null;
      balances.set(domain, raw);
      if (result.value.partialFailure || raw === null) {
        partialFailure = true;
      }
      return;
    }

    balances.set(domain, null);
    partialFailure = true;
  });

  const allFailed = Array.from(balances.values()).every((raw) => raw === null);
  return { balances, partialFailure, allFailed };
}

function normalizePendingDeposit(
  item: CircleGatewayPendingDepositItem,
  fallbackDomain?: number,
): GatewayPendingDeposit | null {
  const domain = normalizeDomain(item.domain, fallbackDomain);
  if (domain === null || !getGatewayChainByDomain(domain)) return null;
  const depositor = typeof item.depositor === 'string' && ADDRESS_RE.test(item.depositor)
    ? item.depositor.toLowerCase()
    : '';
  const amount = typeof item.amount === 'string' ? item.amount : '0';
  const transactionHash = typeof item.transactionHash === 'string'
    ? item.transactionHash
    : typeof item.txHash === 'string'
      ? item.txHash
      : null;

  return {
    domain,
    depositor,
    amount,
    status: typeof item.status === 'string' ? item.status : 'pending',
    transactionHash,
    blockHeight: item.blockHeight === undefined ? null : String(item.blockHeight),
    blockHash: item.blockHash ?? null,
    blockTimestamp: item.blockTimestamp ?? null,
  };
}

async function getCirclePendingDeposits(walletAddress: string): Promise<GatewayPendingDeposit[]> {
  const sources = gatewaySources(walletAddress);

  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      const response = await gatewayPost<CircleGatewayDepositsResponse>('/v1/deposits', {
        token: 'USDC',
        sources: [source],
      });

      return (response.deposits ?? [])
        .map((item) => normalizePendingDeposit(item, source.domain))
        .filter((item): item is GatewayPendingDeposit => Boolean(item));
    }),
  );

  return settled.flatMap((result) => {
    if (result.status === 'fulfilled') return result.value;
    console.warn('[Gateway] pending deposits source fetch failed:', result.reason instanceof Error ? result.reason.message : result.reason);
    return [];
  });
}

function groupPendingDeposits(deposits: GatewayPendingDeposit[]): Map<number, PendingDepositGroup> {
  const groups = new Map<number, PendingDepositGroup>();
  for (const deposit of deposits) {
    const raw = decimalStringToRaw(deposit.amount);
    if (raw === null) continue;

    const current = groups.get(deposit.domain) ?? { rawAmount: 0n, count: 0 };
    groups.set(deposit.domain, {
      rawAmount: current.rawAmount + raw,
      count: current.count + 1,
    });
  }
  return groups;
}

async function estimateGatewayBurnIntent(spec: GatewayBurnIntentSpec): Promise<{
  burnIntent: GatewayBurnIntent;
  fees: GatewayTransferResponse['fees'] | null;
  expirationBlock?: string;
  transferSpecHash?: string;
}> {
  const response = await gatewayPost<CircleGatewayEstimateResponse>('/v1/estimate', [
    { spec },
  ]);

  const estimate = response.body?.[0];
  const burnIntent = estimate?.burnIntent;
  if (!burnIntent?.maxBlockHeight || !burnIntent.maxFee) {
    throw new Error('Circle Gateway estimate response was missing burn intent fee or expiration');
  }

  const normalizedBurnIntent: GatewayBurnIntent = {
    maxBlockHeight: String(burnIntent.maxBlockHeight),
    maxFee: String(burnIntent.maxFee),
    spec,
  };

  return {
    burnIntent: normalizedBurnIntent,
    fees: estimate?.fees ?? response.fees ?? null,
    expirationBlock: normalizedBurnIntent.maxBlockHeight,
    transferSpecHash: estimate?.transferSpecHash,
  };
}

function parseMetadata(row: GatewayTransferRow): GatewayTransferMetadata {
  if (!row.metadata || typeof row.metadata !== 'object') return {};
  return row.metadata as GatewayTransferMetadata;
}

function buildTimeline(
  status: GatewayTransferStatus,
  operation: GatewayOperation,
  sourceChainName: string,
  destinationChainName: string,
  timestamps: {
    createdAt?: string;
    attestedAt?: string;
    mintSubmittedAt?: string;
    completedAt?: string;
  } = {},
): GatewayTimelineItem[] {
  if (operation === 'deposit') {
    const submitted = ['deposit_submitted', 'deposit_finalized', 'completed'].includes(status);
    const finalized = ['deposit_finalized', 'completed'].includes(status);
    const failed = status === 'failed';
    return [
      {
        key: 'intent_signed',
        label: `${sourceChainName} deposit submitted`,
        status: failed ? 'failed' : submitted ? 'complete' : 'active',
        timestamp: timestamps.createdAt,
        detail: 'USDC was sent to the Circle Gateway Wallet contract',
      },
      {
        key: 'circle_finality',
        label: 'Gateway balance update',
        status: failed ? 'failed' : finalized ? 'complete' : 'active',
        timestamp: timestamps.completedAt,
        detail: 'Circle finalizes the deposit before it appears in unified balance',
      },
    ];
  }

  const signed = ['attestation_requested', 'attested', 'mint_submitted', 'mint_forwarded', 'completed'].includes(status);
  const attested = ['attested', 'mint_submitted', 'mint_forwarded', 'completed'].includes(status);
  const minted = ['mint_submitted', 'mint_forwarded', 'completed'].includes(status);
  const completed = status === 'completed';
  const failed = status === 'failed';

  return [
    {
      key: 'intent_signed',
      label: `${sourceChainName} burn intent`,
      status: failed ? 'failed' : signed ? 'complete' : 'active',
      timestamp: timestamps.createdAt,
      detail: 'Wallet signs the EIP-712 Gateway burn intent',
    },
    {
      key: 'gateway_attestation',
      label: 'Gateway attestation',
      status: failed ? 'failed' : attested ? 'complete' : signed ? 'active' : 'pending',
      timestamp: timestamps.attestedAt,
      detail: 'Circle Gateway returns the attestation and operator signature',
    },
    {
      key: 'destination_mint',
      label: `${destinationChainName} mint`,
      status: failed ? 'failed' : minted ? 'complete' : attested ? 'active' : 'pending',
      timestamp: timestamps.mintSubmittedAt,
      detail: 'Destination Gateway Minter executes gatewayMint(bytes,bytes)',
    },
    {
      key: 'circle_finality',
      label: 'Webhook finality',
      status: failed ? 'failed' : completed ? 'complete' : minted ? 'active' : 'pending',
      timestamp: timestamps.completedAt,
      detail: 'Circle webhook finalizes transfer state and balance refresh',
    },
  ];
}

function transferRowToResponse(row: GatewayTransferRow): GatewayTransferResponse {
  const metadata = parseMetadata(row);
  const operation = metadata.operation === 'deposit' ? 'deposit' : 'transfer';
  const timeline =
    Array.isArray(row.timeline) && row.timeline.length > 0
      ? (row.timeline as GatewayTimelineItem[])
      : buildTimeline(
          row.status as GatewayTransferStatus,
          operation,
          row.sourceChainName,
          row.destinationChainName,
          {
            createdAt: toIso(row.createdAt),
            completedAt: toIso(row.completedAt),
          },
        );

  return {
    id: row.id,
    walletAddress: row.walletAddress,
    sourceChainId: row.sourceChainId,
    sourceDomain: row.sourceDomain,
    sourceChainName: row.sourceChainName,
    destinationChainId: row.destinationChainId,
    destinationDomain: row.destinationDomain,
    destinationChainName: row.destinationChainName,
    amount: String(row.amount),
    status: row.status as GatewayTransferStatus,
    sourceTxHash: row.sourceTxHash || metadata.sourceTxHash || null,
    destinationTxHash: metadata.destinationTxHash || null,
    gatewayTransferId: row.gatewayTransferId || null,
    transferSpecHash: metadata.transferSpecHash || null,
    recipient: metadata.recipient || null,
    attestation: metadata.attestation || null,
    attestationSignature: metadata.attestationSignature || null,
    fees: metadata.fees || null,
    expirationBlock: metadata.expirationBlock || null,
    timeline,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
    completedAt: toIso(row.completedAt) ?? null,
  };
}

async function getActiveTransfers(walletAddress: string): Promise<GatewayTransferResponse[]> {
  try {
    const rows = await db
      .select()
      .from(gatewayTransfers)
      .where(
        and(
          eq(gatewayTransfers.walletAddress, walletAddress),
          inArray(gatewayTransfers.status, ACTIVE_TRANSFER_STATUSES),
        ),
      )
      .orderBy(desc(gatewayTransfers.updatedAt))
      .limit(20);

    return rows.map(transferRowToResponse);
  } catch {
    return [];
  }
}

async function getRecentTransfers(walletAddress: string): Promise<GatewayTransferResponse[]> {
  try {
    const rows = await db
      .select()
      .from(gatewayTransfers)
      .where(eq(gatewayTransfers.walletAddress, walletAddress))
      .orderBy(desc(gatewayTransfers.updatedAt))
      .limit(12);

    return rows.map(transferRowToResponse);
  } catch {
    return [];
  }
}

export async function getSupportedGatewayChains(): Promise<GatewayChainConfig[]> {
  return supportedGatewayChains;
}

export async function getUnifiedBalance(address: string, bypassCache = false): Promise<UnifiedBalanceResponse> {
  const walletAddress = assertAddress(address);
  const cached = balanceCache.get(walletAddress);
  if (!bypassCache && cached && cached.expiresAt > Date.now()) {
    return cached.response;
  }

  const [pendingTransfers, recentTransfers] = await Promise.all([
    getActiveTransfers(walletAddress),
    getRecentTransfers(walletAddress),
  ]);

  try {
    const [balanceResult, pendingDeposits] = await Promise.all([
      getCircleBalancesRaw(walletAddress),
      getCirclePendingDeposits(walletAddress),
    ]);
    const pendingDepositGroups = groupPendingDeposits(pendingDeposits);
    let totalRaw = 0n;
    let allBalancesResolved = true;

    const chains: UnifiedBalanceChain[] = supportedGatewayChains.map((chain) => {
      const raw = balanceResult.balances.get(chain.domain);
      const pendingDeposit = pendingDepositGroups.get(chain.domain);
      const pendingDepositAmount =
        pendingDeposit && pendingDeposit.rawAmount > 0n
          ? roundUSDC(rawToUsdc(pendingDeposit.rawAmount) ?? 0)
          : null;

      if (raw === null || raw === undefined) {
        allBalancesResolved = false;
      } else {
        totalRaw += raw;
      }

      return {
        ...chain,
        balance: raw === null || raw === undefined ? null : roundUSDC(rawToUsdc(raw) ?? 0),
        balanceRaw: raw === null || raw === undefined ? null : raw.toString(),
        syncing: raw === null || raw === undefined || Boolean(pendingDeposit?.count),
        pendingDepositAmount,
        pendingDepositCount: pendingDeposit?.count ?? 0,
      };
    });

    const response: UnifiedBalanceResponse = {
      walletAddress,
      token: 'USDC',
      totalBalance: allBalancesResolved ? roundUSDC(rawToUsdc(totalRaw) ?? 0) : null,
      totalBalanceRaw: allBalancesResolved ? totalRaw.toString() : null,
      status: allBalancesResolved ? 'available' : balanceResult.allFailed ? 'unavailable' : 'syncing',
      updatedAt: new Date().toISOString(),
      chains,
      pendingDeposits,
      pendingTransfers,
      recentTransfers,
    };

    balanceCache.set(walletAddress, {
      expiresAt: Date.now() + BALANCE_CACHE_MS,
      response,
    });

    return response;
  } catch (error) {
    console.warn('[Gateway] balance fetch failed:', error instanceof Error ? error.message : error);
    return {
      walletAddress,
      token: 'USDC',
      totalBalance: null,
      totalBalanceRaw: null,
      status: 'unavailable',
      updatedAt: new Date().toISOString(),
      chains: supportedGatewayChains.map((chain) => ({
        ...chain,
        balance: null,
        balanceRaw: null,
        syncing: true,
        pendingDepositAmount: null,
        pendingDepositCount: 0,
      })),
      pendingDeposits: [],
      pendingTransfers,
      recentTransfers,
    };
  }
}

export async function getBalanceBreakdown(address: string): Promise<UnifiedBalanceChain[]> {
  return (await getUnifiedBalance(address)).chains;
}

export async function getPendingTransfers(address: string): Promise<GatewayTransferResponse[]> {
  return getActiveTransfers(assertAddress(address));
}

export async function getCompletedTransfers(address: string): Promise<GatewayTransferResponse[]> {
  try {
    const walletAddress = assertAddress(address);
    const rows = await db
      .select()
      .from(gatewayTransfers)
      .where(
        and(
          eq(gatewayTransfers.walletAddress, walletAddress),
          inArray(gatewayTransfers.status, ['completed', 'deposit_finalized']),
        ),
      )
      .orderBy(desc(gatewayTransfers.updatedAt))
      .limit(30);

    return rows.map(transferRowToResponse);
  } catch {
    return [];
  }
}

function createTransferSpec(input: {
  sourceChain: GatewayChainConfig;
  destinationChain: GatewayChainConfig;
  walletAddress: string;
  recipient: string;
  amountRaw: bigint;
}): GatewayBurnIntentSpec {
  return {
    version: 1,
    sourceDomain: input.sourceChain.domain,
    destinationDomain: input.destinationChain.domain,
    sourceContract: addressToBytes32(GATEWAY_WALLET_ADDRESS),
    destinationContract: addressToBytes32(GATEWAY_MINTER_ADDRESS),
    sourceToken: addressToBytes32(input.sourceChain.usdcAddress),
    destinationToken: addressToBytes32(input.destinationChain.usdcAddress),
    sourceDepositor: addressToBytes32(input.walletAddress),
    destinationRecipient: addressToBytes32(input.recipient),
    sourceSigner: addressToBytes32(input.walletAddress),
    destinationCaller: addressToBytes32(ZERO_ADDRESS),
    value: input.amountRaw.toString(),
    salt: randomBytes32(),
    hookData: '0x',
  };
}

function createTypedData(burnIntent: GatewayBurnIntent): GatewayTypedData {
  return {
    domain: {
      name: 'GatewayWallet',
      version: '1',
    },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
      ],
      TransferSpec: [
        { name: 'version', type: 'uint32' },
        { name: 'sourceDomain', type: 'uint32' },
        { name: 'destinationDomain', type: 'uint32' },
        { name: 'sourceContract', type: 'bytes32' },
        { name: 'destinationContract', type: 'bytes32' },
        { name: 'sourceToken', type: 'bytes32' },
        { name: 'destinationToken', type: 'bytes32' },
        { name: 'sourceDepositor', type: 'bytes32' },
        { name: 'destinationRecipient', type: 'bytes32' },
        { name: 'sourceSigner', type: 'bytes32' },
        { name: 'destinationCaller', type: 'bytes32' },
        { name: 'value', type: 'uint256' },
        { name: 'salt', type: 'bytes32' },
        { name: 'hookData', type: 'bytes' },
      ],
      BurnIntent: [
        { name: 'maxBlockHeight', type: 'uint256' },
        { name: 'maxFee', type: 'uint256' },
        { name: 'spec', type: 'TransferSpec' },
      ],
    },
    primaryType: 'BurnIntent',
    message: burnIntent,
  };
}

export async function createGatewayDepositIntent(input: {
  walletAddress: string;
  sourceChainKey: GatewayChainKey;
  amount: string | number;
}): Promise<{
  transfer: GatewayTransferResponse;
  deposit: {
    sourceChain: GatewayChainConfig;
    amountRaw: string;
    gatewayWalletAddress: string;
    usdcAddress: string;
  };
}> {
  const walletAddress = assertAddress(input.walletAddress);
  const sourceChain = getGatewayChainByKey(input.sourceChainKey);
  if (!sourceChain) {
    throw new Error('Unsupported source chain');
  }

  const amountRaw = parseUsdcToRaw(input.amount);
  const createdAt = new Date();
  const [row] = await db
    .insert(gatewayTransfers)
    .values({
      walletAddress,
      sourceChainId: sourceChain.chainId,
      sourceDomain: sourceChain.domain,
      sourceChainName: sourceChain.chainName,
      destinationChainId: sourceChain.chainId,
      destinationDomain: sourceChain.domain,
      destinationChainName: sourceChain.chainName,
      amount: (rawToUsdc(amountRaw) ?? 0).toFixed(6),
      status: 'initiated',
      timeline: buildTimeline('initiated', 'deposit', sourceChain.chainName, sourceChain.chainName, {
        createdAt: createdAt.toISOString(),
      }),
      metadata: {
        operation: 'deposit',
      } satisfies GatewayTransferMetadata,
    })
    .returning();

  return {
    transfer: transferRowToResponse(row),
    deposit: {
      sourceChain,
      amountRaw: amountRaw.toString(),
      gatewayWalletAddress: sourceChain.walletContractAddress,
      usdcAddress: sourceChain.usdcAddress,
    },
  };
}

export async function markGatewayDepositSubmitted(input: {
  transferId: string;
  walletAddress: string;
  sourceTxHash: string;
}): Promise<GatewayTransferResponse | null> {
  const walletAddress = assertAddress(input.walletAddress);
  if (!TX_HASH_RE.test(input.sourceTxHash)) {
    throw new Error('Invalid transaction hash');
  }

  const existing = await db.query.gatewayTransfers.findFirst({
    where: and(
      eq(gatewayTransfers.id, input.transferId),
      eq(gatewayTransfers.walletAddress, walletAddress),
    ),
  });
  if (!existing) return null;

  const metadata = {
    ...parseMetadata(existing),
    operation: 'deposit',
    sourceTxHash: input.sourceTxHash,
  } satisfies GatewayTransferMetadata;
  const updatedAt = new Date();

  const [row] = await db
    .update(gatewayTransfers)
    .set({
      status: 'deposit_submitted',
      sourceTxHash: input.sourceTxHash,
      timeline: buildTimeline('deposit_submitted', 'deposit', existing.sourceChainName, existing.destinationChainName, {
        createdAt: toIso(existing.createdAt),
      }),
      metadata,
      updatedAt,
    })
    .where(eq(gatewayTransfers.id, existing.id))
    .returning();

  balanceCache.delete(walletAddress);
  emitGatewayUpdate(walletAddress, row ? transferRowToResponse(row) : null);
  return row ? transferRowToResponse(row) : null;
}

export async function createGatewayTransferIntent(input: {
  walletAddress: string;
  sourceChainKey: GatewayChainKey;
  destinationChainKey: GatewayChainKey;
  recipient?: string;
  amount: string | number;
}): Promise<{
  transfer: GatewayTransferResponse;
  typedData: GatewayTypedData;
  burnIntent: GatewayBurnIntent;
  amountRaw: string;
}> {
  const walletAddress = assertAddress(input.walletAddress);
  const recipient = input.recipient ? assertAddress(input.recipient) : walletAddress;
  const sourceChain = getGatewayChainByKey(input.sourceChainKey);
  const destinationChain = getGatewayChainByKey(input.destinationChainKey);

  if (!sourceChain || !destinationChain) {
    throw new Error('Unsupported Gateway chain');
  }
  if (sourceChain.key === destinationChain.key) {
    throw new Error('Source and destination chains must be different');
  }

  const amountRaw = parseUsdcToRaw(input.amount);
  const balanceResult = await getCircleBalancesRaw(walletAddress);
  const sourceBalanceRaw = balanceResult.balances.get(sourceChain.domain);
  if (sourceBalanceRaw === null || sourceBalanceRaw === undefined) {
    throw new Error(`${sourceChain.chainName} unified balance is syncing. Try again in a moment.`);
  }
  if (sourceBalanceRaw < amountRaw) {
    throw new Error(`Insufficient ${sourceChain.chainName} unified balance`);
  }

  const spec = createTransferSpec({
    sourceChain,
    destinationChain,
    walletAddress,
    recipient,
    amountRaw,
  });
  const estimate = await estimateGatewayBurnIntent(spec);
  const burnIntent = estimate.burnIntent;

  const typedData = createTypedData(burnIntent);
  const createdAt = new Date();
  const metadata: GatewayTransferMetadata = {
    operation: 'transfer',
    recipient,
    burnIntent,
    typedData,
    fees: estimate.fees,
    expirationBlock: estimate.expirationBlock,
    transferSpecHash: estimate.transferSpecHash,
  };

  const [row] = await db
    .insert(gatewayTransfers)
    .values({
      walletAddress,
      sourceChainId: sourceChain.chainId,
      sourceDomain: sourceChain.domain,
      sourceChainName: sourceChain.chainName,
      destinationChainId: destinationChain.chainId,
      destinationDomain: destinationChain.domain,
      destinationChainName: destinationChain.chainName,
      amount: (rawToUsdc(amountRaw) ?? 0).toFixed(6),
      status: 'initiated',
      timeline: buildTimeline('initiated', 'transfer', sourceChain.chainName, destinationChain.chainName, {
        createdAt: createdAt.toISOString(),
      }),
      metadata,
    })
    .returning();

  return {
    transfer: transferRowToResponse(row),
    typedData,
    burnIntent,
    amountRaw: amountRaw.toString(),
  };
}

export async function submitGatewayTransferSignature(input: {
  transferId: string;
  walletAddress: string;
  signature: string;
}): Promise<{
  transfer: GatewayTransferResponse;
  mint: {
    destinationChain: GatewayChainConfig;
    gatewayMinterAddress: string;
    attestation: string;
    signature: string;
  };
}> {
  const walletAddress = assertAddress(input.walletAddress);
  if (!SIGNATURE_RE.test(input.signature)) {
    throw new Error('Invalid burn intent signature');
  }

  const existing = await db.query.gatewayTransfers.findFirst({
    where: and(
      eq(gatewayTransfers.id, input.transferId),
      eq(gatewayTransfers.walletAddress, walletAddress),
    ),
  });
  if (!existing) {
    throw new Error('Transfer not found');
  }

  const metadata = parseMetadata(existing);
  if (metadata.operation === 'deposit' || !metadata.burnIntent) {
    throw new Error('Transfer has no Gateway burn intent');
  }

  const destinationChain = getGatewayChainById(existing.destinationChainId);
  if (!destinationChain) {
    throw new Error('Unsupported destination chain');
  }

  const requestedAt = new Date();
  await db
    .update(gatewayTransfers)
    .set({
      status: 'attestation_requested',
      metadata: {
        ...metadata,
        signature: input.signature,
      } satisfies GatewayTransferMetadata,
      timeline: buildTimeline('attestation_requested', 'transfer', existing.sourceChainName, existing.destinationChainName, {
        createdAt: toIso(existing.createdAt),
      }),
      updatedAt: requestedAt,
    })
    .where(eq(gatewayTransfers.id, existing.id));

  const response = await gatewayPost<CircleGatewayTransferResponse>('/v1/transfer', [
    {
      burnIntent: metadata.burnIntent,
      signature: input.signature,
    },
  ]);

  if (response.success === false) {
    throw new Error(response.message || 'Circle Gateway transfer failed');
  }

  const attestation = response.attestation;
  const attestationSignature = response.signature;
  if (!attestation || !attestationSignature) {
    throw new Error('Circle Gateway response was missing attestation or signature');
  }

  const transferSpecHash =
    response.burnIntents?.[0]?.transferSpecHash ||
    metadata.transferSpecHash ||
    undefined;
  const gatewayTransferId = response.transferId || response.id || transferSpecHash || null;
  const updatedAt = new Date();
  const nextMetadata: GatewayTransferMetadata = {
    ...metadata,
    signature: input.signature,
    attestation,
    attestationSignature,
    transferSpecHash,
    fees: response.fees ?? metadata.fees ?? null,
    expirationBlock: response.expirationBlock ?? metadata.expirationBlock,
  };

  const [row] = await db
    .update(gatewayTransfers)
    .set({
      status: 'attested',
      gatewayTransferId,
      metadata: nextMetadata,
      timeline: buildTimeline('attested', 'transfer', existing.sourceChainName, existing.destinationChainName, {
        createdAt: toIso(existing.createdAt),
        attestedAt: updatedAt.toISOString(),
      }),
      updatedAt,
    })
    .where(eq(gatewayTransfers.id, existing.id))
    .returning();

  const transfer = transferRowToResponse(row);
  emitGatewayUpdate(walletAddress, transfer);

  return {
    transfer,
    mint: {
      destinationChain,
      gatewayMinterAddress: destinationChain.minterContractAddress,
      attestation,
      signature: attestationSignature,
    },
  };
}

export async function markGatewayTransferMintSubmitted(input: {
  transferId: string;
  walletAddress: string;
  destinationTxHash: string;
}): Promise<GatewayTransferResponse | null> {
  const walletAddress = assertAddress(input.walletAddress);
  if (!TX_HASH_RE.test(input.destinationTxHash)) {
    throw new Error('Invalid transaction hash');
  }

  const existing = await db.query.gatewayTransfers.findFirst({
    where: and(
      eq(gatewayTransfers.id, input.transferId),
      eq(gatewayTransfers.walletAddress, walletAddress),
    ),
  });
  if (!existing) return null;

  const metadata = {
    ...parseMetadata(existing),
    operation: 'transfer',
    destinationTxHash: input.destinationTxHash,
  } satisfies GatewayTransferMetadata;
  const updatedAt = new Date();

  const [row] = await db
    .update(gatewayTransfers)
    .set({
      status: 'mint_submitted',
      metadata,
      timeline: buildTimeline('mint_submitted', 'transfer', existing.sourceChainName, existing.destinationChainName, {
        createdAt: toIso(existing.createdAt),
        attestedAt: toIso(existing.updatedAt),
        mintSubmittedAt: updatedAt.toISOString(),
      }),
      updatedAt,
    })
    .where(eq(gatewayTransfers.id, existing.id))
    .returning();

  balanceCache.delete(walletAddress);
  const transfer = row ? transferRowToResponse(row) : null;
  emitGatewayUpdate(walletAddress, transfer);
  return transfer;
}

export async function markGatewayTransferFailed(input: {
  transferId: string;
  walletAddress: string;
  reason: string;
}): Promise<GatewayTransferResponse | null> {
  const walletAddress = assertAddress(input.walletAddress);
  const existing = await db.query.gatewayTransfers.findFirst({
    where: and(
      eq(gatewayTransfers.id, input.transferId),
      eq(gatewayTransfers.walletAddress, walletAddress),
    ),
  });
  if (!existing) return null;

  const metadata = {
    ...parseMetadata(existing),
    error: input.reason,
  } satisfies GatewayTransferMetadata;
  const [row] = await db
    .update(gatewayTransfers)
    .set({
      status: 'failed',
      metadata,
      timeline: buildTimeline(
        'failed',
        metadata.operation === 'deposit' ? 'deposit' : 'transfer',
        existing.sourceChainName,
        existing.destinationChainName,
        { createdAt: toIso(existing.createdAt) },
      ),
      updatedAt: new Date(),
    })
    .where(eq(gatewayTransfers.id, existing.id))
    .returning();

  const transfer = row ? transferRowToResponse(row) : null;
  emitGatewayUpdate(walletAddress, transfer);
  return transfer;
}

function emitGatewayUpdate(walletAddress: string, transfer: GatewayTransferResponse | null): void {
  balanceCache.delete(walletAddress);
  emitToUser(walletAddress, 'gateway:updated', {
    walletAddress,
    transfer,
    updatedAt: new Date().toISOString(),
  });
}

function appendWebhookEvent(
  metadata: GatewayTransferMetadata,
  event: Record<string, unknown>,
): GatewayTransferMetadata {
  const events = Array.isArray(metadata.webhookEvents) ? metadata.webhookEvents.slice(-9) : [];
  return {
    ...metadata,
    webhookEvents: [...events, event],
  };
}

export async function applyGatewayWebhookEvent(input: {
  eventId?: string | null;
  notificationType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const type = input.notificationType;
  const payload = input.payload;
  const eventRecord = {
    id: input.eventId || null,
    type,
    receivedAt: new Date().toISOString(),
  };

  if (type === 'gateway.deposit.finalized') {
    await handleDepositFinalized(payload, eventRecord);
    return;
  }

  if (type === 'gateway.mint.forwarded') {
    await handleMintEvent(payload, eventRecord, 'mint_forwarded');
    return;
  }

  if (type === 'gateway.mint.finalized') {
    await handleMintEvent(payload, eventRecord, 'completed');
  }
}

export async function applyTransferWebhookEvent(input: {
  eventId?: string | null;
  notificationType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const type = input.notificationType;
  const payload = input.payload;
  const eventRecord = {
    id: input.eventId || null,
    type,
    receivedAt: new Date().toISOString(),
  };

  if (type === 'transfer.completed') {
    const wallet = getWebhookString(payload, ['walletId', 'walletAddress', 'destinationAddress']);
    const transferId = getWebhookString(payload, ['id', 'transferId']);
    const txHash = getWebhookString(payload, ['transactionHash', 'txHash']);
    const sourceChainCode = getWebhookString(payload, ['sourceChain', 'blockchain', 'chain']);
    const destinationChainCode = getWebhookString(payload, ['destinationChain', 'destinationBlockchain']);

    if (transferId) {
      const existing = await db.query.gatewayTransfers.findFirst({
        where: eq(gatewayTransfers.gatewayTransferId, transferId),
      });

      if (existing) {
        const metadata = appendWebhookEvent(
          {
            ...parseMetadata(existing),
            destinationTxHash: txHash || parseMetadata(existing).destinationTxHash,
          },
          eventRecord,
        );

        await db
          .update(gatewayTransfers)
          .set({
            status: 'completed',
            completedAt: new Date(),
            metadata,
            timeline: buildTimeline('completed', 'transfer', existing.sourceChainName, existing.destinationChainName, {
              createdAt: toIso(existing.createdAt),
              completedAt: new Date().toISOString(),
            }),
            updatedAt: new Date(),
          })
          .where(eq(gatewayTransfers.id, existing.id));

        emitGatewayUpdate(existing.walletAddress, null);
      }
    }

    if (wallet && ADDRESS_RE.test(wallet)) {
      balanceCache.delete(wallet.toLowerCase());
    }
  }

  if (type === 'transfer.failed') {
    const transferId = getWebhookString(payload, ['id', 'transferId']);
    const reason = getWebhookString(payload, ['error', 'reason', 'message']) || 'Circle transfer failed';

    if (transferId) {
      const existing = await db.query.gatewayTransfers.findFirst({
        where: eq(gatewayTransfers.gatewayTransferId, transferId),
      });

      if (existing) {
        const metadata = {
          ...parseMetadata(existing),
          error: reason,
          webhookEvents: [...(Array.isArray(parseMetadata(existing).webhookEvents) ? parseMetadata(existing).webhookEvents!.slice(-9) : []), eventRecord],
        };

        await db
          .update(gatewayTransfers)
          .set({
            status: 'failed',
            metadata,
            timeline: buildTimeline('failed', 'transfer', existing.sourceChainName, existing.destinationChainName, {
              createdAt: toIso(existing.createdAt),
            }),
            updatedAt: new Date(),
          })
          .where(eq(gatewayTransfers.id, existing.id));

        emitGatewayUpdate(existing.walletAddress, null);
      }
    }
  }
}

export async function applyTransactionWebhookEvent(input: {
  eventId?: string | null;
  notificationType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const type = input.notificationType;
  const payload = input.payload;
  const eventRecord = {
    id: input.eventId || null,
    type,
    receivedAt: new Date().toISOString(),
  };

  const txHash = getWebhookString(payload, ['transactionHash', 'txHash']);
  const wallet = getWebhookString(payload, ['walletAddress', 'from']);

  if (!txHash) return;

  const existing = await db.query.gatewayTransfers.findFirst({
    where: or(
      eq(gatewayTransfers.sourceTxHash, txHash),
      eq(gatewayTransfers.gatewayTransferId, txHash),
    ),
  });

  if (type === 'transaction.confirmed') {
    if (existing) {
      const metadata = appendWebhookEvent(parseMetadata(existing), eventRecord);
      await db
        .update(gatewayTransfers)
        .set({
          status: existing.status === 'initiated' ? 'deposit_submitted' : existing.status,
          metadata,
          updatedAt: new Date(),
        })
        .where(eq(gatewayTransfers.id, existing.id));

      emitGatewayUpdate(existing.walletAddress, null);
    }

    if (wallet && ADDRESS_RE.test(wallet)) {
      balanceCache.delete(wallet.toLowerCase());
    }
  }

  if (type === 'transaction.failed') {
    if (existing) {
      const reason = getWebhookString(payload, ['error', 'reason', 'message']) || 'Transaction failed';
      const metadata = {
        ...parseMetadata(existing),
        error: reason,
        webhookEvents: [
          ...(Array.isArray(parseMetadata(existing).webhookEvents)
            ? parseMetadata(existing).webhookEvents!.slice(-9)
            : []),
          eventRecord,
        ],
      };

      await db
        .update(gatewayTransfers)
        .set({
          status: 'failed',
          metadata,
          timeline: buildTimeline('failed', 'transfer', existing.sourceChainName, existing.destinationChainName, {
            createdAt: toIso(existing.createdAt),
          }),
          updatedAt: new Date(),
        })
        .where(eq(gatewayTransfers.id, existing.id));

      emitGatewayUpdate(existing.walletAddress, null);
    }

    if (wallet && ADDRESS_RE.test(wallet)) {
      balanceCache.delete(wallet.toLowerCase());
    }
  }
}

function getWebhookString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function getFirstAttestationValue(payload: Record<string, unknown>, key: string): string | null {
  const attestations = payload.attestations;
  if (!Array.isArray(attestations)) return null;

  for (const item of attestations) {
    if (item && typeof item === 'object') {
      const value = (item as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
  }

  return null;
}

function getWebhookNumber(payload: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

async function handleDepositFinalized(
  payload: Record<string, unknown>,
  eventRecord: Record<string, unknown>,
): Promise<void> {
  const txHash = getWebhookString(payload, ['txHash', 'transactionHash']);
  const wallet = getWebhookString(payload, ['walletAddress', 'depositor', 'sourceDepositor']);
  const domain = getWebhookNumber(payload, ['domain', 'sourceDomain']);
  const amount = getWebhookString(payload, ['amount']);
  const from = getWebhookString(payload, ['from']);
  const to = getWebhookString(payload, ['to']);
  const tokenAddress = getWebhookString(payload, ['tokenAddress']);

  if (!txHash || !TX_HASH_RE.test(txHash) || !wallet || !ADDRESS_RE.test(wallet) || domain === null) {
    return;
  }

  const walletAddress = wallet.toLowerCase();
  const chain = getGatewayChainByDomain(domain);
  if (!chain) return;

  const existing = await db.query.gatewayTransfers.findFirst({
    where: and(
      eq(gatewayTransfers.walletAddress, walletAddress),
      eq(gatewayTransfers.sourceTxHash, txHash),
    ),
  });

  const amountRaw = decimalStringToRaw(amount) ?? 0n;
  const amountValue = rawToUsdc(amountRaw)?.toFixed(6) ?? '0.000000';
  const insertMetadata: GatewayTransferMetadata = {
    operation: 'deposit',
    sourceTxHash: txHash,
    webhookEvents: [eventRecord],
    from,
    to,
    tokenAddress,
  };

  if (!existing) {
    const [row] = await db
      .insert(gatewayTransfers)
      .values({
        walletAddress,
        sourceChainId: chain.chainId,
        sourceDomain: chain.domain,
        sourceChainName: chain.chainName,
        destinationChainId: chain.chainId,
        destinationDomain: chain.domain,
        destinationChainName: chain.chainName,
        amount: amountValue,
        status: 'deposit_finalized',
        sourceTxHash: txHash,
        completedAt: new Date(),
        timeline: buildTimeline('deposit_finalized', 'deposit', chain.chainName, chain.chainName, {
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        }),
        metadata: insertMetadata,
      })
      .returning();

    trackAnalyticsEvent({
      type: 'GATEWAY_DEPOSIT_FINALIZED',
      wallet: walletAddress,
      amount: amountValue,
      metadata: { domain, chain: chain.key, txHash },
    });
    emitGatewayUpdate(walletAddress, transferRowToResponse(row));
    return;
  }

  const metadata = appendWebhookEvent(
    {
      ...parseMetadata(existing),
      operation: 'deposit',
      sourceTxHash: txHash,
      from,
      to,
      tokenAddress,
    },
    eventRecord,
  );

  const [row] = await db
    .update(gatewayTransfers)
    .set({
      status: 'deposit_finalized',
      completedAt: existing.completedAt ?? new Date(),
      metadata,
      timeline: buildTimeline('deposit_finalized', 'deposit', existing.sourceChainName, existing.destinationChainName, {
        createdAt: toIso(existing.createdAt),
        completedAt: new Date().toISOString(),
      }),
      updatedAt: new Date(),
    })
    .where(eq(gatewayTransfers.id, existing.id))
    .returning();

  trackAnalyticsEvent({
    type: 'GATEWAY_DEPOSIT_FINALIZED',
    wallet: walletAddress,
    amount: row?.amount ?? existing.amount,
    metadata: { domain, chain: chain.key, txHash },
  });
  emitGatewayUpdate(walletAddress, row ? transferRowToResponse(row) : null);
}

async function handleMintEvent(
  payload: Record<string, unknown>,
  eventRecord: Record<string, unknown>,
  nextStatus: 'mint_forwarded' | 'completed',
): Promise<void> {
  const transferId = getWebhookString(payload, ['transferId', 'id']);
  const transferSpecHash =
    getWebhookString(payload, ['transferSpecHash']) ||
    getFirstAttestationValue(payload, 'transferSpecHash');
  const txHash = getWebhookString(payload, ['transactionHash', 'txHash']);
  const wallet = getWebhookString(payload, ['recipient', 'destinationRecipient', 'walletAddress']);
  const destinationDomain = getWebhookNumber(payload, ['destinationDomain', 'domain']);

  let existing: GatewayTransferRow | undefined;
  if (transferId) {
    existing = await db.query.gatewayTransfers.findFirst({
      where: eq(gatewayTransfers.gatewayTransferId, transferId),
    });
  }

  if (!existing && transferSpecHash) {
    const recent = await db
      .select()
      .from(gatewayTransfers)
      .orderBy(desc(gatewayTransfers.updatedAt))
      .limit(100);
    existing = recent.find((row) => parseMetadata(row).transferSpecHash === transferSpecHash);
  }

  if (!existing && wallet && ADDRESS_RE.test(wallet) && destinationDomain !== null) {
    const rows = await db
      .select()
      .from(gatewayTransfers)
      .where(
        and(
          eq(gatewayTransfers.walletAddress, wallet.toLowerCase()),
          eq(gatewayTransfers.destinationDomain, destinationDomain),
        ),
      )
      .orderBy(desc(gatewayTransfers.updatedAt))
      .limit(1);
    existing = rows[0];
  }

  if (!existing) return;

  const walletAddress = existing.walletAddress.toLowerCase();
  const metadata = appendWebhookEvent(
    {
      ...parseMetadata(existing),
      operation: 'transfer',
      destinationTxHash: txHash && TX_HASH_RE.test(txHash) ? txHash : parseMetadata(existing).destinationTxHash,
      transferSpecHash: transferSpecHash || parseMetadata(existing).transferSpecHash,
    },
    eventRecord,
  );
  const completedAt = nextStatus === 'completed' ? new Date() : existing.completedAt;
  const [row] = await db
    .update(gatewayTransfers)
    .set({
      status: nextStatus,
      gatewayTransferId: transferId || existing.gatewayTransferId,
      completedAt,
      metadata,
      timeline: buildTimeline(nextStatus, 'transfer', existing.sourceChainName, existing.destinationChainName, {
        createdAt: toIso(existing.createdAt),
        attestedAt: toIso(existing.updatedAt),
        mintSubmittedAt: metadata.destinationTxHash ? new Date().toISOString() : undefined,
        completedAt: completedAt ? toIso(completedAt) : undefined,
      }),
      updatedAt: new Date(),
    })
    .where(eq(gatewayTransfers.id, existing.id))
    .returning();

  if (nextStatus === 'completed') {
    trackAnalyticsEvent({
      type: 'GATEWAY_TRANSFER_COMPLETED',
      wallet: walletAddress,
      amount: row?.amount ?? existing.amount,
      metadata: {
        sourceDomain: existing.sourceDomain,
        destinationDomain: existing.destinationDomain,
        transferId,
        transferSpecHash,
        txHash,
      },
    });
  }

  emitGatewayUpdate(walletAddress, row ? transferRowToResponse(row) : null);
}

export function getGatewayTransferCalldata(input: {
  sourceChainId: number;
  amount: string | number;
}): {
  sourceChain: GatewayChainConfig | undefined;
  amountRaw: string;
  ready: boolean;
  missing: string[];
} {
  const sourceChain = getGatewayChainById(input.sourceChainId);
  const missing: string[] = [];
  if (!sourceChain) missing.push('source chain');

  return {
    sourceChain,
    amountRaw: parseUsdcToRaw(input.amount).toString(),
    ready: missing.length === 0,
    missing,
  };
}

export async function fetchCircleNotificationPublicKey(keyId: string): Promise<string> {
  if (!CIRCLE_API_KEY) {
    throw new Error('CIRCLE_API_KEY is required for Circle webhook signature verification');
  }

  const response = await fetch(`${CIRCLE_API_URL}/v2/notifications/publicKey/${encodeURIComponent(keyId)}`, {
    headers: {
      Authorization: `Bearer ${CIRCLE_API_KEY}`,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Circle public key request failed: ${response.status} ${detail}`);
  }

  const json = (await response.json()) as { publicKey?: string; data?: { publicKey?: string } };
  const key = json.publicKey || json.data?.publicKey;
  if (!key) {
    throw new Error('Circle public key response did not include publicKey');
  }
  return key;
}

export { assertHex32 };
