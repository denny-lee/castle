// Inside a room: three shelves on each of three walls, an exit door behind you,
// boxes on the shelves and the week's card inside each box.

import { makeCamera, beginView, renderScene, project, DEG } from '../camera.js';
import { PAPER, GRAPHITE, paperGrain, label, sketchPoly, sketchLine, fillPoly, hatch } from '../sketch.js';
import {
  roomShell, shelfGeometry, WALL_FRAME, WALL_YAW, WALL_ORDER, SHELF_X, EYE_Y, PRIORITY_NAME,
} from '../geom/room.js';
import { makeViewCache, camKey } from '../cache.js';
import { computeLedger, drawLedger, rowsPerPage } from './ledger.js';
import { overdueDaysFor } from '../pace.js';
import { torchlight } from '../light.js';
import { askItems, askText } from '../itemdialog.js';

const ACCENT = '#7a3b2e';

function buildGeometry(layout) {
  const shell = roomShell();
  // The shell is the backdrop: layer -1 keeps a wall from painting over a shelf.
  const faces = shell.faces.map((f) => ({ ...f, layer: -1 }));
  const segs = [...shell.segs];
  const texts = [...shell.texts];
  const shelves = new Map();

  for (const wall of ['front', 'left', 'right']) {
    const onWall = layout.filter((s) => s.wall === wall).sort((a, b) => a.number - b.number);
    onWall.forEach((shelf, i) => {
      const xoff = SHELF_X[i] ?? 0;
      const base = WALL_FRAME[wall];
      const place = (p) => base([p[0] + xoff, p[1], p[2]]);
      const g = shelfGeometry(shelf, place, 30000 + shelf.number * 2000);
      faces.push(...g.faces);
      segs.push(...g.segs);
      texts.push(...g.texts);
      shelves.set(shelf.number, { shelf, ...g });
    });
  }
  return { scene: { faces, segs, texts }, shelves };
}

export function makeRoom(app, room, layout, hallIndex) {
  const cam = makeCamera({ x: 0, y: EYE_Y, z: 0, fov: 72 * DEG });
  let built = buildGeometry(layout);
  let version = 0;                // bumped when the shelves are rebuilt
  const cache = makeViewCache();
  let wall = 'front';
  let targetYaw = WALL_YAW[wall];
  cam.yaw = targetYaw;

  let selShelf = null;            // shelf number, or null
  let cursor = { level: 0, slot: 0 };
  let card = null;                // the card currently taken out of its box
  let confirming = false;
  let taskSel = 0;                // the item selected on the card in hand
  let toss = null;                // {t, from, to}
  let flash = '';
  let flashT = 0;
  let sessionId = null;           // the open visit, while a card is out
  let ledger = null;              // the ledger page, while it is open
  let ledgerScroll = 0;
  let lastHeight = 900;           // for ledger paging; set on every render
  let clock = 0;                  // seconds in the room, for the torch flicker

  function say(msg) { flash = msg; flashT = 2.4; }

  function entry(num) { return built.shelves.get(num); }
  function cellAt(num, level, slot) {
    const e = entry(num);
    return e ? e.cells.get(`${level},${slot}`) : null;
  }

  function firstBoxCell(num) {
    const e = entry(num);
    if (!e) return { level: 0, slot: 0 };
    for (let lv = 0; lv < e.shelf.levels; lv++) {
      for (let sl = 0; sl < e.shelf.slots; sl++) {
        const c = e.cells.get(`${lv},${sl}`);
        if (c && c.box) return { level: lv, slot: sl };
      }
    }
    return { level: 0, slot: 0 };
  }

  function selectShelf(num) {
    const e = entry(num);
    if (!e) { say(`shelf ${num} is not in this room`); return; }
    selShelf = num;
    wall = e.shelf.wall;
    targetYaw = WALL_YAW[wall];
    cursor = firstBoxCell(num);
    card = null;
    confirming = false;
  }

  function turn(dir) {
    const i = WALL_ORDER.indexOf(wall);
    wall = WALL_ORDER[(i + dir + WALL_ORDER.length) % WALL_ORDER.length];
    // Take the short way round so the view never spins the long way.
    let want = WALL_YAW[wall];
    while (want - targetYaw > Math.PI) want -= Math.PI * 2;
    while (want - targetYaw < -Math.PI) want += Math.PI * 2;
    targetYaw = want;
  }

  /* A visit lasts as long as a card is out of its box. That is a proxy for
   * study time, not a measurement of it - see SPEC section 6.7. */
  async function endVisit() {
    if (sessionId === null) return;
    const id = sessionId;
    sessionId = null;
    try {
      await app.api.endSession(id);
    } catch (err) {
      console.error('castle: could not close the visit', err);
    }
  }

  async function openLedger(boxId) {
    try {
      const raw = await app.api.getLedger(boxId);
      ledger = computeLedger(raw);
      ledgerScroll = 0;
    } catch (err) {
      console.error(err);
      say('could not open the ledger: ' + err.message);
    }
  }

  async function openCard() {
    const c = cellAt(selShelf, cursor.level, cursor.slot);
    if (!c) return;
    if (c.bin) { say('the bin holds what you have finished'); return; }
    if (!c.box) { say('empty slot'); return; }
    const top = await app.api.getTopCard(c.box.id);
    if (!top) { say(`${c.box.label}: no cards left — the box is clear`); return; }
    card = top;
    taskSel = 0;
    try {
      const started = await app.api.startSession(c.box.id, top.id);
      sessionId = started.id;
    } catch (err) {
      // Not being able to record the visit must not stop you reading the card.
      console.error('castle: could not record the visit', err);
    }
  }

  // I with a shelf in hand: type the items of a new card for the box under the cursor.
  async function addItems() {
    const c = cellAt(selShelf, cursor.level, cursor.slot);
    if (!c || c.bin || !c.box) { say('pick a box first, then press I to add a card'); return; }
    const box = c.box;
    const text = await askItems(box.label);
    if (text === null) return;
    try {
      const added = await app.api.addCard(box.id, text);
      await refresh();
      say(`${box.label}: added week ${added.weekNo} with ${added.taskCount} item${added.taskCount === 1 ? '' : 's'}`);
    } catch (err) {
      say(err.message);
    }
  }

  // B with a shelf in hand: name a new box and it goes in the first free slot.
  async function addBox() {
    const e = entry(selShelf);
    const name = await askText(`New box on shelf ${selShelf}`);
    if (name === null) return;
    if (!name.trim()) { say('no name, no box'); return; }
    try {
      const added = await app.api.addBox(e.shelf.id, name);
      await refresh();
      cursor = { level: added.level, slot: added.slot };
      say(`${name.trim()}: new box on shelf ${selShelf}`);
    } catch (err) {
      say(err.message);
    }
  }

  // R with a shelf in hand: rename the box under the cursor.
  async function renameBox() {
    const c = cellAt(selShelf, cursor.level, cursor.slot);
    if (!c || c.bin || !c.box) { say('pick a box first, then press R to rename it'); return; }
    const name = await askText(`Rename “${c.box.label}”`, { initial: c.box.label, confirm: 'rename' });
    if (name === null) return;
    if (!name.trim()) { say('a box needs a name'); return; }
    try {
      const r = await app.api.renameBox(c.box.id, name);
      await refresh();
      say(`${c.box.label} is now ${r.label}`);
    } catch (err) {
      say(err.message);
    }
  }

  // U with a shelf in hand: step the box under the cursor to its next quadrant.
  async function cyclePriority() {
    const c = cellAt(selShelf, cursor.level, cursor.slot);
    if (!c || c.bin || !c.box) { say('pick a box first, then press U'); return; }
    const next = (c.box.priority || 4) % 4 + 1;
    try {
      await app.api.setPriority(c.box.id, next);
      await refresh();
      say(`${c.box.label}: ${PRIORITY_NAME[next]}`);
    } catch (err) {
      say(err.message);
    }
  }

  async function refresh() {
    const fresh = await app.api.getRoomLayout(room.id);
    built = buildGeometry(fresh);
    version++;
  }

  async function toggleSelected() {
    if (!card || !card.tasks.length) return;
    const task = card.tasks[taskSel];
    try {
      const r = await app.api.toggleTask(card.id, task.idx);
      task.done = r.done;
    } catch (err) {
      say(err.message);
    }
  }

  async function confirmDone() {
    const done = card;
    confirming = false;
    card = null;
    await endVisit();
    const e = entry(selShelf);
    const binCell = e && e.cells.get(`${e.shelf.levels - 1},${e.shelf.slots - 1}`);
    toss = { t: 0, to: binCell ? binCell.center : null };
    await app.api.markCardDone(done.id);
    await refresh();
    say(`${done.subject} — ${done.title} done`);
  }

  return {
    name: 'room',
    get hallIndex() { return hallIndex; },

    /** Whether I means "add items" here, rather than "import a database". */
    takesImport() { return selShelf !== null && !card && !ledger && !confirming; },

    update(dt) {
      clock += dt;
      const k = 1 - Math.exp(-dt * 8);
      cam.yaw += (targetYaw - cam.yaw) * k;
      if (toss) { toss.t += dt / 0.6; if (toss.t >= 1) toss = null; }
      if (flashT > 0) flashT -= dt;

      if (confirming) {
        app.setPrompt(`Completed “${card.subject} — ${card.title}”?    Y  yes    N  no`);
      } else {
        app.setPrompt(null);
      }

      let status;
      if (ledger) status = '↑ ↓  scroll     T / ESC  close the ledger';
      else if (card) status = '↑ ↓  select item     C  tick / untick     SPACE  put the card back     D  mark done     T  ledger';
      else if (selShelf !== null) status = `shelf ${selShelf}   ← → box   ↑ ↓ level   SPACE open   I add card   B new box   R rename   U priority   T ledger   ESC release`;
      else status = '1-9  take a shelf     ← →  turn     ↑ ↓  leave the room';
      app.setStatus(flashT > 0 ? `${flash}` : status);
    },

    action(a) {
      if (confirming) {
        if (a === 'yes') confirmDone();
        else if (a === 'no' || a === 'back') confirming = false;
        return;
      }
      if (ledger) {
        const perPage = rowsPerPage(lastHeight);
        const maxScroll = Math.max(0, ledger.weeks.length - perPage);
        if (a === 'timeline' || a === 'back') ledger = null;
        else if (a === 'down') ledgerScroll = Math.min(maxScroll, ledgerScroll + 1);
        else if (a === 'up') ledgerScroll = Math.max(0, ledgerScroll - 1);
        return;
      }

      if (a.startsWith('shelf')) { selectShelf(Number(a.slice(5))); return; }

      if (card) {
        if (a === 'open' || a === 'back') { card = null; endVisit(); }
        else if (a === 'done') confirming = true;
        else if (a === 'up') taskSel = Math.max(0, taskSel - 1);
        else if (a === 'down') taskSel = Math.min(card.tasks.length - 1, taskSel + 1);
        else if (a === 'check') toggleSelected();
        else if (a === 'timeline') openLedger(card.boxId);
        return;
      }

      if (a === 'timeline') {
        const c = selShelf !== null ? cellAt(selShelf, cursor.level, cursor.slot) : null;
        if (c && c.box) openLedger(c.box.id);
        else say('take a shelf and pick a box, then press T for its ledger');
        return;
      }

      if (selShelf === null) {
        if (a === 'left') turn(+1);
        else if (a === 'right') turn(-1);
        else if (a === 'up' || a === 'down') { endVisit(); app.go('hall', { hallIndex }); }
        return;
      }

      const e = entry(selShelf);
      if (a === 'left') cursor.slot = Math.max(0, cursor.slot - 1);
      else if (a === 'right') cursor.slot = Math.min(e.shelf.slots - 1, cursor.slot + 1);
      else if (a === 'up') cursor.level = Math.max(0, cursor.level - 1);
      else if (a === 'down') cursor.level = Math.min(e.shelf.levels - 1, cursor.level + 1);
      else if (a === 'open') openCard();
      else if (a === 'import') addItems();
      else if (a === 'newbox') addBox();
      else if (a === 'priority') cyclePriority();
      else if (a === 'rename') renameBox();
      else if (a === 'back') { selShelf = null; endVisit(); }
      else if (a === 'done') say('open the card first, then press D');
    },

    render(ctx, w, h) {
      lastHeight = h;
      // The shelves are motionless; only redraw them when the view or the
      // layout actually changes.
      cache.draw(ctx, w, h, camKey(cam, `r${room.id}v${version}`), (octx, ow, oh) => {
        octx.fillStyle = PAPER;
        octx.fillRect(0, 0, ow, oh);
        renderScene(octx, beginView(cam, ow, oh), built.scene);
        paperGrain(octx, ow, oh);
      });

      const v = beginView(cam, w, h);

      // Highlights: the chosen shelf, then the cursor box inside it.
      if (selShelf !== null) {
        const e = entry(selShelf);
        if (e) {
          const outline = e.outline.map((p) => project(v, p));
          if (outline.every(Boolean)) {
            sketchPoly(ctx, outline, 50000 + selShelf, { color: ACCENT, alpha: 0.35, width: 1.3, passes: 1 });
          }
          const c = e.cells.get(`${cursor.level},${cursor.slot}`);
          if (c && c.rect) {
            const r = c.rect.map((p) => project(v, p));
            if (r.every(Boolean)) {
              sketchPoly(ctx, r, 51000 + cursor.level * 10 + cursor.slot,
                { color: ACCENT, alpha: 0.9, width: 2.0, passes: 2 });
            }
          }
        }
      }

      if (toss) drawToss(ctx, v, w, h, toss);

      // Light goes on over the cached world, never into it - see light.js.
      // Overlays are drawn after, so paper in your hands stays crisp.
      torchlight(ctx, w, h, clock);

      label(ctx, room.name, 24, 30, 22, { align: 'left', weight: 'bold', alpha: 0.6 });

      // The ledger covers the card while it is open: two sheets of paper
      // fighting for the middle of the screen reads as a mess.
      if (ledger) drawLedger(ctx, w, h, ledger, ledgerScroll);
      else if (card) drawCard(ctx, w, h, card, taskSel);
    },

    /* Called by main.js when the scene is torn down, so a visit is not left
     * dangling just because you walked out of the room. */
    dispose() { endVisit(); },
  };
}

function drawToss(ctx, v, w, h, toss) {
  const to = toss.to ? project(v, toss.to) : [w * 0.8, h * 0.8];
  if (!to) return;
  const from = [w / 2, h * 0.5];
  const t = toss.t;
  const x = from[0] + (to[0] - from[0]) * t;
  const y = from[1] + (to[1] - from[1]) * t - Math.sin(Math.PI * t) * h * 0.14;
  const s = 1 - t * 0.78;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 2.4);
  ctx.globalAlpha = 1 - t * 0.5;
  const cw = 110 * s, ch = 150 * s;
  fillPoly(ctx, [[-cw / 2, -ch / 2], [cw / 2, -ch / 2], [cw / 2, ch / 2], [-cw / 2, ch / 2]], PAPER);
  sketchPoly(ctx, [[-cw / 2, -ch / 2], [cw / 2, -ch / 2], [cw / 2, ch / 2], [-cw / 2, ch / 2]], 777, { alpha: 0.7 });
  ctx.restore();
}

function drawCard(ctx, w, h, card, sel) {
  const overdue = overdueDaysFor(card);
  const cw = Math.min(520, w * 0.62);
  const ch = Math.min(620, h * 0.76);
  const cx = w / 2, cy = h / 2;

  ctx.save();
  // A soft shadow so the card reads as lifted off the shelf.
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = GRAPHITE;
  ctx.fillRect(cx - cw / 2 + 10, cy - ch / 2 + 14, cw, ch);
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.012);
  const corners = [[-cw / 2, -ch / 2], [cw / 2, -ch / 2], [cw / 2, ch / 2], [-cw / 2, ch / 2]];
  fillPoly(ctx, corners, '#faf7ee');
  hatch(ctx, corners, 9191, { angle: 1.3, spacing: 16, alpha: 0.05 });
  sketchPoly(ctx, corners, 8080, { alpha: 0.8, width: 1.3 });

  const left = -cw / 2 + 34;
  const right = cw / 2 - 34;
  let y = -ch / 2 + 48;

  label(ctx, card.subject, left, y, 25, { align: 'left', weight: 'bold' });
  y += 26;
  label(ctx, `${card.title}  ·  week ${card.weekNo}`, left, y, 15, { align: 'left', alpha: 0.6 });
  y += 22;
  sketchLine(ctx, left, y, right, y, 8100, { alpha: 0.6 });
  y += 34;

  card.tasks.forEach((task, i) => {
    const bx = left + 3, by = y - 7;
    sketchPoly(ctx, [[bx, by], [bx + 14, by], [bx + 14, by + 14], [bx, by + 14]], 8200 + i * 31,
      { alpha: 0.7, width: 1.1 });
    const rows = 1 + countWrapped(ctx, task.text, right - left - 28, 16);
    if (task.done) {
      sketchLine(ctx, bx + 2, by + 8, bx + 6, by + 12, 8600 + i * 31, { color: ACCENT, alpha: 0.9, width: 2 });
      sketchLine(ctx, bx + 6, by + 12, bx + 18, by - 5, 8700 + i * 31, { color: ACCENT, alpha: 0.9, width: 2 });
    }
    if (i === sel) {
      const top = y - 19, bot = y + 23 * (rows - 1) + 8;
      sketchPoly(ctx, [[left - 8, top], [right + 6, top], [right + 6, bot], [left - 8, bot]], 8800 + i * 31,
        { color: ACCENT, alpha: 0.6, width: 1.4, passes: 1 });
    }
    wrapText(ctx, task.text, left + 28, y, right - left - 28, 23, 16);
    y += 23 * rows + 10;
  });

  y = ch / 2 - 46;
  sketchLine(ctx, left, y - 16, right, y - 16, 8300, { alpha: 0.4 });
  label(ctx, `${card.remaining} card${card.remaining === 1 ? '' : 's'} left in this box`,
    left, y, 13, { align: 'left', alpha: 0.5 });
  label(ctx, '↑↓ select   C tick   D done', right, y, 13, { align: 'right', alpha: 0.5 });

  // An overdue stamp, angled across the corner like something pressed on later.
  if (overdue > 0) {
    ctx.save();
    ctx.translate(cw * 0.22, -ch * 0.3);
    ctx.rotate(-0.17);
    const sw = 168, sh = 42;
    const bounds = [[-sw / 2, -sh / 2], [sw / 2, -sh / 2], [sw / 2, sh / 2], [-sw / 2, sh / 2]];
    sketchPoly(ctx, bounds, 8400, { color: ACCENT, alpha: 0.75, width: 2, passes: 2 });
    label(ctx, `${overdue} DAY${overdue === 1 ? '' : 'S'} LATE`, 0, 0, 17,
      { color: ACCENT, alpha: 0.85, weight: 'bold' });
    ctx.restore();
  }
  ctx.restore();
}

function splitLines(ctx, text, maxWidth, size) {
  ctx.save();
  ctx.font = `${size}px Georgia, serif`;
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  ctx.restore();
  return lines;
}

function countWrapped(ctx, text, maxWidth, size) {
  return splitLines(ctx, text, maxWidth, size).length - 1;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, size) {
  splitLines(ctx, text, maxWidth, size).forEach((line, i) => {
    label(ctx, line, x, y + i * lineHeight, size, { align: 'left', alpha: 0.88 });
  });
}
