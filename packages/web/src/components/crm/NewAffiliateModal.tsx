'use client';
import { useState } from 'react';
import { crmApi } from '@/lib/api';

export function NewAffiliateModal({ token, tenantId, onClose, onLoadAffiliates }: {
  token: string;
  tenantId: string;
  onClose: () => void;
  onLoadAffiliates: () => void;
}) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', company: '', commission_type: 'CPA', cpa_amount: 25000, cpl_amount: 0, revenue_share: 0 });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const handleSave = async () => { setSaving(true); setError(''); try { await crmApi.createAffiliate(token, tenantId, form); onClose(); onLoadAffiliates(); } catch (e: any) { setError(e.message); } setSaving(false); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-card border border-border rounded-2xl p-6 w-[440px] shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold mb-4">New Affiliate Partner</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs" /></div>
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Email</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Company</label><input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs" /></div>
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Commission Type</label>
              <select value={form.commission_type} onChange={e => setForm({ ...form, commission_type: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs">
                {['CPA', 'CPL', 'REVENUE_SHARE', 'HYBRID'].map(t => <option key={t}>{t}</option>)}
              </select></div>
          </div>
          <div><label className="text-[10px] text-muted-foreground mb-1 block">CPA Amount (cents)</label>
            <input type="number" value={form.cpa_amount} onChange={e => setForm({ ...form, cpa_amount: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs" /></div>
          {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-secondary/20 text-xs font-medium">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-semibold disabled:opacity-50">{saving ? 'Creating...' : 'Create Affiliate'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
