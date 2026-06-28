import axios from "axios";
import {
  wrapAxiosWithPayment,
  x402Client,
} from "@x402/axios";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import type { WalletClient } from "viem";
import type {
  ApiResponse,
  Deal,
  User,
  Dispute,
  DisputeAIAnalysis,
  DisputeWithDeal,
  PaginatedResponse,
  PublicActivityItem,
  PublicActivityResponse,
  PublicMetrics,
  GatewayChain,
  GatewayDepositIntent,
  GatewayTransferAttestation,
  GatewayTransfer,
  GatewayTransferIntent,
  Message,
  MessagePage,
  UnifiedBalance,
  UnifiedBalanceChain,
  UnreadCounts,
  UserAnalyticsStats,
  AdminAnalyticsOverview,
  AdminActivityEvent,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";


const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  // JWT in Authorization header — no cookies, no withCredentials
  timeout: 30000, // 30s timeout for Render cold starts
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("clinch_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== "undefined" && error?.response?.status === 401) {
      // Token expired or invalid — clear it silently
      // Do NOT reload the page; let the wallet context handle re-auth
      localStorage.removeItem("clinch_token");
    }
    return Promise.reject(error);
  },
);

export { api };

export function getAppUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3002";
}

export { API_URL };

export async function exchangeDynamicToken(
  dynamicToken: string,
  address: string,
): Promise<{ token: string }> {
  const response = await api.post<ApiResponse<{ token: string }>>(
    "/api/auth/dynamic",
    {
      dynamicToken,
      address,
    },
  );
  return response.data.data!;
}

export async function createDevelopmentSession(
  address: string,
): Promise<{ token: string; user: User }> {
  const response = await api.post<ApiResponse<{ token: string; user: User }>>(
    "/api/auth/dev-session",
    {
      address,
    },
  );
  return response.data.data!;
}

export async function getNonce(address: string): Promise<string> {
  const response = await api.get<ApiResponse<{ nonce: string }>>(
    `/api/auth/nonce?address=${address}`,
  );
  return response.data.data!.nonce;
}

export async function verifySiwe(
  message: string,
  signature: string,
): Promise<{ token: string; user: User }> {
  const response = await api.post<ApiResponse<{ token: string; user: User }>>(
    "/api/auth/verify",
    {
      message,
      signature,
    },
  );
  return response.data.data!;
}

export async function getDeals(
  page = 1,
  pageSize = 20,
  status?: string,
  walletAddress?: string,
): Promise<PaginatedResponse<Deal>> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (status && status !== "Pending") params.append("status", status);
  if (walletAddress) params.append("wallet", walletAddress);

  const response = await api.get<ApiResponse<PaginatedResponse<Deal>>>(
    `/api/deals?${params}`,
  );
  return response.data.data!;
}

export async function getPublicMetrics(): Promise<PublicMetrics> {
  const response = await api.get<ApiResponse<PublicMetrics>>(
    "/api/public/metrics",
  );
  return response.data.data!;
}

export async function getPublicActivity(
  limit = 8,
): Promise<PublicActivityItem[]> {
  const response = await api.get<ApiResponse<PublicActivityResponse>>(
    `/api/public/activity?limit=${limit}`,
  );
  return response.data.data?.items || [];
}

export async function getDealByOnChainId(
  onChainId: number,
): Promise<Deal | null> {
  try {
    const response = await api.get<ApiResponse<Deal>>(
      `/api/deals/${onChainId}`,
    );
    return response.data.data || null;
  } catch {
    return null;
  }
}

export async function getDealMessages(
  onChainId: number,
  before?: string,
): Promise<MessagePage> {
  const params = new URLSearchParams();
  if (before) params.set("before", before);

  const query = params.toString();
  const response = await api.get<ApiResponse<MessagePage>>(
    `/api/messages/deal/${onChainId}${query ? `?${query}` : ""}`,
  );
  return response.data.data || { items: [], nextBefore: null, hasMore: false };
}

export async function sendDealMessage(
  onChainId: number,
  content: string,
): Promise<Message> {
  const response = await api.post<ApiResponse<Message>>(
    `/api/messages/deal/${onChainId}`,
    { content },
  );
  return response.data.data!;
}

export async function editDealMessage(
  onChainId: number,
  messageId: string,
  content: string,
): Promise<Message> {
  const response = await api.patch<ApiResponse<Message>>(
    `/api/messages/deal/${onChainId}/${messageId}`,
    { content },
  );
  return response.data.data!;
}

export async function markDealRead(
  onChainId: number,
  messageId?: string,
): Promise<void> {
  await api.post(`/api/messages/deal/${onChainId}/read`, { messageId });
}

export async function getUnreadCounts(): Promise<UnreadCounts> {
  try {
    const response = await api.get<ApiResponse<UnreadCounts>>(
      "/api/messages/unread-counts",
    );
    return response.data.data || {};
  } catch {
    return {};
  }
}

export async function getMyAnalytics(): Promise<UserAnalyticsStats | null> {
  try {
    const response = await api.get<ApiResponse<UserAnalyticsStats>>(
      "/api/analytics/me",
    );
    return response.data.data || null;
  } catch {
    return null;
  }
}

export async function recordInviteAccepted(
  onChainId: number,
  inviteToken?: string,
): Promise<void> {
  await api.post("/api/analytics/invite-accepted", {
    onChainId,
    inviteToken,
  });
}

export interface AnalyticsDashboard {
  users: {
    total: number;
    newToday: number;
    new7Days: number;
    new30Days: number;
    growthChart: Array<{ date: string; count: number }>;
  };
  deals: {
    total: number;
    today: number;
    last7Days: number;
    last30Days: number;
    byStatus: Array<{ status: string; count: number }>;
    byType: Array<{ deal_type: string; count: number }>;
    growthChart: Array<{ date: string; count: number }>;
  };
  volume: {
    totalDeposited: number;
    last30Days: number;
    currentlyLocked: number;
    totalFees: number;
    feesThisMonth: number;
    volumeChart: Array<{ date: string; volume: number }>;
  };
  activity: {
    totalDeposits: number;
    totalVotes: number;
    totalDisputes: number;
    resolvedDisputes: number;
    disputeResolutionRate: number;
    avgDealLifetimeDays: number;
    totalMessages: number;
    mostActiveDeals: Array<{
      on_chain_id: number;
      title: string | null;
      status: string;
      message_count: number;
    }>;
  };
  recentEvents: Array<{
    id: string;
    eventName: string;
    onChainId: number;
    txHash: string;
    blockNumber: number;
    rawPayload: unknown;
    createdAt: string;
  }>;
  generatedAt: string;
}

export async function getAdminAnalyticsDashboard(): Promise<AnalyticsDashboard | null> {
  try {
    const response = await api.get<ApiResponse<AnalyticsDashboard>>(
      '/api/admin/analytics',
    );
    return response.data.data || null;
  } catch (err: unknown) {
    const axiosErr = err as { response?: { status?: number } };
    if (axiosErr?.response?.status === 403) {
      console.warn('[Admin] Not authorized to view analytics');
      return null;
    }
    throw err;
  }
}

export async function checkAdminAccess(): Promise<boolean> {
  try {
    const response = await api.get<ApiResponse<{ authorized: boolean }>>(
      "/api/admin/me",
    );
    return response.data.data?.authorized === true;
  } catch {
    return false;
  }
}

export async function getAdminAnalytics(
  rangeDays = 30,
  limit = 10,
): Promise<AdminAnalyticsOverview> {
  const params = new URLSearchParams({
    rangeDays: String(rangeDays),
    limit: String(limit),
  });
  const response = await api.get<ApiResponse<AdminAnalyticsOverview>>(
    `/api/admin/analytics?${params}`,
  );
  return response.data.data!;
}

export async function getAdminActivity(
  limit = 20,
): Promise<AdminActivityEvent[]> {
  const response = await api.get<ApiResponse<{ items: AdminActivityEvent[] }>>(
    `/api/admin/activity?limit=${limit}`,
  );
  return response.data.data?.items || [];
}

export async function searchMessages(
  onChainId: number,
  query: string,
): Promise<Message[]> {
  const params = new URLSearchParams({ q: query });
  const response = await api.get<ApiResponse<Message[]>>(
    `/api/messages/deal/${onChainId}/search?${params}`,
  );
  return response.data.data || [];
}

export async function getDealByInviteToken(
  token: string,
): Promise<Deal | null> {
  try {
    const response = await api.get<ApiResponse<Deal>>(
      `/api/deals/invite/${token}`,
    );
    return response.data.data || null;
  } catch {
    return null;
  }
}

export async function updateDealMetadata(
  onChainId: number,
  metadata: { title?: string; description?: string },
): Promise<Deal | null> {
  const response = await api.patch<ApiResponse<Deal>>("/api/deals/metadata", {
    onChainId,
    ...metadata,
  });
  return response.data.data || null;
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const response = await api.get<ApiResponse<User>>("/api/users/me");
    return response.data.data || null;
  } catch {
    return null;
  }
}

export async function updateUser(data: {
  email?: string;
  displayName?: string;
  emailNotifications?: boolean;
}): Promise<User | null> {
  try {
    const response = await api.patch<ApiResponse<User>>("/api/users/me", data);
    return response.data.data || null;
  } catch {
    return null;
  }
}

export async function getPendingDisputes(): Promise<DisputeWithDeal[]> {
  try {
    const response = await api.get<ApiResponse<DisputeWithDeal[]>>("/api/disputes/pending");
    return response.data.data || [];
  } catch {
    return [];
  }
}

export async function raiseDispute(
  onChainId: number,
  reasonText?: string,
): Promise<Dispute | null> {
  try {
    const response = await api.post<ApiResponse<Dispute>>(
      `/api/disputes/${onChainId}/raise`,
      {
        reasonText,
      },
    );
    return response.data.data || null;
  } catch {
    return null;
  }
}

export async function getDisputeAIAnalysis(
  onChainId: number,
): Promise<DisputeAIAnalysis | null> {
  try {
    const response = await api.get(
      `/api/disputes/${onChainId}/ai-analysis`,
    );
    return response.data?.data || null;
  } catch {
    return null;
  }
}

export async function generateDisputeAIAnalysis(
  onChainId: number,
  walletClient?: WalletClient,
): Promise<DisputeAIAnalysis | null> {
  try {
    if (!walletClient) {
      throw new Error("Wallet not connected. Please connect your wallet.");
    }

    const address = walletClient.account?.address;
    if (!address) {
      throw new Error("Wallet client has no selected account");
    }

    const client = new x402Client();
    registerExactEvmScheme(client, {
      signer: {
        address,
        signTypedData: async (params) =>
          walletClient.signTypedData({
            account: walletClient.account,
            domain: params.domain,
            types: params.types,
            primaryType: params.primaryType,
            message: params.message,
          } as Parameters<WalletClient["signTypedData"]>[0]),
      },
      networks: ["eip155:84532"],
    });

    const x402Api = wrapAxiosWithPayment(api, client);

    console.log(
      "[x402] Making payment-enabled request for deal:",
      onChainId,
    );

    const response = await x402Api.post<ApiResponse<DisputeAIAnalysis>>(
      `/api/disputes/${onChainId}/ai-analysis`,
    );

    console.log("[x402] Payment completed and analysis received");

    return response.data?.data || null;
  } catch (err: any) {
    const status = err?.response?.status;
    const message = err?.message || "";
    const lowerMessage = message.toLowerCase();

    if (status === 402) {
      console.error("[x402] Payment failed - 402 not resolved");
      throw new Error(
        "Payment could not be processed. Ensure your wallet has USDC on Base Sepolia.",
      );
    }

    if (status === 500) {
      console.error("[x402] AI service error:", err?.response?.data);
      return null;
    }

    if (lowerMessage.includes("insufficient") ||
        lowerMessage.includes("balance") ||
        lowerMessage.includes("rejected") ||
        lowerMessage.includes("denied") ||
        lowerMessage.includes("payment") ||
        lowerMessage.includes("usdc")) {
      console.error("[x402] Payment error:", message);
      throw err;
    }

    console.error(
      "[x402] generateDisputeAIAnalysis error:",
      message,
    );
    return null;
  }
}

export async function triggerAISummary(
  onChainId: number
): Promise<string | null> {
  try {
    const response = await api.post(
      `/api/deals/ai-summary/${onChainId}`
    );
    return response.data?.data?.summary || null;
  } catch {
    return null;
  }
}

export async function getDisputeAIContext(
  onChainId: number
): Promise<string | null> {
  try {
    const response = await api.get(
      `/api/disputes/${onChainId}/ai-context`
    );
    return response.data?.data || null;
  } catch {
    return null;
  }
}

export function clearToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("clinch_token");
  }
}

export function getToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem("clinch_token");
  }
  return null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getWalletAddressFromToken(token: string | null): string | undefined {
  if (!token) return undefined;

  const payload = decodeJwtPayload(token);
  const wallet = payload?.wallet || payload?.address || payload?.walletAddress;
  return typeof wallet === "string" ? wallet : undefined;
}

export function setToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("clinch_token", token);
  }
}

export interface UserDashboardStats {
  totalDeals: number;
  activeDeals: number;
  completedDeals: number;
  disputedDeals: number;
  totalLockedUSDC: number;
  pendingDeals: number;
}

export interface GlobalDashboardStats {
  totalUsers: number;
  totalDeals: number;
  activeDeals: number;
  completedDeals: number;
  disputedDeals: number;
  totalLockedUSDC: number;
  totalFeesGenerated: number;
}

export async function getUserDashboard(
  _address?: string,
): Promise<UserDashboardStats | null> {
  try {
    const response = await api.get<ApiResponse<UserDashboardStats>>(
      "/api/dashboard/me",
    );
    return response.data.data || null;
  } catch {
    return null;
  }
}

export interface PublicPlatformStats {
  totalVolumeLocked: string;
  activeDeals: number;
}

export async function getPublicPlatformStats(): Promise<PublicPlatformStats | null> {
  try {
    const response = await api.get<ApiResponse<PublicPlatformStats>>(
      '/api/deals/stats/public',
    );
    return response.data.data || null;
  } catch {
    return null;
  }
}

export async function backfillDeal(onChainId: number): Promise<Deal | null> {
  try {
    const response = await api.post<ApiResponse<Deal>>(
      `/api/deals/backfill/${onChainId}`,
    );
    return response.data.data || null;
  } catch {
    return null;
  }
}

export async function getGlobalDashboard(): Promise<GlobalDashboardStats | null> {
  try {
    const response = await api.get<ApiResponse<GlobalDashboardStats>>(
      "/api/dashboard/global",
    );
    return response.data.data || null;
  } catch {
    return null;
  }
}

export async function getGatewayChains(): Promise<GatewayChain[]> {
  const response = await api.get<ApiResponse<GatewayChain[]>>(
    "/api/gateway/chains",
  );
  return response.data.data || [];
}

export async function getUnifiedBalance(): Promise<UnifiedBalance> {
  const response = await api.get<ApiResponse<UnifiedBalance>>(
    "/api/gateway/balance",
  );
  return response.data.data!;
}

export async function getUnifiedBalanceBreakdown(): Promise<UnifiedBalanceChain[]> {
  const response = await api.get<ApiResponse<UnifiedBalanceChain[]>>(
    "/api/gateway/balance/breakdown",
  );
  return response.data.data || [];
}

export async function getPendingGatewayTransfers(): Promise<GatewayTransfer[]> {
  const response = await api.get<ApiResponse<GatewayTransfer[]>>(
    "/api/gateway/transfers/pending",
  );
  return response.data.data || [];
}

export async function getCompletedGatewayTransfers(): Promise<GatewayTransfer[]> {
  const response = await api.get<ApiResponse<GatewayTransfer[]>>(
    "/api/gateway/transfers/completed",
  );
  return response.data.data || [];
}

export async function createGatewayDepositIntent(data: {
  sourceChainKey: string;
  amount: number | string;
}): Promise<GatewayDepositIntent> {
  const response = await api.post<ApiResponse<GatewayDepositIntent>>(
    "/api/gateway/deposits",
    data,
  );
  return response.data.data!;
}

export async function markGatewayDepositSubmitted(
  transferId: string,
  sourceTxHash: string,
): Promise<GatewayTransfer> {
  const response = await api.patch<ApiResponse<GatewayTransfer>>(
    `/api/gateway/deposits/${transferId}/submitted`,
    { sourceTxHash },
  );
  return response.data.data!;
}

export async function createGatewayTransferIntent(data: {
  sourceChainKey: string;
  destinationChainKey: string;
  recipient?: string;
  amount: number | string;
}): Promise<GatewayTransferIntent> {
  const response = await api.post<ApiResponse<GatewayTransferIntent>>(
    "/api/gateway/transfers",
    data,
  );
  return response.data.data!;
}

export async function submitGatewayTransferSignature(
  transferId: string,
  signature: string,
): Promise<GatewayTransferAttestation> {
  const response = await api.post<ApiResponse<GatewayTransferAttestation>>(
    `/api/gateway/transfers/${transferId}/signature`,
    { signature },
  );
  return response.data.data!;
}

export async function markGatewayTransferMintSubmitted(
  transferId: string,
  destinationTxHash: string,
): Promise<GatewayTransfer> {
  const response = await api.patch<ApiResponse<GatewayTransfer>>(
    `/api/gateway/transfers/${transferId}/mint-submitted`,
    { destinationTxHash },
  );
  return response.data.data!;
}

export async function markGatewayTransferFailed(
  transferId: string,
  reason: string,
): Promise<GatewayTransfer> {
  const response = await api.patch<ApiResponse<GatewayTransfer>>(
    `/api/gateway/transfers/${transferId}/fail`,
    { reason },
  );
  return response.data.data!;
}

export async function resolveDispute(
  onChainId: number,
  outcome: "PartyAWins" | "PartyBWins" | "Split",
): Promise<{ txHash: string } | null> {
  try {
    const response = await api.post<
      ApiResponse<{ txHash: string; outcome: string; winnerPayout: number }>
    >("/api/deals/resolve-dispute", {
      onChainId,
      outcome,
    });
    return response.data.data || null;
  } catch (err) {
    console.error("[API] resolveDispute error:", err);
    return null;
  }
}

export interface Notification {
  id: string;
  walletAddress: string;
  onChainId: number | null;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  read: boolean;
  sentAt: string;
  readAt: string | null;
}

export async function getNotifications(): Promise<Notification[]> {
  try {
    const response =
      await api.get<ApiResponse<Notification[]>>("/api/notifications");
    return response.data.data || [];
  } catch {
    return [];
  }
}

export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const response = await api.get<ApiResponse<{ count: number }>>(
      "/api/notifications/unread-count",
    );
    return response.data.data?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.patch(`/api/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.patch("/api/notifications/read-all");
}
