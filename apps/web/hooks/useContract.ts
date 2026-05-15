'use client';

import { useState, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits, formatUnits, createPublicClient, http, decodeEventLog } from 'viem';
import { CONTRACT_ADDRESS, ESCROW_ABI, DEAL_TYPES, OUTCOMES, USDC_ADDRESS } from '@/lib/contract';
import { ARC_CHAIN_ID, arcTestnet } from '@/lib/wagmi-config';

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http('https://rpc.testnet.arc.network'),
});

export const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

function decodeRevertReason(data: string): string {
  if (!data || data === '0x') return 'Unknown error';
  try {
    if (data.startsWith('0x08c379a0')) {
      const decoder = new globalThis.TextDecoder();
      return decoder.decode(
        Buffer.from(data.slice(10), 'hex' as any)
      ).replace(/\0+$/, '');
    }
  } catch {}
  return 'Transaction reverted';
}

async function getRevertHash(hash: string): Promise<string | null> {
  try {
    const tx = await publicClient.getTransaction({ hash: hash as `0x${string}` });
    return (tx as any)?.revertData || null;
  } catch {
    return null;
  }
}

function extractDealIdFromReceipt(receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>): bigint | null {
  if (receipt.status !== 'success') {
    console.error('[createDeal] Transaction reverted on-chain, status:', receipt.status);
    return null;
  }

  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: ESCROW_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName === 'DealCreated') {
        const dealId = (decoded as any).args?.dealId;
        if (dealId !== undefined && dealId !== null) {
          return BigInt(dealId);
        }
      }
    } catch {}
  }

  for (const log of receipt.logs) {
    if (!log.topics || log.topics.length < 2) {
      continue;
    }

    try {
      const dealIdHex = log.topics[1];
      if (dealIdHex) {
        return BigInt(dealIdHex);
      }
    } catch {}
  }

  return null;
}

export function useContract() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getGasPrice = useCallback(async () => {
    try {
      return await publicClient.getGasPrice();
    } catch {
      return BigInt(1000000000);
    }
  }, []);

  const createDeal = useCallback(async ({
    partyB,
    dealType,
    partyAAmount,
    partyBAmount,
    expiryPeriod = 30 * 24 * 60 * 60,
  }: {
    partyB: string;
    dealType: 'MutualStake' | 'OneSided';
    partyAAmount: string;
    partyBAmount: string;
    expiryPeriod?: number;
  }): Promise<{ txHash: string; dealId: bigint } | null> => {
    if (!walletClient || !address) {
      console.error('[createDeal] Wallet not connected');
      setError('Wallet not connected');
      return null;
    }

    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      console.error('[createDeal] Contract address not configured');
      setError('Contract address not configured');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const amountA = parseUnits(partyAAmount, 6);
      const amountB = parseUnits(partyBAmount, 6);
      const gasPrice = await getGasPrice();

      const expectedDealId = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'dealCounter',
      }) as bigint;

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'createDeal',
        args: [
          address,
          partyB as `0x${string}`,
          DEAL_TYPES[dealType],
          amountA,
          amountB,
          BigInt(250),
          BigInt(expiryPeriod),
        ],
        gasPrice,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (!receipt) {
        setError('Transaction failed: no receipt');
        return null;
      }

      const extractedDealId = extractDealIdFromReceipt(receipt);
      const dealId = extractedDealId ?? expectedDealId;

      if (!receipt || receipt.status !== 'success') {
        console.error('[createDeal] Transaction failed, status:', receipt?.status);
        setError('Transaction failed on-chain');
        return null;
      }

      return {
        txHash: receipt.transactionHash,
        dealId,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create deal';
      console.error('[createDeal] Error:', errorMessage);
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [walletClient, address, getGasPrice]);

  const deposit = useCallback(async (dealId: number, amount: string) => {
    if (!walletClient || !address) {
      setError('Wallet not connected');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const rawAmount = parseUnits(amount, 6);

      if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000') {
        throw new Error('Invalid CONTRACT_ADDRESS');
      }
      if (!USDC_ADDRESS || USDC_ADDRESS === '0x0000000000000000000000000000000000000') {
        throw new Error('Invalid USDC_ADDRESS');
      }

      const gasPrice = await publicClient.getGasPrice();
      const gasPriceWithBuffer = (gasPrice * BigInt(150)) / BigInt(100);

      console.log('[Deposit] Step 1: Approving USDC...');
      const approveTx = await walletClient.writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, rawAmount],
        gasPrice: gasPriceWithBuffer,
      });

      console.log('[Deposit] Approve tx:', approveTx);
      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTx });

      if (approveReceipt.status !== 'success') {
        console.error('[Deposit] Approve failed:', approveReceipt);
        throw new Error('Approve transaction failed');
      }

      let depositTxHash = '' as `0x${string}`;
      try {
        depositTxHash = await walletClient.writeContract({
          address: CONTRACT_ADDRESS,
          abi: ESCROW_ABI,
          functionName: 'deposit',
          args: [BigInt(dealId), rawAmount],
          gasPrice: gasPriceWithBuffer,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash: depositTxHash });

        if (receipt.status !== 'success') {
          console.error('[Deposit] Deposit reverted on-chain!');
          const revertData = await getRevertHash(depositTxHash);
          if (revertData) {
            const decoded = decodeRevertReason(revertData);
            console.error('[Deposit] Decoded revert:', decoded);
            throw new Error(`Deposit reverted: ${decoded}`);
          }
          throw new Error('Deposit transaction reverted on-chain');
        }

        return depositTxHash;
      } catch (depositErr: unknown) {
        if (depositErr instanceof Error && depositErr.message === 'Deposit transaction reverted on-chain') {
          if (depositTxHash) {
            const revertData = await getRevertHash(depositTxHash);
            if (revertData) {
              const decoded = decodeRevertReason(revertData);
              console.error('[Deposit] Decoded revert:', decoded);
              throw new Error(decoded);
            }
          }
        }
        throw depositErr;
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '';
      console.error('[Deposit] Error:', errMsg);
      if (errMsg.includes('user rejected') || errMsg.includes('User denied')) {
        setError('Transaction cancelled by user');
      } else if (errMsg.includes('insufficient funds') || errMsg.includes('insufficient balance')) {
        setError('Insufficient USDC balance for this deposit');
      } else if (errMsg.includes('allowance')) {
        setError('ERC20 allowance required. Check USDC approval.');
      } else if (errMsg.includes('gas')) {
        setError('Gas estimation failed. The network may be congested.');
      } else if (errMsg.includes('reverted')) {
        setError('Transaction reverted on-chain');
      } else {
        setError(errMsg || 'Failed to deposit');
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [walletClient, address, publicClient]);

  const submitVote = useCallback(async (dealId: number, outcome: 'PartyAWins' | 'PartyBWins' | 'Split') => {
    if (!walletClient || !address) {
      setError('Wallet not connected');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const gasPrice = await getGasPrice();

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'submitVote',
        args: [BigInt(dealId), OUTCOMES[outcome]],
        gasPrice,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt?.transactionHash || hash;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to submit vote';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [walletClient, address, getGasPrice]);

  const raiseDispute = useCallback(async (dealId: number) => {
    if (!walletClient || !address) {
      setError('Wallet not connected');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const gasPrice = await getGasPrice();

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'raiseDispute',
        args: [BigInt(dealId)],
        gasPrice,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt?.transactionHash || hash;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to raise dispute';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [walletClient, address, getGasPrice]);

  const resolveDispute = useCallback(async (dealId: number, outcome: 'PartyAWins' | 'PartyBWins' | 'Split') => {
    if (!walletClient || !address) {
      setError('Wallet not connected');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const gasPrice = await getGasPrice();

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'resolveDispute',
        args: [BigInt(dealId), OUTCOMES[outcome]],
        gasPrice,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt?.transactionHash || hash;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to resolve dispute';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [walletClient, address, getGasPrice]);

  const requestCancel = useCallback(async (dealId: number) => {
    if (!walletClient || !address) {
      setError('Wallet not connected');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const gasPrice = await getGasPrice();

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'requestCancel',
        args: [BigInt(dealId)],
        gasPrice,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt?.transactionHash || hash;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to request cancel';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [walletClient, address, getGasPrice]);

  const expireDeal = useCallback(async (dealId: number) => {
    if (!walletClient || !address) {
      setError('Wallet not connected');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const gasPrice = await getGasPrice();

      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'expireDeal',
        args: [BigInt(dealId)],
        gasPrice,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt?.transactionHash || hash;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to expire deal';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [walletClient, address, getGasPrice]);

  return {
    createDeal,
    deposit,
    submitVote,
    raiseDispute,
    resolveDispute,
    requestCancel,
    expireDeal,
    isLoading,
    error,
  };
}

export async function getDealFromContract(publicClient: ReturnType<typeof usePublicClient> | undefined, dealId: number) {
  if (!publicClient) return null;
  try {
    const result = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'getDeal',
      args: [BigInt(dealId)],
    });

    return {
      partyA: result[0],
      partyB: result[1],
      dealType: result[2],
      status: result[3],
      partyAAmount: formatUnits(result[4], 6),
      partyBAmount: formatUnits(result[5], 6),
      partyADeposited: formatUnits(result[6], 6),
      partyBDeposited: formatUnits(result[7], 6),
      feePercent: result[8].toString(),
      arbitrator: result[9],
      createdAt: new Date(Number(result[10]) * 1000).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function getDealVotesFromContract(publicClient: ReturnType<typeof usePublicClient> | undefined, dealId: number) {
  if (!publicClient) return null;
  try {
    const result = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'getDealVotes',
      args: [BigInt(dealId)],
    });

    return {
      partyAVote: result[0],
      partyBVote: result[1],
      disputeTimestamp: result[2].toString(),
    };
  } catch {
    return null;
  }
}
