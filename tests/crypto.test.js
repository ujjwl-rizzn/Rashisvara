// Key encryption round trip (Node has the same Web Crypto API as the browser).
const assert = require('assert');
global.window = global; global.self = global;
require('../js/crypto.js'); const C = global.RsvCrypto;
(async () => {
  const blob = await C.encrypt('correct horse battery', 'AIzaFAKEKEY1234567890');
  assert(C.validBlob(blob) && blob.iter === 600000 && !JSON.stringify(blob).includes('FAKEKEY'));
  assert.strictEqual(await C.decrypt('correct horse battery', blob), 'AIzaFAKEKEY1234567890');
  await assert.rejects(() => C.decrypt('wrong passphrase!', blob), /bad-passphrase/);
  const tampered = Object.assign({}, blob, { ct: blob.ct.slice(0, -4) + 'AAAA' });
  await assert.rejects(() => C.decrypt('correct horse battery', tampered), /bad-passphrase/);
  await assert.rejects(() => C.decrypt('x', { v: 1, iter: 5, salt: 'a', iv: 'b', ct: 'c' }), /bad-blob/);       // refuses weak settings from storage
  const b2 = await C.encrypt('correct horse battery', 'same'); assert.notStrictEqual(b2.salt, blob.salt);        // fresh salt every time
  assert(/^[a-z0-9]{12}$/.test(C.randomId()));
  console.log('crypto: encrypt/decrypt, wrong passphrase, tampering and weak-settings checks pass');
})().catch((e) => { console.error(e); process.exit(1); });
