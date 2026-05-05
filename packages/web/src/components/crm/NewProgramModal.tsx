'use client';
import { useState } from 'react';
import { crmApi } from '@/lib/api';

export function NewProgramModal({ token, tenantId, getBulkSelectedIds, bulkSelectedCount, onClose, onLoadDealerData }: {
  token: string;
  tenantId: string;
  getBulkSelectedIds: () => string[];
  bulkSelectedCount: number;
  onClose: () => void;
  onLoadDealerData: () => void;
}) {
  const [pf, setPf] = useState({ name: '', client_ids: getBulkSelectedIds(), instrument_type: 'CRYPTO', target_pct: 45, invest_pct: 10, period: '1M', trades_per_day: 3, min_trade_pct: -8, max_trade_pct: 20 });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true); setErr('');
    try {
      const ids = pf.client_ids.length > 0 ? pf.client_ids : getBulkSelectedIds();
      if (ids.length === 0) { setErr('Select clients first (in Bulk Trade tab)'); setSaving(false); return; }
      await crmApi.createProgram(token, tenantId, { ...pf, client_ids: ids });
      onClose(); onLoadDealerData();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-card border border-border rounded-2xl p-6 w-[480px] shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold mb-4 flex items-center gap-2"><span>🤖</span> New Auto-Trader Program</h3>
        <div className="space-y-3">
          <div><label className="text-[10px] text-muted-foreground mb-1 block">Program Name</label><input value={pf.name} onChange={e => setPf({ ...pf, name: e.target.value })} placeholder="e.g. Crypto +45% / 1 month" className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Asset Type</label>
              <select value={pf.instrument_type} onChange={e => setPf({ ...pf, instrument_type: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs">
                {['CRYPTO', 'FOREX', 'INDICES', 'COMMODITIES', 'ALL'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Period</label>
              <select value={pf.period} onChange={e => setPf({ ...pf, period: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs">
                {['1W', '2W', '1M', '2M', '3M'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Target Gain %</label><input type="number" value={pf.target_pct} onChange={e => setPf({ ...pf, target_pct: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs font-mono" /></div>
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Invest % / trade</label><input type="number" value={pf.invest_pct} onChange={e => setPf({ ...pf, invest_pct: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs font-mono" /></div>
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Trades / day</label><input type="number" value={pf.trades_per_day} onChange={e => setPf({ ...pf, trades_per_day: Number(e.target.value) })} min={1} max={10} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs font-mono" /></div>
          </div>
          <div className="bg-secondary/5 rounded-xl p-3 text-[10px] text-muted-foreground">
            <strong className="text-foreground">Clients:</strong> {pf.client_ids.length > 0 ? `${pf.client_ids.length} selected` : `${bulkSelectedCount} from Bulk Trade selection`}
            <br /><strong className="text-foreground">Algorithm:</strong> The system creates {pf.trades_per_day} trades/day mixing wins and losses to reach +{pf.target_pct}% over the period naturally.
          </div>
          {err && <div className="text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2">{err}</div>}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-secondary/20 text-xs">Cancel</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-xs font-semibold disabled:opacity-50">{saving ? 'Creating...' : 'Create Program'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
