/*  Explain: turns the computed chart into plain-language explanations (what a thing is, who or what it stands for,
    why it matters, what it can look like in life) and connects the person's own life events with their dasha and
    with the positions of Saturn and Jupiter at that time.

    Nothing is made up here. Every sentence is built from a chart fact and a written template in i18n-explain.js.
    The meanings are traditional and are offered for reflection. They are not facts about anyone's life. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine.js'), require('./rules.js'), require('./i18n.js'), require('./reading.js'), require('./outlook.js'), require('./outlook-view.js'));
  } else root.RsvExplain = factory(root.RsvEngine, root.RsvRules, root.RsvI18n, root.RsvReading, root.RsvOutlook, root.RsvOutlookView);
})(typeof self !== 'undefined' ? self : this, function (E, R, I, RD, O, V) {
  'use strict';

  const n = I.name, ui = (L, k, p) => I.ui(L, k, p);
  const YEAR_MS = 365.25 * 86400000;
  const ORDER = ['Su', 'Mo', 'Ma', 'Me', 'Ju', 'Ve', 'Sa', 'Ra', 'Ke'];
  const DIG_IDX = { exalted: 0, moolatrikona: 1, own: 2, friend: 3, neutral: 4, enemy: 5, debilitated: 6 };
  const at = (L, key, i) => ui(L, key)[i];
  const THEME_KEY = { career: 'oThCareer', wealth: 'oThWealth', love: 'oThLove', marriage: 'oThMarriage', family: 'oThFamily', health: 'oThHealth', education: 'oThEducation', foreign: 'oThForeign', spirituality: 'oThSpirituality' };
  const planetOf = (chart, id) => chart.planets.find((p) => p.id === id);
  const sigs = (L, hs) => hs.map((h) => n.houseSig(L, h)).join('; ');
  const ageOf = (chart, ms) => Math.max(0, Math.round((ms - chart.input.utcMs) / YEAR_MS));

  // ---- Moon sign and birth star -------------------------------------------------
  function rashi(L, chart, timeUnknown) {
    const mo = planetOf(chart, 'Mo'), sign = n.sign(L, mo.sign), nak = n.nak(L, mo.nak);
    const lord = n.planet(L, E.DASHA_ORDER[mo.nak % 9]);
    const lines = [
      ui(L, 'xRashiLine', { sign, nak, pada: mo.pada }),
      ui(L, 'xRashiTraitLine', { sign, trait: at(L, 'xRashiTrait', mo.sign) }),
      ui(L, 'xNakLine', { nak, planet: lord }),
    ];
    if (timeUnknown) lines.push(ui(L, 'xRashiNoTime'));
    return { title: ui(L, 'xRashiTitle'), sign, nak, pada: mo.pada, lines };
  }

  // ---- The Moon today, counted from the natal Moon -------------------------------
  function moonToday(L, out) {
    const lines = [];
    if (out.period === 'day') {
      lines.push(ui(L, 'xMoonToday', { sign: n.sign(L, out.moon.sign), h: out.moon.h, result: at(L, 'xChandra', out.moon.h - 1) }));
      if (out.tara) {
        const names = ui(L, 'oTaraNames');
        lines.push(ui(L, 'xTaraToday', { name: out.tara.seq.map((x) => names[x - 1]).join(' → ') }) + '. ' + out.tara.seq.map((x) => at(L, 'xTaraMeaning', x - 1)).join(' '));
      }
    } else lines.push(ui(L, 'xMoonPeriod'));
    const ch = (out.flags || []).find((f) => f.c === 'chandrashtama');
    if (ch) lines.push(ui(L, 'xChandraFlag') + (out.period === 'day' ? '' : ui(L, 'xChandraDays', { days: ch.days })));
    return { title: ui(L, 'xMoonTodayTitle'), lines, good: out.moon.fav };
  }

  // ---- A planet in the chart -------------------------------------------------------
  function lordHouses(chart, id) { return ORDER.indexOf(id) < 7 ? R.lordsOf(chart, id) : []; }

  // timeUnknown: the sign, star and strength are still right, but houses (and so house lordship) are not, so those lines are left out.
  function placement(L, chart, id, timeUnknown) {
    const p = planetOf(chart, id), i = ORDER.indexOf(id);
    const planet = n.planet(L, id), hs = n.houseSig(L, p.house), sig = n.planetSig(L, id);
    const lines = [
      ui(L, 'xPlaceWhat', { planet, sig }),
      ui(L, 'xPlaceWho', { who: at(L, 'xWho', i) }),
    ];
    if (!timeUnknown) {
      lines.push(ui(L, 'xPlaceWhere', { planet, h: p.house, hsig: hs }));
      const lh = lordHouses(chart, id);
      if (lh.length) lines.push(ui(L, 'xPlaceRules', { planet, hs: lh.join(' & '), sigs: sigs(L, lh) }));
      else lines.push(ui(L, 'xDashaWhyNode', { planet, h: p.house, hSig: hs, lord: n.planet(L, E.SIGN_LORD[p.sign]) }));
    }
    if (p.dignity && DIG_IDX[p.dignity] !== undefined) lines.push(at(L, 'xDig', DIG_IDX[p.dignity]));
    if (p.retro && id !== 'Ra' && id !== 'Ke') lines.push(ui(L, 'xRetro'));
    if (p.combust) lines.push(ui(L, 'xComb'));
    lines.push(ui(L, 'xPlaceNak', { nak: n.nak(L, p.nak), pada: p.pada, lord: n.planet(L, E.DASHA_ORDER[p.nak % 9]) }));
    lines.push(ui(L, 'xPlaceLife', { good: at(L, 'xPGood', i), bad: at(L, 'xPBad', i) }));
    const head = timeUnknown ? planet + ' · ' + n.sign(L, p.sign) : ui(L, 'xPlaceHead', { planet, sign: n.sign(L, p.sign), h: p.house });
    return { id, head, house: p.house, lines };
  }
  const planetCards = (L, chart, timeUnknown) => ORDER.map((id) => placement(L, chart, id, timeUnknown));

  function ascendant(L, chart) {
    const lordId = E.SIGN_LORD[chart.asc.sign], lp = planetOf(chart, lordId);
    return {
      head: n.planet(L, 'As') + ': ' + n.sign(L, chart.asc.sign),
      lines: [ui(L, 'xAscMain', { sign: n.sign(L, chart.asc.sign), planet: n.planet(L, lordId), h: lp.house, hSig: n.houseSig(L, lp.house) })],
    };
  }
  function housesGuide(L) { return Array.from({ length: 12 }, (_, i) => ({ h: i + 1, text: n.houseSig(L, i + 1) })); }

  // ---- Dasha ---------------------------------------------------------------------------
  function dashaWhy(L, chart, id) {
    const p = planetOf(chart, id), planet = n.planet(L, id), hSig = n.houseSig(L, p.house);
    const lh = lordHouses(chart, id);
    if (!lh.length) return ui(L, 'xDashaWhyNode', { planet, h: p.house, hSig, lord: n.planet(L, E.SIGN_LORD[p.sign]) });
    return ui(L, 'xDashaWhy', { planet, lords: lh.join(' & '), lordSig: sigs(L, lh), h: p.house, hSig });
  }
  const dashaTheme = (L, id) => ui(L, 'xDashaThemeLine', { planet: n.planet(L, id), theme: at(L, 'xDashaTheme', ORDER.indexOf(id)) });

  // Past, running and coming main periods with what each tends to highlight
  function timeline(L, chart, nowMs, zone) {
    const items = [];
    const list = chart.dasha.list;
    const now = list.findIndex((m) => nowMs >= m.start && nowMs < m.end);
    const from = Math.max(0, (now < 0 ? list.length : now) - 6), to = now < 0 ? list.length : Math.min(list.length, now + 2);
    for (let i = from; i < to; i++) {
      const m = list[i], status = i < now ? 'past' : i === now ? 'now' : 'next';
      const lh = lordHouses(chart, m.lord), p = planetOf(chart, m.lord);
      const topic = lh.length ? sigs(L, lh) : n.houseSig(L, p.house);
      items.push({
        status, statusText: ui(L, status === 'past' ? 'xDashaPast' : status === 'now' ? 'xDashaNow' : 'xDashaNext'),
        planet: n.planet(L, m.lord), id: m.lord,
        range: ui(L, 'xDashaRange', { from: RD.fmtDate(Math.max(m.start, chart.input.utcMs), zone), to: RD.fmtDate(m.end - 1000, zone), a: ageOf(chart, m.start), b: ageOf(chart, m.end) }),
        lines: [dashaTheme(L, m.lord), dashaWhy(L, chart, m.lord)].concat(status === 'past' ? [ui(L, 'xDashaReflect', { sig: topic })] : []),
      });
    }
    const cur = E.periodAt(chart.dasha, nowMs);
    const notes = [];
    if (cur && cur.antar) {
      notes.push(ui(L, 'xDashaNowNote', { maha: n.planet(L, cur.maha.lord), antar: n.planet(L, cur.antar.lord), to: RD.fmtDate(cur.antar.end - 1000, zone) }));
      notes.push(dashaTheme(L, cur.antar.lord));
      const next = RD.upcomingPeriods(chart, nowMs, 2)[1];
      if (next) {
        notes.push(ui(L, 'xDashaNextNote', { maha: n.planet(L, next.maha), antar: n.planet(L, next.antar), from: RD.fmtDate(next.start, zone), theme: at(L, 'xDashaTheme', ORDER.indexOf(next.antar)) }));
      }
    }
    return { items, notes, ageNote: ui(L, 'xAgeNote') };
  }

  // ---- Why now -----------------------------------------------------------------------------
  function nowSummary(L, chart, yearOut, nowMs) {
    const tr = E.transits(chart, nowMs);
    const fav = (id, h) => ui(L, 'xFavWord')[O.GOCHARA_FAV[id].includes(h) ? 0 : 1];
    const lines = [ui(L, 'xNowSky', { jup: tr.jupiterFromMoon, sat: tr.saturnFromMoon, jupFav: fav('Ju', tr.jupiterFromMoon), satFav: fav('Sa', tr.saturnFromMoon) })];
    if (tr.sadeSati) lines.push(n.sadeSati(L, tr.sadeSati));
    if (tr.ashtamaShani) lines.push(ui(L, 'rAshtama'));
    if (tr.saturnFromMoon === 4) lines.push(ui(L, 'oArdha'));
    if (yearOut) {
      const ranked = O.AREA_KEYS.map((k, i) => ({ k, i, S: yearOut.areas[k].S })).sort((a, b) => b.S - a.S);
      const name = (x) => at(L, 'xAreaNames', x.i);
      lines.push(ui(L, 'xNowAreas', { best: ranked.slice(0, 2).map(name).join(', '), worst: ranked.slice(-2).reverse().map(name).join(', ') }));
    }
    lines.push(ui(L, 'xNowHow'));
    return { lines };
  }

  // ---- The person's own events ------------------------------------------------------------
  // ev = { ym: 'YYYY-MM', area: one of the nine area keys, text }. Returns { error } or { lines, level, hits, total }.
  function eventLink(L, chart, ev, reduced, nowMs) {
    const [y, m] = String(ev.ym).split('-').map(Number);
    const t = Date.UTC(y, m - 1, 15, 12);
    if (t < chart.input.utcMs - 20 * 86400000) return { error: 'xEvBeforeBirth' };
    if (Date.UTC(y, m - 1, 1) > (nowMs || Date.now())) return { error: 'xEvFuture' };
    const def = R.AREAS[ev.area]; if (!def) return { error: 'xEvBad' };
    const area = ui(L, THEME_KEY[ev.area]);
    const lines = []; let hits = 0, total = 2;
    if (ev.text) lines.push(ui(L, 'xEvYourNote', { text: ev.text }));
    if (!reduced) {
      total = 4;
      const cur = E.periodAt(chart.dasha, t);
      if (cur && cur.antar) {
        const rel = R.relatedPlanets(chart, def);
        const mt = rel.has(cur.maha.lord), at2 = rel.has(cur.antar.lord);
        hits += (mt ? 1 : 0) + (at2 ? 1 : 0);
        const tie = [[cur.maha.lord, mt], [cur.antar.lord, at2]].map(([id, yes]) => ui(L, yes ? 'xEvTieYes' : 'xEvTieNo', { planet: n.planet(L, id), area })).join(' ');
        lines.push(ui(L, 'xEvPeriod', { maha: n.planet(L, cur.maha.lord), antar: n.planet(L, cur.antar.lord), tie }));
        lines.push(dashaTheme(L, cur.antar.lord));
      }
    }
    const moonSign = planetOf(chart, 'Mo').sign, lons = E.lonsAt(t);
    const hFrom = (id) => ((Math.floor(lons[id] / 30) - moonSign + 12) % 12) + 1;
    const hj = hFrom('Ju'), hs = hFrom('Sa');
    const favWord = (id, h) => ui(L, O.GOCHARA_FAV[id].includes(h) ? 'oFavYes' : 'oFavNo');
    const inArea = (h) => (def.houses.includes(h) ? ui(L, 'xEvInArea', { area }) : '');
    const sade = [12, 1, 2].includes(hs);
    if (O.GOCHARA_FAV.Ju.includes(hj) || def.houses.includes(hj)) hits++;
    if (def.houses.includes(hs) || sade || hs === 8) hits++;
    lines.push(ui(L, 'xEvJup', { h: hj, fav: favWord('Ju', hj), inArea: inArea(hj) }));
    lines.push(ui(L, 'xEvSat', { h: hs, fav: favWord('Sa', hs), inArea: inArea(hs), sade: sade ? ui(L, 'xEvSade') : '' }));
    lines.push(ui(L, 'xEvMarkers', { n: hits, of: total }));
    const level = hits >= 3 ? 0 : hits >= 1 ? 1 : 2;
    lines.push(ui(L, 'xEvLink')[level].replace('{area}', area));
    return { lines, level, hits, total };
  }

  // ---- Answers for the Ask tab (no key, no AI) -------------------------------------------------
  // topic = { kind: 'moon' | 'lagna' | 'dasha' | 'planet' | 'house' | 'sade' | 'yoga' | 'panchang', id?, h? }
  const bullets = (list) => list.map((x) => '- ' + x).join('\n');
  function topicAnswer(L, chart, o, topic) {
    const zone = o.zone || 'UTC', now = o.nowMs, unk = !!o.timeUnknown, parts = [];
    const needTime = () => parts.push(ui(L, 'xNeedTime'));
    switch (topic.kind) {
      case 'moon': { const r = rashi(L, chart, unk); parts.push('**' + r.title + '**', bullets(r.lines)); break; }
      case 'lagna': {
        if (unk) { needTime(); break; }
        const a = ascendant(L, chart); parts.push('**' + a.head + '**', bullets(a.lines)); break;
      }
      case 'dasha': {
        if (unk) { needTime(); break; }
        const tl = timeline(L, chart, now, zone), cur = E.periodAt(chart.dasha, now);
        parts.push('**' + ui(L, 'dTitle') + '**', bullets(tl.notes));
        if (cur) parts.push('**' + n.planet(L, cur.maha.lord) + ' / ' + n.planet(L, cur.antar.lord) + '**', bullets([dashaWhy(L, chart, cur.maha.lord), dashaWhy(L, chart, cur.antar.lord)]));
        parts.push('**' + ui(L, 'xLearnTitle') + '**\n' + ui(L, 'xDashaWhat')); break;
      }
      case 'planet': {
        const pl = placement(L, chart, topic.id, unk);   // without a birth time only the sign-level facts are given
        parts.push('**' + pl.head + '**', bullets(pl.lines)); if (unk) needTime(); break;
      }
      case 'house': {
        if (unk) { needTime(); break; }
        const hh = chart.houses[topic.h - 1], lp = planetOf(chart, hh.lord);
        const here = hh.planets.map((id) => n.planet(L, id)).join(', ') || ui(L, 'xHouseNone');
        parts.push('**' + ui(L, 'house') + ' ' + topic.h + '**', ui(L, 'xHouseLine', { h: topic.h, sig: n.houseSig(L, topic.h), sign: n.sign(L, hh.sign), lord: n.planet(L, hh.lord), lh: lp.house, planets: here }), ui(L, 'xHouseHow')); break;
      }
      case 'sade': {
        const tr = E.transits(chart, now);
        const lines = [tr.sadeSati ? n.sadeSati(L, tr.sadeSati) : ui(L, 'xSadeNone', { h: tr.saturnFromMoon })];
        if (tr.ashtamaShani) lines.push(ui(L, 'rAshtama'));
        if (tr.saturnFromMoon === 4) lines.push(ui(L, 'oArdha'));
        parts.push('**' + ui(L, 'xSadeTitle') + '**', bullets(lines), ui(L, 'xLearnLive')); break;
      }
      case 'yoga': {
        if (unk) { needTime(); break; }
        const list = R.yogas(chart).map((y) => RD.yogaView(L, chart, y)).slice(0, 8);
        parts.push('**' + ui(L, 'rYogas') + '**', list.length ? bullets(list.map((v) => v.name + ': ' + v.text)) : ui(L, 'xYogaNone'), ui(L, 'xLearnYoga')); break;
      }
      case 'panchang': {
        const ctx = o.ctx || O.makeCtx(chart, { zone, timeUnknown: unk });
        const out = O.periodOutlook(ctx, 'day', now, 0);
        parts.push('**' + ui(L, 'oDayTitle') + '**', bullets(V.dayRows(L, out, zone).map((r) => r[0] + ': ' + r[1])), ui(L, 'oDayNote', { place: o.place || '' })); break;
      }
      default: break;
    }
    parts.push(ui(L, 'xTopicMore'), ui(L, 'oNote'));
    return parts.join('\n\n');
  }

  const learn = (L, key) => ui(L, key);

  return { rashi, moonToday, placement, planetCards, ascendant, housesGuide, dashaWhy, dashaTheme, timeline, nowSummary, eventLink, topicAnswer, learn, ORDER };
});
