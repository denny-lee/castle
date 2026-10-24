// Interior geometry: the entrance hall (a ring of category doors), a room
// shell, and the shelves with their boxes.
//
// Every wall gets a local frame (right, up, into) where `into` points INTO the
// wall and equals right x up. That keeps the basis right-handed, so geometry
// built with outward normals stays outward after placement. Shelves therefore
// occupy local z in [-depth, 0], growing out of the wall toward the viewer.

import { box, prism } from '../camera.js';
import { overdueDaysFor } from '../pace.js';

const ACCENT = '#7a3b2e';

export const HALL_R = 11;
export const HALL_H = 7.5;
export const DOOR_SPREAD = 40 * Math.PI / 180;

export const ROOM_HALF = 8;
export const ROOM_H = 9;
export const EYE_Y = 1.72;

export const SHELF_W = 4.2;
export const SHELF_H = 6.2;
export const SHELF_D = 1.2;
export const SHELF_T = 0.12;

/** Reverse winding, turning outward-facing faces into inward-facing ones. */
export function flipFaces(faces) {
  return faces.map((f) => ({ ...f, p: f.p.slice().reverse() }));
}

function frame(origin, right, up) {
  const into = [
    right[1] * up[2] - right[2] * up[1],
    right[2] * up[0] - right[0] * up[2],
    right[0] * up[1] - right[1] * up[0],
  ];
  return (p) => [
    origin[0] + right[0] * p[0] + up[0] * p[1] + into[0] * p[2],
    origin[1] + right[1] * p[0] + up[1] * p[1] + into[1] * p[2],
    origin[2] + right[2] * p[0] + up[2] * p[1] + into[2] * p[2],
  ];
}

/** Local frames for the four walls of a room, keyed by wall name. */
export const WALL_FRAME = {
  front: frame([0, 0, ROOM_HALF], [1, 0, 0], [0, 1, 0]),
  left:  frame([-ROOM_HALF, 0, 0], [0, 0, 1], [0, 1, 0]),
  right: frame([ROOM_HALF, 0, 0], [0, 0, -1], [0, 1, 0]),
  back:  frame([0, 0, -ROOM_HALF], [-1, 0, 0], [0, 1, 0]),
};

/** Camera yaw that squares the view up with each wall. */
export const WALL_YAW = { front: 0, left: -Math.PI / 2, back: Math.PI, right: Math.PI / 2 };
export const WALL_ORDER = ['front', 'left', 'back', 'right'];

function mapAll(faces, place) {
  return faces.map((f) => ({ ...f, p: f.p.map(place) }));
}

// ---------------------------------------------------------------------------
// A door, in local wall coordinates: visible face at z = 0, recess at +z.
// ---------------------------------------------------------------------------

function doorLocal(id, { w = 1.35, h = 4.3, plate = null, plateText = '' } = {}) {
  const faces = [];
  const segs = [];
  const texts = [];
  const jamb = 0.3;
  const top = h + 0.5;

  faces.push(...box(-w - jamb, 0, -0.18, -w, top, 0.5, id + 10, { shadeX: 0.4 }));
  faces.push(...box(w, 0, -0.18, w + jamb, top, 0.5, id + 40, { shadeX: 0.4 }));
  faces.push(...box(-w - jamb, h + 0.2, -0.18, w + jamb, top, 0.5, id + 70, { shadeTop: 0.2 }));

  // The leaf itself: an arched panel, recessed a little into the opening.
  const dz = 0.14;
  faces.push({
    p: [[-w, 0, dz], [w, 0, dz], [w, h * 0.78, dz], [w * 0.62, h, dz], [-w * 0.62, h, dz], [-w, h * 0.78, dz]],
    id: id + 100, fill: '#e3ddcd', shade: 0.35, shadeAngle: 1.2,
  });
  for (let i = 1; i <= 4; i++) {
    const x = -w + (2 * w * i) / 5;
    segs.push({ a: [x, 0.1, dz - 0.01], b: [x, h * 0.8, dz - 0.01], id: id + 120 + i, opts: { alpha: 0.4 } });
  }
  segs.push({ a: [-w, h * 0.42, dz - 0.01], b: [w, h * 0.42, dz - 0.01], id: id + 140, opts: { alpha: 0.4 } });
  // ring handle
  segs.push({ a: [w * 0.55, h * 0.45, dz - 0.03], b: [w * 0.55, h * 0.52, dz - 0.03], id: id + 150, opts: { alpha: 0.6 } });

  if (plate) {
    faces.push(...box(-plate, top + 0.08, -0.12, plate, top + 1.0, 0.3, id + 200, { shadeZ: 0.1 }));
    texts.push({ pos: [0, top + 0.54, -0.14], text: plateText, size: 0.4, opts: { weight: 'bold' } });
  }
  return { faces, segs, texts };
}

/** The entrance hall: a polygonal wall ring with the category doors set into it. */
export function hallGeometry(rooms) {
  const faces = [];
  const segs = [];
  const texts = [];
  const sides = 18;

  faces.push(...flipFaces(prism(0, 0, HALL_R, 0, HALL_H, sides, 400, { cap: false, shade: 0.18 })));

  // floor flagstones and ceiling ribs
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * HALL_R, z = Math.sin(a) * HALL_R;
    segs.push({ a: [0, 0, 0], b: [x, 0, z], id: 600 + i, opts: { alpha: 0.18, width: 0.8, passes: 1 } });
    segs.push({ a: [x, HALL_H, z], b: [0, HALL_H + 2.6, 0], id: 700 + i, opts: { alpha: 0.3, passes: 1 } });
  }
  for (let r = 2.5; r < HALL_R; r += 2.5) {
    const ring = [];
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      ring.push([Math.cos(a) * r, 0, Math.sin(a) * r]);
    }
    for (let i = 0; i < sides; i++) {
      segs.push({ a: ring[i], b: ring[i + 1], id: 800 + r * 20 + i, opts: { alpha: 0.15, width: 0.8, passes: 1 } });
    }
  }

  // doors, spread around the front arc so arrow left/right swings between them
  const doors = rooms.map((room, i) => {
    const theta = (i - (rooms.length - 1) / 2) * DOOR_SPREAD;
    const place = frame(
      [Math.sin(theta) * HALL_R, 0, Math.cos(theta) * HALL_R],
      [Math.cos(theta), 0, -Math.sin(theta)],
      [0, 1, 0],
    );
    const d = doorLocal(1000 + i * 400, { plate: 2.0, plateText: room.code });
    faces.push(...mapAll(d.faces, place));
    segs.push(...d.segs.map((s) => ({ ...s, a: place(s.a), b: place(s.b) })));
    texts.push(...d.texts.map((t) => ({ ...t, pos: place(t.pos) })));
    return { room, theta };
  });

  return { faces, segs, texts, doors };
}

/** Floor, ceiling and four walls of a room, plus the exit door on the back wall. */
export function roomShell(id = 200) {
  const H = ROOM_HALF;
  const faces = flipFaces(box(-H, 0, -H, H, ROOM_H, H, id, { shade: 0 }));
  const segs = [];
  const texts = [];

  for (let i = -H + 2; i < H; i += 2) {
    segs.push({ a: [i, 0.01, -H], b: [i, 0.01, H], id: id + 500 + i, opts: { alpha: 0.15, width: 0.8, passes: 1 } });
    segs.push({ a: [-H, 0.01, i], b: [H, 0.01, i], id: id + 600 + i, opts: { alpha: 0.15, width: 0.8, passes: 1 } });
  }

  const d = doorLocal(id + 900, { w: 1.4, h: 4.5 });
  const place = WALL_FRAME.back;
  faces.push(...mapAll(d.faces, place));
  segs.push(...d.segs.map((s) => ({ ...s, a: place(s.a), b: place(s.b) })));
  texts.push({ pos: place([0, 5.4, -0.1]), text: 'OUT', size: 0.34, opts: { alpha: 0.55 } });

  return { faces, segs, texts };
}

/** Where the three shelves sit along a wall, left to right from the viewer. */
export const SHELF_X = [-4.55, 0, 4.55];

/**
 * One shelf (bookcase) with its boxes.
 * Returns geometry plus a `cells` map keyed "level,slot" holding the world-space
 * front rectangle of each box, which the room scene uses to draw highlights.
 */
/** Box tab colours by quadrant: 1 important+urgent, 2 important, 3 urgent, 4 neither. */
export const PRIORITY_COLOR = { 1: '#c0392b', 2: '#e0952b', 3: '#3b7bbf', 4: '#a7a79a' };
export const PRIORITY_NAME = {
  1: 'important and urgent', 2: 'important, not urgent',
  3: 'urgent, not important', 4: 'not important, not urgent',
};

export function shelfGeometry(shelf, place, id) {
  const faces = [];
  const segs = [];
  const texts = [];
  const cells = new Map();

  const W = SHELF_W, H = SHELF_H, D = SHELF_D, t = SHELF_T;
  const base = 0.32;
  const levels = shelf.levels, slots = shelf.slots;
  const band = (H - base) / levels;
  const inner = W - 2 * t;
  const pitch = inner / slots;

  // carcass
  faces.push(...box(-W / 2, 0, -D, -W / 2 + t, H, 0, id + 1, { shadeX: 0.4 }));
  faces.push(...box(W / 2 - t, 0, -D, W / 2, H, 0, id + 2, { shadeX: 0.4 }));
  faces.push(...box(-W / 2, 0, -0.06, W / 2, H, 0, id + 3, { shadeZ: 0.3 }));   // back panel
  faces.push(...box(-W / 2, H - t, -D, W / 2, H, 0, id + 4, { shadeTop: 0.1 })); // top
  faces.push(...box(-W / 2, 0, -D, W / 2, base, 0, id + 5, { shadeTop: 0.2 }));  // plinth

  const byCell = new Map();
  for (const b of shelf.boxes) byCell.set(`${b.level},${b.slot}`, b);

  for (let lv = 0; lv < levels; lv++) {
    const yb = base + (levels - 1 - lv) * band;   // level 0 is the top plank
    faces.push(...box(-W / 2 + t, yb, -D, W / 2 - t, yb + t, 0, id + 100 + lv * 7, { shadeTop: 0.15 }));

    for (let sl = 0; sl < slots; sl++) {
      const cx = -inner / 2 + pitch * (sl + 0.5);
      const isBin = lv === levels - 1 && sl === slots - 1;
      const bx = byCell.get(`${lv},${sl}`);
      const cellId = id + 1000 + lv * 97 + sl * 13;

      if (isBin) {
        // The bin is oversized and stands proud of the carcass.
        const bw = pitch * 0.95, bh = band * 0.92, bd = D * 1.15;
        const y0 = yb + t;
        faces.push(...box(cx - bw / 2, y0, -bd, cx + bw / 2, y0 + bh, -0.1, cellId, { shadeZ: 0.2, shadeX: 0.5 }));
        texts.push({ pos: [cx, y0 + bh * 0.5, -bd - 0.02], text: 'TRASH', size: 0.17, opts: { alpha: 0.6 } });

        // Finished cards pile up visibly: slips poking out of the top, fanned a
        // little, so a well-worked shelf looks worked.
        const binned = shelf.boxes.reduce((n, bx2) => n + (bx2.doneCount || 0), 0);
        const slips = Math.min(binned, 9);
        for (let k = 0; k < slips; k++) {
          const lean = ((k % 3) - 1) * 0.055;
          const sy = y0 + bh - 0.03 + k * 0.022;
          const sx = cx + lean * 0.6;
          segs.push({
            a: [sx - bw * 0.3, sy, -bd + 0.06],
            b: [sx + bw * 0.3, sy + lean, -bd + 0.06],
            id: cellId + 300 + k,
            opts: { alpha: 0.55, width: 1.1, passes: 1 },
          });
        }
        if (binned > 0) {
          texts.push({
            pos: [cx, y0 + bh * 0.22, -bd - 0.02],
            text: String(binned), size: 0.15, opts: { alpha: 0.6, weight: 'bold' },
          });
        }
        cells.set(`${lv},${sl}`, {
          bin: true, box: null,
          rect: [[cx - bw / 2, y0, -bd], [cx + bw / 2, y0, -bd], [cx + bw / 2, y0 + bh, -bd], [cx - bw / 2, y0 + bh, -bd]].map(place),
          center: place([cx, y0 + bh * 0.5, -bd]),
        });
        continue;
      }

      if (!bx) {
        cells.set(`${lv},${sl}`, { bin: false, box: null, rect: null, center: null });
        continue;
      }

      const bw = pitch * 0.84, bh = band * 0.62, bd = D * 0.8;
      const y0 = yb + t;
      const zf = -(0.08 + bd);
      const overdue = overdueDaysFor(bx);
      faces.push(...box(cx - bw / 2, y0, zf, cx + bw / 2, y0 + bh, -0.08, cellId, { shadeZ: 0.12, shadeX: 0.45 }));
      // label plate on the box front
      faces.push({
        p: [[cx - bw * 0.42, y0 + bh * 0.22, zf - 0.015], [cx + bw * 0.42, y0 + bh * 0.22, zf - 0.015],
            [cx + bw * 0.42, y0 + bh * 0.68, zf - 0.015], [cx - bw * 0.42, y0 + bh * 0.68, zf - 0.015]],
        id: cellId + 5, fill: '#efe9da', shade: 0,
      });
      texts.push({
        pos: [cx, y0 + bh * 0.45, zf - 0.03], text: bx.label, size: 0.12,
        opts: { weight: 'bold', color: overdue ? ACCENT : undefined },
      });
      if (bx.remaining > 0) {
        texts.push({
          pos: [cx, y0 + bh * 0.82, zf - 0.03],
          text: '‖'.repeat(Math.min(bx.remaining, 6)), size: 0.14,
          opts: { alpha: 0.5, color: overdue ? ACCENT : undefined },
        });
      }
      // Importance/urgency: a coloured tab in the top right corner of the box.
      const tab = Math.min(bw, bh) * 0.2;
      faces.push({
        // Wound the same way as the box's front face, or back-face culling drops it.
        p: [[cx + bw / 2 - tab * 0.2, y0 + bh - tab * 1.2, zf - 0.02], [cx + bw / 2 - tab * 1.2, y0 + bh - tab * 1.2, zf - 0.02],
            [cx + bw / 2 - tab * 1.2, y0 + bh - tab * 0.2, zf - 0.02], [cx + bw / 2 - tab * 0.2, y0 + bh - tab * 0.2, zf - 0.02]],
        id: cellId + 9, fill: PRIORITY_COLOR[bx.priority] || PRIORITY_COLOR[4], shade: 0,
      });
      if (overdue > 0) {
        // A folded corner on the label plate: visible across the room, and it
        // does not need the text to be legible to read as "this one is late".
        const px = cx + bw * 0.42, py = y0 + bh * 0.68, fold = Math.min(bw, bh) * 0.16;
        segs.push({
          a: [px - fold, py, zf - 0.02], b: [px, py - fold, zf - 0.02],
          id: cellId + 7, opts: { color: ACCENT, alpha: 0.9, width: 1.6 },
        });
        segs.push({
          a: [px - fold, py, zf - 0.02], b: [px, py, zf - 0.02],
          id: cellId + 8, opts: { color: ACCENT, alpha: 0.6, width: 1.2, passes: 1 },
        });
      }

      cells.set(`${lv},${sl}`, {
        bin: false, box: bx,
        rect: [[cx - bw / 2, y0, zf], [cx + bw / 2, y0, zf], [cx + bw / 2, y0 + bh, zf], [cx - bw / 2, y0 + bh, zf]].map(place),
        center: place([cx, y0 + bh * 0.5, zf]),
      });
    }
  }

  // A soft contact shadow on the floor. Hatching only - no fill - so it darkens
  // the floor without hiding the grid under it.
  const sd = D + 0.5;
  faces.push({
    p: [[-W / 2, 0.012, 0], [W / 2, 0.012, 0], [W / 2, 0.012, -sd], [-W / 2, 0.012, -sd]],
    id: id + 40, fill: null, shade: 0.5, shadeAngle: 0.35,
  });

  // shelf number plate on the top rail
  faces.push(...box(-0.45, H, -D * 0.6, 0.45, H + 0.52, -D * 0.6 + 0.08, id + 60, { shadeZ: 0.1 }));
  texts.push({ pos: [0, H + 0.26, -D * 0.6 - 0.02], text: String(shelf.number), size: 0.3, opts: { weight: 'bold' } });

  return {
    faces: mapAll(faces, place),
    segs: segs.map((s) => ({ ...s, a: place(s.a), b: place(s.b) })),
    texts: texts.map((t) => ({ ...t, pos: place(t.pos) })),
    cells,
    outline: [[-W / 2, 0, -D], [W / 2, 0, -D], [W / 2, H, -D], [-W / 2, H, -D]].map(place),
  };
}
