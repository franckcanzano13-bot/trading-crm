'use client';
import { useState } from 'react';
import { crmApi } from '@/lib/api';

export function NewLeadModal({ token, tenantId, department, onClose, onLoadLeads, onLoadDashboard }: {
  token: string;
  tenantId: string;
  department: 'ALL' | 'SELLER' | 'RETENTION';
  onClose: () => void;
  onLoadLeads: () => void;
  onLoadDashboard: () => void;
}) {
  const [form, setForm] = useState({ email: '', first_name: '', last_name: '', phone: '', country: '', source: 'DIRECT', department: (department === 'ALL' ? 'SELLER' : department) as string, priority: 'MEDIUM' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const handleSave = async () => { setSaving(true); setError(''); try { await crmApi.createLead(token, tenantId, form); onClose(); onLoadLeads(); onLoadDashboard(); } catch (e: any) { setError(e.message); } setSaving(false); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-card border border-border rounded-2xl p-6 w-[440px] shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold mb-4">New Lead</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] text-muted-foreground mb-1 block">First Name</label><input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs" /></div>
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Last Name</label><input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs" /></div>
          </div>
          <div><label className="text-[10px] text-muted-foreground mb-1 block">Email</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs" /></div>
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Country</label><input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Source</label>
              <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs">
                {['DIRECT', 'GOOGLE', 'FACEBOOK', 'AFFILIATE', 'REFERRAL', 'EMAIL', 'OTHER'].map(s => <option key={s}>{s}</option>)}
              </select></div>
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Department</label>
              <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs">
                <option value="SELLER">Seller</option><option value="RETENTION">Retention</option>
              </select></div>
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Priority</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs">
                {['LOW', 'MEDIUM', 'HIGH', 'VIP'].map(p => <option key={p}>{p}</option>)}
              </select></div>
          </div>
          {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-secondary/20 text-xs font-medium">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-semibold disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
