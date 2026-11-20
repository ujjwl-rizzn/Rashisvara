// Calculation checks: against Swiss Ephemeris reference numbers, known calendar events, and basic identities.
const assert = require('assert');
const E = require('../js/engine.js'), TZ = require('../js/timezone.js');
const ref = require('./fixtures/swiss-reference.json');

const arcsec = (a, b) => Math.abs(((a - b + 180) % 360 + 360) % 360 - 180) * 3600;
const LIMIT = { Su: 6, Mo: 8, Ma: 25, Me: 25, Ju: 25, Ve: 30, Sa: 25, Ra: 1, As: 3 };   // arcseconds; measured worst case is well below these
const worst = {};
for (const c of ref.cases) {
  const ch = E.computeChart({ utcMs: c.utcMs, lat: c.lat, lon: c.lon, tzOffsetSec: 0 });
  assert(arcsec(ch.ayanamsa, c.ayanamsa) < 0.5, 'ayanamsa differs');
  for (const p of ch.planets) if (c.expected[p.id] !== undefined) {
    const d = arcsec(p.lon, c.expected[p.id]); worst[p.id] = Math.max(worst[p.id] || 0, d);
    assert(d < LIMIT[p.id], p.id + ' off by ' + d.toFixed(1) + ' arcsec at ' + new Date(c.utcMs).toISOString());
  }
  const d = arcsec(ch.asc.lon, c.expected.As); worst.As = Math.max(worst.As || 0, d);
  assert(d < LIMIT.As, 'ascendant off by ' + d.toFixed(1));
}
console.log('engine: ' + ref.cases.length + ' reference births match Swiss Ephemeris. Worst arcsec: ' + Object.entries(worst).map(([k, v]) => k + ' ' + v.toFixed(1)).join(', '));

// Lahiri ayanamsa at its defining moment, 1956-03-21 (JD 2435553.5): the official 23 deg 15' 00.66" is measured on the TRUE
// equinox. This app works on the MEAN equinox (as Swiss Ephemeris does), so the nutation of that date, 0.004658 deg, comes off.
const t0 = E._astro.MakeTime(new Date(Date.UTC(1956, 2, 21, 0, 0, 0)));
assert(arcsec(E.ayanamsa(t0), 23 + 15 / 60 + 0.66 / 3600 - 0.004658035) < 1, 'Lahiri anchor value');

// Makar Sankranti 2026: the Sun reaches 270 deg sidereal. Drik Panchang lists 15:13 IST (09:43 UTC); allow 10 minutes for ayanamsa-convention differences.
let lo = Date.UTC(2026, 0, 13), hi = Date.UTC(2026, 0, 16);
for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; const l = E.positionsAt(mid)[0].lon; if (l > 180 && l < 270) lo = mid; else hi = mid; }
const published = Date.UTC(2026, 0, 14, 9, 43);
assert(Math.abs(lo - published) < 10 * 60000, 'Sankranti off by ' + ((lo - published) / 60000).toFixed(1) + ' min');
console.log('engine: Makar Sankranti 2026 at ' + new Date(lo).toISOString().slice(11, 16) + ' UTC vs published 09:43 (' + ((lo - published) / 60000).toFixed(1) + ' min)');

// Identities that must hold for every chart
for (const c of ref.cases.slice(0, 30)) {
  const ch = E.computeChart({ utcMs: c.utcMs, lat: c.lat, lon: c.lon, tzOffsetSec: 0 });
  const by = Object.fromEntries(ch.planets.map((p) => [p.id, p]));
  assert(Math.abs(((by.Ke.lon - by.Ra.lon + 360) % 360) - 180) < 1e-9, 'Ketu opposite Rahu');
  ch.planets.forEach((p) => { assert(p.lon >= 0 && p.lon < 360 && p.house >= 1 && p.house <= 12 && p.pada >= 1 && p.pada <= 4); });
  assert.strictEqual(ch.houses.reduce((s, h) => s + h.planets.length, 0), 9, 'every planet in exactly one house');
  const m = ch.dasha.list[2], sum = E.subPeriods(m).reduce((s, x) => s + x.end - x.start, 0);
  assert(Math.abs(sum - (m.end - m.start)) < 1, 'antardashas fill the mahadasha');
  assert.strictEqual(new Set(Object.values(ch.karakas)).size, 7, 'seven distinct karakas');
}

// Vimshottari balance at birth for exact nakshatra points
const mkMoon = (lon) => E.dashaMaha(0, lon);
assert.strictEqual(mkMoon(0).balance.lord, 'Ke'); assert(Math.abs(mkMoon(0).balance.years - 7) < 1e-9);
assert.strictEqual(mkMoon(360 / 27).balance.lord, 'Ve'); assert(Math.abs(mkMoon(360 / 27).balance.years - 20) < 1e-9);
assert(Math.abs(mkMoon(360 / 54).balance.years - 3.5) < 1e-9);
assert.strictEqual(mkMoon(26.99 * 360 / 27).balance.lord, 'Me');                   // Revati
assert.strictEqual(E.dashaMaha(0, 100).list.length, 18);

// Divisional charts
const V = E.vargaSign;
assert.strictEqual(V(1, 9), 0); assert.strictEqual(V(31, 9), 9); assert.strictEqual(V(61, 9), 6); assert.strictEqual(V(91, 9), 3);   // movable/fixed/dual/water starts
assert.strictEqual(V(1, 10), 0); assert.strictEqual(V(31, 10), 9);                  // odd sign from itself, even sign from the 9th
assert.strictEqual(V(1, 7), 0); assert.strictEqual(V(31, 7), 7);                    // odd from itself, even from the 7th
assert.strictEqual(V(1, 3), 0); assert.strictEqual(V(11, 3), 4); assert.strictEqual(V(21, 3), 8);
assert.strictEqual(V(1, 12), 0); assert.strictEqual(V(3, 12), 1);
for (let l = 0; l < 360; l += 0.37) for (const n of E.VARGAS) { const s = V(l, n); assert(s >= 0 && s < 12 && Number.isInteger(s)); }

// Dignity
const D = E.dignity;
assert.strictEqual(D('Sa', 6, 3), 'exalted'); assert.strictEqual(D('Sa', 0, 3), 'debilitated'); assert.strictEqual(D('Mo', 1, 10), 'exalted');
assert.strictEqual(D('Su', 4, 5), 'moolatrikona'); assert.strictEqual(D('Su', 4, 25), 'own'); assert.strictEqual(D('Ve', 6, 10), 'moolatrikona');
assert.strictEqual(D('Ma', 0, 5), 'moolatrikona'); assert.strictEqual(D('Ma', 0, 20), 'own'); assert.strictEqual(D('Ju', 3, 1), 'exalted');
assert.strictEqual(D('Ra', 0, 1), null); assert.strictEqual(D('Su', 0, 3), 'exalted'); assert.strictEqual(D('Su', 7, 3), 'friend');

// Time zones
const k = TZ.localToUtc(2000, 6, 15, 12, 0, 0, 'Asia/Kolkata'); assert.strictEqual(new Date(k.utcMs).toISOString(), '2000-06-15T06:30:00.000Z');
const w = TZ.localToUtc(1944, 6, 1, 12, 0, 0, 'Asia/Kolkata'); assert.strictEqual(w.offsetSec, 6.5 * 3600, 'India war time +6:30 in 1944');
assert.strictEqual(TZ.localToUtc(2026, 3, 8, 2, 30, 0, 'America/New_York').status, 'nonexistent');
const amb = TZ.localToUtc(2026, 11, 1, 1, 30, 0, 'America/New_York'); assert.strictEqual(amb.status, 'ambiguous');
assert.strictEqual(TZ.localToUtc(2026, 7, 1, 12, 0, 0, 'Europe/London').offsetSec, 3600);
assert.strictEqual(TZ.offsetLabel(19800), 'UTC+05:30'); assert.strictEqual(TZ.offsetLabel(-12600), 'UTC-03:30');
console.log('engine: vargas, dignity, dasha balance, time zones, identities all pass');
