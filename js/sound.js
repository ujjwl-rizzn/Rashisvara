/*  Sounds. Every sound is made on the spot from simple sine waves by the browser's
    Web Audio engine. There are no audio files, so there is nothing to license.
    Nothing plays until the person has tapped something, as browsers require. */
(function (root, factory) {
  root.RsvSound = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let ctx = null, master = null, enabled = true, ambientOn = false, amb = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain(); master.gain.value = 0.3; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* ignore */ } }
    return ctx;
  }
  function tone(freq, t0, dur, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  // A soft bell: a few partials that fade at different speeds.
  function chime() {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime;
    [[1, 0.16, 2.2], [2.76, 0.07, 1.4], [5.4, 0.04, 0.9], [8.93, 0.02, 0.5]].forEach(([r, v, d]) => tone(523.25 * r, t, d, v));
  }
  function tap() { if (!enabled || !ensure()) return; tone(660, ctx.currentTime, 0.09, 0.05); }
  function soft() {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime; tone(440, t, 0.5, 0.06); tone(554.37, t + 0.12, 0.6, 0.05);
  }
  function setEnabled(v) { enabled = !!v; if (!enabled) setAmbient(false); }
  function setAmbient(v) {
    ambientOn = !!v;
    if (ambientOn && enabled) {
      if (!ensure() || amb) return;
      const out = ctx.createGain(); out.gain.value = 0.0001;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.07; lg.gain.value = 0.012; lfo.connect(lg); lg.connect(out.gain);
      const oscs = [110, 164.81, 220.5, 277.18].map((f, i) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = (i - 1.5) * 4; o.connect(lp); return o; });
      lp.connect(out); out.connect(master);
      out.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 3);
      oscs.forEach((o) => o.start()); lfo.start();
      amb = { out, oscs, lfo };
    } else if (amb) {
      const a = amb; amb = null;
      try { a.out.gain.cancelScheduledValues(ctx.currentTime); a.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); } catch (e) { /* ignore */ }
      setTimeout(() => { a.oscs.forEach((o) => { try { o.stop(); } catch (e) { /* ignore */ } }); try { a.lfo.stop(); } catch (e) { /* ignore */ } }, 1500);
    }
  }
  return { chime, tap, soft, setEnabled, setAmbient, isAmbient: () => ambientOn };
});
