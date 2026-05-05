'use client';
import type { Lead } from './types';
import { STATUS_CONFIG, PRIORITY_CONFIG, COUNTRY_FLAGS, avatarColor, initials, ago, PhoneIcon } from './helpers';

export function PipelineTab({ leads, brokerConfig, onSelectLead }: {
  leads: Lead[];
  brokerConfig: any;
  onSelectLead: (lead: Lead) => void;
}) {
  const stages = ['NEW', 'CONTACTED', 'INTERESTED', 'DEMO', 'FTD', 'CONVERTED'];
  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 180px)' }}>
      {stages.map(stage => {
        const conf = STATUS_CONFIG[stage];
        const stageLeads = leads.filter(l => l.status === stage);
        return (
          <div key={stage} className="w-[280px] shrink-0 flex flex-col">
            <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl border ${conf.bg}`}>
              <div className={`w-2 h-2 rounded-full ${conf.dot}`} />
              <span className={`text-xs font-bold ${conf.color}`}>{conf.label}</span>
              <span className="ml-auto text-[10px] font-bold bg-background/50 px-2 py-0.5 rounded-full">{stageLeads.length}</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {stageLeads.map(lead => (
                <div key={lead.id} onClick={() => onSelectLead(lead)}
                  className="bg-card border border-border rounded-xl p-3.5 cursor-pointer hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all group">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg ${avatarColor(lead.id)} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>{initials(lead.first_name, lead.last_name)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate">{lead.first_name} {lead.last_name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{lead.email}</div>
                    </div>
                    {lead.country && COUNTRY_FLAGS[lead.country] && <span className="text-sm">{COUNTRY_FLAGS[lead.country]}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${PRIORITY_CONFIG[lead.priority]?.bg} ${PRIORITY_CONFIG[lead.priority]?.color}`}>{lead.priority}</span>
                    <span className="text-[9px] text-muted-foreground">{lead.source}</span>
                    <div className="flex-1" />
                    {lead.phone && (
                      <button onClick={e => { e.stopPropagation(); const sipUri = brokerConfig?.sip_domain ? `sip:${lead.phone}@${brokerConfig.sip_domain}` : `sip:${lead.phone}`; window.open(sipUri, '_self'); }}
                        className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-all">
                        <PhoneIcon />
                      </button>
                    )}
                  </div>
                  {lead.last_contact && <div className="text-[9px] text-muted-foreground mt-1.5">Last: {ago(lead.last_contact)}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
