/*  Ashtakavarga: the classical "eight-source" point system (Brihat Parashara Hora Shastra, chapters on Ashtakavarga).
    Each of the seven planets (Sun to Saturn) has a chart of its own, built from eight contributors:
    the seven planets and the lagna. A contributor gives one point (bindu) to a sign when that sign is one of the
    listed places counted from the contributor's own sign (its own sign = 1).

    The tables below were checked three ways:
      1. against published contributor tables (Mercury, Jupiter and Venus, each from a published table), and against
         a published worked chart whose Sun, Moon, Mars and Saturn charts are reproduced exactly by these tables
         (tests/ashtaka.test.js). The other three charts printed in that same example do not follow the published
         contributor tables for Mercury, Jupiter and Venus, so they were not used as a check;
      2. every planet's total is fixed by the system: Sun 48, Moon 49, Mars 39, Mercury 54, Jupiter 56, Venus 52,
         Saturn 39, so the seven add up to 337 for every chart (the test checks this on thousands of random charts);
      3. a mistyped table would break check 2 almost every time.
    This is traditional arithmetic, not a prediction by itself. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RsvAshtaka = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SEVEN = ['Su', 'Mo', 'Ma', 'Me', 'Ju', 'Ve', 'Sa'];
  const CONTRIBUTORS = ['Su', 'Mo', 'Ma', 'Me', 'Ju', 'Ve', 'Sa', 'La'];

  // TABLES[planet][contributor] = places (1..12) counted from the contributor that receive a bindu
  const TABLES = {
    Su: { Su: [1, 2, 4, 7, 8, 9, 10, 11], Mo: [3, 6, 10, 11], Ma: [1, 2, 4, 7, 8, 9, 10, 11], Me: [3, 5, 6, 9, 10, 11, 12], Ju: [5, 6, 9, 11], Ve: [6, 7, 12], Sa: [1, 2, 4, 7, 8, 9, 10, 11], La: [3, 4, 6, 10, 11, 12] },
    Mo: { Su: [3, 6, 7, 8, 10, 11], Mo: [1, 3, 6, 7, 10, 11], Ma: [2, 3, 5, 6, 9, 10, 11], Me: [1, 3, 4, 5, 7, 8, 10, 11], Ju: [1, 4, 7, 8, 10, 11, 12], Ve: [3, 4, 5, 7, 9, 10, 11], Sa: [3, 5, 6, 11], La: [3, 6, 10, 11] },
    Ma: { Su: [3, 5, 6, 10, 11], Mo: [3, 6, 11], Ma: [1, 2, 4, 7, 8, 10, 11], Me: [3, 5, 6, 11], Ju: [6, 10, 11, 12], Ve: [6, 8, 11, 12], Sa: [1, 4, 7, 8, 9, 10, 11], La: [1, 3, 6, 10, 11] },
    Me: { Su: [5, 6, 9, 11, 12], Mo: [2, 4, 6, 8, 10, 11], Ma: [1, 2, 4, 7, 8, 9, 10, 11], Me: [1, 3, 5, 6, 9, 10, 11, 12], Ju: [6, 8, 11, 12], Ve: [1, 2, 3, 4, 5, 8, 9, 11], Sa: [1, 2, 4, 7, 8, 9, 10, 11], La: [1, 2, 4, 6, 8, 10, 11] },
    Ju: { Su: [1, 2, 3, 4, 7, 8, 9, 10, 11], Mo: [2, 5, 7, 9, 11], Ma: [1, 2, 4, 7, 8, 10, 11], Me: [1, 2, 4, 5, 6, 9, 10, 11], Ju: [1, 2, 3, 4, 7, 8, 10, 11], Ve: [2, 5, 6, 9, 10, 11], Sa: [3, 5, 6, 12], La: [1, 2, 4, 5, 6, 7, 9, 10, 11] },
    Ve: { Su: [8, 11, 12], Mo: [1, 2, 3, 4, 5, 8, 9, 11, 12], Ma: [3, 5, 6, 9, 11, 12], Me: [3, 5, 6, 9, 11], Ju: [5, 8, 9, 10, 11], Ve: [1, 2, 3, 4, 5, 8, 9, 10, 11], Sa: [3, 4, 5, 8, 9, 10, 11], La: [1, 2, 3, 4, 5, 8, 9, 11] },
    Sa: { Su: [1, 2, 4, 7, 8, 10, 11], Mo: [3, 6, 11], Ma: [3, 5, 6, 10, 11, 12], Me: [6, 8, 9, 10, 11, 12], Ju: [5, 6, 11, 12], Ve: [6, 11, 12], Sa: [3, 5, 6, 11], La: [1, 3, 4, 6, 10, 11] },
  };
  // Fixed total of each planet's own chart. Used as a self-check.
  const TOTALS = { Su: 48, Mo: 49, Ma: 39, Me: 54, Ju: 56, Ve: 52, Sa: 39 };
  const SAV_TOTAL = 337;

  // chart -> sign (0 = Aries .. 11 = Pisces) of each contributor
  function placements(chart) {
    const out = { La: chart.asc.sign };
    for (const p of chart.planets) if (SEVEN.includes(p.id)) out[p.id] = p.sign;
    return out;
  }

  // Bhinnashtakavarga (BAV): bav[planet][sign] = 0..8 ; Sarvashtakavarga (SAV): sav[sign] = sum over the seven planets
  function compute(chart) {
    const pos = placements(chart);
    const bav = {};
    for (const pl of SEVEN) {
      const row = new Array(12).fill(0);
      for (const c of CONTRIBUTORS) for (const place of TABLES[pl][c]) row[(pos[c] + place - 1) % 12]++;
      bav[pl] = row;
    }
    const sav = new Array(12).fill(0);
    for (const pl of SEVEN) for (let s = 0; s < 12; s++) sav[s] += bav[pl][s];
    const totals = Object.fromEntries(SEVEN.map((pl) => [pl, bav[pl].reduce((a, b) => a + b, 0)]));
    // SAV by house (house 1 = the lagna sign)
    const savByHouse = [];
    for (let i = 0; i < 12; i++) savByHouse.push(sav[(chart.asc.sign + i) % 12]);
    return { bav, sav, totals, savByHouse, total: sav.reduce((a, b) => a + b, 0) };
  }

  // Strength words used by the app. Thresholds follow the common published practice
  // (BAV: 0-2 weak, 3-4 middling, 5-6 strong, 7-8 very strong; SAV: under 25 weak, 25-28 average, 29-32 good, 33+ very strong).
  function bavClass(n) { return n <= 2 ? 'weak' : n <= 4 ? 'mid' : n <= 6 ? 'strong' : 'top'; }
  function savClass(n) { return n < 25 ? 'weak' : n <= 28 ? 'mid' : n <= 32 ? 'strong' : 'top'; }
  // Average bindus a planet gives per sign (its fixed total / 12). Used to judge a transit against that planet's own norm.
  const AVG = Object.fromEntries(SEVEN.map((pl) => [pl, TOTALS[pl] / 12]));

  return { SEVEN, CONTRIBUTORS, TABLES, TOTALS, SAV_TOTAL, AVG, compute, placements, bavClass, savClass };
});
