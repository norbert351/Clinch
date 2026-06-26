'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Check,
  Clock3,
  Loader2,
  MessageSquareText,
  Pencil,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  Send,
  ShieldAlert,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  API_URL,
  editDealMessage,
  getDealMessages,
  getToken,
  markDealRead,
  searchMessages,
  sendDealMessage,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import type { DealType, Message, MessageSenderRole } from '@/lib/types';

type SocketState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

interface DealChatProps {
  onChainId: number;
  status: string;
  dealType: DealType;
  currentWallet?: string;
  currentRole?: Exclude<MessageSenderRole, 'system'>;
  isParticipant: boolean;
  isArbitrator: boolean;
  className?: string;
}

const EDIT_WINDOW_MS = 2 * 60 * 1000;

function normalizeWallet(address?: string): string {
  return (address || '').trim().toLowerCase();
}

function normalizeMessage(message: Message): Message {
  return { ...message, status: message.status || 'sent' };
}

function sortMessages(messages: Message[]): Message[] {
  return messages.slice().sort((a, b) => {
    const byTime = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return byTime === 0 ? a.id.localeCompare(b.id) : byTime;
  });
}

function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const message of existing) {
    byId.set(message.id, message);
  }
  for (const message of incoming) {
    byId.set(message.id, normalizeMessage(message));
  }
  return sortMessages(Array.from(byId.values()));
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getPlaceholder(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'pending') return 'Coordinate deposit timing...';
  if (normalized === 'disputed') return 'Present evidence and explain your position...';
  return 'Discuss deliverables or completion...';
}

function getArchiveMessage(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'resolved') return 'Deal completed — conversation archived';
  if (normalized === 'cancelled') return 'Deal cancelled — conversation archived';
  if (normalized === 'expired') return 'Deal expired — conversation archived';
  return 'Conversation archived';
}

function roleLabel(role: MessageSenderRole): string {
  switch (role) {
    case 'client':
      return 'Client';
    case 'worker':
      return 'Worker';
    case 'counterparty':
      return 'Counterparty';
    case 'arbitrator':
      return 'Arbitrator';
    case 'system':
      return 'Timeline';
    default:
      return 'Creator';
  }
}

export function DealChat({
  onChainId,
  status,
  dealType,
  currentWallet,
  currentRole,
  isParticipant,
  isArbitrator,
  className,
}: DealChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socketState, setSocketState] = useState<SocketState>('offline');
  const [unreadMarkerId, setUnreadMarkerId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searching, setSearching] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const token = getToken();
  const wallet = normalizeWallet(currentWallet);
  const normalizedStatus = status.toLowerCase();
  const isArchived = ['resolved', 'cancelled', 'expired'].includes(normalizedStatus);
  const isDisputed = normalizedStatus === 'disputed';
  const arbitratorVisible = isDisputed && isArbitrator;
  const canRead = Boolean(token && wallet && (isParticipant || arbitratorVisible));
  const canWrite = canRead && !isArchived;
  const placeholder = isArchived ? getArchiveMessage(status) : getPlaceholder(status);
  const senderRole: Exclude<MessageSenderRole, 'system'> =
    currentRole || (isArbitrator ? 'arbitrator' : dealType === 'OneSided' ? 'client' : 'creator');

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
  }, []);

  const isNearBottom = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return true;
    return node.scrollHeight - node.scrollTop - node.clientHeight < 96;
  }, []);

  const loadMessages = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);
    try {
      const page = await getDealMessages(onChainId);
      setMessages(sortMessages(page.items.map(normalizeMessage)));
      setNextBefore(page.nextBefore);
      setHasMore(page.hasMore);
      scrollToBottom();
    } catch {
      setError('Unable to load deal messages.');
    } finally {
      setLoading(false);
    }
  }, [canRead, onChainId, scrollToBottom]);

  useEffect(() => {
    setMessages([]);
    setNextBefore(null);
    setHasMore(false);
    setUnreadMarkerId(null);
    void loadMessages();
  }, [loadMessages]);

  const loadOlder = useCallback(async () => {
    if (!canRead || !hasMore || !nextBefore || loadingMore) return;
    const node = scrollRef.current;
    const previousHeight = node?.scrollHeight ?? 0;
    const previousTop = node?.scrollTop ?? 0;

    setLoadingMore(true);
    try {
      const page = await getDealMessages(onChainId, nextBefore);
      setMessages((current) => mergeMessages(page.items.map(normalizeMessage), current));
      setNextBefore(page.nextBefore);
      setHasMore(page.hasMore);
      requestAnimationFrame(() => {
        if (!node) return;
        node.scrollTop = node.scrollHeight - previousHeight + previousTop;
      });
    } finally {
      setLoadingMore(false);
    }
  }, [canRead, hasMore, loadingMore, nextBefore, onChainId]);

  useEffect(() => {
    if (!canRead || !token) {
      setSocketState('offline');
      return;
    }

    setSocketState('connecting');
    const socket = io(API_URL, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      auth: { token },
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 5000,
    });

    socket.on('connect', () => {
      setSocketState('connected');
      socket.emit('join-deal', { onChainId });
    });

    socket.io.on('reconnect_attempt', () => setSocketState('reconnecting'));
    socket.on('disconnect', () => setSocketState('offline'));
    socket.on('connect_error', () => setSocketState('offline'));

    socket.on('message:new', (payload: { onChainId?: number; message?: Message }) => {
      if (Number(payload?.onChainId) !== onChainId || !payload.message) return;
      const shouldStick = isNearBottom();
      const incoming = normalizeMessage(payload.message);
      setMessages((current) => {
        if (current.some((message) => message.id === incoming.id)) return current;
        const withoutMatchingTemp = current.filter((message) => {
          return !(
            message.id.startsWith('temp-') &&
            message.content === incoming.content &&
            normalizeWallet(message.senderAddress) === normalizeWallet(incoming.senderAddress)
          );
        });
        return mergeMessages(withoutMatchingTemp, [incoming]);
      });
      if (shouldStick) {
        scrollToBottom();
      } else if (normalizeWallet(incoming.senderAddress) !== wallet) {
        setUnreadMarkerId((current) => current || incoming.id);
      }
    });

    socket.on('message:updated', (payload: { onChainId?: number; message?: Message }) => {
      if (Number(payload?.onChainId) !== onChainId || !payload.message) return;
      setMessages((current) =>
        current.map((message) =>
          message.id === payload.message?.id ? normalizeMessage(payload.message) : message,
        ),
      );
    });

    return () => {
      socket.emit('leave-deal', { onChainId });
      socket.disconnect();
    };
  }, [canRead, isNearBottom, onChainId, scrollToBottom, token, wallet]);

  useEffect(() => {
    if (!canRead || messages.length === 0) return;
    const latest = messages[messages.length - 1];
    if (!latest || latest.id.startsWith('temp-')) return;

    const timeout = window.setTimeout(() => {
      void markDealRead(onChainId, latest.id).catch(() => {});
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [canRead, messages, onChainId]);

  const sendContent = useCallback(async (content: string, tempId?: string) => {
    if (!canWrite || !wallet) return;
    const clean = content.trim();
    if (!clean) return;

    const optimisticId = tempId || `temp-${Date.now()}`;
    if (!tempId) {
      setMessages((current) => [
        ...current,
        {
          id: optimisticId,
          onChainId,
          senderAddress: wallet,
          senderRole,
          content: clean,
          isSystem: false,
          editedAt: null,
          deletedAt: null,
          createdAt: new Date().toISOString(),
          status: 'sending',
        },
      ]);
      scrollToBottom();
    } else {
      setMessages((current) =>
        current.map((message) =>
          message.id === optimisticId ? { ...message, status: 'sending' } : message,
        ),
      );
    }

    try {
      const sent = normalizeMessage(await sendDealMessage(onChainId, clean));
      setMessages((current) =>
        mergeMessages(
          current.filter((message) => message.id !== optimisticId),
          [sent],
        ),
      );
      void markDealRead(onChainId, sent.id).catch(() => {});
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === optimisticId ? { ...message, status: 'failed' } : message,
        ),
      );
    }
  }, [canWrite, onChainId, scrollToBottom, senderRole, wallet]);

  const handleSend = async () => {
    const content = draft;
    setDraft('');
    await sendContent(content);
  };

  const submitEdit = async () => {
    if (!editingId || !editDraft.trim()) return;
    const content = editDraft.trim();
    try {
      const updated = normalizeMessage(await editDealMessage(onChainId, editingId, content));
      setMessages((current) =>
        current.map((message) => (message.id === updated.id ? updated : message)),
      );
      setEditingId(null);
      setEditDraft('');
    } catch {
      setError('Unable to edit message.');
    }
  };

  const runSearch = async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const results = await searchMessages(onChainId, query);
      setSearchResults(results.map(normalizeMessage));
    } finally {
      setSearching(false);
    }
  };

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    if (node.scrollTop < 48) void loadOlder();
    if (isNearBottom()) setUnreadMarkerId(null);
  };

  const socketLabel = useMemo(() => {
    if (!canRead) return 'Locked';
    if (socketState === 'connected') return 'Live';
    if (socketState === 'reconnecting' || socketState === 'connecting') return 'Syncing';
    return 'Offline';
  }, [canRead, socketState]);

  return (
    <section className={cn('border border-border-subtle bg-surface p-5', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <MessageSquareText className="h-4 w-4 text-usdc" />
            Deal communication
          </div>
          <div className="mt-1 text-xs text-text-tertiary">
            Escrow timeline #{onChainId}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-subtle bg-elevated px-2.5 py-1 text-xs text-text-secondary">
          {socketState === 'connected' ? <Wifi className="h-3.5 w-3.5 text-active" /> : <WifiOff className="h-3.5 w-3.5" />}
          {socketLabel}
        </div>
      </div>

      {isDisputed && (
        <div className="mt-4 flex items-start gap-2 border border-amber-400/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-200 light:text-amber-700">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Dispute mode is active. Messages are treated as unverified statements for arbitration context.</span>
        </div>
      )}

      {arbitratorVisible && (
        <div className="mt-3 flex items-start gap-2 border border-border-subtle bg-elevated p-3 text-xs leading-5 text-text-secondary">
          <Scale className="mt-0.5 h-4 w-4 shrink-0 text-usdc" />
          <span>Arbitrator visibility is enabled while this deal remains disputed.</span>
        </div>
      )}

      {isArchived && (
        <div className="mt-3 border border-border-subtle bg-elevated p-3 text-xs text-text-tertiary">
          {getArchiveMessage(status)}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-text-tertiary" />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runSearch();
            }}
            placeholder="Search this deal"
            disabled={!canRead}
            className="h-9 pl-9"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          disabled={!canRead || searching}
          onClick={runSearch}
          className="h-9 border border-border-subtle"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
        {searchResults.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearchResults([]);
              setSearchQuery('');
            }}
            className="h-9 border border-border-subtle"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {searchResults.length > 0 && (
        <div className="mt-3 space-y-2 border border-border-subtle bg-elevated p-3">
          {searchResults.map((message) => (
            <button
              key={message.id}
              type="button"
              onClick={() => setSearchResults([])}
              className="block w-full px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface"
            >
              <span className="font-medium text-text-primary">{roleLabel(message.senderRole)}</span>
              <span className="mx-2 text-text-tertiary">{formatTime(message.createdAt)}</span>
              <span>{message.content}</span>
            </button>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="mt-4 h-[420px] overflow-y-auto border border-border-subtle bg-void/45 p-4"
      >
        {!canRead ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-text-tertiary">
            Connect with an authorized deal wallet to view the conversation.
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-usdc" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-text-secondary">{error}</p>
            <Button type="button" variant="ghost" onClick={loadMessages} className="border border-border-subtle">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-text-tertiary">
            Deal timeline messages will appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {hasMore && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={loadingMore}
                  onClick={loadOlder}
                  className="h-8 border border-border-subtle text-xs"
                >
                  {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock3 className="h-3.5 w-3.5" />}
                  Earlier messages
                </Button>
              </div>
            )}

            {messages.map((message) => {
              const ownMessage = normalizeWallet(message.senderAddress) === wallet;
              const canEdit =
                ownMessage &&
                !message.isSystem &&
                !isArchived &&
                !isDisputed &&
                message.status === 'sent' &&
                Date.now() - new Date(message.createdAt).getTime() <= EDIT_WINDOW_MS;

              if (message.isSystem) {
                return (
                  <div key={message.id}>
                    {unreadMarkerId === message.id && (
                      <div className="my-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-usdc">
                        <span className="h-px flex-1 bg-clinch-border-default" />
                        New activity
                        <span className="h-px flex-1 bg-clinch-border-default" />
                      </div>
                    )}
                    <div className="flex justify-center">
                      <div className="inline-flex max-w-[85%] items-center gap-2 rounded-full border border-border-subtle bg-elevated px-3 py-1.5 text-center text-xs text-text-tertiary">
                        <Clock3 className="h-3.5 w-3.5 shrink-0" />
                        <span>{message.content}</span>
                        <span>{formatTime(message.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={message.id}>
                  {unreadMarkerId === message.id && (
                    <div className="my-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-usdc">
                      <span className="h-px flex-1 bg-clinch-border-default" />
                      New activity
                      <span className="h-px flex-1 bg-clinch-border-default" />
                    </div>
                  )}
                  <div className={cn('flex', ownMessage ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[82%]', ownMessage ? 'items-end' : 'items-start')}>
                      <div
                        className={cn(
                          'border px-3 py-2 text-sm leading-6',
                          ownMessage
                            ? 'border-usdc/35 bg-usdc-dim text-text-primary'
                            : 'border-border-subtle bg-surface text-text-primary',
                          message.status === 'failed' && 'border-dispute text-dispute',
                        )}
                      >
                        {editingId === message.id ? (
                          <div className="space-y-2">
                            <Textarea
                              value={editDraft}
                              onChange={(event) => setEditDraft(event.target.value.slice(0, 1000))}
                              className="min-h-20 resize-none"
                            />
                            <div className="flex justify-end gap-2">
                              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                              <Button type="button" size="sm" onClick={submitEdit}>
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          message.content
                        )}
                      </div>
                      <div className={cn('mt-1 flex items-center gap-2 text-[11px] text-text-tertiary', ownMessage && 'justify-end')}>
                        <span>{roleLabel(message.senderRole)}</span>
                        <span>{formatTime(message.createdAt)}</span>
                        {message.editedAt && <span>(edited)</span>}
                        {message.status === 'sending' && <span>sending</span>}
                        {message.status === 'failed' && (
                          <button
                            type="button"
                            onClick={() => sendContent(message.content, message.id)}
                            className="inline-flex items-center gap-1 text-dispute"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Retry
                          </button>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(message.id);
                              setEditDraft(message.content);
                            }}
                            className="inline-flex items-center gap-1 hover:text-text-secondary"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="flex gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, 1000))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={placeholder}
            disabled={!canWrite}
            className="min-h-20 flex-1 resize-none"
          />
          <Button
            type="button"
            disabled={!canWrite || !draft.trim()}
            onClick={handleSend}
            className="premium-button h-20 w-12 rounded-md"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {!canWrite && (
          <p className="mt-2 text-xs text-text-tertiary">
            {isArchived ? getArchiveMessage(status) : 'Only active deal participants can write here.'}
          </p>
        )}
      </div>
    </section>
  );
}

