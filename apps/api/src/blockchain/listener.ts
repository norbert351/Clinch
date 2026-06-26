import { CONTRACT_ABI, config } from './contract';
import { handleDealCreated } from './handlers/deal-created.handler';
import { handleDeposited } from './handlers/deposited.handler';
import { handleVoteSubmitted } from './handlers/vote-submitted.handler';
import { handleDisputed } from './handlers/disputed.handler';
import { handleResolved } from './handlers/resolved.handler';
import { handleCancelled } from './handlers/cancelled.handler';
import { handleExpired } from './handlers/expired.handler';
import { getPublicClient } from '../config/rpc';

let isShuttingDown = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastPolledBlock = 0n;
let isPolling = false;
let pollFailCount = 0;
const MAX_POLL_RETRIES = 5;
const POLL_INTERVAL = 10_000;

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

const ALL_EVENTS: EscrowEventName[] = [
  'DealCreated',
  'Deposited',
  'VoteSubmitted',
  'Disputed',
  'Resolved',
  'Cancelled',
  'Expired',
];

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

function getEventAbi(eventName: string): any {
  return CONTRACT_ABI.find(
    (item: any) => item.type === 'event' && item.name === eventName
  );
}

async function fetchAndProcessEvents(
  eventName: EscrowEventName,
  fromBlock: bigint,
  toBlock: bigint
): Promise<void> {
  const eventAbi = getEventAbi(eventName);
  if (!eventAbi) return;

  const rpcClient = getPublicClient();
  const logs = await rpcClient.getLogs({
    address: config.blockchain.contractAddress as `0x${string}`,
    event: eventAbi,
    fromBlock,
    toBlock,
  });

  for (const log of logs) {
    await processEvent({
      eventName,
      args: (log as any).args as Record<string, unknown>,
      transactionHash: log.transactionHash as `0x${string}`,
      blockNumber: log.blockNumber as bigint,
    });
  }
}

async function pollEvents(): Promise<void> {
  if (isPolling) {
    console.warn('[Listener] Previous poll still running. Skipping this cycle.');
    return;
  }

  isPolling = true;

  try {
    const rpcClient = getPublicClient();
    const currentBlock = await rpcClient.getBlockNumber();

    if (lastPolledBlock === 0n) {
      lastPolledBlock = currentBlock;
      return;
    }

    const fromBlock = lastPolledBlock + 1n;
    if (fromBlock > currentBlock) return;

    for (const eventName of ALL_EVENTS) {
      await fetchAndProcessEvents(eventName, fromBlock, currentBlock);
    }

    lastPolledBlock = currentBlock;
    pollFailCount = 0;
  } catch (err: any) {
    pollFailCount++;
    console.error(
      `[Listener] Poll error (${pollFailCount}/${MAX_POLL_RETRIES}):`,
      err?.message || err
    );
    if (pollFailCount >= MAX_POLL_RETRIES) {
      console.error('[Listener] Max poll retries reached. Will retry on next cycle.');
      pollFailCount = 0;
    }
    throw err;
  } finally {
    isPolling = false;
  }
}

async function backfillEvents(): Promise<void> {
  try {
    const rpcClient = getPublicClient();
    const currentBlock = await rpcClient.getBlockNumber();
    const fromBlock = currentBlock - 2000n > 0n ? currentBlock - 2000n : 0n;

    if (fromBlock >= currentBlock) return;

    for (const eventName of ALL_EVENTS) {
      await fetchAndProcessEvents(eventName, fromBlock, currentBlock);
    }

    lastPolledBlock = currentBlock;
  } catch (err: any) {
    console.error('[Backfill] Error:', err?.message || err);
  }
}

export async function startListener(): Promise<void> {
  if (isShuttingDown) return;

  try {
    const rpcClient = getPublicClient();
    const blockNumber = await rpcClient.getBlockNumber();
    console.log('[Listener] HTTP RPC connected. Current block:', blockNumber.toString());

    await backfillEvents();
    console.log('[Listener] Backfill complete. Starting polling...');

    if (pollTimer) {
      clearInterval(pollTimer);
    }

    pollTimer = setInterval(() => {
      pollEvents().catch(() => {});
    }, POLL_INTERVAL);

    console.log(`[Listener] Blockchain event polling started (${POLL_INTERVAL / 1000}s interval)`);
  } catch (err: any) {
    console.error('[Listener] Failed to start listener:', err?.message || err);
    if (!isShuttingDown) {
      setTimeout(startListener, 5000);
    }
  }
}

export function stopListener(): void {
  isShuttingDown = true;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  isPolling = false;
  console.log('[Listener] Blockchain event polling stopped');
}
