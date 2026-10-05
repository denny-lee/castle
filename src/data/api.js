// The one data interface the UI is allowed to know about.
//
//   init()
//   listRooms()            -> [{id, code, name}]
//   getRoomLayout(roomId)  -> [{id, number, wall, levels, slots, boxes:[...]}]
//   getTopCard(boxId)      -> {id, weekNo, title, subject, tasks:[{text}]} | null
//   markCardDone(cardId)   -> {nextCard}
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
