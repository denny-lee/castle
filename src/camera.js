// Fake-3D: a real perspective projection of flat-shaded quad geometry.
//
// There is no z-buffer. Occlusion comes from the painter's algorithm: faces are
// sorted back-to-front, and each one is FILLED with the paper colour before its
// edges are stroked. Nearer faces therefore paint over the edges of farther
// ones, which is hidden-line removal for free.

import { PAPER, fillPoly, sketchPoly, hatch, label } from './sketch.js';

export const DEG = Math.PI / 180;

export function makeCamera(init = {}) {
  return { x: 0, y: 1.7, z: 0, yaw: 0, pitch: 0, fov: 60 * DEG, near: 0.15, ...init };
}

/** Precompute the per-frame view constants. */
export function beginView(cam, w, h) {
  return {
    cam, w, h,
    f: (h * 0.5) / Math.tan(cam.fov * 0.5),
    cx: w * 0.5, cy: h * 0.5,
    cyaw: Math.cos(cam.yaw), syaw: Math.sin(cam.yaw),
    cpit: Math.cos(cam.pitch), spit: Math.sin(cam.pitch),
  };
}

/**
 * World -> camera space. At yaw 0 the camera looks down +z, so
 * forward = (sin yaw, 0, cos yaw) and right = (cos yaw, 0, -sin yaw).
 */
export function toCam(v, p) {
  const dx = p[0] - v.cam.x, dy = p[1] - v.cam.y, dz = p[2] - v.cam.z;
  const xc = dx * v.cyaw - dz * v.syaw;
  const zf = dx * v.syaw + dz * v.cyaw;
  return [xc, dy * v.cpit - zf * v.spit, dy * v.spit + zf * v.cpit];
}

export function projectCam(v, c) {
  const s = v.f / c[2];
  return [v.cx + c[0] * s, v.cy - c[1] * s];
}

/** Project a world point, or null if it is behind the near plane. */
export function project(v, p) {
  const c = toCam(v, p);
  return c[2] > v.cam.near ? projectCam(v, c) : null;
}

/** Clip a camera-space polygon against the near plane (Sutherland-Hodgman). */
function clipNear(pts, near) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const ain = a[2] >= near, bin = b[2] >= near;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (near - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near]);
    }
  }
  return out;
}

function faceNormal(p) {
  const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
  const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}

/**
 * Draw a scene.
 *
 *   faces: {p:[[x,y,z]x3+], id, cull:'back'|'none', fill, shade, lineOpts, layer}
 *          Winding must put the normal on the side the viewer should see from.
 *   segs:  {a, b, id, opts}  - bare lines (ground, paths, hatching guides)
 *   texts: {pos, text, size, opts} - world-anchored labels, drawn last
 *
 * Segments are drawn before faces so that solid geometry paints over the
 * ground lines running underneath it.
 */
export function renderScene(ctx, v, { faces = [], segs = [], texts = [] } = {}) {
  for (const s of segs) {
    const ca = toCam(v, s.a), cb = toCam(v, s.b);
    const clipped = clipSegNear(ca, cb, v.cam.near);
    if (!clipped) continue;
    const pa = projectCam(v, clipped[0]), pb = projectCam(v, clipped[1]);
    if (!onScreenish(v, pa, pb)) continue;
    sketchSeg(ctx, pa, pb, s.id, s.opts);
  }

  const ready = [];
  for (const f of faces) {
    if ((f.cull ?? 'back') !== 'none') {
      const n = faceNormal(f.p);
      const c0 = f.p[0];
      const vx = v.cam.x - c0[0], vy = v.cam.y - c0[1], vz = v.cam.z - c0[2];
      if (n[0] * vx + n[1] * vy + n[2] * vz <= 0) continue;
    }
    const camPts = f.p.map((p) => toCam(v, p));
    const clipped = clipNear(camPts, v.cam.near);
    if (clipped.length < 3) continue;
    let depth = 0;
    for (const c of clipped) depth += c[2];
    ready.push({ f, scr: clipped.map((c) => projectCam(v, c)), depth: depth / clipped.length });
  }
  // Far to near, except that a lower `layer` always goes first: a big wall's centre
  // is nearer than a shelf standing against it, so depth alone paints it over the shelf.
  ready.sort((a, b) => ((a.f.layer ?? 0) - (b.f.layer ?? 0)) || (b.depth - a.depth));

  for (const r of ready) {
    if (!polyOnScreen(v, r.scr)) continue;
    const f = r.f;
    if (f.fill !== null) fillPoly(ctx, r.scr, f.fill ?? PAPER);

    // Level of detail by projected size. A room full of shelves is thousands of
    // faces, and the small ones cannot show hatching or a second pencil pass
    // anyway - spending strokes on them only costs frame time.
    const area = polyArea(r.scr);
    if (f.shade && area > 2200) {
      hatch(ctx, r.scr, f.id ^ 0x2f1b3c, {
        angle: f.shadeAngle ?? -0.85,
        spacing: Math.max(4.5, 11 - f.shade * 7),
        alpha: 0.1 + f.shade * 0.16,
      });
    }
    const lod = area < 700
      ? { passes: 1, width: 0.85, alpha: 0.6, wobble: 0.6, overshoot: 0 }
      : (area < 4200 ? { passes: 1 } : null);
    sketchPoly(ctx, r.scr, f.id, lod ? { ...lod, ...f.lineOpts } : f.lineOpts);
  }

  for (const t of texts) {
    const c = toCam(v, t.pos);
    if (c[2] <= v.cam.near * 2) continue;
    const size = (t.size * v.f) / c[2];
    if (size < 4.5 || size > 400) continue;
    const p = projectCam(v, c);
    if (p[0] < -200 || p[0] > v.w + 200 || p[1] < -100 || p[1] > v.h + 100) continue;
    label(ctx, t.text, p[0], p[1], size, { alpha: 0.85, ...(t.opts || {}) });
  }
}

function clipSegNear(a, b, near) {
  const ain = a[2] >= near, bin = b[2] >= near;
  if (ain && bin) return [a, b];
  if (!ain && !bin) return null;
  const t = (near - a[2]) / (b[2] - a[2]);
  const mid = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near];
  return ain ? [a, mid] : [mid, b];
}

function onScreenish(v, a, b) {
  const m = 400;
  if (a[0] < -m && b[0] < -m) return false;
  if (a[0] > v.w + m && b[0] > v.w + m) return false;
  if (a[1] < -m && b[1] < -m) return false;
  if (a[1] > v.h + m && b[1] > v.h + m) return false;
  return true;
}

/** Absolute area of a screen-space polygon (shoelace). */
function polyArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) * 0.5;
}

function polyOnScreen(v, pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return maxX > -40 && minX < v.w + 40 && maxY > -40 && minY < v.h + 40;
}

function sketchSeg(ctx, a, b, id, opts) {
  sketchPoly(ctx, [a, b], id, { passes: 1, alpha: 0.5, width: 0.9, ...(opts || {}) });
}

// ---------------------------------------------------------------------------
// Geometry helpers. All builders take an `id` used to seed the sketch jitter,
// so the same solid wobbles identically every frame.
// ---------------------------------------------------------------------------

/** Axis-aligned box, six faces with outward-pointing normals. */
export function box(x0, y0, z0, x1, y1, z1, id, opts = {}) {
  const f = (p, k, shade) => ({ p, id: id + k, shade: shade ?? opts.shade ?? 0, ...opts.face });
  return [
    f([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 1, opts.shadeZ),
    f([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 2, opts.shadeZ),
    f([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 3, opts.shadeX ?? 0.45),
    f([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 4, opts.shadeX ?? 0.45),
    f([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], 5, opts.shadeTop ?? 0),
    f([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], 6, opts.shadeTop ?? 0.3),
  ];
}

/** Regular prism (tower bodies), `sides` faces plus a cap. */
export function prism(cx, cz, r, y0, y1, sides, id, opts = {}) {
  const faces = [];
  const a0 = opts.phase ?? Math.PI / sides;
  const pt = (i, y) => {
    const a = a0 + (i / sides) * Math.PI * 2;
    return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
  };
  for (let i = 0; i < sides; i++) {
    const p0 = pt(i, y0), p1 = pt(i + 1, y0);
    faces.push({
      p: [p0, p1, [p1[0], y1, p1[2]], [p0[0], y1, p0[2]]],
      id: id + i * 13,
      shade: opts.shade ?? (0.15 + 0.4 * Math.abs(Math.sin(a0 + (i / sides) * Math.PI * 2))),
    });
  }
  if (opts.cap !== false) {
    const top = [];
    for (let i = 0; i < sides; i++) top.push(pt(i, y1));
    faces.push({ p: top, id: id + 997, shade: 0 });
  }
  return faces;
}

/** Cone / pyramid roof sitting on a regular polygon. */
export function cone(cx, cz, r, y0, apexY, sides, id, opts = {}) {
  const faces = [];
  const a0 = opts.phase ?? Math.PI / sides;
  const pt = (i) => {
    const a = a0 + (i / sides) * Math.PI * 2;
    return [cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r];
  };
  for (let i = 0; i < sides; i++) {
    faces.push({
      p: [pt(i), pt(i + 1), [cx, apexY, cz]],
      id: id + i * 37,
      shade: opts.shade ?? (0.1 + 0.4 * Math.abs(Math.sin(a0 + (i / sides) * Math.PI * 2))),
    });
  }
  return faces;
}

/** Crenellation teeth along a wall top, running in x or z. */
export function merlons(axis, from, to, fixed, yTop, h, thick, id, step = 1.5) {
  const faces = [];
  let k = 0;
  for (let t = from; t + step * 0.6 < to; t += step * 2) {
    const a = t, b = Math.min(t + step, to);
    if (axis === 'x') {
      faces.push(...box(a, yTop, fixed - thick / 2, b, yTop + h, fixed + thick / 2, id + k * 101));
    } else {
      faces.push(...box(fixed - thick / 2, yTop, a, fixed + thick / 2, yTop + h, b, id + k * 101));
    }
    k++;
  }
  return faces;
}

/** Rotate local coords about Y by `yaw`, then translate. Returns a mapper. */
export function placer(ox, oy, oz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (p) => [ox + p[0] * c + p[2] * s, oy + p[1], oz - p[0] * s + p[2] * c];
}

/** Apply a placer to every vertex of a face list (or point list). */
export function placeFaces(faces, place) {
  return faces.map((f) => ({ ...f, p: f.p.map(place) }));
}
export function placeSegs(segs, place) {
  return segs.map((s) => ({ ...s, a: place(s.a), b: place(s.b) }));
}
export function placeTexts(texts, place) {
  return texts.map((t) => ({ ...t, pos: place(t.pos) }));
}
