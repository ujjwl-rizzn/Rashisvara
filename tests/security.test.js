// Security lint. These checks fail the build if unsafe patterns creep in.
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const walk = (d, out = []) => { for (const f of fs.readdirSync(d)) { if (['node_modules', '.git', 'assets'].includes(f)) continue; const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p, out) : out.push(p); } return out; };

// 1. No dangerous browser APIs in our own scripts
const jsFiles = walk(path.join(root, 'js'));
const BAD = [/\binnerHTML\b/, /\bouterHTML\b/, /\binsertAdjacentHTML\b/, /\bdocument\.write/, /\beval\s*\(/, /\bnew\s+Function\b/, /\bsetTimeout\s*\(\s*['"`]/, /\bsetInterval\s*\(\s*['"`]/, /\.srcdoc\b/, /\bimportScripts\b/, /\bWebSocket\b/, /\bXMLHttpRequest\b/];
for (const f of jsFiles) { const s = read(path.relative(root, f)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); for (const re of BAD) assert(!re.test(s), path.basename(f) + ' uses ' + re); }

// 2. Content Security Policy is present and strict
for (const page of ['index.html', 'legal.html']) {
  const html = read(page); const m = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/); assert(m, page + ': CSP missing');
  const csp = m[1];
  assert(/default-src 'none'/.test(csp) && /script-src '(self|none)'(;|$)/.test(csp) && /style-src 'self'(;|$)/.test(csp) && /base-uri 'none'/.test(csp) && /form-action 'none'/.test(csp) && /object-src 'none'/.test(csp), page + ': CSP too loose');
  assert(!/unsafe-inline|unsafe-eval|\*(?!\.)/.test(csp.replace(/https:\/\/[^\s;]+/g, '')), page + ': CSP allows unsafe sources');
  assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), page + ': inline script found');
  assert(!/<style[\s>]/i.test(html) && !/\sstyle\s*=/i.test(html), page + ': inline style found');
  assert(!/\son[a-z]+\s*=/i.test(html), page + ': inline event handler found');
  assert(!/<(iframe|object|embed|form[^>]*action)/i.test(html.replace(/<form id="birth-form"[^>]*>/, '')), page + ': embedded content found');
  for (const m2 of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) assert(!/^(https?:)?\/\//.test(m2[1]), page + ': remote script ' + m2[1]);
  for (const m2 of html.matchAll(/<link[^>]*\shref="([^"]+)"/g)) assert(!/^(https?:)?\/\//.test(m2[1]), page + ': remote stylesheet ' + m2[1]);
}
// 3. Every host the code talks to is on the CSP list, and nothing else
const csp = read('index.html').match(/connect-src ([^;"]+)/)[1];
const allowed = csp.split(/\s+/).filter((x) => x.startsWith('https://'));
const code = jsFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const used = new Set([...code.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((m) => 'https://' + m[1]));
const linkOnly = new Set(['https://aistudio.google.com', 'https://console.groq.com', 'https://openrouter.ai', 'https://www.w3.org']);   // key pages are links, not connections
for (const u of used) assert(allowed.includes(u) || linkOnly.has(u), 'code mentions a host not on the CSP list: ' + u);
// 4. CSS and fonts load only from this site
const css = read('css/style.css'); for (const m of css.matchAll(/url\(([^)]+)\)/g)) assert(!/https?:|\/\//.test(m[1].replace(/["']/g, '')), 'remote url in css: ' + m[1]);
assert(!/@import/.test(css), 'css @import');
// 5. No secrets in the repository
const SECRET = [/AIza[0-9A-Za-z_-]{30,}/, /gsk_[0-9A-Za-z]{30,}/, /sk-or-[0-9A-Za-z-]{20,}/, /sk-[0-9A-Za-z]{40,}/, /ghp_[0-9A-Za-z]{30,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
for (const f of walk(root)) { if (/\.(png|woff2|woff)$/.test(f) || f.includes('package-lock')) continue; const s = fs.readFileSync(f, 'utf8'); for (const re of SECRET) assert(!re.test(s), 'possible secret in ' + path.relative(root, f)); }
// 6. Outbound links open safely
const app = read('js/app.js'); assert(/rel:\s*'noopener noreferrer'/.test(app), 'external links need rel=noopener noreferrer');
// 7. The DOM helper refuses dangerous attributes (checked by reading its rule)
assert(/BAD_ATTR = \/\^\(on\|style\$\|srcdoc\$/.test(read('js/util.js')), 'DOM helper attribute filter changed');
console.log('security: no unsafe APIs, strict CSP on every page, no remote code or fonts, no secrets, ' + used.size + ' hosts all accounted for');
