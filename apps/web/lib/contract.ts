import { CONTRACT_ADDRESS as _CONTRACT_ADDRESS, USDC_ADDRESS as _USDC_ADDRESS } from '@/lib/wagmi-config';
export const CONTRACT_ADDRESS = _CONTRACT_ADDRESS;
export const USDC_ADDRESS = _USDC_ADDRESS;

export const PLATFORM_ARBITRATOR = '';

export const ESCROW_ABI = [
  {
    inputs: [
      { internalType: 'address', name: '_usdc', type: 'address' },
      { internalType: 'address', name: '_platformAdmin', type: 'address' },
      { internalType: 'address', name: '_treasury', type: 'address' },
      { internalType: 'uint256', name: '_platformFeePercent', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'dealId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'partyA', type: 'address' },
      { indexed: true, internalType: 'address', name: 'partyB', type: 'address' },
      { indexed: false, internalType: 'uint8', name: 'dealType', type: 'uint8' },
      { indexed: false, internalType: 'uint256', name: 'amountA', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'amountB', type: 'uint256' },
      { indexed: false, internalType: 'address', name: 'arbitrator', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'feePercent', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'expiryTimestamp', type: 'uint256' },
    ],
    name: 'DealCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'dealId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'party', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'Deposited',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'dealId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'party', type: 'address' },
      { indexed: false, internalType: 'uint8', name: 'outcome', type: 'uint8' },
    ],
    name: 'VoteSubmitted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'dealId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'raisedBy', type: 'address' },
    ],
    name: 'Disputed',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'dealId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'winner', type: 'address' },
      { indexed: false, internalType: 'uint8', name: 'outcome', type: 'uint8' },
    ],
    name: 'Resolved',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'dealId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'partyA', type: 'address' },
      { indexed: true, internalType: 'address', name: 'partyB', type: 'address' },
    ],
    name: 'Cancelled',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'dealId', type: 'uint256' },
    ],
    name: 'Expired',
    type: 'event',
  },
  {
    inputs: [
      { internalType: 'address', name: '_partyA', type: 'address' },
      { internalType: 'address', name: '_partyB', type: 'address' },
      { internalType: 'uint8', name: '_dealType', type: 'uint8' },
      { internalType: 'uint256', name: '_partyAAmount', type: 'uint256' },
      { internalType: 'uint256', name: '_partyBAmount', type: 'uint256' },
      { internalType: 'uint256', name: '_feePercent', type: 'uint256' },
      { internalType: 'uint256', name: '_expiryPeriod', type: 'uint256' },
    ],
    name: 'createDeal',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: '_dealId', type: 'uint256' },
      { internalType: 'uint256', name: '_amount', type: 'uint256' },
    ],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: '_dealId', type: 'uint256' },
      { internalType: 'uint8', name: '_outcome', type: 'uint8' },
    ],
    name: 'submitVote',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '_dealId', type: 'uint256' }],
    name: 'raiseDispute',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: '_dealId', type: 'uint256' },
      { internalType: 'uint8', name: '_outcome', type: 'uint8' },
    ],
    name: 'resolveDispute',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '_dealId', type: 'uint256' }],
    name: 'requestCancel',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '_dealId', type: 'uint256' }],
    name: 'expireDeal',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '_dealId', type: 'uint256' }],
    name: 'getDeal',
    outputs: [
      { internalType: 'address', name: '_partyA', type: 'address' },
      { internalType: 'address', name: '_partyB', type: 'address' },
      { internalType: 'uint8', name: '_dealType', type: 'uint8' },
      { internalType: 'uint8', name: '_status', type: 'uint8' },
      { internalType: 'uint256', name: '_partyAAmount', type: 'uint256' },
      { internalType: 'uint256', name: '_partyBAmount', type: 'uint256' },
      { internalType: 'uint256', name: '_partyADeposited', type: 'uint256' },
      { internalType: 'uint256', name: '_partyBDeposited', type: 'uint256' },
      { internalType: 'uint256', name: '_feePercent', type: 'uint256' },
      { internalType: 'address', name: '_arbitrator', type: 'address' },
      { internalType: 'uint256', name: '_createdAt', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '_dealId', type: 'uint256' }],
    name: 'getDealExpiry',
    outputs: [{ internalType: 'uint256', name: '_expiryTimestamp', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '_dealId', type: 'uint256' }],
    name: 'getDealVotes',
    outputs: [
      { internalType: 'uint8', name: '_partyAVote', type: 'uint8' },
      { internalType: 'uint8', name: '_partyBVote', type: 'uint8' },
      { internalType: 'uint256', name: '_disputeTimestamp', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: '_dealId', type: 'uint256' },
      { internalType: 'address', name: '_party', type: 'address' },
    ],
    name: 'hasDeposited',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: '_dealId', type: 'uint256' },
      { internalType: 'address', name: '_party', type: 'address' },
    ],
    name: 'hasRequestedCancel',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'dealCounter',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'platformArbitrator',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const DEAL_TYPES = {
  MutualStake: 0,
  OneSided: 1,
} as const;

export const OUTCOMES = {
  None: 0,
  PartyAWins: 1,
  PartyBWins: 2,
  Split: 3,
} as const;

export const DEAL_STATUS = {
  0: 'Active',
  1: 'Confirmed',
  2: 'Disputed',
  3: 'Resolved',
  4: 'Cancelled',
  5: 'Expired',
} as const;
