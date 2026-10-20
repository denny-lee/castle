// Exercises src/data/wasm.js - the real JS<->wasm boundary - against the
// node-targeted build produced by build.sh, with an in-memory snapshot store
// standing in for IndexedDB.
//
// The native self-test in castle.c covers the C logic on the host compiler.
// What this adds is everything between: ccall marshalling, UTF-8 strings, the
// serialise round trip through the wasm heap, and the persistence sequencing.

import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { makeWasmBackend } from '../src/data/wasm.js';
import { analyze } from '../tools/spectrum.mjs';
import { songSql } from '../tools/songsql.mjs';

const MODULE = new URL('../build/castle-node.mjs', import.meta.url);
if (!existsSync(MODULE)) {
  console.error('build/castle-node.mjs is missing - run ./build.sh first');
  process.exit(1);
}

let fail = 0;
const ok = (cond, msg) => {
  console.log((cond ? 'ok   ' : 'FAIL ') + msg);
  if (!cond) fail++;
};

// An in-memory stand-in for IndexedDB, which also lets us watch the writes.
const saved = { bytes: null, writes: 0 };
const store = {
  async loadSnapshot() { return saved.bytes; },
  async saveSnapshot(bytes) { saved.bytes = new Uint8Array(bytes); saved.writes++; },
};

const createModule = async () => (await import(MODULE.href)).default();
const api = makeWasmBackend({ createModule, store });

await api.init();
ok(true, 'the wasm module loads and opens a seeded database');
ok(saved.writes === 1, 'a first run is snapshotted immediately');
ok(api.storageWarning === null, 'no storage warning on a healthy run');

const rooms = await api.listRooms();
ok(rooms.length === 6 && rooms.map((r) => r.code).join(" ") === "SKILL INTEREST IMAGINE APPETENCE WORKSHOP CLUB",
  'rooms come back in order: ' + rooms.map((r) => r.code).join(' '));

const layout = await api.getRoomLayout(1);
ok(layout.length === 9, `SKILL has ${layout.length} shelves`);
ok(layout.filter((s) => s.wall === 'front').length === 3
  && layout.filter((s) => s.wall === 'left').length === 3
  && layout.filter((s) => s.wall === 'right').length === 3,
  '3 shelves on each of front/left/right');
ok(layout.every((s) => s.levels === 4 && s.slots === 3), 'every shelf reports 4 levels and 3 slots');

const allBoxes = layout.flatMap((s) => s.boxes);
ok(allBoxes.length === 9, `SKILL holds ${allBoxes.length} subject boxes`);
const calculus = allBoxes.find((b) => b.label === 'Calculus');
ok(calculus && calculus.cardCount === 4 && calculus.remaining === 4,
  'Calculus has 4 cards, none done');

// UTF-8 has to survive C, the wasm heap and JSON.parse intact.
const russianBox = (await api.getRoomLayout(1)).flatMap((s) => s.boxes).find((b) => b.label === 'Russian');
const ru = await api.getTopCard(russianBox.id);
ok(ru.tasks.some((t) => t.text.includes('А-К')), 'Cyrillic in task text survives the round trip');
const jp = await api.getTopCard(allBoxes.find((b) => b.label === 'Japanese').id);
ok(jp.tasks.some((t) => t.text.includes('あ-の')), 'Japanese in task text survives too');

const card = await api.getTopCard(calculus.id);
ok(card.weekNo === 1 && card.subject === 'Calculus' && card.remaining === 4,
  `top card is week 1 of Calculus, "${card.tasks[0].text}"`);
ok(card.tasks.length === 3 && card.tasks.every((t) => t.done === false),
  'its 3 tasks all come back unticked');

const before = saved.writes;
const { nextCard } = await api.markCardDone(card.id);
ok(nextCard && nextCard.weekNo === 2, 'marking it done reveals week 2');
ok(saved.writes === before + 1, 'the completion was snapshotted');

let threw = null;
try { await api.markCardDone(card.id); } catch (e) { threw = e; }
ok(threw && /already done|no such card/.test(threw.message),
  'completing the same card twice is rejected: ' + (threw && threw.message));

const timeline = await api.getTimeline(calculus.id);
ok(timeline.length === 1 && timeline[0].weekNo === 1 && /^\d{4}-\d{2}-\d{2}T/.test(timeline[0].doneAt),
  `the timeline records week 1 at ${timeline[0] && timeline[0].doneAt}`);

const refreshed = (await api.getRoomLayout(1)).flatMap((s) => s.boxes).find((b) => b.id === calculus.id);
ok(refreshed.doneCount === 1 && refreshed.remaining === 3, 'the layout reflects the completion');

// ---- the pace anchor rides along, for overdue flagging ---------------------
const paced = (await api.getRoomLayout(1)).flatMap((s) => s.boxes).find((b) => b.id === calculus.id);
ok(paced.activeWeekNo === 2 && paced.firstWeekNo === 1 && typeof paced.firstDoneAt === 'string',
  'a worked box carries its active week and pace anchor');
const untouchedBox = (await api.getRoomLayout(1)).flatMap((s) => s.boxes)
  .find((b) => b.label === 'Discrete Math');
ok(untouchedBox.activeWeekNo === 1 && untouchedBox.firstDoneAt === null,
  'an untouched box reports week 1 waiting and no anchor');

const { overdueDaysFor } = await import('../src/pace.js');
ok(overdueDaysFor(untouchedBox, Date.now() + 365 * 86400000) === 0,
  'a box with nothing finished is never overdue, however long it sits');
ok(overdueDaysFor(paced, Date.parse(paced.firstDoneAt) + 30 * 86400000) === 23,
  'a worked box goes overdue 7 days after its anchor');

const pacedCard = await api.getTopCard(calculus.id);
ok(pacedCard.firstWeekNo === 1 && typeof pacedCard.firstDoneAt === 'string',
  'the card carries the anchor so it can stamp itself late');

// ---- sessions and the ledger ----------------------------------------------
const { id: visit } = await api.startSession(calculus.id, card.id);
ok(typeof visit === 'number' && visit > 0, `startSession returns a session id (${visit})`);
const closed = await api.endSession(visit);
ok(closed.closed === true, 'endSession closes it');
ok((await api.endSession(visit)).closed === false,
  'closing it twice reports false rather than throwing');

const { id: abandoned } = await api.startSession(calculus.id, null);
ok(abandoned > visit, 'a visit can be opened without a card');

const raw = await api.getLedger(calculus.id);
ok(raw.subject === 'Calculus', 'the ledger names its subject');
ok(raw.weeks.length === 4 && raw.weeks[0].taskCount === 3,
  'the ledger lists all 4 weeks with task counts');
ok(raw.visits === 2 && raw.unfinishedVisits === 1,
  'both visits are counted, one still open');
ok(raw.firstWeekNo === 1 && typeof raw.firstDoneAt === 'string',
  'the ledger anchors on the first completed week');

const { computeLedger } = await import('../src/scenes/ledger.js');
const led = computeLedger(raw);
ok(led.doneCount === 1 && led.remaining === 3, 'computeLedger totals the weeks');
ok(led.weeks[0].driftDays === 0, 'the anchor week has zero drift by construction');
ok(led.weeks[1].plannedAt instanceof Date
  && Math.round((led.weeks[1].plannedAt - new Date(raw.firstDoneAt)) / 86400000) === 7,
  'week 2 is planned exactly one week after the anchor');
ok(led.weeks[3].done === false && led.weeks[3].driftDays === null,
  'an unfinished week has a due date but no drift');
ok(led.paceDays === null, 'one completion is not enough to measure a pace');
ok(computeLedger(await api.getLedger(allBoxes.find((b) => b.label === 'Discrete Math').id)).anchored === false,
  'an untouched box reports no anchor');

// ---- the club ---------------------------------------------------------------
{
  const club = rooms.find((r) => r.code === 'CLUB');
  ok(club && club.kind === 'club' && rooms.filter((r) => r.kind === 'library').length === 5,
    'CLUB is a club; the other five rooms are libraries');
  ok((await api.listSongs(club.id)).length === 0, 'the club starts with an empty playlist');
  ok((await api.getSong(1)) === null, 'asking for a song that is not there gives null');
}

// ---- export ----------------------------------------------------------------
const bytes = await api.exportDb();
ok(bytes instanceof Uint8Array && bytes.length > 4096, `exportDb gives ${bytes.length} bytes`);
ok(new TextDecoder().decode(bytes.slice(0, 15)) === 'SQLite format 3',
  'the export carries the SQLite file header');

const sql = await api.exportSql();
ok(sql.includes('INSERT OR REPLACE INTO rooms') && sql.includes('INSERT OR REPLACE INTO cards'),
  'exportSql dumps the rows');
ok(sql.includes('А-К'), 'the SQL dump keeps non-ASCII text intact');

// Leave the .db where the build can hand it to the sqlite3 CLI for checking.
const dbPath = new URL('../build/export-check.db', import.meta.url);
writeFileSync(dbPath, bytes);
writeFileSync(new URL('../build/export-check.sql', import.meta.url), sql);
console.log(`     (wrote build/export-check.db and .sql for the CLI check)`);

// ---- reopen and import -----------------------------------------------------
const second = makeWasmBackend({ createModule, store });
await second.init();
const reopened = await second.getTopCard(calculus.id);
ok(reopened.weekNo === 2, 'a fresh backend loads the snapshot and sees week 2');

// A pristine database, imported over the top, must replace everything.
const fresh = makeWasmBackend({
  createModule,
  store: { async loadSnapshot() { return null; }, async saveSnapshot() {} },
});
await fresh.init();
const pristine = await fresh.exportDb();

await second.importDb(pristine);
ok((await second.getTopCard(calculus.id)).weekNo === 1,
  'importing a pristine database resets the progress');

let importThrew = null;
try { await second.importDb(new Uint8Array(1024)); } catch (e) { importThrew = e; }
ok(importThrew && /does not look like a SQLite/.test(importThrew.message),
  'importing a non-database is refused');

// A song, end to end: the SQL tools/add-song.mjs writes, applied with the
// sqlite3 CLI to an exported database, then imported back and read through the
// same API the club scene uses.
if (spawnSync('sqlite3', ['-version']).status === 0) {
  const SR = 22050;
  const tone = Float32Array.from({ length: SR * 2 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / SR));
  const spec = analyze(tone, SR, { fps: 24, bands: 16 });
  const lyrics = [{ t: 500, text: 'Привет, “world”' }, { t: 1500, text: "it's a line" }];
  const sql = songSql({ title: "Night 'Owl'", artist: 'Тест', durationMs: 2000, spec, lyrics });
  const withSong = new URL('../build/song-check.db', import.meta.url);
  writeFileSync(withSong, await second.exportDb());
  const run = spawnSync('sqlite3', [withSong.pathname], { input: sql });
  ok(run.status === 0, 'the SQL from add-song applies to an exported database ' + (run.stderr || ''));

  await second.importDb(new Uint8Array(readFileSync(withSong)));
  const club = (await second.listRooms()).find((r) => r.code === 'CLUB');
  const list = await second.listSongs(club.id);
  ok(list.length === 1 && list[0].title === "Night 'Owl'" && list[0].artist === 'Тест' && list[0].durationMs === 2000,
    'the playlist lists the song, quotes and Cyrillic intact');
  ok(!('bars' in list[0]), 'and leaves the bulky bars out of the list');
  const song = await second.getSong(list[0].id);
  ok(song.bars instanceof Uint8Array && song.bars.length === spec.frames * 16
    && song.bars.every((v, i) => v === spec.data[i]), 'the bars come back byte for byte');
  ok(song.fps === 24 && song.bands === 16 && song.lyrics.length === 2 && song.lyrics[0].text === 'Привет, “world”'
    && song.lyrics[1].t === 1500, 'fps, bands and lyrics come back decoded');
  ok((await second.exportSql()).includes('INSERT OR REPLACE INTO songs'), 'the .sql dump includes songs');
} else {
  console.log('skip  song round trip: no sqlite3 on PATH');
}

// A storage failure must be reported, not swallowed.
const broken = makeWasmBackend({
  createModule,
  store: {
    async loadSnapshot() { return null; },
    async saveSnapshot() { throw new Error('quota exceeded'); },
  },
});
await broken.init();
ok(broken.storageWarning && broken.storageWarning.includes('quota exceeded'),
  'a failing store surfaces a warning: ' + broken.storageWarning);
ok((await broken.listRooms()).length === 6, 'and the session still works regardless');

console.log(fail ? `\n${fail} FAILURES` : '\nall wasm boundary checks passed');
process.exit(fail ? 1 : 0);
