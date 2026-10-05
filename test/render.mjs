// Headless render harness: a recording 2D-context stub, so one frame of each
// scene can be driven in node and checked for errors, sane output, and that the
// still-view cache actually stops the redraw.
const SRC = new URL('../src', import.meta.url).href;
const W = 1600, H = 900;

let rec = null;            // the recorder the whole frame draws into
function newRec(tag) {
  rec = { strokes: 0, fills: 0, blits: 0, gradients: 0, texts: [], pts: [], bad: 0, tag, marks: [] };
  return rec;
}
function makeCtx() {
  // A real transform stack. Overlays (the card, the ledger) draw in a
  // translated and rotated frame, so without this every reported coordinate
  // would be relative to the page centre and the on-screen check would be
  // measuring nothing.
  let m = [1, 0, 0, 1, 0, 0];           // a b c d e f
  const stack = [];
  const mul = (n) => {
    m = [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4],
      m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  };
  const note = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) { rec.bad++; return; }
    rec.pts.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  };
  const ctx = {
    canvas: { width: W, height: H },
    globalAlpha: 1, lineWidth: 1, strokeStyle: '', fillStyle: '', font: '', lineCap: '',
    textAlign: '', textBaseline: '',
    save() { stack.push(m.slice()); },
    restore() { if (stack.length) m = stack.pop(); },
    translate(x, y) { mul([1, 0, 0, 1, x, y]); },
    rotate(a) { mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); },
    scale(x, y) { mul([x, 0, 0, y, 0, 0]); },
    setTransform(a, b, c, d, e, f) {
      m = [a ?? 1, b ?? 0, c ?? 0, d ?? 1, e ?? 0, f ?? 0];
    },
    clip() {}, beginPath() {}, closePath() {},
    moveTo(x, y) { note(x, y); }, lineTo(x, y) { note(x, y); },
    bezierCurveTo(a, b, c, d, e, f) { note(e, f); },
    quadraticCurveTo(a, b, c, d) { note(c, d); },
    stroke() { rec.strokes++; }, fill() { rec.fills++; },
    fillRect() { rec.fills++; }, clearRect() {},
    drawImage() { rec.blits++; },
    fillText(t, x, y) {
      // Store the DEVICE position: overlays draw in a translated frame, and a
      // layout check against raw local coordinates would be meaningless.
      rec.texts.push([t, Math.round(m[0] * x + m[2] * y + m[4]), Math.round(m[1] * x + m[3] * y + m[5])]);
      note(x, y);
    },
    measureText(t) { return { width: t.length * 7.5 }; },
    createPattern() { return {}; },
    createRadialGradient() { rec.gradients++; return { addColorStop() {} }; },
    createLinearGradient() { rec.gradients++; return { addColorStop() {} }; },
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() {},
    getContext() { return ctx; },
  };
  return ctx;
}
const shared = makeCtx();

globalThis.document = {
  getElementById: () => ({ remove() {}, textContent: '', style: {}, getContext: () => shared }),
  // Offscreen canvases (the view cache, the grain tile) record into the same
  // recorder, so cached work still shows up in the stroke counts.
  createElement: () => ({ width: 0, height: 0, getContext: () => shared }),
};
globalThis.window = { innerWidth: W, innerHeight: H, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };
globalThis.performance = { now: () => Date.now() };
globalThis.requestAnimationFrame = () => 0;

const { stub } = await import(`${SRC}/data/stub.js`);
const { makeApproach } = await import(`${SRC}/scenes/approach.js`);
const { makeHall } = await import(`${SRC}/scenes/hall.js`);
const { makeRoom } = await import(`${SRC}/scenes/room.js`);

await stub.init();
const rooms = await stub.listRooms();

let fail = 0;
const log = [];
const bad = (m) => { console.log('FAIL  ' + m); fail++; };

async function drive(name, scene, { frames = 3, actions = [], dt = 1 / 60, minStrokes = 50 } = {}) {
  newRec(name);
  const perFrame = [];
  try {
    for (const a of actions) {
      scene.action(a);
      // Scene actions that touch the data layer resolve on a microtask; the real
      // frame loop renders afterwards, so the harness must too.
      await new Promise((r) => setTimeout(r, 0));
    }
    for (let i = 0; i < frames; i++) {
      const before = rec.strokes;
      scene.update(dt);
      scene.render(shared, W, H);
      perFrame.push(rec.strokes - before);
    }
  } catch (e) {
    bad(`${name}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
    return null;
  }
  const onScreen = rec.pts.filter(([x, y]) => x > -200 && x < W + 200 && y > -200 && y < H + 200).length;
  const frac = rec.pts.length ? onScreen / rec.pts.length : 0;
  log.push(`${name.padEnd(26)} strokes/frame=[${perFrame.join(', ')}]`.padEnd(70)
    + ` texts=${String(rec.texts.length).padStart(3)} onscreen=${(frac * 100).toFixed(0)}% nonfinite=${rec.bad}`);
  if (rec.bad) bad(`${name}: ${rec.bad} non-finite coordinates`);
  // A cheap frame is fine when it blitted the cached world instead of redrawing.
  if (perFrame[0] < minStrokes && rec.blits === 0) {
    bad(`${name}: only ${perFrame[0]} strokes and no cache blit - scene looks empty`);
  }
  if (frac < 0.25) bad(`${name}: only ${(frac * 100).toFixed(0)}% of points land on screen`);
  rec.perFrame = perFrame;
  return rec;
}

const app = { api: stub, setStatus() {}, setPrompt() {}, go() {} };

const ap = makeApproach(app);
const a0 = await drive('approach/start', ap, { frames: 2 });
await drive('approach/arriving', ap, { frames: 2, dt: 5.4 });

const hall = makeHall(app, rooms, 0);
const h0 = await drive('hall/door-1', hall);
await drive('hall/door-3', hall, { actions: ['right', 'right'] });
if (h0 && !h0.texts.some((t) => t[0] === 'SKILL')) bad('hall: SKILL nameplate not drawn');
if (h0 && h0.perFrame[2] > h0.perFrame[0] * 0.08) {
  bad(`hall: still view is not cached (frame 3 still cost ${h0.perFrame[2]} strokes)`);
}

const layout = await stub.getRoomLayout(1);
const room = makeRoom(app, rooms[0], layout, 0);
const r0 = await drive('room/front-wall', room);
// Light must be a composite over the cached world, never baked into geometry -
// otherwise the flicker would invalidate the cache on every frame.
if (r0 && r0.gradients < 3) bad(`room: expected a lighting pass per frame, saw ${r0.gradients} gradients`);
if (r0 && r0.perFrame[2] > r0.perFrame[0] * 0.08) {
  bad(`room: still view is not cached (frame 3 still cost ${r0.perFrame[2]} strokes)`);
}
if (r0 && r0.perFrame[0] > 9000) {
  bad(`room: a full redraw costs ${r0.perFrame[0]} strokes - too many for a turn at 60fps`);
}
await drive('room/turned-left', room, { actions: ['left'] });
await drive('room/turned-back', room, { actions: ['left'] });
await drive('room/shelf-2', room, { actions: ['shelf2'] });
await drive('room/shelf-5-other-wall', room, { actions: ['shelf5'] });
const rc = await drive('room/card-open', room, { actions: ['shelf2', 'open'] });
if (rc && !rc.texts.some((t) => /Cyrillic/.test(t[0]))) bad('room: card task text not drawn');
if (rc && !rc.texts.some((t) => t[0] === 'Russian')) bad('room: card subject not drawn');
await drive('room/confirm-prompt', room, { actions: ['done'] });
await drive('room/after-done', room, { actions: ['yes'], frames: 6, dt: 0.12 });
await new Promise((r) => setTimeout(r, 40));
await drive('room/post-refresh', room, { frames: 3 });
const rc2 = await drive('room/next-card', room, { actions: ['open'] });
if (rc2 && !rc2.texts.some((t) => /Л-Я/.test(t[0]))) bad('room: week 2 card did not surface');
await drive('room/bin-cell', room, { actions: ['shelf2', 'down', 'down', 'down', 'right', 'right', 'open'] });

// ---- the ledger page -------------------------------------------------------
const lg = await drive('room/ledger', room, { actions: ['shelf2', 'timeline'] });
if (lg && !lg.texts.some((t) => t[0] === 'LEDGER')) bad('room: the ledger page did not draw');
if (lg && !lg.texts.some((t) => t[0] === 'Russian')) bad('room: the ledger did not name its subject');
await drive('room/ledger-closed', room, { actions: ['timeline'] });

// Drive the drawing directly with a long, drifting ledger: the live data has
// too few weeks to exercise scrolling or the drift bars.
const { computeLedger, drawLedger, rowsPerPage } = await import(`${SRC}/scenes/ledger.js`);
const day = 86400000;
const t0 = Date.parse('2026-01-05T09:00:00.000Z');
const long = computeLedger({
  subject: 'Calculus', boxId: 1, firstDoneAt: new Date(t0).toISOString(), firstWeekNo: 1,
  visits: 17, unfinishedVisits: 1, seconds: 9 * 3600 + 1500,
  weeks: Array.from({ length: 20 }, (_, i) => ({
    cardId: i + 1, seq: i, weekNo: i + 1, title: `Week ${i + 1}`,
    // Alternating early and late, drifting further out as the weeks go on.
    doneAt: i < 13 ? new Date(t0 + i * 7 * day + (i % 2 ? 1 : -1) * i * day).toISOString() : null,
    taskCount: 3,
  })),
});
for (const [name, scroll] of [['ledger/top', 0], ['ledger/scrolled', 8], ['ledger/past-end', 99]]) {
  newRec(name);
  try {
    drawLedger(shared, W, H, long, scroll);
  } catch (e) {
    bad(`${name}: ${e.stack.split('\n').slice(0, 2).join(' | ')}`);
    continue;
  }
  const onScreen = rec.pts.filter(([x, y]) => x > -200 && x < W + 200 && y > -200 && y < H + 200).length;
  const frac = rec.pts.length ? onScreen / rec.pts.length : 0;
  log.push(`${name.padEnd(26)} strokes/frame=[${rec.strokes}]`.padEnd(70)
    + ` texts=${String(rec.texts.length).padStart(3)} onscreen=${(frac * 100).toFixed(0)}% nonfinite=${rec.bad}`);
  if (rec.bad) bad(`${name}: ${rec.bad} non-finite coordinates`);
  const strayText = rec.texts.filter(([, x, y]) => x < 0 || x > W || y < 0 || y > H);
  if (strayText.length) {
    bad(`${name}: ${strayText.length} labels fall outside the window, e.g. ${JSON.stringify(strayText[0])}`);
  }
  if (!rec.texts.some((t) => /late|early|on time/.test(t[0]))) bad(`${name}: no drift column drawn`);
  const perPage = rowsPerPage(H);
  const maxScroll = Math.max(0, long.weeks.length - perPage);
  const expectFirst = Math.min(scroll, maxScroll) + 1;   // weekNo is 1-based
  const weekNumbers = rec.texts.map((t) => t[0]).filter((t) => /^\d+$/.test(t)).map(Number);
  if (weekNumbers.length !== perPage) {
    bad(`${name}: drew ${weekNumbers.length} week rows, expected ${perPage}`);
  }
  if (weekNumbers[0] !== expectFirst) {
    bad(`${name}: first row should be week ${expectFirst}, got ${weekNumbers[0]}`);
  }
  if (scroll > maxScroll && weekNumbers[weekNumbers.length - 1] !== long.weeks.length) {
    bad(`${name}: scrolling past the end should pin to the last week, got ${weekNumbers[weekNumbers.length - 1]}`);
  }
}

// ---- the key sheet ---------------------------------------------------------
const { drawHelp } = await import(`${SRC}/help.js`);
for (const [name, ww, hh] of [
  ['help/1600x900', 1600, 900],
  ['help/small', 900, 520],
  ['help/short', 1000, 420],      // a degenerate window, but it must still fit
]) {
  newRec(name);
  try {
    drawHelp(shared, ww, hh);
  } catch (e) {
    bad(`${name}: ${e.stack.split('\n').slice(0, 2).join(' | ')}`);
    continue;
  }
  const texts = rec.texts.map((t) => t[0]);
  // Every row must fit the sheet at any sane window size - that is the whole
  // point of scaling the step to the height available. Measured on text, since
  // hatching is meant to run past the page edge and be clipped.
  const pageTop = hh / 2 - Math.min(700, hh * 0.9) / 2;
  const pageBottom = hh - pageTop;
  const stray = rec.texts.filter(([, x, y]) => x < 0 || x > ww || y < pageTop - 2 || y > pageBottom + 2);
  log.push(`${name.padEnd(26)} strokes/frame=[${rec.strokes}]`.padEnd(70)
    + ` texts=${String(rec.texts.length).padStart(3)} stray=${stray.length} nonfinite=${rec.bad}`);
  if (rec.bad) bad(`${name}: ${rec.bad} non-finite coordinates`);
  if (stray.length) {
    bad(`${name}: ${stray.length} rows fall off the sheet, e.g. ${JSON.stringify(stray[0])}`);
  }
  for (const needed of ['CASTLE', 'THE HALL', 'A CARD IN HAND', 'ANYWHERE', '1 – 9', 'T', 'E', 'I']) {
    if (!texts.includes(needed)) bad(`${name}: the key sheet is missing "${needed}"`);
  }
}

console.log(log.join('\n'));
if (a0) console.log(`\napproach redraw cost: ${a0.perFrame[0]} strokes/frame (it moves every frame, so it is never cached)`);
console.log(fail ? `\n${fail} FAILURES` : '\nall render checks passed');
process.exit(fail ? 1 : 0);
