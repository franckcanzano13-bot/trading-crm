/**
 * Phase 0.2 (CI finding) — helpers shared by the WebSocket price connectors.
 *
 * Root cause of the api container dying in CI: Binance answers HTTP 451
 * (geo-blocked) from GitHub's US runners. `ws` emits 'error' then 'close';
 * our reconnect path called removeAllListeners() on the old socket, and a
 * late 'error' on that orphaned socket had no listener left — an
 * EventEmitter 'error' with no listener is thrown, which took the whole
 * process down. A broker hosted in a region Binance blocks would crash-loop
 * exactly the same way.
 */
import type { EventEmitter } from 'events';

/**
 * Detach a socket we are abandoning: drop our handlers but keep a no-op
 * 'error' listener so anything it still emits is swallowed, then close it.
 */
export function detachSocket(ws: (EventEmitter & { close?: () => void; terminate?: () => void }) | null | undefined): void {
  if (!ws) return;
  try { ws.removeAllListeners(); } catch { /* ignore */ }
  ws.on('error', () => { /* orphaned socket: never let 'error' escape */ });
  try {
    if (typeof ws.terminate === 'function') ws.terminate();
    else if (typeof ws.close === 'function') ws.close();
  } catch { /* ignore */ }
}

/** HTTP status codes on the upgrade response that mean "do not retry". */
export const PERMANENT_UPGRADE_FAILURES = new Set([401, 403, 404, 410, 451]);

export function isPermanentUpgradeFailure(statusCode: number | undefined): boolean {
  return statusCode !== undefined && PERMANENT_UPGRADE_FAILURES.has(statusCode);
}
