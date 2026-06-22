const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

async function apiRequest<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Auth endpoints
export const authApi = {
  getNonce: (walletAddress: string) =>
    apiRequest<{ nonce: string }>('/api/v1/auth/nonce', {
      method: 'POST',
      body: { walletAddress },
    }),

  verify: (walletAddress: string, signature: string, nonce: string) =>
    apiRequest<{ token: string; user: { id: string; walletAddress: string } }>(
      '/api/v1/auth/verify',
      { method: 'POST', body: { walletAddress, signature, nonce } },
    ),

  me: (token: string) =>
    apiRequest<{ id: string; walletAddress: string }>('/api/v1/auth/me', { token }),
};

// Trader endpoints
export const tradersApi = {
  list: (token: string, params?: { sortBy?: string; order?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (params?.order) query.set('order', params.order);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return apiRequest<{ traders: TraderResponse[] }>(
      `/api/v1/traders${qs ? `?${qs}` : ''}`,
      { token },
    );
  },

  getById: (token: string, traderId: string) =>
    apiRequest<TraderResponse>(`/api/v1/traders/${traderId}`, { token }),

  getTrades: (token: string, traderId: string, limit = 50) =>
    apiRequest<{ trades: TradeResponse[] }>(
      `/api/v1/traders/${traderId}/trades?limit=${limit}`,
      { token },
    ),

  getAnalytics: (token: string, traderId: string, windowDays = 7) =>
    apiRequest<AnalyticsResponse>(
      `/api/v1/traders/${traderId}/analytics?windowDays=${windowDays}`,
      { token },
    ),
};

// Copy relation endpoints
export const copyApi = {
  list: (token: string) =>
    apiRequest<{ relations: CopyRelationResponse[] }>('/api/v1/copy', { token }),

  create: (token: string, data: CreateCopyRelationRequest) =>
    apiRequest<CopyRelationResponse>('/api/v1/copy', { method: 'POST', body: data, token }),

  update: (token: string, relationId: string, data: UpdateCopyRelationRequest) =>
    apiRequest<CopyRelationResponse>(`/api/v1/copy/${relationId}`, {
      method: 'PATCH',
      body: data,
      token,
    }),

  delete: (token: string, relationId: string) =>
    apiRequest<void>(`/api/v1/copy/${relationId}`, { method: 'DELETE', token }),
};

// Vault endpoints
export const vaultApi = {
  get: (token: string) =>
    apiRequest<VaultResponse>('/api/v1/vault', { token }),

  create: (token: string, data: CreateVaultRequest) =>
    apiRequest<VaultResponse>('/api/v1/vault/create', { method: 'POST', body: data, token }),

  deposit: (token: string, data: { amount: number; signature: string }) =>
    apiRequest<VaultResponse>('/api/v1/vault/deposit', { method: 'POST', body: data, token }),

  withdraw: (token: string, data: { amount: number; signature: string }) =>
    apiRequest<VaultResponse>('/api/v1/vault/withdraw', { method: 'POST', body: data, token }),

  updateRiskParams: (token: string, data: UpdateRiskParamsRequest) =>
    apiRequest<VaultResponse>('/api/v1/vault/settings', { method: 'PATCH', body: data, token }),

  pause: (token: string) =>
    apiRequest<VaultResponse>('/api/v1/vault/pause', { method: 'POST', token }),

  resume: (token: string) =>
    apiRequest<VaultResponse>('/api/v1/vault/resume', { method: 'POST', token }),

  getTransactions: (token: string) =>
    apiRequest<{ transactions: VaultTransactionResponse[] }>('/api/v1/vault/transactions', { token }),
};

// Dashboard endpoints
export const dashboardApi = {
  getSummary: (token: string) =>
    apiRequest<DashboardSummary>('/api/v1/dashboard', { token }),

  getRecentTrades: (token: string, limit = 20) =>
    apiRequest<{ trades: CopyTradeResponse[] }>(
      `/api/v1/dashboard/trades?limit=${limit}`,
      { token },
    ),
};

// Type definitions for API responses
export interface TraderResponse {
  id: string;
  walletAddress: string;
  label?: string;
  status: string;
  roi7d: number;
  roi30d: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgHoldTime: number;
  totalTrades: number;
  copiersCount: number;
  lastTradeAt?: string;
}

export interface TradeResponse {
  id: string;
  signature: string;
  timestamp: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  dex: string;
  priceImpactBps?: number;
  feeSol?: string;
}

export interface AnalyticsResponse {
  windowDays: number;
  roi: number;
  winRate: number;
  totalTrades: number;
  sharpeRatio: number;
  maxDrawdown: number;
  realizedPnlSol: number;
  dataPoints: { date: string; pnl: number }[];
}

export interface CopyRelationResponse {
  id: string;
  traderId: string;
  traderLabel?: string;
  traderAddress: string;
  enabled: boolean;
  copyMode: string;
  fixedAmountSol?: number;
  proportionPct?: number;
  maxTradeSizeSol: number;
  maxSlippageBps: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  maxDailyLossSol?: number;
  maxOpenPositions?: number;
  tokenBlacklist: string[];
  totalPnlSol: number;
  totalTrades: number;
}

export interface CreateCopyRelationRequest {
  traderId: string;
  copyMode: string;
  fixedAmountSol?: number;
  proportionPct?: number;
  maxTradeSizeSol: number;
  maxSlippageBps: number;
  stopLossPct?: number;
  takeProfitPct?: number;
}

export interface UpdateCopyRelationRequest {
  enabled?: boolean;
  copyMode?: string;
  fixedAmountSol?: number;
  proportionPct?: number;
  maxTradeSizeSol?: number;
  maxSlippageBps?: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  maxDailyLossSol?: number;
  maxOpenPositions?: number;
  tokenBlacklist?: string[];
}

export interface VaultResponse {
  id: string;
  publicKey: string;
  authority: string;
  maxTradeSizeSol: number;
  maxDailyLossSol: number;
  maxSlippageBps: number;
  maxOpenPositions: number;
  allowedDexs: string[];
  tokenBlacklist: string[];
  depositedSol: number;
  availableSol: number;
  isPaused: boolean;
}

export interface CreateVaultRequest {
  maxTradeSizeSol: number;
  maxDailyLossSol: number;
  maxSlippageBps: number;
  maxOpenPositions: number;
  allowedDexs: string[];
}

export interface UpdateRiskParamsRequest {
  maxTradeSizeSol?: number;
  maxDailyLossSol?: number;
  maxSlippageBps?: number;
  maxOpenPositions?: number;
  allowedDexs?: string[];
  tokenBlacklist?: string[];
}

export interface VaultTransactionResponse {
  id: string;
  type: string;
  amount: number;
  signature: string;
  timestamp: string;
}

export interface CopyTradeResponse {
  id: string;
  traderId: string;
  traderLabel?: string;
  tokenIn: string;
  tokenOut: string;
  status: string;
  amountIn?: string;
  amountOut?: string;
  pnlSol?: number;
  executionLatencyMs?: number;
  dex: string;
  settledAt?: string;
}

export interface DashboardSummary {
  pnl24h: number;
  pnl7d: number;
  activeTraders: number;
  openPositions: number;
  totalValue: number;
}
