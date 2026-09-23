import { z } from 'zod';

// ─── Execution Modes ───
export const ExecutionMode = z.enum(['A_BOOK', 'B_BOOK', 'B_BOOK_DEALER']);
export type ExecutionMode = z.infer<typeof ExecutionMode>;

// ─── Instrument Types ───
export const InstrumentType = z.enum(['FOREX', 'CRYPTO', 'INDEX', 'COMMODITY']);
export type InstrumentType = z.infer<typeof InstrumentType>;

// ─── Order / Trade ───
export const OrderSide = z.enum(['BUY', 'SELL']);
export type OrderSide = z.infer<typeof OrderSide>;

export const OrderType = z.enum(['MARKET', 'LIMIT', 'STOP']);
export type OrderType = z.infer<typeof OrderType>;

export const OrderStatus = z.enum(['PENDING', 'FILLED', 'CANCELLED', 'REJECTED']);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const TradeStatus = z.enum(['OPEN', 'CLOSED', 'LIQUIDATED']);
export type TradeStatus = z.infer<typeof TradeStatus>;

// ─── User / KYC ───
export const UserStatus = z.enum(['ACTIVE', 'INACTIVE', 'BLOCKED']);
export type UserStatus = z.infer<typeof UserStatus>;

export const KycStatus = z.enum(['NONE', 'PENDING', 'APPROVED', 'REJECTED']);
export type KycStatus = z.infer<typeof KycStatus>;

// ─── Transaction Types ───
export const TransactionType = z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRADE_PNL', 'COMMISSION', 'ADJUSTMENT']);
export type TransactionType = z.infer<typeof TransactionType>;

// ─── Timeframes ───
export const Timeframe = z.enum(['1m', '5m', '15m', '1h', '4h', '1d']);
export type Timeframe = z.infer<typeof Timeframe>;

// ─── Tenant Config ───
export interface TenantConfig {
  id: string;
  name: string;
  domain: string;
  execution_mode: ExecutionMode;
  branding: {
    logo_url: string;
    primary_color: string;
    company_name: string;
  };
  trading: {
    default_leverage: number;
    max_leverage: number;
    margin_call_level: number;
    stop_out_level: number;
    max_positions: number;
    max_volume_per_trade: number;
  };
}

// ─── API Response ───
export interface ApiError {
  error: string;
  code: string;
  details?: unknown;
}

export interface ApiSuccess<T> {
  data: T;
}

// ─── Price Tick ───
export interface PriceTick {
  symbol: string;
  bid: number;
  ask: number;
  timestamp: number;
}

// ─── Candle ───
export interface Candle {
  instrument_id: string;
  timeframe: Timeframe;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

// ─── Auth ───
// Phase 1.13: bump when the legal texts change; users who accepted an older
// version can be asked to accept again at next login.
export const TERMS_VERSION = '2026-09';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(255),
  // Phase 1.13: explicit acceptance of the terms and privacy policy is mandatory.
  accept_terms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms of service and privacy policy' }) }),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'trader' | 'admin' | 'superadmin';
  tenantId?: string;
}

// ─── Order Schemas ───
export const CreateOrderSchema = z.object({
  symbol: z.string().min(1),
  side: OrderSide,
  type: OrderType,
  volume: z.number().positive().max(100),
  price: z.number().positive().optional(),
  stop_loss: z.number().positive().optional(),
  take_profit: z.number().positive().optional(),
  invest_amount: z.number().positive().optional(), // cents — for dealer-managed clients
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

// ─── Dealer Schemas ───
export const DealerInterventionSchema = z.object({
  action: z.enum(['SLIPPAGE', 'REQUOTE', 'SPREAD_OVERRIDE', 'PNL_OVERRIDE', 'DELAY']),
  modified_price: z.number().optional(),
  spread_multiplier: z.number().optional(),
  pnl_override: z.number().optional(),
  delay_ms: z.number().int().min(0).max(30000).optional(),
  reason: z.string().min(1).max(500),
});

export type DealerInterventionInput = z.infer<typeof DealerInterventionSchema>;
