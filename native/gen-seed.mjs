// Builds native/schema.sql = ddl.sql + the seed rows, reading the curriculum
// out of src/data/stub.js so the Stage 1 fake data and the real database can
// never drift apart. Run via build.sh, or by hand:
//
//   node native/gen-seed.mjs
//
// To change the curriculum, edit ROOM_SEED in src/data/stub.js and re-run.

import { readFileSync, writeFileSync } from 'node:fs';
import { stub } from '../src/data/stub.js';

const here = new URL('.', import.meta.url).pathname;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

await stub.init();
const rooms = await stub.listRooms();

const out = [readFileSync(here + 'ddl.sql', 'utf8'), '\n-- ---- seed ----\n', 'BEGIN;\n'];
const counts = { rooms: 0, shelves: 0, boxes: 0, cards: 0, tasks: 0 };
let cardId = 0, taskId = 0;

for (const [i, room] of rooms.entries()) {
  out.push(`INSERT INTO rooms (id, code, name, sort, kind) VALUES (${room.id}, ${q(room.code)}, ${q(room.name)}, ${i}, ${q(room.kind)});\n`);
  counts.rooms++;

  const layout = await stub.getRoomLayout(room.id);
  for (const shelf of layout) {
    out.push('INSERT INTO shelves (id, room_id, number, wall, levels, slots) VALUES '
      + `(${shelf.id}, ${room.id}, ${shelf.number}, ${q(shelf.wall)}, ${shelf.levels}, ${shelf.slots});\n`);
    counts.shelves++;

    for (const box of shelf.boxes) {
      out.push('INSERT INTO boxes (id, shelf_id, label, level, slot) VALUES '
        + `(${box.id}, ${shelf.id}, ${q(box.label)}, ${box.level}, ${box.slot});\n`);
      counts.boxes++;

      // The stub only ever exposes the top card, so walk the stack by
      // completing cards as we read them. This process does nothing else with
      // the stub afterwards, so the mutation is harmless.
      for (const card of await drainBox(box.id)) {
        cardId++;
        out.push('INSERT INTO cards (id, box_id, seq, week_no, title, created_at, done_at) VALUES '
          + `(${cardId}, ${box.id}, ${card.seq}, ${card.weekNo}, ${q(card.title)}, NULL, NULL);\n`);
        counts.cards++;
        for (const task of card.tasks) {
          taskId++;
          out.push('INSERT INTO tasks (id, card_id, idx, text, done) VALUES '
            + `(${taskId}, ${cardId}, ${task.idx}, ${q(task.text)}, 0);\n`);
          counts.tasks++;
        }
      }
    }
  }
}

out.push('COMMIT;\n');
writeFileSync(here + 'schema.sql', out.join(''));
console.log('native/schema.sql written: '
  + Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', '));

/** Read every card of a box in order. */
async function drainBox(id) {
  const seen = [];
  for (let i = 0; i < 200; i++) {
    const card = await stub.getTopCard(id);
    if (!card) break;
    seen.push({ seq: card.seq, weekNo: card.weekNo, title: card.title, tasks: card.tasks });
    await stub.markCardDone(card.id);
  }
  return seen;
}
