/*  Visual effects, all drawn by this code: a slow starfield and a mandala.
    No images are used, so there is nothing to license. Motion stops when the
    person has asked their device for reduced motion, and when the tab is hidden. */
(function (root, factory) {
  root.JyotishFx = factory(root.JyotishDom);
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  const { s } = D;

  function startSky(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, stars = [], raf = 0, last = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(190, Math.floor((w * h) / 9000));
      stars = Array.from({ length: count }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.3 + 0.25, ph: Math.random() * 6.28, sp: Math.random() * 0.0012 + 0.0004 }));
      draw(performance.now());
    }
    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      for (const st of stars) {
        const a = reduce ? 0.55 : 0.35 + 0.45 * Math.sin(st.ph + t * st.sp);
        ctx.globalAlpha = Math.max(0.08, a);
        ctx.fillStyle = '#f5e6c8';
        ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    function loop(t) {
      raf = requestAnimationFrame(loop);
      if (t - last < 60) return;        // about 16 frames a second is plenty for a slow twinkle
      last = t; draw(t);
    }
    function play() { if (!reduce && !raf && !document.hidden) raf = requestAnimationFrame(loop); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else play(); });
    resize(); play();
  }

  // A mandala drawn from simple curves.
  function mandala(size) {
    const svg = s('svg', { viewBox: '-50 -50 100 100', width: size, height: size, class: 'mandala', 'aria-hidden': 'true', focusable: 'false' });
    const g = s('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': '0.9', 'stroke-linecap': 'round' });
    g.appendChild(s('circle', { r: 47 })); g.appendChild(s('circle', { r: 38, opacity: '0.7' })); g.appendChild(s('circle', { r: 5 }));
    const petal = 'M0,-44 C9,-32 9,-16 0,-7 C-9,-16 -9,-32 0,-44Z';
    for (let i = 0; i < 12; i++) g.appendChild(s('path', { d: petal, transform: 'rotate(' + i * 30 + ')' }));
    const inner = 'M0,-27 C6,-20 6,-12 0,-8 C-6,-12 -6,-20 0,-27Z';
    for (let i = 0; i < 8; i++) g.appendChild(s('path', { d: inner, transform: 'rotate(' + (i * 45 + 22.5) + ')', opacity: '0.8' }));
    svg.appendChild(g);
    return svg;
  }
  return { startSky, mandala };
});
