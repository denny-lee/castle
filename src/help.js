// The key map, on a sheet of paper. Reachable from anywhere with H or ?.

import { GRAPHITE, fillPoly, sketchPoly, sketchLine, hatch, label } from './sketch.js';

const ROWS = [
  ['', 'OUTSIDE'],
  ['SPACE', 'skip the walk to the gate'],
  ['', ''],
  ['', 'THE HALL'],
  ['← →', 'look from door to door'],
  ['↑', 'enter the room'],
  ['', ''],
  ['', 'A ROOM'],
  ['← →', 'turn to the next wall'],
  ['1 – 9', 'take a shelf (the view turns to it)'],
  ['↑ ↓', 'leave the room'],
  ['', ''],
  ['', 'THE CLUB'],
  ['N  P', 'next / previous song'],
  ['← →', 'turn to the next wall (the star is on the left)'],
  ['SPACE', 'pause the screen'],
  ['↑ ↓', 'leave the room'],
  ['', ''],
  ['', 'HOLDING A SHELF'],
  ['← →', 'move along the boxes'],
  ['↑ ↓', 'move between levels'],
  ['SPACE', 'take out the top card'],
  ['B', 'new box: type a name, Enter'],
  ['I', 'add a card: type items, Ctrl+Enter'],
  ['R', 'rename the box'],
  ['M', 'move the box to another shelf: type its number'],
  ['U', 'cycle the box: important / urgent'],
  ['T', 'open the ledger for this box'],
  ['E', 'report: the top-card items of every box here'],
  ['ESC', 'let go of the shelf'],
  ['', ''],
  ['', 'A CARD IN HAND'],
  ['SPACE', 'put it back'],
  ['↑ ↓', 'select an item'],
  ['C', 'tick / untick the selected item'],
  ['D', 'mark it done, then Y or N'],
  ['', ''],
  ['', 'THE BIN (SPACE on it)'],
  ['← →', 'browse the finished cards'],
  ['R', 'send the card back to its box'],
  ['', ''],
  ['', 'ANYWHERE'],
  ['E', 'export a .db and a .sql dump (no shelf held)'],
  ['I', 'import a .db file (no shelf held)'],
  ['H  ?', 'this sheet'],
];

export function drawHelp(ctx, w, h) {
  const pw = Math.min(520, w * 0.7);
  const ph = Math.min(700, h * 0.9);
  const cx = w / 2;
  const cy = h / 2;

  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#17150f';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.004);

  const corners = [[-pw / 2, -ph / 2], [pw / 2, -ph / 2], [pw / 2, ph / 2], [-pw / 2, ph / 2]];
  fillPoly(ctx, corners, '#f8f5ea');
  hatch(ctx, corners, 1717, { angle: -1.3, spacing: 22, alpha: 0.035 });
  sketchPoly(ctx, corners, 1718, { alpha: 0.85, width: 1.4 });

  const left = -pw / 2 + 34;
  const right = pw / 2 - 30;
  const keyCol = left;
  const descCol = left + Math.min(96, pw * 0.22);

  let y = -ph / 2 + 44;
  label(ctx, 'CASTLE', left, y, 22, { align: 'left', weight: 'bold' });
  label(ctx, 'H  close', right, y, 12, { align: 'right', alpha: 0.45 });
  y += 16;
  sketchLine(ctx, left, y, right, y, 1719, { alpha: 0.55 });
  y += 20;

  // Fit the rows to whatever height is available rather than overflowing. The
  // blank spacer rows take 45% of a step, so the natural height is not simply
  // rows x step - compute it from the same weights the loop uses.
  const room = ph / 2 - 34 - y;
  const weight = ROWS.reduce((n, [key, desc]) => n + (!key && !desc ? 0.45 : 1), 0);
  const step = Math.min(21, room / weight);
  const headingSize = Math.max(7, Math.min(11, step * 0.55));
  const bodySize = Math.max(8, Math.min(14, step * 0.68));

  for (const [key, desc] of ROWS) {
    if (!key && !desc) { y += step * 0.45; continue; }
    if (!key) {
      label(ctx, desc, keyCol, y, headingSize, { align: 'left', alpha: 0.45, weight: 'bold' });
      y += step;
      continue;
    }
    label(ctx, key, keyCol, y, bodySize, { align: 'left', alpha: 0.9 });
    label(ctx, desc, descCol, y, bodySize, { align: 'left', alpha: 0.7 });
    y += step;
  }

  ctx.restore();
}
