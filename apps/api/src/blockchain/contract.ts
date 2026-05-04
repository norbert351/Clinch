import { config } from '../config/env';
import { getPublicClient, getWsClient, getCurrentRpc, getCurrentWsRpc } from '../config/rpc';

export { config };

export const PLATFORM_ARBITRATOR = process.env.PLATFORM_ARBITRATOR || '0xdd4c983Cd57Ee7A6F8Ef0BbB8715B19bdF5C1b61';

export const CONTRACT_ABI = [
  {
    type: 'function',
    name: 'getDeal',
    inputs: [{ name: '_dealId', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      { name: '_partyA', type: 'address', internalType: 'address' },
      { name: '_partyB', type: 'address', internalType: 'address' },
      { name: '_dealType', type: 'uint8', internalType: 'enum DealType' },
      { name: '_status', type: 'uint8', internalType: 'enum DealStatus' },
      { name: '_partyAAmount', type: 'uint256', internalType: 'uint256' },
      { name: '_partyBAmount', type: 'uint256', internalType: 'uint256' },
      { name: '_partyADeposited', type: 'uint256', internalType: 'uint256' },
      { name: '_partyBDeposited', type: 'uint256', internalType: 'uint256' },
      { name: '_feePercent', type: 'uint256', internalType: 'uint256' },
      { name: '_arbitrator', type: 'address', internalType: 'address' },
      { name: '_createdAt', type: 'uint256', internalType: 'uint256' }
],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getDealExpiry',
    inputs: [{ name: '_dealId', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '_expiryTimestamp', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'hasDeposited',
    inputs: [
      { name: '_dealId', type: 'uint256', internalType: 'uint256' },
      { name: '_party', type: 'address', internalType: 'address' }
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'dealId', type: 'uint256' },
      { indexed: true, name: 'partyA', type: 'address' },
      { indexed: true, name: 'partyB', type: 'address' },
      { indexed: false, name: 'dealType', type: 'uint8' },
      { indexed: false, name: 'amountA', type: 'uint256' },
      { indexed: false, name: 'amountB', type: 'uint256' },
      { indexed: false, name: 'arbitrator', type: 'address' },
      { indexed: false, name: 'feePercent', type: 'uint256' },
      { indexed: false, name: 'expiryTimestamp', type: 'uint256' },
    ],
    name: 'DealCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'dealId', type: 'uint256' },
      { indexed: true, name: 'party', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
    ],
    name: 'Deposited',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'dealId', type: 'uint256' },
      { indexed: true, name: 'party', type: 'address' },
      { indexed: false, name: 'outcome', type: 'uint8' },
    ],
    name: 'VoteSubmitted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'dealId', type: 'uint256' },
      { indexed: true, name: 'raisedBy', type: 'address' },
    ],
    name: 'Disputed',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'dealId', type: 'uint256' },
      { indexed: true, name: 'winner', type: 'address' },
      { indexed: false, name: 'outcome', type: 'uint8' },
    ],
    name: 'Resolved',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'dealId', type: 'uint256' },
      { indexed: true, name: 'partyA', type: 'address' },
      { indexed: true, name: 'partyB', type: 'address' },
    ],
    name: 'Cancelled',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'dealId', type: 'uint256' },
      { indexed: true, name: 'partyA', type: 'address' },
      { indexed: true, name: 'partyB', type: 'address' },
    ],
    name: 'Expired',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'dealId', type: 'uint256' },
      { indexed: true, name: 'party', type: 'address' },
    ],
    name: 'CancelRequested',
    type: 'event',
  },
] as const;

export const publicClient = getPublicClient();
export const wsClient = getWsClient();

export function getContract() {
  return {
    address: config.blockchain.contractAddress as `0x${string}`,
    abi: CONTRACT_ABI,
    client: publicClient,
  };
}

export type EscrowEventArgs = {
  DealCreated: {
    dealId: bigint;
    partyA: `0x${string}`;
    partyB: `0x${string}`;
    dealType: number;
    amountA: bigint;
    amountB: bigint;
    arbitrator: `0x${string}`;
    feePercent: bigint;
    expiryTimestamp: bigint;
  };
  Deposited: {
    dealId: bigint;
    party: `0x${string}`;
    amount: bigint;
  };
  VoteSubmitted: {
    dealId: bigint;
    party: `0x${string}`;
    outcome: number;
  };
  Disputed: {
    dealId: bigint;
    raisedBy: `0x${string}`;
  };
  Resolved: {
    dealId: bigint;
    winner: `0x${string}`;
    outcome: number;
  };
  Cancelled: {
    dealId: bigint;
    partyA: `0x${string}`;
    partyB: `0x${string}`;
  };
  Expired: {
    dealId: bigint;
    partyA: `0x${string}`;
    partyB: `0x${string}`;
  };
  CancelRequested: {
    dealId: bigint;
    party: `0x${string}`;
  };
};

export const DEAL_TYPES = ['MutualStake', 'OneSided'] as const;
export const OUTCOMES = ['PartyAWins', 'PartyBWins', 'Split'] as const;

export const ESCROW_EVENT_NAMES = [
  'DealCreated',
  'Deposited',
  'VoteSubmitted',
  'Disputed',
  'Resolved',
  'Cancelled',
  'Expired',
] as const;
