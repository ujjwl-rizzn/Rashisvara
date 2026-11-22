# Rashisvara

Rashisvara is a free Vedic (Jyotish) astrology web app. It calculates a birth chart in the browser and shows traditional predictions for
the day, week, month and year across nine areas of life. It is a static site with no backend, designed to be hosted on GitHub Pages.

Languages: English, Hindi, Bengali and Hinglish.

**Live app:** https://ujjwl-rizzn.github.io/Rashisvara/

## Features

- **Home:** predictions for today, the next 7 days, the next 30 days and the next 12 months for career, money, love, marriage, family,
  health habits, studies, travel and spirituality. Each result lists the reasons behind it, the best days or months, and days that need extra care.
  Today's view includes panchang, sunrise and sunset, Rahu Kaal, Yamaganda and Gulika.
- **Chart:** North or South Indian chart, divisional charts (D1, D3, D7, D9, D10, D12), planet table with nakshatra, pada, house and dignity,
  panchang at birth, Jaimini karakas and the Ashtakavarga table.
- **Dasha:** full Vimshottari timeline (main, sub and sub-sub periods) with the running period.
- **Reading:** life-area scores with reasons, yogas and doshas, and the live sky with Sade Sati and transit notes.
- **Ask:** type a question in plain words and get an answer immediately from the same rules that drive the Home page. No key or account is needed.
  An optional AI chat is available for open-ended questions.
- **PDF report:** the browser's "Save as PDF" prints a report whose first page is the predictions summary.
- **Backup and restore:** export saved people, notes, chats and lessons to a dated JSON file and restore it later, either adding to or replacing local data.

## How the predictions are calculated

Planet positions come from the MIT-licensed [astronomy-engine](https://github.com/cosinekitty/astronomy) library and are converted to the
sidereal zodiac with the Lahiri ayanamsa. Houses are whole-sign, nodes are mean nodes, and Vimshottari dasha uses 365.25-day years.

For each life area the outlook combines three scored parts. The rules are in `js/outlook.js` and each result shows its reasons.

1. **Birth chart:** strength of the area's houses, their rulers and natural significators, blended with Sarvashtakavarga points (`js/ashtaka.js`).
2. **Dasha:** the running main, sub and sub-sub periods, and whether each period's planet rules, occupies or signifies the area.
3. **Transit (gochara):** current planet positions counted from the natal Moon, weighted by each planet's own Ashtakavarga points, plus Tara bala.

Scores are converted to labels by comparing them with the distribution of scores the same method gives to 500 sample charts over many dates
(`js/outlook-cal.js`): top 15% Strong, next 35% Good, next 30% Mixed, lowest 20% Needs care. A label therefore means "relative to a typical period",
not "an event will happen". The same chart at the same moment always gives the same result. The Home page uses no AI and no randomness.

Daily times and the definition of "today" use the birth place and its time zone.

## Optional AI chat

The chat sends the model a fact sheet computed by the app (chart, dasha, outlooks, Ashtakavarga) together with fixed rules. Because a static site
cannot keep a secret, there is no shared AI key. A user who wants the chat supplies their own free key from Google Gemini, Groq or OpenRouter in Settings.
By default the key stays in memory for the session. It can be stored encrypted with a passphrase (AES-256-GCM, PBKDF2-SHA256, 600,000 iterations).

Every AI reply is checked against the chart. The model must end its answer with a `CHECK:` line listing the chart facts it used. The app compares
planet signs, houses, lagna and the running dasha with the real chart, and looks for dates that do not appear in the fact sheet. If a mismatch is found
the model is asked once to correct the answer. The result is shown as a badge: checked, corrected and checked, could not fully verify, or not fact-checked.
The check detects factual mismatches. It does not assess the quality of the advice.

Everything else in the app, including Quick Answers, works without a key.

## Privacy and security

- All data is stored in the visitor's browser. There are no accounts, cookies, analytics or advertising.
- Place search sends only the typed place name to Open-Meteo. Latitude, longitude and time zone can be entered by hand instead.
- Home, Quick Answers, PDF export and backup make no network requests.
- AI chat requests contain the question, notes, lessons, birth year and computed facts. The name and birth place are not sent.
- Backup files contain personal birth details and should be stored carefully. They never include the AI key or the data-sharing consent setting.
- Security measures include a strict Content Security Policy, no `innerHTML` or `eval`, validation of all stored and imported data, size limits on imports and
  a vendored library with no CDN. Details and known limitations are in [SECURITY.md](SECURITY.md).

## Deployment on GitHub Pages

1. Create a public repository. The repository holds only code. Birth data and keys never leave visitors' browsers.
2. Upload the contents of this folder so that `index.html` is at the top level of the repository.
3. Open **Settings > Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save. The site is published at
   `https://USERNAME.github.io/REPOSITORY/` after about a minute. Enable **Enforce HTTPS** if it is offered.
4. Enable two-factor authentication on the GitHub account.

### Updating an existing deployment

1. Unzip the new release and open the inner `rashisvara` folder.
2. If you changed `data/lessons.json`, keep a copy of your version.
3. In the repository, delete any zip file that was uploaded by mistake (open it, use the trash icon, commit).
4. Choose **Add file > Upload files** and drag in everything from inside the `rashisvara` folder. Files with the same name are replaced. Commit the change.
   GitHub accepts up to 100 files per upload. If the page refuses, upload the `tests` folder in a second commit, or leave it out, since the site does not need it.
5. Wait about a minute and reload the site. Saved people and settings in each visitor's browser are kept. Data saved by older versions is migrated automatically.

Shared lessons for all visitors can be added in `data/lessons.json` (up to 50 short lines, treated as data and never as instructions).

## Development

```
npm install
npm test         # 12 test files: engine vs Swiss Ephemeris, rules, Ashtakavarga, outlook, router, checker, translations, reading, crypto, AI module, backup, security
npm run serve    # http://127.0.0.1:8080
npm run e2e      # 28 browser tests in Chromium; needs Playwright and poppler-utils
```

End-to-end setup: `npm i -D playwright && npx playwright install chromium`. The PDF test uses `pdftotext` and `pdffonts` from poppler-utils.
After changing outlook weights, run `node tests/calibrate.js` to regenerate `js/outlook-cal.js`.

## Accuracy and verification

- Planet and ascendant longitudes were compared with Swiss Ephemeris output for 60 fixed reference births (`tests/fixtures`). The largest differences were
  under 14 arcseconds for planets and under 1 arcsecond for the nodes and ascendant. Swiss Ephemeris is used only for checking and is not included.
- Ashtakavarga tables were checked against published tables and a published worked example, and every chart must reproduce the fixed totals (337 in all).
- Makar Sankranti 2026 is about 6 minutes earlier than a published panchang, a difference caused by ayanamsa convention.
- The browser tests use local stand-ins for Open-Meteo and the AI providers. The live AI services have not been tested.

## Limitations

- Chart positions are calculated, but their meaning is interpretation and astrologers differ. Results are traditional tendencies and not predictions of events.
  The app does not give death dates, medical advice, legal advice or investment tips.
- A static site has no server-side protection and cannot set HTTP headers. The visitor's device and the GitHub account are part of the security model.
- Only the Lahiri ayanamsa, whole-sign houses, mean nodes and six divisional charts are supported. Ashtakoota matching, Shadbala and muhurta are not included.
  Dates before 1900 are not accepted.
- Without a birth time the app uses only Moon-sign transits and marks results as approximate.
- Quick Answers recognise common words for the nine areas and four periods in the four languages. Unusual phrasing may not be understood.
- Hindi, Bengali and Hinglish text was machine-written and has not been reviewed by native speakers.
- Testing was done in Chromium only.

## Licensing and attribution

- Code: MIT, see `LICENSE`. Third-party notices are in `NOTICE` and `legal/`.
- Visuals and sound: the logo, mandala, star background and charts are generated by the project's own code, and sounds are synthesised with the Web Audio API.
  No third-party images, audio or video files are included.
- Fonts: Cinzel and Noto Sans (SIL Open Font Licence 1.1), self-hosted.
- Place search uses the Open-Meteo geocoding API, which is free for non-commercial use and requires attribution (provided in the footer and `legal.html`).
- The app is for adults. Birth details of other people should be entered only with their permission.
- Anyone operating a public copy should review privacy law (GDPR, India DPDP, CCPA) and local rules on advertising astrology. This is not legal advice.

## Project structure

```
index.html, legal.html          pages (strict CSP, no inline code)
css/style.css                   styles, themes, print layout
js/engine.js, timezone.js       calculations, historical time zones
js/rules.js                     chart scoring, yogas, doshas
js/ashtaka.js                   Ashtakavarga
js/outlook.js, outlook-cal.js   day, week, month and year outlooks and their calibration table
js/outlook-view.js              outlooks as text in four languages
js/ask-router.js                Quick Answers
js/checker.js                   AI reply fact checker
js/reading.js                   chart text and AI fact sheet
js/i18n*.js                     interface text
js/ai.js                        providers, prompt rules, requests
js/store.js, crypto.js          validated storage, backup and restore, key encryption
js/chart.js, fx.js, sound.js    SVG charts, mandala and stars, synthesised sounds
js/app.js, util.js              screens and the safe DOM helper
assets/vendor/                  astronomy-engine (MIT), never loaded from a CDN
data/lessons.json               shared lessons
tests/                          unit, security and browser tests
```
