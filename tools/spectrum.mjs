// Turn mono PCM into the bar data the Club screen draws: a spectrum per frame,
// log-spaced bands, one byte per band.
//
// The pipeline is the usual analyser one: a Hann window, a radix-2 FFT, bin
// magnitudes folded into bands, then dB mapped onto 0..255. Pure functions, no
// I/O, so test/spectrum.mjs can check them against a known sine.

/** In-place iterative radix-2 FFT. re and im must have the same power-of-two length. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** FFT bin ranges [lo, hi) for `bands` log-spaced bands between fmin and fmax. */
export function bandBins(bands, sampleRate, size, fmin = 40, fmax = 10000) {
  const top = Math.min(fmax, sampleRate / 2);
  const out = [];
  for (let i = 0; i < bands; i++) {
    const f0 = fmin * (top / fmin) ** (i / bands);
    const f1 = fmin * (top / fmin) ** ((i + 1) / bands);
    const lo = Math.min(size / 2 - 1, Math.floor((f0 * size) / sampleRate));
    const hi = Math.min(size / 2, Math.max(lo + 1, Math.ceil((f1 * size) / sampleRate)));
    out.push({ lo, hi, centre: Math.sqrt(f0 * f1) });
  }
  return out;
}

/**
 * Analyse mono samples into frames*bands bytes (frame-major).
 *
 *   fps      frames per second of output
 *   bands    bars per frame
 *   size     FFT window, a power of two
 *   floorDb  level that maps to 0; 0 dB (a full-scale bin) maps to 255
 *   tilt     dB/octave added above fmin, because music falls off with frequency
 *            and flat bars would leave the right-hand half of the screen idle
 */
export function analyze(samples, sampleRate, opts = {}) {
  const { fps = 24, bands = 48, size = 2048, floorDb = -60, tilt = 3, fmin = 40, fmax = 10000 } = opts;
  const frames = Math.max(1, Math.round((samples.length / sampleRate) * fps));
  const bins = bandBins(bands, sampleRate, size, fmin, fmax);
  const hann = new Float64Array(size);
  for (let i = 0; i < size; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  const tiltDb = bins.map((b) => tilt * Math.log2(b.centre / fmin));

  const re = new Float64Array(size), im = new Float64Array(size);
  const out = new Uint8Array(frames * bands);
  for (let f = 0; f < frames; f++) {
    const start = Math.round((f / fps) * sampleRate) - size / 2;
    for (let i = 0; i < size; i++) {
      const at = start + i;
      re[i] = at >= 0 && at < samples.length ? samples[at] * hann[i] : 0;
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 0; b < bands; b++) {
      let peak = 0;
      for (let k = bins[b].lo; k < bins[b].hi; k++) {
        const mag = Math.hypot(re[k], im[k]) / (size / 4);   // a full-scale sine reads 1.0
        if (mag > peak) peak = mag;
      }
      const db = 20 * Math.log10(peak + 1e-9) + tiltDb[b];
      const level = Math.min(1, Math.max(0, (db - floorDb) / -floorDb));
      out[f * bands + b] = Math.round(level * 255);
    }
  }
  return { frames, bands, fps, data: out };
}

export function toBase64(bytes) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}
