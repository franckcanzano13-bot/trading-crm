/**
 * Sprint 5.5 — MiFIR/EMIR transaction reporting export.
 *
 * Produces a CSV (and JSON) of closed trades formatted to align with MiFIR
 * RTS 22 transaction reporting fields. We are not actually filing this with
 * a NCA — our audit notes "Reporting MiFIR/EMIR transactionnel non implémenté"
 * and asks for a usable export so a regulated broker can hand the data to
 * their reporting partner (e.g. Cappitech, UnaVista) without bespoke ETL.
 *
 * Field mapping (simplified, B-Book CFD):
 *   txn_ref        → trade.id (Transaction Reference Number, ISO 23897)
 *   executing_lei  → tenant.slug (placeholder; production sets a real LEI)
 *   trading_dt     → open_time (Trading Date/Time, ISO 8601 UTC)
 *   close_dt       → close_time
 *   side           → BUY / SELL
 *   trading_capacity → DEAL (broker trades on own account against the client)
 *   quantity       → volume × lot_size  (notional units)
 *   quantity_ccy   → instrument quote currency (defaults to USD)
 *   price          → open_price (decimal, 5dp from priceToInt)
 *   close_price    → close_price (decimal)
 *   price_ccy      → USD
 *   buyer_id       → trader user_id when side=BUY, executing_lei when side=SELL
 *   seller_id      → executing_lei when side=BUY, trader user_id when side=SELL
 *   instrument     → instrument.symbol  (production sets ISIN where available)
 *   instrument_type → CFD
 *   status         → CLOSED / LIQUIDATED / TRAILING_STOP / SL / TP / SCHEDULED
 *   pnl_cents
 *   commission_cents
 *
 * The export is APPEND-ONLY (read-only) and goes through an admin endpoint
 * audited as REGULATORY_EXPORT, since the dataset itself is sensitive.
 */

export interface MifirTradeRow {
  id: string;
  user_id: string;
  open_time: Date;
  close_time: Date | null;
  side: string;
  volume: number;
  open_price: bigint;
  close_price: bigint | null;
  status: string;
  pnl: bigint;
  commission: bigint;
  symbol: string;
  lot_size: number;
}

/** Convert a BigInt price (5dp from priceToInt) to a decimal string. */
function formatPrice(p: bigint | null): string {
  if (p === null) return '';
  const sign = p < 0n ? '-' : '';
  const abs = p < 0n ? -p : p;
  const whole = abs / 100000n;
  const frac = (abs % 100000n).toString().padStart(5, '0');
  return `${sign}${whole}.${frac}`;
}

/** Convert cents BigInt to a decimal currency string. */
function formatCents(c: bigint): string {
  const sign = c < 0n ? '-' : '';
  const abs = c < 0n ? -c : c;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

/** RFC 4180 CSV field escaping. */
function csvField(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const MIFIR_CSV_HEADER = [
  'txn_ref',
  'executing_lei',
  'trading_dt',
  'close_dt',
  'side',
  'trading_capacity',
  'quantity',
  'quantity_ccy',
  'price',
  'close_price',
  'price_ccy',
  'buyer_id',
  'seller_id',
  'instrument',
  'instrument_type',
  'status',
  'pnl',
  'commission',
] as const;

/**
 * Format a single trade row to a CSV line (no trailing newline).
 * Pure function — exported for unit testing.
 */
export function formatMifirCsvRow(t: MifirTradeRow, executingLei: string): string {
  const isBuy = t.side === 'BUY';
  const quantity = t.volume * t.lot_size;
  const fields = [
    t.id,
    executingLei,
    t.open_time.toISOString(),
    t.close_time ? t.close_time.toISOString() : '',
    t.side,
    'DEAL',
    quantity,
    'USD',
    formatPrice(t.open_price),
    formatPrice(t.close_price),
    'USD',
    isBuy ? t.user_id : executingLei,
    isBuy ? executingLei : t.user_id,
    t.symbol,
    'CFD',
    t.status,
    formatCents(t.pnl),
    formatCents(t.commission),
  ];
  return fields.map(csvField).join(',');
}

/** Produce a complete CSV document (header + rows). */
export function buildMifirCsv(rows: MifirTradeRow[], executingLei: string): string {
  const lines = [MIFIR_CSV_HEADER.join(',')];
  for (const r of rows) {
    lines.push(formatMifirCsvRow(r, executingLei));
  }
  return lines.join('\r\n') + '\r\n';
}

/** JSON export — same field set, structured. */
export function buildMifirJson(rows: MifirTradeRow[], executingLei: string): Array<Record<string, string | number>> {
  return rows.map((t) => {
    const isBuy = t.side === 'BUY';
    return {
      txn_ref: t.id,
      executing_lei: executingLei,
      trading_dt: t.open_time.toISOString(),
      close_dt: t.close_time ? t.close_time.toISOString() : '',
      side: t.side,
      trading_capacity: 'DEAL',
      quantity: t.volume * t.lot_size,
      quantity_ccy: 'USD',
      price: formatPrice(t.open_price),
      close_price: formatPrice(t.close_price),
      price_ccy: 'USD',
      buyer_id: isBuy ? t.user_id : executingLei,
      seller_id: isBuy ? executingLei : t.user_id,
      instrument: t.symbol,
      instrument_type: 'CFD',
      status: t.status,
      pnl: formatCents(t.pnl),
      commission: formatCents(t.commission),
    };
  });
}
