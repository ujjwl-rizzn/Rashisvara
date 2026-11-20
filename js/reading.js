/*  Reading: turns the computed chart and the rule results into sentences, in the
    chosen language, and into the plain English fact sheet that the AI is given.
    Nothing here guesses. Every sentence comes from a rule result. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./rules.js'), require('./i18n.js'));
  else root.JyotishReading = factory(root.Jyotish, root.JyotishRules, root.JyotishI18n);
})(typeof self !== 'undefined' ? self : this, function (E, R, I) {
  'use strict';

  const n = I.name;
  const YEAR_MS = 365.25 * 86400000;
  const KARAKA_NAMES = { AK: 'Atmakaraka', AmK: 'Amatyakaraka', BK: 'Bhratrukaraka', MK: 'Matrukaraka', PK: 'Putrakaraka', GK: 'Gnatikaraka', DK: 'Darakaraka' };

  // ---- formatting -----------------------------------------------------------
  function fmtDate(ms, zone) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone || 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ms));
  }
  function fmtTime(ms, zone) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone || 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
  }
  const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

  function tithiName(L, tithi, paksha) {
    const raw = n.tithi(L, tithi);
    if (raw.indexOf(' / ') === -1) return raw;
    const parts = raw.split(' / ');
    return paksha === 'shukla' ? parts[0] : parts[1];
  }
  function stateText(L, p) {
    const out = [];
    if (p.dignity) out.push(n.dignity(L, p.dignity));
    if (p.retro && p.id !== 'Ra' && p.id !== 'Ke') out.push(I.sent(L, 'r', 'retro'));
    if (p.combust) out.push(I.sent(L, 'r', 'combust'));
    return out.join(', ');
  }

  // ---- chart tables ---------------------------------------------------------
  function planetRows(L, chart) {
    const a = chart.asc;
    const rows = [{ id: 'As', name: n.planet(L, 'As'), sign: n.sign(L, a.sign), deg: E.dms(a.deg), nak: n.nak(L, a.nak), pada: a.pada, house: 1, state: '' }];
    for (const p of chart.planets) {
      rows.push({ id: p.id, name: n.planet(L, p.id), sign: n.sign(L, p.sign), deg: E.dms(p.deg), nak: n.nak(L, p.nak), pada: p.pada, house: p.house, state: stateText(L, p) });
    }
    return rows;
  }
  function panchangRows(L, chart, zone) {
    const pc = chart.panchang;
    const rows = [
      ['pTithi', tithiName(L, pc.tithi, pc.paksha) + ' (' + pc.tithiInPaksha + ')'],
      ['pPaksha', n.paksha(L, pc.paksha)],
      ['pNak', n.nak(L, pc.moonNak) + ' ' + pc.moonPada],
      ['pYoga', n.yoga(L, pc.yoga)],
      ['pKarana', n.karana(L, pc.karana)],
      ['pVara', n.weekday(L, pc.weekday) + ' (' + n.planet(L, pc.weekdayLord) + ')'],
    ];
    if (pc.sunrise) rows.push(['pSunrise', fmtTime(pc.sunrise, zone)]);
    if (pc.sunset) rows.push(['pSunset', fmtTime(pc.sunset, zone)]);
    rows.push(['ayan', E.dms(chart.ayanamsa)]);
    return rows;
  }
  function karakaText(L, chart) {
    return ['AK', 'AmK', 'BK', 'MK', 'PK', 'GK', 'DK'].map((k) => k + ': ' + n.planet(L, chart.karakas[k])).join('  ·  ');
  }

  // ---- area reading ---------------------------------------------------------
  function reasonText(L, r) {
    const S = (k, p) => I.sent(L, 'r', k, p);
    switch (r.code) {
      case 'lord_house':
        return S('lord_house', { lord: n.planet(L, r.lord), h: r.lordHouse, sign: n.sign(L, r.sign) }) + (r.points > 0 ? S('lord_pos') : r.points < 0 ? S('lord_neg') : '');
      case 'lord_dignity':
        return S('lord_dignity', { lord: n.planet(L, r.lord), dignity: n.dignityPhrase(L, r.dignity) }) + (r.cancelled ? S('lord_cancel') : '');
      case 'lord_combust':
        return S('lord_combust', { lord: n.planet(L, r.lord) });
      case 'occupant':
        if (r.benefic) return S(r.points > 0 ? 'occ_benefic' : 'occ_benefic_dus', { planet: n.planet(L, r.planet) });
        return S(r.points > 0 ? 'occ_malefic_up' : 'occ_malefic', { planet: n.planet(L, r.planet) });
      case 'aspect':
        return S(r.benefic ? 'asp_benefic' : 'asp_malefic', { planet: n.planet(L, r.planet) });
      default:
        return '';
    }
  }

  function areaView(L, chart, rep, zone) {
    const S = (k, p) => I.sent(L, 'r', k, p);
    const houses = rep.houses.map((hs) => ({
      house: hs.house,
      title: I.ui(L, 'house') + ' ' + hs.house + ' · ' + n.sign(L, hs.sign) + ' · ' + n.houseSig(L, hs.house),
      lines: hs.reasons.map((r) => reasonText(L, r)).filter(Boolean),
    }));
    const karakaLines = rep.karakas.map((k) => {
      const flags = [];
      if (k.retro && k.id !== 'Ra' && k.id !== 'Ke') flags.push(S('retro'));
      if (k.combust) flags.push(S('combust'));
      const base = k.dignity
        ? S('karaka', { planet: n.planet(L, k.id), sig: n.planetSig(L, k.id), h: k.house, sign: n.sign(L, k.sign), dignity: n.dignityPhrase(L, k.dignity) })
        : S('karaka_nodig', { planet: n.planet(L, k.id), sig: n.planetSig(L, k.id), h: k.house, sign: n.sign(L, k.sign) });
      return base + (flags.length ? S('karaka_flags', { flags: flags.join(', ') }) : '');
    });
    const activeLines = rep.activeNow.map((a) => S('active', { level: n.level(L, a.level), planet: n.planet(L, a.planet) }));
    const w = (x, key) => S(key, { from: fmtDate(x.start, zone), to: fmtDate(x.end, zone), maha: n.planet(L, x.maha), antar: n.planet(L, x.antar) });
    const strong = rep.windows.filter((x) => x.level === 'both').slice(0, 6).map((x) => w(x, 'windows_strong'));
    const mild = rep.windows.filter((x) => x.level !== 'both').slice(0, 4).map((x) => w(x, 'windows_mild'));
    return {
      key: rep.key, title: n.area(L, rep.key)[0], sub: n.area(L, rep.key)[1],
      label: n.label(L, rep.label), labelKey: rep.label, score: rep.score,
      bar: Math.max(6, Math.min(100, Math.round(((rep.score + 2.5) / 6.5) * 100))),
      houses, karakaLines, activeLines, windows: strong.concat(mild),
    };
  }

  // ---- yogas ----------------------------------------------------------------
  const VR = { harsha: 6, sarala: 8, vimala: 12 };
  function yogaView(L, chart, y) {
    const Y = (k, p) => I.sent(L, 'yoga_t', k, p);
    const pn = (id) => n.planet(L, id);
    let text = '', tone = 'good';
    switch (y.id) {
      case 'gajakesari': text = Y('gajakesari'); break;
      case 'budhaditya': text = Y('budhaditya') + (y.weak ? Y('budhaditya_weak') : ''); break;
      case 'chandra_mangala': text = Y('chandra_mangala'); tone = 'neutral'; break;
      case 'ruchaka': case 'bhadra': case 'hamsa': case 'malavya': case 'shasha':
        text = Y('mahapurusha', { planet: pn(y.planets[0]), theme: Y('theme_' + y.id) }); break;
      case 'sunapha': case 'anapha': case 'durudhara': text = Y(y.id); break;
      case 'kemadruma': text = Y('kemadruma') + (y.cancelled ? Y('kemadruma_c') : ''); tone = y.cancelled ? 'neutral' : 'caution'; break;
      case 'raja': text = Y('raja', { kh: y.houses[0], th: y.houses[1], k: pn(y.planets[0]), t: pn(y.planets[1]), by: Y('by_' + y.by) }); break;
      case 'yogakaraka': text = Y('yogakaraka', { planet: pn(y.planets[0]), houses: y.houses.join(', ') }); break;
      case 'dhana': text = Y('dhana', { a: pn(y.planets[0]), b: pn(y.planets[1]), by: Y('by_' + y.by) }); break;
      case 'vipreet_raja': text = Y('vipreet_raja', { h0: VR[y.kind], p: pn(y.planets[0]), h: y.house }); break;
      case 'neecha_bhanga':
        text = Y(y.cancelled ? 'neecha_bhanga_y' : 'neecha_bhanga_n', { planet: pn(y.planets[0]) });
        tone = y.cancelled ? 'good' : 'caution'; break;
      case 'parivartana':
        text = Y('parivartana', { a: pn(y.planets[0]), b: pn(y.planets[1]), kind: Y('kind_' + y.kind) });
        tone = y.kind === 'dainya' ? 'caution' : y.kind === 'khala' ? 'neutral' : 'good'; break;
      case 'mangal_dosha': {
        const where = y.where.map((w) => Y('mangal_where', { from: n.from(L, w.from), house: w.house })).join(', ');
        text = Y('mangal_dosha', { where }) + (y.mitigated ? Y('mangal_mit') : '') + Y('mangal_note');
        tone = y.mitigated ? 'neutral' : 'caution'; break;
      }
      case 'kaal_sarp': text = Y('kaal_sarp'); tone = 'neutral'; break;
      default: text = '';
    }
    return { id: y.id, name: n.yogaName(L, y.id), text, tone };
  }

  // ---- today's sky ----------------------------------------------------------
  function transitView(L, chart, tr, zone) {
    const lines = [I.ui(L, 'rSat', { h: tr.saturnFromMoon }), I.ui(L, 'rJup', { h: tr.jupiterFromMoon })];
    if (tr.sadeSati) lines.push(n.sadeSati(L, tr.sadeSati));
    if (tr.ashtamaShani) lines.push(I.ui(L, 'rAshtama'));
    const rows = tr.planets.map((p) => ({
      id: p.id, name: n.planet(L, p.id), sign: n.sign(L, p.sign), deg: E.dms(p.deg),
      nak: n.nak(L, p.nak) + ' ' + p.pada, retro: p.retro && p.id !== 'Ra' && p.id !== 'Ke',
      hLagna: tr.fromLagna[p.id], hMoon: tr.fromMoon[p.id],
    }));
    return { lines, rows };
  }

  // ---- dasha helpers --------------------------------------------------------
  function upcomingPeriods(chart, nowMs, count) {
    const out = [];
    for (const m of chart.dasha.list) {
      if (m.end < nowMs) continue;
      for (const a of E.subPeriods(m)) {
        if (a.end < nowMs) continue;
        out.push({ maha: m.lord, antar: a.lord, start: a.start, end: a.end });
        if (out.length >= count) return out;
      }
    }
    return out;
  }
  const pct = (a, b, x) => Math.max(0, Math.min(100, Math.round(((x - a) / (b - a)) * 100)));

  // ---- the English fact sheet for the AI ------------------------------------
  function factsForAI(chart, o) {
    const L = 'en';
    const now = o.nowMs, zone = o.zone || 'UTC';
    const areas = o.areas || R.allAreas(chart, now);
    const yogas = o.yogas || R.yogas(chart);
    const tr = o.transits || E.transits(chart, now);
    const out = [];
    const born = chart.input.utcMs;
    const birthYear = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric' }).format(new Date(born));
    const age = Math.floor((now - born) / YEAR_MS);

    out.push('NOW: ' + new Date(now).toISOString().slice(0, 16) + 'Z');
    out.push('METHOD: Vedic (Parashari). Sidereal zodiac, Lahiri ayanamsa ' + E.dms(chart.ayanamsa) + '. Whole-sign houses counted from the lagna. Mean Rahu and Ketu. Vimshottari dasha with 365.25-day years. Divisional charts D1, D3, D7, D9, D10, D12.');
    out.push('PERSON: born in ' + birthYear + ', age about ' + age + '.' + (o.timeUnknown
      ? ' BIRTH TIME IS UNKNOWN (noon was used). The lagna, all houses, divisional charts and dasha timing are NOT reliable. Use only broad Moon-sign (rashi) ideas and say clearly that the time is missing.'
      : ' Birth time was given by the user; its accuracy is not verified.'));
    const a = chart.asc;
    out.push('LAGNA: ' + n.sign(L, a.sign) + ' ' + E.dms(a.deg) + ', nakshatra ' + n.nak(L, a.nak) + ' pada ' + a.pada + ', navamsa sign ' + n.sign(L, a.vargas[9]));

    out.push('PLANETS (house = whole-sign house from lagna):');
    for (const p of chart.planets) {
      const bits = [n.planet(L, p.id) + ': ' + n.sign(L, p.sign) + ' ' + E.dms(p.deg), 'house ' + p.house, 'nakshatra ' + n.nak(L, p.nak) + ' pada ' + p.pada];
      if (p.dignity) bits.push(n.dignityPhrase(L, p.dignity));
      if (p.retro && p.id !== 'Ra' && p.id !== 'Ke') bits.push('retrograde');
      if (p.combust) bits.push('combust');
      bits.push('D9 ' + n.sign(L, p.vargas[9]) + ', D10 ' + n.sign(L, p.vargas[10]));
      out.push('- ' + bits.join('; '));
    }
    out.push('HOUSES:');
    for (const hs of chart.houses) {
      out.push('- House ' + hs.house + ': ' + n.sign(L, hs.sign) + ', lord ' + n.planet(L, hs.lord) + ', occupants: ' + (hs.planets.length ? hs.planets.map((id) => n.planet(L, id)).join(', ') : 'none') + ' (' + n.houseSig(L, hs.house) + ')');
    }
    const pc = chart.panchang;
    out.push('BIRTH PANCHANG: tithi ' + tithiName(L, pc.tithi, pc.paksha) + ' of ' + n.paksha(L, pc.paksha) + ' (tithi number ' + pc.tithi + '), Moon nakshatra ' + n.nak(L, pc.moonNak) + ' pada ' + pc.moonPada + ', yoga ' + n.yoga(L, pc.yoga) + ', karana ' + n.karana(L, pc.karana) + ', weekday ' + n.weekday(L, pc.weekday) + ' (sunrise-based).');
    out.push('JAIMINI KARAKAS: ' + Object.keys(KARAKA_NAMES).map((k) => KARAKA_NAMES[k] + ' ' + n.planet(L, chart.karakas[k])).join(', '));

    out.push('YOGAS AND DOSHAS FOUND BY THE RULES (each is a standard textbook definition):');
    if (!yogas.length) out.push('- none of the listed standard yogas');
    for (const y of yogas) { const v = yogaView(L, chart, y); out.push('- ' + v.name + ': ' + v.text); }

    out.push('VIMSHOTTARI DASHA:');
    out.push('- At birth the running period was ' + n.planet(L, chart.dasha.balance.lord) + ' with ' + chart.dasha.balance.years.toFixed(2) + ' years left.');
    const cur = E.periodAt(chart.dasha, now);
    if (cur) {
      const line = (k, p) => k + ' ' + n.planet(L, p.lord) + ' ' + isoDay(p.start) + ' to ' + isoDay(p.end);
      out.push('- RUNNING NOW: ' + [line('Mahadasha', cur.maha), cur.antar && line('Antardasha', cur.antar), cur.pratyantar && line('Pratyantar', cur.pratyantar)].filter(Boolean).join('; '));
    }
    const lifeEnd = now + 10 * YEAR_MS;
    for (const m of chart.dasha.list) {
      if (m.end < born || m.start > lifeEnd) continue;
      const subs = E.subPeriods(m).filter((x) => x.end > born && x.start < lifeEnd).map((x) => n.planet(L, x.lord) + ' ' + isoDay(x.start));
      out.push('- Mahadasha ' + n.planet(L, m.lord) + ' ' + isoDay(m.start) + ' to ' + isoDay(m.end) + '. Antardasha start dates: ' + subs.join(', '));
    }

    out.push('TODAY\'S SKY (sidereal; "from lagna" and "from Moon" are house counts):');
    for (const p of tr.planets) {
      out.push('- ' + n.planet(L, p.id) + ': ' + n.sign(L, p.sign) + ' ' + E.dms(p.deg) + (p.retro && p.id !== 'Ra' && p.id !== 'Ke' ? ' retrograde' : '') + ', house ' + tr.fromLagna[p.id] + ' from lagna, house ' + tr.fromMoon[p.id] + ' from Moon');
    }
    const tv = transitView(L, chart, tr, zone);
    tv.lines.forEach((l) => out.push('- ' + l));

    out.push('LIFE AREAS (open rule scoring of traditional rules, not Shadbala; label = strong, good, mixed or challenging):');
    for (const key of Object.keys(areas)) out.push(areaCompact(L, areas[key], zone));
    return out.join('\n');
  }

  // One short, complete line per life area: every rule result, no prose.
  function areaCompact(L, rep, zone) {
    const parts = [];
    for (const hs of rep.houses) {
      const bits = [];
      const occ = [], asp = [];
      for (const r of hs.reasons) {
        if (r.code === 'lord_house') bits.push('lord ' + n.planet(L, r.lord) + ' in house ' + r.lordHouse);
        else if (r.code === 'lord_dignity') bits.push(n.dignity(L, r.dignity) + (r.cancelled ? ', debilitation cancelled' : ''));
        else if (r.code === 'lord_combust') bits.push('lord combust');
        else if (r.code === 'occupant') occ.push(n.planet(L, r.planet));
        else if (r.code === 'aspect') asp.push(n.planet(L, r.planet));
      }
      parts.push('house ' + hs.house + ' (' + n.sign(L, hs.sign) + '): ' + bits.join(', ') + '; occupants: ' + (occ.join(', ') || 'none') + '; aspected by: ' + (asp.join(', ') || 'none'));
    }
    const kar = rep.karakas.map((k) => n.planet(L, k.id) + ' house ' + k.house + (k.dignity ? ' ' + n.dignity(L, k.dignity) : '') + (k.retro && k.id !== 'Ra' && k.id !== 'Ke' ? ' retrograde' : '') + (k.combust ? ' combust' : '')).join('; ');
    const act = rep.activeNow.map((a) => a.level + ' ' + n.planet(L, a.planet)).join(', ');
    const win = rep.windows.filter((x) => x.level === 'both').slice(0, 3).map((x) => n.planet(L, x.maha) + '/' + n.planet(L, x.antar) + ' ' + isoDay(x.start) + ' to ' + isoDay(x.end)).join('; ');
    return '- ' + n.area(L, rep.key)[0] + ' => ' + rep.label + ' | ' + parts.join(' | ') + ' | significators: ' + kar +
      ' | linked periods running now: ' + (act || 'none') + ' | strongest linked antardashas ahead: ' + (win || 'none');
  }

  return { fmtDate, fmtTime, tithiName, stateText, planetRows, panchangRows, karakaText, reasonText, areaView, yogaView, transitView, upcomingPeriods, pct, factsForAI };
});
