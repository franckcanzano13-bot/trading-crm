'use client';
import { useState, useRef, useEffect } from 'react';
import { useNavigationStore } from '@/stores/navigation-store';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';

const SEARCH_ITEMS = [
  { label: 'EUR/USD', type: 'instrument', page: 'trade' as const },
  { label: 'GBP/USD', type: 'instrument', page: 'trade' as const },
  { label: 'USD/JPY', type: 'instrument', page: 'trade' as const },
  { label: 'XAU/USD (Gold)', type: 'instrument', page: 'trade' as const },
  { label: 'BTC/USD', type: 'instrument', page: 'trade' as const },
  { label: 'ETH/USD', type: 'instrument', page: 'trade' as const },
  { label: 'S&P 500', type: 'instrument', page: 'trade' as const },
  { label: 'Dashboard', type: 'page', page: 'dashboard' as const },
  { label: 'Deposit Funds', type: 'page', page: 'deposit' as const },
  { label: 'Withdraw Funds', type: 'page', page: 'deposit' as const },
  { label: 'Trade History', type: 'page', page: 'history' as const },
  { label: 'Social Feed', type: 'page', page: 'feed' as const },
  { label: 'Copy Trading', type: 'page', page: 'copy' as const },
  { label: 'Price Alerts', type: 'page', page: 'alerts' as const },
  { label: 'Profile Settings', type: 'page', page: 'profile' as const },
];

const NAV_ITEMS = [
  {
    key: 'dashboard' as const, label: 'Dashboard',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  },
  {
    key: 'trade' as const, label: 'Trade',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
  },
  {
    key: 'feed' as const, label: 'Social Feed',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" /></svg>,
  },
  {
    key: 'copy' as const, label: 'Copy Trading',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  },
  {
    key: 'deposit' as const, label: 'Funds',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    key: 'alerts' as const, label: 'Price Alerts',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>,
  },
  {
    key: 'history' as const, label: 'History',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    key: 'profile' as const, label: 'Settings',
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  },
];

export function ClientSidebar() {
  const { currentPage, setPage } = useNavigationStore();
  const { user, logout, accountMode, setAccountMode } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchResults = searchQuery.length > 0
    ? SEARCH_ITEMS.filter((item) => item.label.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 6)
    : [];

  return (
    <aside className="w-[240px] surface-sidebar flex flex-col shrink-0 no-select border-r sidebar-border">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <span className="text-xs font-black text-white">TX</span>
        </div>
        <div>
          <div className="text-sm font-bold leading-tight">TradeXLabel</div>
          <div className="text-[10px] sidebar-muted leading-tight">Trading Platform</div>
        </div>
      </div>

      {/* Demo / Real switch */}
      <div className="px-4 pb-3">
        <div className="flex rounded-xl p-1 gap-1" style={{ backgroundColor: 'hsl(var(--surface-sidebar-hover))' }}>
          <button
            onClick={() => setAccountMode('real')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              accountMode === 'real'
                ? 'bg-green-500 text-white shadow-md'
                : 'sidebar-muted hover:text-white/80'
            }`}
          >
            Real Account
          </button>
          <button
            onClick={() => setAccountMode('demo')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              accountMode === 'demo'
                ? 'bg-blue-500 text-white shadow-md'
                : 'sidebar-muted hover:text-white/80'
            }`}
          >
            Demo $100K
          </button>
        </div>
      </div>

      {/* Universal Search */}
      <div className="px-4 pb-3 relative" ref={searchRef}>
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sidebar-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search..."
            className="w-full rounded-lg text-xs pl-9 pr-3 py-2 placeholder:opacity-40 focus:outline-none focus:ring-1 transition-all border"
            style={{
              backgroundColor: 'hsl(var(--surface-sidebar-hover))',
              borderColor: 'hsl(var(--surface-sidebar-border))',
              color: 'hsl(var(--surface-sidebar-fg))',
            }}
          />
        </div>
        {searchOpen && searchResults.length > 0 && (
          <div className="absolute left-4 right-4 mt-2 bg-card rounded-xl shadow-xl z-50 overflow-hidden p-1 text-foreground">
            {searchResults.map((item, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setPage(item.page);
                  setSearchQuery('');
                  setSearchOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs rounded-lg hover:bg-secondary/50 transition-colors text-left"
              >
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${
                  item.type === 'instrument' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'
                }`}>
                  {item.type === 'instrument' ? 'INSTR' : 'PAGE'}
                </span>
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-3 space-y-0.5 overflow-y-auto scrollbar-none">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => setPage(item.key)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
              currentPage === item.key
                ? 'sidebar-active'
                : 'sidebar-muted sidebar-hover'
            }`}
          >
            <span className={currentPage === item.key ? '' : 'opacity-60'}>{item.icon}</span>
            {item.label}
            {currentPage === item.key && (
              <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'hsl(var(--surface-sidebar-active))' }} />
            )}
          </button>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="p-3 space-y-1 sidebar-border border-t">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs sidebar-muted sidebar-hover transition-all"
        >
          {theme === 'dark' ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
          )}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>

        {/* User card */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ backgroundColor: 'hsl(var(--surface-sidebar-hover))' }}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400/30 to-blue-600/30 flex items-center justify-center ring-1 ring-white/10 shrink-0">
            <span className="text-[11px] font-bold text-blue-400">{user?.name?.charAt(0) || 'U'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold truncate">{user?.name || 'Trader'}</div>
            <div className="text-[10px] sidebar-muted truncate">{user?.email}</div>
          </div>
          <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm shadow-green-500/50" />
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
