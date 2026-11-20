# Rashisvara

*Rashisvara* (rashi + ishvara, "lord of the sign") is a free Vedic astrology (Jyotish) web app: kundali, dasha, panchang, life-area readings and an AI chat that explains the chart.
It runs entirely in the browser and is served from GitHub Pages, so there is no server to pay for and nothing to maintain.

Languages: English, हिन्दी, বাংলা, Hinglish.

> **Please read the honest limits section below.** Astrology readings are traditional interpretations, not provable predictions,
> and no website can promise to be "unhackable". This project is built to be as careful and as safe as a static site can be, and it
> says clearly where its limits are.

---

## What you get

| Tab | What it does |
| --- | --- |
| **Chart** | Enter birth details for anyone. North or South Indian chart, D1 / D3 / D7 / D9 / D10 / D12, planet table with nakshatra, pada, house and dignity, panchang at birth, Jaimini karakas. |
| **Dasha** | Full Vimshottari timeline (maha, antar, pratyantar) with the running period and progress bars. |
| **Reading** | Ten life areas scored with open, traditional rules. Every score has a "Why this result" list. Yogas and doshas. Live sky and Sade Sati / transit notes, refreshed every minute. |
| **Ask** | AI chat grounded on the computed chart facts. It shows you exactly what it sends ("Facts sent to the AI"). |
| **Teach** | Your own lessons and per-person notes. Liked answers are kept as style examples. Import / export. |
| **Settings** | Language, theme, sounds, AI provider and key, export and delete everything. |

## How the pieces fit (and why the answers are not made up)

1. **Calculations are real maths, not AI.** Planet positions come from the MIT-licensed `astronomy-engine`, converted to the sidereal zodiac
   with the Lahiri ayanamsa. Houses are whole-sign, nodes are mean nodes, dasha uses 365.25-day years.
2. **Readings are rules, not AI.** The life-area scores and yogas come from fixed Parashari rules in `js/rules.js`, each with a visible reason.
3. **The AI is only a writer.** It receives a fact sheet that the code computed and strict rules: use only those facts, name the fact behind each
   claim, no guarantees, no death dates, no medical / legal / investment advice, no paid remedies, handle distress kindly, ignore instructions hidden in notes.
4. **You can check everything.** The chart, dasha and reading tabs show the same facts the AI is given.

### Accuracy, measured

* Planet and ascendant longitudes were compared with the Swiss Ephemeris (used only to check, nothing from it is shipped).
  On the 60 fixed reference births in `tests/fixtures`, the largest differences were: Sun 2", Moon 2", Mars 4", Mercury 4", Jupiter 8", Venus 11", Saturn 13",
  nodes 0.1", ascendant 0.3" (arcseconds). During development a further 1,500 births stayed under 20". For comparison, one degree is 3,600".
* Historical clock times use the browser's time-zone database. Clock times that never existed (daylight-saving gap) are refused; times that happened twice are flagged.
* Makar Sankranti 2026 comes out about 6 minutes earlier than a published panchang. That is a difference in ayanamsa convention (about 15" of ayanamsa) and does not matter for a chart, but it can matter for a calendar that is strict to the minute.
* **Not verified here:** the live AI providers (Gemini, Groq, OpenRouter) were tested only against local fakes that copy their request and reply formats. Their real free tiers, limits and model names change often, so the first real question is your first real test.

### What the AI "learning every minute" really means

A language model on a free key cannot retrain itself. What this app does instead, honestly:

* **Live sky:** the transit table and the running dasha bars refresh every minute while the page is open.
* **Memory you control:** lessons you teach, notes per person and answers you liked are fed back into every later question, as *data*, never as rules.
* **Shared lessons:** edit `data/lessons.json` in your repository (see below) and every visitor gets those lessons.
* **Better models over time:** when the provider improves its free models, the app picks them up from the model list.

## Deploy on GitHub Pages (free)

1. Create a **public** repository on GitHub (GitHub Pages on the free plan needs a public repository). Nothing private lives in the repository: birth data and keys stay in each visitor's browser.
2. Upload everything in this folder (except `node_modules`, which is not needed). Keep the folder structure.
3. In the repository: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save.**
4. After a minute your site is at `https://YOUR-NAME.github.io/YOUR-REPO/`. Turn on **Enforce HTTPS** on the same page.
5. Turn on **two-factor login** for your GitHub account. If someone takes over the account they can change the code, which no browser protection can prevent.

### Get a free AI key (your own)

Open **Settings** in the app, choose a provider, and follow the "Get a key" link:

* Google Gemini (Google AI Studio), Groq, or OpenRouter (free models only are offered).
* Paste the key in the app. By default it is kept **in memory only** and disappears when you close the tab.
  If you tick "remember", it is encrypted with your passphrase (AES-256-GCM, PBKDF2-SHA256 with 600,000 rounds) before it is stored.
* Free tiers have limits, and some providers may use free-tier prompts to improve their products. Read each provider's current terms. The app never sends your name or birth place, and shows you everything it does send. The facts do include dasha dates and your birth year, so someone could work out an approximate birth date from them.
* Never put a key into any file of the repository. The test suite fails if it finds one.

### Add shared lessons

Edit `data/lessons.json`:

```json
{ "lessons": ["Always say which house a planet is in.", "Explain Sanskrit words in simple English."] }
```

Up to 50 short lines. They are sent to the AI as data, below the rules, so they cannot override the rules.

## Run it on your computer

```
npm install          # installs astronomy-engine (needed for the tests only)
npm test             # 7 test files: engine vs Swiss, rules, translations, reading, crypto, AI module, security lint
npm run serve        # then open http://127.0.0.1:8080
```

Browser tests (21 end-to-end checks in real Chromium with fake AI and place-search servers):

```
npm i -D playwright && npx playwright install chromium
npm run e2e
```

## Privacy in one minute

* Everything you enter is saved only in your own browser. There are no accounts, no analytics, no cookies, no ads.
* Place search sends only the place name you type to Open-Meteo. You can skip it and type latitude, longitude and time zone.
* When you ask the AI something, your question, notes, lessons, birth year and the computed facts go to the provider you chose. Name and birth place never do.
* Settings → Export gives you a file of your data (never your key). Settings → Delete wipes everything.

See `legal.html` (also linked from the app) and `SECURITY.md`.

## Honest limits

* **Not "exact predictions".** The chart numbers are exact. What they mean for a life is interpretation, and astrologers differ. The app says "tends to" and "traditionally", and never promises events.
* **Not "unhackable".** It has no server, no database and no login, which removes most attack surface, and it blocks script injection with a strict Content Security Policy. But a static site cannot set every security header, and your own device and GitHub account are part of the security. Details and the exact gaps are in `SECURITY.md`.
* **Scope:** Lahiri ayanamsa only, whole-sign houses, mean nodes, six divisional charts. No Shadbala, Ashtakavarga, Ashtakoota matching or muhurta. Dates before 1900 are refused.
* **Translations:** The Hindi, Bengali and Hinglish text was written by an AI (Claude) and has not been checked by native speakers. Please have a fluent reader look at `js/i18n.js` and `js/i18n-extra.js` and correct anything that sounds off.
* **Birth time matters.** Without an exact time the app switches to a reduced mode and the AI is told not to use houses or dasha timing.

## Legal checklist (I am not a lawyer; check with one if you go public with ads or payments)

* **Licence of this code:** MIT (`LICENSE`). Third-party licences: `legal/` and `NOTICE`.
* **No copied art or sound.** The mandala, stars and charts are drawn by code. Sounds are synthesised. Fonts are Cinzel and Noto Sans under the SIL Open Font Licence, self-hosted (no Google Fonts requests).
* **Place search:** Open-Meteo's free geocoding is for **non-commercial** use and asks for attribution (done in the footer and `legal.html`). Do not add advertising or charge money while using it. For a commercial site, switch to a paid plan or another service, and update the connection list in `index.html`.
* **Not advice:** the app says clearly that it is not medical, legal or financial advice and avoids death dates, diagnoses and investment tips.
* **Adults only (18+)** and **other people's data:** only enter someone's birth details if you have their permission. The app says so.
* **Privacy laws (GDPR, India DPDP, CCPA and others):** because you operate no server and collect nothing, there is little to comply with for personal use. If you let the public use your copy, the `legal.html` text is a reasonable start, but get proper advice before you do.
* **Astrology claims:** some countries restrict advertising of astrology as a guaranteed service. Keep the disclaimers if you share it.

## Project layout

```
index.html, legal.html        pages (strict CSP, no inline code)
css/style.css                 styles, themes, fonts
js/engine.js                  Vedic calculations
js/timezone.js                historical time zones
js/rules.js                   life-area scoring, yogas, doshas
js/reading.js                 turns facts into text, builds the AI fact sheet
js/i18n.js, i18n-extra.js     all text in four languages
js/ai.js                      providers, prompt rules, requests
js/store.js, crypto.js        local storage (validated) and key encryption
js/chart.js, fx.js, sound.js  SVG charts, mandala and stars, synthesised sounds
js/app.js, util.js            screens and the safe DOM helper
assets/vendor/                astronomy-engine (MIT, copied in, never loaded from a CDN)
data/lessons.json             shared lessons
tests/                        unit, security-lint and browser tests
```
