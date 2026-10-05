// Bootstrap: canvas, the frame loop, and the scene stack with its dark
// transitions between places.

import api, { backendName } from './data/api.js';
import { installInput } from './input.js';
import { exportBoth, importFile } from './transfer.js';
import { PAPER, label, sketchLine } from './sketch.js';
import { drawDark, FADE_OUT, FADE_IN } from './scenes/fade.js';
import { makeApproach } from './scenes/approach.js';
import { makeHall } from './scenes/hall.js';
import { makeRoom } from './scenes/room.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

let W = 0, H = 0;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

let rooms = [];
let hallIndex = 0;

let scene = null;
let phase = 'in';        // 'in' | 'hold' | 'out' | 'loading'
let phaseT = 0;
let pending = null;
let status = '';
let prompt = null;
let flash = '';
let flashUntil = 0;

function say(msg) {
  flash = msg;
  flashUntil = performance.now() + 4000;
}

const app = {
  api,
  say,
  setStatus(s) { status = s || ''; },
  setPrompt(p) { prompt = p || null; },
  go(name, params = {}) {
    if (pending) return;
    pending = { name, params };
    phase = 'out';
    phaseT = 0;
  },
};

async function construct(name, params) {
  if (name === 'approach') return makeApproach(app);
  if (name === 'hall') {
    if (params.hallIndex !== undefined) hallIndex = params.hallIndex;
    return makeHall(app, rooms, hallIndex);
  }
  if (name === 'room') {
    hallIndex = params.hallIndex ?? hallIndex;
    const layout = await api.getRoomLayout(params.room.id);
    return makeRoom(app, params.room, layout, hallIndex);
  }
  throw new Error('unknown scene: ' + name);
}

// Export and import belong to the application, not to any one place in the
// castle, so they are handled before the action reaches a scene.
let transferBusy = false;

async function handleTransfer(action) {
  if (transferBusy) return;
  transferBusy = true;
  try {
    if (action === 'export') {
      say('exporting…');
      say(await exportBoth(api));
    } else {
      const result = await importFile(api);
      if (!result) { say('import cancelled'); return; }
      // The whole database was replaced: reload everything and start over in
      // the hall rather than leaving stale ids on screen.
      rooms = await api.listRooms();
      hallIndex = 0;
      say(result);
      app.go('hall', { hallIndex: 0 });
    }
  } catch (err) {
    console.error(err);
    say((action === 'export' ? 'export failed: ' : 'import failed: ') + err.message);
  } finally {
    transferBusy = false;
  }
}

installInput((action) => {
  if (action === 'export' || action === 'import') { handleTransfer(action); return; }
  if (phase !== 'out' && phase !== 'loading' && scene) scene.action(action);
});

function drawHud(w, h) {
  // A storage failure must never pass silently: it means this session will not
  // survive a reload.
  const warning = api.storageWarning;
  if (warning) {
    label(ctx, warning, w / 2, 14, 13, { color: '#7a3b2e', alpha: 0.9 });
  }

  const now = performance.now();
  if (flash && now < flashUntil) {
    label(ctx, flash, w / 2, h - 44, 15, { alpha: 0.85 });
  }

  if (status) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    label(ctx, status, w / 2, h - 24, 14, { alpha: 0.55 });
    ctx.restore();
  }
  if (prompt) {
    const pw = Math.min(w - 48, 720);
    const px = (w - pw) / 2;
    ctx.save();
    ctx.fillStyle = '#f7f3e7';
    ctx.globalAlpha = 0.96;
    ctx.fillRect(px, 18, pw, 54);
    ctx.globalAlpha = 1;
    sketchLine(ctx, px, 72, px + pw, 72, 60606, { alpha: 0.6 });
    sketchLine(ctx, px, 18, px + pw, 18, 60607, { alpha: 0.6 });
    label(ctx, prompt, w / 2, 45, 16, { alpha: 0.9 });
    ctx.restore();
  }
}

// Best effort on the way out: the browser may not give the snapshot write time
// to finish, which is why the backend also treats a visit with no end time as a
// visit of unknown length rather than losing it.
window.addEventListener('pagehide', () => scene?.dispose?.());

let last = performance.now();
let booted = false;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (phase === 'out') {
    phaseT += dt;
    if (phaseT >= FADE_OUT) {
      const next = pending;
      pending = null;
      phase = 'loading';
      // Let the outgoing scene close anything it opened - an unfinished visit,
      // say - before it is dropped.
      scene?.dispose?.();
      construct(next.name, next.params).then((s) => {
        scene = s;
        phase = 'in';
        phaseT = 0;
      }).catch((err) => {
        console.error(err);
        status = 'something went wrong: ' + err.message;
        phase = 'hold';
      });
    }
  } else if (phase === 'in') {
    phaseT += dt;
    if (phaseT >= FADE_IN) phase = 'hold';
  }

  if (scene && phase !== 'out' && phase !== 'loading') scene.update(dt);

  if (phase === 'loading') {
    ctx.fillStyle = '#17150f';
    ctx.fillRect(0, 0, W, H);
  } else if (scene) {
    scene.render(ctx, W, H);
    drawHud(W, H);
    if (phase === 'out') drawDark(ctx, W, H, phaseT / FADE_OUT);
    if (phase === 'in') drawDark(ctx, W, H, 1 - phaseT / FADE_IN);
  } else {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
  }

  if (!booted) {
    booted = true;
    const boot = document.getElementById('boot');
    if (boot) boot.remove();
  }

  requestAnimationFrame(frame);
}

(async function start() {
  await api.init();
  rooms = await api.listRooms();
  console.log(`castle: backend = ${backendName}, ${rooms.length} rooms`);
  scene = await construct('approach', {});
  phase = 'in';
  phaseT = 0;
  requestAnimationFrame(frame);
})().catch((err) => {
  console.error(err);
  document.getElementById('boot').textContent = 'failed to start: ' + err.message;
});
