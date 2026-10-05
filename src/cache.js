// A still sketch costs thousands of pencil strokes to draw, but the view is
// motionless most of the time: you stand in a room and look at a shelf. So the
// world is rendered into an offscreen canvas and simply blitted until something
// actually changes. Only the brief turns between walls pay full price.

export function makeViewCache() {
  let canvas = null;
  let octx = null;
  let key = null;
  let cw = 0, ch = 0;

  return {
    /**
     * Blit the cached world render, re-rendering first if `signature` changed.
     * `render(octx, w, h)` must draw the whole world, opaquely.
     */
    draw(ctx, w, h, signature, render) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.round(w * dpr), ph = Math.round(h * dpr);

      if (!canvas) {
        canvas = document.createElement('canvas');
        octx = canvas.getContext('2d');
      }
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
        cw = w; ch = h;
        key = null;
      }
      if (key !== signature) {
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        render(octx, cw, ch);
        key = signature;
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(canvas, 0, 0);
      ctx.restore();
    },

    invalidate() { key = null; },
  };
}

/**
 * A coarse signature for a camera pose. Quantised so that the tail of an easing
 * animation, where motion is sub-pixel, settles onto one cached frame instead of
 * re-rendering forever.
 */
export function camKey(cam, extra = '') {
  const q = (n, step) => Math.round(n / step);
  return `${q(cam.x, 0.01)},${q(cam.y, 0.01)},${q(cam.z, 0.01)},`
    + `${q(cam.yaw, 0.0025)},${q(cam.pitch, 0.0025)},${q(cam.fov, 0.001)}|${extra}`;
}
