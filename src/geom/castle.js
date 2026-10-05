// The castle exterior: four corner towers, curtain walls, a gatehouse on the
// near side and a donjon in the middle. Built from separated convex boxes and
// prisms so the painter's-algorithm sort never has to resolve interpenetration.

import { box, prism, cone, merlons } from '../camera.js';

const R = 20;          // half-width of the square curtain
const WALL_H = 7;
const WALL_T = 1.6;
const GATE_Z = -R - 1; // the gatehouse projects outward on the near side

export function castleGeometry() {
  const faces = [];
  const segs = [];

  // ---- curtain walls -----------------------------------------------------
  // Near wall is split to leave the gate passage open.
  faces.push(...box(-R, 0, -R - WALL_T / 2, -4, WALL_H, -R + WALL_T / 2, 1000, { shadeZ: 0.2 }));
  faces.push(...box(4, 0, -R - WALL_T / 2, R, WALL_H, -R + WALL_T / 2, 1100, { shadeZ: 0.2 }));
  faces.push(...box(-R, 0, R - WALL_T / 2, R, WALL_H, R + WALL_T / 2, 1200, { shadeZ: 0.2 }));
  faces.push(...box(-R - WALL_T / 2, 0, -R, -R + WALL_T / 2, WALL_H, R, 1300, { shadeX: 0.5 }));
  faces.push(...box(R - WALL_T / 2, 0, -R, R + WALL_T / 2, WALL_H, R, 1400, { shadeX: 0.5 }));

  faces.push(...merlons('x', -R, -5, -R, WALL_H, 0.9, WALL_T * 0.8, 2000, 1.4));
  faces.push(...merlons('x', 5, R, -R, WALL_H, 0.9, WALL_T * 0.8, 2300, 1.4));
  faces.push(...merlons('z', -R, R, -R, WALL_H, 0.9, WALL_T * 0.8, 2600, 1.4));
  faces.push(...merlons('z', -R, R, R, WALL_H, 0.9, WALL_T * 0.8, 2900, 1.4));

  // ---- corner towers -----------------------------------------------------
  const towers = [[-R, -R], [R, -R], [-R, R], [R, R]];
  towers.forEach(([tx, tz], i) => {
    const id = 3000 + i * 400;
    faces.push(...prism(tx, tz, 3.4, 0, 11.5, 8, id, { cap: false }));
    faces.push(...prism(tx, tz, 3.9, 11.5, 12.6, 8, id + 120));        // corbelled parapet
    faces.push(...cone(tx, tz, 3.9, 12.6, 17.5, 8, id + 240));
  });

  // ---- gatehouse ---------------------------------------------------------
  faces.push(...box(-4.6, 0, GATE_Z - 1.6, 4.6, 9.5, -R + 0.8, 5000, { shadeZ: 0.15 }));
  faces.push(...merlons('x', -4.6, 4.6, GATE_Z - 1.6, 9.5, 0.9, 1.4, 5200, 1.3));
  [-5.4, 5.4].forEach((gx, i) => {
    const id = 5400 + i * 300;
    faces.push(...prism(gx, GATE_Z - 0.6, 2.2, 0, 11, 8, id, { cap: false }));
    faces.push(...cone(gx, GATE_Z - 0.6, 2.5, 11, 15, 8, id + 150));
  });

  // The gate itself: a dark arch, nudged a hair proud of the gatehouse face so
  // the depth sort always puts it in front.
  const gz = GATE_Z - 1.68;
  faces.push({
    p: [[-2.2, 0, gz], [2.2, 0, gz], [2.2, 3.6, gz], [1.5, 4.6, gz], [-1.5, 4.6, gz], [-2.2, 3.6, gz]],
    id: 5900, fill: '#3a3630', shade: 0,
  });
  // portcullis grid
  for (let i = 1; i <= 4; i++) {
    const x = -2.2 + (4.4 * i) / 5;
    segs.push({ a: [x, 0, gz - 0.02], b: [x, 4.2, gz - 0.02], id: 5920 + i, opts: { alpha: 0.45, width: 1.1 } });
  }
  for (let i = 1; i <= 3; i++) {
    const y = (4.2 * i) / 4;
    segs.push({ a: [-2.2, y, gz - 0.02], b: [2.2, y, gz - 0.02], id: 5940 + i, opts: { alpha: 0.45, width: 1.1 } });
  }

  // ---- donjon ------------------------------------------------------------
  faces.push(...box(-5, 0, -5, 5, 17, 5, 6000, { shadeZ: 0.12, shadeX: 0.5 }));
  faces.push(...box(-5.8, 17, -5.8, 5.8, 18.4, 5.8, 6200, { shadeX: 0.45 }));
  faces.push(...merlons('x', -5.8, 5.8, -5.8, 18.4, 1.0, 1.2, 6300, 1.5));
  faces.push(...merlons('x', -5.8, 5.8, 5.8, 18.4, 1.0, 1.2, 6500, 1.5));
  faces.push(...merlons('z', -5.8, 5.8, -5.8, 18.4, 1.0, 1.2, 6700, 1.5));
  faces.push(...merlons('z', -5.8, 5.8, 5.8, 18.4, 1.0, 1.2, 6900, 1.5));
  faces.push(...cone(0, 0, 5.2, 18.4, 26, 4, 7100, { phase: Math.PI / 4 }));

  // donjon windows: thin dark slits, slightly proud of the near wall
  for (let r = 0; r < 3; r++) {
    for (let c = -1; c <= 1; c++) {
      const x0 = c * 2.4 - 0.35, y0 = 4 + r * 4;
      faces.push({
        p: [[x0, y0, -5.03], [x0 + 0.7, y0, -5.03], [x0 + 0.7, y0 + 1.6, -5.03], [x0, y0 + 1.6, -5.03]],
        id: 7300 + r * 10 + c, fill: '#4a453d', shade: 0,
      });
    }
  }

  return { faces, segs };
}

/** Ground: the approach path, a horizon, grass tufts and a few trees. */
export function approachGround() {
  const faces = [];
  const segs = [];
  const PATH_W = 2.6;
  const FAR = -115;
  const NEAR = GATE_Z - 1.8;

  segs.push({ a: [-400, 0, 90], b: [400, 0, 90], id: 100, opts: { alpha: 0.3, width: 1.2, passes: 1 } });

  segs.push({ a: [-PATH_W, 0.01, FAR], b: [-PATH_W, 0.01, NEAR], id: 110, opts: { alpha: 0.55 } });
  segs.push({ a: [PATH_W, 0.01, FAR], b: [PATH_W, 0.01, NEAR], id: 120, opts: { alpha: 0.55 } });
  for (let z = FAR; z < NEAR; z += 3.5) {
    segs.push({
      a: [-PATH_W, 0.01, z], b: [PATH_W, 0.01, z],
      id: 130 + Math.round(z * 7), opts: { alpha: 0.22, width: 0.8, passes: 1 },
    });
  }

  // grass tufts flanking the path - cheap texture, deterministic positions
  let gid = 20000;
  for (let z = FAR; z < NEAR; z += 2.2) {
    for (const side of [-1, 1]) {
      const n = Math.abs(Math.sin(z * 1.7 + side));
      const x = side * (PATH_W + 0.5 + n * 3.4);
      const h = 0.25 + n * 0.3;
      segs.push({ a: [x, 0, z], b: [x - 0.12, h, z], id: gid++, opts: { alpha: 0.35, width: 0.8, passes: 1 } });
      segs.push({ a: [x, 0, z], b: [x + 0.14, h * 0.8, z], id: gid++, opts: { alpha: 0.3, width: 0.8, passes: 1 } });
    }
  }

  // trees for scale
  const trees = [[-12, -70], [13, -58], [-16, -42], [17, -34], [-11, -96], [15, -88]];
  trees.forEach(([tx, tz], i) => {
    const id = 9000 + i * 200;
    const h = 5.5 + ((i * 7) % 3);
    faces.push(...box(tx - 0.22, 0, tz - 0.22, tx + 0.22, h * 0.35, tz + 0.22, id));
    faces.push(...cone(tx, tz, 1.9, h * 0.35, h, 7, id + 60, { shade: 0.35 }));
  });

  return { faces, segs };
}

export const CASTLE = { R, WALL_H, GATE_Z, ARRIVE_Z: GATE_Z - 3.2, START_Z: -112 };
