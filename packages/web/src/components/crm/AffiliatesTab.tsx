'use client';
import type { Affiliate } from './types';
import { fmt, avatarColor, PlusIcon } from './helpers';

export function AffiliatesTab({ affiliates, onShowNewAffiliate }: {
  affiliates: Affiliate[];
  onShowNewAffiliate: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Affiliates & Partners</h3>
        <button onClick={onShowNewAffiliate} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20"><PlusIcon /> New Affiliate</button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {affiliates.map(a => (
          <div key={a.id} className="bg-card border border-border rounded-2xl p-5 hover:border-primary/20 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl ${avatarColor(a.id)} flex items-center justify-center text-white font-bold text-sm`}>{a.name[0]}</div>
              <div className="flex-1">
                <div className="text-sm font-bold">{a.name}</div>
                <div className="text-[10px] text-muted-foreground">{a.company || a.email}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${a.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{a.status}</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-secondary/5 rounded-lg py-2"><div className="text-lg font-bold">{String(a.total_leads ?? 0)}</div><div className="text-[9px] text-muted-foreground">Leads</div></div>
              <div className="bg-secondary/5 rounded-lg py-2"><div className="text-lg font-bold text-emerald-400">{String(a.total_ftds ?? 0)}</div><div className="text-[9px] text-muted-foreground">FTDs</div></div>
              <div className="bg-secondary/5 rounded-lg py-2"><div className="text-sm font-bold">{fmt(a.total_commission)}</div><div className="text-[9px] text-muted-foreground">Earned</div></div>
              <div className="bg-secondary/5 rounded-lg py-2"><div className="text-sm font-bold text-amber-400">{fmt(a.total_paid)}</div><div className="text-[9px] text-muted-foreground">Paid</div></div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[10px]">
              <span className="px-2 py-0.5 rounded bg-secondary/20 font-semibold">{a.commission_type}</span>
              <span className="text-muted-foreground font-mono">{a.tracking_code}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
