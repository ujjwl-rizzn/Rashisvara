// Every language must have every word. No gaps, no leftover placeholders, same placeholders as English.
const assert = require('assert'), fs = require('fs');
const I = require('../js/i18n.js'); require('../js/i18n-extra.js'); require('../js/i18n-outlook.js'); require('../js/i18n-explain.js');
const T = I.T, EN = T.en, langs = Object.keys(T);
const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');

const SHAPE = { planet: 10, planetShort: 10, planetSig: 9, sign: 12, signShort: 12, nak: 27, weekday: 7, tithi: 15, yoga: 27, houseSig: 12 };
for (const l of langs) {
  for (const [k, n] of Object.entries(SHAPE)) {
    const v = T[l][k]; assert(v, l + '.' + k + ' missing');
    assert.strictEqual(Array.isArray(v) ? v.length : Object.keys(v).length, n, l + '.' + k + ' has the wrong size');
  }
  for (const k of ['karana', 'dignity', 'dignityPhrase', 'paksha', 'label', 'levels', 'sadeSati', 'from', 'area', 'r', 'yogaName', 'yoga_t', 'ui']) {
    assert(T[l][k], l + '.' + k + ' missing');
    const enKeys = Object.keys(EN[k]).sort(), myKeys = Object.keys(T[l][k]).sort();
    assert.deepStrictEqual(myKeys.filter((x) => !enKeys.includes(x)), [], l + '.' + k + ' has keys English lacks');
    assert.deepStrictEqual(enKeys.filter((x) => !myKeys.includes(x)), [], l + '.' + k + ' is missing keys');
    for (const key of enKeys) {
      const a = EN[k][key], b = T[l][k][key];
      assert.strictEqual(typeof a, typeof b, l + '.' + k + '.' + key + ' has a different type');
      if (Array.isArray(a)) { assert.strictEqual(a.length, b.length, l + '.' + k + '.' + key + ' list length'); a.forEach((x, i) => { assert(String(b[i]).trim(), 'empty'); assert.strictEqual(ph(x), ph(b[i]), l + '.' + k + '.' + key + '[' + i + '] placeholders'); }); }
      else if (typeof a === 'string') { assert(b.trim(), l + '.' + k + '.' + key + ' empty'); assert.strictEqual(ph(a), ph(b), l + '.' + k + '.' + key + ' placeholders differ from English'); }
      else if (Array.isArray(a) === false && typeof a === 'object') { /* nested (area) */ assert.strictEqual(a.length, b.length); }
    }
  }
  for (const [k, n] of [['planetShort', 10]]) assert.strictEqual(new Set(Object.values(T[l][k])).size, n, l + ' short planet names must be unique');
}
// Same language names for both Hindi spellings of the sign short names are allowed to repeat; only planets must be unique above.

// Every key the code asks for must exist. All script files and the page are scanned.
const dir = __dirname + '/../js/', files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !/^i18n/.test(f) && f !== 'outlook-cal.js');
const src = files.map((f) => fs.readFileSync(dir + f, 'utf8')).join('\n') + fs.readFileSync(__dirname + '/../index.html', 'utf8');
const keys = new Set();
for (const m of src.matchAll(/\b(?:t|ui)\((?:[A-Za-z]+,\s*)?'([A-Za-z0-9_]+)'/g)) keys.add(m[1]);
for (const m of src.matchAll(/data-i18n(?:-ph|-aria)?="([A-Za-z0-9_]+)"/g)) keys.add(m[1]);
for (const m of src.matchAll(/'((?:tab|tone|err|aErr|th|s|p|d|c|f|l|r|a|o|qa|ck|bk|rp|av)[A-Z][A-Za-z0-9]*)'/g)) if (EN.ui[m[1]] !== undefined) keys.add(m[1]);
// keys that the code builds from parts
['v1', 'v3', 'v7', 'v9', 'v10', 'v12', 'cNorth', 'cSouth', 'tzMissing', 'tzAmbiguous', 'errDate', 'errTime', 'errLat', 'errLon', 'errTz',
  'oBestDays', 'oBestMonths', 'oCautionDays', 'oCautionMonths', 'oDay', 'oWeek', 'oMonth', 'oYear', 'oOverall',
  'oThCareer', 'oThWealth', 'oThLove', 'oThMarriage', 'oThFamily', 'oThHealth', 'oThEducation', 'oThForeign', 'oThSpirituality', 'oThOverall',
  'oSentStrong', 'oSentGood', 'oSentMixed', 'oSentChallenging', 'ckOk', 'ckFixed', 'ckWarn', 'ckNone', 'ckTime', 'ckDate'].forEach((k) => keys.add(k));
// explanation keys the code builds from parts: one per area, per planet role and so on
['career', 'wealth', 'love', 'marriage', 'family', 'health', 'education', 'foreign', 'spirituality', 'overall'].forEach((a) => keys.add('xEx_' + a));
['karaka', 'ruler', 'moves', 'general'].forEach((r) => keys.add('xRole_' + r));
['xLearnTable', 'xLearnChart', 'xLearnPanchang', 'xLearnKaraka', 'xLearnAv', 'xLearnVarga', 'xLearnYoga', 'xLearnAreas', 'xLearnLive', 'xLearnHome', 'xStateGood', 'xStateBad', 'xStateMid', 'xLinkYes', 'xLinkNo',
  'xDayLordVara', 'xDayLordNak', 'xBgDay', 'xBgLong', 'xDig', 'xWho', 'xPGood', 'xPBad', 'xDashaTheme', 'xChandra', 'xTaraMeaning', 'xRashiTrait', 'xEvTieYes', 'xEvTieNo', 'xEvBeforeBirth', 'xEvFuture'].forEach((k) => keys.add(k));
keys.delete('xRole_'); keys.delete('xEx_');
keys.delete('v'); keys.delete('oBest'); keys.delete('oCaution');   // prefixes; the full names are listed above
const missing = [...keys].filter((k) => EN.ui[k] === undefined);
assert.deepStrictEqual(missing, [], 'screen code uses keys that do not exist: ' + missing.join(', '));
console.log('i18n: ' + langs.length + ' languages complete; ' + Object.keys(EN.ui).length + ' screen strings, ' + keys.size + ' keys checked against the code');
