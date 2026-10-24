// The club: a screen on the front wall showing a song's spectrum as rows of
// small bouncing bars, with the lyrics rolling up above them. Nothing is played;
// the bars and the lyrics are read from the database and stepped along a clock.

import { makeCamera, beginView, renderScene, project, DEG } from '../camera.js';
import { PAPER, paperGrain, label, sketchLine } from '../sketch.js';
import { EYE_Y, WALL_YAW, WALL_ORDER } from '../geom/room.js';
import { clubShell, screenPoint, fortunePoint } from '../geom/club.js';
import { makeViewCache, camKey } from '../cache.js';
import { torchlight } from '../light.js';

const LIGHT_ACCENT = '#d9a58f';   // the room accent, lifted so it reads on a dark screen
const LYRIC_LEAD_MS = 450;        // how long a line takes to roll into place
const BARS_TOP = 0.38;            // fraction of the glass height the bars may reach
const BARS_BOTTOM = 0.05;

const SQRT3 = Math.sqrt(3);

/** Text with every character in its own colour, walking round the rainbow. */
function rainbowText(ctx, text, x, y, size, t, opts = {}) {
  const chars = Array.from(text);
  ctx.save();
  ctx.font = `${opts.weight ?? ''} ${size}px Georgia, serif`.trim();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = opts.alpha ?? 1;
  const total = ctx.measureText(text).width;
  let prefix = '';
  for (let i = 0; i < chars.length; i++) {
    const cx = x - total / 2 + ctx.measureText(prefix).width;
    ctx.fillStyle = `hsl(${(i * 16 + t * 90) % 360} 90% 68%)`;
    ctx.fillText(chars[i], cx, y);
    prefix += chars[i];
  }
  ctx.restore();
}

/** A slowly turning hexagram inside runic rings, every stroke on its own hue. */
function drawStar(ctx, cx, cy, R, t) {
  const hue = (a) => `hsl(${((a / (Math.PI * 2)) * 360 + t * 40) % 360} 85% 66%)`;
  const spin = t * 0.12;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  // Two rings with a halo, and a ring of ticks turning the other way.
  for (const [k, rr, w, a] of [[0, 1.16, 1.2, 0.5], [1, 1.28, 2.4, 0.8], [2, 1.34, 0.9, 0.4]]) {
    ctx.strokeStyle = hue(k * 2 + 1);
    ctx.globalAlpha = a;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(cx, cy, R * rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 48; i++) {
    const a = -spin * 1.6 + (i / 48) * Math.PI * 2;
    const long = i % 4 === 0;
    ctx.strokeStyle = hue(a);
    ctx.globalAlpha = long ? 0.9 : 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 1.16, cy + Math.sin(a) * R * 1.16);
    ctx.lineTo(cx + Math.cos(a) * R * (long ? 1.25 : 1.21), cy + Math.sin(a) * R * (long ? 1.25 : 1.21));
    ctx.stroke();
  }

  // The hexagram: twelve vertices, tips on R, notches on R/sqrt(3).
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const a = spin - Math.PI / 2 + (i * Math.PI) / 6;
    const r = i % 2 === 0 ? R : R / SQRT3;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, a]);
  }
  // a soft fill, then the outline
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = hue(spin + 1);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  for (let i = 0; i < 12; i++) {
    const a = pts[i], b = pts[(i + 1) % 12];
    sketchLine(ctx, a[0], a[1], b[0], b[1], 6000 + i,
      { passes: 1, width: 3.2, alpha: 0.95, color: hue(a[2]), wobble: 0.4, overshoot: 0 });
  }
  // the two triangles, inside, drawn thin
  for (const off of [0, 1]) {
    for (let k = 0; k < 3; k++) {
      const a = pts[(off * 2 + k * 4) % 12], b = pts[(off * 2 + k * 4 + 4) % 12];
      sketchLine(ctx, a[0], a[1], b[0], b[1], 6100 + off * 10 + k,
        { passes: 1, width: 1, alpha: 0.4, color: hue(a[2] + 0.5), wobble: 0.3, overshoot: 0 });
    }
  }
  // the inner hexagon where the triangles cross
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const p = pts[i * 2 + 1];
    if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
  }
  ctx.closePath();
  ctx.strokeStyle = hue(spin * 3 + 2);
  ctx.globalAlpha = 0.8;
  ctx.stroke();

  // a bright heart that breathes
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
  ctx.globalAlpha = 0.35 + 0.35 * pulse;
  ctx.fillStyle = hue(t);
  ctx.beginPath();
  ctx.arc(cx, cy, R * (0.1 + 0.04 * pulse), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const smooth = (p) => p * p * (3 - 2 * p);
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

/** Where the lyrics sit, as a (fractional) line index, for a point in time. */
export function lyricPosition(lines, ms) {
  let idx = -1;
  for (let i = 0; i < lines.length && lines[i].t <= ms; i++) idx = i;
  const next = lines[idx + 1];
  if (!next) return idx;
  const p = Math.min(1, Math.max(0, (ms - (next.t - LYRIC_LEAD_MS)) / LYRIC_LEAD_MS));
  return idx + smooth(p);
}

export function makeClub(app, room, songs, hallIndex) {
  const cam = makeCamera({ x: 0, y: EYE_Y, z: 0, yaw: WALL_YAW.front, pitch: 0.12, fov: 72 * DEG });
  const world = clubShell();
  const cache = makeViewCache();

  let index = 0;
  let song = null;               // the loaded song, null while loading or when there are none
  let loading = false;
  let loadToken = 0;
  let ms = 0;                    // position in the song
  let paused = false;
  let clock = 0;                 // seconds in the room, for the torch flicker
  let wall = 'front';
  let targetYaw = WALL_YAW.front;
  let level = [];                // smoothed bar heights, 0..1
  let peak = [];                 // falling peak caps
  let hold = [];

  async function load(i) {
    const token = ++loadToken;
    song = null;
    ms = 0;
    if (!songs.length) return;
    loading = true;
    try {
      const full = await app.api.getSong(songs[i].id);
      if (token !== loadToken) return;          // another song was picked meanwhile
      song = full;
      level = new Array(full.bands).fill(0);
      peak = new Array(full.bands).fill(0);
      hold = new Array(full.bands).fill(0);
    } catch (err) {
      console.error('castle: could not load the song', err);
      app.say('could not load the song: ' + err.message);
    } finally {
      if (token === loadToken) loading = false;
    }
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

  function step(dir) {
    if (!songs.length) return;
    index = (index + dir + songs.length) % songs.length;
    load(index);
  }

  /** Target heights for the current time, blended between the two nearest frames. */
  function targets() {
    const { fps, bands, bars } = song;
    const frames = Math.floor(bars.length / bands);
    const pos = (ms / 1000) * fps;
    const f0 = Math.min(frames - 1, Math.max(0, Math.floor(pos)));
    const f1 = Math.min(frames - 1, f0 + 1);
    const k = Math.min(1, Math.max(0, pos - f0));
    const out = new Array(bands);
    for (let b = 0; b < bands; b++) {
      out[b] = (bars[f0 * bands + b] * (1 - k) + bars[f1 * bands + b] * k) / 255;
    }
    return out;
  }

  load(0);

  return {
    name: 'club',
    get hallIndex() { return hallIndex; },

    update(dt) {
      clock += dt;
      cam.yaw += (targetYaw - cam.yaw) * (1 - Math.exp(-dt * 8));
      if (song && !paused) {
        ms += dt * 1000;
        if (ms >= song.durationMs) { step(+1); return; }
      }
      if (song) {
        const t = targets();
        for (let b = 0; b < t.length; b++) {
          // Fast attack, slow release, like any analyser; the data is only 24fps.
          const rate = t[b] > level[b] ? 38 : 9;
          level[b] += (t[b] - level[b]) * (1 - Math.exp(-dt * rate));
          if (level[b] >= peak[b]) { peak[b] = level[b]; hold[b] = 0.35; }
          else if ((hold[b] -= dt) < 0) peak[b] = Math.max(level[b], peak[b] - dt * 0.5);
        }
      }
      const where = songs.length ? `${index + 1}/${songs.length}` : 'no songs';
      app.setStatus(`${where}   N / P  song   ← →  turn   SPACE ${paused ? 'play' : 'pause'}   ↑ ↓  leave the room`);
    },

    action(a) {
      if (a === 'left') turn(+1);
      else if (a === 'right') turn(-1);
      else if (a === 'no') step(+1);        // N: next song (elsewhere N means "no")
      else if (a === 'prev') step(-1);
      else if (a === 'open') paused = !paused;
      else if (a === 'up' || a === 'down' || a === 'back') app.go('hall', { hallIndex });
    },

    render(ctx, w, h) {
      cache.draw(ctx, w, h, camKey(cam, 'club'), (octx, ow, oh) => {
        octx.fillStyle = PAPER;
        octx.fillRect(0, 0, ow, oh);
        renderScene(octx, beginView(cam, ow, oh), world);
        paperGrain(octx, ow, oh);
      });

      torchlight(ctx, w, h, clock, 0.8);
      // The live screens are flat overlays, so only draw them once the view has
      // settled square on their wall.
      if (Math.abs(targetYaw - cam.yaw) < 0.04) {
        if (wall === 'front') drawScreen(ctx, beginView(cam, w, h));
        else if (wall === 'left') drawFortune(ctx, beginView(cam, w, h));
      }
      label(ctx, room.name, 24, 30, 22, { align: 'left', weight: 'bold', alpha: 0.6 });
    },
  };

  function drawFortune(ctx, v) {
    const tl = project(v, fortunePoint(0, 1)), br = project(v, fortunePoint(1, 0));
    if (!tl || !br) return;
    const wpx = Math.abs(br[0] - tl[0]), hpx = Math.abs(br[1] - tl[1]);
    drawStar(ctx, (tl[0] + br[0]) / 2, (tl[1] + br[1]) / 2, Math.min(wpx, hpx) * 0.33, clock);
  }

  function drawScreen(ctx, v) {
    const P = (u, vv) => project(v, screenPoint(u, vv));
    const tl = P(0, 1), br = P(1, 0);
    if (!tl || !br) return;
    const wpx = br[0] - tl[0], hpx = br[1] - tl[1];
    const at = (u, vv) => [tl[0] + u * wpx, br[1] - vv * hpx];
    const say = (text, u, vv, size, opts = {}) => {
      const [x, y] = at(u, vv);
      label(ctx, text, x, y, size, { color: PAPER, ...opts });
    };

    if (!song) {
      const msg = !songs.length ? 'NO SONGS YET' : (loading ? 'LOADING…' : 'COULD NOT LOAD THIS SONG');
      say(msg, 0.5, 0.58, hpx * 0.07, { weight: 'bold', alpha: 0.85 });
      if (!songs.length) say('add some with  node tools/add-song.mjs', 0.5, 0.46, hpx * 0.035, { alpha: 0.55 });
      return;
    }

    // ---- the bars: one thin pencil stroke each, with a falling cap ----
    const n = song.bands;
    const pitch = (wpx * 0.92) / n;
    const barW = Math.max(1.2, pitch * 0.6);
    const base = at(0, BARS_BOTTOM)[1];
    const span = hpx * (BARS_TOP - BARS_BOTTOM);
    for (let b = 0; b < n; b++) {
      const x = tl[0] + wpx * 0.04 + pitch * (b + 0.5);
      const top = base - Math.max(0.02, level[b]) * span;
      sketchLine(ctx, x, base, x, top, 4000 + b,
        { passes: 1, width: barW, alpha: 0.92, color: PAPER, wobble: 0.5, overshoot: 0 });
      const cap = base - peak[b] * span - barW;
      sketchLine(ctx, x - barW * 0.5, cap, x + barW * 0.5, cap, 4500 + b,
        { passes: 1, width: Math.max(1, barW * 0.35), alpha: 0.9, color: LIGHT_ACCENT, wobble: 0, overshoot: 0 });
    }

    // ---- the lyrics, rolling up ----
    const lines = song.lyrics;
    const pos = lyricPosition(lines, ms);
    const centre = 0.69, stepV = 0.095;
    for (let i = Math.floor(pos) - 3; i <= Math.ceil(pos) + 3; i++) {
      if (i < 0 || i >= lines.length) continue;
      const off = i - pos;
      const vv = centre - off * stepV;
      if (vv < 0.46 || vv > 0.9) continue;
      const near = Math.min(1, Math.abs(off));
      let size = hpx * (0.075 - 0.02 * near);
      size *= Math.min(1, (wpx * 0.9) / (lines[i].text.length * size * 0.52));   // keep long lines on the glass
      const edge = Math.min(1, (vv - 0.46) / 0.08, (0.9 - vv) / 0.08);
      const alpha = Math.max(0, (1 - 0.28 * Math.min(Math.abs(off), 3)) * edge);
      if (near < 0.5) {
        const [lx0, ly0] = at(0.5, vv);
        rainbowText(ctx, lines[i].text, lx0, ly0, size, clock, { weight: 'bold', alpha });
      } else {
        say(lines[i].text, 0.5, vv, size, { color: '#bdb6a6', alpha });
      }
    }

    // ---- title, clock and progress ----
    const credit = song.artist ? `${song.title} — ${song.artist}` : song.title;
    say(credit, 0.04, 0.955, hpx * 0.038, { align: 'left', weight: 'bold', alpha: 0.75 });
    say(`${mmss(ms)} / ${mmss(song.durationMs)}${paused ? '   PAUSED' : ''}`, 0.96, 0.955, hpx * 0.032,
      { align: 'right', alpha: 0.6 });
    const [lx, ly] = at(0.04, 0.425);
    const lw = wpx * 0.92;
    sketchLine(ctx, lx, ly, lx + lw, ly, 4900, { passes: 1, width: 1, alpha: 0.25, color: PAPER, wobble: 0.4, overshoot: 0 });
    const done = Math.min(1, ms / song.durationMs);
    if (done > 0.003) {
      sketchLine(ctx, lx, ly, lx + lw * done, ly, 4901,
        { passes: 1, width: 2, alpha: 0.85, color: LIGHT_ACCENT, wobble: 0.4, overshoot: 0 });
    }
  }
}
