/*  Storage. Everything lives in this browser (localStorage) and nowhere else.
    Anything read back is treated as untrusted: it is checked and trimmed before use. */
(function (root, factory) {
  root.JyotishStore = factory(root.JyotishI18n, root.JyotishCrypto);
})(typeof self !== 'undefined' ? self : this, function (I, C) {
  'use strict';

  const NS = 'jyo1:';
  const ID_RE = /^[a-z0-9]{6,32}$/;
  const PROVIDERS = ['gemini', 'groq', 'openrouter'];
  const mem = new Map();
  let ls = null;
  try { ls = window.localStorage; ls.setItem(NS + 't', '1'); ls.removeItem(NS + 't'); } catch (e) { ls = null; }

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
  function getSettings() {
    const d = defaults(); const r = readJSON('settings');
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
  function getChat(pid) {
    return arr(readMap('chats')[pid], 40).map((m) => ({ role: m && m.role === 'ai' ? 'ai' : 'user', text: str(m && m.text, 6000), ts: ts(m && m.ts), id: ID_RE.test(m && m.id) ? m.id : C.randomId() })).filter((m) => m.text);
  }
  function setChat(pid, list) { const all = readMap('chats'); all[pid] = list.slice(-30); writeJSON('chats', all); }
  function getNotes(pid) {
    return arr(readMap('notes')[pid], 30).map((n) => ({ id: ID_RE.test(n && n.id) ? n.id : C.randomId(), text: str(n && n.text, 240), ts: ts(n && n.ts) })).filter((n) => n.text);
  }
  function setNotes(pid, list) { const all = readMap('notes'); all[pid] = list.slice(0, 30); writeJSON('notes', all); }

  // ---- lessons and liked answers -------------------------------------------
  function cleanLessons(v, max) {
    return arr(v, max).map((l) => ({ id: ID_RE.test(l && l.id) ? l.id : C.randomId(), text: str(typeof l === 'string' ? l : l && l.text, 300).trim(), ts: ts(l && l.ts) })).filter((l) => l.text);
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
  function getGood() { return arr(readJSON('good'), 10).map((g) => ({ q: str(g && g.q, 300), a: str(g && g.a, 700), ts: ts(g && g.ts) })).filter((g) => g.q && g.a); }
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
  const KEYS = ['settings', 'people', 'current', 'chats', 'notes', 'lessons', 'good', 'keys'];
  function wipeAll() { KEYS.forEach(rawDel); mem.clear(); }
  function exportAll() {
    return { app: 'rashisvara', version: 1, exportedAt: new Date().toISOString(), settings: getSettings(), people: getPeople(), lessons: getLessons(),
      notes: readMap('notes'), chats: readMap('chats'), note: 'Saved AI keys are never included in exports.' };
  }
  function persistent() { return !!ls; }

  return { getSettings, setSettings, getPeople, savePerson, deletePerson, getCurrent, setCurrent, getChat, setChat, getNotes, setNotes,
    getLessons, setLessons, addLesson, getGood, addGood, getKeyBlob, setKeyBlob, wipeAll, exportAll, persistent, cleanLessons, validZone, MODEL_RE };
});
