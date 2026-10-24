// The club: the ordinary room shell with a screen on the front wall instead of
// shelves, speaker stacks either side of it and a chequered dance floor.
//
// Everything here is static and ends up in the cached world. What the screen
// SHOWS (the bars, the lyrics) is live and drawn by scenes/club.js on top, using
// `screenPoint` to find where a spot on the glass lands in the room.

import { box } from '../camera.js';
import { roomShell, WALL_FRAME, ROOM_H } from './room.js';

/** The glass, in front-wall local coordinates (x right, y up, z out of the wall). */
export const SCREEN = { x0: -5.8, x1: 5.8, y0: 2.0, y1: 7.4, z: -0.43 };

/** World position of a spot on the glass: u 0..1 left to right, v 0..1 bottom to top. */
export function screenPoint(u, v) {
  return WALL_FRAME.front([
    SCREEN.x0 + u * (SCREEN.x1 - SCREEN.x0),
    SCREEN.y0 + v * (SCREEN.y1 - SCREEN.y0),
    SCREEN.z,
  ]);
}

/** The fortune screen on the left wall, same local frame as the front one. */
export const FORTUNE = { x0: -3.4, x1: 3.4, y0: 1.8, y1: 7.6, z: -0.43 };

export function fortunePoint(u, v) {
  return WALL_FRAME.left([
    FORTUNE.x0 + u * (FORTUNE.x1 - FORTUNE.x0),
    FORTUNE.y0 + v * (FORTUNE.y1 - FORTUNE.y0),
    FORTUNE.z,
  ]);
}

export const SCREEN_FILL = '#2b2b2b';

export function clubShell(id = 20000) {
  const shell = roomShell();
  const faces = [...shell.faces];
  const segs = [...shell.segs];
  const texts = [...shell.texts];
  const place = WALL_FRAME.front;
  const mapFaces = (fs) => fs.map((f) => ({ ...f, p: f.p.map(place) }));

  // Frame, then the glass itself a hair proud of it. The glass winding is the
  // reverse of box()'s -z face so that its normal points at the viewer.
  const { x0, x1, y0, y1, z } = SCREEN;
  faces.push(...mapFaces(box(x0 - 0.55, y0 - 0.55, -0.4, x1 + 0.55, y1 + 0.55, 0, id, { shade: 0.1, shadeZ: 0.05 })));
  faces.push(...mapFaces([{
    p: [[x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z]],
    id: id + 50, fill: SCREEN_FILL, shade: 0, lineOpts: { alpha: 0.9, width: 1.3 },
  }]));
  texts.push({ pos: place([0, y1 + 0.95, -0.45]), text: 'CLUB', size: 0.62, opts: { weight: 'bold', alpha: 0.7 } });

  // The fortune screen: a frame and dark glass on the left wall. What it shows
  // (the six-pointed star) is live, drawn by scenes/club.js.
  {
    const lp = WALL_FRAME.left;
    const f = FORTUNE;
    faces.push(...box(f.x0 - 0.5, f.y0 - 0.5, -0.4, f.x1 + 0.5, f.y1 + 0.5, 0, id + 800, { shade: 0.1, shadeZ: 0.05 })
      .map((q) => ({ ...q, p: q.p.map(lp) })));
    faces.push({
      p: [[f.x1, f.y0, f.z], [f.x0, f.y0, f.z], [f.x0, f.y1, f.z], [f.x1, f.y1, f.z]].map(lp),
      id: id + 850, fill: SCREEN_FILL, shade: 0, lineOpts: { alpha: 0.9, width: 1.3 },
    });
    texts.push({ pos: lp([0, f.y1 + 0.95, -0.45]), text: 'FORTUNE', size: 0.5, opts: { weight: 'bold', alpha: 0.7 } });
  }

  // Speaker stacks either side, each with a cone drawn on the cabinet.
  for (const [k, cx] of [[0, -7.15], [1, 7.15]]) {
    faces.push(...mapFaces(box(cx - 0.5, 0, -1.0, cx + 0.5, 3.4, -0.1, id + 100 + k * 40, { shadeX: 0.4, shadeZ: 0.15 })));
    for (const [j, cy, r] of [[0, 2.3, 0.28], [1, 1.1, 0.4]]) {
      const ring = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        ring.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, -1.02]);
      }
      for (let i = 0; i < 10; i++) {
        segs.push({
          a: place(ring[i]), b: place(ring[(i + 1) % 10]),
          id: id + 200 + k * 50 + j * 12 + i, opts: { alpha: 0.55, passes: 1 },
        });
      }
    }
  }

  // Chequered floor: alternate squares are hatched, the rest left as paper.
  let n = 0;
  for (let ix = -2; ix < 2; ix++) {
    for (let iz = -2; iz < 2; iz++) {
      if ((ix + iz) & 1) continue;
      faces.push(...box(ix * 2, 0, iz * 2, ix * 2 + 2, 0.02, iz * 2 + 2, id + 400 + n++ * 7, { shadeTop: 0.35 }));
    }
  }

  // A truss across the ceiling with a few hanging lamps.
  const truss = ROOM_H - 0.7;
  segs.push({ a: [-6, truss, 3], b: [6, truss, 3], id: id + 700, opts: { alpha: 0.6, width: 1.4 } });
  segs.push({ a: [-6, truss - 0.35, 3], b: [6, truss - 0.35, 3], id: id + 701, opts: { alpha: 0.5 } });
  for (let i = 0; i < 6; i++) {
    const x = -5 + i * 2;
    segs.push({ a: [x, truss, 3], b: [x, truss - 0.35, 3], id: id + 710 + i, opts: { alpha: 0.4, passes: 1 } });
    faces.push(...box(x - 0.18, truss - 0.75, 2.82, x + 0.18, truss - 0.35, 3.18, id + 730 + i * 7, { shadeX: 0.3 }));
  }

  return { faces, segs, texts };
}
