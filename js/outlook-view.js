/*  Outlook view: turns an outlook result (outlook.js) into sentences in the chosen language,
    for the Home tab, the Quick Answers, the PDF report and the English fact sheet that the AI receives.
    Every sentence comes from a result and a reason code. Nothing here guesses. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine.js'), require('./i18n.js'), require('./reading.js'), require('./outlook.js'), require('./ashtaka.js'), require('./rules.js'));
  } else root.RsvOutlookView = factory(root.RsvEngine, root.RsvI18n, root.RsvReading, root.RsvOutlook, root.RsvAshtaka, root.RsvRules);
})(typeof self !== 'undefined' ? self : this, function (E, I, RD, O, AV, R) {
  'use strict';

  const n = I.name, ui = (L, k, p) => I.ui(L, k, p);
  const PERIOD_KEY = { day: 'oDay', week: 'oWeek', month: 'oMonth', year: 'oYear' };
  const THEME_KEY = { career: 'oThCareer', wealth: 'oThWealth', love: 'oThLove', marriage: 'oThMarriage', family: 'oThFamily', health: 'oThHealth', education: 'oThEducation', foreign: 'oThForeign', spirituality: 'oThSpirituality', overall: 'oThOverall' };
  const SENT_KEY = { strong: 'oSentStrong', good: 'oSentGood', mixed: 'oSentMixed', challenging: 'oSentChallenging' };
  const SAV_IDX = { weak: 0, mid: 1, strong: 2, top: 3 };

  const areaTitle = (L, key) => (key === 'overall' ? ui(L, 'oOverall') : n.area(L, key)[0]);
  const periodTitle = (L, period) => ui(L, PERIOD_KEY[period]);
  const sentence = (L, key, label) => ui(L, SENT_KEY[label], { theme: ui(L, THEME_KEY[key]) });

  function rangeText(L, o, zone) {
    const a = RD.fmtDate(o.start, zone), b = RD.fmtDate(o.end - 1000, zone);
    return a === b ? a : ui(L, 'oRange', { from: a, to: b });
  }
  const hhmm = (L, ms, zone) => RD.fmtTime(ms, zone);
  const span = (L, r, zone) => (r ? hhmm(L, r.from, zone) + ' - ' + hhmm(L, r.to, zone) : '-');

  function quality(L, q) { return ui(L, q >= 0.2 ? 'oQGood' : q <= -0.2 ? 'oQBad' : 'oQMid'); }

  const ORDER = ['Su', 'Mo', 'Ma', 'Me', 'Ju', 'Ve', 'Sa', 'Ra', 'Ke'];
  const at = (L, key, i) => ui(L, key)[i];
  function dashaLines(L, a) {
    const out = [];
    for (const d of a.dasha || []) {
      out.push(ui(L, 'oDashaLine', {
        level: n.level(L, d.level), planet: n.planet(L, d.planet),
        link: d.linked === null ? '' : ui(L, d.linked ? 'oDashaLinked' : 'oDashaGeneral'), quality: quality(L, d.q),
      }).replace(/\s+/g, ' ').trim());
      // what a linked period brings, so the reason says what can happen and not only that it is "linked"
      if (d.linked) out.push(ui(L, 'xDashaThemeLine', { planet: n.planet(L, d.planet), theme: at(L, 'xDashaTheme', ORDER.indexOf(d.planet)) }));
    }
    return out;
  }
  // Transits that moved this area's score most: where the planet is, what it stands for, why it counts here, what it can bring
  function transitLines(L, a, key) {
    const theme = key === 'overall' ? '' : ui(L, THEME_KEY[key]);
    return a.tr.map((x) => {
      const idx = ORDER.indexOf(x.planet);
      return ui(L, 'xTr', {
        planet: n.planet(L, x.planet), sig: n.planetSig(L, x.planet), h: x.hMoon, fav: ui(L, x.fav ? 'oFavYes' : 'oFavNo'),
        bav: x.bav === null ? '' : ui(L, 'xTrBav', { bav: x.bav }),
        role: key === 'overall' ? '' : ui(L, 'xRole_' + x.role, { area: theme }),
        effect: x.good > 0 ? ui(L, 'xEffGood', { text: at(L, 'xPGood', idx) }) : x.good < 0 ? ui(L, 'xEffBad', { text: at(L, 'xPBad', idx) }) : '',
      }).replace(/\s+/g, ' ').trim();
    });
  }
  // The ruler of the weekday and the lord of the Moon's star, for the day outlook
  function dayLordLines(L, a, out) {
    if (out.period !== 'day' || !out.day || !(a.dl || []).length) return [];
    return a.dl.map((d) => {
      const p = {
        planet: n.planet(L, d.planet), weekday: n.weekday(L, out.day.weekday), nak: n.nak(L, out.day.panchang.moonNak),
        state: ui(L, d.q >= 0.2 ? 'xStateGood' : d.q <= -0.2 ? 'xStateBad' : 'xStateMid'), link: ui(L, d.linked ? 'xLinkYes' : 'xLinkNo'),
      };
      return ui(L, d.kind === 'vara' ? 'xDayLordVara' : 'xDayLordNak', p).replace(/\s+/g, ' ').trim();
    });
  }
  function taraLine(L, tara) {
    if (!tara) return null;
    const names = ui(L, 'oTaraNames');
    return ui(L, 'oTaraLine', { names: tara.seq.map((x) => names[x - 1]).join(' → '), quality: ui(L, tara.q > 0.2 ? 'oTaraGood' : tara.q < -0.2 ? 'oTaraBad' : 'oTaraMix') });
  }
  function flagLines(L, flags) {
    const out = [];
    for (const f of flags || []) {
      const part = f.share < 0.999 ? ui(L, 'oPartOf') : '';
      if (f.c === 'sade') out.push(n.sadeSati(L, f.phase) + part);
      else if (f.c === 'ashtama') out.push(ui(L, 'rAshtama') + part);
      else if (f.c === 'kantaka') out.push(ui(L, 'oArdha') + part);
      else if (f.c === 'chandrashtama') out.push(ui(L, 'xChandraFlag') + part);
    }
    return out;
  }

  // Dates of the best / cautious slots
  function slotLabel(L, slot, slotPeriod, zone) {
    if (slotPeriod === 'day') return n.weekday(L, O.localWeekday(slot.t, zone)) + ' ' + RD.fmtDate(slot.t, zone);
    return RD.fmtDate(slot.t, zone) + ' - ' + RD.fmtDate(slot.end - 1000, zone);
  }

  // The card for one area
  function areaCard(L, out, key, zone) {
    const a = out.areas[key], lines = [];
    if (key !== 'overall') {
      const def = R.AREAS[key];
      lines.push(ui(L, 'xNatalLine', { label: n.label(L, a.natalLabel), hs: def.houses.join(' & '), sigs: def.houses.map((h) => n.houseSig(L, h)).join('; '), karakas: def.karakas.map((k) => n.planet(L, k)).join(', ') }));
      if (!out.reduced && typeof a.sav === 'number') lines.push(ui(L, 'oSavLine', { sav: a.sav.toFixed(1), word: ui(L, 'oSavWords')[SAV_IDX[AV.savClass(a.sav)]] }));
    }
    lines.push(...dashaLines(L, a));
    lines.push(...transitLines(L, a, key));
    lines.push(...dayLordLines(L, a, out));
    lines.push(ui(L, out.period === 'day' ? 'xBgDay' : 'xBgLong'));
    if (key === 'overall') lines.push(...flagLines(L, out.flags));
    if (key === 'health') lines.push(ui(L, 'oHealthNote'));
    const mono = out.slotPeriod === 'month' ? 'Months' : 'Days';
    const tone = a.label === 'strong' || a.label === 'good' ? 0 : a.label === 'mixed' ? 1 : 2;
    return {
      key, title: areaTitle(L, key), label: n.label(L, a.label), labelKey: a.label, pct: a.pct,
      bar: Math.max(6, Math.round(a.pct)), sentence: sentence(L, key, a.label), lines,
      exampleHead: ui(L, 'xExHead'), example: at(L, 'xEx_' + key, tone),
      best: a.best.map((s) => slotLabel(L, s, out.slotPeriod, zone)), caution: a.caution.map((s) => slotLabel(L, s, out.slotPeriod, zone)),
      bestTitle: ui(L, 'oBest' + mono), cautionTitle: ui(L, 'oCaution' + mono),
    };
  }

  function eventLines(L, out, zone) {
    return out.events.map((e) => ui(L, 'oEvLine', {
      date: RD.fmtDate(e.atMs, zone), planet: n.planet(L, e.planet), sign: n.sign(L, e.to), h: e.hMoon,
      fav: ui(L, e.fav ? 'oFavYes' : 'oFavNo'), bav: e.bav === null ? '' : ui(L, 'oEvBav', { bav: e.bav }),
    }));
  }

  function dayRows(L, out, zone) {
    const d = out.day; if (!d) return [];
    const pc = d.panchang;
    const rows = [
      [ui(L, 'pTithi'), RD.tithiName(L, pc.tithi, pc.paksha) + ' (' + pc.tithiInPaksha + ')'],
      [ui(L, 'pNak'), n.nak(L, pc.moonNak) + ' ' + pc.moonPada],
      [ui(L, 'pYoga'), n.yoga(L, pc.yoga)],
      [ui(L, 'pKarana'), n.karana(L, pc.karana)],
      [ui(L, 'pVara'), n.weekday(L, d.weekday) + ' (' + n.planet(L, d.weekdayLord) + ')'],
    ];
    if (d.sunrise !== null) rows.push([ui(L, 'oSunrise'), hhmm(L, d.sunrise, zone)]);
    if (d.sunset !== null) rows.push([ui(L, 'oSunset'), hhmm(L, d.sunset, zone)]);
    if (d.rahu) rows.push([ui(L, 'oRahu'), span(L, d.rahu, zone)], [ui(L, 'oYama'), span(L, d.yama, zone)], [ui(L, 'oGulika'), span(L, d.gulika, zone)]);
    return rows;
  }

  // Everything the Home tab and the PDF need for one period
  function periodModel(L, out, zone, placeText) {
    const keys = ['overall'].concat(O.AREA_KEYS);
    const cards = {}; keys.forEach((k) => { cards[k] = areaCard(L, out, k, zone); });
    return {
      period: out.period, title: periodTitle(L, out.period), range: rangeText(L, out, zone), reduced: out.reduced,
      overall: cards.overall, areas: O.AREA_KEYS.map((k) => cards[k]), cards,
      events: out.period === 'day' ? [] : eventLines(L, out, zone),
      dayRows: dayRows(L, out, zone),
      dayNote: out.period === 'day' ? ui(L, 'oDayNote', { place: placeText || '' }) : '',
    };
  }

  // ---- Ashtakavarga table (for the Chart tab and the PDF) --------------------
  function ashtakaTable(L, chart) {
    const r = AV.compute(chart);
    const head = [ui(L, 'thPlanet')].concat(Array.from({ length: 12 }, (_, i) => n.signShort(L, i)), [ui(L, 'avTotal') || '']);
    const rows = AV.SEVEN.map((pl) => [n.planetShort(L, pl)].concat(r.bav[pl].map(String), [String(r.totals[pl])]));
    rows.push([ui(L, 'avSav')].concat(r.sav.map(String), [String(r.total)]));
    return { head, rows, lagnaSign: chart.asc.sign, sav: r.sav, savByHouse: r.savByHouse };
  }

  // ---- English fact sheet lines for the AI ----------------------------------
  function factsLines(chart, outs, zone, reduced) {
    const L = 'en', lines = [];
    lines.push('PREDICTION OUTLOOKS (computed by this app with open rules from the natal chart, running dasha, transits from the Moon and Ashtakavarga; labels compare a period with typical periods, they are tendencies, not events):');
    if (reduced) lines.push('- Birth time unknown: these outlooks use only the Moon-sign transits and are rough.');
    for (const p of ['day', 'week', 'month', 'year']) {
      const o = outs[p]; if (!o) continue;
      const bits = ['overall'].concat(O.AREA_KEYS).map((k) => (k === 'overall' ? 'overall' : n.area(L, k)[0]) + ' ' + n.label(L, o.areas[k].label));
      lines.push('- ' + periodTitle(L, p) + ' (' + rangeText(L, o, zone) + '): ' + bits.join('; '));
      if (p !== 'day') {
        const ov = o.areas.overall;
        const f = (list) => list.map((s) => slotLabel(L, s, o.slotPeriod, zone)).join(', ');
        if (ov.best.length) lines.push('  best ' + (o.slotPeriod === 'month' ? 'months' : 'days') + ' overall: ' + f(ov.best) + '; extra care: ' + (f(ov.caution) || 'none'));
      }
    }
    if (outs.day && outs.day.day) {
      const d = outs.day;
      lines.push('- Today\'s panchang at sunrise: ' + dayRows(L, d, zone).map((r) => r[0] + ' ' + r[1]).join('; '));
      const tl = taraLine(L, d.tara); if (tl) lines.push('- ' + tl);
    }
    if (outs.year) {
      const ev = eventLines(L, outs.year, zone);
      if (ev.length) { lines.push('PLANET SIGN CHANGES IN THE NEXT 12 MONTHS (from the Moon, favourable = classical gochara houses):'); ev.slice(0, 12).forEach((x) => lines.push('- ' + x)); }
    }
    if (!reduced) {
      const r = AV.compute(chart);
      lines.push('ASHTAKAVARGA (Sarvashtakavarga points per house from the lagna; about 28 average, 29+ strong, under 25 weak): ' + r.savByHouse.map((v, i) => 'house ' + (i + 1) + '=' + v).join(', '));
    }
    return lines;
  }

  return { areaTitle, periodTitle, sentence, rangeText, areaCard, periodModel, eventLines, dayRows, ashtakaTable, factsLines, flagLines, taraLine, slotLabel, span };
});
