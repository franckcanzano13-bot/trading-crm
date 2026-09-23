import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import { detachSocket, isPermanentUpgradeFailure } from '../src/modules/pricing/ws-utils';

/**
 * Regression for the CI container crash: an orphaned price-feed socket that
 * emits 'error' after we dropped our listeners must not throw.
 */
describe('pricing/ws-utils', () => {
  it('detachSocket swallows late errors on an abandoned socket', () => {
    const ws = Object.assign(new EventEmitter(), { closed: 0, terminate() { this.closed++; } });
    let ourHandlerCalls = 0;
    ws.on('error', () => { ourHandlerCalls++; });
    detachSocket(ws);
    expect(() => ws.emit('error', new Error('Unexpected server response: 451'))).not.toThrow();
    expect(ourHandlerCalls).toBe(0);
    expect(ws.closed).toBe(1);
  });

  it('an un-detached emitter with no listener throws (the bug we are guarding against)', () => {
    const ws = new EventEmitter();
    expect(() => ws.emit('error', new Error('boom'))).toThrow('boom');
  });

  it('classifies permanent upgrade failures', () => {
    expect(isPermanentUpgradeFailure(451)).toBe(true);
    expect(isPermanentUpgradeFailure(403)).toBe(true);
    expect(isPermanentUpgradeFailure(503)).toBe(false);
    expect(isPermanentUpgradeFailure(undefined)).toBe(false);
  });
});
