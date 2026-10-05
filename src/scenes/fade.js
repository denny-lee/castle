// The shared "view turns dark" transition between scenes.

export const FADE_OUT = 0.42;
export const FADE_IN = 0.42;

export function drawDark(ctx, w, h, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = '#17150f';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
