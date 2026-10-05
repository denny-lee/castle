#!/bin/sh
# Castle needs a real HTTP server: ES modules (and later the wasm fetch)
# do not work from file:// URLs.
PORT="${1:-8000}"
echo "Castle: http://localhost:$PORT/"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
