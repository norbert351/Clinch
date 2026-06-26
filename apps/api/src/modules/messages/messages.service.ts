import {
  and,
  desc,
  eq,
  gt,
  ilike,
  isNull,
  lt,
  or,
} from 'drizzle-orm';
import { db, sql as pgSql } from '../../config/db';
import {
  deals,
  messageReads,
  messages,
  type Deal,
  type Message,
  type MessageSenderRole,
} from '../../db/schema';
import { config } from '../../config/env';

const MAX_MESSAGE_LENGTH = 1000;
const MAX_AI_MESSAGE_LENGTH = 300;
const MESSAGE_PAGE_SIZE = 30;
const MESSAGE_EDIT_WINDOW_MS = 2 * 60 * 1000;
const SYSTEM_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const TERMINAL_STATUSES = new Set(['Resolved', 'Cancelled', 'Expired']);
const PROMPT_INJECTION_PHRASES = [
  'ignore previous instructions',
  'system prompt',
  'act as',
  'override',
];

const walletDealLimiter = new Map<string, { timestamps: number[] }>();
const dealHourlyLimiter = new Map<string, { timestamps: number[] }>();

export interface MessageAccess {
  allowed: boolean;
  canRead: boolean;
  canWrite: boolean;
  archived: boolean;
  role?: MessageSenderRole;
  walletAddress?: string;
  deal?: Deal;
  reason?: string;
}

export interface PaginatedMessages {
  items: Message[];
  nextBefore: string | null;
  hasMore: boolean;
}

export interface AIContextMessage {
  id: string;
  senderRole: MessageSenderRole;
  isSystem: boolean;
  createdAt: string;
  content: string;
}

export type UnreadCounts = Record<number, number>;

interface UnreadCountRow {
  onChainId: number;
  unreadCount: number;
}

function normalizeWallet(address: string | null | undefined): string {
  return (address || '').trim().toLowerCase();
}

function isZeroAddress(address: string | null | undefined): boolean {
  return !address || address.toLowerCase() === ZERO_ADDRESS;
}

function getEffectiveArbitrator(deal: Deal): string {
  const dealArbitrator = normalizeWallet(deal.arbitratorWallet);
  if (dealArbitrator && !isZeroAddress(dealArbitrator)) {
    return dealArbitrator;
  }
  return normalizeWallet(config.admin.arbitrator);
}

function getPartyRole(deal: Deal, wallet: string): MessageSenderRole | null {
  if (wallet === normalizeWallet(deal.partyA)) {
    return deal.dealType === 'OneSided' ? 'client' : 'creator';
  }
  if (wallet === normalizeWallet(deal.partyB)) {
    return deal.dealType === 'OneSided' ? 'worker' : 'counterparty';
  }
  return null;
}

function sanitizeContent(content: string): string {
  return content
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function normalizeComparableContent(content: string): string {
  return content.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isRepeatedCharacterSpam(content: string): boolean {
  const compact = content.replace(/\s+/g, '');
  if (/(.)\1{14,}/.test(compact)) return true;
  if (compact.length < 12) return false;

  const counts = new Map<string, number>();
  for (const char of compact) {
    counts.set(char, (counts.get(char) || 0) + 1);
  }

  const highest = Math.max(...counts.values());
  return highest / compact.length > 0.8;
}

function assertMessageContentAllowed(content: string): void {
  if (!content || content.length > MAX_MESSAGE_LENGTH || isRepeatedCharacterSpam(content)) {
    throw new Error('Message rate limit exceeded');
  }
}

function trimLimiterWindow(
  bucket: { timestamps: number[] },
  now: number,
  windowMs: number,
): void {
  bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < windowMs);
}

function enforceRateLimit(onChainId: number, wallet: string): void {
  const now = Date.now();
  const walletDealKey = `${wallet}:${onChainId}`;
  const walletDealBucket = walletDealLimiter.get(walletDealKey) ?? { timestamps: [] };
  trimLimiterWindow(walletDealBucket, now, 10_000);

  if (walletDealBucket.timestamps.length >= 5) {
    walletDealLimiter.set(walletDealKey, walletDealBucket);
    throw new Error('Message rate limit exceeded');
  }

  const dealKey = String(onChainId);
  const dealBucket = dealHourlyLimiter.get(dealKey) ?? { timestamps: [] };
  trimLimiterWindow(dealBucket, now, 60 * 60 * 1000);

  if (dealBucket.timestamps.length >= 100) {
    dealHourlyLimiter.set(dealKey, dealBucket);
    throw new Error('Message rate limit exceeded');
  }

  walletDealBucket.timestamps.push(now);
  dealBucket.timestamps.push(now);
  walletDealLimiter.set(walletDealKey, walletDealBucket);
  dealHourlyLimiter.set(dealKey, dealBucket);
}

async function assertNotDuplicateConsecutive(
  onChainId: number,
  wallet: string,
  content: string,
): Promise<void> {
  const [lastMessage] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.onChainId, onChainId),
        eq(messages.isSystem, false),
        isNull(messages.deletedAt),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);

  if (
    lastMessage &&
    normalizeWallet(lastMessage.senderAddress) === wallet &&
    normalizeComparableContent(lastMessage.content) === normalizeComparableContent(content)
  ) {
    throw new Error('Message rate limit exceeded');
  }
}

async function getLatestMessage(onChainId: number): Promise<Message | null> {
  const [latest] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.onChainId, onChainId), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);

  return latest || null;
}

export async function validateSender(
  onChainId: number,
  walletAddress: string,
): Promise<MessageAccess> {
  const wallet = normalizeWallet(walletAddress);

  if (!wallet) {
    return {
      allowed: false,
      canRead: false,
      canWrite: false,
      archived: false,
      reason: 'Wallet is required',
    };
  }

  const deal = await db.query.deals.findFirst({
    where: eq(deals.onChainId, onChainId),
  });

  if (!deal) {
    return {
      allowed: false,
      canRead: false,
      canWrite: false,
      archived: false,
      reason: 'Deal not found',
    };
  }

  const archived = TERMINAL_STATUSES.has(deal.status);
  const partyRole = getPartyRole(deal, wallet);

  if (partyRole) {
    return {
      allowed: true,
      canRead: true,
      canWrite: !archived,
      archived,
      role: partyRole,
      walletAddress: wallet,
      deal,
    };
  }

  const effectiveArbitrator = getEffectiveArbitrator(deal);
  if (
    deal.status === 'Disputed' &&
    effectiveArbitrator &&
    wallet === effectiveArbitrator
  ) {
    return {
      allowed: true,
      canRead: true,
      canWrite: true,
      archived: false,
      role: 'arbitrator',
      walletAddress: wallet,
      deal,
    };
  }

  return {
    allowed: false,
    canRead: false,
    canWrite: false,
    archived,
    reason: 'Not authorized for this deal',
    deal,
  };
}

export async function sendMessage(input: {
  onChainId: number;
  walletAddress: string;
  content: string;
}): Promise<Message> {
  const access = await validateSender(input.onChainId, input.walletAddress);
  if (!access.allowed || !access.canWrite || !access.role || !access.walletAddress) {
    throw new Error(access.archived ? 'Deal chat is archived' : 'Not authorized for this deal');
  }

  const content = sanitizeContent(input.content);
  assertMessageContentAllowed(content);
  await assertNotDuplicateConsecutive(input.onChainId, access.walletAddress, content);
  enforceRateLimit(input.onChainId, access.walletAddress);

  const [inserted] = await db
    .insert(messages)
    .values({
      onChainId: input.onChainId,
      senderAddress: access.walletAddress,
      senderRole: access.role,
      content,
      isSystem: false,
    })
    .returning();

  return inserted;
}

export async function editMessage(input: {
  onChainId: number;
  walletAddress: string;
  messageId: string;
  content: string;
}): Promise<Message> {
  const access = await validateSender(input.onChainId, input.walletAddress);
  if (!access.allowed || !access.canWrite || !access.walletAddress || !access.deal) {
    throw new Error(access.archived ? 'Deal chat is archived' : 'Not authorized for this deal');
  }

  if (access.deal.status === 'Disputed') {
    throw new Error('Message editing is disabled during disputes');
  }

  const [existing] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.id, input.messageId),
        eq(messages.onChainId, input.onChainId),
        isNull(messages.deletedAt),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error('Message not found');
  }

  if (existing.isSystem) {
    throw new Error('System messages are immutable');
  }

  if (normalizeWallet(existing.senderAddress) !== access.walletAddress) {
    throw new Error('Only the sender can edit this message');
  }

  if (Date.now() - existing.createdAt.getTime() > MESSAGE_EDIT_WINDOW_MS) {
    throw new Error('Message edit window expired');
  }

  const content = sanitizeContent(input.content);
  assertMessageContentAllowed(content);

  const [updated] = await db
    .update(messages)
    .set({
      content,
      editedAt: new Date(),
    })
    .where(eq(messages.id, existing.id))
    .returning();

  return updated;
}

export async function getMessages(input: {
  onChainId: number;
  walletAddress: string;
  before?: string;
  limit?: number;
}): Promise<PaginatedMessages> {
  const access = await validateSender(input.onChainId, input.walletAddress);
  if (!access.allowed || !access.canRead) {
    throw new Error('Not authorized for this deal');
  }

  const limit = Math.min(Math.max(input.limit || MESSAGE_PAGE_SIZE, 1), 50);
  let cursorCondition = undefined as ReturnType<typeof or> | undefined;

  if (input.before) {
    const [cursor] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.id, input.before), eq(messages.onChainId, input.onChainId)))
      .limit(1);

    if (!cursor) {
      return { items: [], nextBefore: null, hasMore: false };
    }

    cursorCondition = or(
      lt(messages.createdAt, cursor.createdAt),
      and(eq(messages.createdAt, cursor.createdAt), lt(messages.id, cursor.id)),
    );
  }

  const conditions = [
    eq(messages.onChainId, input.onChainId),
    isNull(messages.deletedAt),
    cursorCondition,
  ].filter(Boolean) as NonNullable<typeof cursorCondition>[];

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const nextBefore = hasMore ? items[items.length - 1]?.id ?? null : null;

  return { items, nextBefore, hasMore };
}

export async function markDealMessagesRead(input: {
  onChainId: number;
  walletAddress: string;
  messageId?: string;
}): Promise<void> {
  const access = await validateSender(input.onChainId, input.walletAddress);
  if (!access.allowed || !access.canRead || !access.walletAddress) {
    throw new Error('Not authorized for this deal');
  }

  let readThroughMessage = null as Message | null;

  if (input.messageId) {
    const [message] = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.id, input.messageId),
          eq(messages.onChainId, input.onChainId),
          isNull(messages.deletedAt),
        ),
      )
      .limit(1);
    readThroughMessage = message || null;
    if (!readThroughMessage) {
      throw new Error('Message not found');
    }
  } else {
    readThroughMessage = await getLatestMessage(input.onChainId);
  }

  await db
    .insert(messageReads)
    .values({
      onChainId: input.onChainId,
      walletAddress: access.walletAddress,
      lastReadMessageId: readThroughMessage?.id ?? null,
      lastReadAt: readThroughMessage?.createdAt ?? new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [messageReads.onChainId, messageReads.walletAddress],
      set: {
        lastReadMessageId: readThroughMessage?.id ?? null,
        lastReadAt: readThroughMessage?.createdAt ?? new Date(),
        updatedAt: new Date(),
      },
    });
}

export async function getUnreadCountsForWallet(walletAddress: string): Promise<UnreadCounts> {
  const wallet = normalizeWallet(walletAddress);
  const platformArbitrator = normalizeWallet(config.admin.arbitrator);

  if (!wallet) return {};

  const rows = await pgSql<UnreadCountRow[]>`
    select
      d.on_chain_id as "onChainId",
      count(m.id)::int as "unreadCount"
    from deals d
    left join message_reads r
      on r.on_chain_id = d.on_chain_id
      and lower(r.wallet_address) = ${wallet}
    left join messages m
      on m.on_chain_id = d.on_chain_id
      and m.deleted_at is null
      and lower(m.sender_address) <> ${wallet}
      and (
        r.last_read_at is null
        or m.created_at > r.last_read_at
        or (
          m.created_at = r.last_read_at
          and (r.last_read_message_id is null or m.id > r.last_read_message_id)
        )
      )
    where
      lower(d.party_a) = ${wallet}
      or lower(d.party_b) = ${wallet}
      or (
        d.status = 'Disputed'
        and lower(
          case
            when d.arbitrator_wallet is null
              or d.arbitrator_wallet = ''
              or lower(d.arbitrator_wallet) = ${ZERO_ADDRESS}
            then ${platformArbitrator}
            else d.arbitrator_wallet
          end
        ) = ${wallet}
      )
    group by d.on_chain_id
  `;

  return rows.reduce<UnreadCounts>((acc, row) => {
    acc[Number(row.onChainId)] = Number(row.unreadCount || 0);
    return acc;
  }, {});
}

export async function postSystemMessage(
  onChainId: number,
  content: string,
): Promise<Message | null> {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.onChainId, onChainId),
  });

  if (!deal) return null;

  const sanitized = sanitizeContent(content).slice(0, MAX_MESSAGE_LENGTH);
  if (!sanitized) return null;

  const [inserted] = await db
    .insert(messages)
    .values({
      onChainId,
      senderAddress: SYSTEM_ADDRESS,
      senderRole: 'system',
      content: sanitized,
      isSystem: true,
    })
    .returning();

  return inserted;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, '$1')
    .replace(/(^|\n)\s{0,3}>\s?/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/(^|\n)\s{0,3}[-+]\s+/g, '$1')
    .replace(/(^|\n)\s{0,3}\d+\.\s+/g, '$1');
}

function stripUrls(value: string): string {
  return value.replace(/https?:\/\/\S+|www\.\S+/gi, ' ');
}

function removeRepeatedLines(value: string): string {
  const seen = new Set<string>();
  const lines = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ');
}

function containsPromptInjection(value: string): boolean {
  const lower = value.toLowerCase();
  return PROMPT_INJECTION_PHRASES.some((phrase) => lower.includes(phrase));
}

function sanitizeForAI(content: string): string | null {
  let sanitized = stripUrls(stripMarkdown(content));
  sanitized = removeRepeatedLines(sanitized);
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  if (!sanitized || isRepeatedCharacterSpam(sanitized) || containsPromptInjection(sanitized)) {
    return null;
  }

  return sanitized.slice(0, MAX_AI_MESSAGE_LENGTH);
}

export async function getMessagesForAIContext(
  onChainId: number,
  limit = 40,
): Promise<AIContextMessage[]> {
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 100);
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.onChainId, onChainId), isNull(messages.deletedAt)))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(safeLimit);

  return rows
    .reverse()
    .map((message) => {
      const content = sanitizeForAI(message.content);
      if (!content) return null;

      return {
        id: message.id,
        senderRole: message.senderRole,
        isSystem: message.isSystem,
        createdAt: message.createdAt.toISOString(),
        content,
      };
    })
    .filter((message): message is AIContextMessage => Boolean(message));
}

export async function searchMessages(input: {
  onChainId: number;
  walletAddress: string;
  query: string;
}): Promise<Message[]> {
  const access = await validateSender(input.onChainId, input.walletAddress);
  if (!access.allowed || !access.canRead) {
    throw new Error('Not authorized for this deal');
  }

  const query = input.query.trim().slice(0, 120);
  if (!query) return [];

  return db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.onChainId, input.onChainId),
        isNull(messages.deletedAt),
        ilike(messages.content, `%${query}%`),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(20);
}

export async function getMessageNotificationRecipients(
  onChainId: number,
  senderAddress: string,
): Promise<string[]> {
  const sender = normalizeWallet(senderAddress);
  const deal = await db.query.deals.findFirst({
    where: eq(deals.onChainId, onChainId),
  });

  if (!deal) return [];

  const recipients = new Set<string>();
  recipients.add(normalizeWallet(deal.partyA));
  recipients.add(normalizeWallet(deal.partyB));

  if (deal.status === 'Disputed') {
    const arbitrator = getEffectiveArbitrator(deal);
    if (arbitrator && !isZeroAddress(arbitrator)) {
      recipients.add(arbitrator);
    }
  }

  recipients.delete(sender);
  recipients.delete('');
  recipients.delete(ZERO_ADDRESS);

  return Array.from(recipients);
}
