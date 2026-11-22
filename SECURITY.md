# Security notes

No website can be made completely secure. This file describes the measures this app uses, its known limitations, and what the owner should do.

## Design

* **No server, no database, no login.** Pages are static files on GitHub Pages. There is nothing on a server to break into, and no user list to leak.
* **Strict Content Security Policy** (a `<meta>` tag on every page):
  * only scripts, styles, fonts and images from this site run (`script-src 'self'`, `style-src 'self'`, `img-src 'self'`, `font-src 'self'`);
  * no inline script, no inline style, no `eval` (checked in a real browser by `tests/e2e.js`);
  * the page may connect only to this site, Open-Meteo (place search) and the three AI providers;
  * `base-uri 'none'`, `form-action 'none'`, `object-src 'none'`.
* **No HTML injection path.** The code never uses `innerHTML`, `eval`, `document.write` or string timers (a lint test fails the build if they appear). All text goes in as text nodes. The helper that builds the page refuses `on*` handlers, `style`, `src`, `srcdoc` and any link that is not `https:`, `#` or `blob:`. AI replies are shown through a tiny renderer that can only make paragraphs, lists and bold.
* **Stored data is untrusted.** Everything read back from local storage is validated and trimmed (dates, numbers, time zones, model names, message roles, ids) and prototype-pollution names are rejected. A test tampers with storage and checks the app stays safe.
* **Your AI key**
  * goes only from your browser to the provider you chose, in a header (never in a URL) with no cookies and no referrer;
  * is kept in memory only by default;
  * if you choose "remember", is encrypted with a passphrase you set (AES-256-GCM, key from PBKDF2-SHA256 with 600,000 rounds, random salt and nonce) and auto-locks after 30 idle minutes; a wrong passphrase or tampered data fails cleanly;
  * is never included in exports and never written into error messages (provider error text is scrubbed).
* **Framing protection.** If the page is opened inside another site, it replaces itself with a notice and does not run (tested with a cross-origin frame).
* **Supply chain.** One vendored dependency (`astronomy-engine`, copied into `assets/vendor/`). No CDN, no analytics, no remote fonts. A secret-scan test fails if a key-like string is committed. `.github/dependabot.yml` watches `package.json` and the CI actions for updates (the vendored browser copy is updated by hand, see the checklist).
* **Privacy by design.** The AI receives computed facts, not your name or birth place. The "Facts sent to the AI" box shows the exact text.

## Known limitations

* **GitHub Pages cannot set custom HTTP headers.** A `<meta>` CSP cannot express `frame-ancestors`, so framing protection relies on the JavaScript guard above, and headers such as `X-Frame-Options`, `Permissions-Policy` and HSTS preload are not under your control. If you later put the site behind Cloudflare or another host that allows headers, add them.
* **Your device is part of the system.** Anyone who can use your browser profile can read local storage (your people, chats, notes). A malicious browser extension can read a key that is unlocked in memory. Use a device and browser profile you trust, and lock or forget the key when you are done.
* **Your GitHub account is the master key.** Whoever can push to the repository can change the code the browser runs, and no browser-side defence stops that. Use two-factor login, a strong unique password, and keep the repository free of tokens.
* **The AI provider sees what you send it** (your question, notes, birth year, computed facts). Their terms apply. A provider may keep or use free-tier data.
* **A leaked key is a leaked key.** Free keys are low-value, but if one is exposed, delete it in the provider's console and make a new one. Use provider-side limits or restrictions where offered.
* **Open-Meteo sees the place name you search for** (and your IP address, as any website would).
* The live AI providers were tested against local fakes, not the real services.

## Owner checklist

1. Two-factor login on GitHub; review who has write access.
2. Pages → Enforce HTTPS.
3. Never commit keys, exports or `.env` files (`.gitignore` covers common cases; the tests scan for key patterns).
4. Keep `npm test` green before every upload; GitHub Actions runs it for you (`.github/workflows/ci.yml`).
5. If you change the list of outside hosts, change both the CSP in `index.html` and the allowed list in `tests/security.test.js` on purpose.
6. Update `astronomy-engine` only deliberately: replace `assets/vendor/astronomy.browser.min.js`, update `package.json`, and re-run all tests.

## Reporting a problem

If you find a security issue in this project, please use GitHub's private "Report a vulnerability" on the repository's Security tab rather than a public issue. Include steps to reproduce.
