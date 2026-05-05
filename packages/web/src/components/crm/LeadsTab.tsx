'use client';
import { useState } from 'react';
import { crmApi } from '@/lib/api';
import type { Lead, Agent } from './types';
import {
  STATUS_CONFIG, PRIORITY_CONFIG, COUNTRY_FLAGS, avatarColor, initials, ago,
  SearchIcon, PlusIcon, PhoneIcon, MailIcon, CloseIcon,
} from './helpers';

export function LeadsTab({
  leads, totalLeads, search, setSearch, statusFilter, setStatusFilter,
  department, agents, brokerConfig, token, tenantId,
  onSelectLead, onShowNewLead, onLoadLeads, onLoadDashboard, T,
}: {
  leads: Lead[];
  totalLeads: number;
  search: string;
  setSearch: (s: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  department: 'ALL' | 'SELLER' | 'RETENTION';
  agents: Agent[];
  brokerConfig: any;
  token: string;
  tenantId: string;
  onSelectLead: (lead: Lead) => void;
  onShowNewLead: () => void;
  onLoadLeads: () => void;
  onLoadDashboard: () => void;
  T: (key: string) => string;
}) {
  const agentName = (id: string | null) => agents.find(a => a.id === id)?.name || '—';

  // CSV Import modal state (local to this tab)
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsvHeaders, setImportCsvHeaders] = useState<string[]>([]);
  const [importCsvRows, setImportCsvRows] = useState<string[][]>([]);
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [importLoading, setImportLoading] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <div className="absolute inset-y-0 left-3 flex items-center text-muted-foreground"><SearchIcon /></div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={T('btn.search')}
            className="w-full bg-background border border-border rounded-xl pl-10 pr-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none">
          <option value="">{T('btn.allStatuses')}</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground font-medium">{totalLeads} leads</span>
          <button onClick={async () => {
            try {
              const exportParams: Record<string, string> = {};
              if (search) exportParams.search = search;
              if (statusFilter) exportParams.status = statusFilter;
              if (department !== 'ALL') exportParams.department = department;
              const csv = await crmApi.exportLeadsCsv(token, tenantId, exportParams);
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'leads_export.csv'; a.click();
              URL.revokeObjectURL(url);
            } catch {}
          }} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-secondary/20 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all border border-border">
            {T('btn.exportCsv')}
          </button>
          <label className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-secondary/20 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all border border-border cursor-pointer">
            {T('btn.importCsv')}
            <input type="file" accept=".csv" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return;
              const text = await file.text();
              const lines = text.split('\n').filter(l => l.trim());
              if (lines.length < 2) { alert('CSV must have header + at least one row'); e.target.value = ''; return; }
              const hdrs = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
              const rows: string[][] = [];
              for (let i = 1; i < Math.min(lines.length, 50); i++) {
                const vals: string[] = []; let cur = ''; let inQ = false;
                for (const ch of lines[i]) { if (ch === '"') { inQ = !inQ; continue; } if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; continue; } cur += ch; }
                vals.push(cur.trim());
                rows.push(vals);
              }
              setImportCsvHeaders(hdrs);
              setImportCsvRows(rows);
              // Auto-map matching columns
              const leadFields = ['email', 'first_name', 'last_name', 'phone', 'country', 'source', 'department', 'priority'];
              const autoMap: Record<string, string> = {};
              hdrs.forEach((h, i) => { const lower = h.toLowerCase().replace(/\s+/g, '_'); const match = leadFields.find(f => f === lower); if (match) autoMap[String(i)] = match; });
              setImportMapping(autoMap);
              setShowImportModal(true);
              e.target.value = '';
            }} />
          </label>
          <button onClick={onShowNewLead} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all">
            <PlusIcon /> {T('btn.newLead')}
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-x-auto">
        <table className="w-full text-xs min-w-[800px]">
          <thead>
            <tr className="border-b border-border bg-secondary/5">
              {['Lead', 'Contact', 'Status', 'KYC', 'Priority', 'Source', 'Agent', 'Last Contact', ''].map(h => (
                <th key={h} className={`text-left px-4 py-3 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider ${h === '' ? 'w-20' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map(lead => {
              const sc = STATUS_CONFIG[lead.status] || STATUS_CONFIG.NEW;
              const pc = PRIORITY_CONFIG[lead.priority] || PRIORITY_CONFIG.MEDIUM;
              return (
                <tr key={lead.id} className="border-b border-border/30 hover:bg-primary/3 cursor-pointer transition-colors group" onClick={() => onSelectLead(lead)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg ${avatarColor(lead.id)} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>{initials(lead.first_name, lead.last_name)}</div>
                      <div>
                        <div className="font-semibold flex items-center gap-1">
                          <span className="text-[9px] text-muted-foreground font-mono">#{lead.lead_number || '—'}</span>
                          {lead.first_name} {lead.last_name}
                          {lead.country && COUNTRY_FLAGS[lead.country] && <span className="text-xs">{COUNTRY_FLAGS[lead.country]}</span>}
                        </div>
                        <div className="text-muted-foreground text-[10px]">{lead.department}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[11px]">{lead.email}</div>
                    {lead.phone && <div className="text-muted-foreground font-mono text-[10px]">{lead.phone}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-lg font-semibold border ${sc.bg} ${sc.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(() => { const ks = (lead as any).kyc_status || 'NONE'; const kc: Record<string,string> = { NONE:'bg-gray-500/10 text-gray-400', SENT:'bg-blue-500/10 text-blue-400', IN_PROGRESS:'bg-amber-500/10 text-amber-400', COMPLETED:'bg-cyan-500/10 text-cyan-400', APPROVED:'bg-green-500/10 text-green-400', REJECTED:'bg-red-500/10 text-red-400' }; return <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${kc[ks]||kc.NONE}`}>{ks === 'NONE' ? '—' : ks}</span>; })()}
                  </td>
                  <td className="px-4 py-3"><span className={`text-[10px] px-2 py-0.5 rounded-lg font-semibold ${pc.bg} ${pc.color}`}>{pc.label}</span></td>
                  <td className="px-4 py-3 text-muted-foreground">{lead.source}{lead.affiliate ? <span className="text-primary/70"> ({lead.affiliate.name})</span> : ''}</td>
                  <td className="px-4 py-3 text-muted-foreground">{agentName(lead.assigned_to)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{lead.last_contact ? ago(lead.last_contact) : <span className="text-red-400/60">Never</span>}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {lead.phone && <button onClick={() => { const sipUri = brokerConfig?.sip_domain ? `sip:${lead.phone}@${brokerConfig.sip_domain}` : `sip:${lead.phone}`; window.open(sipUri, '_self'); }} className="w-7 h-7 flex items-center justify-center rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20"><PhoneIcon /></button>}
                      <button onClick={() => window.open(`mailto:${lead.email}`)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"><MailIcon /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {leads.length === 0 && <div className="text-center py-12 text-muted-foreground text-sm">No leads found</div>}
      </div>

      {/* CSV Import Mapping Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowImportModal(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">CSV Import - Column Mapping</h3>
              <button onClick={() => setShowImportModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary/50 text-muted-foreground"><CloseIcon /></button>
            </div>

            {/* Preview table */}
            <div className="mb-4 overflow-x-auto">
              <div className="text-[10px] text-muted-foreground font-semibold mb-2 uppercase tracking-wider">Preview (first 3 rows)</div>
              <table className="w-full text-[10px] border border-border rounded-lg">
                <thead><tr className="bg-secondary/10">{importCsvHeaders.map((h, i) => <th key={i} className="px-2 py-1.5 text-left border-b border-border font-semibold">{h}</th>)}</tr></thead>
                <tbody>
                  {importCsvRows.slice(0, 3).map((row, ri) => (
                    <tr key={ri} className="border-b border-border/30">{importCsvHeaders.map((_, ci) => <td key={ci} className="px-2 py-1 text-muted-foreground">{row[ci] || ''}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mapping dropdowns */}
            <div className="mb-4">
              <div className="text-[10px] text-muted-foreground font-semibold mb-2 uppercase tracking-wider">Map CSV columns to Lead fields</div>
              <div className="grid grid-cols-2 gap-2">
                {importCsvHeaders.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[11px] font-medium w-28 truncate" title={h}>{h}</span>
                    <span className="text-muted-foreground text-[10px]">→</span>
                    <select value={importMapping[String(i)] || ''} onChange={e => setImportMapping({ ...importMapping, [String(i)]: e.target.value })}
                      className="flex-1 bg-background border border-border rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary/30">
                      <option value="">(skip)</option>
                      <option value="email">Email</option>
                      <option value="first_name">First Name</option>
                      <option value="last_name">Last Name</option>
                      <option value="phone">Phone</option>
                      <option value="country">Country</option>
                      <option value="source">Source</option>
                      <option value="department">Department</option>
                      <option value="priority">Priority</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Validation info */}
            {!Object.values(importMapping).includes('email') && <div className="text-[10px] text-red-400 mb-3">Email mapping is required</div>}
            {!Object.values(importMapping).includes('first_name') && <div className="text-[10px] text-red-400 mb-3">First Name mapping is required</div>}
            {!Object.values(importMapping).includes('last_name') && <div className="text-[10px] text-red-400 mb-3">Last Name mapping is required</div>}

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{importCsvRows.length} rows to import</span>
              <div className="flex gap-2">
                <button onClick={() => setShowImportModal(false)} className="px-4 py-2 rounded-xl bg-secondary/20 text-xs font-semibold text-muted-foreground">Cancel</button>
                <button
                  disabled={importLoading || !Object.values(importMapping).includes('email') || !Object.values(importMapping).includes('first_name') || !Object.values(importMapping).includes('last_name')}
                  onClick={async () => {
                    setImportLoading(true);
                    try {
                      const mapped = importCsvRows.map(row => {
                        const obj: Record<string, string> = {};
                        Object.entries(importMapping).forEach(([colIdx, field]) => {
                          if (field && row[Number(colIdx)] !== undefined) obj[field] = row[Number(colIdx)];
                        });
                        return obj;
                      });
                      const res = await crmApi.importLeadsMapped(token, tenantId, mapped);
                      alert(`Imported: ${res.created} created, ${res.skipped} skipped`);
                      setShowImportModal(false);
                      onLoadLeads(); onLoadDashboard();
                    } catch (err: any) { alert('Import failed: ' + err.message); }
                    setImportLoading(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-semibold shadow-lg disabled:opacity-50"
                >{importLoading ? 'Importing...' : `Import ${importCsvRows.length} Leads`}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
