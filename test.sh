#!/bin/sh
# Castle's checks. Everything runs in plain node plus the sqlite3 CLI - no
# browser, no package manager, no dependencies.
#
#   geometry.mjs   walls face inward, shelves land where the camera looks,
#                  cards advance in sequence
#   render.mjs     every scene draws a frame through a recording canvas stub,
#                  with no errors, no non-finite coordinates, and a stroke budget
#   spectrum.mjs   the FFT, band mapping and LRC parser, against known signals
#   backend.mjs    the JS<->wasm boundary: marshalling, UTF-8, the serialise
#                  round trip, persistence sequencing  (needs ./build.sh first)
#   export         the exported .db opens in the real sqlite3 CLI, and the .sql
#                  dump replays into a fresh database
set -e
cd "$(dirname "$0")"

echo "== geometry and progression =="
node test/geometry.mjs

echo
echo "== scene rendering =="
node test/render.mjs

echo
echo "== mp3 -> bars, lyrics =="
node test/spectrum.mjs

if [ ! -f build/castle-node.mjs ]; then
  echo
  echo "== backend =="
  echo "skipped: run ./build.sh first to compile the wasm module"
  exit 0
fi

echo
echo "== wasm backend =="
node test/backend.mjs

echo
echo "== export opens in the sqlite3 CLI =="
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "skipped: no sqlite3 on PATH"
  exit 0
fi
sqlite3 build/export-check.db 'PRAGMA integrity_check;' | grep -qx ok \
  && echo "ok   the exported .db passes integrity_check"
sqlite3 build/export-check.db 'PRAGMA foreign_key_check;' | grep -q . \
  && { echo "FAIL foreign key violations in the export"; exit 1; } \
  || echo "ok   no foreign key violations"
rm -f build/restored.db
sqlite3 build/restored.db < native/ddl.sql
sqlite3 build/restored.db < build/export-check.sql
echo "ok   the .sql dump replays into a fresh database:"
sqlite3 build/restored.db \
  "SELECT '     '||(SELECT count(*) FROM rooms)||' rooms, '||(SELECT count(*) FROM boxes)||' boxes, '\
||(SELECT count(*) FROM cards)||' cards, '||(SELECT count(*) FROM tasks)||' tasks, '\
||(SELECT count(*) FROM cards WHERE done_at IS NOT NULL)||' completed';"
