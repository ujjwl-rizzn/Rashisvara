/*  Quick Answers: reads a typed question (English, Hindi, Bengali or Hinglish), finds the life area and the time
    period it is about, and answers from the computed outlook. No AI and no key are involved, so this part is free
    and instant. It only recognises keywords; it does not "understand" language, and it says so when it cannot match.

    Safety first: questions about suicide or self-harm get a caring message and no prediction; questions about the
    date of someone's death or length of life are declined; investment, lottery and betting questions get no tips. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine.js'), require('./rules.js'), require('./i18n.js'), require('./reading.js'), require('./outlook.js'), require('./outlook-view.js'));
  } else root.RsvRouter = factory(root.RsvEngine, root.RsvRules, root.RsvI18n, root.RsvReading, root.RsvOutlook, root.RsvOutlookView);
})(typeof self !== 'undefined' ? self : this, function (E, R, I, RD, O, V) {
  'use strict';

  const ui = (L, k, p) => I.ui(L, k, p);

  // A trailing * means "starts with" (so plurals and endings match); otherwise the whole word must match.
  const KW = {
    marriage: ['marriage*', 'marry*', 'married', 'wedding*', 'spouse*', 'husband*', 'wife', 'wives', 'divorc*', 'engagement', 'matrimon*', 'shaadi*', 'shadi*', 'vivah*', 'biwi', 'pati', 'patni', 'talaak', 'talak', 'sagai', 'jeevansathi', 'jeevansaathi',
      'विवाह*', 'शादी*', 'शादीशुदा', 'पति', 'पत्नी', 'तलाक*', 'सगाई', 'जीवनसाथी', 'वैवाहिक',
      'বিবাহ*', 'বিয়ে*', 'বিয়ের', 'স্বামী*', 'স্ত্রী*', 'তালাক*', 'জীবনসঙ্গী*', 'বিবাহিত*'],
    love: ['love*', 'romanc*', 'romantic*', 'relationship*', 'girlfriend*', 'boyfriend*', 'crush*', 'dating', 'breakup*', 'affair*', 'lover*', 'attraction', 'pyar*', 'pyaar*', 'prem*', 'rishta', 'rishte', 'gf', 'bf', 'ishq', 'mohabbat', 'premi', 'premika',
      'प्यार*', 'प्रेम*', 'रोमांस*', 'रिश्ता', 'रिश्ते', 'गर्लफ्रेंड*', 'बॉयफ्रेंड*', 'ब्रेकअप*', 'लव', 'प्रेमी*', 'प्रेमिका*', 'इश्क*',
      'প্রেম*', 'ভালোবাসা*', 'ভালবাসা*', 'রোমান্স*', 'সম্পর্ক*', 'গার্লফ্রেন্ড*', 'বয়ফ্রেন্ড*', 'ব্রেকআপ*', 'প্রেমিক*', 'প্রেমিকা*', 'ক্রাশ*'],
    health: ['health*', 'sick*', 'illness*', 'ill', 'disease*', 'fitness', 'wellbeing', 'body', 'injur*', 'pain*', 'fever', 'surgery', 'doctor*', 'medical', 'stress*', 'sleep*', 'diet', 'weight', 'energy', 'sehat*', 'swasthya', 'tabiyat', 'tabiyat', 'bimar*', 'rog', 'chot', 'dard', 'bukhar', 'operation', 'tanav', 'neend', 'vajan',
      'सेहत*', 'स्वास्थ्य*', 'तबीयत*', 'बीमार*', 'बीमारी*', 'रोग*', 'चोट*', 'दर्द*', 'बुखार*', 'ऑपरेशन*', 'तनाव*', 'नींद*', 'वज़न*', 'वजन*',
      'স্বাস্থ্য*', 'শরীর*', 'অসুস্থ*', 'অসুখ*', 'রোগ*', 'ব্যথা*', 'জ্বর*', 'অপারেশন*', 'চাপ', 'ঘুম*', 'ওজন*', 'সুস্থ*'],
    career: ['career*', 'job*', 'work', 'working', 'business*', 'profession*', 'promotion*', 'office', 'boss*', 'employ*', 'interview*', 'workplace', 'occupation*', 'startup*', 'naukri*', 'kaam', 'vyapar*', 'vyavsay*', 'dhandha', 'rozgar', 'rojgar',
      'नौकरी*', 'करियर*', 'कैरियर*', 'काम', 'व्यापार*', 'व्यवसाय*', 'धंधा', 'रोज़गार*', 'रोजगार*', 'पदोन्नति*', 'प्रमोशन*', 'इंटरव्यू*', 'दफ्तर*', 'दफ़्तर*',
      'চাকরি*', 'চাকরী*', 'কর্ম*', 'কাজ*', 'ক্যারিয়ার*', 'কেরিয়ার*', 'ব্যবসা*', 'পদোন্নতি*', 'ইন্টারভিউ*'],
    wealth: ['money', 'income*', 'wealth*', 'financ*', 'salary', 'salaries', 'earning*', 'saving*', 'profit*', 'rich', 'debt*', 'loan*', 'cash', 'invest*', 'stock*', 'lotter*', 'gambl*', 'bet', 'betting', 'crypto*', 'bitcoin', 'satta', 'pais*', 'dhan', 'kamai', 'bachat', 'aarthik', 'tankhwah', 'munafa', 'karz', 'daulat', 'nivesh*', 'share*',
      'पैसा', 'पैसे', 'पैसों*', 'धन*', 'आय', 'कमाई*', 'बचत*', 'आर्थिक*', 'वेतन*', 'तनख्वाह*', 'तनख़्वाह*', 'मुनाफा*', 'मुनाफ़ा*', 'कर्ज*', 'क़र्ज़*', 'दौलत*', 'लॉटरी*', 'निवेश*', 'शेयर*', 'सट्टा*',
      'টাকা*', 'টাকাপয়সা*', 'অর্থ*', 'আয়', 'ধন*', 'বেতন*', 'সঞ্চয়*', 'লাভ*', 'ঋণ*', 'ধার*', 'লটারি*', 'বিনিয়োগ*', 'জুয়া*'],
    education: ['study', 'studies', 'studying', 'education*', 'exam*', 'school*', 'college*', 'student*', 'learning', 'degree*', 'universit*', 'marks', 'result*', 'admission*', 'padhai', 'padhaai', 'shiksha', 'pariksha',
      'पढ़ाई*', 'पढाई*', 'शिक्षा*', 'परीक्षा*', 'स्कूल*', 'कॉलेज*', 'विद्यार्थी*', 'छात्र*', 'डिग्री*', 'विश्वविद्यालय*', 'एडमिशन*', 'नतीजा', 'नतीजे', 'रिज़ल्ट*', 'रिजल्ट*',
      'পড়াশোনা*', 'পড়া', 'শিক্ষা*', 'পরীক্ষা*', 'স্কুল*', 'কলেজ*', 'ছাত্র*', 'ডিগ্রি*', 'বিশ্ববিদ্যালয়*', 'ভর্তি*', 'রেজাল্ট*'],
    foreign: ['abroad', 'foreign*', 'travel*', 'trip*', 'visa*', 'immigra*', 'overseas', 'relocat*', 'journey*', 'tour', 'videsh*', 'pardes*', 'yatra*', 'safar',
      'विदेश*', 'परदेस*', 'यात्रा*', 'सफर*', 'सफ़र*', 'वीज़ा*', 'वीजा*', 'प्रवास*',
      'বিদেশ*', 'প্রবাস*', 'ভ্রমণ*', 'যাত্রা*', 'সফর*', 'ভিসা*'],
    spirituality: ['spiritual*', 'meditat*', 'god', 'dharma', 'faith', 'religio*', 'prayer*', 'temple*', 'guru*', 'peace', 'moksha', 'yoga', 'mantra*', 'adhyatm*', 'dhyan', 'bhagwan', 'ishwar', 'dharm', 'aastha', 'puja', 'pooja', 'mandir', 'shanti', 'moksh', 'yog', 'sadhna',
      'अध्यात्म*', 'आध्यात्मिक*', 'ध्यान', 'भगवान*', 'ईश्वर*', 'धर्म*', 'आस्था*', 'पूजा*', 'मंदिर*', 'गुरु*', 'शांति', 'मोक्ष*', 'योग', 'मंत्र*', 'साधना*',
      'আধ্যাত্মিক*', 'ধ্যান*', 'ভগবান*', 'ঈশ্বর*', 'ধর্ম*', 'বিশ্বাস*', 'পূজা*', 'মন্দির*', 'গুরু*', 'শান্তি*', 'মোক্ষ*', 'যোগ', 'মন্ত্র*', 'সাধনা*'],
    family: ['family', 'families', 'parent*', 'mother*', 'father*', 'mom', 'dad', 'brother*', 'sister*', 'sibling*', 'home', 'house', 'relatives', 'child*', 'baby', 'babies', 'son', 'daughter*', 'pregnan*', 'kids', 'parivar*', 'ghar', 'maa', 'papa', 'mummy', 'bhai', 'behen', 'behan', 'rishtedaar*', 'bachcha', 'bachche', 'bacha', 'bache', 'santan', 'beta', 'beti',
      'परिवार*', 'पारिवारिक*', 'घर', 'माता*', 'पिता*', 'माँ', 'मां', 'पापा', 'भाई*', 'बहन*', 'रिश्तेदार*', 'बच्चा', 'बच्चे', 'बच्चों*', 'संतान*', 'बेटा', 'बेटी', 'गर्भ*',
      'পরিবার*', 'পারিবারিক*', 'বাড়ি*', 'বাড়ী*', 'মা', 'মায়ের', 'বাবা*', 'ভাই*', 'বোন*', 'আত্মীয়*', 'সন্তান*', 'বাচ্চা*', 'ছেলে*', 'মেয়ে*', 'গর্ভ*'],
  };
  const PRIORITY = ['marriage', 'love', 'health', 'career', 'wealth', 'education', 'foreign', 'spirituality', 'family'];
  const PERIOD_KW = {
    day: ['today', 'tonight', 'daily', 'aaj', 'aj', 'आज', 'आजकल', 'আজ', 'আজকে', 'tomorrow', 'আগামীকাল'],
    week: ['week*', 'weekly', 'hafte', 'hafta', 'haftey', 'saptah*', 'सप्ताह*', 'हफ़्ते', 'हफ्ते', 'हफ़्ता', 'हफ्ता', 'हफ्ते*', 'সপ্তাহ*', 'হপ্তা*'],
    month: ['month*', 'mahin*', 'maah', 'महीने*', 'महीना', 'महीनों*', 'माह', 'मास', 'মাস*'],
    year: ['year*', 'annual*', 'saal', 'sal', 'saalbhar', 'varsh*', 'baras', 'साल*', 'वर्ष*', 'बरस', 'বছর*', 'সাল*'],
  };
  const DAYWORD = ['days', 'day', 'din', 'दिन', 'দিন', 'दिनों*'];
  const NEXT_KW = ['next', 'coming', 'upcoming', 'agle', 'agla', 'agli', 'अगले', 'अगला', 'अगली', 'পরের', 'আগামী', 'আগামি', 'আসছে', 'আসন্ন'];
  const WHEN_KW = ['when', 'kab', 'kabtak', 'कब', 'কবে', 'কখন'];
  const TOMORROW = ['tomorrow', 'আগামীকাল'];
  const INVEST_KW = ['invest*', 'stock*', 'lotter*', 'gambl*', 'bet', 'betting', 'crypto*', 'bitcoin', 'satta', 'nivesh*', 'share*', 'निवेश*', 'शेयर*', 'सट्टा*', 'लॉटरी*', 'বিনিয়োগ*', 'লটারি*', 'জুয়া*'];

  const DISTRESS = ['suicide', 'suicidal', 'kill myself', 'end my life', 'want to die', 'wanna die', 'no reason to live', 'self harm', 'hurt myself', 'dont want to live', 'do not want to live', 'end it all',
    'aatmahatya', 'atmahatya', 'marna chahta', 'marna chahti', 'jeena nahi chahta', 'jeena nahi chahti', 'jaan de dunga', 'jaan de dungi', 'mar jana chahta', 'mar jaana chahta', 'mar jana chahti', 'mar jaana chahti',
    'आत्महत्या', 'मरना चाहता', 'मरना चाहती', 'जीना नहीं चाहता', 'जीना नहीं चाहती', 'मर जाना चाहता', 'मर जाना चाहती', 'जान दे दूँ', 'जान दे दूं',
    'আত্মহত্যা', 'মরে যেতে চাই', 'মরতে চাই', 'বাঁচতে চাই না', 'বেঁচে থাকতে চাই না'];
  const DEATH_WORDS = ['die', 'dying', 'death', 'maut', 'marunga', 'marungi', 'mrityu*', 'मृत्यु*', 'मौत', 'मरूँगा', 'मरूंगा', 'मरूँगी', 'मरूंगी', 'মৃত্যু*', 'মরব', 'মারা', 'মরবো'];
  const DEATH_ASK = ['when', 'how long', 'age', 'kab', 'kitna', 'umar', 'कब', 'कितना', 'उम्र', 'কবে', 'কত', 'আয়ু', 'lifespan', 'life span', 'आयु', 'jiyunga', 'jiungi', 'jiyenge', 'जिऊँगा', 'जिऊंगा', 'जिऊँगी', 'বাঁচব', 'বাঁচবো', 'live'];

  const LIFESPAN = ['how long will i live', 'how long will he live', 'how long will she live', 'how long do i have to live', 'how many years will i live', 'how many years do i have', 'lifespan', 'life span', 'life expectancy',
    'kitna jiyunga', 'kitna jiungi', 'kitna jiyenge', 'kitne saal jiyunga', 'kitne saal jiungi', 'umar kitni', 'meri umar kitni', 'ayu kitni', 'कितना जिऊँगा', 'कितना जिऊंगा', 'कितना जिऊँगी', 'कितना जिऊंगी', 'आयु कितनी', 'कितने साल जिऊँगा', 'कितने साल जिऊंगा',
    'আয়ু কত', 'কতদিন বাঁচব', 'কতদিন বাঁচবো', 'কত বছর বাঁচব', 'কত বছর বাঁচবো'];
  const DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9', '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
  function normalise(text) {
    let t = String(text || '').normalize('NFC').toLowerCase().slice(0, 1500);
    t = t.replace(/[०-९০-৯]/g, (d) => DIGITS[d]).replace(/[’']/g, '');
    const tokens = t.match(/[\p{L}\p{M}\p{N}]+/gu) || [];
    return { tokens, flat: ' ' + tokens.join(' ') + ' ' };
  }
  function tokenHit(tokens, kw) {
    if (kw.endsWith('*')) { const p = kw.slice(0, -1); return tokens.some((t) => t.startsWith(p)); }
    return tokens.includes(kw);
  }
  const countHits = (tokens, list) => list.reduce((s, kw) => s + (tokenHit(tokens, kw) ? 1 : 0), 0);
  const anyHit = (tokens, list) => list.some((kw) => tokenHit(tokens, kw));
  const phraseHit = (flat, list) => list.some((p) => flat.includes(' ' + p.toLowerCase().normalize('NFC') + ' '));

  function parse(text, nowYear) {
    const { tokens, flat } = normalise(text);
    const out = { area: null, period: null, offset: 0, when: false, safety: null, invest: false, empty: !tokens.length };
    if (!tokens.length) return out;
    if (phraseHit(flat, DISTRESS)) { out.safety = 'distress'; return out; }
    if ((anyHit(tokens, DEATH_WORDS) && (anyHit(tokens, DEATH_ASK) || phraseHit(flat, DEATH_ASK))) || phraseHit(flat, LIFESPAN)) { out.safety = 'death'; return out; }

    // life area: the one with the most keyword hits; ties go to the more specific area (see PRIORITY)
    let best = null, bestN = 0;
    for (const key of PRIORITY) { const c = countHits(tokens, KW[key]); if (c > bestN) { best = key; bestN = c; } }
    out.area = best;
    out.invest = anyHit(tokens, INVEST_KW);
    out.when = anyHit(tokens, WHEN_KW);

    // period
    const hasNum = (v) => tokens.includes(String(v));
    const isMonth = anyHit(tokens, PERIOD_KW.month), isDay = anyHit(tokens, DAYWORD), isWeek = anyHit(tokens, PERIOD_KW.week), isYear = anyHit(tokens, PERIOD_KW.year), isToday = anyHit(tokens, PERIOD_KW.day);
    let explicit = false;
    if (isMonth && hasNum(12)) { out.period = 'year'; explicit = true; }
    else if ((isDay || isMonth) && hasNum(30)) { out.period = 'month'; explicit = true; }
    else if (isDay && hasNum(7)) { out.period = 'week'; explicit = true; }
    else if (isToday) out.period = 'day';
    else if (isWeek) out.period = 'week';
    else if (isMonth) out.period = 'month';
    else if (isYear) out.period = 'year';
    else if (nowYear && tokens.some((t) => /^20\d\d$/.test(t) && Number(t) >= nowYear && Number(t) <= nowYear + 1)) out.period = 'year';
    if (!explicit && out.period && anyHit(tokens, NEXT_KW)) out.offset = 1;
    if (out.period === 'day' && anyHit(tokens, TOMORROW)) out.offset = 1;
    // "how is my month?" with no area: answer for life in general
    if (!out.area && out.period) out.area = 'overall';
    return out;
  }

  // Build the reply text (the same small markup the chat already shows: **bold**, "- " bullets, paragraphs)
  function build(L, chart, o, p) {
    const zone = o.zone || 'UTC', now = o.nowMs;
    const ctx = o.ctx || O.makeCtx(chart, { zone, timeUnknown: o.timeUnknown });
    const periods = p.period ? [p.period] : ['month', 'year'];
    const blocks = [];
    if (p.invest) blocks.push(ui(L, 'qaInvest'));
    const key = p.area;
    for (const per of periods) {
      const out = O.periodOutlook(ctx, per, now, per === 'day' && !p.period ? 0 : p.offset);
      const c = V.areaCard(L, out, key, zone);
      const head = ui(L, 'qaHead', { area: c.title, period: V.periodTitle(L, per) + ' (' + V.rangeText(L, out, zone) + ')', label: c.label });
      const lines = [];
      // keep it short: the area's own rating, the running periods and the two biggest transits; the Home tab has the rest
      for (const l of c.lines.slice(0, 7)) lines.push('- ' + l);
      const extra = [];
      if (c.best.length) extra.push('**' + c.bestTitle + ':** ' + c.best.join(', '));
      if (c.caution.length) extra.push('**' + c.cautionTitle + ':** ' + c.caution.join(', '));
      blocks.push('**' + head + '**\n' + c.sentence + '\n' + lines.join('\n') + (extra.length ? '\n\n' + extra.join('\n') : ''));
    }
    if (!p.period) blocks.push(ui(L, 'qaDefaultNote'));
    if (p.when && key !== 'overall') {
      const rep = R.areaReport(chart, key, now), view = RD.areaView(L, chart, rep, zone);
      if (view.windows.length) blocks.push('**' + ui(L, 'qaWhenNote') + '**\n' + view.windows.slice(0, 6).map((x) => '- ' + x).join('\n'));
    }
    if (o.timeUnknown) blocks.push(ui(L, 'oReduced'));
    blocks.push(ui(L, 'oNote'));
    return blocks.join('\n\n');
  }

  // Main entry. Returns { kind: 'answer' | 'safety' | 'nomatch', text, parsed }
  function answer(L, chart, o) {
    const nowYear = new Date(o.nowMs).getUTCFullYear();
    const p = parse(o.text, nowYear);
    if (p.safety === 'distress') return { kind: 'safety', text: ui(L, 'qaDistress'), parsed: p };
    if (p.safety === 'death') return { kind: 'safety', text: ui(L, 'qaDeath'), parsed: p };
    if (!p.area) return { kind: 'nomatch', text: ui(L, 'qaNoMatch'), parsed: p };
    return { kind: 'answer', text: build(L, chart, o, p), parsed: p };
  }

  return { parse, answer, normalise, KW };
});
