/*  Time zone helper.
    A chart is only as exact as the birth time in UTC. India alone has had
    several different clock offsets in history (for example +6:30 war time in
    1942-45), so the offset is read from the browser's built-in IANA time zone
    database for the exact birth date, never assumed from today's rule. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RsvTZ = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const cache = new Map();
  function formatter(zone) {
    let f = cache.get(zone);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
      });
      cache.set(zone, f);
    }
    return f;
  }

  // Offset from UTC in seconds that the zone had at this UTC moment.
  function offsetSecondsAt(utcMs, zone) {
    const whole = Math.floor(utcMs / 1000) * 1000;
    const parts = {};
    for (const p of formatter(zone).formatToParts(new Date(whole))) parts[p.type] = p.value;
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
    return Math.round((asUtc - whole) / 1000);
  }

  // Turn a wall-clock time in a zone into UTC.
  // Returns { utcMs, offsetSec, status } where status is 'ok', 'ambiguous' (clock repeated) or 'nonexistent' (clock skipped).
  function localToUtc(y, mo, d, h, mi, s, zone) {
    const wall = Date.UTC(y, mo - 1, d, h, mi, s || 0);
    const before = offsetSecondsAt(wall - DAY, zone);
    const after = offsetSecondsAt(wall + DAY, zone);
    const cands = [...new Set([before, after])]
      .map((o) => ({ o, utc: wall - o * 1000 }))
      .filter((c) => offsetSecondsAt(c.utc, zone) === c.o);
    if (cands.length === 1) return { utcMs: cands[0].utc, offsetSec: cands[0].o, status: 'ok' };
    if (cands.length === 2) {
      cands.sort((a, b) => a.utc - b.utc);
      return { utcMs: cands[0].utc, offsetSec: cands[0].o, status: 'ambiguous', alternative: { utcMs: cands[1].utc, offsetSec: cands[1].o } };
    }
    return { utcMs: wall - after * 1000, offsetSec: after, status: 'nonexistent' };
  }
  const DAY = 86400000;

  // Format a UTC moment as a wall-clock string in a zone.
  function formatLocal(utcMs, zone, opts) {
    return new Intl.DateTimeFormat((opts && opts.locale) || 'en-GB', Object.assign({
      timeZone: zone, year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }, opts && opts.format)).format(new Date(utcMs));
  }

  function offsetLabel(sec) {
    const sign = sec < 0 ? '-' : '+';
    const a = Math.abs(sec);
    const h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), s = a % 60;
    return 'UTC' + sign + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + (s ? ':' + String(s).padStart(2, '0') : '');
  }

  return { offsetSecondsAt, localToUtc, formatLocal, offsetLabel };
});
