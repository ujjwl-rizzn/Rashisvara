// Rebuilds js/outlook-cal.js: the score tables that turn an outlook score into a percentile and a label.
// Run:  node tests/calibrate.js   (takes about a minute). Only needed if the weights in js/outlook.js change.
const fs = require('fs'), path = require('path');
const E = require('../js/engine.js');
const file = path.join(__dirname, '../js/outlook-cal.js');
// Use an empty calibration while measuring
const src0 = fs.readFileSync(file, 'utf8');
const O = require('../js/outlook.js');

let seed = 20261122; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const CHARTS = 500, TIMES = 3;
const periods = ['day', 'week', 'month', 'year'];
const pool = { full: {}, reduced: {} };
for (const m of ['full', 'reduced']) for (const p of periods) { pool[m][p] = []; pool[m][p + ':overall'] = []; }
// Birth places: mostly South Asia, some world-wide, so the Moon and lagna signs are well spread
const PLACES = [[25.6, 85.1, 19800], [28.6, 77.2, 19800], [19.1, 72.9, 19800], [22.6, 88.4, 19800], [13.1, 80.3, 19800], [23.8, 90.4, 21600], [27.7, 85.3, 20700], [51.5, -0.1, 0], [40.7, -74, -18000], [-33.9, 151.2, 36000], [1.3, 103.8, 28800], [25.2, 55.3, 14400]];
for (let i = 0; i < CHARTS; i++) {
  const utc = Date.UTC(1940 + Math.floor(rnd() * 66), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28), Math.floor(rnd() * 24), Math.floor(rnd() * 60));
  const pl = PLACES[Math.floor(rnd() * PLACES.length)];
  const chart = E.computeChart({ utcMs: utc, lat: pl[0], lon: pl[1], tzOffsetSec: pl[2] });
  for (const mode of ['full', 'reduced']) {
    const ctx = O.makeCtx(chart, { zone: 'UTC', timeUnknown: mode === 'reduced' });
    for (let k = 0; k < TIMES; k++) {
      const now = Date.UTC(2025, 0, 1) + Math.floor(rnd() * 10 * 365) * 86400000 + Math.floor(rnd() * 86400000);
      for (const p of periods) {
        const r = O.periodOutlook(ctx, p, now, 0, { lite: true });
        for (const key of O.AREA_KEYS) pool[mode][p].push(r.areas[key].S);
        pool[mode][p + ':overall'].push(r.areas.overall.S);
      }
    }
  }
  if (i % 100 === 99) process.stderr.write('.');
}
const q = (arr) => { const a = arr.slice().sort((x, y) => x - y); const out = []; for (let i = 0; i <= 20; i++) { const pos = (i / 20) * (a.length - 1), lo = Math.floor(pos), f = pos - lo; out.push(+(a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * f).toFixed(4)); } return out; };
const table = {};
for (const m of ['full', 'reduced']) { table[m] = {}; for (const k of Object.keys(pool[m])) table[m][k] = q(pool[m][k]); }
const head = src0.slice(0, src0.indexOf("  return "));
const out = head + '  return ' + JSON.stringify(table, null, 1).replace(/\n\s+(?=[-\d])/g, ' ').replace(/\n\s+\]/g, ' ]') + ';\n});\n';
fs.writeFileSync(file, out);
console.log('\nwrote ' + file + ' from ' + Object.values(pool.full)[0].length + ' scores per list');
