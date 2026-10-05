// Pencil-sketch drawing primitives on a 2D canvas.
//
// The single most important property here is that the jitter is DETERMINISTIC,
// derived from a stable per-edge seed rather than Math.random(). A line drawn
// across many frames must wobble the same way every frame, otherwise the whole
// picture boils with noise whenever the camera sits still.

export const PAPER = '#f4f1e8';
export const GRAPHITE = '#2b2b2b';
export const GRAPHITE_SOFT = '#6b6459';

/** 32-bit integer avalanche hash. */
export function hash32(n) {
  n |= 0;
  n = (n ^ 61) ^ (n >>> 16);
  n = (n + (n << 3)) | 0;
  n ^= n >>> 4;
  n = Math.imul(n, 0x27d4eb2d);
  n ^= n >>> 15;
  return n >>> 0;
}

/** Deterministic xorshift PRNG seeded from an integer. */
export function rngFrom(seed) {
  let s = hash32(seed) || 0x9e3779b9;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

/** Hash a string into a seed, for ids that are easier to write as text. */
export function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * One sketched straight line: a few overlapping curved passes with a slight
 * perpendicular wobble and a small overshoot at each end.
 */
export function sketchLine(ctx, x1, y1, x2, y2, seed, opts = {}) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (!(len > 0.0001) || !Number.isFinite(len)) return;

  const passes = opts.passes ?? 2;
  const width = opts.width ?? 1.1;
  const alpha = opts.alpha ?? 0.85;
  const color = opts.color ?? GRAPHITE;
  // Wobble grows with length but saturates, so long edges do not go wild.
  const wobble = opts.wobble ?? Math.min(len * 0.035, 3.2);
  const overshoot = opts.overshoot ?? Math.min(len * 0.02, 2.6);

  const ux = dx / len, uy = dy / len;      // along the line
  const px = -uy, py = ux;                  // perpendicular
  const rnd = rngFrom(seed);

  ctx.strokeStyle = color;
  ctx.lineCap = 'round';

  for (let i = 0; i < passes; i++) {
    const o1 = (rnd() - 0.5) * overshoot * 2;
    const o2 = (rnd() - 0.5) * overshoot * 2;
    const ax = x1 - ux * o1, ay = y1 - uy * o1;
    const bx = x2 + ux * o2, by = y2 + uy * o2;

    // Two control points give an S-curve, which reads much more like a
    // hand-drawn stroke than a single-bend quadratic.
    const w1 = (rnd() - 0.5) * 2 * wobble;
    const w2 = (rnd() - 0.5) * 2 * wobble;
    const c1x = ax + dx * 0.33 + px * w1, c1y = ay + dy * 0.33 + py * w1;
    const c2x = ax + dx * 0.66 + px * w2, c2y = ay + dy * 0.66 + py * w2;

    ctx.globalAlpha = alpha * (0.6 + 0.4 * rnd());
    ctx.lineWidth = width * (0.75 + 0.5 * rnd());
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, bx, by);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Sketch the outline of a screen-space polygon. */
export function sketchPoly(ctx, pts, seed, opts = {}) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    sketchLine(ctx, a[0], a[1], b[0], b[1], seed + i * 2654435761, opts);
  }
}

/** Fill a screen-space polygon (used for hidden-line removal). */
export function fillPoly(ctx, pts, color) {
  if (pts.length < 3) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fill();
}

/** Parallel hatching clipped to a polygon, for shading a face. */
export function hatch(ctx, pts, seed, opts = {}) {
  if (pts.length < 3) return;
  const angle = opts.angle ?? -0.9;
  let spacing = opts.spacing ?? 7;
  const alpha = opts.alpha ?? 0.22;
  const maxLines = opts.maxLines ?? 48;
  if (spacing < 2) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const w = maxX - minX, h = maxY - minY;
  if (!(w > 0) || !(h > 0) || w > 8000 || h > 8000) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.clip();

  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const reach = Math.hypot(w, h) * 0.6;
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const px = -uy, py = ux;
  // A face covering half the screen must not cost hundreds of strokes: widen
  // the spacing rather than letting the line count grow with the face.
  spacing = Math.max(spacing, (reach * 2) / maxLines);
  const count = Math.ceil(reach / spacing);
  const rnd = rngFrom(seed ^ 0x5bf03635);

  for (let i = -count; i <= count; i++) {
    const off = i * spacing + (rnd() - 0.5) * spacing * 0.3;
    const mx = cx + px * off, my = cy + py * off;
    sketchLine(ctx, mx - ux * reach, my - uy * reach, mx + ux * reach, my + uy * reach,
      seed + i * 7919, { passes: 1, width: 0.8, alpha, wobble: 1.4, overshoot: 0 });
  }
  ctx.restore();
}

/** Faint paper grain, drawn once into an offscreen tile and then tiled. */
let grainPattern = null;
export function paperGrain(ctx, w, h) {
  if (!grainPattern) {
    const size = 128;
    const off = document.createElement('canvas');
    off.width = off.height = size;
    const octx = off.getContext('2d');
    const img = octx.createImageData(size, size);
    const rnd = rngFrom(0x1234abcd);
    for (let i = 0; i < size * size; i++) {
      const v = rnd();
      img.data[i * 4 + 0] = 60;
      img.data[i * 4 + 1] = 55;
      img.data[i * 4 + 2] = 45;
      img.data[i * 4 + 3] = v < 0.06 ? 14 : 0;
    }
    octx.putImageData(img, 0, 0);
    grainPattern = ctx.createPattern(off, 'repeat');
  }
  ctx.save();
  ctx.fillStyle = grainPattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** A sketched rounded-ish rectangle in screen space. */
export function sketchRect(ctx, x, y, w, h, seed, opts = {}) {
  sketchPoly(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], seed, opts);
}

/** Centred text in the sketch palette. */
export function label(ctx, text, x, y, size, opts = {}) {
  ctx.save();
  ctx.fillStyle = opts.color ?? GRAPHITE;
  ctx.globalAlpha = opts.alpha ?? 0.9;
  ctx.font = `${opts.weight ?? ''} ${size}px ${opts.font ?? 'Georgia, serif'}`.trim();
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = opts.baseline ?? 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}
