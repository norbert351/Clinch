'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAccount, useConfig, usePublicClient, useWalletClient } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { parseUnits, formatUnits, createPublicClient, http, decodeEventLog } from 'viem';
import toast from 'react-hot-toast';
import { CONTRACT_ADDRESS, ESCROW_ABI, DEAL_TYPES, OUTCOMES, USDC_ADDRESS } from '@/lib/contract';
import { arcTestnet } from '@/lib/wagmi-config';

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http('https://arc-testnet.g.alchemy.com/v2/Gkx-iZaHDN3Didmlr1ep3'),
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
      const hex = data.slice(10);
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
      }
      const decoder = new TextDecoder();
      return decoder.decode(bytes).replace(/\0+$/, '');
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

function walletErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const message = err.message || fallback;

  if (
    message.includes('Connector not connected') ||
    message.includes('Wallet not connected')
  ) {
    return 'Wallet not connected';
  }

  if (
    message.includes('Connector chain mismatch') ||
    message.includes('chain mismatch') ||
    message.includes('Wallet network changed')
  ) {
    return 'Wallet network changed. Try again.';
  }

  if (message.includes('Wallet signer changed')) {
    return 'Wallet signer changed. Reconnect wallet.';
  }

  if (message.includes('Wallet still initializing')) {
    return 'Wallet still initializing';
  }

  return message;
}

export function useContract() {
  const config = useConfig();
  const { address, chainId, connector, isConnected, status } = useAccount();
  const [mounted, setMounted] = useState(false);
  const lastWalletDebugRef = useRef<string>('');

  useEffect(() => {
    setMounted(true);
  }, []);

  const walletClientQueryEnabled = Boolean(
    address &&
      connector &&
      (status === 'connected' || status === 'reconnecting') &&
      mounted,
  );
  const {
    data: walletClient,
    isLoading: isWalletClientLoading,
    isFetching: isWalletClientFetching,
  } = useWalletClient({
    account: address,
    chainId,
    connector,
    query: {
      enabled: walletClientQueryEnabled,
    },
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walletClientAddress = walletClient?.account?.address?.toLowerCase();
  const walletClientChainId = walletClient?.chain?.id;
  const isWalletReady = useMemo(() => {
    if (!isConnected || !address || !walletClient) {
      return false;
    }

    const signerMatches = walletClientAddress
      ? walletClientAddress === address.toLowerCase()
      : true;
    const chainMatches = chainId && walletClientChainId
      ? walletClientChainId === chainId
      : true;

    return signerMatches && chainMatches;
  }, [
    address,
    chainId,
    isConnected,
    walletClient,
    walletClientAddress,
    walletClientChainId,
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const debugKey = [
      address?.toLowerCase() || 'no-address',
      chainId || 'no-chain',
      walletClientAddress || 'no-wallet-client',
      walletClientChainId || 'no-wallet-client-chain',
      isWalletReady ? 'ready' : 'not-ready',
      status,
    ].join(':');

    if (lastWalletDebugRef.current === debugKey) return;
    lastWalletDebugRef.current = debugKey;

    console.log('[wallet debug]', {
      address,
      walletClient: Boolean(walletClient),
      connected: Boolean(address),
      chainId,
      walletClientAddress,
      walletClientChainId,
      ready: isWalletReady,
    });
  }, [
    address,
    chainId,
    isWalletReady,
    status,
    walletClient,
    walletClientAddress,
    walletClientChainId,
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && isConnected && address && !isWalletReady) {
      console.warn('[useContract] Wallet connected but walletClient not ready yet');
    }
  }, [address, isConnected, isWalletReady]);

  const getGasPrice = useCallback(async () => {
    try {
      return await publicClient.getGasPrice();
    } catch {
      return BigInt(1000000000);
    }
  }, []);

  const getReadyWalletClient = useCallback(async () => {
    if (!address) {
      console.error('[createDeal] No wallet address');
      toast.error('Connect wallet first');
      throw new Error('Connect wallet first');
    }

    if (!chainId) {
      console.error('[createDeal] Wallet chain not initialized yet');
      toast.error('Wallet still initializing');
      throw new Error('Wallet still initializing');
    }

    if (!walletClient && !mounted) {
      console.error('[createDeal] Wallet client not ready yet');
      toast.error('Wallet still initializing');
      throw new Error('Wallet still initializing');
    }

    let activeWalletClient: Awaited<ReturnType<typeof getWalletClient>> | undefined;
    let freshClient: Awaited<ReturnType<typeof getWalletClient>> | undefined;

    try {
      freshClient = await getWalletClient(config, {
        account: address,
        chainId,
        connector,
      });
    } catch {
      console.warn('[createDeal] getWalletClient failed, falling back to cached client');
    }

    if (freshClient) {
      activeWalletClient = freshClient;
    } else if (walletClient) {
      activeWalletClient = walletClient as Awaited<ReturnType<typeof getWalletClient>>;
    } else {
      throw new Error('Wallet still initializing');
    }

    const signerAddress = activeWalletClient.account?.address;
    const signerChainId = activeWalletClient.chain?.id;

    if (!signerAddress || signerAddress.toLowerCase() !== address.toLowerCase()) {
      throw new Error('Wallet signer changed. Reconnect wallet.');
    }

    if (signerChainId !== chainId) {
      throw new Error('Wallet network changed. Try again.');
    }

    return activeWalletClient;
  }, [address, chainId, config, connector, walletClient]);

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
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
      console.error('[createDeal] Contract address not configured');
      setError('Contract address not configured');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const activeWalletClient = await getReadyWalletClient();
      const signerAddress = activeWalletClient.account?.address;
      if (!signerAddress) {
        throw new Error('Wallet signer changed. Reconnect wallet.');
      }

      const amountA = parseUnits(partyAAmount, 6);
      const amountB = parseUnits(partyBAmount, 6);
      const gasPrice = await getGasPrice();

      const expectedDealId = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'dealCounter',
      }) as bigint;

      const hash = await activeWalletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'createDeal',
        args: [
          signerAddress,
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
      const errorMessage = walletErrorMessage(err, 'Failed to create deal');
      console.error('[createDeal] Error:', errorMessage);
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getGasPrice, getReadyWalletClient]);

  const deposit = useCallback(async (dealId: number, amount: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const activeWalletClient = await getReadyWalletClient();
      const rawAmount = parseUnits(amount, 6);

      if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000') {
        throw new Error('Invalid CONTRACT_ADDRESS');
      }
      if (!USDC_ADDRESS || USDC_ADDRESS === '0x0000000000000000000000000000000000000') {
        throw new Error('Invalid USDC_ADDRESS');
      }

      const gasPrice = await publicClient.getGasPrice();
      const gasPriceWithBuffer = (gasPrice * BigInt(150)) / BigInt(100);

      const approveTx = await activeWalletClient.writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, rawAmount],
        gasPrice: gasPriceWithBuffer,
      });

      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveTx });

      if (approveReceipt.status !== 'success') {
        console.error('[Deposit] Approve failed:', approveReceipt);
        throw new Error('Approve transaction failed');
      }

      let depositTxHash = '' as `0x${string}`;
      try {
        depositTxHash = await activeWalletClient.writeContract({
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
      const errMsg = walletErrorMessage(err, 'Failed to deposit');
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
  }, [getReadyWalletClient]);

  const submitVote = useCallback(async (dealId: number, outcome: 'PartyAWins' | 'PartyBWins' | 'Split') => {
    setIsLoading(true);
    setError(null);

    try {
      const activeWalletClient = await getReadyWalletClient();
      const gasPrice = await getGasPrice();

      const hash = await activeWalletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'submitVote',
        args: [BigInt(dealId), OUTCOMES[outcome]],
        gasPrice,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt?.transactionHash || hash;
    } catch (err: unknown) {
      const errorMessage = walletErrorMessage(err, 'Failed to submit vote');
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getGasPrice, getReadyWalletClient]);

  const raiseDispute = useCallback(async (dealId: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const activeWalletClient = await getReadyWalletClient();
      const gasPrice = await getGasPrice();

      const hash = await activeWalletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'raiseDispute',
        args: [BigInt(dealId)],
        gasPrice,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt?.transactionHash || hash;
    } catch (err: unknown) {
      const errorMessage = walletErrorMessage(err, 'Failed to raise dispute');
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getGasPrice, getReadyWalletClient]);

  const resolveDispute = useCallback(async (dealId: number, outcome: 'PartyAWins' | 'PartyBWins' | 'Split') => {
    setIsLoading(true);
    setError(null);

    try {
      const activeWalletClient = await getReadyWalletClient();
      const gasPrice = await getGasPrice();

      const hash = await activeWalletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'resolveDispute',
        args: [BigInt(dealId), OUTCOMES[outcome]],
        gasPrice,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt?.transactionHash || hash;
    } catch (err: unknown) {
      const errorMessage = walletErrorMessage(err, 'Failed to resolve dispute');
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getGasPrice, getReadyWalletClient]);

  const requestCancel = useCallback(async (dealId: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const activeWalletClient = await getReadyWalletClient();
      const gasPrice = await getGasPrice();

      const hash = await activeWalletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'requestCancel',
        args: [BigInt(dealId)],
        gasPrice,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt?.transactionHash || hash;
    } catch (err: unknown) {
      const errorMessage = walletErrorMessage(err, 'Failed to request cancel');
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getGasPrice, getReadyWalletClient]);

  const expireDeal = useCallback(async (dealId: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const activeWalletClient = await getReadyWalletClient();
      const gasPrice = await getGasPrice();

      const hash = await activeWalletClient.writeContract({
        address: CONTRACT_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'expireDeal',
        args: [BigInt(dealId)],
        gasPrice,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt?.transactionHash || hash;
    } catch (err: unknown) {
      const errorMessage = walletErrorMessage(err, 'Failed to expire deal');
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getGasPrice, getReadyWalletClient]);

  if (!mounted) {
    return {
      createDeal: async () => { console.warn('[useContract] Not mounted yet'); return null; },
      deposit: async () => null,
      submitVote: async () => null,
      raiseDispute: async () => null,
      resolveDispute: async () => null,
      requestCancel: async () => null,
      expireDeal: async () => null,
      isWalletReady: false,
      isWalletClientLoading: false,
      isLoading: false,
      error: null,
    };
  }

  return {
    createDeal,
    deposit,
    submitVote,
    raiseDispute,
    resolveDispute,
    requestCancel,
    expireDeal,
    isWalletReady,
    isWalletClientLoading:
      Boolean(address) &&
      !isWalletReady &&
      (isWalletClientLoading ||
        isWalletClientFetching ||
        status === 'reconnecting'),
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
