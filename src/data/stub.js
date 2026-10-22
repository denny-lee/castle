// Stage 1 fake data. Implements exactly the data/api.js interface so that the
// wasm+sqlite implementation can replace it without the UI noticing.
// Mutations live in memory only and reset on reload - expected at this stage.

export const LEVELS = 4;   // shelf planks, level 0 is the top one
export const SLOTS = 3;    // boxes per plank; the bottom-right slot is the bin

const ROOM_SEED = [
  {
    code: 'SKILL', name: 'SKILL',
    subjects: [
      { shelf: 1, level: 0, slot: 0, label: 'C basic', weeks: [] },
      { shelf: 1, level: 0, slot: 1, label: 'Study Open Src', weeks: [] },
      { shelf: 1, level: 0, slot: 2, label: 'Unix OS', weeks: [] },
      { shelf: 1, level: 1, slot: 0, label: 'AI', weeks: [] },
      { shelf: 1, level: 1, slot: 1, label: 'Math', weeks: [] },
      { shelf: 1, level: 1, slot: 2, label: 'Quant', weeks: [] },
      { shelf: 1, level: 2, slot: 0, label: 'Python', weeks: [] },
      { shelf: 1, level: 2, slot: 1, label: 'Java', weeks: [] },
      { shelf: 2, level: 0, slot: 0, label: 'English', weeks: [] },
      { shelf: 2, level: 0, slot: 1, label: 'Russian', weeks: [] },
      { shelf: 3, level: 0, slot: 0, label: '金刚功', weeks: [] },
      { shelf: 3, level: 0, slot: 1, label: '易筋经', weeks: [] },
      { shelf: 3, level: 0, slot: 2, label: '剑', weeks: [] },
      { shelf: 3, level: 1, slot: 0, label: '紫微斗数', weeks: [] },
    ],
  },
  {
    code: 'INTEREST', name: 'INTEREST',
    subjects: [
      { shelf: 1, level: 0, slot: 0, label: 'Guitar', weeks: [
        ['可惜没如果'],
      ] },
      { shelf: 1, level: 0, slot: 1, label: 'Drawing', weeks: [] },
      { shelf: 1, level: 0, slot: 2, label: 'Writing', weeks: [] },
      { shelf: 1, level: 1, slot: 0, label: 'Swimming', weeks: [] },
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
      { shelf: 1, level: 0, slot: 0, label: 'Porsche', weeks: [] },
      { shelf: 1, level: 0, slot: 1, label: 'Pilot License', weeks: [] },
      { shelf: 1, level: 0, slot: 2, label: 'Deep Diving', weeks: [] },
      { shelf: 1, level: 1, slot: 0, label: 'Mac', weeks: [] },
      { shelf: 1, level: 1, slot: 1, label: '反曲弓', weeks: [] },
      { shelf: 1, level: 1, slot: 2, label: '徕卡', weeks: [] },
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
  // A club has a playlist, not shelves. Songs are not seeded: their bar data
  // is far too big for a C string literal, so they arrive via tools/add-song.mjs.
  { code: 'CLUB', name: 'CLUB', kind: 'club', subjects: [] },
];

const WALL_OF_SHELF = { 1: 'front', 2: 'front', 3: 'front', 4: 'left', 5: 'left', 6: 'left', 7: 'right', 8: 'right', 9: 'right' };

let db = null;

const DEMO = { durationMs: 12000, fps: 24, bands: 32 };

/** Sine-driven bars and a few timed lines, in the same shape wasm.js returns. */
function demoSong() {
  const { durationMs, fps, bands } = DEMO;
  const frames = Math.ceil((durationMs / 1000) * fps);
  const bars = new Uint8Array(frames * bands);
  for (let f = 0; f < frames; f++) {
    for (let b = 0; b < bands; b++) {
      const v = 0.5 + 0.5 * Math.sin(f * 0.21 + b * 0.37) * Math.cos(f * 0.05 - b * 0.11);
      bars[f * bands + b] = Math.round(255 * v * (1 - (b / bands) * 0.5));
    }
  }
  const lyrics = ['Walk up to the gate', 'Step into the hall', 'Pick a room', 'Take a box off the shelf',
    'Read the top card', 'And turn the music up'].map((text, i) => ({ t: 1000 + i * 1800, text }));
  return { durationMs, fps, bands, bars, lyrics };
}

function build() {
  const rooms = [];
  const boxes = new Map();
  const cards = new Map();
  let boxId = 1, cardId = 1;

  ROOM_SEED.forEach((rs, ri) => {
    const room = { id: ri + 1, code: rs.code, name: rs.name, sort: ri, kind: rs.kind || 'library', shelves: [] };
    for (let n = 1; n <= (room.kind === 'club' ? 0 : 9); n++) {
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
    return db.rooms.map((r) => ({ id: r.id, code: r.code, name: r.name, kind: r.kind }));
  },

  // A tiny synthetic song, so ?stub and the tests have something to draw.
  async listSongs(roomId) {
    return db.rooms.some((r) => r.id === roomId && r.kind === 'club')
      ? [{ id: 1, seq: 0, title: 'Demo Tone', artist: 'Castle', durationMs: DEMO.durationMs }]
      : [];
  },

  async getSong(songId) {
    return songId === 1 ? { id: 1, seq: 0, title: 'Demo Tone', artist: 'Castle', ...demoSong() } : null;
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

  async addBox(shelfId, label) {
    const name = String(label || '').trim();
    if (!name) throw new Error('a box needs a name');
    const shelf = db.rooms.flatMap((r) => r.shelves).find((s) => s.id === shelfId);
    if (!shelf) throw new Error('no such shelf');
    for (let level = 0; level < shelf.levels; level++) {
      for (let slot = 0; slot < shelf.slots; slot++) {
        if (level === shelf.levels - 1 && slot === shelf.slots - 1) continue;   // the bin
        if (shelf.boxes.some((b) => b.level === level && b.slot === slot)) continue;
        const roomId = Math.floor(shelf.id / 100);
        const bx = {
          id: Math.max(0, ...db.boxes.keys()) + 1, shelfId: shelf.id, roomId,
          label: name, level, slot, cardIds: [],
        };
        db.boxes.set(bx.id, bx);
        shelf.boxes.push(bx);
        return { boxId: bx.id, level, slot };
      }
    }
    throw new Error('this shelf is full');
  },

  async addCard(boxId, text) {
    const bx = db.boxes.get(boxId);
    if (!bx) throw new Error('no such box');
    const items = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (!items.length) throw new Error('there are no items to add');
    const cs = bx.cardIds.map((id) => db.cards.get(id));
    const weekNo = cs.reduce((m, c) => Math.max(m, c.weekNo), 0) + 1;
    const card = {
      id: Math.max(0, ...db.cards.keys()) + 1, boxId, weekNo, title: `Week ${weekNo}`,
      seq: cs.reduce((m, c) => Math.max(m, c.seq), -1) + 1,
      tasks: items.map((t, i) => ({ idx: i, text: t, done: 0 })),
      doneAt: null,
    };
    db.cards.set(card.id, card);
    bx.cardIds.push(card.id);
    return { cardId: card.id, weekNo, taskCount: items.length };
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
