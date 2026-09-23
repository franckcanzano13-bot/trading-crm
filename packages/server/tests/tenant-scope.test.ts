import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Phase 1.12 / ADR-002 — every Prisma query on a tenant-scoped table must
 * filter on tenant_id. This is a static scan of src/**: it does not need a
 * database and runs with the unit suite, so a cross-tenant query cannot
 * merge unnoticed.
 *
 * Rules:
 *  - Tables are tenant-scoped when the Prisma model has a tenant_id field.
 *  - Checked calls: findFirst, findMany, updateMany, deleteMany, count,
 *    aggregate, groupBy (the ones where a missing filter returns or touches
 *    other tenants' rows). findUnique/update/delete by primary key follow a
 *    scoped lookup by convention and are not scanned.
 *  - A call passes when its arguments mention tenant_id, or when they use a
 *    `where` object whose definition (looked up backwards in the file)
 *    mentions tenant_id, or when the line — or the line above — carries a
 *    `// tenant-scope: <reason>` annotation (cross-tenant on purpose:
 *    background workers, superadmin, lookups by a globally unique key).
 */
const SERVER_ROOT = join(__dirname, '..');

function tenantModels(): Set<string> {
  const schema = readFileSync(join(SERVER_ROOT, 'prisma/schema.prisma'), 'utf8');
  const out = new Set<string>();
  for (const m of schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)) {
    if (/^\s*tenant_id\s/m.test(m[2])) out.add(m[1][0].toLowerCase() + m[1].slice(1));
  }
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith('.ts') && !/seed/.test(name)) acc.push(p);
  }
  return acc;
}

const CALL = /\b(?:prisma|tx|db)\.(\w+)\.(findFirst|findMany|updateMany|deleteMany|count|aggregate|groupBy)\(/g;

function callArgs(src: string, openParenEnd: number): string {
  let depth = 1, j = openParenEnd;
  while (j < src.length && depth) { depth += src[j] === '(' ? 1 : src[j] === ')' ? -1 : 0; j++; }
  return src.slice(openParenEnd, j);
}

/** Does the `where` object referenced by the call carry tenant_id? */
function whereVariableScoped(src: string, callStart: number, args: string): boolean {
  const names = new Set<string>();
  for (const m of args.matchAll(/where\s*[,}\n]/g)) { void m; names.add('where'); }
  for (const m of args.matchAll(/where:\s*([A-Za-z_]\w*)/g)) names.add(m[1]);
  for (const m of args.matchAll(/\.\.\.([A-Za-z_]\w*)/g)) names.add(m[1]);
  if (names.size === 0) return false;
  const before = src.slice(Math.max(0, callStart - 6000), callStart);
  for (const name of names) {
    const re = new RegExp(`(?:const|let)\\s+${name}\\b[^\\n]*\\n(?:[^\\n]*\\n){0,4}`, 'g');
    let last: string | null = null;
    for (const m of before.matchAll(re)) last = m[0];
    if (last && /tenant_id/.test(last)) return true;
  }
  return false;
}

export function scanTenantScope(): string[] {
  const models = tenantModels();
  const issues: string[] = [];
  for (const file of walk(join(SERVER_ROOT, 'src'))) {
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    for (const m of src.matchAll(CALL)) {
      const model = m[1];
      if (!models.has(model)) continue;
      const start = m.index!;
      const args = callArgs(src, start + m[0].length);
      const lineNo = src.slice(0, start).split('\n').length;
      const annotated = /tenant-scope:/.test(lines[lineNo - 1] || '') || /tenant-scope:/.test(lines[lineNo - 2] || '');
      if (annotated) continue;
      if (/tenant_id/.test(args)) continue;
      if (whereVariableScoped(src, start, args)) continue;
      issues.push(`${relative(SERVER_ROOT, file).replace(/\\/g, '/')}:${lineNo} prisma.${model}.${m[2]}()`);
    }
  }
  return issues;
}

describe('ADR-002 — tenant scoping of Prisma queries (static scan)', () => {
  it('finds at least one tenant-scoped model and scans the source tree', () => {
    expect(tenantModels().has('user')).toBe(true);
    expect(walk(join(SERVER_ROOT, 'src')).length).toBeGreaterThan(10);
  });

  it('every query on a tenant table filters on tenant_id or is annotated', () => {
    const issues = scanTenantScope();
    expect(issues, `Unscoped queries:\n  ${issues.join('\n  ')}\nAdd where.tenant_id, or annotate the line with // tenant-scope: <why cross-tenant is intended>`).toEqual([]);
  });
});
