-- Castle schema. The seed rows are appended to this file by gen-seed.mjs,
-- which reads them out of src/data/stub.js so the two can never drift.

PRAGMA foreign_keys = ON;

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE rooms (
  id   INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL
);

CREATE TABLE shelves (
  id      INTEGER PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  number  INTEGER NOT NULL,
  wall    TEXT NOT NULL CHECK (wall IN ('front', 'left', 'right', 'back')),
  levels  INTEGER NOT NULL,
  slots   INTEGER NOT NULL,
  UNIQUE (room_id, number)
);

-- A box is a subject.
CREATE TABLE boxes (
  id       INTEGER PRIMARY KEY,
  shelf_id INTEGER NOT NULL REFERENCES shelves(id),
  label    TEXT NOT NULL,
  level    INTEGER NOT NULL,
  slot     INTEGER NOT NULL,
  UNIQUE (shelf_id, level, slot)
);

-- One card per week of a subject. The active card is the lowest seq whose
-- done_at is still null; week_no is metadata for the timeline, and does not
-- decide which card is active.
CREATE TABLE cards (
  id         INTEGER PRIMARY KEY,
  box_id     INTEGER NOT NULL REFERENCES boxes(id),
  seq        INTEGER NOT NULL,
  week_no    INTEGER NOT NULL,
  title      TEXT NOT NULL,
  created_at TEXT,
  done_at    TEXT,
  UNIQUE (box_id, seq)
);

CREATE TABLE tasks (
  id      INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id),
  idx     INTEGER NOT NULL,
  text    TEXT NOT NULL,
  done    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (card_id, idx)
);

-- Stage 3: how long was actually spent in a box.
CREATE TABLE sessions (
  id         INTEGER PRIMARY KEY,
  box_id     INTEGER NOT NULL REFERENCES boxes(id),
  card_id    INTEGER REFERENCES cards(id),
  started_at TEXT NOT NULL,
  ended_at   TEXT
);

CREATE INDEX cards_box_seq ON cards(box_id, seq);
CREATE INDEX cards_box_open ON cards(box_id, seq) WHERE done_at IS NULL;
CREATE INDEX tasks_card ON tasks(card_id, idx);
CREATE INDEX boxes_shelf ON boxes(shelf_id);
CREATE INDEX shelves_room ON shelves(room_id);
CREATE INDEX sessions_box ON sessions(box_id, started_at);

INSERT INTO meta (key, value) VALUES ('schema_version', '1');
