// Outlook engine: determinism, shape, windows, panchang times, ingress dates, label spread, reduced mode.
const assert = require('assert');
const E = require('../js/engine.js'), O = require('../js/outlook.js'), TZ = require('../js/timezone.js');

let seed = 987654321; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const mk = (y, m, d, h, mi, lat, lon, off) => E.computeChart({ utcMs: Date.UTC(y, m - 1, d, h, mi) - off * 1000, lat, lon, tzOffsetSec: off });
const patna = mk(1995, 6, 15, 11, 0, 25.6, 85.1, 19800);
const NOW = Date.UTC(2026, 10, 22, 6, 0);

// constants
for (const p of Object.keys(O.WEIGHTS)) { assert(Math.abs(O.WEIGHTS[p].reduce((a, b) => a + b, 0) - 1) < 1e-9, 'weights sum to 1: ' + p); assert(Math.abs(O.LEVEL_W[p].reduce((a, b) => a + b, 0) - 1) < 1e-9, 'level weights: ' + p); assert.strictEqual(Object.keys(O.PLANET_W[p]).length, 9); }
for (const [pl, hs] of Object.entries(O.GOCHARA_FAV)) assert(hs.every((x) => x >= 1 && x <= 12) && E.PLANETS.includes(pl));

// determinism and shape
const ctx = O.makeCtx(patna, { zone: 'Asia/Kolkata' });
const a = O.periodOutlook(ctx, 'month', NOW, 0), b = O.periodOutlook(O.makeCtx(patna, { zone: 'Asia/Kolkata' }), 'month', NOW, 0);
assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), 'same chart and time must give the same answer');
for (const p of ['day', 'week', 'month', 'year']) {
  const r = O.periodOutlook(ctx, p, NOW, 0);
  assert.deepStrictEqual(Object.keys(r.areas), [...O.AREA_KEYS, 'overall']);
  for (const [k, v] of Object.entries(r.areas)) {
    assert(v.S >= -1 && v.S <= 1, p + ' ' + k + ' score range ' + v.S);
    assert(v.pct >= 0 && v.pct <= 100, 'pct ' + v.pct);
    assert(['strong', 'good', 'mixed', 'challenging'].includes(v.label));
    assert.strictEqual(O.labelOf(v.pct), v.label);
    assert(v.tr.length <= 3 && v.tr.every((x) => E.PLANETS.includes(x.planet) && x.hMoon >= 1 && x.hMoon <= 12));
    if (p !== 'day') {
      const bs = new Set(v.best.map((x) => x.t)); assert(v.caution.every((x) => !bs.has(x.t)), 'best and caution must not overlap');
      for (const x of v.best.concat(v.caution)) assert(x.t >= r.start && x.t < r.end, 'slot inside the window');
      assert(v.best.length === 3, p + ' ' + k + ' best count ' + v.best.length);
    }
  }
  assert(r.end > r.start);
  assert.strictEqual(r.reduced, false);
}
// windows follow the person's own calendar day
const day = O.periodOutlook(ctx, 'day', NOW, 0);
assert.strictEqual(day.start, Date.UTC(2026, 10, 21, 18, 30), 'IST midnight'); assert.strictEqual(day.end - day.start, 86400000);
assert.strictEqual(O.periodOutlook(ctx, 'week', NOW, 0).end - day.start, 7 * 86400000);
assert.strictEqual(O.periodOutlook(ctx, 'week', NOW, 1).start, O.periodOutlook(ctx, 'week', NOW, 0).end, 'the next week starts where this one ends');
assert.strictEqual(O.periodOutlook(ctx, 'year', NOW, 0).end - day.start, 365 * 86400000);
// a daylight-saving day is 23 hours long in London on 2026-03-29, 25 hours on 2026-10-25
const lon = O.makeCtx(patna, { zone: 'Europe/London' });
const spring = O.periodOutlook(lon, 'day', Date.UTC(2026, 2, 29, 12, 0), 0, { lite: true });
assert.strictEqual(spring.end - spring.start, 23 * 3600000, 'spring DST day length');
const autumn = O.periodOutlook(lon, 'day', Date.UTC(2026, 9, 25, 12, 0), 0, { lite: true });
assert.strictEqual(autumn.end - autumn.start, 25 * 3600000, 'autumn DST day length');
// New York and Sydney days begin at local midnight
for (const z of ['America/New_York', 'Australia/Sydney', 'Asia/Kathmandu', 'Pacific/Auckland']) {
  const s = O.localDayStart(NOW, z), off = TZ.offsetSecondsAt(s, z);
  const wall = new Date(s + off * 1000); assert.strictEqual(wall.getUTCHours() + wall.getUTCMinutes(), 0, z + ' local midnight');
}

// Rahu Kaal, Yamaganda, Gulika follow the published weekday segments (Sunday 8th, Monday 2nd ... of eight)
const RAHU = [8, 2, 7, 5, 6, 4, 3], YAMA = [5, 4, 3, 2, 1, 7, 6], GULI = [7, 6, 5, 4, 3, 2, 1];
for (let i = 0; i < 7; i++) {
  const d = O.periodOutlook(ctx, 'day', NOW + i * 86400000, 0).day;
  assert.strictEqual(d.weekday, new Date(d.start + 19800000).getUTCDay(), 'weekday');
  const seg = (d.sunset - d.sunrise) / 8;
  assert(Math.abs(d.rahu.from - (d.sunrise + (RAHU[d.weekday] - 1) * seg)) < 1 && Math.abs(d.rahu.to - d.rahu.from - seg) < 1, 'rahu kaal');
  assert(Math.abs(d.yama.from - (d.sunrise + (YAMA[d.weekday] - 1) * seg)) < 1, 'yamaganda');
  assert(Math.abs(d.gulika.from - (d.sunrise + (GULI[d.weekday] - 1) * seg)) < 1, 'gulika');
  assert(d.sunset - d.sunrise > 9 * 3600000 && d.sunset - d.sunrise < 12 * 3600000, 'day length in Patna, November');
  assert(d.panchang.tithi >= 1 && d.panchang.tithi <= 30 && d.panchang.moonNak >= 0 && d.panchang.moonNak < 27);
}
// Sunday Nov 22 2026 is the 7th day of the week count (0 = Sunday)
assert.strictEqual(O.periodOutlook(ctx, 'day', NOW, 0).day.weekday, 0);

// Ingress times: the planet is on the sign boundary at the moment given, and was in the old sign a bit earlier
const yr = O.periodOutlook(ctx, 'year', NOW, 0);
assert(yr.events.length >= 4, 'a year has several ingresses');
for (const ev of yr.events) {
  assert(ev.atMs >= yr.start && ev.atMs <= yr.end);
  const before = E.lonsAt(ev.atMs - 120000)[ev.planet], after = E.lonsAt(ev.atMs + 120000)[ev.planet];
  assert.strictEqual(Math.floor(before / 30), ev.from, ev.planet + ' sign before'); assert.strictEqual(Math.floor(after / 30), ev.to, ev.planet + ' sign after');
  const fwd = (ev.to - ev.from + 12) % 12 === 1, boundary = ((fwd ? ev.to : ev.from) * 30) % 360;
  const dist = Math.abs(E.lonsAt(ev.atMs)[ev.planet] - boundary), onLine = Math.min(dist, 360 - dist);
  assert(onLine < 0.05, ev.planet + ' lies on the boundary (' + onLine.toFixed(4) + ' deg away)');
}
// Saturn enters Aries in early June 2027 (the published ingress date is 3 June 2027)
const sat = O.periodOutlook(ctx, 'year', Date.UTC(2027, 0, 1), 0).events.find((e) => e.planet === 'Sa' && e.to === 0);
assert(sat && Math.abs(sat.atMs - Date.UTC(2027, 5, 3, 0, 0)) < 86400000, 'Saturn into Aries near 3 June 2027: ' + (sat && new Date(sat.atMs).toISOString()));
// Rahu moves from Aquarius to Capricorn in early December 2026 (mean node)
const rahu = yr.events.find((e) => e.planet === 'Ra');
assert(rahu && rahu.from === 10 && rahu.to === 9 && Math.abs(rahu.atMs - Date.UTC(2026, 11, 5, 12, 0)) < 86400000, 'Rahu into Capricorn near 5 Dec 2026');

// Percentile helper
assert.strictEqual(O.percentile(-5, [0, 1, 2]), 0); assert.strictEqual(O.percentile(9, [0, 1, 2]), 100); assert.strictEqual(O.percentile(0.5, [0, 1, 2]), 25); assert.strictEqual(O.percentile(1, [0, 1, 2]), 50);
assert.strictEqual(O.labelOf(85), 'strong'); assert.strictEqual(O.labelOf(84.9), 'good'); assert.strictEqual(O.labelOf(50), 'good'); assert.strictEqual(O.labelOf(49.9), 'mixed'); assert.strictEqual(O.labelOf(20), 'mixed'); assert.strictEqual(O.labelOf(19.9), 'challenging');

// Label spread on fresh random charts (not the ones used for calibration)
const count = { day: {}, week: {}, month: {}, year: {} }; const varied = { n: 0, total: 0 };
const PL = [[25.6, 85.1, 19800], [28.6, 77.2, 19800], [19.1, 72.9, 19800], [22.6, 88.4, 19800], [51.5, -0.1, 0], [40.7, -74, -18000]];
for (let i = 0; i < 60; i++) {
  const pl = PL[Math.floor(rnd() * PL.length)];
  const c = E.computeChart({ utcMs: Date.UTC(1945 + Math.floor(rnd() * 60), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28), Math.floor(rnd() * 24), Math.floor(rnd() * 60)), lat: pl[0], lon: pl[1], tzOffsetSec: pl[2] });
  const cx = O.makeCtx(c, { zone: 'UTC' });
  for (const p of Object.keys(count)) {
    const r = O.periodOutlook(cx, p, Date.UTC(2026, 0, 1) + Math.floor(rnd() * 700) * 86400000, 0, { lite: true });
    for (const k of O.AREA_KEYS) count[p][r.areas[k].label] = (count[p][r.areas[k].label] || 0) + 1;
    if (p === 'month') { varied.total++; if (new Set(O.AREA_KEYS.map((k) => r.areas[k].label)).size >= 2) varied.n++; }
  }
}
for (const p of Object.keys(count)) {
  const tot = Object.values(count[p]).reduce((a, b) => a + b, 0);
  for (const [lab, lo, hi] of [['strong', 0.06, 0.30], ['good', 0.2, 0.5], ['mixed', 0.15, 0.45], ['challenging', 0.08, 0.35]]) {
    const share = (count[p][lab] || 0) / tot;
    assert(share >= lo && share <= hi, p + ' share of "' + lab + '" is ' + share.toFixed(2) + ', expected ' + lo + '..' + hi);
  }
}
assert(varied.n / varied.total >= 0.75, 'most charts should show different labels for different areas: ' + varied.n + '/' + varied.total);

// Reduced mode (birth time unknown): transit only
const rc = O.makeCtx(patna, { zone: 'Asia/Kolkata', timeUnknown: true });
const rr = O.periodOutlook(rc, 'month', NOW, 0);
assert.strictEqual(rr.reduced, true);
for (const k of O.AREA_KEYS) { const v = rr.areas[k]; assert.strictEqual(v.parts.N, 0); assert.strictEqual(v.parts.D, 0); assert.deepStrictEqual(v.dasha, []); assert(v.tr.every((x) => x.bav === null), 'no Ashtakavarga without a birth time'); }

// Tara bala: counted from the birth star in nines, so the birth star and the 10th and 19th from it are all tara 1 (Janma)
const natalNak = patna.planets.find((p) => p.id === 'Mo').nak;
let found = null;
for (let i = 0; i < 40 && !found; i++) { const d = O.periodOutlook(ctx, 'day', NOW + i * 86400000, 0, { lite: true }); if (d.tara.seq.includes(1)) found = { d, i }; }
assert(found, 'a Janma tara day within 40 days');
{ const t = O.windowStats(ctx, 'day', found.d.start, found.d.end); const nakAtSamples = t.times.map((x) => Math.floor(E.lonsAt(x).Mo / E.NAK_LEN)); assert(nakAtSamples.some((n) => (n - natalNak + 27) % 9 === 0), 'Moon really is in the birth star or the 10th or 19th star from it (the three Janma stars) that day'); }

// Speed: all four periods with all extras in well under a second
const t0 = Date.now(); O.all(patna, { nowMs: NOW, zone: 'Asia/Kolkata' }); const ms = Date.now() - t0;
assert(ms < 2500, 'all periods took ' + ms + ' ms');
console.log('outlook: determinism, windows, DST days, panchang times, ingresses (Saturn 2027, Rahu 2026), label spread, reduced mode OK (' + ms + ' ms for everything)');
