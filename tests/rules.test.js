// Rule checks on hand-built charts where the right answer is known from the textbook definition.
const assert = require('assert');
const E = require('../js/engine.js'), R = require('../js/rules.js');

// Build a chart from sign placements. pl = { Su: [sign, deg], ... } (sign 0 = Aries). Unlisted planets go to Aries 15.
function mk(asc, pl, o = {}) {
  const planets = E.PLANETS.map((id) => {
    const [sign, deg] = pl[id] || [0, 15];
    const p = E.place(id, sign * 30 + deg);
    p.retro = false; p.house = ((sign - asc + 12) % 12) + 1; p.dignity = E.dignity(id, sign, deg); p.combust = !!(o.combust && o.combust.includes(id));
    p.vargas = {}; E.VARGAS.forEach((n) => { p.vargas[n] = E.vargaSign(p.lon, n); }); return p;
  });
  const houses = []; for (let i = 0; i < 12; i++) { const sign = (asc + i) % 12; houses.push({ house: i + 1, sign, lord: E.SIGN_LORD[sign], planets: planets.filter((p) => p.sign === sign).map((p) => p.id) }); }
  const ascP = E.place('As', asc * 30 + 10); ascP.vargas = {}; E.VARGAS.forEach((n) => { ascP.vargas[n] = E.vargaSign(ascP.lon, n); });
  return { asc: ascP, planets, houses, panchang: { elongation: o.elong === undefined ? 120 : o.elong }, dasha: { list: [] } };
}
const ids = (c) => R.yogas(c).map((y) => y.id);
const has = (c, id) => ids(c).includes(id);
const get = (c, id) => R.yogas(c).find((y) => y.id === id);
// A quiet background: planets spread so that few accidental yogas appear
const BG = { Su: [8, 5], Mo: [5, 5], Ma: [8, 20], Me: [8, 25], Ju: [11, 3], Ve: [2, 10], Sa: [4, 10], Ra: [1, 10], Ke: [7, 10] };
const withPl = (extra) => Object.assign({}, BG, extra);

// Gajakesari: Jupiter in a kendra from the Moon
assert(has(mk(0, withPl({ Mo: [3, 10], Ju: [6, 10] })), 'gajakesari'));
assert(has(mk(0, withPl({ Mo: [3, 10], Ju: [3, 20] })), 'gajakesari'));                // same sign counts (1st from Moon)
assert(!has(mk(0, withPl({ Mo: [3, 10], Ju: [4, 10] })), 'gajakesari'));               // 2nd from Moon does not
// Budhaditya
assert(has(mk(0, withPl({ Su: [4, 5], Me: [4, 20] })), 'budhaditya')); assert(!has(mk(0, withPl({ Su: [4, 5], Me: [5, 2] })), 'budhaditya'));
// Pancha Mahapurusha needs own/exalted AND a kendra from the lagna
assert(has(mk(0, withPl({ Ma: [0, 10] })), 'ruchaka'));                                // Mars in Aries, house 1
assert(!has(mk(0, withPl({ Ma: [7, 10] })), 'ruchaka'));                                // Mars in Scorpio is house 8: own but not kendra
assert(has(mk(0, withPl({ Sa: [6, 10] })), 'shasha'));                                  // Saturn exalted in Libra, house 7
assert(has(mk(0, withPl({ Sa: [9, 10] })), 'shasha'));                                  // Saturn own in Capricorn, house 10
assert(has(mk(0, withPl({ Ju: [3, 10] })), 'hamsa'));                                   // Jupiter exalted in Cancer, house 4
assert(has(mk(0, withPl({ Ve: [11, 10] })), 'malavya') === false);                      // Pisces is house 12: not kendra
assert(has(mk(3, withPl({ Ve: [11, 10] })), 'malavya') === false);                      // Cancer lagna: Pisces is house 9
assert(has(mk(11, withPl({ Ve: [11, 10] })), 'malavya'));                               // Pisces lagna: house 1
assert(has(mk(0, withPl({ Me: [5, 10] })), 'bhadra') === false);                        // Virgo is house 6 from Aries
assert(has(mk(2, withPl({ Me: [2, 10] })), 'bhadra'));
// Moon-based: Sunapha, Anapha, Durudhara, Kemadruma
assert(has(mk(0, withPl({ Mo: [5, 10], Ma: [6, 10], Sa: [4, 28], Ju: [9, 1], Ve: [9, 2], Me: [9, 3] })), 'durudhara'));
assert(has(mk(0, withPl({ Mo: [5, 10], Ma: [6, 10], Sa: [3, 28], Ju: [9, 1], Ve: [9, 2], Me: [9, 3] })), 'sunapha'));
assert(has(mk(0, withPl({ Mo: [5, 10], Ma: [3, 10], Sa: [9, 28], Ju: [9, 1], Ve: [9, 2], Me: [9, 3] })), 'anapha') === false);   // Mars is 10 signs on, not the 12th
assert(has(mk(0, withPl({ Mo: [5, 10], Ma: [4, 10], Sa: [9, 28], Ju: [9, 1], Ve: [9, 2], Me: [9, 3] })), 'anapha'));
const kem = mk(0, { Su: [0, 5], Mo: [2, 10], Ma: [4, 10], Me: [6, 10], Ju: [7, 10], Ve: [9, 10], Sa: [10, 10], Ra: [0, 1], Ke: [6, 1] });
assert(has(kem, 'kemadruma') && get(kem, 'kemadruma').cancelled === false);
const kem2 = mk(0, { Su: [0, 5], Mo: [2, 10], Ma: [4, 10], Me: [6, 10], Ju: [8, 10], Ve: [9, 10], Sa: [10, 10], Ra: [0, 1], Ke: [6, 1] });
assert(get(kem2, 'kemadruma') === undefined || get(kem2, 'kemadruma').cancelled === true);   // Jupiter 7 signs from Moon makes a kendra
// Raja yoga: kendra lord with trikona lord in one sign (Aries lagna: 10th lord Saturn, 9th lord Jupiter)
assert(has(mk(0, withPl({ Sa: [10, 10], Ju: [10, 20] })), 'raja'));
assert(!has(mk(0, withPl({ Sa: [10, 10], Ju: [9, 20] })), 'raja'));
// Yogakaraka: Taurus lagna makes Saturn lord of 9 and 10; Libra lagna makes Saturn lord of 4 and 5
assert(get(mk(1, BG), 'yogakaraka').planets[0] === 'Sa'); assert(get(mk(6, BG), 'yogakaraka').planets[0] === 'Sa');
assert(get(mk(0, BG), 'yogakaraka') === undefined);
// Dhana: lords of 2 and 11 together (Aries lagna: Venus and Saturn)
assert(has(mk(0, withPl({ Ve: [5, 10], Sa: [5, 20] })), 'dhana'));
// Vipreet Raja (strict): Leo lagna, 12th lord Moon rules only Cancer (house 12); Moon in the 8th (Pisces)
const vr = mk(4, withPl({ Mo: [11, 10] })); assert(get(vr, 'vipreet_raja') && get(vr, 'vipreet_raja').kind === 'vimala');
assert(!has(mk(4, withPl({ Mo: [1, 10] })), 'vipreet_raja'));                           // Moon in house 10: no
// Neecha Bhanga: Sun debilitated in Libra; lord of Libra (Venus) in a kendra from the lagna cancels it
const nb1 = mk(0, withPl({ Su: [6, 10], Ve: [9, 10] })); assert(get(nb1, 'neecha_bhanga').cancelled === true);
const nb2 = mk(0, withPl({ Su: [6, 10], Ve: [4, 10], Ma: [7, 15] }));   // Venus in house 5 and Mars in house 8: neither is a kendra from lagna or from the Moon (Virgo)
assert(get(nb2, 'neecha_bhanga').cancelled === false);
// Parivartana
assert(has(mk(0, withPl({ Su: [1, 10], Ve: [4, 10] })), 'parivartana'));
assert(get(mk(0, withPl({ Su: [1, 10], Ve: [4, 10] })), 'parivartana').kind === 'maha');
assert(get(mk(0, withPl({ Su: [1, 10], Ve: [4, 10] })), 'parivartana').kind !== 'dainya');
// Mangal dosha: houses 1, 4, 7, 8, 12 from lagna or Moon; the 2nd house is NOT counted
assert(has(mk(0, withPl({ Ma: [6, 10] })), 'mangal_dosha'));
assert(!has(mk(0, withPl({ Ma: [1, 10], Mo: [5, 3] })), 'mangal_dosha'));               // house 2 from lagna; 9th from Moon (Moon Virgo, Mars Taurus)
assert(has(mk(0, withPl({ Ma: [2, 10], Mo: [11, 10] })), 'mangal_dosha'));              // Mars 4th from Moon (Pisces to Gemini)
assert(get(mk(0, withPl({ Ma: [7, 10] })), 'mangal_dosha').mitigated === true);         // Mars in own sign in the 8th
// Kaal Sarp: all seven between Rahu and Ketu
const ks = mk(0, { Ra: [0, 0], Ke: [6, 0], Su: [1, 5], Mo: [2, 5], Ma: [3, 5], Me: [4, 5], Ju: [4, 15], Ve: [5, 5], Sa: [5, 25] });
assert(has(ks, 'kaal_sarp'));
assert(!has(mk(0, { Ra: [0, 0], Ke: [6, 0], Su: [1, 5], Mo: [2, 5], Ma: [3, 5], Me: [4, 5], Ju: [4, 15], Ve: [5, 5], Sa: [8, 25] }), 'kaal_sarp'));

// Moon brightness: Shukla Ashtami (84 deg) to Krishna Ashtami (276 deg)
assert(R.moonBright(mk(0, BG, { elong: 120 })) && !R.moonBright(mk(0, BG, { elong: 20 })) && !R.moonBright(mk(0, BG, { elong: 300 })));
// Aspects (whole-sign): Saturn in house 1 aspects 3, 7, 10; Mars aspects 4, 7, 8; Jupiter 5, 7, 9
const asp = mk(0, { Su: [5, 5], Mo: [5, 6], Ma: [0, 5], Me: [5, 7], Ju: [0, 8], Ve: [5, 9], Sa: [0, 10], Ra: [2, 5], Ke: [8, 5] });
assert.deepStrictEqual(R.aspectsOn(asp, 3).sort(), ['Sa'].sort()); assert(R.aspectsOn(asp, 7).includes('Ma') && R.aspectsOn(asp, 7).includes('Ju') && R.aspectsOn(asp, 7).includes('Sa'));
assert(R.aspectsOn(asp, 5).includes('Ju') && R.aspectsOn(asp, 9).includes('Ju') && R.aspectsOn(asp, 8).includes('Ma') && !R.aspectsOn(asp, 1).includes('Ju'));

// Scoring is deterministic, bounded and reacts in the right direction
const good = mk(0, withPl({ Ju: [3, 10], Ve: [1, 10] }));
const bad = mk(0, withPl({ Mo: [3, 10], Sa: [3, 12], Ma: [3, 14] }));
assert.strictEqual(R.scoreHouse(good, 4).score, R.scoreHouse(good, 4).score);
// One change only: Saturn moves into the 4th house (a natural malefic, and the 4th is not an upachaya house) => exactly 0.5 lower
const base = mk(0, withPl({ Mo: [3, 10] })), plus = mk(0, withPl({ Mo: [3, 10], Sa: [3, 12] }));
assert.strictEqual(R.scoreHouse(plus, 4).score, R.scoreHouse(base, 4).score - 0.5);
// A benefic (Jupiter) moving into the 4th adds 0.5. Jupiter starts in Aries (house 1), whose 5th, 7th and 9th aspects miss house 4.
const jBase = mk(0, withPl({ Mo: [3, 10], Ju: [0, 10] })), jIn = mk(0, withPl({ Mo: [3, 10], Ju: [3, 12] }));
assert(!R.aspectsOn(jBase, 4).includes('Ju'));
assert.strictEqual(R.scoreHouse(jIn, 4).score, R.scoreHouse(jBase, 4).score + 0.5);
for (const c of [good, bad, kem, ks, asp, nb1]) { const a = R.allAreas(c, Date.UTC(2026, 10, 19)); for (const k of Object.keys(a)) assert(a[k].score > -6 && a[k].score < 7 && ['strong', 'good', 'mixed', 'challenging'].includes(a[k].label)); }
// A debilitated house lord scores lower than the same lord exalted
const lordWeak = mk(0, withPl({ Ma: [3, 10] })), lordStrong = mk(0, withPl({ Ma: [9, 10] }));    // Mars is the 1st lord for Aries lagna
assert(R.scoreHouse(lordWeak, 1).score < R.scoreHouse(lordStrong, 1).score);
console.log('rules: all yoga, aspect and scoring checks pass');
