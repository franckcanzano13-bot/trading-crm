'use client';
import { create } from 'zustand';

export interface PriceTick {
  symbol: string;
  bid: number;
  ask: number;
  timestamp: number;
}

export interface Position {
  id: string;
  symbol: string;
  display_name: string;
  side: string;
  volume: number;
  open_price: string;
  pnl: string;
  swap: string; // invest_amount for dealer trades (cents)
  pnl_target: string | null; // target P&L in cents (dealer trades)
  scheduled_close_at: string | null; // when to auto-close (dealer trades)
  open_time: string;
  status: string;
  pip_size: number;
  lot_size: number;
  stop_loss: number | null;
  take_profit: number | null;
}

export interface Instrument {
  id: string;
  symbol: string;
  display_name: string;
  type: string;
  pip_size: number;
  lot_size: number;
  base_spread: number;
  spread_markup: number;
  is_active: boolean;
}

export type ChartType = 'candles' | 'bars' | 'line' | 'area';

export type IndicatorType = 'ema' | 'sma' | 'bollinger' | 'rsi' | 'macd' | 'ichimoku' | 'stochastic' | 'atr' | 'adx' | 'cci' | 'williams' | 'parabolic_sar' | 'volume';

interface TradingState {
  prices: Map<string, PriceTick>;
  instruments: Instrument[];
  positions: Position[];
  selectedSymbol: string;
  selectedTimeframe: string;
  selectedTradeId: string | null;
  chartType: ChartType;
  activeIndicators: IndicatorType[];
  oneClickTrading: boolean;
  updatePrice: (tick: PriceTick) => void;
  setPrices: (ticks: PriceTick[]) => void;
  setInstruments: (instruments: Instrument[]) => void;
  setPositions: (positions: Position[]) => void;
  setSelectedSymbol: (symbol: string) => void;
  setSelectedTimeframe: (tf: string) => void;
  setSelectedTradeId: (id: string | null) => void;
  setChartType: (type: ChartType) => void;
  toggleIndicator: (indicator: IndicatorType) => void;
  clearIndicators: () => void;
  setOneClickTrading: (enabled: boolean) => void;
  getPrice: (symbol: string) => PriceTick | undefined;
}

export const useTradingStore = create<TradingState>((set, get) => ({
  prices: new Map(),
  instruments: [],
  positions: [],
  selectedSymbol: 'EURUSD',
  selectedTimeframe: '1h',
  selectedTradeId: null,
  chartType: 'candles',
  activeIndicators: [],
  oneClickTrading: false,
  updatePrice: (tick) =>
    set((state) => {
      const newPrices = new Map(state.prices);
      newPrices.set(tick.symbol, tick);
      return { prices: newPrices };
    }),
  setPrices: (ticks) =>
    set(() => {
      const prices = new Map<string, PriceTick>();
      ticks.forEach((t) => prices.set(t.symbol, t));
      return { prices };
    }),
  setInstruments: (instruments) => set({ instruments }),
  setPositions: (positions) => set({ positions }),
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
  setSelectedTimeframe: (tf) => set({ selectedTimeframe: tf }),
  setSelectedTradeId: (id) => set({ selectedTradeId: id }),
  setChartType: (type) => set({ chartType: type }),
  toggleIndicator: (indicator) => set((state) => {
    const has = state.activeIndicators.includes(indicator);
    return { activeIndicators: has ? state.activeIndicators.filter((i) => i !== indicator) : [...state.activeIndicators, indicator] };
  }),
  clearIndicators: () => set({ activeIndicators: [] }),
  setOneClickTrading: (enabled) => set({ oneClickTrading: enabled }),
  getPrice: (symbol) => get().prices.get(symbol),
}));
