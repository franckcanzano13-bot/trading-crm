'use client';
import { crmApi } from '@/lib/api';
import { fmtDate, PlusIcon } from './helpers';

export function EmailsTab({
  emailTemplates, setEmailTemplates, brokerConfig, setBrokerConfig,
  userRole, token, tenantId, onShowTemplateEditor,
}: {
  emailTemplates: any[];
  setEmailTemplates: (t: any[]) => void;
  brokerConfig: any;
  setBrokerConfig: (c: any) => void;
  userRole: string;
  token: string;
  tenantId: string;
  onShowTemplateEditor: (template: any | null) => void;
}) {
  const VARS = ['{{first_name}}', '{{last_name}}', '{{full_name}}', '{{email}}', '{{phone}}', '{{company_name}}', '{{website}}', '{{support_email}}'];
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">Email Templates</h3>
        <div className="flex gap-2">
          <button onClick={async () => { await crmApi.seedEmailTemplates(token, tenantId); const r = await crmApi.getEmailTemplates(token, tenantId); setEmailTemplates(r || []); }}
            className="text-[10px] px-3 py-2 rounded-xl bg-secondary/20 text-muted-foreground hover:text-foreground font-semibold">Load Defaults</button>
          <button onClick={() => onShowTemplateEditor(null)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20">
            <PlusIcon /> New Template
          </button>
        </div>
      </div>

      {/* Broker Config Card (admin only) */}
      {userRole === 'admin' && brokerConfig && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <h4 className="text-xs font-bold mb-3">Broker Branding & SMTP</h4>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {[
              { key: 'company_name', label: 'Company Name' }, { key: 'logo_url', label: 'Logo URL' }, { key: 'website', label: 'Website' },
              { key: 'support_email', label: 'Support Email' }, { key: 'support_phone', label: 'Support Phone' }, { key: 'primary_color', label: 'Brand Color' },
              { key: 'smtp_host', label: 'SMTP Host' }, { key: 'smtp_user', label: 'SMTP User' }, { key: 'smtp_from_email', label: 'From Email' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-[10px] text-muted-foreground mb-1 block">{f.label}</label>
                <input value={brokerConfig[f.key] || ''} onChange={e => setBrokerConfig({ ...brokerConfig, [f.key]: e.target.value })}
                  onBlur={() => crmApi.updateBrokerConfig(token, tenantId, { [Object.keys({ [brokerConfig]: 0 })[0]]: undefined, ...{ [Object.entries(brokerConfig).find(([k]) => k === 'tenant_id')?.[0] || '']: undefined }, [brokerConfig.tenant_id ? '' : 'x']: undefined }). catch(() => {})}
                  className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30" />
              </div>
            ))}
          </div>
          {/* IP Whitelist & SIP Domain */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-xs mt-3">
            <div className="col-span-2">
              <label className="text-[10px] text-muted-foreground mb-1 block">Allowed IPs (comma-separated, empty = allow all)</label>
              <textarea value={brokerConfig.ip_whitelist || ''} onChange={e => setBrokerConfig({ ...brokerConfig, ip_whitelist: e.target.value })}
                placeholder="e.g. 203.0.113.10, 198.51.100.20"
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30 h-16 resize-none font-mono" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block">SIP Domain (Zoiper)</label>
              <input value={brokerConfig.sip_domain || ''} onChange={e => setBrokerConfig({ ...brokerConfig, sip_domain: e.target.value })}
                placeholder="sip.example.com"
                className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30" />
            </div>
          </div>
          <button onClick={async () => { const { id, created_at, updated_at, ...rest } = brokerConfig; await crmApi.updateBrokerConfig(token, tenantId, rest); }}
            className="mt-3 text-[10px] px-4 py-1.5 rounded-lg bg-primary/15 text-primary font-semibold hover:bg-primary/25">Save Config</button>
        </div>
      )}

      {/* Templates grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {emailTemplates.map(t => (
          <div key={t.id} className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/20 transition-colors">
            <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold">{t.name}</div>
                <div className="text-[10px] text-muted-foreground">{t.category} · {fmtDate(t.created_at)}</div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => onShowTemplateEditor(t)}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-semibold">Edit</button>
                <button onClick={async () => { await crmApi.deleteEmailTemplate(token, tenantId, t.id); setEmailTemplates(emailTemplates.filter(x => x.id !== t.id)); }}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 font-semibold">Delete</button>
              </div>
            </div>
            <div className="px-5 py-3">
              <div className="text-[11px] font-medium mb-1">Subject: {t.subject}</div>
              <div className="text-[10px] text-muted-foreground line-clamp-3" dangerouslySetInnerHTML={{ __html: t.body_html.replace(/<[^>]*>/g, ' ').substring(0, 200) }} />
            </div>
          </div>
        ))}
        {emailTemplates.length === 0 && (
          <div className="col-span-2 text-center py-12 text-muted-foreground text-sm">No templates yet. Click "Load Defaults" to create starter templates or "New Template" to create your own.</div>
        )}
      </div>

      {/* Available variables reference */}
      <div className="bg-secondary/5 rounded-xl p-4 text-[10px]">
        <div className="font-semibold mb-2">Available Variables</div>
        <div className="flex flex-wrap gap-1.5">
          {VARS.map(v => <code key={v} className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">{v}</code>)}
        </div>
      </div>
    </div>
  );
}
