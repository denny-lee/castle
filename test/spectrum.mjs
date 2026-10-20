// The mp3 -> bars pipeline and the LRC parser, checked against signals whose
// answer is known. No ffmpeg needed: these feed PCM straight in.

import { fft, bandBins, analyze, toBase64 } from '../tools/spectrum.mjs';
import { parseLrc, spreadLyrics } from '../tools/lrc.mjs';

let fail = 0;
const ok = (cond, msg) => {
  console.log((cond ? 'ok   ' : 'FAIL ') + msg);
  if (!cond) fail++;
};

// ---- FFT ------------------------------------------------------------------
{
  const n = 64;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 5 * i) / n);
  fft(re, im);
  const mags = Array.from(re, (r, i) => Math.hypot(r, im[i]));
  const peak = mags.indexOf(Math.max(...mags.slice(0, n / 2)));
  ok(peak === 5 && Math.abs(mags[5] - n / 2) < 1e-6, 'fft: a 5-cycle cosine lands in bin 5 with amplitude n/2');
}

// ---- bands ----------------------------------------------------------------
const SR = 22050;
const bins = bandBins(48, SR, 2048);
ok(bins.length === 48 && bins.every((b) => b.hi > b.lo), 'bands: 48 non-empty bin ranges');
ok(bins.every((b, i) => i === 0 || b.centre > bins[i - 1].centre), 'bands: centres rise');
ok(bins[0].centre > 38 && bins[47].centre < 10000, 'bands: they span roughly 40Hz to 10kHz');

// ---- a known tone ---------------------------------------------------------
function tone(freq, seconds, amp = 0.5) {
  const out = new Float32Array(Math.round(SR * seconds));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}
for (const freq of [200, 1000, 5000]) {
  const spec = analyze(tone(freq, 2), SR, { fps: 24, bands: 48 });
  const frame = 20;                                    // well clear of both edges
  const row = spec.data.slice(frame * 48, frame * 48 + 48);
  const top = row.indexOf(Math.max(...row));
  const c = bins[top].centre;
  ok(spec.frames === 48 && spec.data.length === 48 * 48, `analyze(${freq}Hz): 2s at 24fps gives 48 frames of 48 bands`);
  ok(c > freq / 1.25 && c < freq * 1.25, `analyze(${freq}Hz): loudest band is near it (band ${top}, ~${Math.round(c)}Hz)`);
  ok(row[top] > 150, `analyze(${freq}Hz): and clearly lit (${row[top]}/255)`);
  const far = row.filter((_, i) => Math.abs(i - top) > 12);
  ok(Math.max(...far) < row[top] * 0.4, `analyze(${freq}Hz): bands far away stay low (max ${Math.max(...far)})`);
}

// ---- silence and loudness ordering ---------------------------------------
{
  const quiet = analyze(new Float32Array(SR), SR);
  ok(quiet.data.every((v) => v === 0), 'analyze: silence is all zero');
  const soft = analyze(tone(1000, 1, 0.05), SR), loud = analyze(tone(1000, 1, 0.8), SR);
  ok(Math.max(...loud.data) > Math.max(...soft.data), 'analyze: a louder tone gives taller bars');
  ok(analyze(tone(1000, 0.01), SR).frames >= 1, 'analyze: a clip shorter than a frame still yields a frame');
}

ok(toBase64(new Uint8Array([0, 1, 2, 3])) === 'AAECAw==', 'toBase64 matches the base64 the database test expects');

// ---- LRC ------------------------------------------------------------------
{
  const lrc = [
    '[ti:Some Song]', '[ar:Someone]', '[offset:+500]',
    '[00:12.34] first line', '[00:20.5][01:02.50]chorus', '[00:30]  ', 'no stamp here', '[1:05:07] colon fraction',
  ].join('\r\n');
  const got = parseLrc(lrc);
  ok(got.length === 4, `lrc: tags, blank lines and unstamped lines are skipped (${got.length} lines)`);
  ok(got[0].t === 11840 && got[0].text === 'first line', 'lrc: minutes, seconds and hundredths parse, and a positive offset moves it sooner');
  ok(got[1].t === 20000 && got[1].text === 'chorus' && got[2].t === 62000 && got[2].text === 'chorus',
    'lrc: one line with two stamps appears twice, in time order, with 1-3 digit fractions');
  ok(got.every((l, i) => i === 0 || l.t >= got[i - 1].t), 'lrc: sorted by time');
  ok(parseLrc('[00:01.00] a').length === 1 && parseLrc('').length === 0, 'lrc: trivial inputs');
  ok(parseLrc('[00:00.10]x\n[offset:+500]')[0].t === 0, 'lrc: an offset never pushes a line before 0');

  const even = spreadLyrics('one\n\n two \nthree\nfour', 100000);
  ok(even.length === 4 && even[0].t === 5000 && even[3].t > even[2].t && even[3].t < 100000,
    'spread: blank lines dropped, lines evenly spaced inside the song');
  ok(spreadLyrics('', 1000).length === 0, 'spread: no text, no lines');
}

console.log(fail ? `\n${fail} FAILURES` : '\nall spectrum checks passed');
process.exit(fail ? 1 : 0);
