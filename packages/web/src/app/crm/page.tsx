'use client';
import { useEffect, useState, useRef, Component, type ReactNode } from 'react';
import { crmApi, adminApi } from '@/lib/api';
import { useThemeStore } from '@/stores/theme-store';
import { t, getLang, setLang, type Lang } from '@/lib/i18n';

import type { Lead, Agent, Affiliate, CrmTask } from '@/components/crm/types';
import { LeadDetail } from '@/components/crm/LeadDetail';
import { Sidebar } from '@/components/crm/Sidebar';
import { TopBar } from '@/components/crm/TopBar';
import { DashboardTab } from '@/components/crm/DashboardTab';
import { PipelineTab } from '@/components/crm/PipelineTab';
import { LeadsTab } from '@/components/crm/LeadsTab';
import { TasksTab } from '@/components/crm/TasksTab';
import { RetentionTab } from '@/components/crm/RetentionTab';
import { EmailsTab } from '@/components/crm/EmailsTab';
import { AffiliatesTab } from '@/components/crm/AffiliatesTab';
import { ReportsTab } from '@/components/crm/ReportsTab';
import { NewLeadModal } from '@/components/crm/NewLeadModal';
import { NewAffiliateModal } from '@/components/crm/NewAffiliateModal';
import { NewProgramModal } from '@/components/crm/NewProgramModal';
import { TemplateEditorModal } from '@/components/crm/TemplateEditorModal';

// Error Boundary to catch and display runtime errors
class CRMErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: any) { console.error('[CRM Error]', error.message, info?.componentStack); }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-8">
          <div className="max-w-lg bg-card border border-red-500/20 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-red-400 mb-2">CRM Error</h2>
            <p className="text-xs text-muted-foreground mb-3">{this.state.error.message}</p>
            <pre className="text-[10px] text-muted-foreground bg-secondary/10 rounded-lg p-3 overflow-auto max-h-40 mb-4">{this.state.error.stack}</pre>
            <button onClick={() => { localStorage.removeItem('crm_session'); window.location.reload(); }}
              className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold">Clear Session & Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ════════════════════════════════════════════
// LOGIN PANEL
// ════════════════════════════════════════════
function LoginPanel({ onLogin }: { onLogin: (token: string, tenantId: string, admin: any) => void }) {
  const [email, setEmail] = useState('admin@dealer.com');
  const [password, setPassword] = useState('dealer123');
  const [tenantId, setTenantId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const saved = localStorage.getItem('crm_session');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        if (s.token) {
          // Validate token not expired
          const payload = JSON.parse(atob(s.token.split('.')[1]));
          if (payload.exp * 1000 > Date.now()) {
            onLogin(s.token, s.tenantId, s.admin);
          } else {
            localStorage.removeItem('crm_session');
          }
        }
      } catch { localStorage.removeItem('crm_session'); }
    }
  }, []);

  const handleLogin = async () => {
    setLoading(true); setError('');
    try {
      const d = await adminApi.login({ email, password, tenant_id: tenantId });
      localStorage.setItem('crm_session', JSON.stringify({ token: d.token, tenantId, admin: d.admin }));
      onLogin(d.token, tenantId, d.admin);
    } catch (e: any) { setError(e.message || 'Login failed'); }
    setLoading(false);
  };

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="min-h-screen flex bg-background">
        {/* Left brand panel */}
        <div className="hidden lg:flex lg:w-[480px] bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-700 flex-col justify-between p-12 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-300 rounded-full blur-3xl" />
          </div>
          <div className="relative z-10">
            <h1 className="text-3xl font-bold text-white">TradeX<span className="text-blue-200">CRM</span></h1>
            <p className="text-blue-100 mt-1 text-sm">Enterprise Broker Management</p>
          </div>
          <div className="relative z-10 space-y-6">
            {[
              { title: 'Lead Pipeline', desc: 'Track every lead from first contact to conversion' },
              { title: '1-Click Calling', desc: 'Call leads instantly with built-in call logging' },
              { title: 'Affiliate Management', desc: 'Track commissions, payouts, and partner performance' },
            ].map((f, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white shrink-0 mt-0.5">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                </div>
                <div><div className="text-white font-semibold text-sm">{f.title}</div><div className="text-blue-200 text-xs">{f.desc}</div></div>
              </div>
            ))}
          </div>
          <div className="relative z-10 text-blue-200 text-xs">© 2026 TradeXLabel</div>
        </div>

        {/* Login form */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-[380px]">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
              <p className="text-sm text-muted-foreground mt-1">Sign in to your CRM dashboard</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Tenant ID</label>
                <input value={tenantId} onChange={e => setTenantId(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email</label>
                <input value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all" />
              </div>
              {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-2"><span className="text-red-400">⚠</span> {error}</div>}
              <button onClick={handleLogin} disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/25 text-sm">
                {loading ? 'Signing in...' : 'Sign In to CRM'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════
// MAIN CRM PAGE
// ════════════════════════════════════════════
export default function CRMPageWrapper() {
  return <CRMErrorBoundary><CRMPageInner /></CRMErrorBoundary>;
}

function CRMPageInner() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => { const saved = getLang(); setLangState(saved); setLang(saved); }, []);
  const changeLang = (l: Lang) => { setLangState(l); setLang(l); };
  const T = (key: string) => t(key, lang);
  const [token, setToken] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [admin, setAdmin] = useState<any>(null);
  const [tab, setTab] = useState<'dashboard' | 'pipeline' | 'leads' | 'tasks' | 'affiliates' | 'retention' | 'emails' | 'reports'>('dashboard');
  const [department, setDepartment] = useState<'ALL' | 'SELLER' | 'RETENTION'>('ALL');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [totalLeads, setTotalLeads] = useState(0);
  const [showNewLead, setShowNewLead] = useState(false);
  const [showNewAffiliate, setShowNewAffiliate] = useState(false);

  // Retention Desk state
  const [dealerClients, setDealerClients] = useState<any[]>([]);
  const [dealerPositions, setDealerPositions] = useState<any[]>([]);
  const [dealerInstruments, setDealerInstruments] = useState<any[]>([]);
  const [dealerSelectedClient, setDealerSelectedClient] = useState('');
  const [dealerSymbol, setDealerSymbol] = useState('');
  const [dealerSide, setDealerSide] = useState<'BUY' | 'SELL'>('BUY');
  const [dealerInvestAmount, setDealerInvestAmount] = useState('100');
  const [dealerOutcome, setDealerOutcome] = useState<'open' | 'win' | 'lose'>('win');
  const [dealerPnl, setDealerPnl] = useState('');
  const [dealerDuration, setDealerDuration] = useState('1');
  const [dealerDurationUnit, setDealerDurationUnit] = useState<'s' | 'm' | 'h'>('m');
  const [dealerReason, setDealerReason] = useState('Retention bonus');
  const [dealerLoading, setDealerLoading] = useState(false);
  const [dealerResult, setDealerResult] = useState<{ ok: boolean; msg: string } | null>(null);
  // Bulk trade state
  const [bulkSelectedMap, setBulkSelectedMap] = useState<Record<string, boolean>>({});
  const bulkSelectedCount = Object.values(bulkSelectedMap).filter(Boolean).length;
  const getBulkSelectedIds = () => Object.keys(bulkSelectedMap).filter(k => bulkSelectedMap[k]);
  const [bulkSymbol, setBulkSymbol] = useState('BTCUSD');
  const [bulkSide, setBulkSide] = useState<'BUY' | 'SELL'>('BUY');
  const [bulkInvestPct, setBulkInvestPct] = useState('10');
  const [bulkOutcome, setBulkOutcome] = useState<'open' | 'win' | 'lose'>('win');
  const [bulkPnlPct, setBulkPnlPct] = useState('15');
  const [bulkDuration, setBulkDuration] = useState('5');
  const [bulkDurationUnit, setBulkDurationUnit] = useState<'s' | 'm' | 'h'>('m');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);
  // Program state
  const [programs, setPrograms] = useState<any[]>([]);
  const [showNewProgram, setShowNewProgram] = useState(false);
  const [retentionTab, setRetentionTab] = useState<'single' | 'bulk' | 'programs'>('bulk');
  // Email state
  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const [brokerConfig, setBrokerConfig] = useState<any>(null);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [reports, setReports] = useState<any>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [filterClientId, setFilterClientId] = useState<string | null>(null);

  // Plain async functions — NO useCallback (MetaMask SES lockdown breaks React hook deps comparison)
  const tokenRef = useRef(token); tokenRef.current = token;
  const tenantIdRef = useRef(tenantId); tenantIdRef.current = tenantId;

  const dealerFetch = async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}${path}`, {
      ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenRef.current}`, 'X-Tenant-ID': tenantIdRef.current, ...(opts.headers as Record<string, string>) },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    return data.data;
  };

  const loadDashboard = async () => { if (!tokenRef.current) return; try { const dep = department === 'ALL' ? undefined : department; const res = await crmApi.getDashboard(tokenRef.current, tenantIdRef.current, dep); setDashboard(res); } catch {} };
  const loadLeads = async () => { if (!tokenRef.current) return; const params: Record<string, string> = { limit: '100' }; if (search) params.search = search; if (statusFilter) params.status = statusFilter; if (department !== 'ALL') params.department = department; try { const res = await crmApi.getLeads(tokenRef.current, tenantIdRef.current, params); setLeads(res?.leads || res || []); setTotalLeads(res?.total || 0); } catch { setLeads([]); } };
  const loadAgents = async () => { if (!tokenRef.current) return; try { const res = await crmApi.getAgents(tokenRef.current, tenantIdRef.current); setAgents(res || []); } catch {} };
  const loadDealerData = async () => { if (!tokenRef.current) return; try { const c = await dealerFetch('/api/v1/dealer/clients'); setDealerClients(c || []); } catch {} try { const p = await dealerFetch('/api/v1/dealer/positions'); setDealerPositions(p || []); } catch {} try { const i = await dealerFetch('/api/v1/admin/instruments'); setDealerInstruments(i || []); } catch {} try { const p = await crmApi.getPrograms(tokenRef.current, tenantIdRef.current); setPrograms(p || []); } catch {} };
  const loadAffiliates = async () => { if (!tokenRef.current) return; try { const res = await crmApi.getAffiliates(tokenRef.current, tenantIdRef.current); setAffiliates(res || []); } catch {} };
  const loadTasks = async () => { if (!tokenRef.current) return; try { const res = await crmApi.getTasks(tokenRef.current, tenantIdRef.current, { my: 'true' }); setTasks(res || []); } catch {} };

  useEffect(() => { if (token) { loadDashboard(); loadLeads(); loadAgents(); loadTasks(); loadAffiliates(); crmApi.getBrokerConfig(tokenRef.current, tenantIdRef.current).then(r => setBrokerConfig(r)).catch(() => {}); } }, [token, department]); // eslint-disable-line
  useEffect(() => { if (token && tab === 'retention') loadDealerData(); }, [token, tab]); // eslint-disable-line
  useEffect(() => {
    if (token && tab === 'emails') {
      crmApi.getEmailTemplates(tokenRef.current, tenantIdRef.current).then(r => setEmailTemplates(r || [])).catch(() => {});
      crmApi.getBrokerConfig(tokenRef.current, tenantIdRef.current).then(r => setBrokerConfig(r)).catch(() => {});
    }
  }, [token, tab]); // eslint-disable-line
  useEffect(() => { if (token) loadLeads(); }, [search, statusFilter]); // eslint-disable-line
  useEffect(() => {
    if (token && tab === 'reports' && !reports && !reportsLoading) {
      setReportsLoading(true);
      crmApi.getReports(tokenRef.current, tenantIdRef.current).then(r => setReports(r)).catch(() => {}).finally(() => setReportsLoading(false));
    }
  }, [token, tab]); // eslint-disable-line
  // Poll notifications every 15s
  useEffect(() => {
    if (!token) return;
    const loadNotif = async () => {
      try { const res = await crmApi.getNotifications(tokenRef.current, tenantIdRef.current); setNotifications(res?.data || res || []); setUnreadCount(res?.unread || 0); } catch {}
    };
    loadNotif();
    const interval = setInterval(loadNotif, 15000);
    return () => clearInterval(interval);
  }, [token]); // eslint-disable-line

  const handleLogin = (t: string, tid: string, a: any) => { setToken(t); setTenantId(tid); setAdmin(a); };
  const handleLogout = () => { localStorage.removeItem('crm_session'); setToken(''); };

  if (!token) return <LoginPanel onLogin={handleLogin} />;

  // ─── Retention handlers ───
  const handleDealerTrade = async () => {
    if (!dealerSelectedClient || !dealerSymbol) return;
    setDealerLoading(true); setDealerResult(null);
    try {
      const pnlCents = dealerOutcome === 'win' ? Math.abs(parseFloat(dealerPnl || '0')) * 100
        : dealerOutcome === 'lose' ? -Math.abs(parseFloat(dealerPnl || '0')) * 100 : undefined;
      let closeAfterSeconds: number | undefined;
      if (pnlCents !== undefined && dealerDuration) {
        const dur = parseFloat(dealerDuration);
        if (dur > 0) closeAfterSeconds = dealerDurationUnit === 'h' ? dur * 3600 : dealerDurationUnit === 'm' ? dur * 60 : dur;
      }
      await dealerFetch('/api/v1/dealer/create-trade', {
        method: 'POST',
        body: JSON.stringify({
          user_id: dealerSelectedClient,
          symbol: dealerSymbol,
          side: dealerSide,
          volume: 0.1,
          invest_amount: parseFloat(dealerInvestAmount) * 100,
          pnl_target: pnlCents,
          close_after_seconds: closeAfterSeconds,
          reason: dealerReason || 'CRM Retention',
        }),
      });
      const client = dealerClients.find(c => c.id === dealerSelectedClient);
      const outStr = dealerOutcome === 'win' ? `WIN +$${dealerPnl}` : dealerOutcome === 'lose' ? `LOSE -$${dealerPnl}` : 'OPEN';
      setDealerResult({ ok: true, msg: `${dealerSide} $${dealerInvestAmount} ${dealerSymbol} for ${client?.name || 'Client'} — ${outStr}` });
      setDealerPnl(''); setDealerReason('Retention bonus');
      loadDealerData();
    } catch (e: any) { setDealerResult({ ok: false, msg: e.message }); }
    setDealerLoading(false);
  };

  const handleCloseDealerTrade = async (tradeId: string, pnlOverride?: number) => {
    try {
      await dealerFetch(`/api/v1/dealer/close-trade/${tradeId}`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Closed from CRM Retention', pnl_override: pnlOverride }),
      });
      loadDealerData();
    } catch {}
  };

  const handleBulkTrade = async () => {
    if (bulkSelectedCount === 0) return;
    setBulkLoading(true); setBulkResult(null);
    try {
      let closeAfterSeconds: number | undefined;
      if (bulkOutcome !== 'open' && bulkDuration) {
        const dur = parseFloat(bulkDuration);
        closeAfterSeconds = bulkDurationUnit === 'h' ? dur * 3600 : bulkDurationUnit === 'm' ? dur * 60 : dur;
      }
      const res = await crmApi.bulkTrade(token, tenantId, {
        client_ids: getBulkSelectedIds(),
        symbol: bulkSymbol,
        side: bulkSide,
        invest_pct: parseFloat(bulkInvestPct),
        outcome: bulkOutcome,
        pnl_pct: bulkOutcome !== 'open' ? parseFloat(bulkPnlPct) : undefined,
        close_after_seconds: closeAfterSeconds,
        reason: 'Bulk trade from CRM',
      });
      setBulkResult(res);
      loadDealerData();
    } catch (e: any) { setBulkResult({ error: e.message }); }
    setBulkLoading(false);
  };

  // ─── LAYOUT ───
  const userRole = admin?.role || 'admin';

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="min-h-screen flex bg-background text-foreground">
        {/* Mobile overlay */}
        {mobileMenu && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileMenu(false)} />}

        {/* Sidebar */}
        <Sidebar
          admin={admin}
          userRole={userRole}
          tab={tab}
          setTab={setTab}
          department={department}
          setDepartment={setDepartment}
          mobileMenu={mobileMenu}
          setMobileMenu={setMobileMenu}
          theme={theme}
          toggleTheme={toggleTheme}
          lang={lang}
          changeLang={changeLang}
          T={T}
          onLogout={handleLogout}
        />

        {/* Main content */}
        <div className="flex-1 overflow-auto">
          {/* Top bar */}
          <TopBar
            tab={tab}
            department={department}
            setMobileMenu={setMobileMenu}
            token={tokenRef.current}
            tenantId={tenantIdRef.current}
            notifications={notifications}
            unreadCount={unreadCount}
            setUnreadCount={setUnreadCount}
            showNotifications={showNotifications}
            setShowNotifications={setShowNotifications}
            setSelectedLead={setSelectedLead}
            T={T}
          />

          {/* Content */}
          <div className="p-3 lg:p-6">
            {tab === 'dashboard' && <DashboardTab dashboard={dashboard} T={T} />}
            {tab === 'pipeline' && <PipelineTab leads={leads} brokerConfig={brokerConfig} onSelectLead={setSelectedLead} />}
            {tab === 'leads' && (
              <LeadsTab
                leads={leads}
                totalLeads={totalLeads}
                search={search}
                setSearch={setSearch}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                department={department}
                agents={agents}
                brokerConfig={brokerConfig}
                token={token}
                tenantId={tenantId}
                onSelectLead={setSelectedLead}
                onShowNewLead={() => setShowNewLead(true)}
                onLoadLeads={loadLeads}
                onLoadDashboard={loadDashboard}
                T={T}
              />
            )}
            {tab === 'tasks' && (
              <TasksTab tasks={tasks} token={token} tenantId={tenantId} onLoadTasks={loadTasks} />
            )}
            {tab === 'affiliates' && (
              <AffiliatesTab affiliates={affiliates} onShowNewAffiliate={() => setShowNewAffiliate(true)} />
            )}
            {tab === 'reports' && (
              <ReportsTab
                reports={reports}
                reportsLoading={reportsLoading}
                token={tokenRef.current}
                tenantId={tenantIdRef.current}
                setReports={setReports}
                setReportsLoading={setReportsLoading}
                T={T}
              />
            )}
            {tab === 'retention' && (
              <RetentionTab
                token={token}
                tenantId={tenantId}
                dealerClients={dealerClients}
                dealerPositions={dealerPositions}
                dealerInstruments={dealerInstruments}
                programs={programs}
                dealerSelectedClient={dealerSelectedClient}
                setDealerSelectedClient={setDealerSelectedClient}
                dealerSymbol={dealerSymbol}
                setDealerSymbol={setDealerSymbol}
                dealerSide={dealerSide}
                setDealerSide={setDealerSide}
                dealerInvestAmount={dealerInvestAmount}
                setDealerInvestAmount={setDealerInvestAmount}
                dealerOutcome={dealerOutcome}
                setDealerOutcome={setDealerOutcome}
                dealerPnl={dealerPnl}
                setDealerPnl={setDealerPnl}
                dealerDuration={dealerDuration}
                setDealerDuration={setDealerDuration}
                dealerDurationUnit={dealerDurationUnit}
                setDealerDurationUnit={setDealerDurationUnit}
                dealerReason={dealerReason}
                setDealerReason={setDealerReason}
                dealerLoading={dealerLoading}
                dealerResult={dealerResult}
                bulkSelectedMap={bulkSelectedMap}
                setBulkSelectedMap={setBulkSelectedMap}
                bulkSymbol={bulkSymbol}
                setBulkSymbol={setBulkSymbol}
                bulkSide={bulkSide}
                setBulkSide={setBulkSide}
                bulkInvestPct={bulkInvestPct}
                setBulkInvestPct={setBulkInvestPct}
                bulkOutcome={bulkOutcome}
                setBulkOutcome={setBulkOutcome}
                bulkPnlPct={bulkPnlPct}
                setBulkPnlPct={setBulkPnlPct}
                bulkDuration={bulkDuration}
                setBulkDuration={setBulkDuration}
                bulkDurationUnit={bulkDurationUnit}
                setBulkDurationUnit={setBulkDurationUnit}
                bulkLoading={bulkLoading}
                bulkResult={bulkResult}
                retentionTab={retentionTab}
                setRetentionTab={setRetentionTab}
                filterClientId={filterClientId}
                setFilterClientId={setFilterClientId}
                onShowNewProgram={() => setShowNewProgram(true)}
                onDealerTrade={handleDealerTrade}
                onCloseDealerTrade={handleCloseDealerTrade}
                onBulkTrade={handleBulkTrade}
                onLoadDealerData={loadDealerData}
              />
            )}
            {tab === 'emails' && (
              <EmailsTab
                emailTemplates={emailTemplates}
                setEmailTemplates={setEmailTemplates}
                brokerConfig={brokerConfig}
                setBrokerConfig={setBrokerConfig}
                userRole={userRole}
                token={tokenRef.current}
                tenantId={tenantIdRef.current}
                onShowTemplateEditor={(tpl) => { setEditingTemplate(tpl); setShowTemplateEditor(true); }}
              />
            )}
          </div>
        </div>

        {/* Modals & Slide-overs */}
        {selectedLead && (
          <LeadDetail
            lead={selectedLead}
            agents={agents}
            token={token}
            tenantId={tenantId}
            onClose={() => setSelectedLead(null)}
            onRefresh={() => { loadLeads(); loadDashboard(); }}
            sipDomain={brokerConfig?.sip_domain || ''}
          />
        )}
        {showNewLead && (
          <NewLeadModal
            token={token}
            tenantId={tenantId}
            department={department}
            onClose={() => setShowNewLead(false)}
            onLoadLeads={loadLeads}
            onLoadDashboard={loadDashboard}
          />
        )}
        {showNewAffiliate && (
          <NewAffiliateModal
            token={token}
            tenantId={tenantId}
            onClose={() => setShowNewAffiliate(false)}
            onLoadAffiliates={loadAffiliates}
          />
        )}
        {showTemplateEditor && (
          <TemplateEditorModal
            editingTemplate={editingTemplate}
            token={tokenRef.current}
            tenantId={tenantIdRef.current}
            onClose={() => setShowTemplateEditor(false)}
            setEmailTemplates={setEmailTemplates}
          />
        )}
        {showNewProgram && (
          <NewProgramModal
            token={token}
            tenantId={tenantId}
            getBulkSelectedIds={getBulkSelectedIds}
            bulkSelectedCount={bulkSelectedCount}
            onClose={() => setShowNewProgram(false)}
            onLoadDealerData={loadDealerData}
          />
        )}
      </div>
    </div>
  );
}
