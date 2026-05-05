'use client';
import { crmApi } from '@/lib/api';
import type { CrmTask } from './types';
import { PRIORITY_CONFIG, fmtDate } from './helpers';

export function TasksTab({ tasks, token, tenantId, onLoadTasks }: {
  tasks: CrmTask[];
  token: string;
  tenantId: string;
  onLoadTasks: () => void;
}) {
  const pending = tasks.filter(t => t.status !== 'COMPLETED');
  const completed = tasks.filter(t => t.status === 'COMPLETED');
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold">My Tasks <span className="text-muted-foreground font-normal">({pending.length} pending)</span></h3>
      {pending.map(t => (
        <div key={t.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary/20 transition-colors">
          <button onClick={async () => { await crmApi.updateTask(token, tenantId, t.id, { status: 'COMPLETED' }); onLoadTasks(); }}
            className="w-5 h-5 rounded-full border-2 border-border hover:border-primary/50 shrink-0 transition-colors" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold">{t.title}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/20">{t.type}</span>
              <span>Due {fmtDate(t.due_at)}</span>
              {t.lead && <span>· {t.lead.first_name} {t.lead.last_name}</span>}
            </div>
          </div>
          <span className={`text-[9px] px-2 py-0.5 rounded-lg font-bold ${PRIORITY_CONFIG[t.priority]?.bg} ${PRIORITY_CONFIG[t.priority]?.color}`}>{t.priority}</span>
          {new Date(t.due_at) < new Date() && <span className="text-[9px] px-2 py-0.5 rounded-lg bg-red-500/10 text-red-400 font-bold">OVERDUE</span>}
        </div>
      ))}
      {completed.length > 0 && (
        <>
          <h4 className="text-xs text-muted-foreground font-medium mt-6">Completed ({completed.length})</h4>
          {completed.map(t => (
            <div key={t.id} className="bg-card/50 border border-border/50 rounded-xl p-4 flex items-center gap-4 opacity-60">
              <div className="w-5 h-5 rounded-full border-2 border-green-500 bg-green-500/20 flex items-center justify-center">
                <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              </div>
              <div className="text-xs line-through">{t.title}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
