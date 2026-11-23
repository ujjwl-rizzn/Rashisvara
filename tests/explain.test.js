// Explanations: every text for every planet, period and event exists in all four languages, has no leftover {placeholders},
// differs between life areas, and the Ask tab answers chart questions without a key.
const assert = require('assert');
const E = require('../js/engine.js'); const I = require('../js/i18n.js');
require('../js/i18n-extra.js'); require('../js/i18n-outlook.js'); require('../js/i18n-explain.js');
const O = require('../js/outlook.js'), V = require('../js/outlook-view.js'), EX = require('../js/explain.js'), RT = require('../js/ask-router.js');
const LANGS = Object.keys(I.T);
const bad = (s) => /\{[A-Za-z]+\}|undefined|NaN|\[object/.test(String(s));
const chartAt = (y, m, d, hh, mm, lat, lon) => E.computeChart({ utcMs: Date.UTC(y, m - 1, d, hh, mm) - 19800000, lat, lon, tzOffsetSec: 19800 });
const C = [chartAt(1998, 10, 10, 12, 0, 23.2, 87.1), chartAt(1991, 3, 4, 6, 15, 28.6, 77.2), chartAt(2003, 12, 25, 22, 40, 19.07, 72.87)];
const NOW = Date.UTC(2026, 10, 22, 20, 0), ZONE = 'Asia/Kolkata';
let texts = 0;
const check = (s, what) => { texts++; assert(String(s).trim().length > 3, what + ' is empty'); assert(!bad(s), what + ' has a leftover placeholder: ' + s); };

for (const L of LANGS) for (const chart of C) for (const unk of [false, true]) {
  const r = EX.rashi(L, chart, unk); r.lines.forEach((x) => check(x, L + ' rashi'));
  EX.planetCards(L, chart, unk).forEach((pc) => { check(pc.head, L + ' planet head'); pc.lines.forEach((x) => check(x, L + ' ' + pc.id)); });
  if (unk) continue;
  const a = EX.ascendant(L, chart); a.lines.forEach((x) => check(x, L + ' lagna'));
  EX.housesGuide(L).forEach((x) => check(x.text, L + ' house'));
  const tl = EX.timeline(L, chart, NOW, ZONE);
  assert(tl.items.length >= 3 && tl.items.some((i) => i.status === 'now'), 'timeline has past, now and next');
  tl.items.forEach((it) => { check(it.range, L + ' range'); it.lines.forEach((x) => check(x, L + ' timeline')); }); tl.notes.forEach((x) => check(x, L + ' timeline note'));
  const ctx = O.makeCtx(chart, { zone: ZONE }), year = O.periodOutlook(ctx, 'year', NOW, 0), day = O.periodOutlook(ctx, 'day', NOW, 0);
  EX.nowSummary(L, chart, year, NOW).lines.forEach((x) => check(x, L + ' now'));
  EX.moonToday(L, day).lines.forEach((x) => check(x, L + ' moon today'));
  EX.moonToday(L, year).lines.forEach((x) => check(x, L + ' moon period'));
  for (const k of O.AREA_KEYS.concat('overall')) { const c = V.areaCard(L, day, k, ZONE); check(c.example, L + ' example ' + k); c.lines.forEach((x) => check(x, L + ' reason ' + k)); }
}

// Moon sign is the base of the Rashi lines: it must name the Moon's own sign and star
for (const chart of C) {
  const mo = chart.planets.find((p) => p.id === 'Mo');
  const r = EX.rashi('en', chart, false);
  assert(r.lines[0].includes(I.name.sign('en', mo.sign)) && r.lines[0].includes(I.name.nak('en', mo.nak)), 'Rashi line names the Moon sign and star');
}

// The nine areas must not all say the same thing or give the same reasons
for (const chart of C) {
  const ctx = O.makeCtx(chart, { zone: ZONE });
  for (const p of ['day', 'week', 'month', 'year']) {
    const out = O.periodOutlook(ctx, p, NOW, 0);
    const cards = O.AREA_KEYS.map((k) => V.areaCard('en', out, k, ZONE));
    assert(new Set(cards.map((c) => c.lines.join('|'))).size === cards.length, p + ': every area has its own reasons');
    assert(new Set(cards.map((c) => c.example)).size === cards.length, p + ': every area has its own example');
    assert(new Set(cards.map((c) => c.sentence)).size >= 3, p + ': area sentences differ');
  }
}
// Across many charts the nine areas must not all land on the same label most of the time
let allSame = 0, total = 0;
for (let i = 0; i < 60; i++) {
  const ch = chartAt(1960 + (i * 7) % 50, 1 + (i * 5) % 12, 1 + (i * 11) % 28, (i * 3) % 24, (i * 17) % 60, 8 + (i * 13) % 20, 70 + (i * 7) % 20);
  const out = O.periodOutlook(O.makeCtx(ch, { zone: ZONE }), 'day', NOW + i * 86400000, 0);
  total++; if (new Set(O.AREA_KEYS.map((k) => out.areas[k].label)).size === 1) allSame++;
}
assert(allSame / total <= 0.15, 'nine areas had one label for ' + allSame + ' of ' + total + ' charts');

// Chandrashtama (Moon in the 8th from the birth Moon) is flagged in the month outlook
const moonH = (chart, ms) => ((Math.floor(E.lonsAt(ms).Mo / 30) - chart.planets.find((p) => p.id === 'Mo').sign + 12) % 12) + 1;
{
  const ctx = O.makeCtx(C[0], { zone: ZONE }), month = O.periodOutlook(ctx, 'month', NOW, 0);
  assert(month.flags.some((f) => f.c === 'chandrashtama') && moonH(C[0], NOW) >= 1, 'month outlook counts Chandrashtama days');
}

// Life events: before birth and future months are refused, a normal one links to the period and to Saturn and Jupiter
{
  const ch = C[0];
  assert.strictEqual(EX.eventLink('en', ch, { ym: '1990-01', area: 'career', text: '' }, false, NOW).error, 'xEvBeforeBirth');
  assert.strictEqual(EX.eventLink('en', ch, { ym: '2030-01', area: 'career', text: '' }, false, NOW).error, 'xEvFuture');
  assert.strictEqual(EX.eventLink('en', ch, { ym: '2019-06', area: 'nonsense', text: '' }, false, NOW).error, 'xEvBad');
  for (const L of LANGS) for (const area of O.AREA_KEYS) {
    const r = EX.eventLink(L, ch, { ym: '2019-06', area, text: 'x' }, false, NOW);
    assert(!r.error && r.total === 4 && r.hits >= 0 && r.hits <= 4 && [0, 1, 2].includes(r.level)); r.lines.forEach((x) => check(x, L + ' event ' + area));
    const q = EX.eventLink(L, ch, { ym: '2019-06', area, text: '' }, true, NOW); assert(!q.error && q.total === 2); q.lines.forEach((x) => check(x, L + ' event (time unknown)'));
  }
}

// The Ask tab: chart questions get an answer with no key and no AI, in every language
const ASKS = { en: ['What is my Moon sign and what does it mean?', 'What does Saturn mean in my chart?', 'Explain my 7th house', 'Am I in Sade Sati?', 'What is my dasha now?', 'am I manglik?', 'what is rahu kaal today'],
  hi: ['मेरी चंद्र राशि क्या है?', 'मेरी कुंडली में शनि का क्या मतलब है?', 'मेरा सातवाँ भाव क्या है?', 'क्या मुझे साढ़ेसाती है?'], bn: ['আমার চন্দ্র রাশি কী?', 'আমার কুণ্ডলীতে শনির মানে কী?', 'আমার জন্য সপ্তম ভাবের মানে কী?'],
  hn: ['Meri Chandra rashi kya hai?', 'Meri kundali mein Shani ka matlab kya hai?', 'Mera 7th house kya hai?'] };
for (const L of LANGS) {
  for (const q of ASKS[L].concat(I.ui(L, 'aChips'))) {
    const a = RT.answer(L, C[0], { text: q, nowMs: NOW, zone: ZONE, timeUnknown: false, ctx: O.makeCtx(C[0], { zone: ZONE }) });
    assert(a.kind !== 'nomatch', L + ' not answered without a key: ' + q); check(a.text, L + ' answer to ' + q);
  }
  const none = RT.answer(L, C[0], { text: 'tell me a joke', nowMs: NOW, zone: ZONE, timeUnknown: false, ctx: O.makeCtx(C[0], { zone: ZONE }) });
  assert.strictEqual(none.kind, 'nomatch'); assert(!/key/i.test(none.text) || L !== 'en', 'no-match text must not ask for a key');
  // without a birth time the house answers say so instead of guessing
  const unk = RT.answer(L, C[0], { text: ASKS[L][2] || ASKS.en[2], nowMs: NOW, zone: ZONE, timeUnknown: true, ctx: O.makeCtx(C[0], { zone: ZONE, timeUnknown: true }) });
  check(unk.text, L + ' unknown-time answer');
}
console.log('explain: ' + texts + ' texts in 4 languages are complete; areas differ; events, Chandrashtama and key-free Ask pass');
