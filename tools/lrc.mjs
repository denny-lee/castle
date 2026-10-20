// Lyrics for the Club screen. LRC is the usual timed-lyrics format:
//
//   [ar:Artist]            tags (ti, ar, al, by, length ...) are ignored
//   [offset:+250]          moves every line 250ms sooner (the usual LRC meaning)
//   [00:12.34] first line
//   [00:15.00][01:02.50] a line that repeats
//
// Output is [{t: ms, text}] sorted by t, the shape stored in songs.lyrics.

const STAMP = /\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

export function parseLrc(text) {
  const lines = [];
  let offset = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    const off = /^\s*\[offset:\s*([+-]?\d+)\s*\]/i.exec(raw);
    if (off) { offset = Number(off[1]); continue; }

    const stamps = [...raw.matchAll(STAMP)];
    if (!stamps.length) continue;
    const words = raw.replace(STAMP, '').trim();
    if (!words) continue;
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3].padEnd(3, '0')) : 0;
      lines.push({ t: Number(m[1]) * 60000 + Number(m[2]) * 1000 + frac, text: words });
    }
  }
  return lines.map((l) => ({ ...l, t: Math.max(0, l.t - offset) })).sort((a, b) => a.t - b.t);
}

/** No timings available: spread plain lines evenly over the middle of the song. */
export function spreadLyrics(text, durationMs) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const from = durationMs * 0.05, span = durationMs * 0.9;
  return lines.map((line, i) => ({ t: Math.round(from + (span * i) / lines.length), text: line }));
}
