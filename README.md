# Castle

A first-person pencil-sketch castle that remembers what you are supposed to
study next.

Walk up to the gate, step into the hall, pick a room (category), take a box off
a shelf (subject), and read the top card — this week's tasks. Press `D` to mark
it done; the card goes in the bin and next week's card comes to the top.

```sh
./build.sh      # schema -> native self-test -> wasm -> boundary test
./serve.sh      # http://localhost:8000
./test.sh       # every check (node + the sqlite3 CLI, no package manager)
```

JS + canvas front end; C + SQLite compiled to wasm as the backend, with the
database snapshotted into IndexedDB and exportable as a real `.db` file. See
[SPEC.md](SPEC.md) for the design, the controls, and the staged plan.

The **CLUB** door leads to a different kind of room: a screen of bouncing spectrum
bars with the lyrics rolling up, fed from a playlist in the database (no sound).
Add songs with `node tools/add-song.mjs track.mp3 --lrc track.lrc` — see
[SPEC.md](SPEC.md) §7.

Press `T` on a box for its ledger: when each week was actually finished, and
whether you have held the pace you set in week one.

Overdue boxes are flagged on the shelf. `H` shows the key map. `E` exports a
`.db` plus a `.sql` dump and `I` imports one back — worth doing now and then,
because clearing site data would take IndexedDB with it.

**All four stages are built.** What is left is tuning by eye: none of this has
been seen in a browser yet, only verified not to crash, overflow or blow the
frame budget. See the "Still open" section of [SPEC.md](SPEC.md).

Needs node, a C compiler, and [emsdk](https://emscripten.org) for the wasm
build. `./build.sh native` skips Emscripten and just runs the C self-test.
