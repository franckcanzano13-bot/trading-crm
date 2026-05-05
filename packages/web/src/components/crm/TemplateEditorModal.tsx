'use client';
import { useState } from 'react';
import { crmApi } from '@/lib/api';

export function TemplateEditorModal({
  editingTemplate, token, tenantId, onClose, setEmailTemplates,
}: {
  editingTemplate: any | null;
  token: string;
  tenantId: string;
  onClose: () => void;
  setEmailTemplates: (t: any[]) => void;
}) {
  const [tf, setTf] = useState(editingTemplate ? { name: editingTemplate.name, subject: editingTemplate.subject, body_html: editingTemplate.body_html, category: editingTemplate.category } : { name: '', subject: '', body_html: '', category: 'CUSTOM' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const save = async () => {
    setSaving(true); setErr('');
    try {
      if (editingTemplate) { await crmApi.updateEmailTemplate(token, tenantId, editingTemplate.id, tf); }
      else { await crmApi.createEmailTemplate(token, tenantId, tf); }
      const r = await crmApi.getEmailTemplates(token, tenantId); setEmailTemplates(r || []);
      onClose();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  };
  const VARS_LIST = ['{{first_name}}', '{{last_name}}', '{{full_name}}', '{{email}}', '{{company_name}}', '{{website}}', '{{support_email}}'];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-card border border-border rounded-2xl p-6 w-[640px] max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-bold mb-4">{editingTemplate ? 'Edit Template' : 'New Email Template'}</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Name</label>
              <input value={tf.name} onChange={e => setTf({ ...tf, name: e.target.value })} placeholder="e.g. Welcome Email" className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs" /></div>
            <div><label className="text-[10px] text-muted-foreground mb-1 block">Category</label>
              <select value={tf.category} onChange={e => setTf({ ...tf, category: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-xs">
                {['GENERAL', 'WELCOME', 'KYC', 'DEPOSIT', 'RETENTION', 'PROMOTION', 'CUSTOM'].map(c => <option key={c}>{c}</option>)}
              </select></div>
          </div>
          <div><label className="text-[10px] text-muted-foreground mb-1 block">Subject</label>
            <input value={tf.subject} onChange={e => setTf({ ...tf, subject: e.target.value })} placeholder="Welcome to {{company_name}}, {{first_name}}!" className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs" /></div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-muted-foreground">Body (HTML)</label>
              <button onClick={() => setPreview(!preview)} className="text-[9px] px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold">{preview ? 'Edit' : 'Preview'}</button>
            </div>
            {!preview ? (
              <textarea value={tf.body_html} onChange={e => setTf({ ...tf, body_html: e.target.value })} rows={12} placeholder="<h2>Hello {{first_name}},</h2><p>Welcome to our platform...</p>"
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/20" />
            ) : (
              <div className="bg-white rounded-xl border border-border p-4 min-h-[200px] text-sm text-black" dangerouslySetInnerHTML={{ __html: tf.body_html.replace(/\{\{(\w+)\}\}/g, '<span style="background:#e8e4ff;padding:1px 4px;border-radius:3px;font-size:11px">$1</span>') }} />
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="text-[9px] text-muted-foreground mr-1">Insert:</span>
            {VARS_LIST.map(v => <button key={v} onClick={() => setTf({ ...tf, body_html: tf.body_html + v })} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/20 text-muted-foreground hover:text-primary font-mono">{v}</button>)}
          </div>
          {err && <div className="text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2">{err}</div>}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-secondary/20 text-xs">Cancel</button>
            <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-semibold disabled:opacity-50">{saving ? 'Saving...' : editingTemplate ? 'Update Template' : 'Create Template'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
