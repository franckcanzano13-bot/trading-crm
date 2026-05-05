'use client';
import { crmApi } from '@/lib/api';
import { fmt } from './helpers';

export function ReportsTab({ reports, reportsLoading, token, tenantId, setReports, setReportsLoading, T }: {
  reports: any;
  reportsLoading: boolean;
  token: string;
  tenantId: string;
  setReports: (r: any) => void;
  setReportsLoading: (b: boolean) => void;
  T: (key: string) => string;
}) {
  if (reportsLoading || !reports) return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Loading reports...</div>;
  const r = reports;
  const maxDailyVol = Math.max(...(r.daily_stats || []).map((d: any) => d.volume), 1);
  const maxDailyPnl = Math.max(...(r.daily_stats || []).map((d: any) => Math.abs(d.pnl)), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: T('reports.volumeToday'), value: `${r.total_volume_today?.toFixed(2) || '0'} lots`, icon: '📊', gradient: 'from-blue-500/10 to-indigo-500/10 border-blue-500/20' },
          { label: T('reports.pnlToday'), value: fmt(r.total_pnl_today || 0), icon: r.total_pnl_today >= 0 ? '📈' : '📉', gradient: r.total_pnl_today >= 0 ? 'from-green-500/10 to-emerald-500/10 border-green-500/20' : 'from-red-500/10 to-rose-500/10 border-red-500/20' },
          { label: T('reports.depositsToday'), value: fmt(r.total_deposits_today || 0), icon: '💰', gradient: 'from-emerald-500/10 to-green-500/10 border-emerald-500/20' },
          { label: T('reports.withdrawalsToday'), value: fmt(r.total_withdrawals_today || 0), icon: '💸', gradient: 'from-amber-500/10 to-orange-500/10 border-amber-500/20' },
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
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-bold mb-4">{T('reports.topInstruments')}</h3>
          {(r.top_instruments || []).length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">No trade data yet</div>
          ) : (
            <div className="space-y-2">
              {(r.top_instruments || []).map((inst: any) => {
                const maxCount = Math.max(...(r.top_instruments || []).map((x: any) => x.count), 1);
                const pct = (inst.count / maxCount) * 100;
                return (
                  <div key={inst.symbol} className="flex items-center gap-3">
                    <span className="text-[11px] font-mono font-semibold w-24 shrink-0">{inst.symbol}</span>
                    <div className="flex-1 h-6 bg-secondary/10 rounded-lg overflow-hidden">
                      <div className="h-full rounded-lg flex items-center px-2 bg-indigo-500/30" style={{ width: `${Math.max(pct, 8)}%` }}>
                        <span className="text-[9px] font-bold text-indigo-300">{inst.count} trades</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground w-16 text-right">{inst.volume.toFixed(2)}L</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-sm font-bold mb-4">{T('reports.dailyVolume')}</h3>
          {(r.daily_stats || []).length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">No data</div>
          ) : (
            <div className="flex items-end gap-[2px] h-40">
              {(r.daily_stats || []).map((d: any) => {
                const h = maxDailyVol > 0 ? (d.volume / maxDailyVol) * 100 : 0;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center justify-end group relative" style={{ minWidth: 0 }}>
                    <div className="w-full rounded-t bg-blue-500/60 hover:bg-blue-500/80 transition-colors" style={{ height: `${Math.max(h, 2)}%` }} />
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-card border border-border rounded-lg px-2 py-1 text-[9px] z-10 whitespace-nowrap shadow-lg">
                      <div className="font-semibold">{d.date}</div>
                      <div>{d.trades} trades | {d.volume.toFixed(2)}L</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-sm font-bold mb-4">{T('reports.dailyPnl')}</h3>
        {(r.daily_stats || []).length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6">No data</div>
        ) : (
          <div className="flex items-center gap-[2px] h-32">
            {(r.daily_stats || []).map((d: any) => {
              const h = maxDailyPnl > 0 ? (Math.abs(d.pnl) / maxDailyPnl) * 50 : 0;
              const isPos = d.pnl >= 0;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center justify-center group relative" style={{ minWidth: 0, height: '100%' }}>
                  <div className="flex flex-col items-center justify-center" style={{ height: '100%', position: 'relative' }}>
                    <div
                      className={`w-full rounded ${isPos ? 'bg-green-500/60' : 'bg-red-500/60'}`}
                      style={{
                        height: `${Math.max(h, 1)}%`,
                        position: 'absolute',
                        ...(isPos ? { bottom: '50%' } : { top: '50%' }),
                      }}
                    />
                  </div>
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-card border border-border rounded-lg px-2 py-1 text-[9px] z-10 whitespace-nowrap shadow-lg">
                    <div className="font-semibold">{d.date}</div>
                    <div className={d.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>P&L: {fmt(d.pnl)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-center mt-1">
          <div className="w-full h-px bg-border" />
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={() => { setReports(null); setReportsLoading(true); crmApi.getReports(token, tenantId).then(r => setReports(r)).catch(() => {}).finally(() => setReportsLoading(false)); }}
          className="text-[10px] px-4 py-2 rounded-xl bg-secondary/20 text-muted-foreground hover:text-foreground font-semibold border border-border">
          {T('btn.refreshReports')}
        </button>
      </div>
    </div>
  );
}
