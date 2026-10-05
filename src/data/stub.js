// Stage 1 fake data. Implements exactly the data/api.js interface so that the
// wasm+sqlite implementation can replace it without the UI noticing.
// Mutations live in memory only and reset on reload - expected at this stage.

export const LEVELS = 4;   // shelf planks, level 0 is the top one
export const SLOTS = 3;    // boxes per plank; the bottom-right slot is the bin

const ROOM_SEED = [
  {
    code: 'SKILL', name: 'SKILL',
    subjects: [
      { shelf: 1, level: 0, slot: 0, label: 'Calculus', weeks: [
        ['Ch.1 Limits: 1.1-1.4', 'Exercises 1A odd numbers', 'Summary notes'],
        ['Ch.2 Continuity', 'Ch.2 Derivatives intro', 'Exercises 2A'],
        ['Ch.3 Chain rule', 'Implicit differentiation', 'Exercises 3A-3B'],
        ['Ch.4 Applications', 'Related rates problems', 'Mid-term review'],
      ] },
      { shelf: 1, level: 0, slot: 1, label: 'Linear Algebra', weeks: [
        ['Ch.1 Vectors and spans', 'Problem set 1'],
        ['Ch.2 Matrices', 'Gaussian elimination drills'],
        ['Ch.3 Determinants', 'Problem set 3'],
      ] },
      { shelf: 1, level: 1, slot: 0, label: 'Discrete Math', weeks: [
        ['Logic and proofs 1.1-1.3', 'Truth-table exercises'],
        ['Induction', 'Prove 5 identities by induction'],
      ] },
      { shelf: 2, level: 0, slot: 0, label: 'Russian', weeks: [
        ['Cyrillic alphabet: А-К', 'Handwriting drill x3', 'Listen: alphabet song'],
        ['Cyrillic alphabet: Л-Я', 'Read 10 simple words aloud', 'Handwriting drill x3'],
        ['Greetings and introductions', 'Vocabulary: 30 words', 'Record yourself'],
        ['Cases: nominative', 'Vocabulary: 30 words', 'Short dialogue'],
      ] },
      { shelf: 2, level: 0, slot: 1, label: 'English', weeks: [
        ['Phrasal verbs set 1', 'Read one essay', 'Write 200 words'],
        ['Phrasal verbs set 2', 'Shadowing practice 20 min'],
      ] },
      { shelf: 2, level: 1, slot: 0, label: 'Japanese', weeks: [
        ['Hiragana あ-の', 'Writing drill'],
        ['Hiragana は-ん', 'Writing drill'],
      ] },
      { shelf: 3, level: 0, slot: 0, label: 'C Programming', weeks: [
        ['K&R Ch.1', 'Practice #1: echo', 'Practice #2: wc'],
        ['K&R Ch.2 types', 'Practice #3: bit ops', 'Practice #4: atoi'],
        ['K&R Ch.5 pointers', 'Practice #5: own strcpy', 'Practice #6: qsort'],
        ['K&R Ch.6 structs', 'Practice #7: linked list', 'Practice #8: hash table'],
      ] },
      { shelf: 3, level: 0, slot: 1, label: 'SQLite Internals', weeks: [
        ['Read: file format overview', 'Dump a db with hexdump'],
        ['B-tree pages', 'Walk a page by hand'],
      ] },
      { shelf: 3, level: 1, slot: 0, label: 'WebAssembly', weeks: [
        ['wasm text format basics', 'Hand-write a wat module'],
        ['JS <-> wasm memory', 'Pass a string both ways'],
      ] },
    ],
  },
  {
    code: 'INTEREST', name: 'INTEREST',
    subjects: [
      { shelf: 1, level: 0, slot: 0, label: 'Astronomy', weeks: [
        ['Constellations: winter sky', 'One clear-night observation'],
        ['Planetary motion', 'Sketch Jupiter at 3 dates'],
      ] },
      { shelf: 1, level: 1, slot: 0, label: 'Chess', weeks: [
        ['Endgame: K+P vs K', '20 tactics puzzles'],
        ['Openings: Italian game', '20 tactics puzzles'],
      ] },
      { shelf: 2, level: 0, slot: 0, label: 'History of Rome', weeks: [
        ['Founding to Republic', 'Timeline notes'],
        ['Punic wars', 'Map exercise'],
      ] },
    ],
  },
  {
    code: 'IMAGINE', name: 'IMAGINE',
    subjects: [
      { shelf: 1, level: 0, slot: 0, label: 'Sketching', weeks: [
        ['Line confidence drills', 'Draw 20 boxes in perspective'],
        ['One-point perspective', 'Draw a corridor'],
        ['Two-point perspective', 'Draw a castle gate'],
      ] },
      { shelf: 2, level: 0, slot: 0, label: 'Short Stories', weeks: [
        ['Read 2 stories', 'Write 500 words'],
        ['Read 2 stories', 'Revise last week’s draft'],
      ] },
    ],
  },
  {
    code: 'APPETENCE', name: 'APPETENCE',
    subjects: [
      { shelf: 1, level: 0, slot: 0, label: 'Running', weeks: [
        ['3 x 5km easy', 'Stretch daily'],
        ['2 x 5km + 1 x 8km', 'Stretch daily'],
      ] },
      { shelf: 2, level: 0, slot: 0, label: 'Cooking', weeks: [
        ['Knife skills', 'Cook 3 new dishes'],
        ['Stocks and sauces', 'Cook 3 new dishes'],
      ] },
    ],
  },
  {
    code: 'WORKSHOP', name: 'WORKSHOP',
    subjects: [
      { shelf: 1, level: 0, slot: 0, label: 'Castle App', weeks: [
        ['Stage 1: sketch renderer', 'Approach + hall + room'],
        ['Stage 2: wasm + sqlite', 'IndexedDB snapshots', 'Export / import'],
        ['Stage 3: timeline ledger', 'Session tracking'],
      ] },
      { shelf: 1, level: 0, slot: 1, label: 'Keyboard Build', weeks: [
        ['Choose switches and plate', 'Order parts'],
        ['Solder and flash', 'Write keymap'],
      ] },
      { shelf: 2, level: 0, slot: 0, label: 'Home Server', weeks: [
        ['Backup strategy', 'Test a restore'],
        ['Monitoring', 'Alert on disk full'],
      ] },
    ],
  },
];

const WALL_OF_SHELF = { 1: 'front', 2: 'front', 3: 'front', 4: 'left', 5: 'left', 6: 'left', 7: 'right', 8: 'right', 9: 'right' };

let db = null;

function build() {
  const rooms = [];
  const boxes = new Map();
  const cards = new Map();
  let boxId = 1, cardId = 1;

  ROOM_SEED.forEach((rs, ri) => {
    const room = { id: ri + 1, code: rs.code, name: rs.name, sort: ri, shelves: [] };
    for (let n = 1; n <= 9; n++) {
      room.shelves.push({
        id: room.id * 100 + n, number: n, wall: WALL_OF_SHELF[n],
        levels: LEVELS, slots: SLOTS, boxes: [],
      });
    }
    for (const s of rs.subjects) {
      const shelf = room.shelves[s.shelf - 1];
      const bx = { id: boxId++, shelfId: shelf.id, roomId: room.id, label: s.label, level: s.level, slot: s.slot, cardIds: [] };
      s.weeks.forEach((tasks, wi) => {
        const card = {
          id: cardId++, boxId: bx.id, seq: wi, weekNo: wi + 1,
          title: `Week ${wi + 1}`,
          tasks: tasks.map((text, i) => ({ idx: i, text, done: 0 })),
          doneAt: null,
        };
        bx.cardIds.push(card.id);
        cards.set(card.id, card);
      });
      boxes.set(bx.id, bx);
      shelf.boxes.push(bx);
    }
    rooms.push(room);
  });

  return { rooms, boxes, cards, sessions: [], nextSessionId: 1 };
}

function anchorOf(cs) {
  const completed = cs.filter((c) => c.doneAt).sort((a, b) => a.doneAt.localeCompare(b.doneAt));
  return completed.length
    ? { firstWeekNo: completed[0].weekNo, firstDoneAt: completed[0].doneAt }
    : { firstWeekNo: null, firstDoneAt: null };
}

function summarize(bx) {
  const cs = bx.cardIds.map((id) => db.cards.get(id));
  const done = cs.filter((c) => c.doneAt).length;
  const active = cs.filter((c) => !c.doneAt).sort((a, b) => a.seq - b.seq)[0];
  return {
    id: bx.id, label: bx.label, level: bx.level, slot: bx.slot,
    cardCount: cs.length, doneCount: done,
    remaining: cs.length - done,
    activeWeekNo: active ? active.weekNo : null,
    ...anchorOf(cs),
  };
}

export const stub = {
  async init() {
    if (!db) db = build();
  },

  async listRooms() {
    return db.rooms.map((r) => ({ id: r.id, code: r.code, name: r.name }));
  },

  async getRoomLayout(roomId) {
    const room = db.rooms.find((r) => r.id === roomId);
    if (!room) return [];
    return room.shelves.map((s) => ({
      id: s.id, number: s.number, wall: s.wall,
      levels: s.levels, slots: s.slots,
      boxes: s.boxes.map(summarize),
    }));
  },

  async getTopCard(boxId) {
    const bx = db.boxes.get(boxId);
    if (!bx) return null;
    const cs = bx.cardIds.map((id) => db.cards.get(id))
      .filter((c) => !c.doneAt)
      .sort((a, b) => a.seq - b.seq);
    if (!cs.length) return null;
    const c = cs[0];
    return {
      id: c.id, boxId: c.boxId, seq: c.seq, weekNo: c.weekNo, title: c.title,
      subject: bx.label,
      tasks: c.tasks.map((t) => ({ idx: t.idx, text: t.text, done: !!t.done })),
      remaining: cs.length,
      ...anchorOf(bx.cardIds.map((id) => db.cards.get(id))),
    };
  },

  async markCardDone(cardId) {
    const c = db.cards.get(cardId);
    if (!c || c.doneAt) return { nextCard: null };
    c.doneAt = new Date().toISOString();
    return { nextCard: await stub.getTopCard(c.boxId) };
  },

  async startSession(boxId, cardId) {
    const session = {
      id: db.nextSessionId++, boxId, cardId: cardId || null,
      startedAt: new Date().toISOString(), endedAt: null,
    };
    db.sessions.push(session);
    return { id: session.id };
  },

  async endSession(sessionId) {
    const session = db.sessions.find((s) => s.id === sessionId && !s.endedAt);
    if (!session) return { closed: false };
    session.endedAt = new Date().toISOString();
    return { closed: true };
  },

  async getLedger(boxId) {
    const bx = db.boxes.get(boxId);
    if (!bx) return null;
    const cards = bx.cardIds.map((id) => db.cards.get(id)).sort((a, b) => a.seq - b.seq);
    const completed = cards.filter((c) => c.doneAt).sort((a, b) => a.doneAt.localeCompare(b.doneAt));
    const mine = db.sessions.filter((s) => s.boxId === boxId);
    const seconds = mine.reduce((total, s) => total
      + (s.endedAt ? (new Date(s.endedAt) - new Date(s.startedAt)) / 1000 : 0), 0);

    return {
      boxId,
      subject: bx.label,
      firstDoneAt: completed.length ? completed[0].doneAt : null,
      firstWeekNo: completed.length ? completed[0].weekNo : 0,
      visits: mine.length,
      unfinishedVisits: mine.filter((s) => !s.endedAt).length,
      seconds: Math.round(seconds),
      weeks: cards.map((c) => ({
        cardId: c.id, seq: c.seq, weekNo: c.weekNo, title: c.title,
        doneAt: c.doneAt, taskCount: c.tasks.length,
      })),
    };
  },

  async getTimeline(boxId) {
    const bx = db.boxes.get(boxId);
    if (!bx) return [];
    return bx.cardIds.map((id) => db.cards.get(id))
      .filter((c) => c.doneAt)
      .map((c) => ({ cardId: c.id, weekNo: c.weekNo, doneAt: c.doneAt }));
  },

  async exportDb() { throw new Error('export arrives with the sqlite backend in Stage 2'); },
  async exportSql() { throw new Error('export arrives with the sqlite backend in Stage 2'); },
  async importDb() { throw new Error('import arrives with the sqlite backend in Stage 2'); },
};
