"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  getDeals,
  getDealByOnChainId,
  getDealByInviteToken,
  updateDealMetadata,
  getPendingDisputes,
  raiseDispute,
  getDisputeAIAnalysis,
  generateDisputeAIAnalysis,
  getUnreadCounts,
  getToken,
  getWalletAddressFromToken,
  backfillDeal,
} from "@/lib/api";
import { publicClient, getDealFromContract } from "@/hooks/useContract";
import type { Deal, DisputeWithDeal, DealWithDeposits } from "@/lib/types";

// ─── status mapping ───────────────────────────────────────────────────────────

function mapOnChainStatus(
  status: number,
): "Active" | "Confirmed" | "Disputed" | "Resolved" | "Cancelled" | "Expired" {
  switch (status) {
    case 0:
      return "Active";
    case 1:
      return "Confirmed";
    case 2:
      return "Disputed";
    case 3:
      return "Resolved";
    case 4:
      return "Cancelled";
    case 5:
      return "Expired";
    default:
      return "Active";
  }
}

// ─── core fetch with backend → blockchain fallback ────────────────────────────

async function fetchDealWithFallback(
  onChainId: number,
): Promise<DealWithDeposits | null> {
  try {
    const deal = await getDealByOnChainId(onChainId);

    if (deal) {

      // Enrich with live on-chain deposit state so the UI is always accurate
      // even if the backend event listener is slightly behind.
      try {
        const onChainDeal = await getDealFromContract(publicClient, onChainId);
        if (onChainDeal) {
          return {
            ...deal,
            partyADeposited: onChainDeal.partyADeposited !== "0",
            partyBDeposited: onChainDeal.partyBDeposited !== "0",
          } as DealWithDeposits;
        }
      } catch (enrichErr) {
        // Non-fatal — return backend data without enrichment
        console.warn(
          "[useDeals] On-chain enrichment failed, using backend data:",
          enrichErr,
        );
      }

      return deal as DealWithDeposits;
    }
  } catch (backendErr: any) {
    // Only continue to fallback on 404; rethrow other errors
    if (backendErr?.response?.status !== 404) {
      console.error("[useDeals] Backend error (non-404):", backendErr.message);
      throw backendErr;
    }
  }

  // ── Backend returned 404 — trigger backfill then read from chain ──────────

  void backfillDeal(onChainId).catch(() => {});

  try {
    const onChainDeal = await getDealFromContract(publicClient, onChainId);

    if (!onChainDeal) {
      console.warn("[useDeals] Deal not found on-chain either:", onChainId);
      return null;
    }

    // Build a temporary DealWithDeposits from chain data.
    // The backend will have the real record after backfill completes.
    const tempDeal: DealWithDeposits = {
      id: `temp-${onChainId}`,
      onChainId,
      partyA: onChainDeal.partyA as `0x${string}`,
      partyB: onChainDeal.partyB as `0x${string}`,
      dealType: onChainDeal.dealType === 0 ? "MutualStake" : "OneSided",
      status: mapOnChainStatus(onChainDeal.status),
      amountA: onChainDeal.partyAAmount,
      amountB: onChainDeal.partyBAmount,
      partyADeposited: onChainDeal.partyADeposited !== "0",
      partyBDeposited: onChainDeal.partyBDeposited !== "0",
      feePercent: onChainDeal.feePercent,
      arbitratorWallet: onChainDeal.arbitrator,
      inviteToken: undefined,
      title: undefined,
      description: undefined,
      aiSettlementSummary: null,
      aiDisputeSummary: null,
      aiSummaryGeneratedAt: null,
      aiSummaryStatus: null,
      createdAt: onChainDeal.createdAt,
      expiryTimestamp: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      updatedAt: new Date().toISOString(),

      // Fields required by Deal but not from the raw chain data
      type: onChainDeal.dealType === 0 ? "mutual" : "one-sided",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      platformFee: parseFloat(onChainDeal.feePercent) || 0,
      creator: {
        address: onChainDeal.partyA,
        depositAmount: parseFloat(onChainDeal.partyAAmount) || 0,
        hasDeposited: onChainDeal.partyADeposited !== "0",
        hasVoted: false,
      },
      counterparty: {
        address: onChainDeal.partyB,
        depositAmount: parseFloat(onChainDeal.partyBAmount) || 0,
        hasDeposited: onChainDeal.partyBDeposited !== "0",
        hasVoted: false,
      },
    };
    return tempDeal;
  } catch (chainErr: any) {
    console.error("[useDeals] Blockchain fallback failed:", chainErr.message);
    return null;
  }
}

// ─── hooks ────────────────────────────────────────────────────────────────────

export function useDeals(
  page = 1,
  pageSize = 20,
  status?: string,
  connectedWallet?: string | null,
) {
  const token = getToken();

  const wallet = useMemo(() => {
    if (connectedWallet === null) return undefined;
    return connectedWallet?.toLowerCase() || getWalletAddressFromToken(token)?.toLowerCase();
  }, [connectedWallet, token]);

  return useQuery({
    queryKey: ["deals", page, pageSize, status, wallet],
    queryFn: () => getDeals(page, pageSize, status, wallet),
    enabled: !!token && !!wallet,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useDeal(onChainId: number) {
  return useQuery({
    queryKey: ["deal", onChainId],
    queryFn: () => fetchDealWithFallback(onChainId),
    enabled: onChainId > 0,
    staleTime: 10_000,
    refetchInterval: 5000,
    placeholderData: (prev) => prev,
  });
}

export function useUnreadCounts(enabled = true) {
  const token = getToken();

  return useQuery({
    queryKey: ["messages", "unread-counts"],
    queryFn: getUnreadCounts,
    enabled: !!token && enabled,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useDealByInvite(token: string) {
  return useQuery({
    queryKey: ["deal", "invite", token],
    queryFn: () => getDealByInviteToken(token),
    enabled: !!token,
  });
}

export function useUpdateDealMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      onChainId,
      metadata,
    }: {
      onChainId: number;
      metadata: { title?: string; description?: string };
    }) => updateDealMetadata(onChainId, metadata),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["deal", variables.onChainId],
      });
    },
  });
}

export function usePendingDisputes() {
  const token = getToken();
  return useQuery({
    queryKey: ["disputes", "pending"],
    queryFn: getPendingDisputes,
    enabled: !!token,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useDisputeAIAnalysis(onChainId: number, enabled = true) {
  const token = getToken();
  return useQuery({
    queryKey: ["disputes", "ai", onChainId],
    queryFn: () => getDisputeAIAnalysis(onChainId),
    enabled: !!token && enabled && onChainId > 0,
    staleTime: 60_000,
  });
}

export function useRaiseDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      onChainId,
      reasonText,
    }: {
      onChainId: number;
      reasonText?: string;
    }) => raiseDispute(onChainId, reasonText),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["disputes"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useGenerateDisputeAIAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ onChainId }: { onChainId: number }) =>
      generateDisputeAIAnalysis(onChainId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["disputes", "ai", variables.onChainId],
      });
      queryClient.invalidateQueries({
        queryKey: ["disputes", "pending"],
      });
      queryClient.invalidateQueries({ queryKey: ["deal", variables.onChainId] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

export function useRefreshDeals() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["deals"] });
  }, [queryClient]);
}
