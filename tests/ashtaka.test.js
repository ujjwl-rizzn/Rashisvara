// Ashtakavarga: fixed totals, a published worked example, and random charts.
const assert = require('assert');
const E = require('../js/engine.js'), AV = require('../js/ashtaka.js');

// 1. Each planet's table has the fixed total, and the places are sorted unique numbers 1..12
for (const pl of AV.SEVEN) {
  let sum = 0;
  for (const c of AV.CONTRIBUTORS) {
    const row = AV.TABLES[pl][c];
    assert(row && row.length, pl + ' ' + c + ' missing');
    assert.deepStrictEqual(row, [...new Set(row)].sort((a, b) => a - b), pl + ' ' + c + ' must be sorted unique');
    assert(row.every((x) => Number.isInteger(x) && x >= 1 && x <= 12), pl + ' ' + c + ' out of range');
    sum += row.length;
  }
  assert.strictEqual(sum, AV.TOTALS[pl], pl + ' table total');
}
assert.strictEqual(AV.SEVEN.reduce((s, p) => s + AV.TOTALS[p], 0), AV.SAV_TOTAL);

// 2. Published worked example (Samudaya chart from a published page). Chart: Su Virgo, Mo Sagittarius, Ma Pisces,
// Me Libra, Ju Taurus, Ve Libra, Sa Taurus, lagna Aries. The Sun, Moon, Mars and Saturn columns are reproduced exactly.
const mkChart = (pos) => ({ asc: { sign: pos.La }, planets: AV.SEVEN.map((id) => ({ id, sign: pos[id] })) });
const ex = AV.compute(mkChart({ Su: 5, Mo: 8, Ma: 11, Me: 6, Ju: 1, Ve: 6, Sa: 1, La: 0 }));
const PUBLISHED = {
  Su: [3, 3, 5, 3, 2, 7, 4, 2, 4, 4, 4, 7], Mo: [5, 4, 4, 5, 4, 3, 3, 3, 5, 4, 6, 3],
  Ma: [3, 3, 3, 1, 3, 3, 3, 2, 3, 4, 6, 5], Sa: [3, 3, 3, 5, 3, 6, 4, 0, 2, 2, 3, 5],
};
for (const [pl, col] of Object.entries(PUBLISHED)) assert.deepStrictEqual(ex.bav[pl], col, 'published example, ' + pl);

// 3. Random real charts: totals fixed, SAV 337, values 0..8, house rotation right
let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
for (let i = 0; i < 300; i++) {
  const utc = Date.UTC(1950 + Math.floor(rnd() * 70), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28), Math.floor(rnd() * 24), Math.floor(rnd() * 60));
  const lat = -50 + rnd() * 100, lon = -170 + rnd() * 340;
  const c = E.computeChart({ utcMs: utc, lat, lon, tzOffsetSec: 0 });
  const r = AV.compute(c);
  assert.strictEqual(r.total, 337, 'SAV total');
  for (const pl of AV.SEVEN) { assert.strictEqual(r.totals[pl], AV.TOTALS[pl], pl + ' total'); assert(r.bav[pl].every((v) => v >= 0 && v <= 8)); }
  assert(r.sav.every((v) => v >= 10 && v <= 56), 'SAV per sign sane');
  for (let h = 0; h < 12; h++) assert.strictEqual(r.savByHouse[h], r.sav[(c.asc.sign + h) % 12]);
}
// Pure random placements as well (any sign combination must still give the fixed totals)
for (let i = 0; i < 2000; i++) {
  const pos = { La: Math.floor(rnd() * 12) }; AV.SEVEN.forEach((p) => { pos[p] = Math.floor(rnd() * 12); });
  const r = AV.compute(mkChart(pos));
  assert.strictEqual(r.total, 337);
  for (const pl of AV.SEVEN) assert.strictEqual(r.totals[pl], AV.TOTALS[pl]);
}
// 4. Classes
assert.strictEqual(AV.bavClass(0), 'weak'); assert.strictEqual(AV.bavClass(2), 'weak'); assert.strictEqual(AV.bavClass(3), 'mid'); assert.strictEqual(AV.bavClass(4), 'mid');
assert.strictEqual(AV.bavClass(5), 'strong'); assert.strictEqual(AV.bavClass(6), 'strong'); assert.strictEqual(AV.bavClass(7), 'top');
assert.strictEqual(AV.savClass(24), 'weak'); assert.strictEqual(AV.savClass(25), 'mid'); assert.strictEqual(AV.savClass(28), 'mid'); assert.strictEqual(AV.savClass(29), 'strong'); assert.strictEqual(AV.savClass(32), 'strong'); assert.strictEqual(AV.savClass(33), 'top');
console.log('ashtaka: tables, fixed totals, published example and 2,300 charts OK');
