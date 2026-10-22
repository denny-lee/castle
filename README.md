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

## Migration: moving to another machine (Windows + WSL2)

The build outputs (`build/`, `src/data/castle.js`, `src/data/castle.wasm`) are
not committed; the new machine rebuilds them.

1. **Move the code.** With a remote: `git remote add origin <url> && git push -u origin dev main`.
   Without one: `git bundle create castle.bundle --all`, copy the file over, then
   `git clone castle.bundle castle -b dev`.
2. **Take your data.** Press `E` for a fresh `.db` and `.sql` export (or keep the
   latest ones from Downloads). The browser's IndexedDB does not travel.
3. **Install WSL2** (PowerShell as admin): `wsl --install -d Ubuntu`, reboot if
   asked, then create your user in the Ubuntu window.
4. **Install the tools** (inside WSL):
   ```sh
   sudo apt update
   sudo apt install -y build-essential git python3 sqlite3 nodejs cmake xz-utils
   node --version    # needs 18+; install via nvm or nodesource if older
   ```
5. **Install Emscripten** (inside WSL):
   ```sh
   git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
   cd ~/emsdk && ./emsdk install latest && ./emsdk activate latest
   ```
   `build.sh` finds `~/emsdk` by itself; `source ~/emsdk/emsdk_env.sh` is only
   needed if you want `emcc` on your PATH.
6. **Clone onto the Linux filesystem** (`~`, not `/mnt/c/...`, which is slow and
   hits line-ending trouble): `git clone <url> ~/workspace/castle && cd ~/workspace/castle && git checkout dev`.
7. **Build and test:** `./build.sh`, then `./test.sh` (should end with every
   check passing). `./build.sh native` is a quick check that needs no emsdk.
8. **Run:** `./serve.sh`, then open `http://localhost:8000` in the Windows
   browser (WSL2 forwards localhost).
9. **Restore your data:** with no shelf held, press `I` and pick your `.db` file.
   If the data is only in a `.sql` dump, build a `.db` first:
   `sqlite3 castle.db < native/ddl.sql && sqlite3 castle.db < dump.sql`.

If `emcc not found` appears, step 5 did not finish (check
`~/emsdk/upstream/emscripten/emcc` exists). A node version error means node is
too old.
