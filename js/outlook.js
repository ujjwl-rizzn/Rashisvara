/*  Outlook: day, week, month and year outlooks for ten life areas, from one birth chart.

    WHAT THIS IS
    A transparent scoring of traditional Vedic ideas. Nothing is random and nothing is made up by an AI:
    the same chart and the same moment always give the same answer, and every score comes with the reasons.

    For each life area three parts are scored from -1 (hard) to +1 (supportive) and then combined:
      N  Natal strength:  the open house/lord/karaka scoring in rules.js, blended with the Sarvashtakavarga points of
                          the area's houses (ashtaka.js).
      D  Dasha:           the running Vimshottari main, sub and sub-sub period. A period lord counts fully when it rules,
                          sits in or signifies the area, and a little when it does not; its own natal quality
                          (dignity, house, what it rules) sets the direction.
      T  Transit:         where the planets are moving now, counted from the natal Moon (gochara) and judged with the
                          planet's own Ashtakavarga points in that sign. Fast planets matter more for a day, slow
                          planets (Jupiter, Saturn, Rahu, Ketu) more for a month or a year. For a single day the Moon's
                          star-relationship to the birth star (Tara bala) is added.
    The weights between N, D, T and between planets are this app's own choice (classical books give the ingredients,
    not one formula) and are written down in WEIGHTS and PLANET_W below.

    WHAT THIS IS NOT
    Not a promise. The labels compare this period with typical periods (see outlook-cal.js), so "Good" means
    "more favourable than most periods by these rules", not "good things will happen".

    Birth time unknown: only the Moon-sign transits are used (the lagna, houses, dasha and Ashtakavarga all need the time). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine.js'), require('./rules.js'), require('./ashtaka.js'), require('./timezone.js'), require('./outlook-cal.js'));
  } else root.RsvOutlook = factory(root.RsvEngine, root.RsvRules, root.RsvAshtaka, root.RsvTZ, root.RsvOutlookCal);
})(typeof self !== 'undefined' ? self : this, function (E, R, AV, TZ, CAL) {
  'use strict';

  const DAY = 86400000;
  const AREA_KEYS = ['career', 'wealth', 'love', 'marriage', 'family', 'health', 'education', 'foreign', 'spirituality'];
  const PERIODS = { day: { days: 1, n: 6, dashaN: 1 }, week: { days: 7, n: 7, dashaN: 3 }, month: { days: 30, n: 30, dashaN: 4 }, year: { days: 365, n: 73, dashaN: 12 } };
  // [natal, dasha, transit] weights per period (each sums to 1)
  const WEIGHTS = { day: [0.15, 0.25, 0.60], week: [0.20, 0.30, 0.50], month: [0.25, 0.35, 0.40], year: [0.30, 0.35, 0.35] };
  // main, sub, sub-sub period weights per period
  const LEVEL_W = { day: [0.25, 0.40, 0.35], week: [0.30, 0.40, 0.30], month: [0.35, 0.50, 0.15], year: [0.40, 0.60, 0] };
  // How much each planet's transit counts per period (Moon rules the day, the slow planets rule the year)
  const PLANET_W = {
    day:   { Su: 1, Mo: 3, Ma: 1, Me: 1, Ju: 1.2, Ve: 1, Sa: 1.2, Ra: 0.6, Ke: 0.6 },
    week:  { Su: 1, Mo: 1.5, Ma: 1, Me: 1, Ju: 1.5, Ve: 1, Sa: 1.5, Ra: 0.8, Ke: 0.8 },
    month: { Su: 1, Mo: 0.7, Ma: 1.2, Me: 0.8, Ju: 2, Ve: 1, Sa: 2, Ra: 1.2, Ke: 1.2 },
    year:  { Su: 0.4, Mo: 0.2, Ma: 0.8, Me: 0.4, Ju: 3, Ve: 0.6, Sa: 3, Ra: 2, Ke: 2 },
  };
  // Favourable houses counted from the natal Moon (classical gochara)
  const GOCHARA_FAV = {
    Su: [3, 6, 10, 11], Mo: [1, 3, 6, 7, 10, 11], Ma: [3, 6, 11], Me: [2, 4, 6, 8, 10, 11], Ju: [2, 5, 7, 9, 11],
    Ve: [1, 2, 3, 4, 5, 8, 9, 11, 12], Sa: [3, 6, 11], Ra: [3, 6, 11], Ke: [3, 6, 11],
  };
  // Tara bala: count from the birth star to the day's Moon star, in nines. Quality of each of the nine.
  const TARA_Q = [0, 1, -1, 1, -1, 1, -1, 1, 1];           // Janma, Sampat, Vipat, Kshema, Pratyari, Sadhana, Naidhana, Mitra, Parama Mitra
  const TARA_W = 2;
  // Segment (1..8 of daylight) for Rahu Kaal, Yamaganda, Gulika by weekday (0 = Sunday)
  const RAHU = [8, 2, 7, 5, 6, 4, 3], YAMA = [5, 4, 3, 2, 1, 7, 6], GULIKA = [7, 6, 5, 4, 3, 2, 1];

  const clamp = (x, lo, hi) => Math.max(lo === undefined ? -1 : lo, Math.min(hi === undefined ? 1 : hi, x));
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const sampleTimes = (t0, t1, n) => { const out = []; for (let i = 0; i < n; i++) out.push(t0 + ((i + 0.5) * (t1 - t0)) / n); return out; };

  // ---- local days (in the person's own time zone) --------------------------
  function localDayStart(ms, zone) {
    const off = TZ.offsetSecondsAt(ms, zone);
    const l = new Date(ms + off * 1000);
    return TZ.localToUtc(l.getUTCFullYear(), l.getUTCMonth() + 1, l.getUTCDate(), 0, 0, 0, zone).utcMs;
  }
  function shiftDays(dayStartMs, n, zone) { return localDayStart(dayStartMs + n * DAY + DAY / 2, zone); }
  function localWeekday(dayStartMs, zone) {
    const off = TZ.offsetSecondsAt(dayStartMs + DAY / 2, zone);
    return new Date(dayStartMs + DAY / 2 + off * 1000).getUTCDay();
  }

  // ---- natal quality of a planet (used for the dasha part) -----------------
  function natalQuality(chart) {
    const F = R.functional(chart), out = {};
    const pos = (house) => ([1, 4, 5, 7, 9, 10].includes(house) ? 1 : [6, 8, 12].includes(house) ? -1 : 0.3);
    for (const id of E.SEVEN) {
      const p = chart.planets.find((x) => x.id === id), f = F[id];
      const func = f.yogakaraka ? 1 : (f.trikona || f.kendra || f.lagna) ? (f.dusthana ? 0.3 : 0.6) : f.dusthana ? -0.7 : 0;
      out[id] = clamp(0.45 * (R.DIGNITY_POINTS[p.dignity] || 0) + 0.3 * pos(p.house) + 0.25 * func - (p.combust ? 0.15 : 0));
    }
    // Rahu and Ketu act through the sign they sit in: half from where they sit, half from the ruler of that sign
    for (const id of ['Ra', 'Ke']) {
      const p = chart.planets.find((x) => x.id === id);
      out[id] = clamp(0.5 * pos(p.house) + 0.5 * out[E.SIGN_LORD[p.sign]]);
    }
    return out;
  }

  // ---- context for one chart ------------------------------------------------
  function makeCtx(chart, o) {
    o = o || {};
    const reduced = !!o.timeUnknown;
    const moon = chart.planets.find((p) => p.id === 'Mo');
    const av = AV.compute(chart);
    const areas = {};
    for (const key of AREA_KEYS) {
      const def = R.AREAS[key];
      const scores = def.houses.map((h) => R.scoreHouse(chart, h).score);
      const natalScore = sum(scores) / scores.length;
      const savMean = sum(def.houses.map((h) => av.savByHouse[h - 1])) / def.houses.length;
      areas[key] = {
        key, houses: def.houses, karakas: def.karakas, related: R.relatedPlanets(chart, def),
        lords: new Set(def.houses.map((h) => chart.houses[h - 1].lord)),
        natalScore, savMean,
        N: reduced ? 0 : clamp(0.7 * clamp(natalScore / 3) + 0.3 * clamp((savMean - 28) / 6)),
      };
    }
    return {
      chart, reduced, zone: o.zone || 'UTC', moonSign: moon.sign, moonNak: moon.nak, asc: chart.asc.sign,
      av, areas, quality: natalQuality(chart), cache: new Map(),
    };
  }

  function lonsCached(ctx, t) {
    const k = Math.round(t / 1000);
    let v = ctx.cache.get(k);
    if (!v) {
      if (ctx.cache.size > 4000) ctx.cache.clear();
      v = E.lonsAt(k * 1000); ctx.cache.set(k, v);
    }
    return v;
  }
  const signOf = (lon) => Math.floor(lon / 30);

  // How one planet's transit stands at one moment. q is -1..+1.
  function planetNow(ctx, id, lon) {
    const sign = signOf(lon);
    const hMoon = ((sign - ctx.moonSign + 12) % 12) + 1;
    const hLagna = ((sign - ctx.asc + 12) % 12) + 1;
    const fav = GOCHARA_FAV[id].includes(hMoon);
    const g = fav ? 1 : -1;
    let bav = null, q;
    if (ctx.reduced || !ctx.av.bav[id]) q = ctx.reduced ? g : 0.7 * g;
    else { bav = ctx.av.bav[id][sign]; q = 0.5 * g + 0.5 * clamp((bav - AV.AVG[id]) / 3); }
    return { id, sign, hMoon, hLagna, fav, bav, q };
  }
  function taraOf(ctx, moonLon) {
    const nak = Math.floor(moonLon / E.NAK_LEN);
    const count = ((nak - ctx.moonNak + 27) % 27) + 1;       // 1..27 counted from the birth star
    return ((count - 1) % 9) + 1;                              // 1..9
  }

  // ---- one window of time ---------------------------------------------------
  // Returns per-planet averages for the window (shared by all areas).
  function windowStats(ctx, period, t0, t1) {
    const cfg = PERIODS[period], times = sampleTimes(t0, t1, cfg.n);
    const stats = {}, W = PLANET_W[period];
    const per = {};
    for (const id of E.PLANETS) per[id] = [];
    const taras = [];
    for (const t of times) {
      const lons = lonsCached(ctx, t);
      for (const id of E.PLANETS) per[id].push(planetNow(ctx, id, lons[id]));
      if (period === 'day') taras.push(taraOf(ctx, lons.Mo));
    }
    for (const id of E.PLANETS) {
      const arr = per[id], mid = arr[Math.floor(arr.length / 2)];
      stats[id] = {
        id, w: W[id], q: sum(arr.map((x) => x.q)) / arr.length, mid,
        // share of the window spent in each house (from the lagna), to see when a planet moves through an area's houses
        inHouse: (hs) => arr.filter((x) => hs.includes(x.hLagna)).length / arr.length,
        signs: Array.from(new Set(arr.map((x) => x.sign))),
        saturnHouses: id === 'Sa' ? arr.map((x) => x.hMoon) : null,
      };
    }
    let tara = null;
    if (period === 'day') {
      const q = sum(taras.map((x) => TARA_Q[x - 1])) / taras.length;
      const seq = taras.filter((x, i) => i === 0 || x !== taras[i - 1]);
      tara = { q, seq, mid: taras[Math.floor(taras.length / 2)] };
    }
    return { period, t0, t1, stats, tara, times };
  }

  // Dasha part for one area over a window
  function dashaPart(ctx, area, period, t0, t1) {
    const cfg = PERIODS[period], times = sampleTimes(t0, t1, cfg.dashaN), LW = LEVEL_W[period];
    let num = 0, den = 0, mid = null;
    times.forEach((t, i) => {
      const cur = E.periodAt(ctx.chart.dasha, t); if (!cur) return;
      ['maha', 'antar', 'pratyantar'].forEach((lv, k) => {
        const p = cur[lv]; if (!p || !LW[k]) return;
        const rel = area.related.has(p.lord) ? 1 : 0.35;
        num += LW[k] * rel * ctx.quality[p.lord]; den += LW[k] * rel;
        if (i === Math.floor(times.length / 2)) (mid = mid || []).push({ level: lv, planet: p.lord, linked: area.related.has(p.lord), q: ctx.quality[p.lord] });
      });
    });
    return { D: den ? clamp(num / den) : 0, mid: mid || [] };
  }

  // The running periods, with no link to any one area (used for the "overall" card)
  function overallDasha(ctx, period, t0, t1) {
    if (ctx.reduced) return [];
    const cur = E.periodAt(ctx.chart.dasha, (t0 + t1) / 2), LW = LEVEL_W[period];
    if (!cur) return [];
    return ['maha', 'antar', 'pratyantar'].filter((lv, k) => cur[lv] && LW[k]).map((lv) => ({ level: lv, planet: cur[lv].lord, linked: null, q: ctx.quality[cur[lv].lord] }));
  }

  // Score one area in one window. Returns parts, total S and the reasons behind it.
  function scoreArea(ctx, area, ws, dashaOverride) {
    const period = ws.period, [wN, wD, wT] = WEIGHTS[period];
    // Transit part
    let num = 0, den = 0; const contrib = [];
    for (const id of E.PLANETS) {
      const st = ws.stats[id];
      const linked = area.karakas.includes(id) ? 2 : 0;
      const ruler = ctx.reduced ? 0 : (area.lords.has(id) ? 1.5 : 0);
      const moving = ctx.reduced ? 0 : 1.0 * st.inHouse(area.houses);
      const rel = 0.5 + linked + ruler + moving;      // planets that rule, signify or move through the area count more; the rest still count a little
      const wt = st.w * rel;
      num += wt * st.q; den += wt;
      contrib.push({ id, v: wt * st.q, rel, st });
    }
    if (ws.tara) { num += TARA_W * ws.tara.q; den += TARA_W; }
    const T = den ? clamp(num / den) : 0;
    let D = 0, dmid = [];
    if (!ctx.reduced) { const d = dashaOverride || dashaPart(ctx, area, period, ws.t0, ws.t1); D = d.D; dmid = d.mid; }
    const N = area.N;
    const S = ctx.reduced ? T : wN * N + wD * D + wT * T;
    // Top transit reasons by size of effect
    contrib.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    const tr = contrib.slice(0, 3).map((c) => ({ c: 'tr', planet: c.id, hMoon: c.st.mid.hMoon, hLagna: c.st.mid.hLagna, fav: c.st.mid.fav, bav: c.st.mid.bav, linked: c.rel >= 1.5, good: c.st.q > 0.15 ? 1 : c.st.q < -0.15 ? -1 : 0 }));
    return { N, D, T, S, dasha: dmid, tr };
  }

  // Empirical percentile (0..100) of a score within the calibration table of its period
  function percentile(S, table) {
    if (!table) return 50;
    if (S <= table[0]) return 0; if (S >= table[table.length - 1]) return 100;
    for (let i = 1; i < table.length; i++) {
      if (S <= table[i]) { const a = table[i - 1], b = table[i], f = b === a ? 0 : (S - a) / (b - a); return ((i - 1 + f) * 100) / (table.length - 1); }
    }
    return 100;
  }
  const labelOf = (pct) => (pct >= 85 ? 'strong' : pct >= 50 ? 'good' : pct >= 20 ? 'mixed' : 'challenging');
  function calTable(ctx, period, overall) { const c = CAL && CAL[ctx.reduced ? 'reduced' : 'full']; return c ? c[period + (overall ? ':overall' : '')] : null; }

  // ---- sub-slots: best and cautious days / months ---------------------------
  function bestAndCaution(ctx, period, t0, t1) {
    // week and month: score each day with the "day" method; year: each 30-day slot with the "month" method
    const slotPeriod = period === 'year' ? 'month' : 'day';
    const len = slotPeriod === 'day' ? DAY : 30 * DAY;
    const count = period === 'year' ? 12 : Math.round((t1 - t0) / DAY);
    const slots = [];
    for (let i = 0; i < count; i++) {
      const a = period === 'year' ? t0 + i * ((t1 - t0) / 12) : shiftDays(t0, i, ctx.zone);
      const b = period === 'year' ? t0 + (i + 1) * ((t1 - t0) / 12) : shiftDays(t0, i + 1, ctx.zone);
      const ws = windowStats(ctx, slotPeriod, a, b);
      slots.push({ a, b, ws });
    }
    const res = {};
    for (const key of AREA_KEYS) {
      const scored = slots.map((s) => ({ t: s.a, end: s.b, S: scoreArea(ctx, ctx.areas[key], s.ws).S }));
      res[key] = scored;
    }
    return { slotPeriod, slots: res, len };
  }
  function pickBest(list, k) {
    const sorted = list.slice().sort((a, b) => b.S - a.S);
    const best = sorted.slice(0, k), caution = sorted.slice(-k).reverse();
    // never list the same slot as both best and cautious, and keep results in date order
    const bt = new Set(best.map((x) => x.t));
    return { best: best.sort((a, b) => a.t - b.t), caution: caution.filter((x) => !bt.has(x.t)).sort((a, b) => a.t - b.t) };
  }

  // ---- sign changes (ingresses) in a window ---------------------------------
  function ingresses(ctx, t0, t1, ids, stepMs) {
    const out = [];
    for (const id of ids) {
      let prevT = t0, prevSign = signOf(E.lonsAt(t0)[id]);
      for (let t = t0 + stepMs; ; t += stepMs) {
        const tt = Math.min(t, t1);
        const sg = signOf(E.lonsAt(tt)[id]);
        if (sg !== prevSign) {
          // find the moment to within a minute
          let lo = prevT, hi = tt;
          while (hi - lo > 60000) { const mid = (lo + hi) / 2; if (signOf(E.lonsAt(mid)[id]) === prevSign) lo = mid; else hi = mid; }
          const now = planetNow(ctx, id, E.lonsAt(hi)[id]);
          out.push({ planet: id, atMs: hi, from: prevSign, to: sg, hMoon: now.hMoon, hLagna: now.hLagna, fav: now.fav, bav: now.bav });
        }
        prevT = tt; prevSign = sg;
        if (tt >= t1) break;
      }
    }
    return out.sort((a, b) => a.atMs - b.atMs);
  }

  // ---- panchang of one day --------------------------------------------------
  function dayInfo(ctx, dayStart) {
    const chart = ctx.chart, next = shiftDays(dayStart, 1, ctx.zone);
    const weekday = localWeekday(dayStart, ctx.zone);
    const sun = E.sunTimes(dayStart, chart.input.lat, chart.input.lon);
    const out = { start: dayStart, end: next, weekday, weekdayLord: E.WEEKDAY_LORD[weekday], sunrise: sun.rise, sunset: sun.set, rahu: null, yama: null, gulika: null, panchang: null };
    // The rise/set search can land on the next day near the poles; only trust times that fall in this local day (+ a little)
    if (sun.rise !== null && sun.set !== null && sun.set > sun.rise && sun.rise >= dayStart - 3 * 3600000 && sun.rise < next + 3 * 3600000) {
      const seg = (sun.set - sun.rise) / 8, at = (k) => ({ from: sun.rise + (k - 1) * seg, to: sun.rise + k * seg });
      out.rahu = at(RAHU[weekday]); out.yama = at(YAMA[weekday]); out.gulika = at(GULIKA[weekday]);
    }
    const t = out.sunrise !== null && out.sunrise >= dayStart - 3 * 3600000 ? out.sunrise : dayStart + DAY / 2;
    const l = lonsCached(ctx, t);
    const pc = E.panchangAt(l.Su, l.Mo);
    out.panchang = { tithi: pc.tithi, paksha: pc.paksha, tithiInPaksha: pc.tithiInPaksha, yoga: pc.yoga, karana: pc.karana, moonNak: Math.floor(l.Mo / E.NAK_LEN), moonPada: Math.floor((l.Mo - Math.floor(l.Mo / E.NAK_LEN) * E.NAK_LEN) / (E.NAK_LEN / 4)) + 1, moonSign: signOf(l.Mo), at: t };
    return out;
  }

  // ---- Saturn flags (Sade Sati, Ashtama Shani) in a window ------------------
  function saturnFlags(ws) {
    const hs = ws.stats.Sa.saturnHouses || [], n = hs.length || 1, f = (arr) => hs.filter((h) => arr.includes(h)).length / n;
    const flags = [];
    const rising = f([12]), peak = f([1]), setting = f([2]), ash = f([8]), dhaiya = f([4]);
    if (rising) flags.push({ c: 'sade', phase: 'rising', share: rising });
    if (peak) flags.push({ c: 'sade', phase: 'peak', share: peak });
    if (setting) flags.push({ c: 'sade', phase: 'setting', share: setting });
    if (ash) flags.push({ c: 'ashtama', share: ash });
    if (dhaiya) flags.push({ c: 'kantaka', share: dhaiya });
    return flags;
  }

  // ---- the public call ------------------------------------------------------
  // period: 'day' | 'week' | 'month' | 'year'; offset: 0 = starting today, 1 = the next window of the same length.
  function periodOutlook(ctx, period, nowMs, offset, opts) {
    const cfg = PERIODS[period]; if (!cfg) throw new Error('bad period');
    offset = offset || 0;
    const day0 = localDayStart(nowMs, ctx.zone);
    const start = shiftDays(day0, offset * cfg.days, ctx.zone);
    const end = shiftDays(start, cfg.days, ctx.zone);
    const ws = windowStats(ctx, period, start, end);
    const tablePct = calTable(ctx, period, false), tableAll = calTable(ctx, period, true);
    const areas = {}; const raw = [];
    for (const key of AREA_KEYS) {
      const s = scoreArea(ctx, ctx.areas[key], ws);
      const pct = percentile(s.S, tablePct);
      areas[key] = { key, S: s.S, parts: { N: s.N, D: s.D, T: s.T }, pct, label: labelOf(pct), natalLabel: R.labelFor(ctx.areas[key].natalScore), sav: ctx.areas[key].savMean, dasha: s.dasha, tr: s.tr, best: [], caution: [] };
      raw.push(s.S);
    }
    const meanS = sum(raw) / raw.length, pctAll = percentile(meanS, tableAll);
    const topTr = AREA_KEYS.map((k) => areas[k]).reduce((acc, a) => { a.tr.forEach((x) => { if (!acc.some((y) => y.planet === x.planet)) acc.push(x); }); return acc; }, []).slice(0, 3);
    areas.overall = { key: 'overall', S: meanS, parts: { N: sum(AREA_KEYS.map((k) => areas[k].parts.N)) / 9, D: sum(AREA_KEYS.map((k) => areas[k].parts.D)) / 9, T: sum(AREA_KEYS.map((k) => areas[k].parts.T)) / 9 }, pct: pctAll, label: labelOf(pctAll), natalLabel: null, dasha: overallDasha(ctx, period, start, end), tr: topTr, best: [], caution: [] };

    const result = { period, offset, start, end, reduced: ctx.reduced, areas, flags: saturnFlags(ws), tara: ws.tara, events: [], day: null };
    if (opts && opts.lite) return result;                      // scores only (used to calibrate the labels)
    if (period === 'day') result.day = dayInfo(ctx, start);
    if (period !== 'day') {
      const ba = bestAndCaution(ctx, period, start, end);
      const slotTable = (key) => ba.slots[key];
      for (const key of AREA_KEYS) { const p = pickBest(slotTable(key), 3); areas[key].best = p.best; areas[key].caution = p.caution; }
      const overallList = ba.slots[AREA_KEYS[0]].map((s, i) => ({ t: s.t, end: s.end, S: sum(AREA_KEYS.map((k) => ba.slots[k][i].S)) / AREA_KEYS.length }));
      const po = pickBest(overallList, 3); areas.overall.best = po.best; areas.overall.caution = po.caution;
      result.slotPeriod = ba.slotPeriod;
    }
    const ids = period === 'year' ? ['Ju', 'Sa', 'Ra', 'Ke', 'Ma'] : period === 'month' ? ['Su', 'Ma', 'Me', 'Ve', 'Ju', 'Sa', 'Ra', 'Ke'] : period === 'week' ? ['Su', 'Ma', 'Me', 'Ve', 'Ju', 'Sa'] : [];
    if (ids.length) result.events = ingresses(ctx, start, end, ids, period === 'year' ? 2 * DAY : DAY);
    return result;
  }

  function all(chart, o) {
    const ctx = makeCtx(chart, o), now = o.nowMs;
    const out = { ctx, now, reduced: ctx.reduced };
    for (const p of Object.keys(PERIODS)) out[p] = periodOutlook(ctx, p, now, 0);
    return out;
  }

  return { AREA_KEYS, PERIODS, WEIGHTS, LEVEL_W, PLANET_W, GOCHARA_FAV, TARA_Q, makeCtx, periodOutlook, all, scoreArea, windowStats, planetNow, percentile, labelOf, localDayStart, shiftDays, localWeekday, dayInfo, ingresses, natalQuality, sampleTimes };
});
