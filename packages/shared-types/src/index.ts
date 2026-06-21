// ==================== Enums ====================

export enum CopyMode {
  FIXED = 'FIXED',
  PROPORTIONAL = 'PROPORTIONAL',
}

export enum TradeStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
}

export enum CopyTradeStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export enum DexName {
  JUPITER = 'JUPITER',
  RAYDIUM = 'RAYDIUM',
  ORCA = 'ORCA',
  METEORA = 'METEORA',
  UNKNOWN = 'UNKNOWN',
}

export enum NotificationChannel {
  TELEGRAM = 'TELEGRAM',
  DISCORD = 'DISCORD',
  EMAIL = 'EMAIL',
  WEBHOOK = 'WEBHOOK',
}

export enum TraderStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  BANNED = 'BANNED',
  INACTIVE = 'INACTIVE',
}

export enum VaultTransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
}

// ==================== Interfaces ====================

export interface User {
  id: string;
  email?: string;
  createdAt: Date;
}

export interface ConnectedWallet {
  id: string;
  publicKey: string;
  userId: string;
  isDefault: boolean;
  label?: string;
}

export interface Trader {
  id: string;
  walletAddress: string;
  label?: string;
  status: TraderStatus;
  roi7d: number;
  roi30d: number;
  winRate: number;
  sharpeRatio: number;
  maxDrawdown: number;
  avgHoldTime: number;
  totalTrades: number;
  lastTradeAt?: Date;
}

export interface CopyRelation {
  id: string;
  userId: string;
  traderId: string;
  enabled: boolean;
  copyMode: CopyMode;
  fixedAmountSol?: number;
  proportionPct?: number;
  maxTradeSizeSol: number;
  maxSlippageBps: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  maxDailyLossSol?: number;
  maxOpenPositions?: number;
  tokenBlacklist: string[];
  pausedAt?: Date;
  pauseReason?: string;
}

export interface Trade {
  id: string;
  traderId: string;
  signature: string;
  slot: bigint;
  timestamp: Date;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  dex: DexName;
  priceImpactBps?: number;
  feeSol?: string;
}

export interface CopyTrade {
  id: string;
  userId: string;
  walletId: string;
  originalTradeId: string;
  status: CopyTradeStatus;
  copiedSignature?: string;
  amountIn?: string;
  amountOut?: string;
  executionLatencyMs?: number;
  pnlSol?: number;
  pnlUsd?: number;
  skipReason?: string;
  errorMessage?: string;
  jitoBundleId?: string;
  settledAt?: Date;
}

export interface TraderAnalytics {
  id: string;
  traderId: string;
  calculatedAt: Date;
  windowDays: number;
  roi: number;
  winRate: number;
  totalTrades: number;
  avgHoldTimeSec: number;
  sharpeRatio: number;
  maxDrawdown: number;
  realizedPnlSol: number;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  channel: NotificationChannel;
  target: string;
  enabled: boolean;
  onTradeExecuted: boolean;
  onTradeFailed: boolean;
  onDailyLoss: boolean;
  onTraderPaused: boolean;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  createdAt: Date;
}

export interface TokenMetadata {
  mintAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
  verified: boolean;
  isHoneypot: boolean;
  updatedAt: Date;
}

export interface Vault {
  id: string;
  userId: string;
  walletId: string;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface VaultTransaction {
  id: string;
  vaultId: string;
  type: VaultTransactionType;
  amount: number;
  signature: string;
  timestamp: Date;
}

// ==================== Event Types ====================

export interface WalletEvent {
  walletAddress: string;
  signature: string;
  slot: number;
  timestamp: Date;
}

export interface ParsedTradeEvent {
  traderId: string;
  signature: string;
  slot: number;
  timestamp: Date;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  dex: DexName;
  priceImpactBps?: number;
  feeSol?: string;
}

export interface CopyOrderEvent {
  userId: string;
  copyRelationId: string;
  originalTrade: ParsedTradeEvent;
  amountSol: number;
  maxSlippageBps: number;
}

// ==================== Signing Types ====================

export interface SigningRequest {
  id: string;
  userId: string;
  walletId: string;
  transaction: string; // base64-encoded serialized transaction
  purpose: string;
  expiresAt: Date;
}

export interface SigningResponse {
  requestId: string;
  signature: string; // base64-encoded signature
  approved: boolean;
}

// ==================== WebSocket Message Types ====================

export enum WsMessageType {
  CONNECTED = 'CONNECTED',
  SIGNING_REQUEST = 'SIGNING_REQUEST',
  TRADE_UPDATE = 'TRADE_UPDATE',
  PONG = 'PONG',
  SIGNING_RESPONSE = 'SIGNING_RESPONSE',
  PING = 'PING',
}

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  payload: T;
  timestamp: number;
}

export interface WsConnectedPayload {
  sessionId: string;
}

export interface WsTradeUpdatePayload {
  copyTradeId: string;
  status: CopyTradeStatus;
  signature?: string;
  pnlSol?: number;
}

// ==================== Risk Engine Types ====================

export interface RiskCheckResult {
  allowed: boolean;
  reason?: string;
  adjustedAmountSol?: number;
}

// ==================== DEX Adapter Interface ====================

export interface TransactionWithMeta {
  signature: string;
  slot: number;
  blockTime: number;
  transaction: {
    message: {
      accountKeys: string[];
      instructions: Array<{
        programIdIndex: number;
        accounts: number[];
        data: string;
      }>;
    };
  };
  meta: {
    preTokenBalances: TokenBalance[];
    postTokenBalances: TokenBalance[];
    err: unknown;
  } | null;
}

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner: string;
  uiTokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
  };
}

export interface DexAdapter {
  name: DexName;
  programIds: string[];
  canParse(tx: TransactionWithMeta): boolean;
  parse(tx: TransactionWithMeta, traderId: string): Promise<ParsedTradeEvent>;
}
