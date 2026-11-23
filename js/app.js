/*  App: wires the calculation engine, readings, charts and the AI chat to the screen.
    Rules this file follows: no innerHTML, no inline handlers, no eval, no remote code. */
(function () {
  'use strict';

  const E = window.RsvEngine, R = window.RsvRules, I = window.RsvI18n, TZ = window.RsvTZ, RD = window.RsvReading,
    CH = window.RsvChart, ST = window.RsvStore, CR = window.RsvCrypto, AI = window.RsvAI, DOM = window.RsvDom,
    SND = window.RsvSound, FX = window.RsvFx, O = window.RsvOutlook, V = window.RsvOutlookView, RT = window.RsvRouter, CK = window.RsvChecker, EX = window.RsvExplain;
  const { h, render, clear, richText } = DOM;
  const $ = (id) => document.getElementById(id);

  // Do not run inside someone else's page (clickjacking). A meta tag cannot set frame-ancestors, so this is the backup.
  try {
    if (window.top !== window.self) {
      document.body.textContent = 'This page cannot be shown inside another website. Please open it directly.';
      return;
    }
  } catch (e) { /* cross-origin parent: treat as framed */ document.body.textContent = 'This page cannot be shown inside another website.'; return; }

  const TABS = [['home', 'tabHome'], ['chart', 'tabChart'], ['dasha', 'tabDasha'], ['reading', 'tabReading'], ['understand', 'tabUnderstand'], ['ask', 'tabAsk'], ['learn', 'tabLearn'], ['settings', 'tabSettings']];
  const DEFAULT_AI_LANG = { en: 'English', hi: 'Hindi', bn: 'Bengali', hn: 'Hinglish (Hindi in English letters)' };
  const HTML_LANG = { en: 'en', hi: 'hi', bn: 'bn', hn: 'en-IN' };
  const AUTO_LOCK_MS = 30 * 60 * 1000;

  const S = {
    settings: ST.getSettings(), lang: 'en', tab: 'home', varga: 1, homePeriod: 'day', homeDay: '', ctx: null, ctxChart: null,
    person: null, chart: null, utc: null, editingId: null,
    chat: [], pending: false, sharedLessons: [], placeResults: [],
    session: { key: null, provider: null, remembered: false, lastUse: 0 },
  };
  S.lang = S.settings.lang;

  const t = (k, p) => I.ui(S.lang, k, p);
  const nm = I.name;
  const aiLanguage = () => S.settings.aiLang || DEFAULT_AI_LANG[S.lang];

  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  // =========================================================================
  // Static text, theme, language
  // =========================================================================
  function applyStatic() {
    document.documentElement.lang = HTML_LANG[S.lang] || 'en';
    document.title = t('appName') + ' · ' + t('tagline');
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    const bt = $('btn-theme'); bt.textContent = t('themeLabel') + ': ' + (S.settings.theme === 'dark' ? t('themeDark') : t('themeLight'));
    const bs = $('btn-sound'); bs.textContent = t('sSound') + ': ' + (S.settings.sound ? t('on') : t('off'));
    bs.setAttribute('aria-pressed', S.settings.sound ? 'true' : 'false');
  }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', S.settings.theme);
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', S.settings.theme === 'light' ? '#f6f1e7' : '#0b0a1a');
  }
  function setLang(l) {
    if (!Object.prototype.hasOwnProperty.call(I.LANGS, l)) return;
    S.lang = l; S.settings = ST.setSettings({ lang: l });
    applyStatic(); buildTabs(); renderAll();
  }
  function setTheme(v) { S.settings = ST.setSettings({ theme: v }); applyTheme(); applyStatic(); }
  function setSound(on) { S.settings = ST.setSettings({ sound: on }); SND.setEnabled(on); if (!on) SND.setAmbient(false); applyStatic(); if (on) SND.tap(); }

  // =========================================================================
  // Tabs
  // =========================================================================
  function buildTabs() {
    render($('tabs'), TABS.map(([id, key]) => h('button', {
      type: 'button', role: 'tab', id: 'tab-' + id, 'aria-controls': 'panel-' + id, 'data-tab': id,
      'aria-selected': S.tab === id ? 'true' : 'false', tabindex: S.tab === id ? '0' : '-1', class: 'tab' + (S.tab === id ? ' active' : ''),
    }, t(key))));
  }
  function selectTab(id, focus) {
    if (!TABS.some((x) => x[0] === id)) return;
    S.tab = id;
    TABS.forEach(([tid]) => { $('panel-' + tid).hidden = tid !== id; });
    buildTabs();
    if (focus) $('tab-' + id).focus();
    if (id === 'home') renderHome();
    if (id === 'reading') renderReading();
    if (id === 'dasha') renderDasha();
    if (id === 'understand') renderUnderstand();
    if (id === 'ask') { renderAsk(); }
    if (id === 'learn') renderTeach();
    if (id === 'settings') renderSettings();
    SND.tap();
    window.scrollTo({ top: 0 });
  }

  // =========================================================================
  // Birth form, people, place search
  // =========================================================================
  function tzOptions() {
    const extra = ['Asia/Kolkata', 'Asia/Dhaka', 'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Colombo', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];
    let all = [];
    try { all = Intl.supportedValuesOf('timeZone'); } catch (e) { all = []; }
    return Array.from(new Set(extra.concat(all)));
  }
  // India only for now: the form starts on Indian Standard Time. (Picking a place from the search also sets its own zone.)
  const DEFAULT_ZONE = 'Asia/Kolkata';
  function todayStr() { return new Date().toLocaleDateString('en-CA'); }

  function setFormMsg(text, kind) { const el = $('form-msg'); el.textContent = text || ''; el.className = 'msg' + (kind ? ' ' + kind : ''); }

  function readForm() {
    const name = $('f-name').value.trim().slice(0, 60);
    const date = $('f-date').value, unknown = $('f-time-unknown').checked;
    const time = unknown ? '12:00' : $('f-time').value;
    const lat = parseFloat($('f-lat').value), lon = parseFloat($('f-lon').value);
    const zone = $('f-tz').value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || date > todayStr()) return { error: 'errDate' };
    if (!/^\d{2}:\d{2}$/.test(time)) return { error: 'errTime' };
    if (!Number.isFinite(lat) && !Number.isFinite(lon) && $('f-place').value.trim()) return { error: 'nNeedPick' };
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: 'errLat' };
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) return { error: 'errLon' };
    if (!ST.validZone(zone)) return { error: 'errTz' };
    return { person: { id: S.editingId || CR.randomId(), name, date, time, timeUnknown: unknown, place: $('f-place').value.trim().slice(0, 120), lat, lon, zone } };
  }
  function buildChart(p) {
    const [y, m, d] = p.date.split('-').map(Number);
    const [hh, mm] = (p.timeUnknown ? '12:00' : p.time).split(':').map(Number);
    const u = TZ.localToUtc(y, m, d, hh, mm, 0, p.zone);
    if (u.status === 'nonexistent') return { error: 'tzMissing' };
    return { chart: E.computeChart({ utcMs: u.utcMs, lat: p.lat, lon: p.lon, tzOffsetSec: u.offsetSec }), utc: u };
  }
  function activate(p, b) {
    S.person = p; S.chart = b.chart; S.utc = b.utc; S.editingId = p.id; S.varga = 1; S.ctx = null; S.ctxChart = null;
    S.chat = ST.getChat(p.id);
  }
  function onSubmit(ev) {
    ev.preventDefault();
    const r = readForm();
    if (r.error) { setFormMsg(t(r.error), 'error'); return; }
    const b = buildChart(r.person);
    if (b.error) { setFormMsg(t(b.error), 'error'); return; }
    const DATA_KEYS = ['date', 'time', 'timeUnknown', 'lat', 'lon', 'zone'];
    let before = ST.getPeople().find((x) => x.id === r.person.id);
    // A new name together with new birth data means a different person was typed over the form: keep the old one, add a new entry.
    // (Only renaming, or only correcting the birth data, edits the same person in place.)
    if (before && before.name !== r.person.name && DATA_KEYS.some((k) => before[k] !== r.person[k])) { r.person.id = CR.randomId(); S.editingId = null; before = null; }
    // Editing an existing person's birth data makes the saved chat describe a chart that no longer exists: clear it.
    const changed = before && DATA_KEYS.some((k) => before[k] !== r.person[k]);
    if (!ST.savePerson(r.person)) toast(t('errStore'));
    if (changed && ST.getChat(r.person.id).length) { ST.setChat(r.person.id, []); toast(t('chatReset')); }
    ST.setCurrent(r.person.id);
    activate(r.person, b);
    setFormMsg(b.utc.status === 'ambiguous' ? t('tzAmbiguous') : '', b.utc.status === 'ambiguous' ? 'note' : '');
    renderAll(); selectTab('home'); SND.chime();
  }
  function fillForm(p) {
    $('f-name').value = p ? p.name : ''; $('f-date').value = p ? p.date : '';
    $('f-time').value = p && !p.timeUnknown ? p.time : ''; $('f-time-unknown').checked = !!(p && p.timeUnknown);
    $('f-time').disabled = !!(p && p.timeUnknown);
    $('f-place').value = p ? p.place : ''; $('f-lat').value = p ? String(p.lat) : ''; $('f-lon').value = p ? String(p.lon) : '';
    $('f-tz').value = p ? p.zone : DEFAULT_ZONE;
    clear($('place-results')); $('place-msg').textContent = ''; setFormMsg('');
  }
  function loadPerson(id) {
    const p = ST.getPeople().find((x) => x.id === id);
    if (!p) return;
    fillForm(p);
    const b = buildChart(p);
    if (b.error) { setFormMsg(t(b.error), 'error'); return; }
    ST.setCurrent(p.id); activate(p, b); renderAll();
  }
  function newPerson() {
    S.editingId = null; fillForm(null); renderPeople(); $('f-name').focus();
  }
  function deleteCurrent() {
    if (!S.person || !window.confirm(t('confirmDeletePerson'))) return;
    ST.deletePerson(S.person.id);
    S.person = null; S.chart = null; S.utc = null; S.editingId = null; S.chat = []; S.ctx = null; S.ctxChart = null;
    fillForm(null);
    // another saved person is shown next, so the page is never left empty while charts are still saved
    const rest = ST.getPeople();
    if (rest.length) { const next = rest[0]; fillForm(next); const b = buildChart(next); if (!b.error) { ST.setCurrent(next.id); activate(next, b); } }
    renderAll(); toast(t('personDeleted'));
  }
  function renderPeople() {
    const people = ST.getPeople();
    render($('people-select'), [h('option', { value: '' }, '+ ' + t('newPerson'))].concat(people.map((p) =>
      h('option', { value: p.id, selected: S.editingId === p.id }, (p.name || t('fNameDefault')) + ' · ' + p.date))));
    $('people-select').value = S.editingId || '';
    $('btn-delete-form').hidden = !(S.person && S.editingId === S.person.id);
  }

  // ---- place search (Open-Meteo geocoding; only the typed place name is sent) ----
  const validPlace = (r) => r && typeof r.name === 'string' && Number.isFinite(r.latitude) && Math.abs(r.latitude) <= 90 && Number.isFinite(r.longitude) && Math.abs(r.longitude) <= 180;
  async function searchPlace() {
    const q = $('f-place').value.trim(), box = $('place-results'), msg = $('place-msg');
    clear(box); S.placeResults = [];
    if (q.length < 2) { msg.textContent = t('errPlaceShort'); return; }
    msg.textContent = t('loading');
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q.slice(0, 100)) + '&count=8&format=json&countryCode=IN&language=' + (S.lang === 'hn' ? 'en' : S.lang);
      const res = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      S.placeResults = (data && Array.isArray(data.results) ? data.results : []).filter(validPlace).slice(0, 8);
      if (!S.placeResults.length) { msg.textContent = t('fNoPlace'); return; }
      msg.textContent = t('fPick');
      S.placeResults.forEach((r, i) => {
        const label = [r.name, typeof r.admin1 === 'string' ? r.admin1 : '', typeof r.country === 'string' ? r.country : ''].filter(Boolean).join(', ');
        box.appendChild(h('button', { type: 'button', class: 'place-btn', 'data-i': i }, label));
      });
    } catch (e) { msg.textContent = t('fPlaceFail'); } finally { clearTimeout(timer); }
  }
  function pickPlace(i) {
    const r = S.placeResults[i]; if (!r) return;
    $('f-place').value = [r.name, typeof r.admin1 === 'string' ? r.admin1 : '', typeof r.country === 'string' ? r.country : ''].filter(Boolean).join(', ').slice(0, 120);
    $('f-lat').value = r.latitude.toFixed(4); $('f-lon').value = r.longitude.toFixed(4);
    if (typeof r.timezone === 'string' && ST.validZone(r.timezone)) $('f-tz').value = r.timezone;
    clear($('place-results')); $('place-msg').textContent = ''; SND.tap();
  }

  // =========================================================================
  // Chart tab
  // =========================================================================
  const card = (...kids) => h('section', { class: 'card' }, kids);
  const emptyCard = () => card(h('p', null, t('aNeedChart')));
  const timeWarn = () => h('div', { class: 'warn', role: 'note' }, t('timeUnknownWarn'));
  const bullets = (list) => h('ul', null, list.map((x) => h('li', null, x)));
  // A plain "what is this" box under a screen. Text that is a list (like the divisional charts) becomes bullets.
  const learnBox = (key, extra) => { const v = t(key); return h('div', { class: 'learn' }, Array.isArray(v) ? bullets(v) : h('p', null, v), extra || null); };

  function ashtakaCard() {
    const a = V.ashtakaTable(S.lang, S.chart);
    return card(h('h3', null, t('avTitle')), h('p', { class: 'hint' }, t('avHelp')), learnBox('xLearnAv'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'tbl small av' },
        h('thead', null, h('tr', null, a.head.map((x, i) => h('th', { scope: 'col', class: i >= 1 && i <= 12 && i - 1 === a.lagnaSign ? 'av-lagna' : null }, x)))),
        h('tbody', null, a.rows.map((r, ri) => h('tr', { class: ri === a.rows.length - 1 ? 'av-total' : null }, r.map((x, i) => (i === 0 ? h('th', { scope: 'row' }, x) : h('td', null, x)))))))));
  }
  function renderChart() {
    const out = $('chart-out');
    if (!S.chart) { render(out, card(h('div', { class: 'welcome' }, FX.mandala(120), h('p', null, t('welcome'))))); return; }
    const c = S.chart, L = S.lang, p = S.person, name = p.name || t('fNameDefault');
    const style = S.settings.chartStyle, title = t('chartFor', { name }) + ' · ' + t('v' + S.varga);
    const svg = CH.render(style, c, S.varga, L, title, 'D' + S.varga);
    const head = card(
      h('div', { class: 'row-head' }, h('h2', null, t('chartFor', { name })), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'btn-delete-person' }, t('deletePerson'))),
      h('p', { class: 'meta' }, p.date + (p.timeUnknown ? '' : ' ' + p.time) + (p.place ? ' · ' + p.place : '')),
      h('p', { class: 'hint' }, t('tzUsed', { off: TZ.offsetLabel(S.utc.offsetSec), zone: p.zone })),
      h('p', { class: 'hint' }, t('savePerson')),
      p.timeUnknown ? timeWarn() : null);
    const controls = h('div', { class: 'controls' },
      h('div', { class: 'seg', role: 'group', 'aria-label': t('chartStyle') }, ['north', 'south'].map((k) =>
        h('button', { type: 'button', class: 'seg-btn' + (style === k ? ' on' : ''), 'data-style': k, 'aria-pressed': style === k ? 'true' : 'false' }, t(k === 'north' ? 'cNorth' : 'cSouth')))),
      h('select', { id: 'varga-select', 'aria-label': t('cVarga') }, E.VARGAS.map((v) => h('option', { value: v, selected: S.varga === v }, t('v' + v)))));
    const chartCard = card(controls, h('div', { class: 'chart-wrap' }, svg),
      h('p', { class: 'hint' }, t('cLagna') + ': ' + nm.sign(L, c.asc.sign) + ' ' + E.dms(c.asc.deg)),
      learnBox('xLearnChart', bullets(t('xLearnVarga'))));
    const rows = RD.planetRows(L, c);
    const table = card(learnBox('xLearnTable'), h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['thPlanet', 'thSign', 'thDeg', 'thNak', 'thPada', 'thHouse', 'thState'].map((k) => h('th', { scope: 'col' }, t(k))))),
      h('tbody', null, rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r.name), h('td', null, r.sign), h('td', null, r.deg), h('td', null, r.nak), h('td', null, String(r.pada)), h('td', null, String(r.house)), h('td', null, r.state)))))));
    const pcRows = RD.panchangRows(L, c, p.zone);
    const panch = card(h('h3', null, t('pTitle')), h('dl', { class: 'kv' }, pcRows.map(([k, v]) => [h('dt', null, t(k)), h('dd', null, v)])), learnBox('xLearnPanchang'),
      h('h3', null, t('karakas')), h('p', null, RD.karakaText(L, c)), learnBox('xLearnKaraka'));
    render(out, head, chartCard, table, panch, p.timeUnknown ? null : ashtakaCard());
  }

  // =========================================================================
  // Home tab: day, week, month and year predictions
  // =========================================================================
  const PERIOD_IDS = ['day', 'week', 'month', 'year'];
  // The slow part (Ashtakavarga and natal scoring) is done once per chart and kept.
  function outlookCtx() {
    if (!S.ctx || S.ctxChart !== S.chart) { S.ctx = O.makeCtx(S.chart, { zone: S.person.zone, timeUnknown: S.person.timeUnknown }); S.ctxChart = S.chart; }
    return S.ctx;
  }
  const placeText = () => S.person.place || (S.person.lat.toFixed(2) + ', ' + S.person.lon.toFixed(2));
  function meterEl(pct) { const m = h('div', { class: 'meter' }, h('i')); m.firstChild.style.setProperty('--w', pct + '%'); return m; }
  function predCard(c, big) {
    const slots = [];
    if (c.best.length) slots.push(h('p', { class: 'slots good' }, h('strong', null, c.bestTitle + ': '), c.best.join(' · ')));
    if (c.caution.length) slots.push(h('p', { class: 'slots care' }, h('strong', null, c.cautionTitle + ': '), c.caution.join(' · ')));
    return h('article', { class: 'card area pred' + (big ? ' pred-big' : ''), 'data-area': c.key },
      h('div', { class: 'area-head' }, h('h3', null, c.title), h('span', { class: 'badge b-' + c.labelKey }, c.label)),
      meterEl(c.bar), h('p', null, c.sentence),
      c.example ? h('div', { class: 'example' }, h('strong', null, c.exampleHead + ' '), c.example) : null, slots,
      h('details', null, h('summary', null, t('oWhy')), h('ul', null, c.lines.map((l) => h('li', null, l))), h('p', { class: 'recent' }, t('xRecentCheck'))));
  }
  function renderHome() {
    const out = $('home-out');
    if (!S.chart) {
      render(out, card(h('div', { class: 'welcome' }, FX.mandala(120), h('h2', null, t('oTitle')), h('p', null, t('oNeedChart')),
        h('button', { type: 'button', class: 'btn btn-primary btn-big', id: 'btn-home-enter' }, t('oEnter')))));
      return;
    }
    const L = S.lang, p = S.person, name = p.name || t('fNameDefault'), now = Date.now();
    const raw = O.periodOutlook(outlookCtx(), S.homePeriod, now, 0);
    const m = V.periodModel(L, raw, p.zone, placeText());
    const ras = EX.rashi(L, S.chart, !!p.timeUnknown), mt = EX.moonToday(L, raw);
    S.homeDay = RD.fmtDate(now, p.zone);
    const seg = h('div', { class: 'seg seg-4', role: 'group', 'aria-label': t('oPeriodLabel') }, PERIOD_IDS.map((k) =>
      h('button', { type: 'button', class: 'seg-btn' + (S.homePeriod === k ? ' on' : ''), 'data-period': k, 'aria-pressed': S.homePeriod === k ? 'true' : 'false' }, V.periodTitle(L, k))));
    render(out,
      card(h('h2', null, t('oFor', { name })), h('p', { class: 'hint' }, t('oIntro')), seg, h('p', { class: 'meta' }, m.range),
        m.reduced ? h('div', { class: 'warn', role: 'note' }, t('oReduced')) : null),
      h('section', { class: 'card rashi-card' }, h('h3', null, ras.title), bullets(ras.lines)),
      h('section', { class: 'card moon-card ' + (mt.good ? 'good' : 'care') }, h('h3', null, mt.title), bullets(mt.lines)),
      learnBox('xLearnHome'),
      predCard(m.overall, true),
      h('div', { class: 'areas pred-grid' }, m.areas.map((c) => predCard(c, false))),
      m.dayRows.length ? card(h('h3', null, t('oDayTitle')), h('dl', { class: 'kv' }, m.dayRows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])), h('p', { class: 'hint' }, m.dayNote)) : null,
      m.period !== 'day' ? card(h('h3', null, t('oEvTitle')), m.events.length ? h('ul', null, m.events.map((x) => h('li', null, x))) : h('p', { class: 'hint' }, t('oEvNone'))) : null,
      card(h('details', null, h('summary', null, t('oHowTitle')), h('ul', null, t('oHowList').map((x) => h('li', null, x)))), h('p', { class: 'hint' }, t('oNote'))),
      card(h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-primary', id: 'btn-home-ask' }, t('oAskBtn')),
        h('button', { type: 'button', class: 'btn btn-ghost', id: 'btn-home-understand' }, t('xTitle')),
        h('button', { type: 'button', class: 'btn btn-ghost', id: 'btn-pdf' }, t('oPdf'))), h('p', { class: 'hint' }, t('oPdfHelp'))),
      manageCard());
  }
  // Switch between saved people, add another person, or delete this one: all from the front page.
  function manageCard() {
    const people = ST.getPeople();
    return card(h('h3', null, t('nHomeManage')), h('p', { class: 'hint' }, t('nHomeManageHelp')),
      h('label', { class: 'field' }, h('span', null, t('nPickPerson')),
        h('select', { id: 'home-people' }, people.map((x) => h('option', { value: x.id, selected: S.person && S.person.id === x.id }, (x.name || t('fNameDefault')) + ' · ' + x.date)))),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn btn-primary', id: 'btn-home-another' }, t('nAnother')),
        h('button', { type: 'button', class: 'btn btn-danger', id: 'btn-home-delete' }, t('nDeleteHome'))));
  }

  // =========================================================================
  // Dasha tab
  // =========================================================================
  function bar(v) {
    const i = h('i'); i.style.setProperty('--w', v + '%');
    return h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(v) }, i);
  }
  function dashaNowCard() {
    const c = S.chart, L = S.lang, zone = S.person.zone, now = Date.now();
    const cur = E.periodAt(c.dasha, now);
    if (!cur) return card(h('p', null, '-'));
    const row = (label, p) => p && h('div', { class: 'dnow' },
      h('div', { class: 'dlabel' }, label), h('div', { class: 'dplanet' }, nm.planet(L, p.lord)),
      h('div', { class: 'dates' }, RD.fmtDate(p.start, zone) + ' – ' + RD.fmtDate(p.end, zone)), bar(RD.pct(p.start, p.end, now)));
    return card(h('h3', null, t('dNow')), row(t('dMaha'), cur.maha), row(t('dAntar'), cur.antar), row(t('dPraty'), cur.pratyantar));
  }
  function renderDasha() {
    const out = $('dasha-out');
    if (!S.chart) { render(out, emptyCard()); return; }
    const c = S.chart, L = S.lang, zone = S.person.zone, now = Date.now(), born = c.input.utcMs;
    const cur = E.periodAt(c.dasha, now);
    const list = c.dasha.list.filter((m) => m.end > born && m.start < born + 125 * 365.25 * 86400000).map((m) => {
      const isNow = cur && cur.maha.lord === m.lord && cur.maha.start === m.start;
      const subs = E.subPeriods(m);
      return h('details', { class: 'dasha-item' + (isNow ? ' now' : ''), open: isNow },
        h('summary', null, h('strong', null, nm.planet(L, m.lord)), ' ', RD.fmtDate(Math.max(m.start, born), zone) + ' – ' + RD.fmtDate(m.end, zone)),
        bullets([EX.dashaTheme(L, m.lord)].concat(S.person.timeUnknown ? [] : [EX.dashaWhy(L, c, m.lord)])),
        h('div', { class: 'table-wrap' }, h('table', { class: 'tbl small' },
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('dAntar')), h('th', { scope: 'col' }, t('dStart')), h('th', { scope: 'col' }, t('dEnd')))),
          h('tbody', null, subs.map((a) => h('tr', { class: cur && cur.antar && cur.antar.start === a.start && isNow ? 'now' : '' },
            h('th', { scope: 'row' }, nm.planet(L, a.lord)), h('td', null, RD.fmtDate(Math.max(a.start, born), zone)), h('td', null, RD.fmtDate(a.end, zone))))))));
    });
    render(out,
      card(h('h2', null, t('dTitle')), h('p', null, t('dBalance', { lord: nm.planet(L, c.dasha.balance.lord), years: c.dasha.balance.years.toFixed(2) })),
        S.person.timeUnknown ? timeWarn() : null, h('p', { class: 'hint' }, t('dNote')), learnBox('xDashaWhat')),
      h('div', { id: 'dasha-now' }, dashaNowCard()),
      (() => { const tl = EX.timeline(L, c, now, zone); return tl.notes.length ? card(h('h3', null, t('xSecNow')), bullets(tl.notes), h('p', { class: 'hint' }, tl.ageNote)) : null; })(), list);
  }

  // =========================================================================
  // Reading tab
  // =========================================================================
  const TONE_LABEL = { good: 'toneGood', caution: 'toneCaution', neutral: 'toneNeutral' };
  function areaCard(v) {
    const meter = h('div', { class: 'meter' }, h('i')); meter.firstChild.style.setProperty('--w', v.bar + '%');
    const why = h('details', null, h('summary', null, t('rWhy')),
      v.houses.map((hh) => [h('h4', null, hh.title), h('ul', null, hh.lines.map((l) => h('li', null, l)))]),
      v.karakaLines.length ? h('ul', null, v.karakaLines.map((l) => h('li', null, l))) : null,
      v.activeLines.length ? h('ul', { class: 'active-list' }, v.activeLines.map((l) => h('li', null, l))) : null,
      h('h4', null, t('rWindows')), v.windows.length ? h('ul', null, v.windows.map((l) => h('li', null, l))) : h('p', { class: 'hint' }, t('rNoWindows')));
    return h('article', { class: 'card area' },
      h('div', { class: 'area-head' }, h('h3', null, v.title), h('span', { class: 'badge b-' + v.labelKey }, v.label)),
      h('p', { class: 'hint' }, v.sub), meter, why);
  }
  function renderReading() {
    const out = $('reading-out');
    if (!S.chart) { render(out, emptyCard()); return; }
    const c = S.chart, L = S.lang, zone = S.person.zone, now = Date.now();
    const areas = R.allAreas(c, now), yogas = R.yogas(c);
    const views = Object.keys(areas).map((k) => RD.areaView(L, c, areas[k], zone));
    const yv = yogas.map((y) => RD.yogaView(L, c, y));
    render(out,
      S.person.timeUnknown ? timeWarn() : null,
      card(h('h2', null, t('rTitle')), h('p', { class: 'hint' }, t('rNote')), learnBox('xLearnAreas')),
      h('div', { class: 'areas' }, views.map(areaCard)),
      card(h('h2', null, t('rYogas')), learnBox('xLearnYoga'), yv.length ? yv.map((v) => h('article', { class: 'yoga tone-' + v.tone },
        h('h4', null, v.name, ' ', h('span', { class: 'tone' }, t(TONE_LABEL[v.tone]))), h('p', null, v.text))) : h('p', null, t('rNoYogas'))),
      card(h('h2', null, t('rTransit')), learnBox('xLearnLive'), h('div', { id: 'live-card' })));
    renderLive();
  }
  function renderLive() {
    const el = $('live-card'); if (!el || !S.chart) return;
    const now = Date.now(), L = S.lang, unk = S.person.timeUnknown;
    const tr = E.transits(S.chart, now), v = RD.transitView(L, S.chart, tr, S.person.zone);
    const stamp = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(now));
    render(el,
      h('p', { class: 'hint live' }, h('span', { class: 'live-dot', 'aria-hidden': 'true' }), t('liveNote') + ' ' + t('updatedAt', { t: stamp })),
      h('ul', null, v.lines.map((l) => h('li', null, l))),
      h('div', { class: 'table-wrap' }, h('table', { class: 'tbl small' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('thPlanet')), h('th', { scope: 'col' }, t('thSign')), h('th', { scope: 'col' }, t('thDeg')), h('th', { scope: 'col' }, t('thNak')),
          unk ? null : h('th', { scope: 'col' }, t('thFromLagna')), h('th', { scope: 'col' }, t('thFromMoon')))),
        h('tbody', null, v.rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r.name + (r.retro ? ' (R)' : '')), h('td', null, r.sign), h('td', null, r.deg), h('td', null, r.nak),
          unk ? null : h('td', null, String(r.hLagna)), h('td', null, String(r.hMoon))))))));
  }
  // Every minute: refresh the live sky and the running dasha bars (only while the page is visible).
  function tick() {
    if (document.hidden || !S.chart) return;
    if (S.tab === 'home' && S.person && RD.fmtDate(Date.now(), S.person.zone) !== S.homeDay) renderHome();   // a new day began
    if (S.tab === 'reading') renderLive();
    if (S.tab === 'dasha') { const el = $('dasha-now'); if (el) render(el, dashaNowCard()); }
  }

  // =========================================================================
  // Understand tab: the chart in plain words, life periods, why now, and the person's own life events
  // =========================================================================
  const YM_OK = /^(19|20)\d\d-(0[1-9]|1[0-2])$/;
  function eventsCard() {
    const L = S.lang, c = S.chart, p = S.person, unk = !!p.timeUnknown, now = Date.now();
    const areaName = (k) => t('xAreaNames')[ST.EVENT_AREAS.indexOf(k)];
    const list = ST.getEvents(p.id).slice().sort((a, b) => (a.ym < b.ym ? 1 : a.ym > b.ym ? -1 : 0));
    const bornYm = new Date(c.input.utcMs).toISOString().slice(0, 7), nowYm = new Date(now).toISOString().slice(0, 7);
    const items = list.map((ev) => {
      const r = EX.eventLink(L, c, ev, unk, now);
      if (r.error) return h('div', { class: 'ev-item' }, h('h4', null, ev.ym + ' · ' + areaName(ev.area), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-del-event': ev.id }, t('xEvDel'))), h('p', { class: 'hint' }, t(r.error)));
      const body = r.lines.slice(0, -1), verdict = r.lines[r.lines.length - 1];
      return h('div', { class: 'ev-item' },
        h('h4', null, ev.ym + ' · ' + areaName(ev.area), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-del-event': ev.id }, t('xEvDel'))),
        bullets(body), h('p', { class: 'ev-link ev-' + r.level }, verdict));
    });
    return card(h('h2', null, t('xSecEvents')), h('p', null, t('xEvIntro')),
      h('div', { class: 'ev-form' },
        h('label', { class: 'field' }, h('span', null, t('xEvMonth')), h('input', { id: 'ev-month', type: 'month', min: bornYm, max: nowYm, placeholder: 'YYYY-MM' })),
        h('label', { class: 'field' }, h('span', null, t('xEvArea')), h('select', { id: 'ev-area' }, ST.EVENT_AREAS.map((k) => h('option', { value: k }, areaName(k))))),
        h('label', { class: 'field wide' }, h('span', null, t('xEvText')), h('input', { id: 'ev-text', type: 'text', maxlength: '120', placeholder: t('xEvTextPh') }))),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', id: 'btn-add-event' }, t('xEvAdd'))),
      items.length ? [h('div', null, items), h('p', { class: 'hint' }, t('xEvCaution'))] : h('p', { class: 'hint' }, t('xEvNone')));
  }
  function renderUnderstand() {
    const out = $('understand-out');
    const head = card(h('h2', null, t('xTitle')), h('p', null, t('xIntro')));
    if (!S.chart) { render(out, head, card(h('p', null, t('xNeedChart')))); return; }
    const c = S.chart, L = S.lang, p = S.person, unk = !!p.timeUnknown, zone = p.zone, now = Date.now();
    const ras = EX.rashi(L, c, unk);
    const who = [h('section', { class: 'card rashi-card' }, h('h3', null, ras.title), bullets(ras.lines))];
    if (unk) who.push(card(h('p', null, t('xNeedTime'))));
    else {
      const a = EX.ascendant(L, c);
      who.push(card(h('h3', null, a.head), bullets(a.lines), h('p', { class: 'hint' }, t('xHousesNote')),
        h('ul', { class: 'houses' }, EX.housesGuide(L).map((x) => h('li', null, h('b', null, x.h + '.'), x.text)))));
    }
    const planets = h('div', { class: 'ugrid' }, EX.planetCards(L, c, unk).map((pc) => h('article', { class: 'card ucard' }, h('h3', null, pc.head), bullets(pc.lines))));
    let timeline;
    if (unk) timeline = card(h('p', null, t('xNeedTime')));
    else {
      const tl = EX.timeline(L, c, now, zone);
      timeline = [tl.items.map((it) => h('article', { class: 'tl-item tl-' + it.status },
        h('h3', null, it.planet, h('span', { class: 'tl-tag' }, it.statusText)), h('p', { class: 'hint' }, it.range), bullets(it.lines))),
      h('p', { class: 'hint' }, tl.ageNote)];
    }
    let nowLines = [];
    try {
      const year = unk ? null : O.periodOutlook(outlookCtx(), 'year', now, 0);
      if (!unk) nowLines = EX.timeline(L, c, now, zone).notes;
      nowLines = nowLines.concat(EX.nowSummary(L, c, year, now).lines);
    } catch (e) { nowLines = []; }
    render(out, head,
      h('h2', { class: 'sec' }, t('xSecWho')), who,
      h('h2', { class: 'sec' }, t('xSecPlanets')), planets,
      h('h2', { class: 'sec' }, t('xSecTimeline')), timeline,
      nowLines.length ? card(h('h2', null, t('xSecNow')), bullets(nowLines)) : null,
      eventsCard());
  }
  function addEvent() {
    if (!S.person || !S.chart) return;
    const ym = $('ev-month').value.trim(), area = $('ev-area').value, text = $('ev-text').value.trim().slice(0, 120);
    if (!YM_OK.test(ym) || !ST.EVENT_AREAS.includes(area)) { toast(t('xEvBad')); return; }
    const r = EX.eventLink(S.lang, S.chart, { ym, area, text }, !!S.person.timeUnknown, Date.now());
    if (r.error) { toast(t(r.error)); return; }
    const list = ST.getEvents(S.person.id);
    if (list.length >= 30) { toast(t('xEvMany')); return; }
    list.push({ id: CR.randomId(), ym, area, text });
    if (!ST.setEvents(S.person.id, list)) { toast(t('errStore')); return; }
    renderUnderstand(); SND.soft();
  }

  // =========================================================================
  // Lessons and notes (what the AI "learns")
  // =========================================================================
  function allLessonTexts() {
    const seen = new Set(), out = [];
    for (const x of S.sharedLessons.concat(ST.getLessons().map((l) => l.text))) if (!seen.has(x)) { seen.add(x); out.push(x); }
    return out.slice(0, 40);
  }
  async function loadSharedLessons() {
    try {
      const res = await fetch('data/lessons.json', { credentials: 'omit', cache: 'no-cache' });
      if (!res.ok) return;
      const j = await res.json();
      S.sharedLessons = ST.cleanLessons(Array.isArray(j) ? j : j && j.lessons, 50).map((l) => l.text);
    } catch (e) { S.sharedLessons = []; }
  }
  function download(name, obj) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
    const a = h('a', { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  function renderTeach() {
    const out = $('teach-out');
    const mine = ST.getLessons();
    const notes = S.person ? ST.getNotes(S.person.id) : [];
    const lessonItem = (l, own) => h('li', { class: 'lesson' }, h('span', null, l.text || l),
      own ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-del-lesson': l.id }, t('lDelete')) : null);
    render(out,
      card(h('h2', null, t('lTitle')), h('p', { class: 'hint' }, t('lHelp')),
        h('label', { class: 'field' }, h('span', null, t('lAdd')), h('textarea', { id: 'lesson-text', rows: '3', maxlength: '300', placeholder: t('lPlaceholder') })),
        h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', id: 'btn-add-lesson' }, t('lAdd')),
          h('button', { type: 'button', class: 'btn btn-ghost', id: 'btn-export-lessons' }, t('lExport')),
          h('label', { class: 'btn btn-ghost file-btn' }, t('lImport'), h('input', { type: 'file', id: 'lesson-file', accept: 'application/json,.json', class: 'sr-only' }))),
        S.sharedLessons.length ? [h('h3', null, t('lShared')), h('ul', { class: 'lessons' }, S.sharedLessons.map((x) => lessonItem(x, false)))] : null,
        h('h3', null, t('lMine')), mine.length ? h('ul', { class: 'lessons' }, mine.map((l) => lessonItem(l, true))) : h('p', { class: 'hint' }, t('lEmpty')),
        h('p', { class: 'hint' }, t('lStats', { l: mine.length + S.sharedLessons.length, g: ST.getGood().length, m: S.chat.length }))),
      S.person ? card(h('h2', null, t('notesTitle')), h('p', { class: 'hint' }, t('notesHelp')),
        h('label', { class: 'field' }, h('span', null, t('noteAdd')), h('input', { id: 'note-text', type: 'text', maxlength: '240', placeholder: t('notePlaceholder') })),
        h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', id: 'btn-add-note' }, t('noteAdd'))),
        notes.length ? h('ul', { class: 'lessons' }, notes.map((n) => h('li', { class: 'lesson' }, h('span', null, n.text),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-del-note': n.id }, t('lDelete'))))) : h('p', { class: 'hint' }, t('notesEmpty'))) : card(h('p', null, t('aNeedChart'))));
  }
  async function importLessons(file) {
    if (!file || file.size > 200000) { toast(t('errFile')); return; }
    try {
      const j = JSON.parse(await file.text());
      const incoming = ST.cleanLessons(Array.isArray(j) ? j : j && j.lessons, 50);
      if (!incoming.length) { toast(t('errFile')); return; }
      const cur = ST.getLessons(), have = new Set(cur.map((l) => l.text));
      incoming.forEach((l) => { if (!have.has(l.text)) { cur.push(l); have.add(l.text); } });
      ST.setLessons(cur.slice(-50)); renderTeach(); toast(t('aSaved'));
    } catch (e) { toast(t('errFile')); }
  }

  // =========================================================================
  // Ask tab (AI chat)
  // =========================================================================
  function getKey() {
    const k = S.session;
    if (!k.key || k.provider !== S.settings.provider) return null;
    if (k.remembered && Date.now() - k.lastUse > AUTO_LOCK_MS) { k.key = null; return null; }
    k.lastUse = Date.now();
    return k.key;
  }
  function errText(e) {
    const m = { key: 'aErrKey', rate: 'aErrRate', model: 'aErrModel', network: 'aErrNet', empty: 'aErrEmpty', timeout: 'aErrTimeout', server: 'aErrServer' };
    if (e && e.code && m[e.code]) return t(m[e.code]);
    return t('aErrReq', { msg: (e && e.message ? String(e.message) : '').slice(0, 200) });
  }
  async function ensureModel(key) {
    const prov = S.settings.provider;
    let model = S.settings.models[prov];
    if (model) return model;
    const ids = await AI.listModels(prov, key);
    model = AI.pickDefault(prov, ids);
    if (!model) throw new AI.AIError('model', 'No model');
    S.settings = ST.setSettings({ models: { [prov]: model } });
    return model;
  }
  function checkNote(m) {
    if (!m.ck) return null;
    const text = m.ck === 'warn' ? t('ckWarn', { list: (m.ckList || []).join('; ') }) : t({ ok: 'ckOk', fixed: 'ckFixed', none: 'ckNone' }[m.ck]);
    return h('p', { class: 'check-note ck-' + m.ck, role: 'note' }, text);
  }
  // An instant answer can be taken further by the AI, but only for a question the chart rules understood (never for a safety reply).
  function canExplainMore(prev) {
    if (!prev || prev.role !== 'user' || !getKey()) return false;   // the AI button only appears once a key is ready
    const pr = RT.parse(prev.text, new Date().getUTCFullYear());
    return !!(pr.area || pr.topic) && !pr.safety;
  }
  function chatBubble(m, prev) {
    if (m.role === 'user') return h('div', { class: 'msg-row user' }, h('div', { class: 'bubble user' }, h('span', { class: 'who' }, t('aYou')), h('p', null, m.text)));
    const body = m.pending ? h('p', { class: 'pending' }, t('aThinking')) : m.error ? h('p', { class: 'err' }, m.text) : richText(m.text);
    let acts = null;
    if (!m.pending && !m.error) {
      acts = m.local
        ? (canExplainMore(prev) ? h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-deeper': m.id }, t('qaDeeper'))) : null)
        : h('div', { class: 'acts' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-good': m.id }, t('aGood')),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-bad': m.id }, t('aBad')));
    }
    return h('div', { class: 'msg-row ai' }, h('div', { class: 'bubble ai' + (m.error ? ' error' : '') + (m.local ? ' local' : ''), 'data-id': m.id },
      h('span', { class: 'who' }, t('aAstro')), m.local ? h('span', { class: 'badge-local' }, t('qaBadge')) : null, body, m.pending || m.error ? null : checkNote(m), acts));
  }
  function renderChat() {
    const log = $('chat-log'); if (!log) return;
    render(log, S.chat.length ? S.chat.map((m, i) => chatBubble(m, S.chat[i - 1])) : h('p', { class: 'hint' }, t('aNoMessages')));
    log.scrollTop = log.scrollHeight;
  }
  // The fact sheet: the chart facts plus this moment's outlooks, so the AI quotes the app's own numbers.
  function factsNow(person, chart) {
    const p = person || S.person, c = chart || S.chart, nowMs = Date.now();
    const base = RD.factsForAI(c, { nowMs, zone: p.zone, timeUnknown: p.timeUnknown });
    try {
      const ctx = c === S.chart ? outlookCtx() : O.makeCtx(c, { zone: p.zone, timeUnknown: p.timeUnknown });
      const outs = {}; PERIOD_IDS.forEach((k) => { outs[k] = O.periodOutlook(ctx, k, nowMs, 0); });
      return base + '\n\n' + V.factsLines(c, outs, p.zone, !!p.timeUnknown).join('\n');
    } catch (e) { return base; }
  }
  const chatForSave = (list) => list.filter((m) => !m.error && !m.pending).map((m) => ({ role: m.role, text: m.text, ts: m.ts, id: m.id, local: m.local, ck: m.ck, ckList: m.ckList }));
  function renderAsk() {
    const out = $('ask-out');
    const draft = $('q-text') ? $('q-text').value : '';
    if (!S.chart) { render(out, emptyCard()); return; }
    const langSel = h('select', { id: 'ai-lang', 'aria-label': t('aLang') }, I.AI_LANGS.map((l) => h('option', { value: l, selected: l === aiLanguage() }, l)));
    const facts = h('details', { id: 'facts-box' }, h('summary', null, t('factsUsed')), h('pre', { id: 'facts-pre', class: 'facts' }), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'btn-copy-facts' }, t('copy')));
    render(out,
      card(h('h2', null, t('aTitle')), h('p', null, t('qaIntro')), h('p', { class: 'hint' }, t('aGuard')),
        h('div', { id: 'chat-log', class: 'chat-log', 'aria-live': 'polite' }),
        h('div', { class: 'chips' }, t('aChips').map((q) => h('button', { type: 'button', class: 'chip', 'data-q': q }, q))),
        h('form', { id: 'ask-form', class: 'ask-form' },
          h('label', { class: 'sr-only', for: 'q-text' }, t('aPlaceholder')),
          h('textarea', { id: 'q-text', rows: '2', maxlength: '1500', placeholder: t('aPlaceholder') }),
          h('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-send' }, t('aSend'))),
        h('div', { class: 'ask-tools' }, h('label', { class: 'inline-label' }, h('span', null, t('aLang')), langSel),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'btn-clear-chat' }, t('aClear')))),
      card(facts));
    if (draft) $('q-text').value = draft;
    renderChat();
  }
  function saveChat() { if (S.person) ST.setChat(S.person.id, chatForSave(S.chat)); }
  function pushLocal(person, chatRef, q, text) {
    const now = Date.now();
    chatRef.push({ role: 'user', text: q, ts: now, id: CR.randomId() });
    chatRef.push({ role: 'ai', text, ts: now, id: CR.randomId(), local: true });
    ST.setChat(person.id, chatForSave(chatRef));
  }
  // 1) the chart rules answer at once, with no key and no AI; 2) anything else goes to the AI if the person has set a key.
  async function sendQuestion(raw) {
    const q = String(raw || '').trim().slice(0, 1500);
    if (!q || S.pending) return;
    if (!S.chart) { toast(t('aNeedChart')); return; }
    const person = S.person, chart = S.chart, chatRef = S.chat;
    let quick;
    try { quick = RT.answer(S.lang, chart, { text: q, nowMs: Date.now(), zone: person.zone, timeUnknown: person.timeUnknown, ctx: outlookCtx() }); }
    catch (e) { quick = { kind: 'nomatch', text: t('qaNoMatch') }; }
    const box = $('q-text');
    if (quick.kind !== 'nomatch') { pushLocal(person, chatRef, q, quick.text); if (box) box.value = ''; renderChat(); SND.soft(); return; }
    const key = getKey();
    if (!key) { pushLocal(person, chatRef, q, quick.text); if (box) box.value = ''; renderChat(); return; }
    if (!S.settings.consent) { toast(t('sConsentNeeded')); selectTab('settings'); return; }
    await askAI(q, key);
  }
  function explainMore(q) {
    if (S.pending) return;
    const key = getKey();
    if (!S.settings.consent) { toast(t('sConsentNeeded')); selectTab('settings'); return; }
    if (!key) { toast(t('aNeedKey')); selectTab('settings'); return; }
    askAI(q, key);
  }
  async function askAI(q, key) {
    // Remember WHICH person and chat this question belongs to. The person may switch charts while the answer is on its way,
    // and the facts sent and the reply saved must never end up on someone else's chart.
    const person = S.person, chart = S.chart, chatRef = S.chat, provider = S.settings.provider;
    S.pending = true; const sendBtn = $('btn-send'); if (sendBtn) sendBtn.disabled = true;
    chatRef.push({ role: 'user', text: q, ts: Date.now(), id: CR.randomId() });
    const pend = { role: 'ai', text: '', pending: true, id: CR.randomId(), ts: Date.now() };
    chatRef.push(pend); renderChat(); const box = $('q-text'); if (box) box.value = '';
    try {
      const model = await ensureModel(key);
      const nowMs = Date.now(), facts = factsNow(person, chart);
      const system = AI.systemPrompt({ facts, language: aiLanguage(), lessons: allLessonTexts(), notes: ST.getNotes(person.id).map((n) => n.text), good: ST.getGood() });
      // Instant answers from the chart rules (and the questions they answered) are left out of what the AI sees: the fact sheet already holds those numbers.
      const hist = chatRef.filter((m) => !m.error && !m.pending);
      const messages = hist.filter((m, i) => !m.local && !(m.role === 'user' && hist[i + 1] && hist[i + 1].local)).map((m) => ({ role: m.role, text: m.text }));
      const ask = (msgs) => AI.ask({ provider, model, key, system, messages: msgs });
      const judge = (txt) => CK.evaluate({ text: txt, chart, nowMs, timeUnknown: person.timeUnknown, facts });
      let text = await ask(messages), v = judge(text), status;
      if (v.problems.length) {
        // The answer disagrees with the chart: ask the AI once to correct it, and say so if it still does.
        let second = null;
        try { const t2 = await ask(messages.concat([{ role: 'ai', text }, { role: 'user', text: CK.correctionMessage(v.problems) }])); const v2 = judge(t2); if (v2.visible) second = { text: t2, v: v2 }; } catch (e) { second = null; }
        if (second && !second.v.problems.length) { text = second.text; v = second.v; status = 'fixed'; }
        else { if (second && second.v.problems.length <= v.problems.length) { text = second.text; v = second.v; } status = 'warn'; }
      } else status = v.checked > 0 ? 'ok' : 'none';
      if (!v.visible) throw new AI.AIError('empty', 'Empty answer');
      pend.pending = false; pend.text = v.visible; pend.ts = Date.now(); pend.ck = status;
      if (status === 'warn') pend.ckList = v.problems.slice(0, 5).map((x) => CK.describe(S.lang, x)).filter(Boolean);
      SND.soft();
    } catch (e) {
      pend.pending = false; pend.error = true; pend.text = t('aError', { msg: errText(e) });
    } finally {
      S.pending = false; const b = $('btn-send'); if (b) b.disabled = false;
      ST.setChat(person.id, chatForSave(chatRef));
      if (S.chat === chatRef) renderChat();
    }
  }
  function onChatClick(ev) {
    const g = ev.target.closest('[data-good]'), b = ev.target.closest('[data-bad]'), dp = ev.target.closest('[data-deeper]');
    if (dp) {
      const i = S.chat.findIndex((m) => m.id === dp.getAttribute('data-deeper'));
      if (i > 0 && S.chat[i - 1].role === 'user') explainMore(S.chat[i - 1].text);
    } else if (g) {
      const i = S.chat.findIndex((m) => m.id === g.getAttribute('data-good'));
      if (i > 0 && S.chat[i - 1].role === 'user') { ST.addGood(S.chat[i - 1].text, S.chat[i].text); toast(t('aSaved')); g.disabled = true; }
    } else if (b) {
      const bubble = b.closest('.bubble');
      if (bubble.querySelector('.teach-box')) return;
      const ta = h('textarea', { rows: '2', maxlength: '300', placeholder: t('aTeach'), class: 'teach-text' });
      const save = h('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-save-lesson': '1' }, t('lAdd'));
      bubble.appendChild(h('div', { class: 'teach-box' }, ta, save)); ta.focus();
    } else if (ev.target.closest('[data-save-lesson]')) {
      const box = ev.target.closest('.teach-box'), val = box.querySelector('textarea').value.trim();
      if (val) { ST.addLesson(val); toast(t('aSaved')); box.remove(); }
    }
  }

  // =========================================================================
  // Settings tab
  // =========================================================================
  function keyStatusText() {
    if (getKey()) return t('sKeyReady');
    return ST.getKeyBlob(S.settings.provider) ? t('sKeyLocked') : t('sNoKey');
  }
  function renderSettings() {
    const out = $('settings-out'), prov = S.settings.provider, P = AI.PROVIDERS[prov], blob = ST.getKeyBlob(prov), ready = !!getKey();
    const bullets = (key) => h('ul', null, t(key).map((x) => h('li', null, x)));
    render(out,
      card(h('h2', null, t('sTitle')),
        h('div', { class: 'grid' },
          h('label', { class: 'field' }, h('span', null, t('langLabel')), h('select', { id: 's-lang' }, Object.keys(I.LANGS).map((k) => h('option', { value: k, selected: k === S.lang }, I.LANGS[k])))),
          h('label', { class: 'field' }, h('span', null, t('themeLabel')), h('select', { id: 's-theme' }, [['dark', 'themeDark'], ['light', 'themeLight']].map(([v, k]) => h('option', { value: v, selected: v === S.settings.theme }, t(k)))))),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 's-sound', checked: S.settings.sound }), h('span', null, t('sSound'))),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 's-ambient', checked: S.settings.ambient }), h('span', null, t('sTone')))),
      card(h('h2', null, t('sProvider')), h('p', { class: 'hint' }, t('sKeyOptional')),
        h('label', { class: 'field' }, h('span', null, t('sProvider')), h('select', { id: 's-provider' }, Object.keys(AI.PROVIDERS).map((k) => h('option', { value: k, selected: k === prov }, AI.PROVIDERS[k].name)))),
        h('p', { class: 'hint' }, t('sKeyHelp'), ' ', h('a', { href: P.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, t('sGetKey') + ' (' + P.name + ')')),
        h('p', { class: 'status', id: 's-key-status' }, keyStatusText()),
        h('label', { class: 'field' }, h('span', null, t('sKey')), h('input', { id: 's-key', type: 'password', autocomplete: 'off', spellcheck: 'false', maxlength: '300' })),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 's-remember' }), h('span', null, t('sRemember'))),
        h('p', { class: 'hint' }, t('sSessionOnly') + ' ' + t('sAutoLock')),
        h('label', { class: 'field' }, h('span', null, t('sPass')), h('input', { id: 's-pass', type: 'password', autocomplete: 'off', maxlength: '200' })),
        h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn btn-primary', id: 'btn-use-key' }, t('sSave')),
          h('button', { type: 'button', class: 'btn btn-ghost', id: 'btn-unlock', disabled: !blob || ready }, t('sUnlock')),
          h('button', { type: 'button', class: 'btn btn-ghost', id: 'btn-lock', disabled: !ready }, t('sLock')),
          h('button', { type: 'button', class: 'btn btn-ghost', id: 'btn-forget', disabled: !blob && !ready }, t('sForget'))),
        h('label', { class: 'field' }, h('span', null, t('sModel')), h('input', { id: 's-model', type: 'text', list: 'model-list', value: S.settings.models[prov], maxlength: '100', autocomplete: 'off', spellcheck: 'false' }), h('datalist', { id: 'model-list' })),
        h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-ghost', id: 'btn-models' }, t('sLoadModels'))),
        h('p', { class: 'hint', id: 's-model-msg' }, t('sModelFree')),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', id: 's-consent', checked: S.settings.consent }), h('span', null, t('sConsent')))),
      card(h('h2', null, t('privacyTitle')), bullets('privacyList')),
      card(h('h2', null, t('aboutTitle')), bullets('aboutList')),
      card(h('h2', null, t('bkTitle')), h('p', { class: 'hint' }, t('bkHelp')),
        h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-primary', id: 'btn-export' }, t('bkDownload'))),
        h('div', { class: 'field', role: 'radiogroup', 'aria-label': t('bkModeLabel') }, h('span', null, t('bkModeLabel')),
          h('label', { class: 'check' }, h('input', { type: 'radio', name: 'bk-mode', value: 'merge', checked: true }), h('span', null, t('bkMerge'))),
          h('label', { class: 'check' }, h('input', { type: 'radio', name: 'bk-mode', value: 'replace' }), h('span', null, t('bkReplace')))),
        h('div', { class: 'btn-row' }, h('label', { class: 'btn btn-ghost file-btn' }, t('bkRestore'), h('input', { type: 'file', id: 'bk-file', accept: 'application/json,.json', class: 'sr-only' })))),
      card(h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn btn-danger', id: 'btn-wipe' }, t('sDelete')))));
  }
  async function useKey() {
    const prov = S.settings.provider, key = $('s-key').value.trim(), remember = $('s-remember').checked, pass = $('s-pass').value;
    if (!key || /\s/.test(key) || key.length > 300) { toast(t('sKeyEmpty')); return; }
    if (!S.settings.consent) { toast(t('sConsentNeeded')); return; }
    try {
      if (remember) {
        if (pass.length < 8) { toast(t('sPassShort')); return; }
        const blob = await CR.encrypt(pass, key);
        if (!ST.setKeyBlob(prov, blob)) { toast(t('errStore')); return; }
      }
      S.session = { key, provider: prov, remembered: remember, lastUse: Date.now() };
      toast(remember ? t('sKeySaved') : t('sKeyReady'));
    } catch (e) { toast(t('errStore')); }
    renderSettings();
  }
  async function unlockKey() {
    const prov = S.settings.provider, blob = ST.getKeyBlob(prov), pass = $('s-pass').value;
    if (!blob) return;
    try {
      const key = await CR.decrypt(pass, blob);
      S.session = { key, provider: prov, remembered: true, lastUse: Date.now() };
      toast(t('sKeyUnlocked'));
    } catch (e) { toast(t('sBadPass')); return; }
    renderSettings();
  }
  async function loadModels() {
    const prov = S.settings.provider, key = $('s-key').value.trim() || getKey(), msg = $('s-model-msg');
    if (!key) { msg.textContent = t('sKeyEmpty'); return; }
    msg.textContent = t('loading');
    try {
      const ids = await AI.listModels(prov, key);
      render($('model-list'), ids.slice(0, 300).map((id) => h('option', { value: id })));
      if (!S.settings.models[prov]) {
        const pick = AI.pickDefault(prov, ids);
        if (pick) { S.settings = ST.setSettings({ models: { [prov]: pick } }); $('s-model').value = pick; }
      }
      msg.textContent = t('sModelsOk', { n: ids.length });
    } catch (e) { msg.textContent = errText(e); }
  }
  // Restore from a backup file: size-checked, rebuilt field by field in store.js, and confirmed by the person with the counts shown.
  async function importBackup(file) {
    if (!file) return;
    if (file.size > ST.MAX_BACKUP) { toast(t('bkTooBig')); return; }
    let text;
    try { text = await file.text(); } catch (e) { toast(t('bkBad')); return; }
    const r = ST.parseBackup(text);
    if (!r.ok) { toast(t(r.error === 'big' ? 'bkTooBig' : 'bkBad')); return; }
    const b = r.backup, picked = document.querySelector('input[name="bk-mode"]:checked');
    const mode = picked && picked.value === 'replace' ? 'replace' : 'merge';
    const counts = { p: b.people.length, l: b.lessons.length, n: Object.values(b.notes).reduce((a, x) => a + x.length, 0) };
    if (!window.confirm(t(mode === 'replace' ? 'bkConfirmReplace' : 'bkConfirmMerge', counts))) return;
    const res = ST.restore(b, mode);
    if (!res.ok) { toast(t('errStore')); return; }
    // show what is now stored: settings, the active person and every open screen
    S.settings = ST.getSettings(); S.lang = S.settings.lang;
    applyTheme(); SND.setEnabled(S.settings.sound); if (!S.settings.sound) SND.setAmbient(false);
    $('lang').value = S.lang; applyStatic(); buildTabs();
    const people = ST.getPeople(), has = (id) => !!id && people.some((x) => x.id === id);
    const keep = S.person && has(S.person.id) ? S.person.id : (has(ST.getCurrent()) ? ST.getCurrent() : null);
    if (keep) loadPerson(keep); else { S.person = null; S.chart = null; S.utc = null; S.editingId = null; S.chat = []; S.ctx = null; S.ctxChart = null; fillForm(null); renderAll(); }
    renderSettings(); toast(t('bkDone', { p: res.added.people, l: res.added.lessons, n: res.added.notes, c: res.added.chats }));
  }
  function wipeAll() {
    if (!window.confirm(t('sDeleteSure'))) return;
    ST.wipeAll(); S.session = { key: null, provider: null, remembered: false, lastUse: 0 }; window.location.reload();
  }

  // =========================================================================
  // PDF report: built on demand, then the browser's own "Save as PDF" prints it. Page 1 is the predictions summary.
  // =========================================================================
  function buildReport() {
    const L = S.lang, p = S.person, c = S.chart, zone = p.zone, now = Date.now(), ctx = outlookCtx();
    const name = p.name || t('fNameDefault');
    const models = {}; PERIOD_IDS.forEach((k) => { models[k] = V.periodModel(L, O.periodOutlook(ctx, k, now, 0), zone, placeText()); });
    const keys = ['overall'].concat(O.AREA_KEYS);
    const tbl = (head, rows, cls) => h('table', { class: cls || null },
      h('thead', null, h('tr', null, head.map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((x, i) => (i === 0 ? h('th', { scope: 'row' }, x) : h('td', null, x)))))));
    const matrix = h('table', { class: 'rp-matrix' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('oPeriodLabel')), PERIOD_IDS.map((k) => h('th', { scope: 'col' }, models[k].title, h('div', { class: 'rp-small' }, models[k].range))))),
      h('tbody', null, keys.map((key) => h('tr', null, h('th', { scope: 'row' }, models.day.cards[key].title),
        PERIOD_IDS.map((k) => h('td', { class: models[k].cards[key].labelKey === 'strong' ? 'rp-lab-strong' : null }, models[k].cards[key].label))))));
    const born = p.date + (p.timeUnknown ? '' : ' ' + p.time) + (p.place ? ' · ' + p.place : '') + ' · ' + t('tzUsed', { off: TZ.offsetLabel(S.utc.offsetSec), zone });
    const page1 = h('section', { class: 'rp-keep' },
      h('h1', null, t('rpTitle') + ' · ' + name),
      h('p', { class: 'rp-sub' }, t('rpBirth') + ': ' + born + ' · ' + t('rpPrepared', { date: RD.fmtDate(now, zone) })),
      h('p', { class: 'rp-small' }, EX.rashi(L, c, !!p.timeUnknown).lines.slice(0, 2).join(' ')),
      h('h2', null, t('rpGlance')), matrix,
      models.day.reduced ? h('p', { class: 'rp-small' }, t('oReduced')) : null,
      h('p', { class: 'rp-small' }, models.day.dayRows.map(([k, v]) => k + ': ' + v).join(' · ')),
      h('p', { class: 'rp-small' }, t('oNote')),
      h('p', { class: 'rp-small' }, t('rpDisclaimer')));

    // page 2 onward: the chart behind the numbers
    const style = S.settings.chartStyle;
    const chartSvg = CH.render(style, c, 1, L, t('chartFor', { name }) + ' · ' + t('v1'), 'D1');
    const rows = RD.planetRows(L, c);
    const planets = tbl(['thPlanet', 'thSign', 'thDeg', 'thNak', 'thPada', 'thHouse', 'thState'].map((k) => t(k)), rows.map((r) => [r.name, r.sign, r.deg, r.nak, String(r.pada), String(r.house), r.state]));
    const pc = RD.panchangRows(L, c, zone);
    const cur = E.periodAt(c.dasha, now);
    const dashaRows = cur ? [[t('dMaha'), cur.maha], [t('dAntar'), cur.antar], [t('dPraty'), cur.pratyantar]].filter((x) => x[1]).map(([lv, d]) => [lv, nm.planet(L, d.lord), RD.fmtDate(d.start, zone) + ' – ' + RD.fmtDate(d.end, zone)]) : [];
    const nextSubs = cur ? E.subPeriods(cur.maha).filter((a) => a.end > now).map((a) => [nm.planet(L, a.lord), RD.fmtDate(Math.max(a.start, now), zone), RD.fmtDate(a.end, zone)]) : [];
    const yv = R.yogas(c).map((y) => RD.yogaView(L, c, y));
    const page2 = h('section', { class: 'rp-break' },
      h('h2', null, t('rpChartHead')), p.timeUnknown ? h('p', { class: 'rp-small' }, t('timeUnknownWarn')) : null,
      h('div', { class: 'rp-chart rp-keep' }, chartSvg),
      h('p', { class: 'rp-small' }, t('cLagna') + ': ' + nm.sign(L, c.asc.sign) + ' ' + E.dms(c.asc.deg)),
      planets,
      h('h3', null, t('pTitle')), tbl([t('pTitle'), ''], pc.map(([k, v]) => [t(k), v])),
      h('h3', null, t('karakas')), h('p', null, RD.karakaText(L, c)));
    const page3 = h('section', { class: 'rp-break' },
      h('h2', null, t('rpDasha')), dashaRows.length ? tbl([t('dNow'), t('thPlanet'), ''], dashaRows) : null,
      nextSubs.length ? h('div', { class: 'rp-keep' }, h('h3', null, t('dAntar')), tbl([t('dAntar'), t('dStart'), t('dEnd')], nextSubs)) : null,
      p.timeUnknown ? null : (() => {
        const a = V.ashtakaTable(L, c);
        return h('div', { class: 'rp-keep' }, h('h2', null, t('avTitle')), h('p', { class: 'rp-small' }, t('avHelp')), tbl(a.head, a.rows, 'rp-matrix'));
      })(),
      h('h2', null, t('rYogas')), yv.length ? yv.map((v) => h('div', { class: 'rp-keep' }, h('h3', null, v.name), h('p', null, v.text))) : h('p', null, t('rNoYogas')),
      h('p', { class: 'rp-small' }, t('rpDisclaimer')), h('p', { class: 'rp-small' }, t('rpMadeWith')));
    // last pages: the chart in plain words (what each planet is, who it stands for, why it matters here)
    const plain = h('section', { class: 'rp-break' }, h('h2', null, t('xPrint')),
      EX.planetCards(L, c, !!p.timeUnknown).map((pc) => h('div', { class: 'rp-keep' }, h('h3', null, pc.head), h('ul', { class: 'rp-plain' }, pc.lines.map((l) => h('li', null, l))))),
      p.timeUnknown ? null : (() => { const tl = EX.timeline(L, c, now, zone); return tl.notes.length ? h('div', { class: 'rp-keep' }, h('h3', null, t('xSecNow')), h('ul', { class: 'rp-plain' }, tl.notes.map((l) => h('li', null, l)))) : null; })(),
      h('p', { class: 'rp-small' }, t('rpDisclaimer')));
    return [page1, page2, page3, plain];
  }
  function printReport() {
    if (!S.chart) { toast(t('aNeedChart')); return; }
    const box = $('report');
    try { render(box, buildReport()); } catch (e) { clear(box); toast(t('rpFail')); return; }
    const old = document.title, who = String(S.person.name || 'report').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 40) || 'report';
    document.title = 'Rashisvara - ' + who + ' - ' + todayStr();
    const done = () => { document.title = old; clear(box); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  }

  // =========================================================================
  // Wiring
  // =========================================================================
  function renderAll() {
    renderPeople(); renderChart();
    if (S.tab === 'home') renderHome();
    if (S.tab === 'dasha') renderDasha();
    if (S.tab === 'reading') renderReading();
    if (S.tab === 'understand') renderUnderstand();
    if (S.tab === 'ask') renderAsk();
    if (S.tab === 'learn') renderTeach();
    if (S.tab === 'settings') renderSettings();
  }

  function wire() {
    $('birth-form').addEventListener('submit', onSubmit);
    $('btn-search').addEventListener('click', searchPlace);
    $('f-place').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchPlace(); } });
    $('place-results').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) pickPlace(Number(b.getAttribute('data-i'))); });
    $('f-time-unknown').addEventListener('change', (e) => { $('f-time').disabled = e.target.checked; });
    $('people-select').addEventListener('change', (e) => { if (e.target.value) loadPerson(e.target.value); else newPerson(); });
    $('btn-new').addEventListener('click', newPerson);
    $('btn-delete-form').addEventListener('click', deleteCurrent);
    $('lang').addEventListener('change', (e) => setLang(e.target.value));
    $('btn-theme').addEventListener('click', () => setTheme(S.settings.theme === 'dark' ? 'light' : 'dark'));
    $('btn-sound').addEventListener('click', () => setSound(!S.settings.sound));
    $('tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) selectTab(b.getAttribute('data-tab')); });
    $('tabs').addEventListener('keydown', (e) => {
      const i = TABS.findIndex((x) => x[0] === S.tab);
      if (e.key === 'ArrowRight') { e.preventDefault(); selectTab(TABS[(i + 1) % TABS.length][0], true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); selectTab(TABS[(i + TABS.length - 1) % TABS.length][0], true); }
      else if (e.key === 'Home') { e.preventDefault(); selectTab(TABS[0][0], true); }
      else if (e.key === 'End') { e.preventDefault(); selectTab(TABS[TABS.length - 1][0], true); }
    });

    // home tab
    $('home-out').addEventListener('click', (e) => {
      const pb = e.target.closest('[data-period]');
      if (pb) {
        const k = pb.getAttribute('data-period');
        if (PERIOD_IDS.includes(k)) { S.homePeriod = k; renderHome(); SND.tap(); const again = $('home-out').querySelector('[data-period="' + k + '"]'); if (again) again.focus(); }
        return;
      }
      if (e.target.closest('#btn-home-enter')) selectTab('chart');
      else if (e.target.closest('#btn-home-another')) { newPerson(); selectTab('chart'); $('f-name').focus(); }
      else if (e.target.closest('#btn-home-delete')) deleteCurrent();
      else if (e.target.closest('#btn-home-understand')) selectTab('understand');
      else if (e.target.closest('#btn-home-ask')) selectTab('ask');
      else if (e.target.closest('#btn-pdf')) printReport();
    });

    $('home-out').addEventListener('change', (e) => { if (e.target.id === 'home-people' && e.target.value) loadPerson(e.target.value); });

    // chart tab
    $('chart-out').addEventListener('click', (e) => {
      const st = e.target.closest('[data-style]');
      if (st) { S.settings = ST.setSettings({ chartStyle: st.getAttribute('data-style') }); renderChart(); SND.tap(); return; }
      if (e.target.closest('#btn-delete-person')) deleteCurrent();
    });
    $('chart-out').addEventListener('change', (e) => { if (e.target.id === 'varga-select') { const v = Number(e.target.value); if (E.VARGAS.includes(v)) { S.varga = v; renderChart(); } } });

    // ask tab
    $('ask-out').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-q]');
      if (chip) { sendQuestion(chip.getAttribute('data-q')); return; }
      if (e.target.closest('#btn-clear-chat')) { if (window.confirm(t('aClearSure'))) { S.chat = []; saveChat(); renderChat(); } return; }
      if (e.target.closest('#btn-copy-facts')) { const txt = $('facts-pre').textContent; if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast(t('copied')), () => {}); return; }
      onChatClick(e);
    });
    $('ask-out').addEventListener('submit', (e) => { e.preventDefault(); sendQuestion($('q-text').value); });
    $('ask-out').addEventListener('keydown', (e) => { if (e.target.id === 'q-text' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendQuestion(e.target.value); } });
    $('ask-out').addEventListener('change', (e) => { if (e.target.id === 'ai-lang' && I.AI_LANGS.includes(e.target.value)) S.settings = ST.setSettings({ aiLang: e.target.value }); });
    $('ask-out').addEventListener('toggle', (e) => { if (e.target.id === 'facts-box' && e.target.open && S.chart) $('facts-pre').textContent = factsNow(); }, true);

    // understand tab
    $('understand-out').addEventListener('click', (e) => {
      if (e.target.closest('#btn-add-event')) { addEvent(); return; }
      const d = e.target.closest('[data-del-event]');
      if (d && S.person) { ST.setEvents(S.person.id, ST.getEvents(S.person.id).filter((x) => x.id !== d.getAttribute('data-del-event'))); renderUnderstand(); }
    });

    // teach tab
    $('teach-out').addEventListener('click', (e) => {
      if (e.target.closest('#btn-add-lesson')) { const v = $('lesson-text').value; if (v.trim()) { ST.addLesson(v); renderTeach(); toast(t('aSaved')); } return; }
      if (e.target.closest('#btn-export-lessons')) { download('rashisvara-lessons.json', { lessons: ST.getLessons().map((l) => l.text) }); return; }
      const dl = e.target.closest('[data-del-lesson]');
      if (dl) { ST.setLessons(ST.getLessons().filter((l) => l.id !== dl.getAttribute('data-del-lesson'))); renderTeach(); return; }
      if (e.target.closest('#btn-add-note') && S.person) {
        const v = $('note-text').value.trim();
        if (v) { const list = ST.getNotes(S.person.id); list.unshift({ id: CR.randomId(), text: v.slice(0, 240), ts: Date.now() }); ST.setNotes(S.person.id, list); renderTeach(); }
        return;
      }
      const dn = e.target.closest('[data-del-note]');
      if (dn && S.person) { ST.setNotes(S.person.id, ST.getNotes(S.person.id).filter((n) => n.id !== dn.getAttribute('data-del-note'))); renderTeach(); }
    });
    $('teach-out').addEventListener('change', (e) => { if (e.target.id === 'lesson-file') { importLessons(e.target.files && e.target.files[0]); e.target.value = ''; } });

    // settings tab
    $('settings-out').addEventListener('change', (e) => {
      const id = e.target.id;
      if (id === 's-lang') setLang(e.target.value);
      else if (id === 's-theme') setTheme(e.target.value === 'light' ? 'light' : 'dark');
      else if (id === 's-sound') setSound(e.target.checked);
      else if (id === 's-ambient') { S.settings = ST.setSettings({ ambient: e.target.checked }); SND.setAmbient(e.target.checked && S.settings.sound); }
      else if (id === 's-provider') { if (Object.keys(AI.PROVIDERS).includes(e.target.value)) { S.settings = ST.setSettings({ provider: e.target.value }); renderSettings(); } }
      else if (id === 's-consent') S.settings = ST.setSettings({ consent: e.target.checked });
      else if (id === 's-model') {
        const v = e.target.value.trim();
        if (v === '' || ST.MODEL_RE.test(v)) S.settings = ST.setSettings({ models: { [S.settings.provider]: v } }); else toast(t('errModelName'));
      }
    });
    $('settings-out').addEventListener('change', (e) => { if (e.target.id === 'bk-file') { importBackup(e.target.files && e.target.files[0]); e.target.value = ''; } });
    $('settings-out').addEventListener('click', (e) => {
      const id = (e.target.closest('button') || {}).id;
      if (id === 'btn-use-key') useKey();
      else if (id === 'btn-unlock') unlockKey();
      else if (id === 'btn-lock') { S.session = { key: null, provider: null, remembered: false, lastUse: 0 }; renderSettings(); }
      else if (id === 'btn-forget') { ST.setKeyBlob(S.settings.provider, null); S.session = { key: null, provider: null, remembered: false, lastUse: 0 }; renderSettings(); }
      else if (id === 'btn-models') loadModels();
      else if (id === 'btn-export') download('rashisvara-backup-' + todayStr() + '.json', ST.exportAll());
      else if (id === 'btn-wipe') wipeAll();
    });

    setInterval(tick, 60000);
  }

  // =========================================================================
  // Start
  // =========================================================================
  function init() {
    applyTheme();
    render($('lang'), Object.keys(I.LANGS).map((k) => h('option', { value: k, selected: k === S.lang }, I.LANGS[k])));
    render($('tz-list'), tzOptions().map((z) => h('option', { value: z })));
    $('f-date').setAttribute('max', todayStr());
    $('logo').appendChild(FX.mandala(44));
    SND.setEnabled(S.settings.sound);
    $('f-tz').value = DEFAULT_ZONE;
    applyStatic(); buildTabs();
    TABS.forEach(([id]) => { $('panel-' + id).hidden = id !== S.tab; });
    wire();
    // Let the browser paint the page (with the loading screen) first; the saved chart and the sky are worked out right after.
    // The fallback timer covers a tab that is hidden, where animation frames are paused.
    let started = false;
    const finish = () => {
      if (started) return; started = true;
      const cur = ST.getCurrent();
      if (cur && ST.getPeople().some((p) => p.id === cur)) loadPerson(cur); else { renderPeople(); renderChart(); renderHome(); }
      loadSharedLessons();
      FX.startSky($('sky'));
      document.documentElement.classList.add('ready');
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(() => setTimeout(finish, 0));
    setTimeout(finish, 300);
  }
  init();
})();
