'use client';
import { LANGUAGES, type Lang } from '@/lib/i18n';
import { Icon } from './helpers';

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: 'Admin', color: 'bg-purple-500/15 text-purple-400' },
  seller: { label: 'Seller', color: 'bg-blue-500/15 text-blue-400' },
  retention: { label: 'Retention', color: 'bg-orange-500/15 text-orange-400' },
};

const ALL_NAV_ITEMS = [
  { key: 'dashboard', labelKey: 'nav.dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', roles: ['admin', 'seller', 'retention'] },
  { key: 'pipeline', labelKey: 'nav.pipeline', icon: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7', roles: ['admin', 'seller'] },
  { key: 'leads', labelKey: 'nav.leads', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', roles: ['admin', 'seller'] },
  { key: 'tasks', labelKey: 'nav.tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', roles: ['admin', 'seller', 'retention'] },
  { key: 'retention', labelKey: 'nav.retention', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', roles: ['admin', 'retention'] },
  { key: 'emails', labelKey: 'nav.emails', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z', roles: ['admin', 'seller', 'retention'] },
  { key: 'affiliates', labelKey: 'nav.affiliates', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1', roles: ['admin'] },
  { key: 'reports', labelKey: 'nav.reports', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', roles: ['admin'] },
];

export function Sidebar({
  admin, userRole, tab, setTab, department, setDepartment,
  mobileMenu, setMobileMenu, theme, toggleTheme,
  lang, changeLang, T, onLogout,
}: {
  admin: any;
  userRole: string;
  tab: string;
  setTab: (t: any) => void;
  department: 'ALL' | 'SELLER' | 'RETENTION';
  setDepartment: (d: 'ALL' | 'SELLER' | 'RETENTION') => void;
  mobileMenu: boolean;
  setMobileMenu: (b: boolean) => void;
  theme: string;
  toggleTheme: () => void;
  lang: Lang;
  changeLang: (l: Lang) => void;
  T: (key: string) => string;
  onLogout: () => void;
}) {
  const navItems = ALL_NAV_ITEMS.filter(n => n.roles.includes(userRole));

  return (
    <div className={`fixed lg:relative z-50 lg:z-auto w-[260px] lg:w-[220px] bg-card border-r border-border flex flex-col shrink-0 h-full transition-transform lg:translate-x-0 ${mobileMenu ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      {/* Brand */}
      <div className="px-5 py-5 border-b border-border/50">
        <h1 className="text-base font-bold">TradeX<span className="text-primary">CRM</span></h1>
      </div>

      {/* Agent info + role badge */}
      <div className="px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-bold ${userRole === 'seller' ? 'bg-gradient-to-br from-blue-500 to-cyan-600' : userRole === 'retention' ? 'bg-gradient-to-br from-orange-500 to-red-600' : 'bg-gradient-to-br from-indigo-500 to-purple-600'}`}>
            {admin?.name?.[0] || 'A'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate">{admin?.name || 'Admin'}</div>
            <div className="text-[10px] text-muted-foreground truncate">{admin?.email}</div>
          </div>
          <span className={`text-[9px] px-2 py-0.5 rounded-lg font-bold ${ROLE_LABELS[userRole]?.color || ROLE_LABELS.admin.color}`}>
            {ROLE_LABELS[userRole]?.label || 'Admin'}
          </span>
        </div>
      </div>

      {/* Department toggle — admin only */}
      {userRole === 'admin' && (
        <div className="px-4 py-3 border-b border-border/50">
          <label className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider mb-2 block">{T('sidebar.department')}</label>
          <div className="flex rounded-xl bg-secondary/10 p-0.5">
            {(['ALL', 'SELLER', 'RETENTION'] as const).map(d => (
              <button key={d} onClick={() => setDepartment(d)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-all ${department === d ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                {d === 'ALL' ? T('sidebar.all') : d === 'SELLER' ? T('sidebar.seller') : T('sidebar.retention')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-3 px-3 space-y-0.5">
        {navItems.map(item => (
          <button key={item.key} onClick={() => { setTab(item.key); setMobileMenu(false); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[11px] font-medium transition-all ${
              tab === item.key
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/10'
            }`}>
            <Icon d={item.icon} size={16} />
            {T(item.labelKey)}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border/50 space-y-2">
        <div className="flex items-center gap-2 px-1 py-1">
          <span className="text-[10px] text-muted-foreground">{T('sidebar.language')}:</span>
          <select value={lang} onChange={e => changeLang(e.target.value as Lang)}
            className="bg-background border border-border rounded-lg px-2 py-0.5 text-[10px] font-medium focus:outline-none">
            {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        <button onClick={toggleTheme} className="w-full flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1 py-1">
          {theme === 'dark' ? '☀️' : '🌙'} {theme === 'dark' ? T('sidebar.lightMode') : T('sidebar.darkMode')}
        </button>
        <button onClick={onLogout} className="w-full flex items-center gap-2 text-[11px] text-muted-foreground hover:text-red-400 transition-colors px-1 py-1">
          🚪 {T('sidebar.signOut')}
        </button>
      </div>
    </div>
  );
}
