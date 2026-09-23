// Phase 1.13 — Minimal renderer for the legal texts. The source of truth is
// docs/legal/*.md (drafts until counsel signs off); these pages embed the
// same text so the links in the registration form always resolve.
import type { ReactNode } from 'react';
import Link from 'next/link';

function renderMarkdown(md: string): ReactNode[] {
  const out: ReactNode[] = [];
  const lines = md.split('\n');
  let para: string[] = [];
  const flush = (key: number) => {
    if (para.length) { out.push(<p key={`p${key}`} className="text-sm leading-relaxed text-foreground/90">{para.join(' ')}</p>); para = []; }
  };
  lines.forEach((line, i) => {
    if (line.startsWith('# ')) { flush(i); out.push(<h1 key={i} className="text-2xl font-bold mb-2">{line.slice(2)}</h1>); }
    else if (line.startsWith('## ')) { flush(i); out.push(<h2 key={i} className="text-base font-semibold mt-6 mb-2">{line.slice(3)}</h2>); }
    else if (line.startsWith('- ')) { flush(i); out.push(<li key={i} className="text-sm leading-relaxed ml-5 list-disc">{line.slice(2)}</li>); }
    else if (line.trim() === '') flush(i);
    else para.push(line);
  });
  flush(lines.length);
  return out;
}

export function LegalPage({ markdown }: { markdown: string }) {
  const isDraft = /DRAFT/.test(markdown);
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <article className="max-w-2xl mx-auto bg-card/60 border border-border rounded-2xl p-8 space-y-2">
        {isDraft && (
          <div className="text-xs bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-lg px-3 py-2 mb-4">
            Draft text pending legal review. Not yet binding.
          </div>
        )}
        {renderMarkdown(markdown.replace(/\[\[LAWYER:[^\]]*\]\]/g, ''))}
        <div className="pt-6"><Link href="/" className="text-xs text-primary hover:underline">Back</Link></div>
      </article>
    </main>
  );
}
