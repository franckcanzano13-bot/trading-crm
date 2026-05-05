/**
 * QA Step 4 — WebSocket & Real-time Prices Test
 */
import WebSocket from 'ws';

let passCount = 0;
let failCount = 0;

function assert(condition, label) {
  if (condition) { passCount++; console.log(`  ✅ ${label}`); }
  else { failCount++; console.log(`  ❌ FAIL: ${label}`); }
}

const PRICE_RANGES = {
  EURUSD: [0.8, 1.5], GBPUSD: [1.0, 1.8], AUDUSD: [0.4, 0.9],
  NZDUSD: [0.4, 0.8], EURGBP: [0.7, 1.0],
  USDJPY: [100, 200], EURJPY: [120, 220], GBPJPY: [150, 250],
  BTCUSD: [10000, 200000], ETHUSD: [500, 10000], SOLUSD: [10, 500],
  ADAUSD: [0.1, 5], DOGEUSD: [0.01, 1], XRPUSD: [0.1, 5],
  XAUUSD: [1000, 5000], XAGUSD: [15, 60],
  DE40: [10000, 25000], US30: [25000, 50000], US500: [3000, 7000],
  NAS100: [10000, 25000], UK100: [5000, 10000],
  USOIL: [30, 120], NATGAS: [1, 10],
};

async function run() {
  console.log('\n=========================================');
  console.log('  QA STEP 4: WEBSOCKET & REAL-TIME PRICES');
  console.log('=========================================\n');

  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:5500/ws/prices');
    const receivedSymbols = new Map(); // symbol -> tick[]
    let connected = false;

    ws.on('open', () => {
      connected = true;
      console.log('WebSocket connected');
      // Subscribe to a few key instruments
      ws.send(JSON.stringify({ type: 'subscribe', symbols: ['EURUSD', 'BTCUSD', 'XAUUSD', 'USDJPY', 'ETHUSD'] }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        // Handle tick messages
        if (msg.type === 'tick' && msg.data) {
          const tick = msg.data;
          if (!receivedSymbols.has(tick.symbol)) {
            receivedSymbols.set(tick.symbol, []);
          }
          receivedSymbols.get(tick.symbol).push(tick);
        }
        // Handle snapshot (initial prices)
        if (msg.type === 'snapshot' && Array.isArray(msg.data)) {
          for (const tick of msg.data) {
            if (tick.symbol && tick.bid && tick.ask) {
              if (!receivedSymbols.has(tick.symbol)) {
                receivedSymbols.set(tick.symbol, []);
              }
              receivedSymbols.get(tick.symbol).push(tick);
            }
          }
        }
      } catch {}
    });

    ws.on('error', (err) => {
      console.log(`WebSocket error: ${err.message}`);
    });

    // Collect ticks for 15 seconds
    setTimeout(() => {
      ws.close();

      console.log('\n1. Connection');
      assert(connected, 'WebSocket connected successfully');

      console.log('\n2. Tick Reception');
      const totalSymbols = receivedSymbols.size;
      assert(totalSymbols > 0, `Received ticks for ${totalSymbols} symbols`);

      console.log('\n3. Tick Format & Validation');
      let allValid = true;
      let spreadValid = true;
      let rangeValid = true;

      for (const [symbol, ticks] of receivedSymbols) {
        console.log(`  ${symbol}: ${ticks.length} ticks`);
        // Major instruments get live feed ticks; others get snapshot + mock updates
        const isLiveFeed = ['EURUSD', 'BTCUSD', 'ETHUSD', 'USDJPY', 'XAUUSD'].includes(symbol);
        if (isLiveFeed) {
          assert(ticks.length >= 3, `${symbol} (live) has >= 3 ticks (${ticks.length})`);
        } else {
          assert(ticks.length >= 1, `${symbol} (mock) has >= 1 tick (${ticks.length})`);
        }

        for (const tick of ticks) {
          // Format check
          if (!tick.symbol || !tick.bid || !tick.ask) {
            allValid = false;
          }
          // Spread check (bid < ask)
          if (tick.bid >= tick.ask) {
            spreadValid = false;
          }
          // Range check
          const range = PRICE_RANGES[symbol];
          if (range) {
            const mid = (tick.bid + tick.ask) / 2;
            if (mid < range[0] || mid > range[1]) {
              rangeValid = false;
              console.log(`    ⚠ ${symbol} out of range: ${mid} (expected ${range[0]}-${range[1]})`);
            }
          }
        }
      }

      assert(allValid, 'All ticks have {symbol, bid, ask} fields');
      assert(spreadValid, 'All ticks have bid < ask (positive spread)');
      assert(rangeValid, 'All prices within realistic ranges');

      console.log('\n4. Timestamp Check');
      let hasTimestamp = true;
      for (const [, ticks] of receivedSymbols) {
        for (const tick of ticks) {
          if (!tick.timestamp) { hasTimestamp = false; break; }
        }
      }
      assert(hasTimestamp, 'All ticks have timestamp');

      console.log(`\n=========================================`);
      console.log(`  RESULTS: ${passCount} PASS, ${failCount} FAIL`);
      console.log(`=========================================\n`);
      resolve(failCount === 0);
    }, 15000);
  });
}

run().then(ok => process.exit(ok ? 0 : 1)).catch(err => { console.error(err); process.exit(1); });
