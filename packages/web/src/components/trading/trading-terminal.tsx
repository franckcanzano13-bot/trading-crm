'use client';
import { useEffect } from 'react';
import { TradingChart } from '@/components/charts/trading-chart';
import { ChartToolbar } from '@/components/charts/chart-toolbar';
import { OrderPanel } from '@/components/trading/order-panel';
import { InstrumentSelector } from '@/components/trading/instrument-selector';
import { TradingSidebar } from '@/components/trading/trading-sidebar';
import { TradingTopBar } from '@/components/trading/trading-top-bar';
import { TradingBottomBar } from '@/components/trading/trading-bottom-bar';
import { AccountMetricsBar } from '@/components/trading/account-metrics-bar';
import { useTradingStore } from '@/stores/trading-store';
import { useAuthStore } from '@/stores/auth-store';
import { usePriceWebSocket } from '@/hooks/use-websocket';
import { useTradeSimulation } from '@/hooks/use-trade-simulation';
import { tradingApi, authApi } from '@/lib/api';
import { formatPrice, formatCurrency } from '@/lib/utils';

const TIMEFRAMES = ['1s', '1m', '5m', '15m', '1h', '4h', '1d'] as const;

export function TradingTerminal() {
  const { token, tenantId, isDealerManaged, executionMode } = useAuthStore();
  const selectedSymbol = useTradingStore((s) => s.selectedSymbol);
  const selectedTimeframe = useTradingStore((s) => s.selectedTimeframe);
  const setSelectedTimeframe = useTradingStore((s) => s.setSelectedTimeframe);
  const setInstruments = useTradingStore((s) => s.setInstruments);
  const instruments = useTradingStore((s) => s.instruments);
  const positions = useTradingStore((s) => s.positions);
  const allPrices = useTradingStore((s) => s.prices);
  const selectedTradeId = useTradingStore((s) => s.selectedTradeId);
  const getPrice = useTradingStore((s) => s.getPrice);

  usePriceWebSocket();

  const simulations = useTradeSimulation(positions, allPrices);

  useEffect(() => {
    if (!token || !tenantId || executionMode) return;
    authApi.me(token, tenantId).then((data) => {
      if (data?.execution_mode) {
        useAuthStore.getState().setExecutionMode(data.execution_mode);
      }
    }).catch(() => {});
  }, [token, tenantId, executionMode]);

  useEffect(() => {
    if (!token || !tenantId) return;
    tradingApi.getInstruments(token, tenantId).then((data) => {
      if (Array.isArray(data)) setInstruments(data);
    }).catch((err) => {
      console.error('Failed to load instruments:', err);
    });
  }, [token, tenantId, setInstruments]);

  const instrument = instruments.find((i) => i.symbol === selectedSymbol);
  const price = getPrice(selectedSymbol);
  const displaySymbol = selectedSymbol.replace(/([A-Z]{3})([A-Z]{3,})/, '$1/$2');
  const decimals = selectedSymbol.includes('JPY') ? 3 : selectedSymbol.startsWith('BTC') ? 2 : 5;

  const selectedTrade = selectedTradeId ? positions.find((p) => p.id === selectedTradeId) : null;
  const selectedSim = selectedTradeId ? simulations.get(selectedTradeId) : null;
  const showPnlOverlay = selectedTrade && parseFloat(selectedTrade.swap || '0') > 0;

  // Find any position for current symbol (for SL/TP lines on chart)
  const activePosition = selectedTrade && selectedTrade.symbol === selectedSymbol
    ? selectedTrade
    : positions.find((p) => p.symbol === selectedSymbol);
  const chartOpenPrice = activePosition ? Number(activePosition.open_price) / 100000 : null;
  const chartSL = activePosition?.stop_loss || null;
  const chartTP = activePosition?.take_profit || null;
  const chartSide = (activePosition?.side as 'BUY' | 'SELL') || null;

  const pnlCents = selectedSim?.currentPnlCents || 0;
  const pnlDollars = (pnlCents / 100).toFixed(2);
  const investCents = selectedTrade ? parseFloat(selectedTrade.swap || '0') : 0;
  const pnlPercent = investCents > 0 ? ((pnlCents / investCents) * 100).toFixed(2) : '0.00';
  const pnlPositive = pnlCents >= 0;

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      <TradingSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TradingTopBar />

        <div className="flex-1 flex overflow-hidden">
          {/* Watchlist */}
          <div className="w-[260px] flex flex-col border-r border-border bg-card shrink-0">
            <InstrumentSelector />
          </div>

          {/* Chart area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Chart toolbar row 1: Symbol + Timeframes + Live */}
            <div className="h-10 flex items-center px-4 border-b border-border bg-card gap-4 shrink-0 no-select">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">{displaySymbol}</span>
                {instrument && (
                  <span className="text-[10px] text-muted-foreground">{instrument.display_name}</span>
                )}
              </div>

              {price && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-semibold text-sell price-value">
                    {formatPrice(price.bid, decimals)}
                  </span>
                  <span className="text-[9px] text-muted-foreground">/</span>
                  <span className="text-[11px] font-mono font-semibold text-buy price-value">
                    {formatPrice(price.ask, decimals)}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground font-mono">
                    {((price.ask - price.bid) * Math.pow(10, decimals)).toFixed(1)}
                  </span>
                </div>
              )}

              <div className="w-px h-5 bg-border/50" />

              {/* Timeframes */}
              <div className="flex items-center gap-0.5">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setSelectedTimeframe(tf)}
                    className={`px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                      selectedTimeframe === tf
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>

              <div className="flex-1" />

              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 pulse-live" />
                <span className="text-[10px] text-muted-foreground">Live</span>
              </div>
            </div>

            {/* Chart toolbar row 2: Chart Type + Indicators + Tools + Multiscreen + Cleaning + 1-Click */}
            <div className="h-9 flex items-center px-3 border-b border-border/50 bg-card/80 shrink-0 no-select">
              <ChartToolbar />
            </div>

            {/* Chart area with optional P&L overlay */}
            <div className="flex-1 min-h-0 relative">
              <TradingChart
                symbol={selectedSymbol}
                timeframe={selectedTimeframe}
                openPrice={chartOpenPrice}
                stopLoss={chartSL}
                takeProfit={chartTP}
                tradeSide={chartSide}
              />

              {showPnlOverlay && (
                <div className="absolute top-3 left-4 z-10 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-card/95 backdrop-blur-sm border border-border/50 shadow-lg">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
                      {selectedTrade.symbol.replace(/([A-Z]{3})([A-Z]{3,})/, '$1/$2')} &middot; {selectedTrade.side} &middot; {formatCurrency(investCents)}
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-lg font-mono font-bold tabular-nums ${pnlPositive ? 'text-buy' : 'text-sell'}`}>
                        {pnlPositive ? '+' : ''}{pnlDollars} USD
                      </span>
                      <span className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded tabular-nums ${
                        pnlPositive ? 'bg-buy/10 text-buy' : 'bg-sell/10 text-sell'
                      }`}>
                        {pnlPositive ? '+' : ''}{pnlPercent}%
                      </span>
                    </div>
                  </div>
                  <div className={`w-2 h-2 rounded-full animate-pulse ${pnlPositive ? 'bg-buy' : 'bg-sell'}`} />
                </div>
              )}
            </div>
          </div>

          {/* Order panel */}
          <div className="w-[300px] flex flex-col border-l border-border bg-card shrink-0">
            <OrderPanel />
          </div>
        </div>

        {/* Bottom bar — positions */}
        <TradingBottomBar simulations={simulations} />

        {/* Account metrics bar */}
        <AccountMetricsBar />
      </div>
    </div>
  );
}
