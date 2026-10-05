// The real backend: SQLite compiled to wasm, with the database snapshotted into
// IndexedDB after every mutation.
//
// Implements exactly the interface in api.js, so the UI cannot tell this from
// the Stage 1 stub.
//
// The wasm module factory and the snapshot store are injected rather than
// imported directly. That keeps the 600KB module out of the download when
// running with ?stub, and lets test/backend.mjs drive this exact code against
// the node-targeted build with an in-memory store.

/**
 * @param createModule  () => Promise<EmscriptenModule>
 * @param store         {loadSnapshot(), saveSnapshot(bytes)}
 */
export function makeWasmBackend({ createModule, store }) {
  let mod = null;
  let ready = null;
  let persistError = null;   // surfaced in the HUD, so a storage failure is never silent

  /** Call into C and parse the JSON it hands back. */
  function query(op, a = 0, b = 0, text = null) {
    const ptr = mod.ccall('castle_query', 'number',
      ['string', 'number', 'number', 'string'], [op, a, b, text]);
    if (!ptr) throw new Error(`castle_query(${op}) returned nothing`);
    let json;
    try {
      json = mod.UTF8ToString(ptr);
    } finally {
      mod.ccall('castle_free', null, ['number'], [ptr]);
    }
    const value = JSON.parse(json);
    if (value && value.error) throw new Error(value.error);
    return value;
  }

  function lastError() {
    const ptr = mod.ccall('castle_last_error', 'number', [], []);
    return ptr ? mod.UTF8ToString(ptr) : 'unknown error';
  }

  /** Serialise the database out of wasm memory as a real SQLite file. */
  function serialize() {
    const size = mod.ccall('castle_db_size', 'number', [], []);
    if (size <= 0) throw new Error('could not serialise the database: ' + lastError());
    const ptr = mod._malloc(size);
    if (!ptr) throw new Error(`could not allocate ${size} bytes for the snapshot`);
    try {
      const n = mod.ccall('castle_db_read', 'number', ['number', 'number'], [ptr, size]);
      if (n !== size) throw new Error('the snapshot came back the wrong length');
      // slice() copies; a subarray view would break on the next memory growth.
      return mod.HEAPU8.slice(ptr, ptr + n);
    } finally {
      mod._free(ptr);
    }
  }

  /** Open a database image, or create and seed a fresh one when bytes is empty. */
  function openImage(bytes) {
    if (!bytes || bytes.length === 0) {
      const rc = mod.ccall('castle_init', 'number', ['number', 'number'], [0, 0]);
      if (rc !== 0) throw new Error('could not create the database: ' + lastError());
      return;
    }
    const ptr = mod._malloc(bytes.length);
    if (!ptr) throw new Error(`could not allocate ${bytes.length} bytes for the database`);
    try {
      mod.HEAPU8.set(bytes, ptr);
      const rc = mod.ccall('castle_init', 'number', ['number', 'number'], [ptr, bytes.length]);
      if (rc !== 0) throw new Error('could not open the database: ' + lastError());
    } finally {
      mod._free(ptr);
    }
  }

  /** Write the current state through to the snapshot store. */
  async function persist() {
    try {
      await store.saveSnapshot(serialize());
      persistError = null;
    } catch (err) {
      // Keep going: the session still works, it just will not survive a reload.
      persistError = err;
      console.error('castle: could not save the database', err);
    }
  }

  return {
    async init() {
      if (ready) return ready;
      ready = (async () => {
        mod = await createModule();

        let snapshot = null;
        try {
          snapshot = await store.loadSnapshot();
        } catch (err) {
          console.error('castle: could not read the saved database', err);
        }

        openImage(snapshot);
        if (!snapshot) await persist();   // make a first run durable immediately
        return mod;
      })();
      return ready;
    },

    /** Non-null when the last save failed; the HUD reports it. */
    get storageWarning() {
      return persistError ? `not saving: ${persistError.message}` : null;
    },

    async listRooms() { return query('rooms'); },
    async getRoomLayout(roomId) { return query('layout', roomId); },
    async getTopCard(boxId) { return query('topCard', boxId); },
    async getTimeline(boxId) { return query('timeline', boxId); },
    async getLedger(boxId) { return query('ledger', boxId); },

    async startSession(boxId, cardId) {
      return query('sessionStart', boxId, cardId || 0, new Date().toISOString());
    },

    async endSession(sessionId) {
      const result = query('sessionEnd', sessionId, 0, new Date().toISOString());
      // Visits are worth keeping across a reload, but they are not worth a
      // write each if nothing closed.
      if (result.closed) await persist();
      return result;
    },

    async markCardDone(cardId) {
      const result = query('markDone', cardId, 0, new Date().toISOString());
      await persist();
      return result;
    },

    /** The raw database file - openable in the sqlite3 CLI. */
    async exportDb() { return serialize(); },

    async exportSql() {
      const ptr = mod.ccall('castle_sql_dump', 'number', [], []);
      if (!ptr) throw new Error('could not build the SQL dump');
      try {
        return mod.UTF8ToString(ptr);
      } finally {
        mod.ccall('castle_free', null, ['number'], [ptr]);
      }
    },

    /** Adopt an exported .db file, replacing everything. */
    async importDb(bytes) {
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const magic = new TextDecoder().decode(data.slice(0, 15));
      if (data.length < 512 || magic !== 'SQLite format 3') {
        throw new Error('that does not look like a SQLite database file');
      }
      openImage(data);
      await persist();
    },
  };
}

/** The browser backend: the web wasm build, persisted to IndexedDB. */
export const wasm = makeWasmBackend({
  createModule: async () => (await import('./castle.js')).default(),
  store: {
    loadSnapshot: async () => (await import('./idb.js')).loadSnapshot(),
    saveSnapshot: async (bytes) => (await import('./idb.js')).saveSnapshot(bytes),
  },
});
