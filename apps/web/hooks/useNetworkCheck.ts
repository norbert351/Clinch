'use client';

import { useChainId, useSwitchChain } from 'wagmi';
import { arcTestnet } from '@/lib/wagmi-config';

export function useNetworkCheck() {
  const chainId = useChainId();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();

  const isCorrectNetwork = chainId === arcTestnet.id;

  const switchToArc = async () => {
    try {
      await switchChainAsync({ chainId: arcTestnet.id });
    } catch (error) {
      console.error('Failed to switch network:', error);
    }
  };

  return { isCorrectNetwork, switchToArc, isSwitching };
}

export function parseContractError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes('user rejected')) return 'Transaction cancelled.';
    if (msg.includes('insufficient funds')) return 'Insufficient USDC balance.';
    if (msg.includes('Escrow_InvalidAmount')) return 'Invalid amount specified.';
    if (msg.includes('Escrow_InvalidAddress')) return 'Invalid wallet address.';
    if (msg.includes('Escrow_InvalidFee')) return 'Invalid fee configuration.';
    if (msg.includes('network')) return 'Network error. Check you are on Arc Testnet.';
    if (msg.includes('gas')) return 'Transaction failed. The network may be congested.';
    return 'Transaction failed. Please try again.';
  }
  return 'An unexpected error occurred.';
}
