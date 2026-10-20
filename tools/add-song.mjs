#!/usr/bin/env node
// Turn an mp3 (plus optional lyrics) into a row for the Club playlist.
//
//   node tools/add-song.mjs track.mp3 --lrc track.lrc --title "Name" --artist "Who"
//
// Writes song-<name>.sql, one INSERT that works on any Castle database. Apply it
// to an exported .db and import that back with I:
//
//   E                                       (in the app: downloads castle.db)
//   sqlite3 castle.db < song-name.sql       (or pass --db castle.db to do this here)
//   I                                       (in the app: import the edited castle.db)
//
// Needs ffmpeg on PATH to decode the audio. Nothing is played in the castle -
// only the spectrum and the lyrics are kept, never the sound.
//
// Options:
//   --lrc FILE      timed lyrics; --lyrics FILE for plain lines spread evenly
//   --title, --artist   default: file name / empty
//   --room CODE     which club room (default CLUB)
//   --fps N         bar frames per second (default 24)
//   --bands N       bars per frame (default 48)
//   --out FILE      where to write the SQL
//   --db FILE       also run the SQL against this database with the sqlite3 CLI

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { analyze } from './spectrum.mjs';
import { songSql } from './songsql.mjs';
import { parseLrc, spreadLyrics } from './lrc.mjs';

const SAMPLE_RATE = 22050;

function parseArgs(argv) {
  const opts = {};
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
    else files.push(argv[i]);
  }
  return { opts, files };
}

function decode(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 'f32le', '-'],
    { maxBuffer: 1 << 30 });
  if (r.error) throw new Error('could not run ffmpeg (is it installed?): ' + r.error.message);
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + r.stderr.toString().trim());
  const b = r.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
}

const { opts, files } = parseArgs(process.argv.slice(2));
if (files.length !== 1) {
  console.error('usage: node tools/add-song.mjs track.mp3 [--lrc file] [--title t] [--artist a] [--db castle.db]');
  process.exit(2);
}
const file = files[0];
const title = opts.title ?? basename(file, extname(file));
const room = opts.room ?? 'CLUB';
const fps = Number(opts.fps ?? 24);
const bands = Number(opts.bands ?? 48);

const samples = decode(file);
const durationMs = Math.round((samples.length / SAMPLE_RATE) * 1000);
const spec = analyze(samples, SAMPLE_RATE, { fps, bands });

let lyrics = [];
if (opts.lrc) lyrics = parseLrc(readFileSync(opts.lrc, 'utf8'));
else if (opts.lyrics) lyrics = spreadLyrics(readFileSync(opts.lyrics, 'utf8'), durationMs);

const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'song';
const out = opts.out ?? `song-${slug}.sql`;
const sql = songSql({ room, title, artist: opts.artist, durationMs, spec, lyrics });
writeFileSync(out, sql);
console.log(`${out}: ${title}, ${(durationMs / 1000).toFixed(1)}s, ${spec.frames} frames x ${bands} bands, `
  + `${lyrics.length} lyric lines, ${(sql.length / 1024).toFixed(0)}KB`);

if (opts.db) {
  const r = spawnSync('sqlite3', [opts.db], { input: sql });
  if (r.status !== 0) { console.error(r.stderr?.toString() || 'sqlite3 failed'); process.exit(1); }
  console.log(`added to ${opts.db}`);
}
