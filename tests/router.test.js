// Quick Answer router: keywords in four languages, periods, safety rules, and a full answer built from a chart.
const assert = require('assert');
const E = require('../js/engine.js'); require('../js/i18n-extra.js'); require('../js/i18n-outlook.js');
const I = require('../js/i18n.js'), RT = require('../js/ask-router.js');
const P = (t) => RT.parse(t, 2026);

const CASES = [
  // text, area, period, offset
  ['How is my career this month?', 'career', 'month', 0],
  ['Will I get a job next year?', 'career', 'year', 1],
  ['money outlook for the next 12 months', 'wealth', 'year', 0],
  ['How is my love life this week?', 'love', 'week', 0],
  ['How will my health be today?', 'health', 'day', 0],
  ['When may marriage come in my chart?', 'marriage', null, 0],
  ['How is my family life this month?', 'family', 'month', 0],
  ['love marriage kab hogi', 'marriage', null, 0],
  ['Is it a good time to study for exams this week', 'education', 'week', 0],
  ['abroad visa chances next month', 'foreign', 'month', 1],
  ['meditation and peace this year', 'spirituality', 'year', 0],
  ['how is my month', 'overall', 'month', 0],
  ['next 7 days career', 'career', 'week', 0],
  ['next 30 days money', 'wealth', 'month', 0],
  ['what about tomorrow for love', 'love', 'day', 1],
  // Hindi
  ['इस महीने मेरा करियर कैसा है?', 'career', 'month', 0],
  ['अगले 12 महीनों में पैसों का हाल', 'wealth', 'year', 0],
  ['इस हफ़्ते मेरी प्रेम ज़िंदगी कैसी है?', 'love', 'week', 0],
  ['आज मेरी सेहत कैसी रहेगी?', 'health', 'day', 0],
  ['मेरी कुंडली में विवाह कब हो सकता है?', 'marriage', null, 0],
  ['इस महीने मेरा पारिवारिक जीवन कैसा है?', 'family', 'month', 0],
  ['अगले साल नौकरी मिलेगी?', 'career', 'year', 1],
  // Bengali
  ['এই মাসে আমার কর্মজীবন কেমন?', 'career', 'month', 0],
  ['আগামী ১২ মাসে অর্থের অবস্থা', 'wealth', 'year', 0],
  ['এই সপ্তাহে আমার প্রেমজীবন কেমন?', 'love', 'week', 0],
  ['আজ আমার স্বাস্থ্য কেমন থাকবে?', 'health', 'day', 0],
  ['আমার কুণ্ডলীতে বিয়ে কখন হতে পারে?', 'marriage', null, 0],
  ['এই মাসে আমার পারিবারিক জীবন কেমন?', 'family', 'month', 0],
  // Hinglish
  ['Is mahine mera career kaisa hai?', 'career', 'month', 0],
  ['Agle 12 mahinon mein paison ka haal', 'wealth', 'year', 0],
  ['Is hafte meri love life kaisi hai?', 'love', 'week', 0],
  ['Aaj meri sehat kaisi rahegi?', 'health', 'day', 0],
  ['Meri kundali mein vivah kab ho sakta hai?', 'marriage', null, 0],
  ['Is mahine mera parivarik jeevan kaisa hai?', 'family', 'month', 0],
  ['agle saal naukri milegi kya', 'career', 'year', 1],
];
for (const [text, area, period, offset] of CASES) {
  const r = P(text);
  assert.strictEqual(r.area, area, 'area of "' + text + '": ' + r.area);
  assert.strictEqual(r.period, period, 'period of "' + text + '": ' + r.period);
  assert.strictEqual(r.offset, offset, 'offset of "' + text + '": ' + r.offset);
  assert.strictEqual(r.safety, null, 'no safety flag for "' + text + '"');
}
// "when" is recognised
for (const t of ['When will I get married', 'विवाह कब होगा', 'বিয়ে কবে হবে', 'shaadi kab hogi']) assert(P(t).when, 'when: ' + t);
assert(!P('How is my career this month?').when);
// every suggested question in every language must be understood
for (const L of Object.keys(I.T)) for (const q of I.ui(L, 'aChips')) { const r = P(q); assert(r.area && r.safety === null, L + ' chip not understood: ' + q); }
// nothing matched
for (const t of ['', '   ', 'hello there', 'what is the capital of France', 'tell me a joke']) assert.strictEqual(P(t).area, null, 'no area for "' + t + '"');
// a short word must not match inside a longer one: Bengali "মা" (mother) vs "মাস" (month) vs "আমার" (my)
assert.notStrictEqual(P('এই মাসে আমার').area, 'family'); assert.strictEqual(P('আমার মা কেমন থাকবে').area, 'family');
// safety
for (const t of ['I want to die', 'I want to kill myself', 'suicide', 'मैं आत्महत्या करना चाहता हूँ', 'আমি আত্মহত্যা করতে চাই', 'main marna chahta hoon', 'I do not want to live anymore', 'end my life']) assert.strictEqual(P(t).safety, 'distress', 'distress: ' + t);
for (const t of ['When will I die?', 'how long will I live', 'मेरी मृत्यु कब होगी', 'আমি কবে মারা যাব', 'meri maut kab hogi', 'what is my age of death']) assert.strictEqual(P(t).safety, 'death', 'death: ' + t);
assert.strictEqual(P('My grandfather passed, how is my family this month').safety, null);
assert.strictEqual(P('death of my father and my career next month').safety, null, 'a mention of death without asking when is not blocked');
assert(P('Which stocks should I invest in this month?').invest && P('Which stocks should I invest in this month?').area === 'wealth');
assert(P('lottery number this week').invest);

// Full answers
const chart = E.computeChart({ utcMs: Date.UTC(1995, 5, 15, 5, 30), lat: 25.6, lon: 85.1, tzOffsetSec: 19800 });
const base = { chart, nowMs: Date.UTC(2026, 10, 22, 6, 0), zone: 'Asia/Kolkata' };
for (const L of Object.keys(I.T)) {
  const a = RT.answer(L, chart, Object.assign({ text: I.ui(L, 'aChips')[0] }, base));
  assert.strictEqual(a.kind, 'answer'); assert(a.text.length > 200 && !/\{\w+\}/.test(a.text), L + ' placeholders left over: ' + a.text.match(/\{\w+\}/));
  assert(a.text.includes('**'), 'has a bold heading');
  const d = RT.answer(L, chart, Object.assign({ text: I.ui(L, 'aChips')[2] }, base)); assert.strictEqual(d.kind, 'answer');
  assert.strictEqual(RT.answer(L, chart, Object.assign({ text: 'hello' }, base)).kind, 'nomatch');
  assert.strictEqual(RT.answer(L, chart, Object.assign({ text: 'I want to die' }, base)).kind, 'safety');
  assert.strictEqual(RT.answer(L, chart, Object.assign({ text: 'when will I die' }, base)).kind, 'safety');
}
const en = RT.answer('en', chart, Object.assign({ text: 'When will I get married?' }, base));
assert(en.text.includes('Marriage and partnership') && /Strong link|Mild link/.test(en.text), 'a "when" question lists dasha windows');
assert(en.text.includes('next 30 days') || en.text.includes('Next 30 days'), 'default period note: both month and year');
const inv = RT.answer('en', chart, Object.assign({ text: 'which stock to invest in this week' }, base)); assert(inv.text.startsWith(I.ui('en', 'qaInvest')));
const dist = RT.answer('en', chart, Object.assign({ text: 'I want to die' }, base)); assert(/14416/.test(dist.text) && !/Strong|Good|Mixed/.test(dist.text), 'no prediction in a distress reply');
const red = RT.answer('en', chart, Object.assign({ text: 'career this month', timeUnknown: true }, base)); assert(red.text.includes(I.ui('en', 'oReduced')));
console.log('router: ' + CASES.length + ' phrases in 4 languages, safety rules, full answers OK');
