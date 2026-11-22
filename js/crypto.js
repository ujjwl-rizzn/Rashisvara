/*  Key protection. An AI key saved on this device is encrypted with a passphrase
    (PBKDF2-SHA256, 600,000 rounds, then AES-256-GCM). Without the passphrase the
    saved text is useless. The passphrase itself is never stored. */
(function (root, factory) {
  root.RsvCrypto = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ITER = 600000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function toB64(buf) {
    const b = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function fromB64(str) {
    const s = atob(str);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }
  async function deriveKey(pass, salt, iter) {
    const material = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, material,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(pass, text) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pass, salt, ITER);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
    return { v: 1, iter: ITER, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
  }
  function validBlob(b) {
    return b && b.v === 1 && Number.isInteger(b.iter) && b.iter >= 100000 && b.iter <= 2000000
      && typeof b.salt === 'string' && typeof b.iv === 'string' && typeof b.ct === 'string'
      && b.salt.length < 100 && b.iv.length < 50 && b.ct.length < 2000;
  }
  async function decrypt(pass, blob) {
    if (!validBlob(blob)) throw new Error('bad-blob');
    try {
      const key = await deriveKey(pass, fromB64(blob.salt), blob.iter);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, key, fromB64(blob.ct));
      return dec.decode(pt);
    } catch (e) {
      throw new Error('bad-passphrase');
    }
  }
  function randomId() {
    const a = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(a, (x) => (x % 36).toString(36)).join('');
  }
  return { encrypt, decrypt, validBlob, randomId, ITER };
});
