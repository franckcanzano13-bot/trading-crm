'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useTradingStore } from '@/stores/trading-store';
import { useThemeStore } from '@/stores/theme-store';
import { accountApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

export function TradingTopBar() {
  const { token, tenantId } = useAuthStore();
  const [account, setAccount] = useState<any>(null);
  const [search, setSearch] = useState('');
  const instruments = useTradingStore((s) => s.instruments);
  const setSelectedSymbol = useTradingStore((s) => s.setSelectedSymbol);

  useEffect(() => {
    if (!token || !tenantId) return;
    const load = () => accountApi.getAccount(token, tenantId).then(setAccount).catch(() => {});
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [token, tenantId]);

  // Search results
  const searchResults = search.length > 0
    ? instruments.filter(
        (i) => i.symbol.toLowerCase().includes(search.toLowerCase()) || i.display_name.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 5)
    : [];

  const free = account ? Number(account.equity) - Number(account.margin_used) : 0;

  return (
    <div className="h-12 surface-topbar border-b border-border flex items-center px-4 shrink-0 no-select gap-4">
      {/* Search */}
      <div className="relative w-56">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search instruments..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={() => setTimeout(() => setSearch(''), 200)}
          className="w-full bg-secondary/40 rounded-lg text-xs pl-8 pr-3 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30 border border-border/50"
        />
        {/* Search dropdown */}
        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
            {searchResults.map((inst) => (
              <button
                key={inst.symbol}
                onMouseDown={() => {
                  setSelectedSymbol(inst.symbol);
                  setSearch('');
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-secondary/30 transition-colors text-left"
              >
                <span className="text-xs font-semibold">{inst.display_name}</span>
                <span className="text-[10px] text-muted-foreground">{inst.symbol}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-border/50" />

      {/* Account stats */}
      {account && (
        <div className="flex items-center gap-5 text-[11px]">
          <StatItem label="Available" value={formatCurrency(String(free))} highlight />
          <StatItem label="Balance" value={formatCurrency(account.balance)} />
          <StatItem label="Equity" value={formatCurrency(account.equity)} />
          <StatItem label="Margin" value={formatCurrency(account.margin_used)} warning={Number(account.margin_used) > 0} />
        </div>
      )}

      <div className="flex-1" />

      {/* Live indicator */}
      <div className="flex items-center gap-1.5 mr-2">
        <div className="w-1.5 h-1.5 rounded-full bg-green-500 pulse-live" />
        <span className="text-[10px] text-muted-foreground font-medium">LIVE</span>
      </div>

      {/* Theme toggle */}
      <ThemeButton />

      {/* Notification bell */}
      <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary/40 transition-colors text-muted-foreground relative">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-blue-500" />
      </button>
    </div>
  );
}

function ThemeButton() {
  const { theme, toggleTheme } = useThemeStore();
  return (
    <button onClick={toggleTheme} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary/40 transition-colors text-muted-foreground" title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
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
  );
}

function StatItem({ label, value, highlight, warning }: { label: string; value: string; highlight?: boolean; warning?: boolean }) {
  return (
    <div className="text-center">
      <div className={`font-mono font-bold price-value text-[13px] ${
        highlight ? 'text-foreground' : warning ? 'text-amber-500' : 'text-foreground/80'
      }`}>
        {value}
      </div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}
