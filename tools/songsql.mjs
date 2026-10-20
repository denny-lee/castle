// The one INSERT that puts a song in a club's playlist. Shared by add-song.mjs
// and the tests, so the SQL the tool writes is the SQL that gets checked.

import { toBase64 } from './spectrum.mjs';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** @param spec {frames, bands, fps, data} from analyze();  lyrics [{t, text}] */
export function songSql({ room = 'CLUB', title, artist = null, durationMs, spec, lyrics }) {
  const roomId = `(SELECT id FROM rooms WHERE code = ${q(room)})`;
  return `-- ${title}: ${(durationMs / 1000).toFixed(1)}s, ${spec.frames} frames x ${spec.bands} bands, ${lyrics.length} lyric lines
BEGIN;
INSERT INTO songs (room_id, seq, title, artist, duration_ms, fps, bands, bars, lyrics) VALUES (
  ${roomId},
  (SELECT COALESCE(MAX(seq), -1) + 1 FROM songs WHERE room_id = ${roomId}),
  ${q(title)}, ${artist ? q(artist) : 'NULL'}, ${durationMs}, ${spec.fps}, ${spec.bands},
  ${q(toBase64(spec.data))},
  ${q(JSON.stringify(lyrics))}
);
COMMIT;
`;
}
