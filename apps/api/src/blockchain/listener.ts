import { wsClient, publicClient, CONTRACT_ABI, config } from './contract';
import { getActiveDeals } from '../modules/deals/deals.service';
import { handleDealCreated } from './handlers/deal-created.handler';
import { handleDeposited } from './handlers/deposited.handler';
import { handleVoteSubmitted } from './handlers/vote-submitted.handler';
import { handleDisputed } from './handlers/disputed.handler';
import { handleResolved } from './handlers/resolved.handler';
import { handleCancelled } from './handlers/cancelled.handler';
import { handleExpired } from './handlers/expired.handler';
import { getPublicClient } from '../config/rpc';

let isListening = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000;

const hasDealCreated = CONTRACT_ABI.some(
  (item: any) => item.type === 'event' && item.name === 'DealCreated'
);
if (!hasDealCreated) {
  console.error('[Listener] CRITICAL: DealCreated not in ABI!');
}

type EscrowEventName = 
  | 'DealCreated'
  | 'Deposited'
  | 'VoteSubmitted'
  | 'Disputed'
  | 'Resolved'
  | 'Cancelled'
  | 'Expired';

const ALL_EVENTS = [
  'DealCreated',
  'Deposited',
  'VoteSubmitted',
  'Disputed',
  'Resolved',
  'Cancelled',
  'Expired',
] as const;

const ACTIVE_DEAL_EVENTS = [
  'Deposited',
  'VoteSubmitted',
  'Disputed',
  'Resolved',
  'Cancelled',
  'Expired',
] as const;

async function processEvent(event: {
  eventName: string;
  args: Record<string, unknown>;
  transactionHash: `0x${string}`;
  blockNumber: bigint;
}): Promise<void> {
  const { eventName, args, transactionHash, blockNumber } = event;

  try {
    switch (eventName) {
      case 'DealCreated':
        await handleDealCreated(
          {
            dealId: args.dealId as bigint,
            partyA: args.partyA as `0x${string}`,
            partyB: args.partyB as `0x${string}`,
            dealType: Number(args.dealType),
            amountA: args.amountA as bigint,
            amountB: args.amountB as bigint,
            arbitrator: args.arbitrator as `0x${string}`,
            feePercent: args.feePercent as bigint,
            expiryTimestamp: args.expiryTimestamp as bigint,
          },
          transactionHash,
          blockNumber
        );
        break;

      case 'Deposited':
        await handleDeposited(
          {
            dealId: args.dealId as bigint,
            party: args.party as `0x${string}`,
            amount: args.amount as bigint,
          },
          transactionHash,
          blockNumber
        );
        break;

      case 'VoteSubmitted':
        await handleVoteSubmitted(
          {
            dealId: args.dealId as bigint,
            party: args.party as `0x${string}`,
            outcome: Number(args.outcome),
          },
          transactionHash,
          blockNumber
        );
        break;

      case 'Disputed':
        await handleDisputed(
          {
            dealId: args.dealId as bigint,
            raisedBy: args.raisedBy as `0x${string}`,
          },
          transactionHash,
          blockNumber
        );
        break;

      case 'Resolved':
        await handleResolved(
          {
            dealId: args.dealId as bigint,
            winner: args.winner as `0x${string}`,
            outcome: Number(args.outcome),
          },
          transactionHash,
          blockNumber
        );
        break;

      case 'Cancelled':
        await handleCancelled(
          {
            dealId: args.dealId as bigint,
            partyA: args.partyA as `0x${string}`,
            partyB: args.partyB as `0x${string}`,
          },
          transactionHash,
          blockNumber
        );
        break;

      case 'Expired':
        await handleExpired(
          {
            dealId: args.dealId as bigint,
            partyA: args.partyA as `0x${string}`,
            partyB: args.partyB as `0x${string}`,
          },
          transactionHash,
          blockNumber
        );
        break;

      default:
        console.log(`[Listener] Unknown event: ${eventName}`);
    }
  } catch (err: any) {
    console.error(`[Listener] CRITICAL: Error processing ${eventName} event:`, err?.message || err);
  }
}

async function subscribeToAllEvents(): Promise<() => void> {
  const unwatchFns: (() => void)[] = [];

  for (const eventName of ALL_EVENTS) {
    const unwatch = wsClient.watchContractEvent({
      address: config.blockchain.contractAddress as `0x${string}`,
      abi: CONTRACT_ABI,
      eventName: eventName,
      onLogs: async (logs) => {
        for (const log of logs) {
          await processEvent({
            eventName: (log as any).eventName as string,
            args: (log as any).args as Record<string, unknown>,
            transactionHash: log.transactionHash as `0x${string}`,
            blockNumber: log.blockNumber as bigint,
          });
        }
      },
      onError: (error) => {
        console.error(`WebSocket error for ${eventName}:`, error);
        reconnect();
      },
    });
    unwatchFns.push(unwatch);
  }

  return () => unwatchFns.forEach((fn) => fn());
}

async function subscribeToActiveDeals(): Promise<void> {
  try {
    const activeDeals = await getActiveDeals();

    for (const deal of activeDeals) {
      for (const eventName of ACTIVE_DEAL_EVENTS) {
        const unwatch = wsClient.watchContractEvent({
          address: config.blockchain.contractAddress as `0x${string}`,
          abi: CONTRACT_ABI,
          eventName: eventName,
          args: {
            dealId: BigInt(deal.onChainId),
          },
          onLogs: async (logs) => {
            for (const log of logs) {
              await processEvent({
                eventName: (log as any).eventName as string,
                args: (log as any).args as Record<string, unknown>,
                transactionHash: log.transactionHash as `0x${string}`,
                blockNumber: log.blockNumber as bigint,
              });
            }
          },
          onError: (error) => {
            console.error(`WebSocket error for deal ${deal.onChainId}:`, error);
          },
        });

      }
    }
  } catch (err) {
    console.error('Error subscribing to active deals:', err);
  }
}

async function reconnect(): Promise<void> {
  if (isListening) return;

  isListening = true;
  reconnectAttempts++;

  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY);
  console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);

  await new Promise((resolve) => setTimeout(resolve, delay));

  try {
    await startListener();
    console.log('Reconnected successfully');
    reconnectAttempts = 0;
  } catch (err) {
    console.error('Reconnection failed:', err);
    isListening = false;
    reconnect();
  }
}

let unwatchAll: (() => void) | null = null;

async function backfillDeposits(): Promise<void> {
  try {
    const rpcClient = getPublicClient();
    const currentBlock = await rpcClient.getBlockNumber();
    const fromBlock = currentBlock - 5000n;

    const depositedEvent = CONTRACT_ABI.find(
      (item) => item.type === 'event' && item.name === 'Deposited'
    );
    if (!depositedEvent) {
      console.error('[Backfill] Deposited event not found in ABI');
      return;
    }

    const logs = await rpcClient.getLogs({
      address: config.blockchain.contractAddress as `0x${string}`,
      event: depositedEvent,
      fromBlock,
      toBlock: 'latest',
    });

    for (const log of logs) {
      await processEvent({
        eventName: 'Deposited',
        args: (log as any).args as Record<string, unknown>,
        transactionHash: log.transactionHash as `0x${string}`,
        blockNumber: log.blockNumber as bigint,
      });
    }
  } catch (err: any) {
    console.error('[Backfill] Error:', err?.message || err);
  }
}

export async function startListener(): Promise<void> {
  try {
    const blockNumber = await publicClient.getBlockNumber();
    console.log('[Listener] WebSocket connected. Current block:', blockNumber.toString());
  } catch (err: any) {
    console.error('[Listener] WebSocket connection FAILED:', err?.message || err);
  }

  try {
    unwatchAll = await subscribeToAllEvents();
    await subscribeToActiveDeals();
    isListening = false;
    console.log('[Listener] Blockchain event listener started successfully');

    setTimeout(async () => {
      await backfillDeposits();
    }, 3000);
  } catch (err: any) {
    console.error('[Listener] Failed to start listener:', err?.message || err);
    throw err;
  }
}

export function stopListener(): void {
  if (unwatchAll) {
    unwatchAll();
    unwatchAll = null;
  }
  console.log('Blockchain event listener stopped');
}
