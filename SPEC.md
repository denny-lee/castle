# Castle — specification

A first-person pencil-sketch castle that answers one question: *what am I
supposed to work on for this subject right now?*

Long-running study plans (math, Russian, C, …) are already broken into ordered
weekly task sets. The problem is recall at the moment of sitting down. So: walk
into the castle, enter a room (category), take a box off a shelf (subject), read
the top card (this week's tasks). Mark it done and the card goes into the bin,
exposing next week's card. Completion times accumulate into a timeline.

Runs as a static page in a browser. JS + canvas front end, C + SQLite compiled
to wasm as the backend, persistent storage, exportable to a real `.db` file.

---

## 1. Status

| Stage | What it covers | State |
| --- | --- | --- |
| 0 | Scaffold, canvas, frame loop, scene stack | **done** |
| 1 | Sketch renderer, approach, hall, rooms, shelves, cards, Done flow — on fake data | **done** |
| 2 | C + SQLite → wasm, IndexedDB snapshots, export / import | **done** |
| 3 | Session tracking and the timeline ledger | **done** |
| 4 | Lighting, overdue flags, the filling bin, the key sheet | **done** |
| 5 | The Club: a screen with a spectrum and rolling lyrics, a playlist in the db | **done** |

Progress is durable: SQLite runs in wasm, and the database is snapshotted into
IndexedDB after every completion. Exported `.db` files open in the `sqlite3`
CLI. `T` on any box opens its ledger — when each week was finished, and whether
you have held the pace you set. Overdue boxes are flagged on the shelf, and `H`
puts the whole key map on a sheet of paper.

Stage 4 covered the parts of "polish" that are data-driven or structural. The
purely visual choices — proportions, line weights, the pacing of the opening
walk, how hard the torch should flicker — have never been looked at in a
browser, only verified not to crash or overflow. They will want tuning by eye.

---

## 2. Running it

```sh
./build.sh            # schema -> native self-test -> wasm -> boundary test
./serve.sh            # http://localhost:8000
./test.sh             # every check, in plain node plus the sqlite3 CLI
```

A real HTTP server is required: ES modules and the wasm module do not load over
`file://`.

`./build.sh native` stops after the host-compiled self-test, which needs no
Emscripten — useful when working on the C alone.

Emscripten is found on `PATH`, via `$EMSDK`, or at the usual clone locations. An
emsdk that was installed but never activated has no `.emscripten` config; rather
than writing into your emsdk tree, `build.sh` generates one under `build/`.

Append **`?stub`** to the URL to run against the Stage 1 in-memory fake data
instead of the wasm backend. Useful when working on the renderer, since it skips
the 584KB module entirely.

Build outputs: `src/data/castle.wasm` (584KB) and `castle.js` (17KB of glue).

---

## 3. Controls

| Place | Key | Effect |
| --- | --- | --- |
| Approach | `SPACE` | skip the walk |
| Hall | `← →` | swing between category doors |
| Hall | `↑` | enter the room |
| Room | `← →` | turn 90° (front → left → back → right) |
| Club | `← →` | previous / next song |
| Club | `SPACE` | pause / resume the screen |
| Club | `↑ ↓` / `ESC` | leave the room |
| Room | `1`–`9` | take a shelf; the view turns to its wall |
| Room | `↑ ↓` | leave the room (no shelf held) |
| Room | `↑ ↓` | change shelf level (shelf held) |
| Room | `← →` | change box within the level (shelf held) |
| Room | `ESC` | release the shelf |
| Room | `SPACE` / `ENTER` | take the top card out / put it back |
| Card | `D` | mark done → `Y` / `N` confirmation → card into the bin |
| Room / Card | `T` | open the ledger for the box under the cursor |
| Ledger | `↑ ↓` | scroll the weeks |
| Ledger | `T` / `ESC` | close it |
| anywhere | `E` | export: download both a `.db` and a `.sql` dump |
| anywhere | `I` | import a `.db` file, replacing everything |
| anywhere | `H` / `?` | the key sheet; it swallows every other key while open |

The one genuine conflict in the requirements is that `↑ ↓` both leaves the room
and moves between shelf levels. Resolved by making shelf selection a **mode**:
`ESC` releases the shelf, and the status line always names the current mode.

---

## 4. Architecture

```
index.html
build.sh                 schema -> native self-test -> wasm -> boundary test
serve.sh                 HTTP server (ES modules need one)
test.sh                  every check
src/
  main.js                canvas, frame loop, scene stack, fades, HUD, transfers
  input.js               keys -> semantic actions
  sketch.js              pencil-sketch primitives
  camera.js              perspective projection, painter sort, geometry builders
  cache.js               offscreen cache for the motionless view
  light.js               vignette, torch flicker, daylight - composited, never baked
  pace.js                the due-date rule, shared by the geometry and the ledger
  help.js                the key sheet
  transfer.js            export downloads and the import file picker
  geom/castle.js         exterior: towers, curtain walls, gatehouse, donjon
  geom/room.js           hall ring, room shell, shelves and boxes
  scenes/approach.js     the opening walk to the gate
  scenes/hall.js         the door carousel
  scenes/room.js         walls, shelf selection, card view, Done flow, visits
  geom/club.js           club shell: the screen, speakers, dance floor; screenPoint()
  scenes/club.js         the screen: spectrum bars, rolling lyrics, playlist
  scenes/ledger.js       the pace arithmetic, and the ledger page
  scenes/fade.js         the shared dark transition
  data/api.js            THE data interface; picks a backend
  data/wasm.js           the wasm backend (module + store injected)
  data/idb.js            IndexedDB snapshot store
  data/stub.js           in-memory fake data, and the seed of record
  data/castle.{js,wasm}  generated by build.sh
native/
  castle.c               the C API, plus a native self-test under #ifndef __EMSCRIPTEN__
  ddl.sql                schema, hand-written
  gen-seed.mjs           reads stub.js -> schema.sql
  schema.sql             generated: ddl.sql + seed inserts
  schema_sql.h           generated: schema.sql as a C string
  sqlite3.c, sqlite3.h   vendored amalgamation, 3.51.2
tools/
  add-song.mjs           mp3 (ffmpeg) + lyrics -> the SQL for one playlist row
  spectrum.mjs           FFT, log-spaced bands, dB -> 0..255 bytes
  lrc.mjs                LRC parser, and an even-spread fallback
  songsql.mjs            the INSERT shared by the tool and the tests
test/
  spectrum.mjs           FFT / bands against known tones, LRC cases
  geometry.mjs           walls, shelf placement, card progression
  render.mjs             one frame of every scene through a canvas stub
  backend.mjs            the JS<->wasm boundary, against a node-targeted build
```

**Generated files are not tracked** (see `.gitignore`): `build/`,
`src/data/castle.{js,wasm}`, `native/schema.sql` and `native/schema_sql.h`. The
vendored amalgamation *is* tracked, so a clone needs only node, a C compiler and
emsdk.

### 4.1 Fake 3D

A real perspective projection of flat quad geometry — less code than layered
2.5D tricks, and it looks better. `camera.js` holds a camera, world→camera
transform, near-plane clipping and the projection.

There is no z-buffer. **Occlusion comes from the painter's algorithm:** faces
are sorted back-to-front by centroid depth, and each is *filled with the paper
colour* before its edges are stroked. Nearer faces paint over the edges of
farther ones, which is hidden-line removal for free. This works because every
solid is a separated convex box, prism or cone — nothing interpenetrates, so the
depth sort never has an unresolvable case.

Visibility uses a world-space normal test (`normal · (eye − vertex) > 0`) rather
than screen winding, so it is independent of the screen's handedness. Interior
surfaces (room shell, hall ring) are built with `flipFaces`, which reverses the
winding so their normals point into the space.

Walls use a local frame of `(right, up, into)` where `into = right × up` points
*into* the wall. That keeps the basis right-handed, so geometry built with
outward normals stays outward after placement — which is why shelves occupy
local `z ∈ [−depth, 0]`, growing out of the wall toward the viewer.

### 4.2 The sketch look

`sketchLine` draws each straight edge as two or three overlapping cubic passes,
each with a perpendicular wobble, a slight overshoot at the ends, and small
random variation in width and alpha.

**The jitter is deterministic**, derived from a stable per-edge seed via an
integer hash — never `Math.random()` per frame. This is the single most
important detail in the whole renderer: with per-frame randomness the entire
picture boils with noise whenever the camera sits still. Every geometry builder
therefore takes an `id` which seeds the jitter of its faces and edges.

Palette: paper `#f4f1e8`, graphite `#2b2b2b`, accent `#7a3b2e` for selection,
plus a faint tiled grain overlay.

### 4.3 Frame budget

A still sketch costs thousands of pencil strokes, and the view is motionless
most of the time — you stand in a room and look at a shelf. Two measures keep it
at 60fps, both checked by `test/render.mjs`:

- **Level of detail by projected area.** Faces under ~700px² get one thin pass
  and no hatching; under ~4200px² one pass; hatching only above ~2200px², with
  the line count per face hard-capped so a face covering half the screen widens
  its spacing instead of costing hundreds of strokes.
- **View caching** (`cache.js`). The world renders into an offscreen canvas and
  is blitted until the camera pose or the layout changes. Highlights, the card
  overlay and the HUD draw live on top, so they stay responsive. Only the brief
  turns between walls pay for a full redraw.

Measured: a full room redraw ≈ 3.7k strokes, a still room frame ≈ 0, the
approach ≈ 1.9k every frame (it moves constantly, so it is never cached).

**Light is composited, never baked** (`light.js`). This is forced by the cache:
a flickering torch that modulated face shading would invalidate the cached world
on every single frame and throw the whole budget away. As a full-screen gradient
drawn over the blit it costs one fill and stays live. The flicker is summed
sines, not random, so it is smooth and reproducible. `test/render.mjs` asserts
both that the lighting pass happens and that still frames still cost ~0 strokes.

### 4.4 Scene stack

`main.js` owns the loop and a four-phase transition: `out` (darken) → `loading`
(construct the next scene, possibly awaiting data) → `in` (lighten) → `hold`.
Scenes expose `update(dt)`, `render(ctx, w, h)` and `action(a)`, and talk to the
world only through the `app` object (`api`, `go`, `setStatus`, `setPrompt`).

```
APPROACH --arrival--> HALL <--> ROOM
```

---

## 5. Places

**Approach.** First person down a path to the gate: four corner towers with
conical roofs, crenellated curtain walls, a gatehouse with flanking turrets and
a portcullis, and the donjon rising behind. An 11-second eased walk with a
walking gait (vertical bob, lateral sway) whose amplitude scales with speed, and
a slow upward pitch as the donjon rises overhead. `SPACE` skips it.

**Hall.** Five doors set into a polygonal wall ring, spread 40° apart, each with
a nameplate: `SKILL`, `INTEREST`, `IMAGINE`, `APPETENCE`, `WORKSHOP`. The view
eases to centre the chosen door, which also carries a bracket so the choice is
unambiguous.

**Room.** 16×16, 9 high. Three shelves on each of the front, left and right
walls; the back wall carries the exit door. Shelves are numbered 1–9 — 1–3
front, 4–6 left, 7–9 right — so a number key both selects a shelf and turns the
view to its wall. Each shelf has 4 levels (level 0 is the top plank) and 3 slots
per level, with labelled boxes and a tally of remaining cards. **The bottom-right
slot of every shelf is the bin**, drawn oversized and standing proud of the
carcass. Selecting a shelf outlines it and highlights the first box found
scanning from the top left.

**Card.** A sketched index card, lifted off the shelf with a soft shadow:
subject, week number, the week's tasks with empty checkboxes, and a count of
cards left in the box. Marking it done tosses it into the bin on an arc.

---

## 6. Data

### 6.1 Interface (`data/api.js`)

Everything async and JSON-shaped, identical across the stub and the wasm
implementation:

```
init()
listRooms()             -> [{id, code, name}]
getRoomLayout(roomId)   -> [{id, number, wall, levels, slots, boxes:[
                             {id, label, level, slot, cardCount, doneCount, remaining}]}]
getTopCard(boxId)       -> {id, boxId, seq, weekNo, title, subject,
                            tasks:[{idx, text, done}], remaining} | null
markCardDone(cardId)    -> {nextCard}
getTimeline(boxId)      -> [{cardId, weekNo, doneAt}]
exportDb()  -> Uint8Array
exportSql() -> string
importDb(bytes)
```

Stage 2 swaps the single `export const api` line in `data/api.js`. Nothing above
that line changes.

### 6.2 Progression

Each box holds an ordered stack of cards. **The active card is the lowest `seq`
with `done_at IS NULL`** — strictly sequential. `week_no` rides along as
metadata so Stage 3 can show planned-versus-actual drift; it does not drive
which card is active.

### 6.3 One source of seed data

`src/data/stub.js` holds the curriculum, and `native/gen-seed.mjs` reads it to
generate `native/schema.sql` = `ddl.sql` + seed inserts. The Stage 1 fake data
and the real database therefore cannot drift: **to change the curriculum, edit
`ROOM_SEED` in `stub.js` and re-run `./build.sh`.**

Current seed: 5 rooms, 45 shelves, 19 subject boxes, 47 cards, 108 tasks.

### 6.4 Schema

```sql
rooms(id, code, name, sort)
shelves(id, room_id, number, wall, levels, slots)
boxes(id, shelf_id, label, level, slot)              -- a box is a subject
cards(id, box_id, seq, week_no, title, created_at, done_at)
tasks(id, card_id, idx, text, done)
sessions(id, box_id, card_id, started_at, ended_at)  -- Stage 3
meta(key, value)                                     -- schema_version = 1
```

Rooms, shelves and boxes are seeded and fixed. Creating new ones from inside the
castle is explicitly out of scope for now.

### 6.5 Persistence

SQLite lives in wasm memory, opened as `:memory:`. The whole database
round-trips as bytes through `sqlite3_serialize()` / `sqlite3_deserialize()`,
and is written to **IndexedDB** after every mutation. No OPFS, so no COOP/COEP
headers and no worker.

A failed save does not stop the session — it sets a warning that the HUD prints
in the accent colour, because silently losing durability is worse than an ugly
line of text.

**Export is part of this stage, not a later nicety.** IndexedDB is not immune to
"clear site data", and surviving a cache wipe is the entire reason persistence
matters here. `E` downloads two files:

- `castle-<stamp>.db` — the real SQLite file, openable in the CLI
- `castle-<stamp>.sql` — a row dump, replayable onto a fresh `ddl.sql` database

`I` imports a `.db` back, after checking the `SQLite format 3` magic. The dump
uses `INSERT OR REPLACE` so it can be replayed onto a database that `ddl.sql`
has already seeded with its `schema_version` row.

### 6.6 The C API

```c
int         castle_init(const unsigned char *bytes, int len);  /* len 0 => create and seed */
char       *castle_query(const char *op, int a, int b, const char *text);
char       *castle_sql_dump(void);
int         castle_db_size(void);      /* snapshot, and report its length */
int         castle_db_read(unsigned char *out, int cap);
const char *castle_last_error(void);
void        castle_free(char *p);
```

`castle_query` dispatches on `op` (`rooms`, `layout`, `topCard`, `timeline`,
`markDone`) and returns JSON in a malloc'd buffer the caller must `castle_free`.

**This deviates from the plan**, which specified a `castle_query(json)` taking a
JSON request. Every request turned out to need at most two integers and one
string, so a JSON *decoder* in C would have been pure overhead when the only
caller is our own JS. Responses are still JSON, because those really are
structured. Errors come back as `{"error": "..."}`, which `wasm.js` turns into a
thrown `Error`.

Two details worth knowing:

- Built with `SQLITE_OMIT_AUTOINIT`, so `castle_init` calls
  `sqlite3_initialize()` by hand. Without it, `sqlite3_open` segfaults.
- `emit_layout` collects shelf rows into fixed 64-entry arrays before emitting,
  because it needs the statement machinery for the nested box query. Nine
  shelves per room is well inside that, but a room with more than 64 would be
  silently truncated.

`wasm.js` takes the module factory and the snapshot store as parameters rather
than importing them. That keeps the 584KB module out of the download under
`?stub`, and lets `test/backend.mjs` drive the real code with the node build and
an in-memory store.

## 7. Remaining stages

### Still open

Nothing in the staged plan. What remains is the work that needs eyes on it:

- **Tuning by eye.** Nothing has ever been seen in a browser. Most likely to be
  wrong: the contact shadows under the shelves (hatching only, no fill, and the
  painter sort draws them *over* the shelf base), torch flicker depth, the
  11-second pacing of the opening walk, and line weights at small sizes.
- **Browser-only code paths remain unverified**: `idb.js` persisting across a
  real reload, and the download / file-picker flows in `transfer.js`. Everything
  else is covered by the node suites.
- **Creating rooms, shelves and boxes from inside the castle** is still out of
  scope; the curriculum lives in `stub.js` and is rebuilt with `./build.sh`.
- **Real start dates per subject** would replace the first-completion anchor
  (6.7) with something that could measure lateness from week one. That is a
  schema change and a deliberate design decision, not a tweak.

---

## 8. Known risks

- **Shimmering lines** if sketch jitter ever stops being seeded deterministically.
  The aesthetic depends on it entirely.
- **Painter's algorithm** breaks on interpenetrating geometry. Keep every solid a
  separated convex box, prism or cone.
- **`file://`** will not load the wasm module. Always use `serve.sh`.
- **IndexedDB can be cleared** by the browser or the user. Hence export; it may
  be worth prompting for one periodically.
- **Snapshotting writes the whole database on every completion** and on every
  closed visit. At 80KB that is nothing. If the curriculum ever grew to
  megabytes this would need to become incremental, which is when OPFS would
  start to earn its setup cost.
- **Visit times are a weak signal** (see 6.7). Do not build anything that treats
  them as hours studied.

---

## 7. The Club

A room with `rooms.kind = 'club'` has a playlist instead of shelves. Its front
wall carries a screen: rows of thin bars that rise and fall like an audio
analyser, and the lyrics rolling up above them. **Nothing is played** - the
screen is driven by data stored with each song, stepped along a clock.

**Data.** `songs(room_id, seq, title, artist, duration_ms, fps, bands, bars, lyrics)`.
`bars` is base64 of `frames * bands` bytes (frame-major, 0..255); `lyrics` is
JSON `[{"t": ms, "text": "..."}]`. At 24fps and 48 bands a four-minute song is
about 370KB, so songs are *not* in the seed (`stub.js` / `gen-seed.mjs`): they
are added with `tools/add-song.mjs`. `listSongs(roomId)` returns the playlist
without the bulky columns; `getSong(id)` returns one with `bars` decoded to a
`Uint8Array` and `lyrics` to objects.

**Migration.** Databases saved before the club existed are opened as they were
written, so `castle_init` runs `migrate()`: schema v2 adds `rooms.kind`, the
`songs` table, and the CLUB room. It is idempotent and keyed on
`meta.schema_version`, and covers saved snapshots and imported `.db` files alike.

**Rendering.** The room itself (`geom/club.js`) is static and cached like any
other. The screen contents are live, drawn after the cache blit and the torch
light so the glass stays crisp, at ~65 strokes a frame. `screenPoint(u, v)` maps
a spot on the glass to the world so the content follows the perspective. Bars
use fast attack / slow release smoothing plus falling peak caps, because the data
is only 24fps. Lyrics ease into place during the 450ms before each line's time.

**Adding a song.**

```sh
node tools/add-song.mjs track.mp3 --lrc track.lrc --title "Name" --artist "Who"
# E in the app, then:   sqlite3 castle.db < song-name.sql      then I to import
```

mp3 -> bars is: `ffmpeg` decodes to 22.05kHz mono PCM, a 2048-point Hann-windowed
FFT every 1/24s, bin peaks folded into 48 log-spaced bands from 40Hz to 10kHz,
a 3dB/octave tilt (music falls off with frequency, flat bars would leave the
right half idle), then dB mapped from -60..0 onto 0..255. Lyrics come from an LRC
file (`--lrc`) or, without timings, plain lines spread evenly (`--lyrics`).
Alternatives considered and set aside: librosa (a second language), Web Audio in
the browser (harder to test), and an envelope-only fake spectrum (not a real one).

Not yet seen in a browser: the screen proportions, bar thickness, lyric sizes and
the tilt/floor constants in `tools/spectrum.mjs` will want tuning by eye.
