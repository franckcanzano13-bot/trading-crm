'use client';
import type { Lang } from '@/lib/i18n';
import { fmt, AVATAR_COLORS } from './helpers';

export function DashboardTab({ dashboard, T }: {
  dashboard: any;
  T: (key: string) => string;
}) {
  if (!dashboard) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading dashboard...</div>;
  const d = dashboard;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: T('header.totalLeads'), value: String(d.total_leads ?? 0), icon: '👥', gradient: 'from-blue-500/10 to-indigo-500/10 border-blue-500/20' },
          { label: T('header.myLeads'), value: String(d.my_leads ?? 0), icon: '🎯', gradient: 'from-purple-500/10 to-violet-500/10 border-purple-500/20' },
          { label: T('header.ftdVolume'), value: fmt(d.total_ftd_amount ?? 0), icon: '💰', gradient: 'from-emerald-500/10 to-green-500/10 border-emerald-500/20' },
          { label: 'FTDs', value: String(d.total_ftd_count ?? 0), icon: '✅', gradient: 'from-green-500/10 to-teal-500/10 border-green-500/20' },
          { label: T('header.todayCalls'), value: String(d.today_calls ?? 0), icon: '📞', gradient: 'from-cyan-500/10 to-blue-500/10 border-cyan-500/20' },
          { label: T('header.todayTasks'), value: String(d.today_tasks ?? 0), icon: '📋', gradient: 'from-amber-500/10 to-orange-500/10 border-amber-500/20' },
          { label: T('header.overdue'), value: String(d.overdue_tasks ?? 0), icon: '⚠️', gradient: 'from-red-500/10 to-rose-500/10 border-red-500/20' },
          { label: 'Affiliates', value: String(d.total_affiliates ?? 0), icon: '🤝', gradient: 'from-indigo-500/10 to-purple-500/10 border-indigo-500/20' },
        ].map((card, i) => (
          <div key={i} className={`bg-gradient-to-br ${card.gradient} border rounded-2xl px-5 py-4`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{card.label}</span>
              <span className="text-base">{card.icon}</span>
            </div>
            <div className="text-2xl font-bold mt-2">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline funnel */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-bold mb-4">{T('header.conversionPipeline')}</h3>
          <div className="space-y-2">
            {(Array.isArray(d.pipeline) ? d.pipeline : []).map((stage: any, i: number) => {
              const max = Math.max(...(d.pipeline || []).map((s: any) => s.count), 1);
              const pct = (stage.count / max) * 100;
              return (
                <div key={stage.stage} className="flex items-center gap-3">
                  <span className="text-[10px] font-medium w-20 text-muted-foreground">{stage.stage}</span>
                  <div className="flex-1 h-7 bg-secondary/10 rounded-lg overflow-hidden">
                    <div className="h-full rounded-lg flex items-center px-3 transition-all duration-500" style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: stage.color }}>
                      <span className="text-[10px] font-bold text-white">{stage.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-bold mb-4">{T('header.agentLeaderboard')}</h3>
          <div className="space-y-3">
            {(Array.isArray(d.leaderboard) ? d.leaderboard : []).slice(0, 6).map((a: any, i: number) => (
              <div key={a.agent_id} className="flex items-center gap-3">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? 'bg-yellow-500/20 text-yellow-400' : i === 1 ? 'bg-slate-400/20 text-slate-300' : i === 2 ? 'bg-orange-500/20 text-orange-400' : 'bg-secondary/20 text-muted-foreground'}`}>{i + 1}</span>
                <div className={`w-8 h-8 rounded-lg ${AVATAR_COLORS[i % AVATAR_COLORS.length]} flex items-center justify-center text-white text-[10px] font-bold`}>{String(a.name || '?').split(' ').map((n: string) => n[0]).join('')}</div>
                <div className="flex-1">
                  <div className="text-xs font-semibold">{a.name}</div>
                  <div className="text-[10px] text-muted-foreground">{a.email}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold">{a.leads}</div>
                  <div className="text-[9px] text-muted-foreground">leads</div>
                </div>
              </div>
            ))}
            {(!d.leaderboard || d.leaderboard.length === 0) && <div className="text-xs text-muted-foreground text-center py-4">No agents assigned yet</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
