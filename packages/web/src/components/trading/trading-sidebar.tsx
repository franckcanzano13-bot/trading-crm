'use client';
import { useAuthStore } from '@/stores/auth-store';
import { useNavigationStore } from '@/stores/navigation-store';
import { useThemeStore } from '@/stores/theme-store';

const NAV_ITEMS = [
  { key: 'watchlist', label: 'Watchlist', icon: 'star', page: null },
  { key: 'portfolio', label: 'Portfolio', icon: 'briefcase', page: 'dashboard' as const },
  { key: 'history', label: 'History', icon: 'clock', page: 'history' as const },
] as const;

const DISCOVER_ITEMS = [
  { key: 'markets', label: 'Trade Markets', icon: 'trending', page: 'trade' as const },
  { key: 'copy', label: 'Copy People', icon: 'users', page: 'copy' as const },
] as const;

const MORE_ITEMS = [
  { key: 'alerts', label: 'Alerts', icon: 'bell', page: 'alerts' as const },
  { key: 'feed', label: 'News Feed', icon: 'rss', page: 'feed' as const },
  { key: 'settings', label: 'Settings', icon: 'settings', page: 'profile' as const },
  { key: 'help', label: 'Help', icon: 'help', page: 'help' as const },
] as const;

export function TradingSidebar() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const setPage = useNavigationStore((s) => s.setPage);
  const currentPage = useNavigationStore((s) => s.currentPage);

  return (
    <div className="w-[200px] surface-sidebar flex flex-col shrink-0 no-select">
      {/* Logo + back */}
      <div className="px-4 py-4 sidebar-border border-b">
        <button
          onClick={() => setPage('dashboard')}
          className="flex items-center gap-2.5 sidebar-hover rounded-lg px-1 py-0.5 -mx-1 transition-all"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-[11px] font-black text-white tracking-tight">TX</span>
          </div>
          <div>
            <span className="text-sm font-bold block leading-tight">TradeX</span>
            <span className="text-[9px] sidebar-muted leading-none">Trading Platform</span>
          </div>
        </button>
      </div>

      {/* User info */}
      <div className="px-4 py-3 sidebar-border border-b">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400/20 to-blue-600/20 flex items-center justify-center ring-1 ring-white/10">
            <span className="text-xs font-bold text-blue-400">{user?.name?.charAt(0) || 'U'}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">{user?.name || 'Trader'}</div>
            <div className="text-[10px] sidebar-muted truncate">{user?.email}</div>
          </div>
          <div className="w-2 h-2 rounded-full bg-green-500 shadow-sm shadow-green-500/50" title="Online" />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-5 scrollbar-none">
        {/* Main nav */}
        <NavSection>
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.key}
              icon={item.icon}
              active={item.key === 'watchlist' && currentPage === 'trade'}
              onClick={() => item.page ? setPage(item.page) : undefined}
            >
              {item.label}
            </NavItem>
          ))}
        </NavSection>

        {/* Discover */}
        <NavSection label="Discover">
          {DISCOVER_ITEMS.map((item) => (
            <NavItem
              key={item.key}
              icon={item.icon}
              active={currentPage === item.page}
              onClick={() => setPage(item.page)}
            >
              {item.label}
            </NavItem>
          ))}
        </NavSection>

        {/* More */}
        <NavSection label="More">
          {MORE_ITEMS.map((item) => (
            <NavItem
              key={item.key}
              icon={item.icon}
              active={currentPage === item.page}
              onClick={() => setPage(item.page)}
            >
              {item.label}
            </NavItem>
          ))}
        </NavSection>
      </div>

      {/* Bottom: theme + logout */}
      <div className="px-3 py-3 sidebar-border border-t space-y-1">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] sidebar-muted sidebar-hover transition-colors"
        >
          <SidebarIcon name={theme === 'dark' ? 'sun' : 'moon'} />
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <SidebarIcon name="logout" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

function NavSection({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div>
      {label && (
        <div className="text-[9px] font-semibold sidebar-muted uppercase tracking-widest px-3 mb-1.5">
          {label}
        </div>
      )}
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({ icon, active, onClick, children }: { icon: string; active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium transition-all ${
        active
          ? 'sidebar-active'
          : 'sidebar-muted sidebar-hover'
      }`}
    >
      <SidebarIcon name={icon} />
      {children}
    </button>
  );
}

function SidebarIcon({ name }: { name: string }) {
  const cls = "w-4 h-4 shrink-0";
  switch (name) {
    case 'star':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>;
    case 'briefcase':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" /></svg>;
    case 'clock':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    case 'trending':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>;
    case 'users':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
    case 'bell':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>;
    case 'rss':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z" /></svg>;
    case 'settings':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
    case 'help':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    case 'sun':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
    case 'moon':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>;
    case 'logout':
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>;
    default:
      return <div className={cls} />;
  }
}
