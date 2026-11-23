// Storage tests: the jyo1 -> rsv1 move, backup export, hostile backup files, merge and replace restore.
// store.js is written for the browser, so it is loaded here with a small fake localStorage.
'use strict';
const assert = require('assert');

const mem = new Map();
global.window = {
  localStorage: {
    get length() { return mem.size; }, key: (i) => (Array.from(mem.keys())[i] ?? null),
    getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); },
  },
};
Object.defineProperty(global, 'navigator', { value: { language: 'en' }, configurable: true });
global.self = {};
self.RsvI18n = require('../js/i18n.js'); require('../js/i18n-extra.js'); require('../js/i18n-outlook.js');

const P1 = { id: 'aaaa1111', name: 'Asha', date: '1990-05-15', time: '10:30', timeUnknown: false, place: 'Delhi', lat: 28.6139, lon: 77.209, zone: 'Asia/Kolkata' };
const P2 = { id: 'bbbb2222', name: 'Ravi', date: '1985-01-02', time: '12:00', timeUnknown: true, place: 'Kolkata', lat: 22.57, lon: 88.36, zone: 'Asia/Kolkata' };

// ---- 1. the move from the old storage name, run BEFORE the store is loaded ---------------------
mem.set('jyo1:people', JSON.stringify([P1]));
mem.set('jyo1:lessons', JSON.stringify([{ id: 'les00001', text: 'old lesson', ts: 1 }]));
mem.set('rsv1:lessons', JSON.stringify([{ id: 'les00002', text: 'new lesson', ts: 2 }]));   // already present: must not be overwritten
mem.set('jyo1:settings', JSON.stringify({ lang: 'hi', theme: 'light' }));
require('../js/crypto.js');
require('../js/store.js');
const ST = self.RsvStore;
assert(![...mem.keys()].some((k) => k.startsWith('jyo1:')), 'old keys are removed');
assert.deepStrictEqual(ST.getPeople().map((p) => p.id), ['aaaa1111'], 'people moved');
assert.strictEqual(ST.getSettings().lang, 'hi'); assert.strictEqual(ST.getSettings().theme, 'light');
assert.deepStrictEqual(ST.getLessons().map((l) => l.text), ['new lesson'], 'existing new-name data is kept, not overwritten');

// ---- 2. id handling ------------------------------------------------------------------------------
const L = ST.cleanLessons(['plain text lesson', { text: 'object lesson' }], 10);
assert(L.every((l) => /^[a-z0-9]{6,32}$/.test(l.id)), 'lessons given as plain strings still get a real id');
const C = ST.cleanChat([{ role: 'ai', text: 'x' }, { role: 'weird', text: 'y', id: 'not valid!' }, 'str', null, { text: '' }], 10);
assert.strictEqual(C.length, 2); assert(C.every((m) => /^[a-z0-9]{6,32}$/.test(m.id)), 'chat messages without an id get one'); assert.strictEqual(C[1].role, 'user');

// ---- 3. export and round trip --------------------------------------------------------------------
function reset() { for (const k of Array.from(mem.keys())) mem.delete(k); }
function fill() {
  reset();
  ST.savePerson(P1); ST.savePerson(P2); ST.setCurrent(P2.id);
  ST.setSettings({ lang: 'bn', theme: 'light', consent: true, provider: 'groq', models: { groq: 'llama-3.3-70b-versatile' } });
  ST.setLessons([{ text: 'Use simple words' }, { text: 'No gemstones' }]);
  ST.addGood('How is my career?', 'Steady.');
  ST.setNotes(P1.id, [{ id: 'note0001', text: 'Changed job in 2021', ts: 5 }]);
  ST.setChat(P1.id, [{ role: 'user', text: 'Hi', id: 'msg00001', ts: 1 }, { role: 'ai', text: 'Hello', id: 'msg00002', ts: 2, local: true, ck: 'fixed', ckList: ['Jupiter: Cancer'], evil: '<script>' }]);
  mem.set('rsv1:keys', JSON.stringify({ gemini: { v: 1, secret: 'blob' } }));
}
fill();
const exp = ST.exportAll();
const expText = JSON.stringify(exp);
assert.strictEqual(exp.app, 'rashisvara'); assert(exp.version >= 2);
assert(!('consent' in exp.settings), 'consent is not exported'); assert(!/secret|"keys"/.test(expText), 'no key material');
assert(exp.good.length === 1 && exp.current === P2.id && exp.people.length === 2);
assert.strictEqual(exp.chats[P1.id][1].ck, 'fixed'); assert(!('evil' in exp.chats[P1.id][1]), 'unknown chat fields are dropped');

let r = ST.parseBackup(expText);
assert(r.ok); assert.strictEqual(r.backup.people.length, 2); assert.strictEqual(r.backup.settings.lang, 'bn');

// replace on a wiped device
const keysBefore = mem.get('rsv1:keys');
reset(); mem.set('rsv1:keys', keysBefore); ST.setSettings({ consent: true });
let res = ST.restore(r.backup, 'replace');
assert(res.ok); assert.strictEqual(ST.getPeople().length, 2); assert.strictEqual(ST.getCurrent(), P2.id);
assert.deepStrictEqual(ST.getLessons().map((l) => l.text).sort(), ['No gemstones', 'Use simple words']);
assert.strictEqual(ST.getGood().length, 1); assert.strictEqual(ST.getNotes(P1.id)[0].text, 'Changed job in 2021');
assert.strictEqual(ST.getChat(P1.id).length, 2); assert.strictEqual(ST.getChat(P1.id)[1].local, true);
assert.strictEqual(ST.getSettings().lang, 'bn'); assert.strictEqual(ST.getSettings().models.groq, 'llama-3.3-70b-versatile');
assert.strictEqual(ST.getSettings().consent, true, 'consent stays as it was on this device');
assert.strictEqual(mem.get('rsv1:keys'), keysBefore, 'saved keys are untouched');
// a restore never grants consent
reset(); ST.setSettings({ consent: false });
const withConsent = JSON.parse(expText); withConsent.settings.consent = true;
ST.restore(ST.parseBackup(JSON.stringify(withConsent)).backup, 'replace');
assert.strictEqual(ST.getSettings().consent, false, 'a backup cannot switch consent on');

// ---- 4. hostile files ----------------------------------------------------------------------------
const bad = (text, code) => { const x = ST.parseBackup(text); assert.strictEqual(x.ok, false, String(text).slice(0, 60)); if (code) assert.strictEqual(x.error, code); };
bad('not json'); bad('[]'); bad('null'); bad('"string"'); bad('42'); bad(undefined); bad(null);
bad(JSON.stringify({ app: 'other', version: 1, people: [P1] })); bad(JSON.stringify({ app: 'rashisvara', version: 99, people: [P1] })); bad(JSON.stringify({ app: 'rashisvara', version: 'x', people: [P1] }));
bad(JSON.stringify({ app: 'rashisvara', version: 1 }));                                            // nothing inside
bad(JSON.stringify({ app: 'rashisvara', version: 1, people: [{ id: 'x' }, { id: 'zzzzzz11', date: '1990-01-01', time: '10:00', lat: 999, lon: 0, zone: 'UTC' }] }));   // all invalid
bad('x'.repeat(ST.MAX_BACKUP + 1), 'big');

const hostile = JSON.parse('{"app":"rashisvara","version":2,"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted2":1}},"people":[],"lessons":[],"good":[]}');
hostile.people = [
  Object.assign({}, P1, { name: '<img src=x onerror=alert(1)>'.repeat(10), place: 'p'.repeat(500), isAdmin: true }),
  Object.assign({}, P2, { zone: 'Not/AZone' }), Object.assign({}, P2, { id: '../../etc' }), Object.assign({}, P2, { id: 'cccc3333', lat: 'abc' }),
  Object.assign({}, P1),                                          // duplicate id
];
hostile.lessons = ['L'.repeat(1000), 5, null, { text: 'ok' }].concat(Array(200).fill('many'));
hostile.notes = { aaaa1111: [{ text: 'n'.repeat(1000), id: '!!' }], '__proto__': [{ text: 'x' }], 'zzzz9999': [{ text: 'no such person' }] };
hostile.chats = { aaaa1111: [{ role: 'ai', text: 'ok', ck: 'DROP TABLE', local: 'yes' }, { role: 'ai', text: 't'.repeat(10000), ck: 'warn', ckList: Array(50).fill('z'.repeat(500)) }] };
hostile.settings = { lang: 'xx', theme: 'neon', provider: 'evil', models: { gemini: '../../x', groq: 'ok-model' }, consent: true, __proto__: { polluted3: 1 } };
hostile.current = 'zzzz9999';
const hx = ST.parseBackup(JSON.stringify(hostile));
assert(hx.ok, 'a damaged file keeps whatever is valid');
const hb = hx.backup;
assert.strictEqual(hb.people.length, 1, 'only the valid person survives'); assert.strictEqual(hb.people[0].name.length, 60); assert.strictEqual(hb.people[0].place.length, 120); assert(!('isAdmin' in hb.people[0]));
assert(hb.lessons.length <= 50 && hb.lessons.every((l) => l.text.length <= 300));
assert(!hb.notes.zzzz9999 && Object.keys(hb.notes).join() === 'aaaa1111' && hb.notes.aaaa1111[0].text.length === 240 && /^[a-z0-9]{6,32}$/.test(hb.notes.aaaa1111[0].id));
const hc = hb.chats.aaaa1111; assert(hc[0].ck === undefined && hc[0].local === undefined, 'invalid flags dropped'); assert.strictEqual(hc[1].text.length, 6000); assert(hc[1].ckList.length <= 6 && hc[1].ckList.every((x) => x.length <= 200));
assert(['en', 'hi', 'bn', 'hn'].includes(hb.settings.lang)); assert.strictEqual(hb.settings.theme, 'dark'); assert.strictEqual(hb.settings.provider, ST.getSettings().provider, 'an unknown provider falls back to this device\'s value');
assert.strictEqual(hb.settings.models.gemini, ''); assert.strictEqual(hb.settings.models.groq, 'ok-model');
assert.strictEqual(hb.current, null);
assert.strictEqual(({}).polluted, undefined); assert.strictEqual(({}).polluted2, undefined); assert.strictEqual(({}).polluted3, undefined); assert.strictEqual(Object.prototype.polluted, undefined);

// ---- 5. merge ----------------------------------------------------------------------------------------
fill();
const backupText = JSON.stringify(ST.exportAll());
// device now: P1 with 1 note and a chat; the backup will carry a new person, a duplicate of P1 under a new id, more notes and lessons
const more = JSON.parse(backupText);
more.people.push({ id: 'dddd4444', name: 'Meera', date: '1995-03-03', time: '08:00', timeUnknown: false, place: 'Pune', lat: 18.52, lon: 73.85, zone: 'Asia/Kolkata' });
more.people.push(Object.assign({}, P1, { id: 'eeee5555' }));                        // same birth data as Asha under another id
more.notes[P1.id].push({ id: 'note0002', text: 'Moved city in 2023', ts: 9 });
more.notes.dddd4444 = [{ id: 'note0003', text: 'Likes music', ts: 1 }];
more.chats.dddd4444 = [{ role: 'user', text: 'Hello Meera chat', id: 'msg00009', ts: 1 }];
more.chats[P1.id] = [{ role: 'user', text: 'DIFFERENT chat that must not replace the local one', id: 'msg00010', ts: 1 }];
more.lessons.push({ text: 'A brand new lesson' }); more.good.push({ q: 'New question', a: 'New answer' });
more.settings.lang = 'en';
const localChat = JSON.stringify(ST.getChat(P1.id));
const m = ST.restore(ST.parseBackup(JSON.stringify(more)).backup, 'merge');
assert(m.ok); assert.strictEqual(m.added.people, 1, 'new person added, duplicate skipped'); assert.deepStrictEqual(ST.getPeople().map((p) => p.id).sort(), ['aaaa1111', 'bbbb2222', 'dddd4444']);
assert.deepStrictEqual(ST.getNotes(P1.id).map((n) => n.text).sort(), ['Changed job in 2021', 'Moved city in 2023']); assert.strictEqual(ST.getNotes('dddd4444').length, 1);
assert.strictEqual(JSON.stringify(ST.getChat(P1.id)), localChat, 'a chat already on this device is kept'); assert.strictEqual(ST.getChat('dddd4444').length, 1);
assert(ST.getLessons().some((l) => l.text === 'A brand new lesson') && ST.getLessons().length === 3); assert.strictEqual(ST.getGood().length, 2);
assert.strictEqual(ST.getSettings().lang, 'bn', 'merge does not change settings');
assert.strictEqual(ST.getCurrent(), P2.id);
// merging the same file again adds nothing
const m2 = ST.restore(ST.parseBackup(JSON.stringify(more)).backup, 'merge');
assert.deepStrictEqual(m2.added, { people: 0, lessons: 0, notes: 0, chats: 0, events: 0 });

// capacity: 50 people at most
reset();
for (let i = 0; i < 49; i++) ST.savePerson(Object.assign({}, P1, { id: 'loc' + String(100000 + i), name: 'N' + i }));
const bigBackup = { app: 'rashisvara', version: 2, people: [], lessons: [], good: [] };
for (let i = 0; i < 5; i++) bigBackup.people.push(Object.assign({}, P2, { id: 'imp' + String(100000 + i), name: 'M' + i }));
const mb = ST.restore(ST.parseBackup(JSON.stringify(bigBackup)).backup, 'merge');
assert.strictEqual(mb.added.people, 1); assert.strictEqual(ST.getPeople().length, 50);

// ---- 6. replace removes what was here --------------------------------------------------------------------
fill();
const only = { app: 'rashisvara', version: 2, people: [P2], lessons: [{ text: 'solo' }], good: [], notes: { [P1.id]: [{ text: 'orphan note' }] }, chats: {} };
const rp = ST.restore(ST.parseBackup(JSON.stringify(only)).backup, 'replace');
assert(rp.ok); assert.deepStrictEqual(ST.getPeople().map((p) => p.id), [P2.id]); assert.strictEqual(ST.getNotes(P1.id).length, 0); assert.strictEqual(ST.getChat(P1.id).length, 0);
assert.deepStrictEqual(ST.getLessons().map((l) => l.text), ['solo']); assert.strictEqual(ST.getGood().length, 0);

// ---- 7. storage full: restore reports failure instead of pretending --------------------------------------
{
  fill(); const ok0 = ST.parseBackup(JSON.stringify(ST.exportAll())).backup;
  const set = global.window.localStorage.setItem; global.window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  const failed = ST.restore(ok0, 'replace'); global.window.localStorage.setItem = set;
  assert.strictEqual(failed.ok, false);
}

// ---- 8. wipe ------------------------------------------------------------------------------------------------
fill(); ST.wipeAll();
assert.strictEqual(ST.getPeople().length, 0); assert.strictEqual(ST.getLessons().length, 0); assert(!mem.has('rsv1:keys'));

console.log('backup: old-name migration, export, round trip, hostile files, merge, replace and full-storage cases pass');
