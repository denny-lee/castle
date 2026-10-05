// Light, drawn as a composite over the finished picture.
//
// This deliberately does NOT touch the geometry. The view cache in cache.js
// blits a still world and only re-renders when the camera moves; a flickering
// light that modulated face shading would invalidate the cache on every single
// frame and throw away the entire frame budget. As a full-screen gradient
// instead, it costs one fill and stays live over a cached world.
//
// The flicker is summed sines rather than random, so it is smooth, has no
// sudden jumps, and is reproducible frame for frame given the same clock.

/** A warm radial falloff: bright where you are looking, dark at the edges. */
export function vignette(ctx, w, h, strength = 0.5, warmth = 0.5) {
  if (strength <= 0) return;
  const cx = w / 2;
  const cy = h * 0.46;
  const inner = Math.min(w, h) * 0.22;
  const outer = Math.hypot(w, h) * 0.62;

  const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.55, `rgba(70,52,30,${0.06 * strength * warmth})`);
  g.addColorStop(1, `rgba(28,22,14,${0.5 * strength})`);

  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * Flicker in [0,1], smooth and deterministic for a given time in seconds.
 * Three incommensurate sines give a wander that never settles into a beat.
 */
export function flicker(t, seed = 0) {
  const a = Math.sin(t * 2.1 + seed);
  const b = Math.sin(t * 5.3 + seed * 2.7);
  const c = Math.sin(t * 11.7 + seed * 1.3);
  return 0.5 + (a * 0.6 + b * 0.28 + c * 0.12) * 0.5;
}

/**
 * Torchlit interior: a vignette that breathes, plus a faint warm wash.
 * `t` is seconds since the scene opened.
 */
export function torchlight(ctx, w, h, t, strength = 1) {
  const f = flicker(t);
  vignette(ctx, w, h, (0.42 + f * 0.16) * strength, 0.9);

  ctx.save();
  ctx.globalAlpha = (0.05 + f * 0.035) * strength;
  ctx.fillStyle = '#c98a3c';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Outdoor daylight: a plain, still vignette with no warmth and no flicker. */
export function daylight(ctx, w, h, strength = 1) {
  vignette(ctx, w, h, 0.26 * strength, 0.15);
}
