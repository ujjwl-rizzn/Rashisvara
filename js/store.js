/*  Storage. Everything lives in this browser (localStorage) and nowhere else.
    Anything read back is treated as untrusted: it is checked and trimmed before use. */
(function (root, factory) {
  root.RsvStore = factory(root.RsvI18n, root.RsvCrypto);
})(typeof self !== 'undefined' ? self : this, function (I, C) {
  'use strict';

  const NS = 'rsv1:';
  const ID_RE = /^[a-z0-9]{6,32}$/;
  const PROVIDERS = ['gemini', 'groq', 'openrouter'];
  const mem = new Map();
  let ls = null;
  try { ls = window.localStorage; ls.setItem(NS + 't', '1'); ls.removeItem(NS + 't'); } catch (e) { ls = null; }

  // One-time move from the storage name used before the app was renamed, so nothing saved earlier is lost.
  try {
    if (ls) {
      const OLD = 'jyo1:', old = [];
      for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(OLD)) old.push(k); }
      for (const k of old) { const nk = NS + k.slice(OLD.length); if (ls.getItem(nk) === null) ls.setItem(nk, ls.getItem(k)); ls.removeItem(k); }
    }
  } catch (e) { /* storage blocked: nothing to move */ }

  function rawGet(k) { try { return ls ? ls.getItem(NS + k) : (mem.has(k) ? mem.get(k) : null); } catch (e) { return null; } }
  function rawSet(k, v) { try { if (ls) ls.setItem(NS + k, v); else mem.set(k, v); return true; } catch (e) { return false; } }
  function rawDel(k) { try { if (ls) ls.removeItem(NS + k); else mem.delete(k); } catch (e) { /* ignore */ } }
  function readJSON(k) { const r = rawGet(k); if (r === null) return null; try { return JSON.parse(r); } catch (e) { return null; } }
  function writeJSON(k, v) { return rawSet(k, JSON.stringify(v)); }

  // ---- small validators -----------------------------------------------------
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
  const bool = (v, d) => (typeof v === 'boolean' ? v : d);
  const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
  const ts = (v) => num(v, 0, 4102444800000, 0);
  function validZone(z) { try { new Intl.DateTimeFormat('en', { timeZone: z }); return typeof z === 'string' && z.length <= 64; } catch (e) { return false; } }

  function guessLang() {
    const l = (navigator.language || 'en').toLowerCase();
    return l.startsWith('hi') ? 'hi' : l.startsWith('bn') ? 'bn' : 'en';
  }

  // ---- settings -------------------------------------------------------------
  const MODEL_RE = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._:\/-]{0,99}$/;   // starts with a letter/digit, no ".."; keeps names like meta-llama/llama-3.3-70b-instruct:free
  function defaults() {
    return { lang: guessLang(), theme: 'dark', sound: true, ambient: false, provider: 'gemini', aiLang: '', chartStyle: 'north', consent: false, models: { gemini: '', groq: '', openrouter: '' } };
  }
  function cleanSettings(r, d) {
    if (!r || typeof r !== 'object') return d;
    const models = {};
    for (const p of PROVIDERS) { const m = r.models && typeof r.models === 'object' ? r.models[p] : ''; models[p] = typeof m === 'string' && MODEL_RE.test(m) ? m : ''; }
    return {
      lang: Object.prototype.hasOwnProperty.call(I.LANGS, r.lang) ? r.lang : d.lang,
      theme: r.theme === 'light' ? 'light' : 'dark',
      sound: bool(r.sound, d.sound), ambient: bool(r.ambient, false),
      provider: PROVIDERS.includes(r.provider) ? r.provider : d.provider,
      aiLang: I.AI_LANGS.includes(r.aiLang) ? r.aiLang : '',
      chartStyle: r.chartStyle === 'south' ? 'south' : 'north',
      consent: bool(r.consent, false), models,
    };
  }
  function getSettings() { return cleanSettings(readJSON('settings'), defaults()); }
  function setSettings(patch) {
    const cur = getSettings();
    const next = Object.assign({}, cur, patch, { models: Object.assign({}, cur.models, (patch && patch.models) || {}) });
    writeJSON('settings', next);
    return getSettings();
  }

  // ---- people ---------------------------------------------------------------
  function cleanPerson(p) {
    if (!p || typeof p !== 'object') return null;
    const id = typeof p.id === 'string' && ID_RE.test(p.id) ? p.id : null;
    const date = typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null;
    const timeUnknown = bool(p.timeUnknown, false);
    const time = typeof p.time === 'string' && /^\d{2}:\d{2}$/.test(p.time) ? p.time : (timeUnknown ? '12:00' : null);
    const lat = num(p.lat, -90, 90, null), lon = num(p.lon, -180, 180, null);
    if (!id || !date || !time || lat === null || lon === null || !validZone(p.zone)) return null;
    return { id, name: str(p.name, 60), date, time, timeUnknown, place: str(p.place, 120), lat, lon, zone: p.zone };
  }
  function getPeople() { return arr(readJSON('people'), 50).map(cleanPerson).filter(Boolean); }
  function savePerson(p) {
    const c = cleanPerson(p); if (!c) return false;
    const list = getPeople(); const i = list.findIndex((x) => x.id === c.id);
    if (i >= 0) list[i] = c; else list.push(c);
    return writeJSON('people', list.slice(-50));
  }
  function deletePerson(id) {
    writeJSON('people', getPeople().filter((p) => p.id !== id));
    const chats = readMap('chats'); delete chats[id]; writeJSON('chats', chats);
    const notes = readMap('notes'); delete notes[id]; writeJSON('notes', notes);
    const events = readMap('events'); delete events[id]; writeJSON('events', events);
    if (getCurrent() === id) rawDel('current');
  }
  function getCurrent() { const r = rawGet('current'); return r && ID_RE.test(r) ? r : null; }
  function setCurrent(id) { if (id && ID_RE.test(id)) rawSet('current', id); else rawDel('current'); }

  // ---- maps keyed by person id (chat, notes) --------------------------------
  function readMap(k) {
    const r = readJSON(k); const out = {};
    if (r && typeof r === 'object' && !Array.isArray(r)) for (const key of Object.keys(r)) if (ID_RE.test(key)) out[key] = r[key];
    return out;
  }
  const okId = (v) => typeof v === 'string' && ID_RE.test(v);
  const CK_STATUS = ['ok', 'fixed', 'warn', 'none'];
  // Chat messages: only known fields survive. "local" marks an instant answer from the chart rules, "ck" is the fact-check result.
  function cleanChat(list, max) {
    return arr(list, max).map((m) => {
      if (!m || typeof m !== 'object') return null;
      const o = { role: m.role === 'ai' ? 'ai' : 'user', text: str(m.text, 6000), ts: ts(m.ts), id: okId(m.id) ? m.id : C.randomId() };
      if (o.role === 'ai' && m.local === true) o.local = true;
      if (o.role === 'ai' && CK_STATUS.includes(m.ck)) {
        o.ck = m.ck;
        const l = arr(m.ckList, 6).map((x) => str(x, 200)).filter(Boolean);
        if (l.length) o.ckList = l;
      }
      return o.text ? o : null;
    }).filter(Boolean);
  }
  function cleanNotes(list, max) {
    return arr(list, max).map((n) => (n && typeof n === 'object' ? { id: okId(n.id) ? n.id : C.randomId(), text: str(n.text, 240), ts: ts(n.ts) } : null)).filter((n) => n && n.text);
  }
  function getChat(pid) { return cleanChat(readMap('chats')[pid], 40); }
  function setChat(pid, list) { const all = readMap('chats'); all[pid] = cleanChat(Array.isArray(list) ? list.slice(-30) : [], 30); writeJSON('chats', all); }
  // Life events the person adds in the Understand tab: month, one of the nine areas, a few words. Plain text only.
  const EVENT_AREAS = ['career', 'wealth', 'love', 'marriage', 'family', 'health', 'education', 'foreign', 'spirituality'];
  const YM_RE = /^(19|20)\d\d-(0[1-9]|1[0-2])$/;
  function cleanEvents(list, max) {
    return arr(list, max).map((e) => (e && typeof e === 'object' && typeof e.ym === 'string' && YM_RE.test(e.ym) && EVENT_AREAS.includes(e.area)
      ? { id: okId(e.id) ? e.id : C.randomId(), ym: e.ym, area: e.area, text: str(e.text, 120).replace(/[\u0000-\u001f\u007f]/g, ' ').trim() } : null)).filter(Boolean);
  }
  function getEvents(pid) { return cleanEvents(readMap('events')[pid], 30); }
  function setEvents(pid, list) { if (!ID_RE.test(pid)) return false; const all = readMap('events'); all[pid] = cleanEvents(list, 30); return writeJSON('events', all); }
  function getNotes(pid) { return cleanNotes(readMap('notes')[pid], 30); }
  function setNotes(pid, list) { const all = readMap('notes'); all[pid] = cleanNotes(list, 30); writeJSON('notes', all); }

  // ---- lessons and liked answers -------------------------------------------
  function cleanLessons(v, max) {
    return arr(v, max).map((l) => ({ id: okId(l && l.id) ? l.id : C.randomId(), text: str(typeof l === 'string' ? l : l && l.text, 300).trim(), ts: ts(l && l.ts) })).filter((l) => l.text);
  }
  function getLessons() { return cleanLessons(readJSON('lessons'), 50); }
  function setLessons(list) { return writeJSON('lessons', cleanLessons(list, 50)); }
  function addLesson(text) {
    const t = str(text, 300).trim(); if (!t) return false;
    const list = getLessons();
    if (list.some((l) => l.text === t)) return true;
    list.push({ id: C.randomId(), text: t, ts: Date.now() });
    return setLessons(list.slice(-50));
  }
  function cleanGood(v) { return arr(v, 10).map((g) => ({ q: str(g && g.q, 300), a: str(g && g.a, 700), ts: ts(g && g.ts) })).filter((g) => g.q && g.a); }
  function getGood() { return cleanGood(readJSON('good')); }
  function addGood(q, a) { const l = getGood(); l.push({ q: str(q, 300), a: str(a, 700), ts: Date.now() }); return writeJSON('good', l.slice(-10)); }

  // ---- encrypted AI keys (one per provider) --------------------------------
  function getKeyBlob(provider) {
    if (!PROVIDERS.includes(provider)) return null;
    const all = readJSON('keys'); const b = all && typeof all === 'object' ? all[provider] : null;
    return C.validBlob(b) ? b : null;
  }
  function setKeyBlob(provider, blob) {
    if (!PROVIDERS.includes(provider)) return false;
    const all = readJSON('keys'); const out = {};
    if (all && typeof all === 'object') for (const p of PROVIDERS) if (C.validBlob(all[p])) out[p] = all[p];
    if (blob) out[provider] = blob; else delete out[provider];
    return writeJSON('keys', out);
  }

  // ---- whole-device actions -------------------------------------------------
  const KEYS = ['settings', 'people', 'current', 'chats', 'notes', 'events', 'lessons', 'good', 'keys'];
  function wipeAll() { KEYS.forEach(rawDel); mem.clear(); }
  // Everything the person saved, without the AI keys and without the consent tick (that must be given again on each device).
  function exportAll() {
    const set = getSettings(); delete set.consent;
    const people = getPeople(), ids = people.map((p) => p.id);
    const pick = (m, fn, n) => { const o = {}; for (const id of ids) { const l = fn(m[id], n); if (l.length) o[id] = l; } return o; };
    return { app: 'rashisvara', version: 2, exportedAt: new Date().toISOString(), settings: set, current: getCurrent(), people, lessons: getLessons(), good: getGood(),
      notes: pick(readMap('notes'), cleanNotes, 30), events: pick(readMap('events'), cleanEvents, 30), chats: pick(readMap('chats'), cleanChat, 40), note: 'Saved AI keys are never included in exports.' };
  }

  // ---- restoring a backup ---------------------------------------------------
  // A backup file is untrusted input: it is size-limited, parsed, and rebuilt field by field. Nothing from it is ever
  // copied across as it is, and it can never set the AI keys or the consent tick.
  const MAX_BACKUP = 2 * 1024 * 1024;
  function cleanMap(v, fn) {
    const out = {};
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const k of Object.keys(v).slice(0, 200)) if (ID_RE.test(k)) { const l = fn(v[k]); if (l.length) out[k] = l; }
    return out;
  }
  function parseBackup(text) {
    const bad = { ok: false, error: 'bad' };
    if (typeof text !== 'string') return bad;
    if (text.length > MAX_BACKUP) return { ok: false, error: 'big' };
    let d; try { d = JSON.parse(text); } catch (e) { return bad; }
    if (!d || typeof d !== 'object' || Array.isArray(d) || d.app !== 'rashisvara' || !(d.version >= 1 && d.version <= 2)) return bad;
    const people = [], seen = new Set();
    for (const p of arr(d.people, 50)) { const c = cleanPerson(p); if (c && !seen.has(c.id)) { seen.add(c.id); people.push(c); } }
    const mine = (m) => { const o = {}; for (const k of Object.keys(m)) if (seen.has(k)) o[k] = m[k]; return o; };
    const backup = {
      people, lessons: cleanLessons(d.lessons, 50), good: cleanGood(d.good),
      notes: mine(cleanMap(d.notes, (l) => cleanNotes(l, 30))), events: mine(cleanMap(d.events, (l) => cleanEvents(l, 30))), chats: mine(cleanMap(d.chats, (l) => cleanChat(l, 40))),
      settings: d.settings && typeof d.settings === 'object' ? cleanSettings(d.settings, getSettings()) : null,
      current: typeof d.current === 'string' && seen.has(d.current) ? d.current : null,
    };
    if (!backup.people.length && !backup.lessons.length && !backup.good.length) return bad;
    return { ok: true, backup };
  }
  const personSig = (p) => [p.name, p.date, p.time, p.timeUnknown, p.lat, p.lon, p.zone].join('|');
  function restore(b, mode) {
    let ok = true;
    const w = (k, v) => { if (!writeJSON(k, v)) ok = false; };
    const added = { people: 0, lessons: 0, notes: 0, chats: 0, events: 0 };
    if (mode === 'replace') {
      const people = b.people.slice(0, 50), ids = new Set(people.map((p) => p.id));
      const only = (m) => { const o = {}; for (const k of Object.keys(m)) if (ids.has(k)) o[k] = m[k]; return o; };
      w('people', people); w('lessons', b.lessons); w('good', b.good); w('notes', only(b.notes)); w('events', only(b.events)); w('chats', only(b.chats));
      if (b.settings) { const cur = getSettings(); w('settings', Object.assign({}, b.settings, { consent: cur.consent })); }
      if (b.current && ids.has(b.current)) rawSet('current', b.current); else rawDel('current');
      added.people = people.length; added.lessons = b.lessons.length;
      added.notes = Object.values(b.notes).reduce((a, l) => a + l.length, 0); added.chats = Object.keys(only(b.chats)).length;
      added.events = Object.values(only(b.events)).reduce((a, l) => a + l.length, 0);
      return { ok, added };
    }
    // merge: only add what is not here yet
    const have = getPeople(), haveIds = new Set(have.map((p) => p.id)), haveSig = new Set(have.map(personSig));
    const fresh = b.people.filter((p) => !haveIds.has(p.id) && !haveSig.has(personSig(p))).slice(0, Math.max(0, 50 - have.length));
    const freshIds = new Set(fresh.map((p) => p.id));
    if (fresh.length) w('people', have.concat(fresh));
    const notes = readMap('notes'), chats = readMap('chats');
    for (const id of Object.keys(b.notes)) {
      if (freshIds.has(id)) { notes[id] = b.notes[id]; added.notes += b.notes[id].length; }
      else if (haveIds.has(id)) {
        const cur = cleanNotes(notes[id], 30), texts = new Set(cur.map((n) => n.text));
        const more = b.notes[id].filter((n) => !texts.has(n.text));
        if (more.length) { notes[id] = cur.concat(more).slice(0, 30); added.notes += more.length; }
      }
    }
    const events = readMap('events');
    for (const id of Object.keys(b.events)) {
      if (freshIds.has(id)) { events[id] = b.events[id]; added.events += b.events[id].length; }
      else if (haveIds.has(id)) {
        const cur = cleanEvents(events[id], 30), keys = new Set(cur.map((e) => e.ym + '|' + e.area + '|' + e.text));
        const more = b.events[id].filter((e) => !keys.has(e.ym + '|' + e.area + '|' + e.text));
        if (more.length) { events[id] = cur.concat(more).slice(0, 30); added.events += more.length; }
      }
    }
    if (added.events) w('events', events);
    for (const id of Object.keys(b.chats)) if (freshIds.has(id) || (haveIds.has(id) && !cleanChat(chats[id], 40).length)) { chats[id] = b.chats[id].slice(-30); added.chats++; }
    if (added.notes) w('notes', notes);
    if (added.chats) w('chats', chats);
    const les = getLessons(), lt = new Set(les.map((l) => l.text)), newL = b.lessons.filter((l) => !lt.has(l.text));
    if (newL.length) { w('lessons', cleanLessons(les.concat(newL), 200).slice(-50)); added.lessons = newL.length; }
    const gd = getGood(), gq = new Set(gd.map((g) => g.q)), newG = b.good.filter((g) => !gq.has(g.q));
    if (newG.length) w('good', gd.concat(newG).slice(-10));
    added.people = fresh.length;
    if (!getCurrent() && b.current && (freshIds.has(b.current) || haveIds.has(b.current))) rawSet('current', b.current);
    return { ok, added };
  }
  function persistent() { return !!ls; }

  return { getSettings, setSettings, getPeople, savePerson, deletePerson, getCurrent, setCurrent, getChat, setChat, getNotes, setNotes, getEvents, setEvents, cleanEvents, EVENT_AREAS,
    getLessons, setLessons, addLesson, getGood, addGood, getKeyBlob, setKeyBlob, wipeAll, exportAll, parseBackup, restore, MAX_BACKUP, persistent, cleanLessons, cleanChat, cleanNotes, validZone, MODEL_RE };
});
