// Reply checker tests: parsing the CHECK line, comparing with a real chart, date guard, messages in every language.
'use strict';
const assert = require('assert');
const E = require('../js/engine.js');
const I = require('../js/i18n.js');
require('../js/i18n-extra.js');
require('../js/i18n-outlook.js');
const C = require('../js/checker.js');

const utcMs = Date.UTC(1990, 4, 15, 5, 0);
const chart = E.computeChart({ utcMs, lat: 28.6139, lon: 77.209, tzOffsetSec: 19800 });
const nowMs = Date.UTC(2026, 10, 22, 6, 0);
const cur = E.periodAt(chart.dasha, nowMs);
const by = Object.fromEntries(chart.planets.map((p) => [p.id, p]));
const EN = { Su: 'Sun', Mo: 'Moon', Ma: 'Mars', Me: 'Mercury', Ju: 'Jupiter', Ve: 'Venus', Sa: 'Saturn', Ra: 'Rahu', Ke: 'Ketu' };
const SN = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

// ---- 1. parsing ----------------------------------------------------------------
{
  const a = C.parseCheck('Your career is steady.\n\nCHECK: Jupiter in Cancer; Moon in house 4; Lagna Leo; Dasha Saturn/Mercury');
  assert.strictEqual(a.visible, 'Your career is steady.');
  assert(a.claims.some((c) => c.kind === 'sign' && c.planet === 'Ju' && c.sign === 3));
  assert(a.claims.some((c) => c.kind === 'house' && c.planet === 'Mo' && c.house === 4));
  assert(a.claims.some((c) => c.kind === 'lagna' && c.sign === 4));
  assert(a.claims.some((c) => c.kind === 'dasha' && c.maha === 'Sa' && c.antar === 'Me'));
  assert.strictEqual(a.hasCheck, true);

  // markdown decoration, Hindi-style sign names, "is in", and CHECK: none
  const b = C.parseCheck('Text\n**CHECK:** Saturn is in Makara; Venus is in the house 7');
  assert.strictEqual(b.visible, 'Text');
  assert(b.claims.some((c) => c.planet === 'Sa' && c.sign === 9));
  assert(b.claims.some((c) => c.planet === 'Ve' && c.house === 7));
  const c = C.parseCheck('Just a general answer.\nCHECK: none');
  assert.strictEqual(c.none, true); assert.strictEqual(c.claims.length, 0); assert.strictEqual(c.visible, 'Just a general answer.');
  const d = C.parseCheck('No check line here.');
  assert.strictEqual(d.hasCheck, false); assert.strictEqual(d.visible, 'No check line here.');
  // a normal sentence that starts with "Check:" in sentence case is not a CHECK line
  const e = C.parseCheck('Check: your Moon is calm.\nCHECK: Moon in Taurus');
  assert(e.visible.includes('Check: your Moon is calm.'));
  assert.strictEqual(e.claims.length, 1);
  // hostile or empty inputs never throw
  for (const x of [null, undefined, '', 'CHECK:', 'CHECK: ' + 'x'.repeat(100000), 'CHECK: Moon in house 99; Sun in house 0']) C.parseCheck(x);
}

// ---- 2. comparison with the chart -----------------------------------------------
const goodLine = 'CHECK: ' + EN.Ju + ' in ' + SN[by.Ju.sign] + '; ' + EN.Mo + ' in house ' + by.Mo.house + '; Lagna ' + SN[chart.asc.sign] +
  '; Dasha ' + EN[cur.maha.lord] + '/' + EN[cur.antar.lord];
{
  const ok = C.evaluate({ text: 'Fine.\n' + goodLine, chart, nowMs, timeUnknown: false });
  assert.strictEqual(ok.problems.length, 0, JSON.stringify(ok.problems));
  assert.strictEqual(ok.checked, 4);
  assert.strictEqual(ok.visible, 'Fine.');

  const wrongSign = C.evaluate({ text: 'x\nCHECK: Jupiter in ' + SN[(by.Ju.sign + 1) % 12], chart, nowMs });
  assert.deepStrictEqual(wrongSign.problems.map((p) => p.kind), ['sign']);
  const wrongHouse = C.evaluate({ text: 'x\nCHECK: Moon in house ' + ((by.Mo.house % 12) + 1), chart, nowMs });
  assert.deepStrictEqual(wrongHouse.problems.map((p) => p.kind), ['house']);
  const badHouse = C.evaluate({ text: 'x\nCHECK: Moon in house 13', chart, nowMs });
  assert.deepStrictEqual(badHouse.problems.map((p) => p.kind), ['house']);
  const wrongLagna = C.evaluate({ text: 'x\nCHECK: Lagna ' + SN[(chart.asc.sign + 3) % 12], chart, nowMs });
  assert.deepStrictEqual(wrongLagna.problems.map((p) => p.kind), ['lagna']);
  const other = ['Su', 'Mo', 'Ma', 'Me', 'Ju', 'Ve', 'Sa', 'Ra', 'Ke'].find((p) => p !== cur.maha.lord);
  const wrongDasha = C.evaluate({ text: 'x\nCHECK: Dasha ' + EN[other], chart, nowMs });
  assert.deepStrictEqual(wrongDasha.problems.map((p) => p.kind), ['dasha']);
  const mahaOnly = C.evaluate({ text: 'x\nCHECK: Dasha ' + EN[cur.maha.lord] + '/', chart, nowMs });
  assert.strictEqual(mahaOnly.problems.length, 0, 'maha only is accepted');

  // birth time unknown: house and dasha claims are not allowed, sign claims are fine
  const tu1 = C.evaluate({ text: 'x\nCHECK: Moon in house ' + by.Mo.house, chart, nowMs, timeUnknown: true });
  assert(tu1.problems.some((p) => p.kind === 'time'));
  const tu2 = C.evaluate({ text: 'x\nCHECK: Jupiter in ' + SN[by.Ju.sign], chart, nowMs, timeUnknown: true });
  assert.strictEqual(tu2.problems.length, 0);

  // no CHECK line at all
  const none = C.evaluate({ text: 'Plain answer', chart, nowMs });
  assert.strictEqual(none.hasCheck, false); assert.strictEqual(none.checked, 0); assert.strictEqual(none.problems.length, 0);
}

// ---- 3. dates ---------------------------------------------------------------------
{
  const facts = 'Mahadasha Saturn from 15/03/2024 to 15/03/2043. Best days: 24/11/2026, 02/12/2026. Born 15/05/1990. Jupiter enters Cancer around 2026-06-02. Window Jan 2027.';
  const d = C.datesIn('On 24 Nov 2026 and 2/12/2026, in March 2027, and 2031-05-06. Also 1999.');
  assert(d.full.has('2026-11-24') && d.full.has('2026-12-02') && d.full.has('2031-05-06'));
  assert(d.months.has('2027-03'));
  assert(d.years.has(1999));
  const known = (txt) => C.checkDates(txt, facts).map((p) => p.text);
  assert.deepStrictEqual(known('The best day is 24/11/2026.'), []);
  assert.deepStrictEqual(known('Try 25/11/2026 instead.'), ['2026-11-25']);
  assert.deepStrictEqual(known('Around 2 December 2026 looks good.'), []);
  assert.deepStrictEqual(known('Roughly June 2026 or July 2026.'), []);        // within one month of a known date
  assert.deepStrictEqual(known('Look at September 2030.'), ['2030-09']);
  assert.deepStrictEqual(known('Saturn runs until 2043.'), []);
  assert.deepStrictEqual(known('Your fortune will rise in 2150.'), ['2150']);
  assert.deepStrictEqual(known('In your twenty-year-old self, 2000 was fine.'), []);
  // ISO with the same date as DD/MM/YYYY is the same date
  assert.deepStrictEqual(C.checkDates('See 2026-12-02.', facts), []);
  // dotted and dashed day-first dates
  assert.deepStrictEqual(C.checkDates('See 02.12.2026 and 02-12-2026.', facts), []);
}

// ---- 4. messages in every language --------------------------------------------------
for (const L of ['en', 'hi', 'bn', 'hn']) {
  const ps = [
    { kind: 'sign', planet: 'Ju', said: 0, actual: 3 }, { kind: 'house', planet: 'Mo', said: 5, actual: 4 }, { kind: 'lagna', said: 1, actual: 4 },
    { kind: 'dasha', said: ['Sa', 'Me'], actual: ['Sa', 'Ve'] }, { kind: 'time' }, { kind: 'date', text: '2030-09-01' },
  ];
  for (const p of ps) {
    const s = C.describe(L, p);
    assert(typeof s === 'string' && s.length > 3 && !/undefined|\{|\}/.test(s), L + ' ' + p.kind + ': ' + s);
  }
  for (const k of ['ckOk', 'ckFixed', 'ckNone']) assert(I.ui(L, k).length > 10, L + k);
  assert(I.ui(L, 'ckWarn', { list: 'XYZ' }).includes('XYZ'));
}
const msg = C.correctionMessage([{ kind: 'sign', planet: 'Ju', said: 0, actual: 3 }]);
assert(/CHART_FACTS/.test(msg) && /CHECK/.test(msg) && /Jupiter/.test(msg));

// ---- 5. many real charts: a truthful CHECK line never produces a problem ----------------
{
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let n = 0;
  for (let i = 0; i < 120; i++) {
    const ms = Date.UTC(1940 + Math.floor(rnd() * 80), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28), Math.floor(rnd() * 24), Math.floor(rnd() * 60));
    const ch = E.computeChart({ utcMs: ms, lat: -50 + rnd() * 100, lon: -180 + rnd() * 360, tzOffsetSec: 0 });
    const now = Date.UTC(2026, 10, 22, 6, 0), cp = E.periodAt(ch.dasha, now);
    const pl = ch.planets[Math.floor(rnd() * 9)];
    const line = 'CHECK: ' + EN[pl.id] + ' in ' + SN[pl.sign] + '; ' + EN[pl.id] + ' in house ' + pl.house + '; Lagna ' + SN[ch.asc.sign] + '; Dasha ' + EN[cp.maha.lord] + '/' + EN[cp.antar.lord];
    const r = C.evaluate({ text: 'ok\n' + line, chart: ch, nowMs: now });
    assert.strictEqual(r.problems.length, 0, JSON.stringify([r.problems, line]));
    assert.strictEqual(r.checked, 4); n++;
  }
  console.log('checker: parsing, chart comparison, date guard and 4-language messages pass (' + n + ' random charts)');
}
