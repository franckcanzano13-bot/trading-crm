import { describe, it, expect } from 'vitest';
import {
  formatMifirCsvRow,
  buildMifirCsv,
  buildMifirJson,
  MIFIR_CSV_HEADER,
  MifirTradeRow,
} from '../src/modules/reports/mifir-export';

/**
 * Sprint 5.5 — MiFIR export formatter unit tests.
 *
 * The HTTP route is integration-tested elsewhere; here we lock down the
 * field-mapping contract that downstream regulatory partners depend on.
 */

const baseTrade: MifirTradeRow = {
  id: 'trade-uuid-1',
  user_id: 'user-uuid-9',
  open_time: new Date('2026-01-15T10:30:00.000Z'),
  close_time: new Date('2026-01-15T14:45:30.500Z'),
  side: 'BUY',
  volume: 0.5,
  open_price: 123_45_678n,        // 123.45678
  close_price: 124_50_000n,       // 124.50000
  status: 'CLOSED',
  pnl: 5_25n,                      // 5.25
  commission: 50n,                 // 0.50
  symbol: 'EURUSD',
  lot_size: 100_000,
};

describe('Sprint 5.5 — MiFIR export', () => {
  it('header has the documented 18 columns in the documented order', () => {
    expect(MIFIR_CSV_HEADER.length).toBe(18);
    expect(MIFIR_CSV_HEADER[0]).toBe('txn_ref');
    expect(MIFIR_CSV_HEADER[2]).toBe('trading_dt');
    expect(MIFIR_CSV_HEADER[5]).toBe('trading_capacity');
    expect(MIFIR_CSV_HEADER[13]).toBe('instrument');
    expect(MIFIR_CSV_HEADER[16]).toBe('pnl');
  });

  it('formats a BUY trade with trader as buyer and broker as seller', () => {
    const line = formatMifirCsvRow(baseTrade, 'broker-acme');
    const f = line.split(',');
    expect(f[0]).toBe('trade-uuid-1');               // txn_ref
    expect(f[1]).toBe('broker-acme');                // executing_lei
    expect(f[2]).toBe('2026-01-15T10:30:00.000Z');   // trading_dt
    expect(f[3]).toBe('2026-01-15T14:45:30.500Z');   // close_dt
    expect(f[4]).toBe('BUY');
    expect(f[5]).toBe('DEAL');
    expect(f[6]).toBe('50000');                      // 0.5 * 100000
    expect(f[8]).toBe('123.45678');                  // open_price
    expect(f[9]).toBe('124.50000');                  // close_price
    expect(f[11]).toBe('user-uuid-9');               // buyer_id
    expect(f[12]).toBe('broker-acme');               // seller_id
    expect(f[13]).toBe('EURUSD');
    expect(f[14]).toBe('CFD');
    expect(f[16]).toBe('5.25');                      // pnl
    expect(f[17]).toBe('0.50');                      // commission
  });

  it('flips buyer/seller for SELL trades', () => {
    const sell = { ...baseTrade, side: 'SELL' };
    const f = formatMifirCsvRow(sell, 'broker-acme').split(',');
    expect(f[4]).toBe('SELL');
    expect(f[11]).toBe('broker-acme');
    expect(f[12]).toBe('user-uuid-9');
  });

  it('handles still-open close_time (null) and zero pnl', () => {
    const half: MifirTradeRow = { ...baseTrade, close_time: null, close_price: null, pnl: 0n };
    const f = formatMifirCsvRow(half, 'lei-x').split(',');
    expect(f[3]).toBe('');         // close_dt blank
    expect(f[9]).toBe('');         // close_price blank
    expect(f[16]).toBe('0.00');    // pnl
  });

  it('handles negative pnl (loss) with sign preserved', () => {
    const losing = { ...baseTrade, pnl: -1234n };
    const f = formatMifirCsvRow(losing, 'lei-x').split(',');
    expect(f[16]).toBe('-12.34');
  });

  it('escapes commas in symbols per RFC 4180', () => {
    const weird = { ...baseTrade, symbol: 'EUR,USD' };
    const line = formatMifirCsvRow(weird, 'lei-x');
    expect(line).toContain('"EUR,USD"');
  });

  it('escapes embedded quotes by doubling', () => {
    const weird = { ...baseTrade, symbol: 'A"B' };
    const line = formatMifirCsvRow(weird, 'lei-x');
    expect(line).toContain('"A""B"');
  });

  it('buildMifirCsv prepends header and uses CRLF line endings', () => {
    const csv = buildMifirCsv([baseTrade], 'lei-x');
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(MIFIR_CSV_HEADER.join(','));
    expect(lines[1].split(',')[0]).toBe('trade-uuid-1');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('buildMifirCsv with empty rows still emits header', () => {
    const csv = buildMifirCsv([], 'lei-x');
    expect(csv).toBe(MIFIR_CSV_HEADER.join(',') + '\r\n');
  });

  it('buildMifirJson exposes the same fields as the CSV', () => {
    const [row] = buildMifirJson([baseTrade], 'broker-acme');
    expect(row.txn_ref).toBe('trade-uuid-1');
    expect(row.executing_lei).toBe('broker-acme');
    expect(row.side).toBe('BUY');
    expect(row.quantity).toBe(50000);
    expect(row.price).toBe('123.45678');
    expect(row.buyer_id).toBe('user-uuid-9');
    expect(row.seller_id).toBe('broker-acme');
    expect(row.pnl).toBe('5.25');
    expect(row.commission).toBe('0.50');
  });

  it('formats high-precision price without dropping leading zeros in the fractional part', () => {
    // 0.00001 stored as 1n with 5dp → "0.00001"
    const tiny = { ...baseTrade, open_price: 1n };
    const f = formatMifirCsvRow(tiny, 'lei-x').split(',');
    expect(f[8]).toBe('0.00001');
  });
});
