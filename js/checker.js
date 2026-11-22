/*  Reply checker. After the AI answers, this code checks the answer against the computed chart. It cannot judge
    wisdom, but it CAN catch the most damaging mistakes: a wrong planet sign or house, a wrong running dasha, and
    dates that the chart facts never contained.

    How: the AI is asked to end its answer with one machine-readable line, for example
        CHECK: Jupiter in Cancer; Moon in house 4; Lagna Leo; Dasha Saturn/Mercury
    That line is read here, compared with the chart, and removed before the person sees the answer.
    Dates written in the visible answer are compared with the dates present in the facts.
    If something is wrong the app asks the AI once to correct it; if it is still wrong the answer is shown with a warning. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./i18n.js'));
  else root.RsvChecker = factory(root.RsvEngine, root.RsvI18n);
})(typeof self !== 'undefined' ? self : this, function (E, I) {
  'use strict';

  const PLANET_NAMES = { sun: 'Su', moon: 'Mo', mars: 'Ma', mercury: 'Me', jupiter: 'Ju', venus: 'Ve', saturn: 'Sa', rahu: 'Ra', ketu: 'Ke' };
  const SIGN_NAMES = [['aries', 'mesha'], ['taurus', 'vrishabha', 'vrishab'], ['gemini', 'mithuna'], ['cancer', 'karka', 'kark'], ['leo', 'simha'], ['virgo', 'kanya'], ['libra', 'tula'],
    ['scorpio', 'vrishchika', 'vrischika', 'vrishchik'], ['sagittarius', 'dhanu'], ['capricorn', 'makara', 'makar'], ['aquarius', 'kumbha', 'kumbh'], ['pisces', 'meena', 'mina']];
  const SIGN_INDEX = {}; SIGN_NAMES.forEach((names, i) => names.forEach((nm) => { SIGN_INDEX[nm] = i; }));
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

  const P_RE = '(sun|moon|mars|mercury|jupiter|venus|saturn|rahu|ketu)';
  const SIGN_RE = '(' + Object.keys(SIGN_INDEX).sort((a, b) => b.length - a.length).join('|') + ')';
  const RE_PLANET_IN = new RegExp('\\b' + P_RE + '\\s+(?:is\\s+)?in\\s+(?:(?:the\\s+)?house\\s*(\\d{1,2})\\b|(?:the\\s+)?(?:sign\\s+(?:of\\s+)?)?' + SIGN_RE + '\\b)', 'gi');
  const RE_LAGNA = new RegExp('\\b(?:lagna|ascendant)\\s+(?:is\\s+|in\\s+)?(?:the\\s+)?' + SIGN_RE + '\\b', 'gi');
  const RE_DASHA = new RegExp('\\bdasha\\s+' + P_RE + '(?:\\s*(?:/|>|-|,)\\s*' + P_RE + '?)?', 'gi');
  const CHECK_LINE = /^[\s*_>#-]*CHECK\s*\**\s*:.*$/gm;   // upper-case CHECK only, so a normal sentence that starts with "Check:" is left alone

  // Split the answer into the visible text and the claims on its CHECK line(s)
  function parseCheck(text) {
    const raw = String(text || '');
    const lines = raw.match(CHECK_LINE) || [];
    const visible = raw.replace(CHECK_LINE, '').replace(/\n{3,}/g, '\n\n').trim();
    const claims = []; let hasCheck = lines.length > 0, none = false;
    for (const line of lines) {
      const body = line.replace(/^[\s*_>#-]*CHECK\s*\**\s*:/, '');
      if (/^\s*none\b/i.test(body)) { none = true; continue; }
      let m;
      RE_PLANET_IN.lastIndex = 0;
      while ((m = RE_PLANET_IN.exec(body))) {
        const planet = PLANET_NAMES[m[1].toLowerCase()];
        if (m[2]) claims.push({ kind: 'house', planet, house: Number(m[2]) });
        else claims.push({ kind: 'sign', planet, sign: SIGN_INDEX[m[3].toLowerCase()] });
      }
      RE_LAGNA.lastIndex = 0;
      while ((m = RE_LAGNA.exec(body))) claims.push({ kind: 'lagna', sign: SIGN_INDEX[m[1].toLowerCase()] });
      RE_DASHA.lastIndex = 0;
      while ((m = RE_DASHA.exec(body))) claims.push({ kind: 'dasha', maha: PLANET_NAMES[m[1].toLowerCase()], antar: m[2] ? PLANET_NAMES[m[2].toLowerCase()] : null });
    }
    return { visible, claims, hasCheck, none };
  }

  // ---- dates ----------------------------------------------------------------
  const pad = (n) => String(n).padStart(2, '0');
  function datesIn(text) {
    const out = { full: new Set(), months: new Set(), years: new Set() };
    const t = String(text || '');
    let m;
    const iso = /\b((?:19|20|21)\d\d)-(\d{2})-(\d{2})\b/g;
    while ((m = iso.exec(t))) { out.full.add(m[1] + '-' + m[2] + '-' + m[3]); out.months.add(m[1] + '-' + m[2]); out.years.add(Number(m[1])); }
    const dmy = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-]((?:19|20|21)\d\d)\b/g;
    while ((m = dmy.exec(t))) { out.full.add(m[3] + '-' + pad(m[2]) + '-' + pad(m[1])); out.months.add(m[3] + '-' + pad(m[2])); out.years.add(Number(m[3])); }
    const dMonY = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\.?,?\s+((?:19|20|21)\d\d)\b/gi;
    while ((m = dMonY.exec(t))) { const mo = MONTHS[m[2].toLowerCase()]; out.full.add(m[3] + '-' + pad(mo) + '-' + pad(m[1])); out.months.add(m[3] + '-' + pad(mo)); out.years.add(Number(m[3])); }
    const monDY = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+((?:19|20|21)\d\d)\b/gi;
    while ((m = monDY.exec(t))) { const mo = MONTHS[m[1].toLowerCase()]; out.full.add(m[3] + '-' + pad(mo) + '-' + pad(m[2])); out.months.add(m[3] + '-' + pad(mo)); out.years.add(Number(m[3])); }
    const monY = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\.?,?\s+((?:19|20|21)\d\d)\b/gi;
    while ((m = monY.exec(t))) { out.months.add(m[2] + '-' + pad(MONTHS[m[1].toLowerCase()])); out.years.add(Number(m[2])); }
    const yr = /(?<![\d/-])((?:19|20|21)\d\d)(?![\d/-])/g;
    while ((m = yr.exec(t))) out.years.add(Number(m[1]));
    return out;
  }
  const monthShift = (ym, d) => { const [y, m] = ym.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + d, 1)); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1); };

  function checkDates(visible, facts) {
    const reply = datesIn(visible), known = datesIn(facts), problems = [];
    const minY = Math.min(...known.years), maxY = Math.max(...known.years);
    for (const d of reply.full) if (!known.full.has(d)) problems.push({ kind: 'date', text: d });
    // month + year only: some date in the facts must fall in that month or next to it
    for (const ym of reply.months) {
      if ([...reply.full].some((d) => d.startsWith(ym))) continue;          // already judged as a full date
      if (![-1, 0, 1].some((s) => known.months.has(monthShift(ym, s)))) problems.push({ kind: 'date', text: ym });
    }
    // a bare year must lie inside the years the facts cover
    for (const y of reply.years) {
      if (Number.isFinite(minY) && (y > maxY || y < minY) && ![...reply.full, ...reply.months].some((d) => d.startsWith(String(y)))) problems.push({ kind: 'date', text: String(y) });
    }
    return problems;
  }

  // ---- compare with the chart -----------------------------------------------
  // o: { text, chart, nowMs, timeUnknown, facts }
  function evaluate(o) {
    const pc = parseCheck(o.text), problems = [];
    let checked = 0;
    const chart = o.chart, byId = Object.fromEntries(chart.planets.map((p) => [p.id, p]));
    let usedHouses = false;
    for (const c of pc.claims) {
      if (c.kind === 'sign') {
        checked++; if (byId[c.planet].sign !== c.sign) problems.push({ kind: 'sign', planet: c.planet, said: c.sign, actual: byId[c.planet].sign });
      } else if (c.kind === 'house') {
        checked++; usedHouses = true;
        if (!(c.house >= 1 && c.house <= 12) || byId[c.planet].house !== c.house) problems.push({ kind: 'house', planet: c.planet, said: c.house, actual: byId[c.planet].house });
      } else if (c.kind === 'lagna') {
        checked++; usedHouses = true; if (chart.asc.sign !== c.sign) problems.push({ kind: 'lagna', said: c.sign, actual: chart.asc.sign });
      } else if (c.kind === 'dasha') {
        checked++; usedHouses = true;
        const cur = E.periodAt(chart.dasha, o.nowMs);
        const ok = cur && cur.maha.lord === c.maha && (!c.antar || (cur.antar && cur.antar.lord === c.antar));
        if (!ok) problems.push({ kind: 'dasha', said: [c.maha, c.antar], actual: cur ? [cur.maha.lord, cur.antar && cur.antar.lord] : [null, null] });
      }
    }
    if (o.timeUnknown && usedHouses) problems.push({ kind: 'time' });
    if (o.facts) problems.push(...checkDates(pc.visible, o.facts));
    return { visible: pc.visible, hasCheck: pc.hasCheck, none: pc.none, claims: pc.claims, checked, problems };
  }

  // Human-readable problem lines in the interface language
  function describe(L, p) {
    const n = I.name;
    switch (p.kind) {
      case 'sign': return n.planet(L, p.planet) + ': ' + n.sign(L, p.actual) + ' (' + n.sign(L, p.said) + ' ✗)';
      case 'house': return n.planet(L, p.planet) + ': ' + I.ui(L, 'house') + ' ' + p.actual + ' (' + p.said + ' ✗)';
      case 'lagna': return n.planet(L, 'As') + ': ' + n.sign(L, p.actual) + ' (' + n.sign(L, p.said) + ' ✗)';
      case 'dasha': return I.ui(L, 'tabDasha') + ': ' + p.actual.filter(Boolean).map((x) => n.planet(L, x)).join('/') + ' (' + p.said.filter(Boolean).map((x) => n.planet(L, x)).join('/') + ' ✗)';
      case 'time': return I.ui(L, 'ckTime');
      case 'date': return I.ui(L, 'ckDate', { d: p.text });
      default: return '';
    }
  }
  // The same problems in English, for the correction message sent back to the AI
  function describeEn(p) { return describe('en', p); }

  function correctionMessage(problems) {
    return 'Your last answer contained claims that do not match CHART_FACTS: ' + problems.map(describeEn).join('; ') +
      '. Rewrite the whole answer using only CHART_FACTS. Do not mention any date that is not written in CHART_FACTS. Keep the same language and style, and end with the CHECK line again.';
  }

  return { parseCheck, evaluate, describe, correctionMessage, datesIn, checkDates };
});
