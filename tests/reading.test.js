// Runs the whole reading pipeline on many random charts in all four languages.
const assert = require('assert');
const E = require('../js/engine.js'), R = require('../js/rules.js'), I = require('../js/i18n.js'), RD = require('../js/reading.js');

function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const r = rng(777);
const bad = (s) => typeof s !== 'string' || /undefined|NaN|\[object|\{[a-zA-Z]+\}/.test(s);
let checked = 0, yogaSeen = new Set();
const NOW = Date.UTC(2026, 10, 19, 5, 0);

for (let i = 0; i < 300; i++) {
  const ms = Math.floor(Date.UTC(1930, 0, 1) + r() * (Date.UTC(2024, 0, 1) - Date.UTC(1930, 0, 1)));
  const chart = E.computeChart({ utcMs: ms, lat: -50 + r() * 100, lon: -170 + r() * 340, tzOffsetSec: 0 });
  const areas = R.allAreas(chart, NOW), yogas = R.yogas(chart), tr = E.transits(chart, NOW);
  yogas.forEach((y) => yogaSeen.add(y.id));
  for (const L of Object.keys(I.LANGS)) {
    const check = (s, what) => { checked++; assert(!bad(s), 'Bad text (' + L + ', ' + what + '): ' + s); assert(s.length > 0, 'Empty (' + L + ', ' + what + ')'); };
    for (const row of RD.planetRows(L, chart)) { ['name', 'sign', 'deg', 'nak'].forEach((k) => check(String(row[k]), 'row ' + k)); }
    for (const [k, v] of RD.panchangRows(L, chart, 'Asia/Kolkata')) check(String(v), 'panchang ' + k);
    check(RD.karakaText(L, chart), 'karaka');
    for (const key of Object.keys(areas)) {
      const v = RD.areaView(L, chart, areas[key], 'Asia/Kolkata');
      check(v.title, 'area title'); check(v.sub, 'area sub'); check(v.label, 'label');
      v.houses.forEach((h) => { check(h.title, 'house title'); h.lines.forEach((l) => check(l, 'house line')); });
      v.karakaLines.forEach((l) => check(l, 'karaka line')); v.activeLines.forEach((l) => check(l, 'active')); v.windows.forEach((l) => check(l, 'window'));
    }
    for (const y of yogas) { const v = RD.yogaView(L, chart, y); check(v.name, 'yoga name ' + y.id); check(v.text, 'yoga text ' + y.id); }
    const tv = RD.transitView(L, chart, tr, 'Asia/Kolkata'); tv.lines.forEach((l) => check(l, 'transit line'));
  }
  const facts = RD.factsForAI(chart, { nowMs: NOW, zone: 'Asia/Kolkata' });
  assert(!bad(facts), 'Bad facts text'); assert(facts.length > 2000 && facts.length < 16000, 'Facts size ' + facts.length);
}
console.log('reading: ' + checked + ' strings checked in 4 languages, no gaps. Yogas seen: ' + [...yogaSeen].sort().join(', '));

// sample fact sheet length
const c = E.computeChart({ utcMs: Date.UTC(1995, 7, 15, 1, 0), lat: 22.57, lon: 88.36, tzOffsetSec: 19800 });
const f = RD.factsForAI(c, { nowMs: NOW, zone: 'Asia/Kolkata' });
console.log('fact sheet: ' + f.length + ' characters (about ' + Math.round(f.length / 4) + ' tokens)');
require('fs').writeFileSync(process.argv[2] || '/dev/null', f);
