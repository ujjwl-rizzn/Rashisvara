/*  Rashisvara engine: sidereal (Lahiri) Vedic calculations.
    Planet positions come from astronomy-engine by Don Cross (MIT licence),
    which is copied into assets/vendor so the page never loads outside code.
    Everything in this file is plain maths: no network, no AI, no guessing. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('astronomy-engine'));
  else root.RsvEngine = factory(root.Astronomy);
})(typeof self !== 'undefined' ? self : this, function (A) {
  'use strict';

  const DEG = Math.PI / 180;
  const DAY_MS = 86400000;
  const YEAR_MS = 365.25 * DAY_MS;
  const norm360 = (x) => ((x % 360) + 360) % 360;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const PLANETS = ['Su', 'Mo', 'Ma', 'Me', 'Ju', 'Ve', 'Sa', 'Ra', 'Ke'];
  const SEVEN = ['Su', 'Mo', 'Ma', 'Me', 'Ju', 'Ve', 'Sa'];
  const BODIES = {
    Su: A.Body.Sun, Mo: A.Body.Moon, Ma: A.Body.Mars, Me: A.Body.Mercury,
    Ju: A.Body.Jupiter, Ve: A.Body.Venus, Sa: A.Body.Saturn,
  };
  const SIGN_LORD = ['Ma', 'Ve', 'Me', 'Mo', 'Su', 'Me', 'Ve', 'Ma', 'Ju', 'Sa', 'Sa', 'Ju'];
  const NAK_LEN = 360 / 27;
  const DASHA_ORDER = ['Ke', 'Ve', 'Su', 'Mo', 'Ma', 'Ra', 'Ju', 'Sa', 'Me'];
  const DASHA_YEARS = { Ke: 7, Ve: 20, Su: 6, Mo: 10, Ma: 7, Ra: 18, Ju: 16, Sa: 19, Me: 17 };
  const WEEKDAY_LORD = ['Su', 'Mo', 'Ma', 'Me', 'Ju', 'Ve', 'Sa'];

  // Dignity tables (classical Parashari values)
  const EXALT = { Su: [0, 10], Mo: [1, 3], Ma: [9, 28], Me: [5, 15], Ju: [3, 5], Ve: [11, 27], Sa: [6, 20] };
  const DEBIL = { Su: 6, Mo: 7, Ma: 3, Me: 11, Ju: 9, Ve: 5, Sa: 0 };
  const OWN = { Su: [4], Mo: [3], Ma: [0, 7], Me: [2, 5], Ju: [8, 11], Ve: [1, 6], Sa: [9, 10] };
  // [sign, fromDeg, toDeg]
  const MOOLA = { Su: [4, 0, 20], Mo: [1, 3, 30], Ma: [0, 0, 12], Me: [5, 15, 20], Ju: [8, 0, 10], Ve: [6, 0, 15], Sa: [10, 0, 20] };
  // Natural friendships. Anyone not listed is neutral.
  const FRIENDS = {
    Su: { f: ['Mo', 'Ma', 'Ju'], e: ['Ve', 'Sa'] },
    Mo: { f: ['Su', 'Me'], e: [] },
    Ma: { f: ['Su', 'Mo', 'Ju'], e: ['Me'] },
    Me: { f: ['Su', 'Ve'], e: ['Mo'] },
    Ju: { f: ['Su', 'Mo', 'Ma'], e: ['Me', 'Ve'] },
    Ve: { f: ['Me', 'Sa'], e: ['Su', 'Mo'] },
    Sa: { f: ['Me', 'Ve'], e: ['Su', 'Mo', 'Ma'] },
  };
  // Combustion orbs in degrees from the Sun
  const COMBUST_ORB = { Mo: 12, Ma: 17, Me: 14, Ju: 11, Ve: 10, Sa: 15 };
  const COMBUST_ORB_RETRO = { Me: 12, Ve: 8 };

  // ---------------------------------------------------------------------------
  // Ayanamsa (Lahiri / Chitrapaksha, mean)
  // Reference value 23 deg 15' 00.66" at 1956-03-21 (JD 2435553.5), then moved
  // forward by general precession. This is the Indian government standard.
  // ---------------------------------------------------------------------------
  const LAHIRI_JD0 = 2435553.5;
  const LAHIRI_AYAN0 = 23.250182778 - 0.004658035;

  // General precession in longitude since J2000, arcseconds. T = Julian centuries from J2000 (TT).
  function precessionArcsec(T) {
    return 5028.796195 * T + 1.1054348 * T * T + 0.00007964 * T * T * T
      - 0.000023857 * T * T * T * T - 0.0000000383 * T * T * T * T * T;
  }
  function ayanamsa(time) {
    const T = time.tt / 36525;
    const T0 = (LAHIRI_JD0 - 2451545.0) / 36525;
    return LAHIRI_AYAN0 + (precessionArcsec(T) - precessionArcsec(T0)) / 3600;
  }

  // ---------------------------------------------------------------------------
  // Positions
  // ---------------------------------------------------------------------------
  // Nutation in longitude and obliquity, degrees (Meeus, chapter 22, accuracy about 0.5").
  // A fixed-star (sidereal) zodiac does not wobble with nutation, so it is removed below.
  function nutation(time) {
    const T = time.tt / 36525;
    const om = (125.04452 - 1934.136261 * T) * DEG;
    const L = (280.4665 + 36000.7698 * T) * DEG;
    const Lm = (218.3165 + 481267.8813 * T) * DEG;
    return {
      dpsi: (-17.20 * Math.sin(om) - 1.32 * Math.sin(2 * L) - 0.23 * Math.sin(2 * Lm) + 0.21 * Math.sin(2 * om)) / 3600,
      deps: (9.20 * Math.cos(om) + 0.57 * Math.cos(2 * L) + 0.10 * Math.cos(2 * Lm) - 0.09 * Math.cos(2 * om)) / 3600,
    };
  }
  // Longitude of a body on the mean ecliptic of date, degrees.
  // astronomy-engine already returns the true ecliptic of date, so only nutation is taken out.
  function tropicalLon(body, time) {
    const v = A.GeoVector(body, time, true);        // light-time and aberration included
    return norm360(A.Ecliptic(v).elon - nutation(time).dpsi);
  }
  function siderealLon(body, time) {
    return norm360(tropicalLon(body, time) - ayanamsa(time));
  }
  // Mean lunar node (Rahu), tropical longitude of date (Meeus).
  function meanNodeTropical(time) {
    const T = time.tt / 36525;
    return norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + T * T * T / 467441 - T * T * T * T / 60616000);
  }
  function rahuLon(time) { return norm360(meanNodeTropical(time) - ayanamsa(time)); }

  function meanObliquityDeg(T) {
    return (84381.406 - 46.836769 * T - 0.0001831 * T * T + 0.0020034 * T * T * T
      - 0.000000576 * T * T * T * T - 0.0000000434 * T * T * T * T * T) / 3600;
  }
  // Tropical ascendant for a place. lat/lon in degrees, east longitude positive.
  function ascendantTropical(time, lat, lon) {
    const gast = A.SiderealTime(time);               // Greenwich apparent sidereal time, hours
    const ramc = norm360(gast * 15 + lon) * DEG;
    const n = nutation(time);
    const eps = (meanObliquityDeg(time.tt / 36525) + n.deps) * DEG;   // true obliquity
    const phi = lat * DEG;
    const y = Math.cos(ramc);
    const x = -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps));
    // true ascendant of date, then back to the mean equinox so it matches the planets
    return norm360(Math.atan2(y, x) / DEG - n.dpsi);
  }

  function lonOf(id, time) {
    if (id === 'Ra') return rahuLon(time);
    if (id === 'Ke') return norm360(rahuLon(time) + 180);
    return siderealLon(BODIES[id], time);
  }
  // Speed in degrees per day (negative = retrograde), centred difference over one day.
  function speedOf(id, ms) {
    const a = lonOf(id, A.MakeTime(new Date(ms - DAY_MS / 2)));
    const b = lonOf(id, A.MakeTime(new Date(ms + DAY_MS / 2)));
    let d = b - a;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  // ---------------------------------------------------------------------------
  // Signs, nakshatras, vargas, dignity
  // ---------------------------------------------------------------------------
  function place(id, lon) {
    const sign = Math.floor(lon / 30);
    const nak = Math.floor(lon / NAK_LEN);
    return {
      id, lon, sign,
      deg: lon - sign * 30,
      nak,
      pada: Math.floor((lon - nak * NAK_LEN) / (NAK_LEN / 4)) + 1,
      nakLord: DASHA_ORDER[nak % 9],
    };
  }

  // Sign (0-11) of a longitude in a divisional chart. n = 1, 3, 7, 9, 10, 12.
  function vargaSign(lon, n) {
    const s = Math.floor(lon / 30);
    const d = lon - s * 30;
    switch (n) {
      case 1: return s;
      case 3: return (s + 4 * Math.floor(d / 10)) % 12;
      case 7: { const k = Math.floor(d / (30 / 7)); const start = s % 2 === 0 ? s : (s + 6) % 12; return (start + k) % 12; }
      case 9: return Math.floor(lon / (30 / 9)) % 12;
      case 10: { const k = Math.floor(d / 3); const start = s % 2 === 0 ? s : (s + 8) % 12; return (start + k) % 12; }
      case 12: return (s + Math.floor(d / 2.5)) % 12;
      default: throw new Error('Unsupported varga D' + n);
    }
  }
  const VARGAS = [1, 3, 7, 9, 10, 12];

  function dignity(id, sign, deg) {
    if (!EXALT[id]) return null;                     // Rahu and Ketu: schools differ, so none is claimed
    if (EXALT[id][0] === sign) return 'exalted';
    if (DEBIL[id] === sign) return 'debilitated';
    const m = MOOLA[id];
    if (m[0] === sign && deg >= m[1] && deg < m[2]) return 'moolatrikona';
    if (OWN[id].includes(sign)) return 'own';
    const lord = SIGN_LORD[sign];
    if (FRIENDS[id].f.includes(lord)) return 'friend';
    if (FRIENDS[id].e.includes(lord)) return 'enemy';
    return 'neutral';
  }

  // ---------------------------------------------------------------------------
  // Vimshottari dasha (year = 365.25 days)
  // ---------------------------------------------------------------------------
  function dashaMaha(birthMs, moonLon) {
    const nak = Math.floor(moonLon / NAK_LEN);
    const frac = (moonLon - nak * NAK_LEN) / NAK_LEN;    // part of the nakshatra already passed
    const first = DASHA_ORDER[nak % 9];
    let t = birthMs - DASHA_YEARS[first] * frac * YEAR_MS;
    const list = [];
    for (let i = 0; i < 18; i++) {
      const lord = DASHA_ORDER[(nak % 9 + i) % 9];
      const end = t + DASHA_YEARS[lord] * YEAR_MS;
      list.push({ lord, start: t, end });
      t = end;
    }
    return { balance: { lord: first, years: DASHA_YEARS[first] * (1 - frac) }, list };
  }
  // Split any period into its nine sub-periods (antardasha, pratyantar...).
  function subPeriods(parent) {
    const total = parent.end - parent.start;
    const idx = DASHA_ORDER.indexOf(parent.lord);
    const out = [];
    let t = parent.start;
    for (let i = 0; i < 9; i++) {
      const lord = DASHA_ORDER[(idx + i) % 9];
      const len = total * DASHA_YEARS[lord] / 120;
      out.push({ lord, start: t, end: t + len });
      t += len;
    }
    return out;
  }
  function periodAt(maha, ms) {
    const m = maha.list.find((p) => ms >= p.start && ms < p.end);
    if (!m) return null;
    const a = subPeriods(m).find((p) => ms >= p.start && ms < p.end);
    const pr = a ? subPeriods(a).find((p) => ms >= p.start && ms < p.end) : null;
    return { maha: m, antar: a, pratyantar: pr };
  }

  // ---------------------------------------------------------------------------
  // Panchang
  // ---------------------------------------------------------------------------
  function panchangAt(sunLon, moonLon) {
    const elong = norm360(moonLon - sunLon);
    const tithiIdx = Math.floor(elong / 12);                  // 0..29
    const kIdx = Math.floor(elong / 6);                       // 0..59
    let karana;
    if (kIdx === 0) karana = 'Kimstughna';
    else if (kIdx === 57) karana = 'Shakuni';
    else if (kIdx === 58) karana = 'Chatushpada';
    else if (kIdx === 59) karana = 'Naga';
    else karana = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti'][(kIdx - 1) % 7];
    return {
      elongation: elong,
      tithi: tithiIdx + 1,                                     // 1..30 (15 = Purnima, 30 = Amavasya)
      paksha: tithiIdx < 15 ? 'shukla' : 'krishna',
      tithiInPaksha: (tithiIdx % 15) + 1,
      yoga: Math.floor(norm360(sunLon + moonLon) / NAK_LEN) + 1,   // 1..27
      karana,
      karanaIndex: kIdx,
    };
  }
  function sunTimes(anchorMs, lat, lon) {
    const obs = new A.Observer(lat, lon, 0);
    const from = new Date(anchorMs);
    const rise = A.SearchRiseSet(A.Body.Sun, obs, +1, from, 1.5);
    const set = A.SearchRiseSet(A.Body.Sun, obs, -1, from, 1.5);
    return { rise: rise ? rise.date.getTime() : null, set: set ? set.date.getTime() : null };
  }

  // ---------------------------------------------------------------------------
  // Main entry: build a full birth chart.
  // input: { utcMs, lat, lon, tzOffsetSec }
  // ---------------------------------------------------------------------------
  function computeChart(input) {
    const time = A.MakeTime(new Date(input.utcMs));
    const ayan = ayanamsa(time);
    const ascLon = norm360(ascendantTropical(time, input.lat, input.lon) - ayan);
    const asc = Object.assign(place('As', ascLon), { vargas: {} });
    for (const n of VARGAS) asc.vargas[n] = vargaSign(ascLon, n);

    const sunLon = lonOf('Su', time);
    const planets = PLANETS.map((id) => {
      const lon = lonOf(id, time);
      const p = place(id, lon);
      const speed = id === 'Ra' || id === 'Ke' ? -0.0529539 : speedOf(id, input.utcMs);
      p.speed = speed;
      p.retro = speed < 0;
      p.house = ((p.sign - asc.sign + 12) % 12) + 1;
      p.dignity = dignity(id, p.sign, p.deg);
      p.vargas = {};
      for (const n of VARGAS) p.vargas[n] = vargaSign(lon, n);
      if (COMBUST_ORB[id]) {
        let d = Math.abs(lon - sunLon);
        if (d > 180) d = 360 - d;
        const orb = (p.retro && COMBUST_ORB_RETRO[id]) || COMBUST_ORB[id];
        p.combust = d <= orb;
        p.sunDistance = d;
      }
      return p;
    });
    const byId = Object.fromEntries(planets.map((p) => [p.id, p]));

    const houses = [];
    for (let i = 0; i < 12; i++) {
      const sign = (asc.sign + i) % 12;
      houses.push({ house: i + 1, sign, lord: SIGN_LORD[sign], planets: planets.filter((p) => p.sign === sign).map((p) => p.id) });
    }

    // Jaimini seven karakas: highest degree inside the sign = Atmakaraka, and so on.
    const karakaNames = ['AK', 'AmK', 'BK', 'MK', 'PK', 'GK', 'DK'];
    const karakas = {};
    SEVEN.map((id) => ({ id, d: byId[id].deg })).sort((a, b) => b.d - a.d)
      .forEach((x, i) => { karakas[karakaNames[i]] = x.id; });

    // Panchang at birth. The Vedic day starts at sunrise, so a birth before sunrise belongs to the day before.
    const off = (input.tzOffsetSec || 0) * 1000;
    const local = new Date(input.utcMs + off);
    const ly = local.getUTCFullYear(), lm = local.getUTCMonth(), ld = local.getUTCDate();
    const localMidnightUtc = Date.UTC(ly, lm, ld) - off;
    const sun = sunTimes(localMidnightUtc, input.lat, input.lon);
    let weekday = new Date(Date.UTC(ly, lm, ld)).getUTCDay();
    if (sun.rise !== null && input.utcMs < sun.rise) weekday = (weekday + 6) % 7;
    const panchang = Object.assign(panchangAt(sunLon, byId.Mo.lon), {
      weekday, weekdayLord: WEEKDAY_LORD[weekday],
      sunrise: sun.rise, sunset: sun.set,
      moonNak: byId.Mo.nak, moonPada: byId.Mo.pada,
    });

    return {
      version: 1,
      input: { utcMs: input.utcMs, lat: input.lat, lon: input.lon, tzOffsetSec: input.tzOffsetSec || 0 },
      ayanamsaName: 'Lahiri',
      ayanamsa: ayan,
      asc, planets, houses, karakas, panchang,
      dasha: dashaMaha(input.utcMs, byId.Mo.lon),
    };
  }

  // Planet positions at any moment (for transits / gochar). No birth place needed.
  function positionsAt(utcMs) {
    const time = A.MakeTime(new Date(utcMs));
    return PLANETS.map((id) => {
      const p = place(id, lonOf(id, time));
      p.retro = id === 'Ra' || id === 'Ke' ? true : speedOf(id, utcMs) < 0;
      return p;
    });
  }

  // Sidereal longitudes of the nine planets at any moment, without the speed/retrograde work.
  // This is what the period outlooks sample many times, so it is kept light.
  function lonsAt(utcMs) {
    const time = A.MakeTime(new Date(utcMs));
    const out = {};
    for (const id of PLANETS) out[id] = lonOf(id, time);
    return out;
  }

  // Current transits against a natal chart.
  function transits(chart, nowMs) {
    const now = positionsAt(nowMs);
    const byId = Object.fromEntries(now.map((p) => [p.id, p]));
    const moonSign = chart.planets.find((p) => p.id === 'Mo').sign;
    const fromMoon = (id) => ((byId[id].sign - moonSign + 12) % 12) + 1;
    const fromLagna = (id) => ((byId[id].sign - chart.asc.sign + 12) % 12) + 1;
    const satFromMoon = fromMoon('Sa');
    let sadeSati = null;
    if (satFromMoon === 12) sadeSati = 'rising';
    else if (satFromMoon === 1) sadeSati = 'peak';
    else if (satFromMoon === 2) sadeSati = 'setting';
    return {
      nowMs, planets: now,
      sadeSati,
      ashtamaShani: satFromMoon === 8,
      saturnFromMoon: satFromMoon,
      jupiterFromMoon: fromMoon('Ju'),
      fromMoon: Object.fromEntries(PLANETS.map((id) => [id, fromMoon(id)])),
      fromLagna: Object.fromEntries(PLANETS.map((id) => [id, fromLagna(id)])),
      period: periodAt(chart.dasha, nowMs),
    };
  }

  function dms(deg) {
    let s = Math.round(deg * 3600);
    const d = Math.floor(s / 3600); s -= d * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    return d + '°' + String(m).padStart(2, '0') + "'" + String(s).padStart(2, '0') + '"';
  }

  return {
    PLANETS, SEVEN, SIGN_LORD, NAK_LEN, DASHA_ORDER, DASHA_YEARS, WEEKDAY_LORD, FRIENDS, EXALT, DEBIL, OWN, VARGAS,
    ayanamsa, lonOf, vargaSign, dignity, place, subPeriods, periodAt, dashaMaha, panchangAt,
    computeChart, positionsAt, lonsAt, sunTimes, transits, dms, norm360,
    _astro: A,
  };
});
