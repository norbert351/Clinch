import axios from 'axios';
import type { ApiResponse, Deal, User, Dispute, PaginatedResponse } from './types';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ||
  'https://clinch-mi27.onrender.com'; // ensure no trailing slash

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// 🔐 Attach token automatically
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('clinch_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// 🧠 Global error visibility (IMPORTANT)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('[API ERROR]', err.response?.data || err.message);
    return Promise.reject(err);
  }
);

export { api };


// ================= AUTH =================

export async function getNonce(address: string): Promise<string> {
  const response = await api.get<ApiResponse<{ nonce: string }>>(
    `/api/auth/nonce`,
    { params: { address } }
  );
  return response.data.data!.nonce;
}

export async function verifySiwe(
  message: string,
  signature: string
): Promise<{ token: string; user: User }> {
  const response = await api.post<ApiResponse<{ token: string; user: User }>>(
    '/api/auth/verify',
    { message, signature }
  );

  const data = response.data.data!;

  // ✅ CRITICAL: persist token immediately
  if (typeof window !== 'undefined') {
    localStorage.setItem('clinch_token', data.token);
  }

  return data;
}


// ================= DEALS =================

export async function getDeals(
  page = 1,
  pageSize = 20,
  status?: string,
  walletAddress?: string
): Promise<PaginatedResponse<Deal>> {
  const params: any = { page, pageSize };

  if (status && status !== 'Pending') params.status = status;
  if (walletAddress) params.wallet = walletAddress;

  const response = await api.get<ApiResponse<PaginatedResponse<Deal>>>(
    `/api/deals`,
    { params }
  );

  return response.data.data!;
}

export async function getDealByOnChainId(onChainId: number): Promise<Deal | null> {
  try {
    const response = await api.get<ApiResponse<Deal>>(`/api/deals/${onChainId}`);
    return response.data.data || null;
  } catch (err) {
    console.error('[getDealByOnChainId]', err);
    return null;
  }
}

export async function getDealByInviteToken(token: string): Promise<Deal | null> {
  try {
    const response = await api.get<ApiResponse<Deal>>(`/api/deals/invite/${token}`);
    return response.data.data || null;
  } catch (err) {
    console.error('[getDealByInviteToken]', err);
    return null;
  }
}

export async function updateDealMetadata(
  onChainId: number,
  metadata: { title?: string; description?: string }
): Promise<Deal | null> {
  const response = await api.patch<ApiResponse<Deal>>('/api/deals/metadata', {
    onChainId,
    ...metadata,
  });
  return response.data.data || null;
}


// ================= USER =================

export async function getCurrentUser(): Promise<User | null> {
  try {
    const response = await api.get<ApiResponse<User>>('/api/users/me');
    return response.data.data || null;
  } catch (err) {
    console.error('[getCurrentUser]', err);
    return null;
  }
}

export async function updateUser(data: {
  email?: string;
  displayName?: string;
  emailNotifications?: boolean;
}): Promise<User | null> {
  try {
    const response = await api.patch<ApiResponse<User>>('/api/users/me', data);
    return response.data.data || null;
  } catch (err) {
    console.error('[updateUser]', err);
    return null;
  }
}


// ================= DISPUTES =================

export async function raiseDispute(
  onChainId: number,
  reasonText?: string
): Promise<Dispute | null> {
  try {
    const response = await api.post<ApiResponse<Dispute>>(
      `/api/disputes/${onChainId}/raise`,
      { reasonText }
    );
    return response.data.data || null;
  } catch (err) {
    console.error('[raiseDispute]', err);
    return null;
  }
}


// ================= DASHBOARD =================

export async function getUserDashboard(address: string) {
  try {
    const response = await api.get<ApiResponse<any>>(`/api/dashboard/me`, {
      params: { address },
    });
    return response.data.data || null;
  } catch (err) {
    console.error('[getUserDashboard]', err);
    return null;
  }
}

export async function getGlobalDashboard() {
  try {
    const response = await api.get<ApiResponse<any>>('/api/dashboard/global');
    return response.data.data || null;
  } catch (err) {
    console.error('[getGlobalDashboard]', err);
    return null;
  }
}


// ================= TOKEN =================

export function clearToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('clinch_token');
  }
}

export function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('clinch_token');
  }
  return null;
}

export function setToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('clinch_token', token);
  }
}