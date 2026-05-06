import axios from "axios";
import type {
  ApiResponse,
  Deal,
  User,
  Dispute,
  PaginatedResponse,
} from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://clinch-mi27.onrender.com";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
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

export { api };

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

export async function getPendingDisputes(): Promise<any[]> {
  const response = await api.get("/api/disputes/pending");
  return response.data.data || [];
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
  address: string,
): Promise<UserDashboardStats | null> {
  try {
    const response = await api.get<ApiResponse<UserDashboardStats>>(
      `/api/dashboard/me?address=${address}`,
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
