'use client';
import { useEffect, useMemo, useState } from 'react';
import { crmApi } from '@/lib/api';
import type { Lead, Agent } from './types';
import {
  STATUS_CONFIG, PRIORITY_CONFIG, COUNTRY_FLAGS,
  fmt, fmtDate, fmtTime, ago, initials, avatarColor,
  CloseIcon, PhoneIcon, MailIcon,
} from './helpers';

export function LeadDetail({ lead, agents, token, tenantId, onClose, onRefresh, sipDomain }: {
  lead: Lead; agents: Agent[]; token: string; tenantId: string; onClose: () => void; onRefresh: () => void; sipDomain?: string;
}) {
  const [detail, setDetail] = useState<Lead | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showCallLog, setShowCallLog] = useState(false);
  const [callStatus, setCallStatus] = useState('COMPLETED');
  const [callDuration, setCallDuration] = useState(0);
  const [callNotes, setCallNotes] = useState('');
  const [callRecordingUrl, setCallRecordingUrl] = useState('');
  const [tab, setTab] = useState<'activity' | 'notes' | 'calls' | 'tasks' | 'kyc' | 'trades'>('activity');
  const [kycData, setKycData] = useState<any>(null);
  const [kycLoading, setKycLoading] = useState(false);
  const [showSendEmail, setShowSendEmail] = useState(false);
  const [emailTemplatesList, setEmailTemplatesList] = useState<any[]>([]);
  const [userTrades, setUserTrades] = useState<any[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [geoData, setGeoData] = useState<any>(null);
  const [weatherData, setWeatherData] = useState<any>(null);

  const reload = async () => {
    try { const res = await crmApi.getLead(token, tenantId, lead.id); setDetail(res); } catch {}
  };
  useEffect(() => { reload(); }, [lead.id]); // eslint-disable-line
  useEffect(() => {
    const ip = (detail || lead).ip_address;
    if (ip && ip.trim()) {
      crmApi.getGeo(token, tenantId, ip).then(r => {
        setGeoData(r);
        // Fetch weather if we have coordinates
        if (r?.lat && r?.lon) {
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${r.lat}&longitude=${r.lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`)
            .then(res => res.json())
            .then(w => setWeatherData(w?.current || null))
            .catch(() => {});
        }
      }).catch(() => {});
    }
  }, [detail?.ip_address, lead.ip_address]); // eslint-disable-line

  const d = detail || lead;
  const statusConf = STATUS_CONFIG[d.status] || STATUS_CONFIG.NEW;
  const priorityConf = PRIORITY_CONFIG[d.priority] || PRIORITY_CONFIG.MEDIUM;

  const handleStatusChange = async (status: string) => { await crmApi.updateLead(token, tenantId, lead.id, { status }); reload(); onRefresh(); };
  const handleAssign = async (assigned_to: string | null) => { await crmApi.updateLead(token, tenantId, lead.id, { assigned_to }); reload(); onRefresh(); };
  const handlePriority = async (priority: string) => { await crmApi.updateLead(token, tenantId, lead.id, { priority }); reload(); onRefresh(); };
  const handleAddNote = async () => { if (!noteText.trim()) return; await crmApi.createNote(token, tenantId, { lead_id: lead.id, content: noteText }); setNoteText(''); reload(); };
  const handleLogCall = async () => { await crmApi.logCall(token, tenantId, { lead_id: lead.id, direction: 'OUTBOUND', status: callStatus, duration: callDuration, notes: callNotes, recording_url: callRecordingUrl }); setCallNotes(''); setCallDuration(0); setCallRecordingUrl(''); setShowCallLog(false); reload(); onRefresh(); };
  const handleCall = () => { if (d.phone) { const sipUri = sipDomain ? `sip:${d.phone}@${sipDomain}` : `sip:${d.phone}`; window.open(sipUri, '_self'); } setShowCallLog(true); };

  // Build activity timeline from notes + calls
  const activities = useMemo(() => {
    if (!detail) return [];
    const items: { type: string; data: any; time: string }[] = [];
    (detail.notes || []).forEach(n => items.push({ type: 'note', data: n, time: n.created_at }));
    (detail.calls || []).forEach(c => items.push({ type: 'call', data: c, time: c.created_at }));
    return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [detail]);

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative ml-auto w-full sm:w-[560px] bg-card h-full overflow-hidden flex flex-col border-l border-border shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="shrink-0 bg-gradient-to-r from-card to-secondary/5 border-b border-border px-6 py-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl ${avatarColor(d.id)} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>
                {initials(d.first_name, d.last_name)}
              </div>
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono">#{d.lead_number || '—'}</span>
                  {d.first_name} {d.last_name}
                  {d.country && COUNTRY_FLAGS[d.country] && <span className="text-base">{COUNTRY_FLAGS[d.country]}</span>}
                </h2>
                <p className="text-xs text-muted-foreground">{d.email}</p>
                {d.phone && <p className="text-xs text-muted-foreground font-mono">{d.phone}</p>}
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary/50 text-muted-foreground"><CloseIcon /></button>
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 mt-4">
            <button onClick={handleCall}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-500/15 text-green-400 hover:bg-green-500/25 text-xs font-semibold transition-all border border-green-500/20">
              <PhoneIcon /> Call
            </button>
            <button onClick={async () => {
                const tpls = await crmApi.getEmailTemplates(token, tenantId).catch(() => []);
                setEmailTemplatesList(tpls || []);
                setShowSendEmail(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 text-xs font-semibold transition-all border border-blue-500/20">
              <MailIcon /> Send Email
            </button>
            <div className="ml-auto flex items-center gap-2">
              <span className={`text-[10px] px-2.5 py-1 rounded-lg font-bold border ${statusConf.bg} ${statusConf.color}`}>{statusConf.label}</span>
              <span className={`text-[10px] px-2.5 py-1 rounded-lg font-bold ${priorityConf.bg} ${priorityConf.color}`}>{priorityConf.label}</span>
            </div>
          </div>
        </div>

        {/* Quick edits */}
        <div className="shrink-0 border-b border-border px-6 py-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Status</label>
            <select value={d.status} onChange={e => handleStatusChange(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-primary/30">
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Department</label>
            <select value={d.department} onChange={async e => { await crmApi.updateLead(token, tenantId, lead.id, { department: e.target.value, assigned_to: null }); reload(); onRefresh(); }}
              className={`w-full border rounded-lg px-2.5 py-1.5 text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-primary/30 ${d.department === 'SELLER' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-orange-500/10 border-orange-500/20 text-orange-400'}`}>
              <option value="SELLER">SELLER</option>
              <option value="RETENTION">RETENTION</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Assigned To</label>
            <select value={d.assigned_to || ''} onChange={e => handleAssign(e.target.value || null)}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-primary/30">
              <option value="">Unassigned</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground font-medium block mb-1">Priority</label>
            <select value={d.priority} onChange={e => handlePriority(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-primary/30">
              {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
        </div>

        {/* Info cards */}
        <div className="shrink-0 border-b border-border px-6 py-3">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { label: 'Source', value: d.source, sub: d.affiliate?.name },
              { label: 'Created', value: ago(d.created_at) },
              { label: 'Last Contact', value: d.last_contact ? ago(d.last_contact) : 'Never' },
              { label: 'FTD', value: Number(d.ftd_amount) > 0 ? fmt(d.ftd_amount) : '—' },
            ].map((item, i) => (
              <div key={i} className="bg-secondary/5 rounded-lg px-2 py-2">
                <div className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">{item.label}</div>
                <div className="text-[11px] font-semibold mt-0.5">{item.value}</div>
                {item.sub && <div className="text-[9px] text-muted-foreground">{item.sub}</div>}
              </div>
            ))}
          </div>
          {/* IP Geolocation card */}
          {d.ip_address && geoData && (geoData.city || geoData.country) && (
            <div className="mt-2 bg-secondary/5 rounded-lg px-3 py-2 flex items-center gap-3">
              <span className="text-base">{geoData.countryCode && COUNTRY_FLAGS[geoData.countryCode] ? COUNTRY_FLAGS[geoData.countryCode] : '🌍'}</span>
              <div className="flex-1 text-[10px]">
                <div className="font-semibold">{[geoData.city, geoData.country].filter(Boolean).join(', ')}</div>
                <div className="text-muted-foreground">{geoData.timezone}{geoData.isp ? ` · ${geoData.isp}` : ''}</div>
              </div>
              {weatherData && (
                <div className="text-right">
                  <div className="text-sm font-bold">{weatherData.temperature_2m ? `${Math.round(weatherData.temperature_2m)}°C` : ''}</div>
                  <div className="text-[9px] text-muted-foreground">{weatherData.wind_speed_10m ? `${Math.round(weatherData.wind_speed_10m)} km/h` : ''}</div>
                  <div className="text-base">{(() => {
                    const wc = weatherData.weather_code;
                    if (wc === 0) return '☀️';
                    if (wc <= 3) return '⛅';
                    if (wc <= 49) return '🌫️';
                    if (wc <= 59) return '🌧️';
                    if (wc <= 69) return '🌨️';
                    if (wc <= 79) return '🌨️';
                    if (wc <= 84) return '🌧️';
                    if (wc <= 99) return '⛈️';
                    return '🌤️';
                  })()}</div>
                </div>
              )}
              <div className="text-[9px] text-muted-foreground font-mono">{d.ip_address}</div>
            </div>
          )}
        </div>

        {/* Call log mini-form */}
        {showCallLog && (
          <div className="shrink-0 border-b border-border px-6 py-3 bg-green-500/5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-green-400">Log Call</span>
              <select value={callStatus} onChange={e => setCallStatus(e.target.value)} className="text-[10px] bg-background border border-border rounded-lg px-2 py-1">
                {['COMPLETED', 'NO_ANSWER', 'VOICEMAIL', 'BUSY'].map(s => <option key={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
              <input type="number" value={callDuration} onChange={e => setCallDuration(Number(e.target.value))} placeholder="0s" className="w-16 text-[10px] bg-background border border-border rounded-lg px-2 py-1" />
            </div>
            <div className="flex gap-2 mb-2">
              <input value={callNotes} onChange={e => setCallNotes(e.target.value)} placeholder="Call notes..." onKeyDown={e => e.key === 'Enter' && handleLogCall()}
                className="flex-1 text-xs bg-background border border-border rounded-lg px-3 py-2 focus:outline-none" />
            </div>
            <div className="flex gap-2">
              <input value={callRecordingUrl} onChange={e => setCallRecordingUrl(e.target.value)} placeholder="Recording URL (optional)"
                className="flex-1 text-xs bg-background border border-border rounded-lg px-3 py-2 focus:outline-none" />
              <button onClick={handleLogCall} className="px-3 py-2 rounded-lg bg-green-500 text-white text-xs font-semibold">Save</button>
              <button onClick={() => setShowCallLog(false)} className="px-3 py-2 rounded-lg bg-secondary/30 text-xs">Cancel</button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="shrink-0 flex border-b border-border px-6 overflow-x-auto">
          {((['activity', 'notes', 'calls', 'tasks', 'kyc'] as const) as readonly string[]).concat(d.converted_user_id ? ['trades'] : []).map(t => (
            <button key={t} onClick={() => { setTab(t as any); if (t === 'trades' && d.converted_user_id && userTrades.length === 0 && !tradesLoading) { setTradesLoading(true); crmApi.getUserTrades(token, tenantId, d.converted_user_id).then(r => setUserTrades(r || [])).catch(() => {}).finally(() => setTradesLoading(false)); } }}
              className={`px-4 py-2.5 text-[11px] font-semibold border-b-2 transition-all capitalize whitespace-nowrap ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {/* Add note input — always visible */}
          {(tab === 'activity' || tab === 'notes') && (
            <div className="flex gap-2">
              <input value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                placeholder="Write a note..." className="flex-1 bg-background border border-border rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20" />
              <button onClick={handleAddNote} className="px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90">Add</button>
            </div>
          )}

          {/* Activity timeline */}
          {tab === 'activity' && activities.map((item, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] shrink-0 ${item.type === 'call' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
                  {item.type === 'call' ? '📞' : '📝'}
                </div>
                {i < activities.length - 1 && <div className="w-px flex-1 bg-border/50 mt-1" />}
              </div>
              <div className="flex-1 pb-4">
                <div className="text-xs">
                  {item.type === 'call'
                    ? <><span className="font-semibold">{item.data.agent_name || 'Agent'}</span> · {item.data.direction} call · {item.data.status.replace(/_/g, ' ')}{item.data.duration > 0 ? ` · ${Math.floor(item.data.duration / 60)}:${String(item.data.duration % 60).padStart(2, '0')}` : ''}</>
                    : <><span className="font-semibold">{item.data.author_name || 'Agent'}</span> · {item.data.content}</>
                  }
                </div>
                {item.type === 'call' && item.data.notes && <div className="text-[11px] text-muted-foreground mt-0.5">{item.data.notes}</div>}
                <div className="text-[10px] text-muted-foreground mt-1">{ago(item.time)}</div>
              </div>
            </div>
          ))}

          {tab === 'notes' && detail?.notes?.map(n => (
            <div key={n.id} className="bg-secondary/5 rounded-xl px-4 py-3 border border-border/30">
              <p className="text-xs">{n.content}</p>
              <p className="text-[10px] text-muted-foreground mt-2"><span className="font-semibold">{n.author_name || 'Agent'}</span> · {fmtTime(n.created_at)} · {n.type}</p>
            </div>
          ))}

          {tab === 'calls' && detail?.calls?.map(c => (
            <div key={c.id} className="bg-secondary/5 rounded-xl px-4 py-3 border border-border/30">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${c.status === 'COMPLETED' ? 'bg-green-400' : c.status === 'NO_ANSWER' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                <div className="flex-1">
                  <div className="text-xs font-medium"><span className="font-semibold">{c.agent_name || 'Agent'}</span> · {c.direction} · {c.status.replace(/_/g, ' ')}</div>
                  {c.notes && <p className="text-[10px] text-muted-foreground mt-0.5">{c.notes}</p>}
                </div>
                <div className="text-[10px] text-muted-foreground text-right">
                  {c.duration > 0 && <div>{Math.floor(c.duration / 60)}:{String(c.duration % 60).padStart(2, '0')}</div>}
                  <div>{ago(c.created_at)}</div>
                </div>
              </div>
              {c.recording_url && (
                <div className="mt-2 flex items-center gap-2">
                  <audio controls preload="none" className="h-8 w-full max-w-xs" style={{ minWidth: 200 }}>
                    <source src={c.recording_url} />
                  </audio>
                </div>
              )}
            </div>
          ))}

          {tab === 'tasks' && detail?.tasks?.map(t => (
            <div key={t.id} className="flex items-center gap-3 bg-secondary/5 rounded-xl px-4 py-3 border border-border/30">
              <div className={`w-2.5 h-2.5 rounded-full ${t.status === 'COMPLETED' ? 'bg-green-400' : t.status === 'PENDING' ? 'bg-yellow-400' : 'bg-blue-400'}`} />
              <div className="flex-1">
                <div className="text-xs font-semibold">{t.title}</div>
                <div className="text-[10px] text-muted-foreground">{t.type} · Due {fmtDate(t.due_at)}</div>
              </div>
            </div>
          ))}

          {/* KYC Tab */}
          {tab === 'kyc' && (() => {
            const loadKyc = async () => {
              setKycLoading(true);
              try { const res = await crmApi.getKycStatus(token, tenantId, lead.id); setKycData(res); } catch {}
              setKycLoading(false);
            };
            if (!kycData && !kycLoading) loadKyc();

            const ks = d.kyc_status || kycData?.kyc_status || 'NONE';
            const KYC_STATUS_COLORS: Record<string, string> = {
              NONE: 'bg-gray-500/10 text-gray-400', SENT: 'bg-blue-500/10 text-blue-400',
              IN_PROGRESS: 'bg-amber-500/10 text-amber-400', COMPLETED: 'bg-cyan-500/10 text-cyan-400',
              APPROVED: 'bg-green-500/10 text-green-400', REJECTED: 'bg-red-500/10 text-red-400',
              EXPIRED: 'bg-gray-500/10 text-gray-400',
            };

            return (
              <div className="space-y-3">
                {/* Status + Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">KYC Status:</span>
                    <span className={`text-[10px] px-2.5 py-1 rounded-lg font-bold ${KYC_STATUS_COLORS[ks] || KYC_STATUS_COLORS.NONE}`}>{ks}</span>
                  </div>
                  <div className="flex gap-1.5">
                    {(ks === 'NONE' || ks === 'EXPIRED' || ks === 'REJECTED') && (
                      <button onClick={async () => { await crmApi.sendKyc(token, tenantId, lead.id); setKycData(null); reload(); }}
                        className="text-[10px] px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 font-semibold border border-blue-500/20">
                        {ks === 'NONE' ? 'Send KYC' : 'Resend KYC'}
                      </button>
                    )}
                    {ks === 'COMPLETED' && (
                      <>
                        <button onClick={async () => { await crmApi.approveKyc(token, tenantId, lead.id); setKycData(null); reload(); }}
                          className="text-[10px] px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 font-semibold border border-green-500/20">
                          Approve
                        </button>
                        <button onClick={async () => { const r = prompt('Reason for rejection:'); if (r) { await crmApi.rejectKyc(token, tenantId, lead.id, r); setKycData(null); reload(); } }}
                          className="text-[10px] px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 font-semibold border border-red-500/20">
                          Reject
                        </button>
                      </>
                    )}
                    {ks !== 'NONE' && (
                      <button onClick={() => { setKycData(null); }}
                        className="text-[10px] px-3 py-1.5 rounded-lg bg-secondary/20 text-muted-foreground hover:text-foreground font-semibold">
                        Refresh
                      </button>
                    )}
                  </div>
                </div>

                {/* KYC URL */}
                {(kycData?.kyc_url || d.kyc_url) && (
                  <div className="bg-secondary/5 rounded-xl px-4 py-3 border border-border/30">
                    <div className="text-[10px] text-muted-foreground mb-1">Verification Link</div>
                    <div className="flex items-center gap-2">
                      <code className="text-[10px] font-mono text-primary flex-1 truncate">{kycData?.kyc_url || d.kyc_url}</code>
                      <button onClick={() => navigator.clipboard.writeText(kycData?.kyc_url || d.kyc_url || '')}
                        className="text-[9px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 font-semibold shrink-0">
                        Copy
                      </button>
                    </div>
                    {d.kyc_sent_at && <div className="text-[9px] text-muted-foreground mt-1">Sent {fmtTime(d.kyc_sent_at)}</div>}
                  </div>
                )}

                {/* Documents */}
                {kycData?.documents && kycData.documents.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold">Documents ({kycData.documents.length})</div>
                    {kycData.documents.map((doc: any) => (
                      <div key={doc.id} className="bg-secondary/5 rounded-xl overflow-hidden border border-border/30">
                        <div className="flex items-center justify-between px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{doc.type === 'selfie' ? '🤳' : doc.type === 'proof_of_address' ? '🏠' : '🪪'}</span>
                            <div>
                              <div className="text-[11px] font-semibold capitalize">{doc.type.replace(/_/g, ' ')}</div>
                              <div className="text-[9px] text-muted-foreground">{fmtTime(doc.createdAt)}</div>
                            </div>
                          </div>
                          {doc.url && (
                            <a href={doc.url} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] px-3 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-semibold">
                              View
                            </a>
                          )}
                        </div>
                        {doc.url && (
                          <div className="border-t border-border/30">
                            <img src={doc.url} alt={doc.type} className="w-full max-h-[200px] object-contain bg-black/5" loading="lazy" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {kycData?.documents?.length === 0 && ks !== 'NONE' && (
                  <div className="text-center py-6 text-xs text-muted-foreground">No documents uploaded yet</div>
                )}
                {ks === 'NONE' && (
                  <div className="text-center py-6 text-xs text-muted-foreground">KYC not started. Click "Send KYC" to send verification link.</div>
                )}
              </div>
            );
          })()}

          {/* Trades Tab */}
          {tab === 'trades' && (() => {
            if (tradesLoading) return <div className="text-center py-8 text-xs text-muted-foreground">Loading trades...</div>;
            if (!d.converted_user_id) return <div className="text-center py-8 text-xs text-muted-foreground">Lead not yet converted to a client.</div>;
            if (userTrades.length === 0) return <div className="text-center py-8 text-xs text-muted-foreground">No closed trades found.</div>;
            return (
              <div className="space-y-2">
                <div className="text-xs font-semibold mb-2">{userTrades.length} Closed Trades</div>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-border bg-secondary/5">
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Symbol</th>
                        <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Side</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Volume</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Open</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Close</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">P&L</th>
                        <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userTrades.map((t: any) => (
                        <tr key={t.id} className="border-b border-border/30 hover:bg-secondary/5">
                          <td className="px-3 py-2 font-medium">{t.symbol}</td>
                          <td className="px-3 py-2"><span className={t.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>{t.side}</span></td>
                          <td className="px-3 py-2 text-right font-mono">{t.volume}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmt(t.open_price)}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmt(t.close_price)}</td>
                          <td className={`px-3 py-2 text-right font-mono font-semibold ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{t.pnl >= 0 ? '+' : ''}{fmt(t.pnl)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{fmtDate(t.close_time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bg-secondary/5 rounded-xl px-4 py-3 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Total P&L:</span>
                  <span className={`font-bold font-mono ${userTrades.reduce((s: number, t: any) => s + t.pnl, 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {fmt(userTrades.reduce((s: number, t: any) => s + t.pnl, 0))}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Send Email Modal */}
        {showSendEmail && (() => {
          const SendEmailModal = () => {
            const [selectedTpl, setSelectedTpl] = useState<any>(null);
            const [subject, setSubject] = useState('');
            const [bodyHtml, setBodyHtml] = useState('');
            const [sending, setSending] = useState(false);
            const [sent, setSent] = useState(false);
            const [err, setErr] = useState('');
            const [showPreview, setShowPreview] = useState(false);

            const selectTemplate = (tpl: any) => {
              setSelectedTpl(tpl);
              setSubject(tpl.subject);
              setBodyHtml(tpl.body_html);
            };

            const handleSend = async () => {
              if (!subject || !bodyHtml) { setErr('Subject and body required'); return; }
              setSending(true); setErr('');
              try {
                await crmApi.sendEmail(token, tenantId, {
                  lead_id: d.id, to_email: d.email, to_name: `${d.first_name} ${d.last_name}`,
                  template_id: selectedTpl?.id, subject, body_html: bodyHtml,
                });
                setSent(true);
                setTimeout(() => { setShowSendEmail(false); reload(); }, 1500);
              } catch (e: any) { setErr(e.message); }
              setSending(false);
            };

            // Preview with variables replaced
            const previewHtml = bodyHtml
              .replace(/\{\{first_name\}\}/g, d.first_name)
              .replace(/\{\{last_name\}\}/g, d.last_name)
              .replace(/\{\{full_name\}\}/g, `${d.first_name} ${d.last_name}`)
              .replace(/\{\{email\}\}/g, d.email)
              .replace(/\{\{phone\}\}/g, d.phone || '')
              .replace(/\{\{company_name\}\}/g, 'Broker')
              .replace(/\{\{website\}\}/g, '#');

            return (
              <div className="absolute inset-0 z-20 bg-card flex flex-col">
                <div className="shrink-0 px-6 py-4 border-b border-border flex items-center justify-between">
                  <h3 className="text-sm font-bold">Send Email to {d.first_name} {d.last_name}</h3>
                  <button onClick={() => setShowSendEmail(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-secondary/50 text-muted-foreground"><CloseIcon /></button>
                </div>

                {sent ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-4xl mb-3">✅</div>
                      <div className="text-sm font-bold text-green-400">Email sent to {d.email}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {/* Template picker */}
                    {!selectedTpl && (
                      <div>
                        <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2 block">Choose a template</label>
                        <div className="grid grid-cols-2 gap-2">
                          {emailTemplatesList.map(t => (
                            <button key={t.id} onClick={() => selectTemplate(t)}
                              className="text-left bg-secondary/5 border border-border rounded-xl p-3 hover:border-primary/30 transition-colors">
                              <div className="text-[11px] font-bold">{t.name}</div>
                              <div className="text-[9px] text-muted-foreground mt-0.5">{t.category}</div>
                            </button>
                          ))}
                          <button onClick={() => { setSelectedTpl({ id: null, name: 'Custom' }); setSubject(''); setBodyHtml(''); }}
                            className="text-left bg-secondary/5 border border-dashed border-border rounded-xl p-3 hover:border-primary/30 transition-colors">
                            <div className="text-[11px] font-bold text-muted-foreground">+ Custom Email</div>
                            <div className="text-[9px] text-muted-foreground mt-0.5">Write from scratch</div>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Editor */}
                    {selectedTpl && (
                      <>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setSelectedTpl(null)} className="text-[10px] px-2.5 py-1 rounded-lg bg-secondary/20 text-muted-foreground hover:text-foreground">← Back</button>
                          <span className="text-xs font-semibold">{selectedTpl.name}</span>
                          <div className="flex-1" />
                          <button onClick={() => setShowPreview(!showPreview)} className="text-[10px] px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-semibold">{showPreview ? 'Edit' : 'Preview'}</button>
                        </div>

                        <div>
                          <label className="text-[10px] text-muted-foreground font-semibold mb-1 block">To</label>
                          <div className="bg-secondary/5 rounded-lg px-3 py-2 text-xs">{d.first_name} {d.last_name} &lt;{d.email}&gt;</div>
                        </div>

                        <div>
                          <label className="text-[10px] text-muted-foreground font-semibold mb-1 block">Subject</label>
                          <input value={subject} onChange={e => setSubject(e.target.value)}
                            className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        </div>

                        {!showPreview ? (
                          <div>
                            <label className="text-[10px] text-muted-foreground font-semibold mb-1 block">Body</label>
                            <textarea value={bodyHtml} onChange={e => setBodyHtml(e.target.value)} rows={10}
                              className="w-full bg-background border border-border rounded-xl px-3.5 py-2.5 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-primary/20" />
                            <div className="flex flex-wrap gap-1 mt-1">
                              {['{{first_name}}', '{{last_name}}', '{{company_name}}', '{{website}}'].map(v =>
                                <button key={v} onClick={() => setBodyHtml(bodyHtml + v)} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/20 text-muted-foreground hover:text-primary font-mono">{v}</button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <label className="text-[10px] text-muted-foreground font-semibold mb-1 block">Preview</label>
                            <div className="bg-white rounded-xl border border-border p-4 text-sm text-black" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                          </div>
                        )}

                        {err && <div className="text-xs text-red-400 bg-red-500/10 rounded-xl px-3 py-2">{err}</div>}

                        <button onClick={handleSend} disabled={sending || !subject || !bodyHtml}
                          className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold text-xs disabled:opacity-40 shadow-lg shadow-blue-500/25">
                          {sending ? 'Sending...' : `Send Email to ${d.first_name}`}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          };
          return <SendEmailModal />;
        })()}
      </div>
    </div>
  );
}
