// The shelf report: a plain text sheet listing the items of each box's top
// card, one per line, as "[Box] item [Done]" or "[Box] item [Inprogress]".
// Longer than the page, it scrolls and shows a scrollbar.

import { GRAPHITE, fillPoly, sketchPoly, label } from '../sketch.js';

const MONO = 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
const SIZE = 14;
const LINE = 21;

/** One line per item of each top card; `cards` is [{subject, tasks}] in shelf order. */
export function reportLines(cards) {
  const lines = [];
  for (const c of cards) {
    for (const t of c.tasks) lines.push(`[${c.subject}] ${t.text} [${t.done ? 'Done' : 'Inprogress'}]`);
  }
  return lines;
}

function wrap(ctx, text, maxWidth) {
  const out = [];
  let line = '';
  for (const ch of text) {   // by character: CJK text has no spaces to break on
    if (ctx.measureText(line + ch).width > maxWidth && line) { out.push(line); line = '  ' + ch.trimStart(); }
    else line += ch;
  }
  out.push(line);
  return out;
}

function geometry(w, h) {
  const pw = Math.min(760, w * 0.86);
  const ph = Math.min(640, h * 0.84);
  return { pw, ph, rows: Math.max(3, Math.floor((ph - 110) / LINE)) };
}

/** How many wrapped rows fit; the scene clamps its scroll with this. */
export function reportRows(h, w = 1200) { return geometry(w, h).rows; }

/**
 * Wrap the report for this width. Returns the visual rows, so the scene can
 * clamp its scroll to rows.length - reportRows(...).
 */
export function wrapReport(ctx, lines, w) {
  const { pw } = geometry(w, 900);
  ctx.save();
  ctx.font = `${SIZE}px ${MONO}`;
  const rows = lines.flatMap((l) => wrap(ctx, l, pw - 90));
  ctx.restore();
  return rows;
}

export function drawReport(ctx, w, h, title, rows, scroll) {
  const { pw, ph, rows: perPage } = geometry(w, h);
  const cx = w / 2, cy = h / 2;

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = GRAPHITE;
  ctx.fillRect(cx - pw / 2 + 12, cy - ph / 2 + 16, pw, ph);
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  const corners = [[-pw / 2, -ph / 2], [pw / 2, -ph / 2], [pw / 2, ph / 2], [-pw / 2, ph / 2]];
  fillPoly(ctx, corners, '#fffdf6');
  sketchPoly(ctx, corners, 6100, { alpha: 0.8, width: 1.3 });

  const left = -pw / 2 + 30;
  label(ctx, title, left, -ph / 2 + 34, 20, { align: 'left', weight: 'bold' });
  label(ctx, '↑ ↓  scroll     E / ESC  close', pw / 2 - 30, -ph / 2 + 34, 12, { align: 'right', alpha: 0.5 });

  const top = -ph / 2 + 70;
  const max = Math.max(0, rows.length - perPage);
  const from = Math.max(0, Math.min(scroll, max));
  if (!rows.length) {
    label(ctx, 'no cards on this shelf yet', left, top + LINE, SIZE, { align: 'left', alpha: 0.6, font: MONO });
  }
  rows.slice(from, from + perPage).forEach((text, i) => {
    label(ctx, text, left, top + i * LINE + LINE / 2, SIZE,
      { align: 'left', alpha: 0.88, font: MONO });
  });

  // The scrollbar, only when the text overflows the page.
  if (max > 0) {
    const tx = pw / 2 - 16, ty = top, th = perPage * LINE;
    ctx.fillStyle = GRAPHITE;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(tx - 3, ty, 6, th);
    const thumb = Math.max(24, th * perPage / rows.length);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(tx - 3, ty + (th - thumb) * (from / max), 6, thumb);
  }
  ctx.restore();
}
