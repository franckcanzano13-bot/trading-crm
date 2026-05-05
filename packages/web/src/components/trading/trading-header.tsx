'use client';
import { useAuthStore } from '@/stores/auth-store';
import { useTradingStore } from '@/stores/trading-store';
import { useThemeStore } from '@/stores/theme-store';
import { useNavigationStore } from '@/stores/navigation-store';
import { formatPrice } from '@/lib/utils';
import { useMemo } from 'react';

const TIMEFRAMES = ['1s', '1m', '5m', '15m', '1h', '4h', '1d'];

interface TradingHeaderProps {
  view: 'chart' | 'watchlist';
  onChangeView: (v: 'chart' | 'watchlist') => void;
  showOrder: boolean;
  onToggleOrder: () => void;
}

export function TradingHeader({ view, onChangeView, showOrder, onToggleOrder }: TradingHeaderProps) {
  const { user, logout } = useAuthStore();
  const selectedSymbol = useTradingStore((s) => s.selectedSymbol);
  const selectedTimeframe = useTradingStore((s) => s.selectedTimeframe);
  const setSelectedTimeframe = useTradingStore((s) => s.setSelectedTimeframe);
  const getPrice = useTradingStore((s) => s.getPrice);
  const price = getPrice(selectedSymbol);
  const { theme, toggleTheme } = useThemeStore();

  const spread = price ? (price.ask - price.bid) : 0;
  const decimals = selectedSymbol.includes('JPY') ? 3 : selectedSymbol.startsWith('BTC') ? 2 : 5;
  const displaySymbol = selectedSymbol.replace(/([A-Z]{3})([A-Z]{3,})/, '$1/$2');

  const dailyChange = useMemo(() => {
    let seed = 0;
    for (let i = 0; i < selectedSymbol.length; i++) seed += selectedSymbol.charCodeAt(i) * (i + 1);
    return ((seed % 200) - 100) / 1000;
  }, [selectedSymbol]);

  return (
    <header className="h-12 bg-card border-b border-border flex items-center px-3 no-select shrink-0">
      {/* Left: Back + Logo */}
      <button
        onClick={() => useNavigationStore.getState().setPage('dashboard')}
        className="flex items-center gap-2 mr-2 px-2 py-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
        title="Back to Dashboard"
      >
        <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-[10px] font-black text-white">TX</span>
        </div>
      </button>

      {/* Navigation tabs — Watchlist / Chart */}
      <div className="flex items-center border-r border-border pr-3 mr-3">
        <NavTab active={view === 'watchlist'} onClick={() => onChangeView('watchlist')} icon="list">
          Watchlist
        </NavTab>
        <NavTab active={view === 'chart'} onClick={() => onChangeView('chart')} icon="chart">
          Chart
        </NavTab>
      </div>

      {/* Symbol info — shown in chart view */}
      {view === 'chart' && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">{displaySymbol}</span>
            <span className={`text-[10px] font-semibold ${dailyChange >= 0 ? 'text-buy' : 'text-sell'}`}>
              {dailyChange >= 0 ? '+' : ''}{(dailyChange * 100).toFixed(2)}%
            </span>
          </div>

          {price && (
            <>
              <div className="w-px h-5 bg-border" />
              {/* Sell price */}
              <button
                onClick={onToggleOrder}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-sell/10 transition-colors group"
              >
                <span className="text-[10px] text-muted-foreground group-hover:text-sell">S</span>
                <span className="text-xs font-mono font-semibold text-sell price-value">{formatPrice(price.bid, decimals)}</span>
              </button>
              {/* Buy price */}
              <button
                onClick={onToggleOrder}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-buy/10 transition-colors group"
              >
                <span className="text-[10px] text-muted-foreground group-hover:text-buy">B</span>
                <span className="text-xs font-mono font-semibold text-buy price-value">{formatPrice(price.ask, decimals)}</span>
              </button>
              <span className="text-[10px] text-muted-foreground">
                spd {(spread / 0.0001).toFixed(1)}
              </span>
            </>
          )}

          {/* Timeframes */}
          <div className="w-px h-5 bg-border ml-1" />
          <div className="flex items-center gap-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf)}
                className={`px-2 py-1 text-[11px] rounded-md font-medium transition-all ${
                  selectedTimeframe === tf
                    ? 'bg-primary text-white'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Live */}
          <div className="flex items-center gap-1 ml-1">
            <div className="w-1.5 h-1.5 rounded-full bg-buy pulse-live" />
            <span className="text-[10px] text-muted-foreground">LIVE</span>
          </div>
        </div>
      )}

      <div className="flex-1" />

      {/* Right side actions */}
      <div className="flex items-center gap-1">
        {/* Toggle order panel (chart view only) */}
        {view === 'chart' && (
          <button
            onClick={onToggleOrder}
            className={`h-8 px-3 flex items-center gap-1.5 rounded-lg text-[11px] font-medium transition-all ${
              showOrder
                ? 'bg-primary/10 text-primary'
                : 'bg-primary text-white hover:bg-primary/90'
            }`}
          >
            {showOrder ? 'Hide Order' : 'Trade'}
          </button>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary/50 transition-colors text-muted-foreground"
          title={theme === 'dark' ? 'Light' : 'Dark'}
        >
          {theme === 'dark' ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* Notifications */}
        <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary/50 transition-colors text-muted-foreground">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>

        {/* User */}
        <button
          onClick={logout}
          className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center hover:bg-primary/25 transition-colors"
          title={`${user?.email} — Logout`}
        >
          <span className="text-[10px] font-bold text-primary">{user?.name?.charAt(0) || 'U'}</span>
        </button>
      </div>
    </header>
  );
}

function NavTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
        active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/30'
      }`}
    >
      {icon === 'list' && (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      )}
      {icon === 'chart' && (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4v16" />
        </svg>
      )}
      {children}
    </button>
  );
}
