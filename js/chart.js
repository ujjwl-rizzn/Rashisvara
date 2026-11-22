/*  Chart drawing: North Indian (diamond) and South Indian (grid), as plain SVG.
    The pictures are drawn by this code, so there are no image files and no copyright questions. */
(function (root, factory) {
  root.RsvChart = factory(root.RsvEngine, root.RsvI18n, root.RsvDom);
})(typeof self !== 'undefined' ? self : this, function (E, I, D) {
  'use strict';

  const { s } = D;
  const n = I.name;

  // Which items sit in each sign for a given divisional chart.
  function data(chart, varga) {
    const lagna = varga === 1 ? chart.asc.sign : chart.asc.vargas[varga];
    const bySign = Array.from({ length: 12 }, () => []);
    bySign[lagna].push({ id: 'As' });
    for (const p of chart.planets) {
      bySign[varga === 1 ? p.sign : p.vargas[varga]].push({ id: p.id, retro: p.retro && p.id !== 'Ra' && p.id !== 'Ke' });
    }
    return { lagna, bySign };
  }
  const label = (L, it) => n.planetShort(L, it.id) + (it.retro ? '(R)' : '');
  const signLabel = (L, i) => (L === 'en' ? n.signShort(L, i) : n.sign(L, i));

  function rows(items, L, perRow) {
    const out = [];
    for (let i = 0; i < items.length; i += perRow) out.push(items.slice(i, i + perRow).map((it) => label(L, it)).join(' '));
    return out;
  }
  function describe(d, L, northStyle) {
    const parts = [];
    for (let i = 0; i < 12; i++) {
      const sign = northStyle ? (d.lagna + i) % 12 : i;
      const its = d.bySign[sign];
      if (its.length) parts.push((northStyle ? I.ui(L, 'house') + ' ' + (i + 1) + ' ' : '') + n.sign(L, sign) + ': ' + its.map((it) => label(L, it)).join(', '));
    }
    return parts.join('. ');
  }

  // ---- North Indian ---------------------------------------------------------
  // House polygons, planet anchor (px,py), sign-number anchor (sx,sy), items per row.
  const NORTH = [
    { pts: '200,200 100,100 200,0 300,100', p: [200, 92], g: [200, 176], per: 3 },   // 1
    { pts: '0,0 200,0 100,100',            p: [100, 38], g: [100, 84],  per: 3 },   // 2
    { pts: '0,0 0,200 100,100',            p: [36, 100], g: [84, 100],  per: 2 },   // 3
    { pts: '0,200 100,100 200,200 100,300', p: [90, 200], g: [165, 200], per: 3 },  // 4
    { pts: '0,200 0,400 100,300',          p: [36, 300], g: [84, 300],  per: 2 },   // 5
    { pts: '0,400 200,400 100,300',        p: [100, 366], g: [100, 318], per: 3 },  // 6
    { pts: '200,200 100,300 200,400 300,300', p: [200, 306], g: [200, 236], per: 3 }, // 7
    { pts: '200,400 400,400 300,300',      p: [300, 366], g: [300, 318], per: 3 },  // 8
    { pts: '400,400 400,200 300,300',      p: [364, 300], g: [316, 300], per: 2 },  // 9
    { pts: '400,200 300,300 200,200 300,100', p: [310, 200], g: [236, 200], per: 3 }, // 10
    { pts: '400,200 400,0 300,100',        p: [364, 100], g: [316, 100], per: 2 },  // 11
    { pts: '400,0 200,0 300,100',          p: [300, 38], g: [300, 84],  per: 3 },   // 12
  ];

  function north(d, L, title) {
    const svg = s('svg', { viewBox: '0 0 400 400', role: 'img', 'aria-label': title, class: 'chart' }, s('title', null, title), s('desc', null, describe(d, L, true)));
    NORTH.forEach((h, i) => svg.appendChild(s('polygon', { points: h.pts, class: 'chart-cell' + (i === 0 ? ' lagna' : '') })));
    svg.appendChild(s('rect', { x: 1, y: 1, width: 398, height: 398, class: 'chart-line' }));
    svg.appendChild(s('line', { x1: 0, y1: 0, x2: 400, y2: 400, class: 'chart-line' }));
    svg.appendChild(s('line', { x1: 400, y1: 0, x2: 0, y2: 400, class: 'chart-line' }));
    svg.appendChild(s('polygon', { points: '200,0 400,200 200,400 0,200', class: 'chart-line' }));
    NORTH.forEach((h, i) => {
      const sign = (d.lagna + i) % 12;
      svg.appendChild(s('text', { x: h.g[0], y: h.g[1], class: 'chart-sign', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, String(sign + 1)));
      const lines = rows(d.bySign[sign], L, h.per);
      const top = h.p[1] - ((lines.length - 1) * 8);
      lines.forEach((ln, j) => svg.appendChild(s('text', { x: h.p[0], y: top + j * 17, class: 'chart-pl', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, ln)));
    });
    return svg;
  }

  // ---- South Indian ---------------------------------------------------------
  // sign index -> [column, row] on a 4x4 grid; Pisces is top-left, signs run clockwise.
  const SOUTH = { 11: [0, 0], 0: [1, 0], 1: [2, 0], 2: [3, 0], 3: [3, 1], 4: [3, 2], 5: [3, 3], 6: [2, 3], 7: [1, 3], 8: [0, 3], 9: [0, 2], 10: [0, 1] };

  function south(d, L, title, centerText) {
    const svg = s('svg', { viewBox: '0 0 400 400', role: 'img', 'aria-label': title, class: 'chart' }, s('title', null, title), s('desc', null, describe(d, L, false)));
    for (let sign = 0; sign < 12; sign++) {
      const [c, r] = SOUTH[sign]; const x = c * 100, y = r * 100;
      svg.appendChild(s('rect', { x, y, width: 100, height: 100, class: 'chart-cell chart-line' + (sign === d.lagna ? ' lagna' : '') }));
      if (sign === d.lagna) svg.appendChild(s('polygon', { points: x + ',' + y + ' ' + (x + 26) + ',' + y + ' ' + x + ',' + (y + 26), class: 'chart-mark' }));
      svg.appendChild(s('text', { x: x + 50, y: y + 14, class: 'chart-sign', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, signLabel(L, sign)));
      const lines = rows(d.bySign[sign], L, 3);
      const top = y + 56 - ((lines.length - 1) * 8);
      lines.forEach((ln, j) => svg.appendChild(s('text', { x: x + 50, y: top + j * 17, class: 'chart-pl', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, ln)));
    }
    svg.appendChild(s('text', { x: 200, y: 200, class: 'chart-center', 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, centerText || ''));
    return svg;
  }

  function render(style, chart, varga, L, title, centerText) {
    const d = data(chart, varga);
    return style === 'south' ? south(d, L, title, centerText) : north(d, L, title);
  }

  return { data, render, describe, NORTH, SOUTH };
});
