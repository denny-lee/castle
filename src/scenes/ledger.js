// The ledger: a sketched page showing when each week of a subject was actually
// finished, and how far that drifted from the pace it started at.
//
// The backend emits raw facts (completion timestamps, visit counts). The pace
// arithmetic lives here, because it rests on an interpretation rather than on
// stored data - see anchorNote() - and because calendar maths is JS's job, not
// C's.

import {
  PAPER, GRAPHITE, fillPoly, sketchPoly, sketchLine, hatch, label,
} from '../sketch.js';
import { dueDateFor, overdueDaysFor, DAY } from '../pace.js';

const ACCENT = '#7a3b2e';
/**
 * Turn a raw ledger into something displayable: due dates, drift in days, the
 * observed pace, and totals.
 */
export function computeLedger(raw) {
  if (!raw) return null;
  const anchor = raw.firstDoneAt ? new Date(raw.firstDoneAt) : null;

  const weeks = raw.weeks.map((w) => {
    const done = !!w.doneAt;
    const plannedAt = dueDateFor(raw.firstDoneAt, raw.firstWeekNo, w.weekNo);
    let driftDays = null;
    if (plannedAt && done) driftDays = Math.round((new Date(w.doneAt) - plannedAt) / DAY);
    return { ...w, done, plannedAt, driftDays };
  });

  const doneWeeks = weeks.filter((w) => w.done);
  const lastDone = doneWeeks.length ? doneWeeks[doneWeeks.length - 1] : null;

  // Observed pace: mean days between consecutive completions.
  let paceDays = null;
  if (doneWeeks.length > 1) {
    const sorted = doneWeeks.slice().sort((a, b) => a.doneAt.localeCompare(b.doneAt));
    const span = new Date(sorted[sorted.length - 1].doneAt) - new Date(sorted[0].doneAt);
    paceDays = span / DAY / (sorted.length - 1);
  }

  return {
    ...raw,
    weeks,
    doneCount: doneWeeks.length,
    remaining: weeks.length - doneWeeks.length,
    lastDoneAt: lastDone ? lastDone.doneAt : null,
    paceDays,
    anchored: !!anchor,
  };
}

function fmtDate(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDuration(seconds) {
  if (!seconds) return 'no time recorded';
  if (seconds < 90) return `${Math.round(seconds)}s`;
  const minutes = seconds / 60;
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function fmtDrift(days) {
  if (days === null) return '';
  if (days === 0) return 'on time';
  return days > 0 ? `${days}d late` : `${-days}d early`;
}

/** How many week rows fit on one page at this height. */
export function rowsPerPage(h) {
  return Math.max(4, Math.floor((Math.min(640, h * 0.78) - 230) / 30));
}

/**
 * Draw the ledger page. `scroll` is the index of the first week row shown.
 */
export function drawLedger(ctx, w, h, led, scroll = 0) {
  const pw = Math.min(680, w * 0.78);
  const ph = Math.min(640, h * 0.84);
  const cx = w / 2;
  const cy = h / 2;

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = GRAPHITE;
  ctx.fillRect(cx - pw / 2 + 12, cy - ph / 2 + 16, pw, ph);
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(0.006);

  const corners = [[-pw / 2, -ph / 2], [pw / 2, -ph / 2], [pw / 2, ph / 2], [-pw / 2, ph / 2]];
  fillPoly(ctx, corners, '#f8f5ea');
  hatch(ctx, corners, 4242, { angle: 1.25, spacing: 19, alpha: 0.04 });
  sketchPoly(ctx, corners, 4243, { alpha: 0.8, width: 1.3 });

  const left = -pw / 2 + 36;
  const right = pw / 2 - 36;
  const inner = right - left;
  let y = -ph / 2 + 48;

  // ---- heading ----
  label(ctx, led.subject || 'unknown subject', left, y, 25, { align: 'left', weight: 'bold' });
  label(ctx, 'LEDGER', right, y, 13, { align: 'right', alpha: 0.4 });
  y += 28;

  const summary = led.doneCount
    ? `${led.doneCount} of ${led.weeks.length} weeks done · ${led.remaining} to go`
    : `${led.weeks.length} weeks, none completed yet`;
  label(ctx, summary, left, y, 14, { align: 'left', alpha: 0.65 });
  y += 20;

  const visits = led.visits
    ? `${led.visits} visit${led.visits === 1 ? '' : 's'} · ${fmtDuration(led.seconds)} with a card out`
    : 'no visits recorded yet';
  label(ctx, visits, left, y, 13, { align: 'left', alpha: 0.5 });
  y += 18;

  if (led.paceDays !== null) {
    label(ctx, `averaging a week every ${led.paceDays.toFixed(1)} days`,
      left, y, 13, { align: 'left', alpha: 0.5 });
  } else if (led.doneCount === 1) {
    label(ctx, 'one week done — no pace to measure yet', left, y, 13, { align: 'left', alpha: 0.5 });
  }
  y += 16;

  sketchLine(ctx, left, y, right, y, 4300, { alpha: 0.6 });
  y += 24;

  // ---- column headings ----
  const colWeek = left;
  const colPlanned = left + inner * 0.17;
  const colDone = left + inner * 0.42;
  const colDrift = left + inner * 0.67;
  label(ctx, 'week', colWeek, y, 11, { align: 'left', alpha: 0.45 });
  label(ctx, 'due', colPlanned, y, 11, { align: 'left', alpha: 0.45 });
  label(ctx, 'finished', colDone, y, 11, { align: 'left', alpha: 0.45 });
  label(ctx, 'drift', colDrift, y, 11, { align: 'left', alpha: 0.45 });
  y += 8;
  sketchLine(ctx, left, y, right, y, 4301, { alpha: 0.3, passes: 1 });
  y += 20;

  // ---- week rows ----
  const perPage = rowsPerPage(h);
  const from = Math.max(0, Math.min(scroll, Math.max(0, led.weeks.length - perPage)));
  const shown = led.weeks.slice(from, from + perPage);

  shown.forEach((week, i) => {
    const rowY = y + i * 30;
    const faint = week.done ? 1 : 0.42;

    // A tick for finished weeks, an empty box for the ones still ahead.
    const bx = colWeek, by = rowY - 6;
    sketchPoly(ctx, [[bx, by], [bx + 12, by], [bx + 12, by + 12], [bx, by + 12]],
      4400 + week.weekNo, { alpha: 0.5 * faint + 0.2, width: 1 });
    if (week.done) {
      sketchLine(ctx, bx + 2, by + 7, bx + 5, by + 10, 4500 + week.weekNo, { alpha: 0.85, width: 1.4 });
      sketchLine(ctx, bx + 5, by + 10, bx + 11, by + 1, 4501 + week.weekNo, { alpha: 0.85, width: 1.4 });
    }

    label(ctx, String(week.weekNo), bx + 20, rowY, 15,
      { align: 'left', alpha: faint, weight: week.done ? '' : '' });
    label(ctx, fmtDate(week.plannedAt), colPlanned, rowY, 13, { align: 'left', alpha: 0.55 * faint });
    label(ctx, week.done ? fmtDate(week.doneAt) : '—', colDone, rowY, 13,
      { align: 'left', alpha: 0.8 * faint });

    if (week.done && week.driftDays !== null) {
      label(ctx, fmtDrift(week.driftDays), colDrift, rowY, 12, {
        align: 'left',
        alpha: 0.75,
        color: week.driftDays > 2 ? ACCENT : GRAPHITE,
      });
      // A small bar either side of a centre tick, so the shape of the drift is
      // visible without reading the numbers.
      const barX = colDrift + inner * 0.2;
      const barMax = right - barX - 4;
      if (barMax > 20) {
        const mid = barX + barMax / 2;
        sketchLine(ctx, mid, rowY - 6, mid, rowY + 6, 4600 + week.weekNo, { alpha: 0.2, passes: 1, width: 0.8 });
        const scale = Math.max(1, Math.min(14, Math.abs(week.driftDays))) / 14;
        const len = (barMax / 2) * scale;
        if (week.driftDays !== 0) {
          const x2 = week.driftDays > 0 ? mid + len : mid - len;
          sketchLine(ctx, mid, rowY, x2, rowY, 4700 + week.weekNo,
            { alpha: 0.6, width: 2.2, color: week.driftDays > 0 ? ACCENT : GRAPHITE });
        }
      }
    }
  });

  y += shown.length * 30 + 6;

  // ---- footer ----
  const footY = ph / 2 - 40;
  sketchLine(ctx, left, footY - 18, right, footY - 18, 4302, { alpha: 0.35 });

  const more = led.weeks.length > perPage
    ? `showing ${from + 1}–${from + shown.length} of ${led.weeks.length}   ↑ ↓ scroll`
    : '';
  label(ctx, more, left, footY, 12, { align: 'left', alpha: 0.5 });
  label(ctx, 'T  close', right, footY, 12, { align: 'right', alpha: 0.5 });

  if (led.anchored) {
    label(ctx, anchorNote(led), cx * 0 + left, footY + 18, 11, { align: 'left', alpha: 0.38 });
  } else {
    label(ctx, 'finish a week to start the clock', left, footY + 18, 11, { align: 'left', alpha: 0.38 });
  }

  ctx.restore();
}

/** Spell out what the drift column is measured against. */
export function anchorNote(led) {
  return `pace measured from week ${led.firstWeekNo}, finished ${fmtDate(led.firstDoneAt)}`;
}

export { fmtDuration, fmtDate, fmtDrift, dueDateFor, overdueDaysFor };
