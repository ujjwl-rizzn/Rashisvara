// Runs every test file in a fresh process and reports. Exit code 1 if anything fails.
const { spawnSync } = require('child_process'), path = require('path');
const files = ['engine', 'rules', 'i18n', 'reading', 'crypto', 'ai', 'security'];
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f + '.test.js')], { encoding: 'utf8', env: process.env });
  process.stdout.write(r.stdout);
  if (r.status !== 0) { failed++; console.error('FAILED: ' + f + '\n' + r.stderr); }
}
console.log(failed ? '\n' + failed + ' test file(s) FAILED' : '\nAll ' + files.length + ' test files passed');
process.exit(failed ? 1 : 0);
