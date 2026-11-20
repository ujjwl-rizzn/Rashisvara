/*  DOM helpers. This is the ONLY way the app puts content on the screen.
    Text always goes in as text nodes, never as HTML, so nothing typed by a user
    or returned by an AI can become code. Dangerous attributes are refused. */
(function (root, factory) {
  root.JyotishDom = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const BAD_ATTR = /^(on|style$|srcdoc$|formaction$|src$|srcset$|xlink:href$)/i;

  function setAttrs(el, attrs) {
    if (!attrs) return;
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v === false || v === null || v === undefined) continue;
      if (BAD_ATTR.test(k)) throw new Error('Blocked attribute: ' + k);
      if (k === 'href' && !/^(#|https:\/\/|blob:)/.test(String(v))) throw new Error('Blocked link');
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  function add(el, kids) {
    for (const k of kids) {
      if (k === null || k === undefined || k === false) continue;
      if (Array.isArray(k)) add(el, k);
      else if (typeof Node !== 'undefined' && k instanceof Node) el.appendChild(k);
      else el.appendChild(document.createTextNode(String(k)));
    }
  }
  function h(tag, attrs, ...kids) { const el = document.createElement(tag); setAttrs(el, attrs); add(el, kids); return el; }
  function s(tag, attrs, ...kids) { const el = document.createElementNS(SVGNS, tag); setAttrs(el, attrs); add(el, kids); return el; }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function render(el, ...kids) { clear(el); add(el, kids); return el; }

  // Safe mini-formatter for AI answers: paragraphs, "- " bullet lists, **bold**. Everything is built as DOM text.
  function richText(text) {
    const box = document.createElement('div');
    const blocks = String(text).replace(/\r/g, '').split(/\n{2,}/);
    const inline = (parent, line) => {
      const parts = line.split('**');
      parts.forEach((part, i) => {
        if (!part) return;
        parent.appendChild(i % 2 === 1 ? h('strong', null, part) : document.createTextNode(part));
      });
    };
    const BULLET = /^\s*([-*\u2022]|\d+[.)])\s+/;
    for (const block of blocks) {
      const lines = block.split('\n').filter((l) => l.trim() !== '');
      let para = null, list = null;
      for (const l of lines) {
        if (BULLET.test(l)) {
          para = null;
          if (!list) { list = document.createElement('ul'); box.appendChild(list); }
          const li = document.createElement('li'); inline(li, l.replace(BULLET, '')); list.appendChild(li);
        } else {
          list = null;
          if (!para) { para = document.createElement('p'); box.appendChild(para); } else para.appendChild(document.createElement('br'));
          inline(para, l.replace(/^#+\s*/, ''));
        }
      }
    }
    return box;
  }

  return { h, s, clear, render, richText, SVGNS };
});
