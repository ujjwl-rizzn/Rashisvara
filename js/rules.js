/*  Rules: classical Parashari rules applied to a computed chart.
    Every result is a plain fact plus the reason for it (a "code" and its
    parameters), so the screen and the AI can always show WHY something was said.
    Scores here are a simple, open scoring of traditional rules. They are not
    Shadbala or Ashtakavarga, and the app says so. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.RsvRules = factory(root.RsvEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  const KENDRA = [1, 4, 7, 10];
  const TRIKONA = [1, 5, 9];
  const DUSTHANA = [6, 8, 12];
  const UPACHAYA = [3, 6, 10, 11];
  const NATURAL_MALEFIC = ['Su', 'Ma', 'Sa', 'Ra', 'Ke'];
  // Houses counted from the planet, itself = 1. Rahu and Ketu are given no aspects here (schools differ).
  const ASPECTS = { Su: [7], Mo: [7], Ma: [4, 7, 8], Me: [7], Ju: [5, 7, 9], Ve: [7], Sa: [3, 7, 10] };

  const P = (chart, id) => chart.planets.find((p) => p.id === id);
  const lordsOf = (chart, id) => chart.houses.filter((h) => h.lord === id).map((h) => h.house);
  const houseLord = (chart, h) => chart.houses[h - 1].lord;
  const rel = (a, b) => (b.sign - a.sign + 12) % 12;          // 0 = same sign, 3 = 4th sign from a

  // The Moon counts as a benefic while bright: Shukla Ashtami through Krishna Ashtami.
  function moonBright(chart) {
    const e = chart.panchang.elongation;
    return e >= 84 && e <= 276;
  }
  function isBenefic(chart, id) {
    if (id === 'Mo') return moonBright(chart);
    return !NATURAL_MALEFIC.includes(id);
  }

  // Planets that aspect a given house (whole-sign houses).
  function aspectsOn(chart, house) {
    const out = [];
    for (const p of chart.planets) {
      const offs = ASPECTS[p.id];
      if (!offs || p.house === house) continue;
      for (const o of offs) {
        if (((p.house - 1 + o - 1) % 12) + 1 === house) out.push(p.id);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Yogas (strict, standard definitions; each carries its own parameters)
  // ---------------------------------------------------------------------------
  function yogas(chart) {
    const out = [];
    const Mo = P(chart, 'Mo'), Ju = P(chart, 'Ju'), Su = P(chart, 'Su'), Me = P(chart, 'Me');
    const Ma = P(chart, 'Ma'), Ve = P(chart, 'Ve'), Ra = P(chart, 'Ra');
    const seven = E.SEVEN.map((id) => P(chart, id));

    // Jupiter in a kendra (1st, 4th, 7th, 10th) from the Moon
    if ([0, 3, 6, 9].includes(rel(Mo, Ju))) {
      out.push({ id: 'gajakesari', planets: ['Ju', 'Mo'], weak: Ju.dignity === 'debilitated' || !!Ju.combust });
    }
    // Sun and Mercury in the same sign
    if (Su.sign === Me.sign) out.push({ id: 'budhaditya', planets: ['Su', 'Me'], weak: !!Me.combust });
    // Moon and Mars in the same sign
    if (Mo.sign === Ma.sign) out.push({ id: 'chandra_mangala', planets: ['Mo', 'Ma'] });

    // Pancha Mahapurusha: Mars, Mercury, Jupiter, Venus or Saturn in own or exalted sign, in a kendra from the lagna
    const mahapurusha = { Ma: 'ruchaka', Me: 'bhadra', Ju: 'hamsa', Ve: 'malavya', Sa: 'shasha' };
    for (const id of Object.keys(mahapurusha)) {
      const p = P(chart, id);
      if (['own', 'exalted', 'moolatrikona'].includes(p.dignity) && KENDRA.includes(p.house)) {
        out.push({ id: mahapurusha[id], planets: [id], house: p.house, sign: p.sign });
      }
    }

    // Moon-based yogas: planets (not Sun, not nodes) in the 2nd and 12th from the Moon
    const five = ['Ma', 'Me', 'Ju', 'Ve', 'Sa'].map((id) => P(chart, id));
    const in2 = five.filter((p) => rel(Mo, p) === 1);
    const in12 = five.filter((p) => rel(Mo, p) === 11);
    const withMoon = five.filter((p) => rel(Mo, p) === 0);
    if (in2.length && in12.length) out.push({ id: 'durudhara', planets: [...in2, ...in12].map((p) => p.id) });
    else if (in2.length) out.push({ id: 'sunapha', planets: in2.map((p) => p.id) });
    else if (in12.length) out.push({ id: 'anapha', planets: in12.map((p) => p.id) });
    else if (!withMoon.length) {
      const cancelled = KENDRA.includes(Mo.house) || five.some((p) => [3, 6, 9].includes(rel(Mo, p)));
      out.push({ id: 'kemadruma', cancelled });
    }

    // Raja yoga: a kendra lord (4, 7, 10) with a trikona lord (5, 9), together in one sign or exchanging signs
    const seenRaja = new Set();
    for (const kh of [4, 7, 10]) {
      for (const th of [5, 9]) {
        const k = P(chart, houseLord(chart, kh)), t = P(chart, houseLord(chart, th));
        if (k.id === t.id) continue;
        const together = k.sign === t.sign;
        const exchange = E.SIGN_LORD[k.sign] === t.id && E.SIGN_LORD[t.sign] === k.id;
        const key = [k.id, t.id].sort().join('-') + kh + th;
        if ((together || exchange) && !seenRaja.has(key)) {
          seenRaja.add(key);
          out.push({ id: 'raja', planets: [k.id, t.id], houses: [kh, th], by: together ? 'conjunction' : 'exchange' });
        }
      }
    }
    // A single planet ruling both a kendra (4, 7, 10) and a trikona (5, 9)
    for (const id of E.SEVEN) {
      const h = lordsOf(chart, id);
      if (h.some((x) => [4, 7, 10].includes(x)) && h.some((x) => [5, 9].includes(x))) {
        out.push({ id: 'yogakaraka', planets: [id], houses: h });
      }
    }

    // Dhana: lords of the 2nd and 11th houses together or exchanging
    {
      const a = P(chart, houseLord(chart, 2)), b = P(chart, houseLord(chart, 11));
      if (a.id !== b.id) {
        const together = a.sign === b.sign;
        const exchange = E.SIGN_LORD[a.sign] === b.id && E.SIGN_LORD[b.sign] === a.id;
        if (together || exchange) out.push({ id: 'dhana', planets: [a.id, b.id], by: together ? 'conjunction' : 'exchange' });
      }
    }

    // Vipreet Raja (strict form): a lord that rules only 6th/8th/12th houses and sits in one of them
    for (const [h, name] of [[6, 'harsha'], [8, 'sarala'], [12, 'vimala']]) {
      const p = P(chart, houseLord(chart, h));
      if (lordsOf(chart, p.id).every((x) => DUSTHANA.includes(x)) && DUSTHANA.includes(p.house)) {
        out.push({ id: 'vipreet_raja', kind: name, planets: [p.id], house: p.house });
      }
    }

    // Neecha Bhanga: a debilitated planet whose debilitation-sign lord or exaltation-sign lord is in a kendra from lagna or Moon
    for (const p of seven) {
      if (p.dignity !== 'debilitated') continue;
      const helpers = [E.SIGN_LORD[p.sign], E.SIGN_LORD[E.EXALT[p.id][0]]].map((id) => P(chart, id));
      const ok = helpers.some((h) => KENDRA.includes(h.house) || [0, 3, 6, 9].includes(rel(Mo, h)));
      out.push({ id: 'neecha_bhanga', planets: [p.id], cancelled: ok });
    }

    // Parivartana: two planets exchanging signs
    for (let i = 0; i < seven.length; i++) {
      for (let j = i + 1; j < seven.length; j++) {
        const a = seven[i], b = seven[j];
        if (E.SIGN_LORD[a.sign] === b.id && E.SIGN_LORD[b.sign] === a.id) {
          const hs = [...lordsOf(chart, a.id), ...lordsOf(chart, b.id)];
          const kind = hs.some((x) => DUSTHANA.includes(x)) ? 'dainya' : hs.includes(3) ? 'khala' : 'maha';
          out.push({ id: 'parivartana', planets: [a.id, b.id], kind });
        }
      }
    }

    // Mangal dosha: Mars in the 1st, 4th, 7th, 8th or 12th from the lagna or the Moon.
    // The 2nd house and Venus as a reference are left out on purpose: only some schools count them,
    // and a wider net would frighten people more often than the common rule does.
    {
      const from = (ref) => ((Ma.sign - ref.sign + 12) % 12) + 1;
      const set = [1, 4, 7, 8, 12];
      const hit = { lagna: Ma.house, moon: from(Mo) };
      const where = Object.entries(hit).filter(([, h]) => set.includes(h)).map(([k, h]) => ({ from: k, house: h }));
      if (where.length) {
        out.push({ id: 'mangal_dosha', where, mitigated: ['own', 'exalted', 'moolatrikona'].includes(Ma.dignity) });
      }
    }

    // Kaal Sarp: all seven planets on one side of the Rahu-Ketu axis
    {
      const arcs = seven.map((p) => E.norm360(p.lon - Ra.lon));
      if (arcs.every((a) => a > 0 && a < 180) || arcs.every((a) => a > 180)) out.push({ id: 'kaal_sarp' });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // What each planet means for this lagna
  // ---------------------------------------------------------------------------
  function functional(chart) {
    const out = {};
    for (const id of E.SEVEN) {
      const h = lordsOf(chart, id);
      out[id] = {
        houses: h,
        kendra: h.some((x) => [4, 7, 10].includes(x)),
        trikona: h.some((x) => [5, 9].includes(x)),
        lagna: h.includes(1),
        dusthana: h.some((x) => DUSTHANA.includes(x)),
        yogakaraka: h.some((x) => [4, 7, 10].includes(x)) && h.some((x) => [5, 9].includes(x)),
      };
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Open scoring of one house
  // ---------------------------------------------------------------------------
  const DIGNITY_POINTS = { exalted: 1, moolatrikona: 1, own: 1, friend: 0.5, neutral: 0, enemy: -0.5, debilitated: -1 };

  function scoreHouse(chart, h) {
    const reasons = [];
    let score = 0;
    const hs = chart.houses[h - 1];
    const lord = P(chart, hs.lord);
    const nb = yogas(chart).some((y) => y.id === 'neecha_bhanga' && y.cancelled && y.planets[0] === lord.id);

    // 1. Where the house lord sits
    let pl = 0;
    if ([1, 4, 5, 7, 9, 10].includes(lord.house)) pl = 1;
    else if ([2, 11].includes(lord.house)) pl = 0.5;
    else if (DUSTHANA.includes(lord.house)) pl = -1;
    score += pl;
    reasons.push({ code: 'lord_house', lord: lord.id, lordHouse: lord.house, sign: lord.sign, points: pl });

    // 2. Strength of the house lord
    let dp = DIGNITY_POINTS[lord.dignity] || 0;
    if (lord.dignity === 'debilitated' && nb) dp += 0.5;
    score += dp;
    reasons.push({ code: 'lord_dignity', lord: lord.id, dignity: lord.dignity, cancelled: lord.dignity === 'debilitated' && nb, points: dp });
    if (lord.combust) { score -= 0.5; reasons.push({ code: 'lord_combust', lord: lord.id, points: -0.5 }); }

    // 3. Planets sitting in the house
    for (const id of hs.planets) {
      let pts;
      if (isBenefic(chart, id)) pts = DUSTHANA.includes(h) ? 0 : 0.5;
      else pts = UPACHAYA.includes(h) ? 0.5 : -0.5;
      score += pts;
      reasons.push({ code: 'occupant', planet: id, benefic: isBenefic(chart, id), points: pts });
    }
    // 4. Planets aspecting the house
    for (const id of aspectsOn(chart, h)) {
      const pts = isBenefic(chart, id) ? 0.5 : -0.25;
      score += pts;
      reasons.push({ code: 'aspect', planet: id, benefic: isBenefic(chart, id), points: pts });
    }
    return { house: h, sign: hs.sign, lord: hs.lord, score, reasons };
  }

  function labelFor(score) {
    if (score >= 2) return 'strong';
    if (score >= 0.75) return 'good';
    if (score > -0.5) return 'mixed';
    return 'challenging';
  }

  // ---------------------------------------------------------------------------
  // Life areas
  // ---------------------------------------------------------------------------
  const AREAS = {
    self:         { houses: [1],     karakas: ['Su', 'Mo'] },
    wealth:       { houses: [2, 11], karakas: ['Ju', 'Ve'] },
    home:         { houses: [4],     karakas: ['Mo', 'Ve'] },
    education:    { houses: [4, 5],  karakas: ['Me', 'Ju'] },
    children:     { houses: [5],     karakas: ['Ju'] },
    health:       { houses: [1, 6],  karakas: ['Su', 'Mo', 'Ma'] },
    marriage:     { houses: [7, 2],  karakas: ['Ve', 'Ju'] },
    career:       { houses: [10, 6], karakas: ['Sa', 'Su', 'Me'] },
    foreign:      { houses: [12, 9, 3], karakas: ['Ra', 'Sa'] },
    spirituality: { houses: [9, 5, 12], karakas: ['Ju', 'Ke'] },
    // Added for the period outlooks. Love and romance: 5th house (attraction, romance) and 7th (partner), Venus and Moon.
    love:         { houses: [5, 7],  karakas: ['Ve', 'Mo'] },
    // Family: 2nd house (family, food, speech) and 4th (mother, home), Moon and Jupiter.
    family:       { houses: [2, 4],  karakas: ['Mo', 'Ju'] },
  };

  function relatedPlanets(chart, area) {
    const set = new Set();
    for (const h of area.houses) {
      set.add(chart.houses[h - 1].lord);
      chart.houses[h - 1].planets.forEach((id) => set.add(id));
    }
    area.karakas.forEach((id) => set.add(id));
    return set;
  }

  // Dasha periods (maha + antar) in a window that involve the area's planets.
  function activationWindows(chart, key, fromMs, toMs) {
    const set = relatedPlanets(chart, AREAS[key]);
    const out = [];
    for (const m of chart.dasha.list) {
      if (m.end < fromMs || m.start > toMs) continue;
      for (const a of E.subPeriods(m)) {
        if (a.end < fromMs || a.start > toMs) continue;
        const mm = set.has(m.lord), aa = set.has(a.lord);
        if (mm || aa) out.push({ start: a.start, end: a.end, maha: m.lord, antar: a.lord, level: mm && aa ? 'both' : 'one' });
      }
    }
    return out;
  }

  function areaReport(chart, key, nowMs) {
    const area = AREAS[key];
    const houses = area.houses.map((h) => scoreHouse(chart, h));
    const avg = houses.reduce((s, x) => s + x.score, 0) / houses.length;
    const karakas = area.karakas.map((id) => {
      const p = P(chart, id);
      return { id, house: p.house, sign: p.sign, dignity: p.dignity, combust: !!p.combust, retro: p.retro };
    });
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    const set = relatedPlanets(chart, area);
    const cur = E.periodAt(chart.dasha, now);
    const activeNow = cur ? ['maha', 'antar', 'pratyantar'].filter((k) => cur[k] && set.has(cur[k].lord)).map((k) => ({ level: k, planet: cur[k].lord })) : [];
    return {
      key, houses, karakas,
      score: avg, label: labelFor(avg),
      related: [...set],
      activeNow,
      windows: activationWindows(chart, key, now, now + 10 * 365.25 * 86400000),
    };
  }

  function allAreas(chart, nowMs) {
    return Object.fromEntries(Object.keys(AREAS).map((k) => [k, areaReport(chart, k, nowMs)]));
  }

  return { KENDRA, TRIKONA, DUSTHANA, UPACHAYA, ASPECTS, AREAS, yogas, functional, scoreHouse, labelFor, areaReport, allAreas, aspectsOn, activationWindows, lordsOf, isBenefic, moonBright, relatedPlanets, DIGNITY_POINTS };
});
