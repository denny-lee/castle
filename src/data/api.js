// The one data interface the UI is allowed to know about.
//
//   init()
//   listRooms()            -> [{id, code, name, kind: 'library' | 'club'}]
//   getRoomLayout(roomId)  -> [{id, number, wall, levels, slots, boxes:[...]}]
//   listSongs(roomId)      -> [{id, seq, title, artist, durationMs}]       (club rooms)
//   getSong(songId)        -> {id, seq, title, artist, durationMs, fps, bands,
//                              bars: Uint8Array(frames*bands), lyrics:[{t, text}]} | null
//   getTopCard(boxId)      -> {id, weekNo, title, subject, tasks:[{text}]} | null
//   addBox(shelfId, label) -> {boxId, level, slot}           (first free slot; never the bin)
//   addCard(boxId, text)   -> {cardId, weekNo, taskCount}   (one task per non-blank line)
//   moveBox(boxId, number) -> {boxId, level, slot}         (to shelf `number` of the same room)
//   renameBox(boxId, label) -> {label}
//   setPriority(boxId, p)  -> {priority}   (1 important+urgent, 2 important, 3 urgent, 4 neither)
//   toggleTask(cardId, idx) -> {done}                      (flip one item's checkbox)
//   markCardDone(cardId)   -> {nextCard}
//   getBin(shelfId)        -> [{id, boxId, seq, weekNo, title, subject, doneAt, tasks}]  (newest first;
//                              subject is the box the card came from)
//   restoreCard(cardId)    -> {boxId, label}                (back to its original box, as its top card)
//   getTimeline(boxId)     -> [{cardId, weekNo, doneAt}]
//   getLedger(boxId)       -> {subject, firstDoneAt, firstWeekNo, visits, seconds,
//                              weeks:[{cardId, seq, weekNo, title, doneAt, taskCount}]}
//   startSession(boxId, cardId) -> {id}
//   endSession(sessionId)       -> {closed}
//   exportDb() / exportSql() / importDb(bytes)
//
// Backed by C + SQLite in wasm, persisted to IndexedDB. Append ?stub to the URL
// to run against the in-memory fake data instead, which is useful when working
// on the renderer without rebuilding the wasm.

import { wasm } from './wasm.js';
import { stub } from './stub.js';

const useStub = typeof location !== 'undefined'
  && new URLSearchParams(location.search).has('stub');

export const api = useStub ? stub : wasm;
export const backendName = useStub ? 'stub' : 'sqlite/wasm';
export default api;
