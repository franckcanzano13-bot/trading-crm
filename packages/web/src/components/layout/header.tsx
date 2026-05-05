'use client';
import { useAuthStore } from '@/stores/auth-store';
import { useTradingStore } from '@/stores/trading-store';
import { useThemeStore } from '@/stores/theme-store';
import { useNavigationStore } from '@/stores/navigation-store';
import { formatPrice, formatCurrency } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { accountApi } from '@/lib/api';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

export function Header() {
  const { user, logout, token, tenantId } = useAuthStore();
  const selectedSymbol = useTradingStore((s) => s.selectedSymbol);
  const selectedTimeframe = useTradingStore((s) => s.selectedTimeframe);
  const setSelectedTimeframe = useTradingStore((s) => s.setSelectedTimeframe);
  const getPrice = useTradingStore((s) => s.getPrice);
  const price = getPrice(selectedSymbol);
  const { theme, toggleTheme } = useThemeStore();
  const [account, setAccount] = useState<any>(null);

  useEffect(() => {
    if (!token || !tenantId) return;
    const load = () => {
      accountApi.getAccount(token, tenantId).then(setAccount).catch(() => {});
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [token, tenantId]);

  const spread = price ? (price.ask - price.bid) : 0;
  const decimals = selectedSymbol.includes('JPY') ? 3 : selectedSymbol.startsWith('BTC') ? 2 : 5;

  return (
    <header className="h-11 bg-[hsl(var(--surface-header))] border-b border-border flex items-center px-3 no-select shrink-0">
      {/* Back button + Logo */}
      <button
        onClick={() => useNavigationStore.getState().setPage('dashboard')}
        className="flex items-center gap-2 mr-3 px-2 py-1 rounded-lg hover:bg-secondary/50 transition-colors group"
        title="Back to Dashboard"
      >
        <svg className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-[10px] font-black text-white">TX</span>
        </div>
      </button>

      <div className="w-px h-6 bg-border mr-3" />

      {/* Symbol info */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold">{selectedSymbol.replace(/([A-Z]{3})([A-Z]{3,})/, '$1/$2')}</span>
        {price && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase text-muted-foreground">Bid</span>
              <span className="text-xs font-mono text-sell price-value">{formatPrice(price.bid, decimals)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase text-muted-foreground">Ask</span>
              <span className="text-xs font-mono text-buy price-value">{formatPrice(price.ask, decimals)}</span>
            </div>
            <span className="text-[10px] text-muted-foreground ml-1">
              Spd: {formatPrice(spread, decimals)}
            </span>
          </div>
        )}
      </div>

      {/* Timeframes */}
      <div className="flex items-center gap-0.5 ml-4 bg-secondary/50 rounded p-0.5">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setSelectedTimeframe(tf)}
            className={`px-2 py-0.5 text-[11px] rounded font-medium transition-all ${
              selectedTimeframe === tf
                ? 'bg-primary text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-1.5 ml-3">
        <div className="w-1.5 h-1.5 rounded-full bg-buy pulse-live" />
        <span className="text-[10px] text-muted-foreground">LIVE</span>
      </div>

      <div className="flex-1" />

      {/* Account summary in header */}
      {account && (
        <div className="hidden lg:flex items-center gap-4 mr-4">
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground leading-none">Balance</div>
            <div className="text-xs font-semibold price-value">{formatCurrency(account.balance)}</div>
          </div>
          <div className="w-px h-6 bg-border" />
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground leading-none">Equity</div>
            <div className="text-xs font-semibold price-value">{formatCurrency(account.equity)}</div>
          </div>
          <div className="w-px h-6 bg-border" />
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground leading-none">Margin</div>
            <div className="text-xs font-semibold price-value">{formatCurrency(account.margin_used)}</div>
          </div>
          <div className="w-px h-6 bg-border" />
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground leading-none">Free</div>
            <div className="text-xs font-semibold price-value text-buy">
              {formatCurrency(String(Number(account.equity) - Number(account.margin_used)))}
            </div>
          </div>
        </div>
      )}

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-secondary transition-colors mr-2"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? (
          <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </button>

      {/* User menu */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
          <span className="text-[10px] font-bold text-primary">{user?.name?.charAt(0) || 'U'}</span>
        </div>
        <span className="text-[11px] text-muted-foreground hidden sm:block">{user?.email}</span>
        <button
          onClick={logout}
          className="text-[10px] text-muted-foreground hover:text-sell transition-colors ml-1 px-2 py-1 rounded hover:bg-sell/10"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
